import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';

const EDIT_ICON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

const ARCHIVE_ICON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>`;

const RESTORE_ICON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 12 11 15 14"></polyline><line x1="12" y1="11" x2="12" y2="21"></line><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10"></path><polyline points="1 4 1 10 7 10"></polyline></svg>`;

const DELETE_ICON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

let data = { services: [], categories: [] };
let activeCategory = "";
let searchQuery = "";
let editingServiceId = null;
let sortOrder = localStorage.getItem("toolbox_sort_order") || "asc";

function updateSortButtonUI() {
  const btn = document.getElementById("sort-btn");
  if (!btn) return;
  btn.textContent = sortOrder === "asc" ? "A–Z ↑" : "Z–A ↓";
  btn.setAttribute("aria-label", `Sort order: ${sortOrder === "asc" ? "A to Z" : "Z to A"}`);
  btn.title = `Sort order: ${sortOrder === "asc" ? "A to Z (click for Z to A)" : "Z to A (click for A to Z)"}`;
}

async function refresh() {
  data = await invoke('get_data');
  render();
}

function render() {
  updateSortButtonUI();
  renderSidebar();
  renderGrid();
}

function renderSidebar() {
  const all = data.services.filter((s) => s.status === "active").length;
  const archived = data.services.filter((s) => s.status === "archived").length;
  document.getElementById("count-all").textContent = all;
  document.getElementById("count-archived").textContent = archived;

  const list = document.getElementById("category-list");
  list.innerHTML = "";

  for (const cat of data.categories) {
    const count = data.services.filter((s) => s.category === cat.id && s.status === "active").length;
    if (count === 0) continue;
    const btn = document.createElement("button");
    btn.className = "cat-btn";
    btn.dataset.cat = cat.id;
    btn.innerHTML = `${cat.label} <span class="count">${count}</span>`;
    list.appendChild(btn);
  }

  document.querySelectorAll(".cat-btn").forEach((btn) => {
    btn.classList.toggle("active", (btn.dataset.cat ?? "") === activeCategory);
  });
}

function renderGrid() {
  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  grid.innerHTML = "";

  let services = data.services;

  if (activeCategory === "archived") {
    services = services.filter((s) => s.status === "archived");
  } else if (activeCategory) {
    services = services.filter((s) => s.category === activeCategory && s.status === "active");
  } else {
    services = services.filter((s) => s.status === "active");
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    services = services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.url.toLowerCase().includes(q) ||
        (s.notes ?? "").toLowerCase().includes(q)
    );
  }

  services = [...services].sort((a, b) => {
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    return sortOrder === "desc"
      ? nameB.localeCompare(nameA)
      : nameA.localeCompare(nameB);
  });

  if (services.length === 0) {
    empty.style.display = "flex";
    grid.style.display = "none";
    return;
  }
  empty.style.display = "none";
  grid.style.display = "grid";

  for (const s of services) {
    const card = document.createElement("div");
    card.className = `card${s.status === "archived" ? " archived" : ""}`;

    const img = document.createElement("img");
    const initial = (s.name[0] ?? "?").toUpperCase();
    const letterSvg = `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#4f8cff"/><stop offset="100%" stop-color="#0055d4"/></linearGradient></defs><rect width="32" height="32" rx="7" fill="url(#g)"/><text x="16" y="22" text-anchor="middle" fill="#fff" font-size="15" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${initial}</text></svg>`
    )}`;
    // Start on the letter avatar and only replace it once the backend has
    // proven a real icon exists. Pointing an <img> at a favicon service cannot
    // work: Google's S2 answers unknown domains with HTTP 404 and a generic
    // globe, and the browser renders that body, so `onerror` never fires and
    // the globe sticks. Resolution and validation happen in `get_favicon`.
    img.src = letterSvg;
    img.alt = s.name;
    invoke("get_favicon", { url: s.url })
      .then((icon) => {
        if (icon) img.src = icon;
      })
      .catch(() => {});

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = s.name;

    card.appendChild(img);
    card.appendChild(name);

    if (s.notes) {
      const notes = document.createElement("div");
      notes.className = "notes-preview";
      notes.textContent = s.notes;
      card.appendChild(notes);

      card.addEventListener("mouseenter", () => {
        const main = document.querySelector("main");
        if (!main) return;
        const mainRect = main.getBoundingClientRect();

        // Reset default centered positioning to measure natural size
        notes.style.left = "50%";
        notes.style.right = "auto";
        notes.style.transform = "translateX(-50%)";
        notes.style.top = "100%";
        notes.style.bottom = "auto";

        // Temporarily display block to measure rect
        notes.style.display = "block";
        const notesRect = notes.getBoundingClientRect();
        notes.style.display = "";

        // Horizontal boundary check
        if (notesRect.right > mainRect.right - 12) {
          notes.style.left = "auto";
          notes.style.right = "0";
          notes.style.transform = "none";
        } else if (notesRect.left < mainRect.left + 12) {
          notes.style.left = "0";
          notes.style.right = "auto";
          notes.style.transform = "none";
        }

        // Vertical boundary check (flip to top if near bottom)
        if (notesRect.bottom > mainRect.bottom - 12) {
          notes.style.top = "auto";
          notes.style.bottom = "100%";
        }
      });
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const edit = document.createElement("button");
    edit.className = "card-action-btn";
    edit.type = "button";
    edit.innerHTML = EDIT_ICON_SVG;
    edit.title = `Edit ${s.name}`;
    edit.setAttribute("aria-label", `Edit ${s.name}`);
    edit.addEventListener("click", (event) => {
      event.stopPropagation();
      openModal(s);
    });
    actions.appendChild(edit);

    if (s.status === "archived") {
      const restore = document.createElement("button");
      restore.className = "card-action-btn";
      restore.type = "button";
      restore.innerHTML = RESTORE_ICON_SVG;
      restore.title = `Restore ${s.name}`;
      restore.setAttribute("aria-label", `Restore ${s.name}`);
      restore.addEventListener("click", async (event) => {
        event.stopPropagation();
        data = await invoke("archive_service", { id: s.id });
        render();
      });
      actions.appendChild(restore);

      const del = document.createElement("button");
      del.className = "card-action-btn danger";
      del.type = "button";
      del.innerHTML = DELETE_ICON_SVG;
      del.title = `Delete ${s.name}`;
      del.setAttribute("aria-label", `Delete ${s.name}`);
      del.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (confirm(`Permanently delete "${s.name}"?`)) {
          data = await invoke("delete_service", { id: s.id });
          render();
        }
      });
      actions.appendChild(del);
    } else {
      const archive = document.createElement("button");
      archive.className = "card-action-btn";
      archive.type = "button";
      archive.innerHTML = ARCHIVE_ICON_SVG;
      archive.title = `Archive ${s.name}`;
      archive.setAttribute("aria-label", `Archive ${s.name}`);
      archive.addEventListener("click", async (event) => {
        event.stopPropagation();
        data = await invoke("archive_service", { id: s.id });
        render();
      });
      actions.appendChild(archive);
    }

    card.appendChild(actions);

    card.addEventListener("click", async () => {
      if (s.status === "archived") return;
      await invoke('open_service', { id: s.id });
    });

    grid.appendChild(card);
  }
}

function populateCategories() {
  const sel = document.getElementById("input-category");
  sel.innerHTML = '<option value="">— none —</option>';
  for (const c of data.categories) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label;
    sel.appendChild(opt);
  }
}

function openModal(service = null) {
  populateCategories();
  editingServiceId = service?.id ?? null;
  const isEditing = !!service;
  document.getElementById("modal-title").textContent = isEditing ? "Edit Service" : "Add Service";
  document.getElementById("modal-save").textContent = isEditing ? "Save Changes" : "Save";
  document.getElementById("input-url").value = service?.url ?? "";
  document.getElementById("input-name").value = service?.name ?? "";
  document.getElementById("input-category").value = service?.category ?? "";
  document.getElementById("input-status").value = service?.status ?? "active";
  document.getElementById("input-notes").value = service?.notes ?? "";

  const archiveBtn = document.getElementById("modal-archive");
  const deleteBtn = document.getElementById("modal-delete");

  if (isEditing) {
    archiveBtn.style.display = "inline-block";
    archiveBtn.textContent = service.status === "archived" ? "Restore" : "Archive";
    deleteBtn.style.display = "inline-block";
  } else {
    archiveBtn.style.display = "none";
    deleteBtn.style.display = "none";
  }

  document.getElementById("modal").style.display = "flex";
  document.getElementById(isEditing ? "input-notes" : "input-url").focus();
}

function closeModal() {
  document.getElementById("modal").style.display = "none";
  document.getElementById("service-form").reset();
  editingServiceId = null;
}

document.querySelector(".sidebar").addEventListener("click", (e) => {
  const btn = e.target.closest(".cat-btn");
  if (btn) {
    activeCategory = btn.dataset.cat ?? "";
    render();
  }
});

document.getElementById("add-btn").addEventListener("click", () => openModal());
document.getElementById("modal-cancel").addEventListener("click", closeModal);

document.getElementById("modal-archive")?.addEventListener("click", async () => {
  if (!editingServiceId) return;
  const saveButton = document.getElementById("modal-save");
  saveButton.disabled = true;
  try {
    data = await invoke("archive_service", { id: editingServiceId });
    closeModal();
    render();
  } finally {
    saveButton.disabled = false;
  }
});

document.getElementById("modal-delete")?.addEventListener("click", async () => {
  if (!editingServiceId) return;
  const service = data.services.find((s) => s.id === editingServiceId);
  const name = service?.name ?? "this service";
  if (!confirm(`Permanently delete "${name}"?`)) return;

  const saveButton = document.getElementById("modal-save");
  saveButton.disabled = true;
  try {
    data = await invoke("delete_service", { id: editingServiceId });
    closeModal();
    render();
  } finally {
    saveButton.disabled = false;
  }
});

document.getElementById("service-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    url: document.getElementById("input-url").value.trim(),
    name: document.getElementById("input-name").value.trim(),
    category: document.getElementById("input-category").value,
    status: document.getElementById("input-status").value,
    notes: document.getElementById("input-notes").value.trim(),
  };
  const saveButton = document.getElementById("modal-save");
  saveButton.disabled = true;

  try {
    data = editingServiceId
      ? await invoke('edit_service', { id: editingServiceId, payload })
      : await invoke('add_service', { payload });
    closeModal();
    render();
  } finally {
    saveButton.disabled = false;
  }
});

document.getElementById("search").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderGrid();
});

document.getElementById("sort-btn")?.addEventListener("click", () => {
  sortOrder = sortOrder === "asc" ? "desc" : "asc";
  localStorage.setItem("toolbox_sort_order", sortOrder);
  updateSortButtonUI();
  renderGrid();
});

// ── Categories modal ─────────────────────────────────────────────────────────

function renderCategoriesModal() {
  const list = document.getElementById("categories-list");
  list.innerHTML = "";

  for (const cat of data.categories) {
    const count = data.services.filter(
      (s) => s.category === cat.id && s.status === "active"
    ).length;

    const row = document.createElement("div");
    row.className = "category-row";

    const labelEl = document.createElement("span");
    labelEl.className = "category-row-label";
    labelEl.textContent = cat.label;

    const slugEl = document.createElement("span");
    slugEl.className = "category-row-slug";
    slugEl.textContent = count > 0 ? `${count} service${count !== 1 ? "s" : ""}` : "unused";

    const delBtn = document.createElement("button");
    delBtn.className = "category-delete-btn";
    delBtn.type = "button";
    delBtn.innerHTML = "×";
    delBtn.title = `Delete "${cat.label}"`;
    delBtn.setAttribute("aria-label", `Delete category ${cat.label}`);
    delBtn.addEventListener("click", async () => {
      const msg =
        count > 0
          ? `Delete "${cat.label}"? The ${count} service${count !== 1 ? "s" : ""} in this category will become uncategorized.`
          : `Delete category "${cat.label}"?`;
      if (!confirm(msg)) return;
      data = await invoke("delete_category", { id: cat.id });
      renderCategoriesModal();
      render();
    });

    row.appendChild(labelEl);
    row.appendChild(slugEl);
    row.appendChild(delBtn);
    list.appendChild(row);
  }
}

function openCategoriesModal() {
  renderCategoriesModal();
  document.getElementById("new-category-label").value = "";
  document.getElementById("categories-modal").style.display = "flex";
  document.getElementById("new-category-label").focus();
}

function closeCategoriesModal() {
  document.getElementById("categories-modal").style.display = "none";
}

document.getElementById("manage-categories-btn").addEventListener("click", openCategoriesModal);
document.getElementById("categories-modal-close").addEventListener("click", closeCategoriesModal);

document.getElementById("categories-modal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("categories-modal")) closeCategoriesModal();
});

document.getElementById("new-category-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("new-category-label");
  const label = input.value.trim();
  if (!label) return;
  const addBtn = document.getElementById("new-category-add");
  addBtn.disabled = true;
  try {
    data = await invoke("add_category", { label });
    input.value = "";
    renderCategoriesModal();
    render();
    input.focus();
  } catch (err) {
    alert(err);
  } finally {
    addBtn.disabled = false;
  }
});

// ── Export / Import ──────────────────────────────────────────────────────────

const BACKUP_FILTER = [{ name: "ToolBox backup", extensions: ["json"] }];

async function exportData() {
  const date = new Date().toISOString().slice(0, 10);
  const path = await save({
    title: "Export ToolBox data",
    defaultPath: `toolbox-backup-${date}.json`,
    filters: BACKUP_FILTER,
  });
  if (!path) return;
  try {
    await invoke("export_data", { path });
    alert(`Exported ${data.services.length} service${data.services.length === 1 ? "" : "s"} to:\n${path}`);
  } catch (err) {
    alert(err);
  }
}

async function importData() {
  const path = await open({
    title: "Import ToolBox data",
    multiple: false,
    directory: false,
    filters: BACKUP_FILTER,
  });
  if (!path) return;
  if (!confirm("Importing will replace all current services and categories with the file's contents. Continue?")) return;
  const btn = document.getElementById("import-btn");
  btn.disabled = true;
  try {
    data = await invoke("import_data", { path });
    activeCategory = "";
    render();
  } catch (err) {
    alert(err);
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("export-btn").addEventListener("click", exportData);
document.getElementById("import-btn").addEventListener("click", importData);

refresh();
