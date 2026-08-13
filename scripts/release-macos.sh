#!/usr/bin/env bash
#
# Build, sign, and package the macOS release.
#
# WHY THIS EXISTS
#
# Tauri only runs `codesign` over the .app bundle when a signing identity is
# configured. Through v0.1.11 none was set, so the bundle shipped carrying
# nothing but the linker's ad-hoc signature on the Mach-O executable: no
# Contents/_CodeSignature/CodeResources, and an Info.plist not bound to the
# signature. The CodeDirectory still declared that sealed resources must be
# present, so every strict verifier failed with:
#
#     code has no resources but signature indicates they must be present
#
# macOS surfaces that as "the application is damaged and can't be opened."
# It is a STRUCTURAL failure, not a quarantine one — which is why none of the
# usual workarounds helped. `xattr -cr`, right-click > Open, and Gatekeeper
# bypass all address quarantine; the bundle stayed malformed underneath.
#
# The fix is `bundle.macOS.signingIdentity: "-"` in tauri.conf.json, which makes
# the bundler seal the whole bundle before it builds the disk image. This script
# then VERIFIES that it actually happened, because the failure is silent: the
# bundler prints "Finished 2 bundles" either way.
#
# It also renames the disk image volume to include the version, so the install
# window and Finder sidebar say which version is mounted, and successive
# releases stop stacking up as "ToolBox", "ToolBox 1", "ToolBox 2".
#
# WHAT THIS DOES NOT DO
#
# Ad-hoc signing is not notarization. Without an Apple Developer ID, first
# launch still shows "Apple could not verify..." and needs right-click > Open
# once. That is the ordinary unidentified-developer prompt, and unlike
# "damaged", it has a working bypass.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
CONF="$ROOT/src-tauri/tauri.conf.json"

VERSION="$(jq -r '.version' "$CONF")"
PRODUCT="$(jq -r '.productName' "$CONF")"
ARCH="$(uname -m)"

BUNDLE="$ROOT/src-tauri/target/release/bundle"
APP="$BUNDLE/macos/$PRODUCT.app"
VOLNAME="$PRODUCT $VERSION-$ARCH"

# Keep the version consistent across the four places that carry it, so a DMG
# can never claim a version the app disagrees with.
PKG_VERSION="$(jq -r '.version' "$ROOT/package.json")"
CARGO_VERSION="$(awk -F'"' '/^version = /{print $2; exit}' "$ROOT/src-tauri/Cargo.toml")"
if [ "$PKG_VERSION" != "$VERSION" ] || [ "$CARGO_VERSION" != "$VERSION" ]; then
  echo "FAIL: version mismatch — tauri.conf.json=$VERSION package.json=$PKG_VERSION Cargo.toml=$CARGO_VERSION" >&2
  exit 1
fi

echo "==> Building $PRODUCT $VERSION ($ARCH)"
npx tauri build --bundles app,dmg

# --- 1. Verify the .app bundle is properly sealed ----------------------------

echo "==> Verifying bundle signature"
if [ ! -f "$APP/Contents/_CodeSignature/CodeResources" ]; then
  echo "FAIL: _CodeSignature/CodeResources missing — the bundler did not sign." >&2
  echo "      Check bundle.macOS.signingIdentity in tauri.conf.json." >&2
  exit 1
fi
codesign --verify --deep --strict --verbose=2 "$APP"

# `spctl` still rejects an ad-hoc signed app: it is not notarized and we have no
# Developer ID. That rejection is expected — it is the benign
# "unidentified developer" path. What must never come back is the structural
# resources error, which is what produced "damaged".
if spctl -a -t exec "$APP" 2>&1 | grep -q "no resources"; then
  echo "FAIL: bundle still reports the malformed-signature error." >&2
  exit 1
fi
echo "    signature sealed and valid (unnotarized, as expected)"

# --- 2. Give the disk image a versioned volume name --------------------------
#
# Renaming in place rather than repacking, so the volume icon, window geometry
# and icon positions the bundler wrote all survive.

DMG="$(ls "$BUNDLE/dmg/"*_"${VERSION}"_*.dmg)"
WORK="$(mktemp -d)"
MNT="$(mktemp -d)"
cleanup() {
  hdiutil detach "$MNT" -quiet -force 2>/dev/null || true
  rm -rf "$WORK" "$MNT"
}
trap cleanup EXIT

echo "==> Naming volume \"$VOLNAME\""
hdiutil convert "$DMG" -format UDRW -o "$WORK/rw.dmg" -quiet
hdiutil attach "$WORK/rw.dmg" -nobrowse -noverify -mountpoint "$MNT" -quiet
diskutil rename "$MNT" "$VOLNAME" >/dev/null
hdiutil detach "$MNT" -quiet
rm -f "$DMG"
hdiutil convert "$WORK/rw.dmg" -format UDZO -imagekey zlib-level=9 -o "$DMG" -quiet

# --- 3. Rewrite the background alias against the final volume -----------------
#
# Must run AFTER the rename. The .DS_Store background reference is an alias that
# embeds volume identifiers, so renaming the volume invalidates whatever the
# bundler wrote. Finder rewriting it here fixes that and the Apple Silicon APFS
# alias bug in the same pass. Both fail silently — a broken alias renders as a
# plain grey window with a .DS_Store that inspects as perfect.

echo "==> Rewriting background alias via Finder"
"$ROOT/scripts/fix-dmg-background.sh" "$DMG" "$PRODUCT.app" 540 380 140 225 400 225

# --- 4. Verify what actually ships -------------------------------------------

echo "==> Verifying shipped disk image"
hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MNT" -quiet

codesign --verify --deep --strict "$MNT/$PRODUCT.app"

SHIPPED_VER="$(defaults read "$MNT/$PRODUCT.app/Contents/Info.plist" CFBundleShortVersionString)"
if [ "$SHIPPED_VER" != "$VERSION" ]; then
  echo "FAIL: image contains $SHIPPED_VER, expected $VERSION." >&2
  exit 1
fi

SHIPPED_VOL="$(diskutil info "$MNT" | awk -F': +' '/Volume Name/{print $2}')"
if [ "$SHIPPED_VOL" != "$VOLNAME" ]; then
  echo "FAIL: volume is \"$SHIPPED_VOL\", expected \"$VOLNAME\"." >&2
  exit 1
fi

if [ ! -f "$MNT/.background/dmg-background.png" ]; then
  echo "FAIL: background image is missing from the shipped image." >&2
  exit 1
fi
BG_DIM="$(sips -g pixelWidth -g pixelHeight "$MNT/.background/dmg-background.png" \
  2>/dev/null | awk '/pixelWidth|pixelHeight/{printf "%sx", $2}')"
if [ "$BG_DIM" != "540x380x" ]; then
  echo "FAIL: background is ${BG_DIM%x}, expected 540x380 — Finder will pad the window." >&2
  exit 1
fi
if ! file "$MNT/.background/dmg-background.png" | grep -q "PNG image"; then
  echo "FAIL: background is not really a PNG." >&2
  exit 1
fi
echo "    background present, 540x380, real PNG"

# Apple's own pre-distribution checker. The two remaining findings on an
# unnotarized build are expected; a Codesign Error is the regression to catch.
if command -v syspolicy_check >/dev/null 2>&1; then
  if syspolicy_check distribution "$MNT/$PRODUCT.app" 2>&1 | grep -q "Codesign Error"; then
    echo "FAIL: syspolicy_check reports a Codesign Error." >&2
    exit 1
  fi
  echo "    syspolicy_check: no codesign errors"
fi

echo
echo "Release ready:"
echo "  file:    $DMG"
echo "  volume:  $VOLNAME"
echo "  version: $SHIPPED_VER — signature verified"
