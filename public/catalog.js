const madFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "MAD",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

const state = {
  appName: "Action BLA Ghla",
  products: [],
  filter: "all",
  search: "",
};

const refs = {
  brandName: document.querySelector("#catalog-brand-name"),
  summary: document.querySelector("#catalog-summary"),
  searchInput: document.querySelector("#catalog-search-input"),
  filterChips: document.querySelector("#catalog-filter-chips"),
  filterMeta: document.querySelector("#catalog-filter-meta"),
  grid: document.querySelector("#catalog-grid"),
};

const FILTERS = [
  { key: "all", label: "Tout" },
  { key: "morocco", label: "Maroc" },
  { key: "transit", label: "Arrivage" },
  { key: "france", label: "France" },
];

function normalizeText(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatPriceMad(value) {
  return madFormatter.format(Number(value || 0));
}

function formatCount(value) {
  return numberFormatter.format(Number(value || 0));
}

function formatWeight(weightKg) {
  const value = Number(weightKg || 0);

  if (value <= 0) {
    return "-";
  }

  if (value >= 1) {
    return `${new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: value % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    }).format(value)} kg`;
  }

  return `${formatCount(Math.round(value * 1000))} g`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getFilterCounts(products) {
  return {
    all: products.length,
    morocco: products.filter((product) => product.availability.hasMoroccoStock).length,
    transit: products.filter((product) => product.availability.hasTransitStock).length,
    france: products.filter((product) => product.availability.hasFranceStock).length,
  };
}

function matchesFilter(product) {
  if (state.filter === "morocco") {
    return product.availability.hasMoroccoStock;
  }

  if (state.filter === "transit") {
    return product.availability.hasTransitStock;
  }

  if (state.filter === "france") {
    return product.availability.hasFranceStock;
  }

  return true;
}

function matchesSearch(product) {
  if (!state.search) {
    return true;
  }

  const haystack = normalizeText([product.name, product.notes].join(" "));
  return haystack.includes(normalizeText(state.search));
}

function getVisibleProducts() {
  return state.products.filter((product) => matchesFilter(product) && matchesSearch(product));
}

function renderSummary() {
  const counts = getFilterCounts(state.products);

  refs.summary.innerHTML = `
    <article class="catalog-summary-card">
      <span>Catalogue visible</span>
      <strong>${escapeHtml(formatCount(counts.all))}</strong>
      <small>produits actuellement montrés aux clients</small>
    </article>
    <article class="catalog-summary-card">
      <span>Disponibles au Maroc</span>
      <strong>${escapeHtml(formatCount(counts.morocco))}</strong>
      <small>livrables immédiatement</small>
    </article>
    <article class="catalog-summary-card">
      <span>Arrivages en cours</span>
      <strong>${escapeHtml(formatCount(counts.transit))}</strong>
      <small>déjà en route vers le Maroc</small>
    </article>
    <article class="catalog-summary-card">
      <span>Disponibles en France</span>
      <strong>${escapeHtml(formatCount(counts.france))}</strong>
      <small>réservables avant envoi</small>
    </article>
  `;
}

function renderFilterChips() {
  const counts = getFilterCounts(state.products);

  refs.filterChips.innerHTML = FILTERS.map(
    (filter) => `
      <button
        class="catalog-filter-chip ${state.filter === filter.key ? "is-active" : ""}"
        type="button"
        data-filter="${escapeHtml(filter.key)}"
      >
        <span>${escapeHtml(filter.label)}</span>
        <strong>${escapeHtml(formatCount(counts[filter.key] || 0))}</strong>
      </button>
    `,
  ).join("");
}

function renderProductImage(product) {
  if (product.imageUrl) {
    return `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" />`;
  }

  return `<div class="catalog-card-image-fallback">${escapeHtml(product.name.slice(0, 2).toUpperCase())}</div>`;
}

function renderAvailabilityBadges(product) {
  const badges = [];

  if (product.availability.hasMoroccoStock) {
    badges.push(
      `<span class="catalog-badge catalog-badge-morocco">Disponible au Maroc</span>`,
    );
  }

  if (product.availability.hasTransitStock) {
    badges.push(
      `<span class="catalog-badge catalog-badge-transit">Arrivage en cours</span>`,
    );
  }

  if (product.availability.hasFranceStock) {
    badges.push(
      `<span class="catalog-badge catalog-badge-france">Disponible en France</span>`,
    );
  }

  return badges.join("");
}

function renderProducts() {
  const products = getVisibleProducts();

  refs.filterMeta.textContent = `${formatCount(products.length)} produit${
    products.length > 1 ? "s" : ""
  } visible${products.length > 1 ? "s" : ""}`;

  if (!products.length) {
    refs.grid.innerHTML = `
      <article class="catalog-empty">
        <h3>Aucun produit trouvé</h3>
        <p>Essaie une autre recherche ou change de filtre pour voir plus d’articles.</p>
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
              <div class="catalog-card-badges">
                ${renderAvailabilityBadges(product)}
              </div>
              <h3>${escapeHtml(product.name)}</h3>
              ${
                product.notes
                  ? `<p class="catalog-card-notes">${escapeHtml(product.notes)}</p>`
                  : `<p class="catalog-card-notes">Sélection actuelle disponible selon stock, arrivage et France.</p>`
              }
            </div>

            <div class="catalog-card-price-row">
              <div>
                <span class="catalog-card-kicker">Prix public</span>
                <strong>${escapeHtml(formatPriceMad(product.defaultSalePriceMad))}</strong>
              </div>
              <div class="catalog-card-weight">
                <span class="catalog-card-kicker">Poids</span>
                <strong>${escapeHtml(formatWeight(product.weightKg))}</strong>
              </div>
            </div>

            <div class="catalog-card-stats">
              <div>
                <span>Maroc</span>
                <strong>${escapeHtml(formatCount(product.availability.moroccoQty))}</strong>
              </div>
              <div>
                <span>En route</span>
                <strong>${escapeHtml(formatCount(product.availability.transitQty))}</strong>
              </div>
              <div>
                <span>France</span>
                <strong>${escapeHtml(formatCount(product.availability.franceQty))}</strong>
              </div>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderAll() {
  renderSummary();
  renderFilterChips();
  renderProducts();
}

async function loadCatalog() {
  refs.grid.innerHTML = `
    <article class="catalog-empty">
      <h3>Chargement du catalogue</h3>
      <p>Préparation des produits visibles pour les clients.</p>
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
  renderAll();
}

function bindEvents() {
  refs.searchInput.addEventListener("input", (event) => {
    state.search = event.currentTarget.value || "";
    renderProducts();
  });

  refs.filterChips.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");

    if (!button) {
      return;
    }

    state.filter = button.dataset.filter || "all";
    renderAll();
  });
}

async function init() {
  bindEvents();

  try {
    await loadCatalog();
  } catch (error) {
    refs.filterMeta.textContent = "Catalogue indisponible";
    refs.summary.innerHTML = `
      <article class="catalog-summary-card catalog-summary-card-error">
        <span>Erreur</span>
        <strong>Catalogue indisponible</strong>
        <small>Réessaie dans quelques instants.</small>
      </article>
    `;
    refs.grid.innerHTML = `
      <article class="catalog-empty">
        <h3>Impossible de charger le catalogue</h3>
        <p>${escapeHtml(error.message)}</p>
      </article>
    `;
  }
}

void init();
