let toolbox = { services: [], categories: [] };
let activeCategory = "";
let searchQuery = "";

async function fetchData() {
  const res = await fetch("/api/data");
  toolbox = await res.json();
  render();
}

function render() {
  renderCategories();
  renderGrid();
}

function renderCategories() {
  const all = toolbox.services.filter((s) => s.status === "active").length;
  const archived = toolbox.services.filter((s) => s.status === "archived").length;
  document.getElementById("count-all").textContent = all;
  document.getElementById("count-archived").textContent = archived;

  const nav = document.querySelector(".categories");
  nav.innerHTML = "";

  const allBtn = makeCatBtn("All", "");
  allBtn.classList.toggle("active", activeCategory === "");
  nav.appendChild(allBtn);

  for (const cat of toolbox.categories) {
    const count = toolbox.services.filter((s) => s.category === cat.id && s.status === "active").length;
    if (count === 0) continue;
    const btn = makeCatBtn(`${cat.label} (${count})`, cat.id);
    btn.classList.toggle("active", activeCategory === cat.id);
    nav.appendChild(btn);
  }

  const archBtn = makeCatBtn(`Archived (${archived})`, "archived");
  archBtn.classList.toggle("active", activeCategory === "archived");
  nav.appendChild(archBtn);
}

function makeCatBtn(label, value) {
  const btn = document.createElement("button");
  btn.className = "cat-btn";
  btn.textContent = label;
  btn.addEventListener("click", () => {
    activeCategory = value;
    render();
  });
  return btn;
}

function renderGrid() {
  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  grid.innerHTML = "";

  let services = toolbox.services;

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
    img.src = `/api/favicon/${s.id}`;
    img.alt = s.name;
    img.onerror = () => {
      img.src = `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><rect width="36" height="36" rx="8" fill="#4f46e5"/><text x="18" y="24" text-anchor="middle" fill="#fff" font-size="16" font-family="sans-serif">${s.name[0]?.toUpperCase() ?? "?"}</text></svg>`
      )}`;
    };

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = s.name;

    card.appendChild(img);
    card.appendChild(name);

    if (s.category && activeCategory !== s.category) {
      const cat = document.createElement("div");
      cat.className = "cat";
      cat.textContent = s.category;
      card.appendChild(cat);
    }

    card.addEventListener("click", () => window.open(s.url, "_blank"));
    grid.appendChild(card);
  }
}

function populateCategories() {
  const sel = document.getElementById("input-category");
  sel.innerHTML = '<option value="">— none —</option>';
  for (const c of toolbox.categories) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label;
    sel.appendChild(opt);
  }
}

function openModal() {
  document.getElementById("modal").style.display = "flex";
  populateCategories();
}

function closeModal() {
  document.getElementById("modal").style.display = "none";
  document.getElementById("input-url").value = "";
  document.getElementById("input-name").value = "";
  document.getElementById("input-category").value = "";
  document.getElementById("input-notes").value = "";
}

document.getElementById("add-btn").addEventListener("click", openModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("search").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderGrid();
});

document.getElementById("modal-save").addEventListener("click", async () => {
  const url = document.getElementById("input-url").value;
  if (!url) return;
  closeModal();
  await fetch("/api/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      name: document.getElementById("input-name").value || undefined,
      category: document.getElementById("input-category").value || undefined,
      notes: document.getElementById("input-notes").value || undefined,
    }),
  });
  fetchData();
});

fetchData();
