#!/usr/bin/env python3
"""
Generate the DMG install-window background.

    python3 scripts/dmg-background.py

Writes src-tauri/icons/dmg-background.png at exactly the window size.

DESIGN NOTES

Geometry is fixed by the window and must not drift from tauri.conf.json:
540x380 window, app icon at (140, 225), /Applications at (400, 225), icon size
100. The PNG has to match the window exactly or Finder pads the edges with dead
white space.

That geometry forces three bands:

  field  y 0-150    deep blue, carries the wordmark
  shelf  y 150-312  where the icons and their labels sit
  floor  y 312-380  quiet

The shelf is the load-bearing part. Finder draws icon labels in the *system*
label colour and the artwork cannot override it: near-black in Light Mode, white
in Dark Mode. The same pixels sit behind both, so the shelf has to hold mid
luminance — roughly 0.60-0.75. It is tuned to ~0.64 here rather than higher,
because the app icon is a white rounded square and needs to separate from it.

The gap between the two icons (x 190-350) is the only free space, and a stock DMG
wastes it on a generic chevron. The product is called Forget-Me-Knot and its icon
is a blue ribbon tied in a bow around a finger, so the ribbon runs the full width
of the window and knots in that gap: it passes behind both icons and literally
ties the app to /Applications. The install direction and the brand metaphor are
the same mark, so no arrow is needed.

Palette is sampled from the shipping app icon, not invented.
"""

import base64
import io
import os
import subprocess
import sys

W, H = 540, 380
OUT = "src-tauri/icons/dmg-background.png"
SVG_OUT = "scripts/dmg-background.svg"

# Sampled from src-tauri/icons/icon.png
RIBBON_DARK = "#2f6fb5"
RIBBON_MID = "#3985d0"
RIBBON_LIT = "#5aaae6"
PETAL_LIT = "#5aaae6"
PETAL_MID = "#4f99e2"
FLOWER_EYE = "#ffd60a"

FIELD_TOP = "#0b2748"
FIELD_BOT = "#17457c"
# Desaturated on purpose. A saturated blue band across a blue field reads as a UI
# panel someone forgot to remove; pulling the chroma out lets it read as light.
SHELF = "#9fb6c9"       # L ~= 0.69
SHELF_EDGE = "#7794b0"

# The bow has to sit clearly darker than the shelf or it sinks into it — the
# mid-tone collision the artwork notes warn about.
BOW_MID = "#2b6cb0"
BOW_DARK = "#20548b"
BOW_LIT = "#7cc0f0"

# The shelf has to stay at full strength through the label row (y 278-295) or the
# bottom feather drags luminance under 0.60 and Light Mode labels start to go.
SHELF_TOP, SHELF_H = 150, 182

RIBBON_Y = 225          # icon centre line
BOW_X = 270             # centre of the free gap


def flower(cx, cy, r, petal_a=PETAL_LIT, petal_b=PETAL_MID, eye=FLOWER_EYE):
    """Five-petal forget-me-not, alternating tones for depth."""
    out = []
    for i in range(5):
        ang = -90 + i * 72
        tone = petal_a if i % 2 == 0 else petal_b
        out.append(
            f'<ellipse cx="{cx}" cy="{cy - r * 0.55:.2f}" '
            f'rx="{r * 0.46:.2f}" ry="{r * 0.56:.2f}" fill="{tone}" '
            f'transform="rotate({ang} {cx} {cy})"/>'
        )
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{r * 0.20:.2f}" fill="{eye}"/>')
    return "".join(out)


def _ellipse_path(cx, cy, rx, ry):
    return (
        f"M {cx - rx},{cy} "
        f"A {rx},{ry} 0 1,0 {cx + rx},{cy} "
        f"A {rx},{ry} 0 1,0 {cx - rx},{cy} Z"
    )


def knot(cx, cy):
    """
    The knot the product is named for, tied in the gap between the two icons.

    Earlier passes drew the bow from the app icon. Flat vector cannot carry it at
    this size: filled loops read as a bowtie, ringed loops on a horizontal axis
    read as spectacles, and tilting them turns the pair into butterfly wings. The
    icon gets away with a bow because it is rendered in 3D with real depth.

    A single loop standing in the ribbon is unambiguous at 120px, and it is what
    the name says. The crossing is what sells it as tied rather than as a circle
    resting on a line: the loop is drawn over the ribbon, then a short length of
    ribbon is drawn back over the loop on the right, so the strand passes under on
    one side and over on the other.
    """
    # The loop has to straddle the ribbon, not rest on it. Tangent reads as a
    # ring dropped on a line; overlapping is what makes it read as tied.
    ry_c = cy - 16
    rx, ry = 26, 24
    return "".join([
        # Loop, passing over the ribbon on the left.
        f'<ellipse cx="{cx}" cy="{ry_c}" rx="{rx}" ry="{ry}" fill="none" '
        f'stroke="{BOW_MID}" stroke-width="8.5"/>',
        f'<ellipse cx="{cx}" cy="{ry_c - 1.5}" rx="{rx}" ry="{ry}" fill="none" '
        f'stroke="{BOW_LIT}" stroke-width="2.6" opacity="0.42"/>',
        # Ribbon redrawn over the loop on the right — this is the crossing.
        f'<g mask="url(#crossMask)">'
        f'<rect x="{cx + 2}" y="{cy - 4}" width="78" height="8" fill="url(#ribbonG)"/>'
        f'<rect x="{cx + 2}" y="{cy - 4}" width="78" height="2.2" '
        f'fill="{RIBBON_LIT}" opacity="0.6"/>'
        f'</g>',
        # Contact shadow where the loop dives under, so the crossing has depth.
        f'<ellipse cx="{cx + 26}" cy="{cy + 5}" rx="7" ry="4" fill="{BOW_DARK}" '
        f'opacity="0.28"/>',
    ])


def build_svg():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}"
     viewBox="0 0 {W} {H}">
  <defs>
    <linearGradient id="field" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="{FIELD_TOP}"/>
      <stop offset="100%" stop-color="{FIELD_BOT}"/>
    </linearGradient>

    <!-- Shelf feathered top and bottom so it reads as light, not a UI panel. -->
    <linearGradient id="shelfY" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="{SHELF}" stop-opacity="0"/>
      <stop offset="10%"  stop-color="{SHELF}" stop-opacity="0.42"/>
      <stop offset="22%"  stop-color="{SHELF}" stop-opacity="0.86"/>
      <stop offset="34%"  stop-color="{SHELF}" stop-opacity="1"/>
      <stop offset="81%"  stop-color="{SHELF}" stop-opacity="1"/>
      <stop offset="93%"  stop-color="{SHELF_EDGE}" stop-opacity="0.80"/>
      <stop offset="100%" stop-color="{SHELF_EDGE}" stop-opacity="0"/>
    </linearGradient>

    <!-- Feather the left and right frame edges so it is not a stripe.
         Fully opaque from x=50 to x=490 so both icon boxes sit on solid ground. -->
    <linearGradient id="shelfX" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"    stop-color="#fff" stop-opacity="0"/>
      <stop offset="4%"    stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="9.3%"  stop-color="#fff" stop-opacity="1"/>
      <stop offset="90.7%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="96%"   stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="100%"  stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="shelfMask">
      <rect x="0" y="{SHELF_TOP}" width="{W}" height="{SHELF_H}" fill="url(#shelfX)"/>
    </mask>

    <linearGradient id="ribbonG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="{RIBBON_LIT}"/>
      <stop offset="45%"  stop-color="{RIBBON_MID}"/>
      <stop offset="100%" stop-color="{RIBBON_DARK}"/>
    </linearGradient>

    <!-- The ribbon fades out before the frame edges rather than being cut off. -->
    <linearGradient id="ribbonFade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#fff" stop-opacity="0"/>
      <stop offset="11%"  stop-color="#fff" stop-opacity="1"/>
      <stop offset="89%"  stop-color="#fff" stop-opacity="1"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="crossMask">
      <rect x="0" y="0" width="{W}" height="{H}" fill="black"/>
      <rect x="{BOW_X}" y="0" width="78" height="{H}" fill="white"/>
    </mask>
    <mask id="ribbonMask">
      <rect x="0" y="{RIBBON_Y - 12}" width="{W}" height="24" fill="url(#ribbonFade)"/>
    </mask>
  </defs>

  <rect width="{W}" height="{H}" fill="url(#field)"/>

  <!-- Wordmark. No version number: it would go stale every release. -->
  <g>
    {flower(122, 74, 17)}
    <text x="152" y="70" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
          font-size="27" font-weight="600" fill="#f2f7fd"
          letter-spacing="-0.3">Forget-Me-Knot</text>
    <text x="153" y="93" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
          font-size="12.5" font-weight="500" fill="{RIBBON_LIT}"
          letter-spacing="5.4">TOOLBOX</text>
  </g>

  <g mask="url(#shelfMask)">
    <rect x="0" y="{SHELF_TOP}" width="{W}" height="{SHELF_H}" fill="url(#shelfY)"/>
  </g>

  <!-- Ribbon runs the full width behind both icons and knots in the gap. -->
  <g mask="url(#ribbonMask)">
    <rect x="0" y="{RIBBON_Y - 4}" width="{W}" height="8" fill="url(#ribbonG)"/>
    <rect x="0" y="{RIBBON_Y - 4}" width="{W}" height="2.2" fill="{RIBBON_LIT}"
          opacity="0.6"/>
  </g>
  {knot(BOW_X, RIBBON_Y)}
</svg>
'''


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)

    svg = build_svg()
    with open(SVG_OUT, "w") as f:
        f.write(svg)

    import cairosvg
    cairosvg.svg2png(
        bytestring=svg.encode(), write_to=OUT,
        output_width=W, output_height=H,
    )

    # Stamp 72 dpi so Finder maps 1 image pixel to 1 window point.
    from PIL import Image
    im = Image.open(OUT)
    im.save(OUT, dpi=(72, 72))
    print(f"wrote {OUT} at {im.size[0]}x{im.size[1]}")


if __name__ == "__main__":
    main()
