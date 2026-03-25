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
  imageModal: document.querySelector("#catalog-image-modal"),
  imageModalBackdrop: document.querySelector("#catalog-image-modal-backdrop"),
  imageModalClose: document.querySelector("#catalog-image-modal-close"),
  imageModalTitle: document.querySelector("#catalog-image-modal-title"),
  imageModalImg: document.querySelector("#catalog-image-modal-img"),
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

function getVisibleStockTotal(product) {
  const availability = product.availability || {};
  return Number(availability.moroccoQty || 0) + Number(availability.franceQty || 0) + Number(availability.transitQty || 0);
}

function hasLowStock(product) {
  return getVisibleStockTotal(product) > 0 && getVisibleStockTotal(product) < 3;
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
    return `
      <button
        class="catalog-card-image-button"
        type="button"
        data-action="open-image"
        data-image-url="${escapeHtml(product.imageUrl)}"
        data-image-alt="${escapeHtml(product.name)}"
        aria-label="Agrandir l'image de ${escapeHtml(product.name)}"
      >
        <img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy" />
      </button>
    `;
  }

  return `<div class="catalog-card-image-fallback">${escapeHtml(product.name.slice(0, 2).toUpperCase())}</div>`;
}

function openImageModal(imageUrl, imageAlt) {
  if (!imageUrl) {
    return;
  }

  refs.imageModalImg.src = imageUrl;
  refs.imageModalImg.alt = imageAlt || "";
  refs.imageModalTitle.textContent = imageAlt || "";
  refs.imageModal.hidden = false;
  document.body.classList.add("catalog-modal-open");
}

function closeImageModal() {
  refs.imageModal.hidden = true;
  refs.imageModalImg.src = "";
  refs.imageModalImg.alt = "";
  refs.imageModalTitle.textContent = "";
  document.body.classList.remove("catalog-modal-open");
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
              ${
                hasLowStock(product)
                  ? `
                    <div class="catalog-stock-alert" aria-label="Stock faible">
                      <span class="catalog-stock-alert-dot" aria-hidden="true"></span>
                      <span>Stock faible</span>
                    </div>
                  `
                  : ""
              }
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

  refs.grid.addEventListener("click", (event) => {
    const trigger = event.target.closest('[data-action="open-image"]');

    if (!trigger) {
      return;
    }

    openImageModal(trigger.dataset.imageUrl || "", trigger.dataset.imageAlt || "");
  });

  refs.imageModalBackdrop.addEventListener("click", closeImageModal);
  refs.imageModalClose.addEventListener("click", closeImageModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !refs.imageModal.hidden) {
      closeImageModal();
    }
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
