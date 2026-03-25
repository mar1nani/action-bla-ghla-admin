const priceFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

const state = {
  appName: "Action BLA Ghla",
  products: [],
  search: "",
};

const refs = {
  brandName: document.querySelector("#catalog-brand-name"),
  searchInput: document.querySelector("#catalog-search-input"),
  filterMeta: document.querySelector("#catalog-filter-meta"),
  grid: document.querySelector("#catalog-grid"),
};

function normalizeText(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatPriceDh(value) {
  return `${priceFormatter.format(Math.round(Number(value || 0)))} DH`;
}

function formatCount(value) {
  return numberFormatter.format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function matchesSearch(product) {
  if (!state.search) {
    return true;
  }

  return normalizeText(product.name).includes(normalizeText(state.search));
}

function getVisibleProducts() {
  return state.products.filter((product) => matchesSearch(product));
}

function renderProductImage(product) {
  if (product.imageUrl) {
    return `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" />`;
  }

  return `<div class="catalog-card-image-fallback">${escapeHtml(product.name.slice(0, 2).toUpperCase())}</div>`;
}

function renderProducts() {
  const products = getVisibleProducts();

  refs.filterMeta.textContent = `${formatCount(products.length)} produit${
    products.length > 1 ? "s" : ""
  }`;

  if (!products.length) {
    refs.grid.innerHTML = `
      <article class="catalog-empty">
        <h3>Aucun produit trouvé</h3>
        <p>Essaie une autre recherche pour voir plus d’articles.</p>
      </article>
    `;
    return;
  }

  refs.grid.innerHTML = products
    .map(
      (product) => `
        <article class="catalog-card">
          <div class="catalog-card-image-shell">
            ${renderProductImage(product)}
          </div>
          <div class="catalog-card-body">
            <div class="catalog-card-copy">
              <p class="catalog-card-kicker">Catalogue client</p>
              <h3>${escapeHtml(product.name)}</h3>
            </div>
            <div class="catalog-card-price-row">
              <span>Prix</span>
              <strong>${escapeHtml(formatPriceDh(product.defaultSalePriceMad))}</strong>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

async function loadCatalog() {
  refs.grid.innerHTML = `
    <article class="catalog-empty">
      <h3>Chargement du catalogue</h3>
      <p>Préparation des produits visibles.</p>
    </article>
  `;

  const response = await fetch("/api/public/catalog");

  if (!response.ok) {
    throw new Error("Impossible de charger le catalogue client.");
  }

  const payload = await response.json();
  state.appName = payload.appName || state.appName;
  state.products = Array.isArray(payload.products) ? payload.products : [];
  refs.brandName.textContent = state.appName;
  renderProducts();
}

function bindEvents() {
  refs.searchInput.addEventListener("input", (event) => {
    state.search = event.currentTarget.value || "";
    renderProducts();
  });
}

async function init() {
  bindEvents();

  try {
    await loadCatalog();
  } catch (error) {
    refs.filterMeta.textContent = "Catalogue indisponible";
    refs.grid.innerHTML = `
      <article class="catalog-empty">
        <h3>Impossible de charger le catalogue</h3>
        <p>${escapeHtml(error.message)}</p>
      </article>
    `;
  }
}

void init();
