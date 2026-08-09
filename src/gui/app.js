import { invoke } from '@tauri-apps/api/core';

let data = { services: [], categories: [] };
let activeCategory = "";
let searchQuery = "";
let editingServiceId = null;

async function refresh() {
  data = await invoke('get_data');
  render();
}

function render() {
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
    if (activeCategory === cat.id) btn.classList.add("active");
    btn.addEventListener("click", () => {
      activeCategory = cat.id;
      render();
    });
    list.appendChild(btn);
  }

  document.querySelectorAll(".cat-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.cat === activeCategory);
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
    img.src = `https://www.google.com/s2/favicons?domain=${new URL(s.url).hostname}&sz=64`;
    img.alt = s.name;
    img.onerror = () => {
      img.src = `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#007aff"/><text x="16" y="22" text-anchor="middle" fill="#fff" font-size="14" font-family="sans-serif">${s.name[0]?.toUpperCase() ?? "?"}</text></svg>`
      )}`;
    };

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
    }

    const edit = document.createElement("button");
    edit.className = "edit-btn";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${s.name}`);
    edit.addEventListener("click", (event) => {
      event.stopPropagation();
      openModal(s);
    });
    card.appendChild(edit);

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
  document.getElementById("modal-title").textContent = service ? "Edit Service" : "Add Service";
  document.getElementById("modal-save").textContent = service ? "Save Changes" : "Save";
  document.getElementById("input-url").value = service?.url ?? "";
  document.getElementById("input-name").value = service?.name ?? "";
  document.getElementById("input-category").value = service?.category ?? "";
  document.getElementById("input-notes").value = service?.notes ?? "";
  document.getElementById("modal").style.display = "flex";
  document.getElementById(service ? "input-notes" : "input-url").focus();
}

function closeModal() {
  document.getElementById("modal").style.display = "none";
  document.getElementById("service-form").reset();
  editingServiceId = null;
}

document.getElementById("add-btn").addEventListener("click", openModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);

document.getElementById("service-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    url: document.getElementById("input-url").value.trim(),
    name: document.getElementById("input-name").value.trim(),
    category: document.getElementById("input-category").value,
    notes: document.getElementById("input-notes").value.trim(),
  };
  const saveButton = document.getElementById("modal-save");
  saveButton.disabled = true;

  try {
    data = editingServiceId
      ? await window.toolbox.editService(editingServiceId, payload)
      : await window.toolbox.addService(payload);
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

refresh();
