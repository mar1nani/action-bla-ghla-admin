const currencyFormatters = {
  EUR: new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }),
  MAD: new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    maximumFractionDigits: 2,
  }),
};

const state = {
  auth: {
    isAuthenticated: false,
    requiresSetup: false,
    user: null,
  },
  settings: {},
  products: [],
  wishlistProductIds: [],
  wishlistCount: 0,
  purchases: [],
  shipments: [],
  orders: [],
  dashboard: {
    totals: {},
    lowStockProducts: [],
    recentActivity: [],
  },
  stats: {
    topSoldProducts: [],
    topProfitProducts: [],
    bestMarginProducts: [],
    topCities: [],
  },
  tables: {
    products: { items: [], pagination: null },
    wishlist: { items: [], pagination: null },
    available: { items: [], pagination: null },
    purchases: { items: [], pagination: null },
    shipments: { items: [], pagination: null },
    orders: { items: [], pagination: null },
    personnel: { items: [], pagination: null },
  },
};

const DEFAULT_TABLE_FILTERS = {
  products: {
    search: "",
  },
  purchases: {
    search: "",
    dateFrom: "",
    dateTo: "",
  },
  shipments: {
    search: "",
    dateFrom: "",
    dateTo: "",
  },
  orders: {
    search: "",
    dateFrom: "",
    dateTo: "",
  },
};

const SIDEBAR_STORAGE_KEY = "action-bla-ghla-sidebar-collapsed";
const SIDEBAR_BRAND_LOGO_PATHS = [
  "/assets/logo-action-bla-ghla.png",
  "/assets/logo-action-bla-ghla.webp",
  "/assets/logo-action-bla-ghla.jpg",
  "/assets/logo-action-bla-ghla.jpeg",
  "/assets/logo-action-bla-ghla.svg",
];
let pendingProductImageUpload = null;
let pendingProductImageTask = Promise.resolve(null);
let productImageVersion = 0;
let pendingPurchaseInvoiceUpload = null;
let pendingPurchaseInvoiceTask = Promise.resolve(null);
let purchaseInvoiceVersion = 0;
let activeProductEditId = "";
let activePurchaseEditId = "";
let activeShipmentEditId = "";
let activeOrderEditId = "";
let activeShipmentDetails = null;
let activeOrderDetails = null;
let confirmDialogState = null;
let activePurchaseItemsEditable = false;
const selectedProductIdsForPurchase = new Set();
const selectedPurchaseIdsForShipment = new Set();
const expandedPurchaseIds = new Set();
const tableFilters = structuredClone(DEFAULT_TABLE_FILTERS);
let activeShipmentSourcePurchaseIds = [];
const PAGE_CONFIG = {
  dashboard: {
    path: "/",
    documentTitle: "Tableau de bord",
  },
  products: {
    path: "/products",
    documentTitle: "Produits",
  },
  wishlist: {
    path: "/wishlist",
    documentTitle: "Wishlist",
  },
  available: {
    path: "/available-stock",
    documentTitle: "Stock disponible",
  },
  purchases: {
    path: "/purchases",
    documentTitle: "Achats",
  },
  shipments: {
    path: "/shipments",
    documentTitle: "Envois",
  },
  orders: {
    path: "/orders",
    documentTitle: "Commandes",
  },
  stats: {
    path: "/stats",
    documentTitle: "Statistiques",
  },
  personnel: {
    path: "/personnel",
    documentTitle: "Personnel",
  },
};

const refs = {
  sidebar: document.querySelector("#app-sidebar"),
  sidebarBrand: document.querySelector(".sidebar-brand"),
  sidebarBrandMedia: document.querySelector("#sidebar-brand-media"),
  sidebarBrandLogo: document.querySelector("#sidebar-brand-logo"),
  sidebarBrandFallback: document.querySelector("#sidebar-brand-fallback"),
  sidebarToggle: document.querySelector("#sidebar-toggle"),
  topbarSidebarToggle: document.querySelector("#topbar-sidebar-toggle"),
  topbarMobileTitle: document.querySelector("#topbar-mobile-title"),
  sidebarBackdrop: document.querySelector("#sidebar-backdrop"),
  sectionLinks: [...document.querySelectorAll("[data-section-link]")],
  mobileNavMenuToggle: document.querySelector("#mobile-nav-menu-toggle"),
  mobileQuickCreateToggle: document.querySelector("#mobile-quick-create-toggle"),
  personnelLink: document.querySelector('[data-section-link="personnel"]'),
  sections: [...document.querySelectorAll(".section")],
  tableFilterForms: [...document.querySelectorAll("[data-table-filter-form]")],
  personnelForm: document.querySelector("#personnel-form"),
  personnelFormError: document.querySelector("#personnel-form-error"),
  personnelSubmitButton: document.querySelector("#personnel-submit-button"),
  personnelTable: document.querySelector("#personnel-table"),
  personnelPagination: document.querySelector("#personnel-pagination"),
  pageKicker: document.querySelector("#page-kicker"),
  healthPill: document.querySelector("#health-pill"),
  syncTime: document.querySelector("#sync-time"),
  quickCreate: document.querySelector(".quick-create"),
  quickCreateToggle: document.querySelector("#quick-create-toggle"),
  quickCreateMenu: document.querySelector("#quick-create-menu"),
  profileTrigger: document.querySelector("#profile-trigger"),
  profileMenu: document.querySelector("#profile-menu"),
  logoutButton: document.querySelector("#logout-button"),
  profileAvatar: document.querySelector("#profile-avatar"),
  profileMenuAvatar: document.querySelector("#profile-menu-avatar"),
  profileName: document.querySelector("#profile-name"),
  profileLogin: document.querySelector("#profile-login"),
  modalShells: [...document.querySelectorAll(".modal-shell")],
  flashMessage: document.querySelector("#flash-message"),
  dashboardCards: document.querySelector("#dashboard-cards"),
  lowStockList: document.querySelector("#low-stock-list"),
  activityList: document.querySelector("#activity-list"),
  productsTable: document.querySelector("#products-table"),
  productsPagination: document.querySelector("#products-pagination"),
  wishlistTable: document.querySelector("#wishlist-table"),
  wishlistPagination: document.querySelector("#wishlist-pagination"),
  availableGrid: document.querySelector("#available-grid"),
  availablePagination: document.querySelector("#available-pagination"),
  productsCreatePurchaseButton: document.querySelector("#products-create-purchase-button"),
  productsCreateOrderButton: document.querySelector("#products-create-order-button"),
  purchasesList: document.querySelector("#purchases-list"),
  purchasesPagination: document.querySelector("#purchases-pagination"),
  purchasesCreateShipmentButton: document.querySelector("#purchases-create-shipment-button"),
  shipmentsList: document.querySelector("#shipments-list"),
  shipmentsPagination: document.querySelector("#shipments-pagination"),
  ordersList: document.querySelector("#orders-list"),
  ordersPagination: document.querySelector("#orders-pagination"),
  statsTopSold: document.querySelector("#stats-top-sold"),
  statsTopProfit: document.querySelector("#stats-top-profit"),
  statsBestMargin: document.querySelector("#stats-best-margin"),
  statsTopCities: document.querySelector("#stats-top-cities"),
  purchaseItems: document.querySelector("#purchase-items"),
  shipmentItems: document.querySelector("#shipment-items"),
  orderItems: document.querySelector("#order-items"),
  purchaseSummary: document.querySelector("#purchase-summary"),
  shipmentSummary: document.querySelector("#shipment-summary"),
  orderSummary: document.querySelector("#order-summary"),
  settingsForm: document.querySelector("#settings-form"),
  productForm: document.querySelector("#product-form"),
  productId: document.querySelector("#product-id"),
  productFormTitle: document.querySelector("#product-form-title"),
  productInitialStockQty: document.querySelector("#product-initial-stock-qty"),
  productStockHelp: document.querySelector("#product-stock-help"),
  productSubmitButton: document.querySelector("#product-submit-button"),
  productCancelButton: document.querySelector("#product-cancel-button"),
  productFormError: document.querySelector("#product-form-error"),
  productImageFile: document.querySelector("#product-image-file"),
  productImagePreview: document.querySelector("#product-image-preview"),
  productPreviewImage: document.querySelector("#product-preview-image"),
  productImageTitle: document.querySelector("#product-image-title"),
  productImageMeta: document.querySelector("#product-image-meta"),
  purchaseForm: document.querySelector("#purchase-form"),
  purchaseId: document.querySelector("#purchase-id"),
  purchaseFormTitle: document.querySelector("#purchase-form-title"),
  purchaseSubmitButton: document.querySelector("#purchase-submit-button"),
  purchaseFormError: document.querySelector("#purchase-form-error"),
  purchaseAddRowButton: document.querySelector("#purchase-add-row-button"),
  purchaseInvoiceFile: document.querySelector("#purchase-invoice-file"),
  purchaseInvoicePreview: document.querySelector("#purchase-invoice-preview"),
  purchaseInvoicePreviewImage: document.querySelector("#purchase-invoice-preview-image"),
  purchaseInvoiceTitle: document.querySelector("#purchase-invoice-title"),
  purchaseInvoiceMeta: document.querySelector("#purchase-invoice-meta"),
  shipmentForm: document.querySelector("#shipment-form"),
  shipmentId: document.querySelector("#shipment-id"),
  shipmentFormTitle: document.querySelector("#shipment-form-title"),
  shipmentSubmitButton: document.querySelector("#shipment-submit-button"),
  shipmentFormError: document.querySelector("#shipment-form-error"),
  shipmentAddRowButton: document.querySelector("#shipment-add-row-button"),
  orderForm: document.querySelector("#order-form"),
  orderId: document.querySelector("#order-id"),
  orderFormTitle: document.querySelector("#order-form-title"),
  orderSubmitButton: document.querySelector("#order-submit-button"),
  orderFormError: document.querySelector("#order-form-error"),
  orderAddRowButton: document.querySelector('[data-add-row="order"]'),
  companyName: document.querySelector("#company-name"),
  transportRate: document.querySelector("#transport-rate"),
  eurToMad: document.querySelector("#eur-to-mad"),
  lowStockDefault: document.querySelector("#low-stock-default"),
  shipmentDetailsTitle: document.querySelector("#shipment-details-title"),
  shipmentDetailsContent: document.querySelector("#shipment-details-content"),
  orderDetailsTitle: document.querySelector("#order-details-title"),
  orderDetailsContent: document.querySelector("#order-details-content"),
  imageViewerTarget: document.querySelector("#image-viewer-target"),
  confirmModalTitle: document.querySelector("#confirm-modal-title"),
  confirmModalMessage: document.querySelector("#confirm-modal-message"),
  confirmModalCancel: document.querySelector("#confirm-modal-cancel"),
  confirmModalConfirm: document.querySelector("#confirm-modal-confirm"),
  authShell: document.querySelector("#auth-shell"),
  authTitle: document.querySelector("#auth-title"),
  authSubtitle: document.querySelector("#auth-subtitle"),
  loginForm: document.querySelector("#login-form"),
  setupForm: document.querySelector("#setup-form"),
  loginFormError: document.querySelector("#login-form-error"),
  setupFormError: document.querySelector("#setup-form-error"),
};

const MODAL_TO_FORM_TYPE = {
  "product-modal": "product",
  "purchase-modal": "purchase",
  "shipment-modal": "shipment",
  "order-modal": "order",
};

const TABLE_ENDPOINTS = {
  products: "/api/products",
  wishlist: "/api/wishlist",
  available: "/api/available-products",
  purchases: "/api/purchases",
  shipments: "/api/shipments",
  orders: "/api/orders",
  personnel: "/api/users",
};

const ICONS = {
  edit: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20l4.4-1 9.1-9.1-3.4-3.4L5 15.6 4 20z"></path>
      <path d="M13.9 6.6l3.4 3.4"></path>
    </svg>
  `,
  delete: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14"></path>
      <path d="M10 11v6"></path>
      <path d="M14 11v6"></path>
      <path d="M8 7l1-2h6l1 2"></path>
      <path d="M7 7l1 12h8l1-12"></path>
    </svg>
  `,
  view: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `,
  download: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v10"></path>
      <path d="M8.5 10.5L12 14l3.5-3.5"></path>
      <path d="M4 19h16"></path>
    </svg>
  `,
  invoice: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h8l4 4v14H7z"></path>
      <path d="M15 3v5h4"></path>
      <path d="M10 12h6"></path>
      <path d="M10 16h6"></path>
    </svg>
  `,
  heart: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20.3l-1.4-1.3C5 13.9 2 11.1 2 7.7 2 5 4.1 3 6.8 3c1.7 0 3.3.8 4.2 2.2C11.9 3.8 13.5 3 15.2 3 17.9 3 20 5 20 7.7c0 3.4-3 6.2-8.6 11.3L12 20.3z"></path>
    </svg>
  `,
  stock: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7.5L12 3l8 4.5v9L12 21l-8-4.5z"></path>
      <path d="M12 12l8-4.5"></path>
      <path d="M12 12L4 7.5"></path>
      <path d="M12 12v9"></path>
    </svg>
  `,
};

const formTypes = {
  purchase: {
    container: refs.purchaseItems,
  },
  shipment: {
    container: refs.shipmentItems,
  },
  order: {
    container: refs.orderItems,
  },
};

function isMobileViewport() {
  return window.matchMedia("(max-width: 980px)").matches;
}

function getInitialSidebarState() {
  const savedState = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);

  if (savedState === "true") {
    return true;
  }

  if (savedState === "false") {
    return false;
  }

  return isMobileViewport();
}

function syncResponsiveShellState() {
  const mobileViewport = isMobileViewport();
  const collapsed = document.body.classList.contains("sidebar-collapsed");
  const mobileSidebarOpen = mobileViewport && !collapsed;

  document.body.classList.toggle("is-mobile-viewport", mobileViewport);
  document.body.classList.toggle("mobile-sidebar-open", mobileSidebarOpen);

  if (refs.topbarSidebarToggle) {
    refs.topbarSidebarToggle.hidden = !mobileViewport;
    refs.topbarSidebarToggle.setAttribute("aria-expanded", String(mobileSidebarOpen));
    refs.topbarSidebarToggle.setAttribute(
      "aria-label",
      mobileSidebarOpen ? "Fermer la navigation" : "Ouvrir la navigation",
    );
  }

  if (refs.sidebarBackdrop) {
    refs.sidebarBackdrop.hidden = !mobileSidebarOpen;
    refs.sidebarBackdrop.setAttribute("aria-hidden", String(!mobileSidebarOpen));
  }

  if (refs.mobileNavMenuToggle) {
    refs.mobileNavMenuToggle.setAttribute("aria-expanded", String(mobileSidebarOpen));
  }
}

function applySidebarState(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  refs.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  refs.sidebarToggle.setAttribute(
    "aria-label",
    collapsed ? "Ouvrir la sidebar" : "Fermer la sidebar",
  );
  syncResponsiveShellState();
}

function toggleSidebar() {
  const collapsed = !document.body.classList.contains("sidebar-collapsed");
  applySidebarState(collapsed);
  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
}

function handleViewportResize() {
  syncResponsiveShellState();
  closeQuickCreateMenu();
  closeProfileMenu();
}

function loadImageCandidate(src) {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => resolve(src);
    image.onerror = () => resolve("");
    image.src = src;
  });
}

async function setupSidebarBrandLogo() {
  if (!refs.sidebarBrandMedia || !refs.sidebarBrandLogo) {
    return;
  }

  refs.sidebarBrandMedia.classList.remove("has-logo");
  refs.sidebarBrandLogo.hidden = true;
  refs.sidebarBrandLogo.removeAttribute("src");

  for (const src of SIDEBAR_BRAND_LOGO_PATHS) {
    const resolvedSource = await loadImageCandidate(src);

    if (!resolvedSource) {
      continue;
    }

    refs.sidebarBrandLogo.src = resolvedSource;
    refs.sidebarBrandLogo.hidden = false;
    refs.sidebarBrandMedia.classList.add("has-logo");
    return;
  }
}

function normalizePath(pathname) {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.replace(/\/+$/, "");
}

function canManagePersonnel() {
  return Boolean(state.auth.user?.canManageUsers);
}

function getCurrentPageKey() {
  const currentPath = normalizePath(window.location.pathname);
  const requestedPageKey =
    Object.entries(PAGE_CONFIG).find(([, config]) => config.path === currentPath)?.[0] ||
    "dashboard";

  if (requestedPageKey === "personnel" && !canManagePersonnel()) {
    return "dashboard";
  }

  return requestedPageKey;
}

function setActiveSectionLink(sectionId) {
  refs.sectionLinks.forEach((link) => {
    const isActive = link.dataset.sectionLink === sectionId;
    link.classList.toggle("is-active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "page");
      return;
    }

    link.removeAttribute("aria-current");
  });
}

function applyPageLayout() {
  const currentPageKey = getCurrentPageKey();
  const pageConfig = PAGE_CONFIG[currentPageKey];
  const normalizedPath = normalizePath(window.location.pathname);

  if (normalizedPath !== pageConfig.path) {
    window.history.replaceState({}, "", pageConfig.path);
  }

  document.body.dataset.page = currentPageKey;

  refs.sections.forEach((section) => {
    section.hidden = section.id !== currentPageKey;
  });

  if (refs.pageKicker) {
    refs.pageKicker.textContent = pageConfig.documentTitle;
  }

  if (refs.topbarMobileTitle) {
    refs.topbarMobileTitle.textContent = pageConfig.documentTitle;
  }

  document.title = `${
    state.settings.companyName || "Action BLA Ghla"
  } · ${pageConfig.documentTitle}`;
  setActiveSectionLink(currentPageKey);
}

function navigateToPath(pathname, options = {}) {
  const targetPath = normalizePath(pathname);
  const currentPath = normalizePath(window.location.pathname);

  if (targetPath !== currentPath) {
    const method = options.replace ? "replaceState" : "pushState";
    window.history[method]({}, "", targetPath);
  }

  applyPageLayout();

  if (state.auth.isAuthenticated) {
    void ensurePageTableData();
  }

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function renderIcon(name) {
  return ICONS[name] || "";
}

function renderProductThumb({
  imageUrl = "",
  label = "",
  className = "",
  fallback = "",
  button = false,
} = {}) {
  const content = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(label)}" />`
    : `<span class="detail-image-placeholder">${escapeHtml(
        fallback || label.slice(0, 2).toUpperCase() || "?",
      )}</span>`;

  if (button) {
    return `
      <button
        class="${escapeHtml(`detail-image-button ${className}`.trim())}"
        type="button"
        data-image-src="${escapeHtml(imageUrl)}"
        data-image-alt="${escapeHtml(label)}"
        ${imageUrl ? "" : "disabled"}
      >
        ${content}
      </button>
    `;
  }

  return `
    <div class="product-thumb ${className}">
      ${content}
    </div>
  `;
}

function renderPurchaseInvoiceThumb(purchase) {
  if (!purchase.invoiceImageUrl) {
    return `<span class="table-media-empty">-</span>`;
  }

  const label = purchase.orderNumber
    ? `Facture ${purchase.orderNumber}`
    : `Facture ${purchase.supplierName || "fournisseur"}`;

  return renderProductThumb({
    imageUrl: purchase.invoiceImageUrl,
    label,
    className: "product-thumb-table purchase-invoice-thumb",
    fallback: "FA",
    button: true,
  });
}

function setPurchaseItemsEditMode(isEditable) {
  activePurchaseItemsEditable = Boolean(isEditable);

  if (refs.purchaseAddRowButton) {
    refs.purchaseAddRowButton.hidden = !activePurchaseItemsEditable;
  }
}

function renderPurchaseItemsDetails(purchase) {
  return `
    <div class="purchase-detail-panel">
      <div class="purchase-detail-head">
        <div>
          <strong>Détail des articles</strong>
          <small>${escapeHtml(
            `${purchase.items.length} ligne${purchase.items.length > 1 ? "s" : ""} · ${formatNumber(
              purchase.totalQty,
              0,
            )} pièces`,
          )}</small>
        </div>
        <span>${escapeHtml(formatCurrency(purchase.totalCostEur, "EUR"))}</span>
      </div>
      <div class="purchase-detail-table-shell">
        <table class="purchase-detail-table">
          <thead>
            <tr>
              <th>Article</th>
              <th>Qté</th>
              <th>Poids</th>
              <th>Prix unité</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${(purchase.items ?? [])
              .map(
                (item) => `
                  <tr>
                    <td>${escapeHtml(item.productName)}</td>
                    <td>${escapeHtml(formatNumber(item.qty, 0))}</td>
                    <td>${escapeHtml(formatWeight(item.lineWeightKg))}</td>
                    <td>${escapeHtml(formatCurrency(item.unitPurchasePriceEur, "EUR"))}</td>
                    <td>${escapeHtml(formatCurrency(item.lineTotalEur, "EUR"))}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function isModifiedNavigation(event) {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCurrency(value, currency) {
  return currencyFormatters[currency].format(Number(value || 0));
}

function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function convertKgToGrams(value) {
  return Math.round(Number(value || 0) * 1000);
}

function convertGramsToKg(value) {
  return Number(value || 0) / 1000;
}

function formatWeight(value) {
  const weightKg = Number(value || 0);
  const weightGrams = convertKgToGrams(weightKg);

  if (weightGrams >= 1000) {
    const digits = Number.isInteger(weightKg) ? 0 : 2;
    return `${formatNumber(weightKg, digits)} kg`;
  }

  return `${formatNumber(weightGrams, 0)} g`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatOrderStatusLabel(status) {
  return (
    {
      brouillon: "Brouillon",
      confirmee: "Confirmée",
      livree: "Livrée",
    }[status] || "Commande"
  );
}

function formatShipmentStatusLabel(status) {
  return (
    {
      achete: "Acheté",
      en_preparation: "En préparation",
      envoye: "Envoyé",
      chez_transporteur: "Chez le transporteur",
      recu: "Colis reçu",
    }[status] || "Envoyé"
  );
}

function formatPaymentStatusLabel(status) {
  return (
    {
      non_payee: "Non payée",
      avance: "Avance reçue",
      payee: "Payée",
    }[status] || "Non payée"
  );
}

function getPaymentStatusChipClass(status) {
  return (
    {
      payee: "status-chip-paid",
      avance: "status-chip-advance",
      non_payee: "status-chip-unpaid",
    }[status] || "status-chip-unpaid"
  );
}

function formatInputAmount(value) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;

  if (!Number.isFinite(rounded)) {
    return "0";
  }

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function renderPurchaseShipmentChip(purchase) {
  if (!purchase.linkedShipmentId) {
    return `<span class="status-chip status-chip-subtle">A envoyer</span>`;
  }

  return `
    <span class="status-chip ${escapeHtml(`status-chip-shipment-${purchase.linkedShipmentStatus || "envoye"}`)}">
      ${escapeHtml(`Colis ${formatShipmentStatusLabel(purchase.linkedShipmentStatus)}`)}
    </span>
  `;
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function closeQuickCreateMenu() {
  refs.quickCreateMenu.hidden = true;
  refs.quickCreateToggle.setAttribute("aria-expanded", "false");
  refs.mobileQuickCreateToggle?.setAttribute("aria-expanded", "false");
}

function toggleQuickCreateMenu() {
  if (isMobileViewport() && document.body.classList.contains("mobile-sidebar-open")) {
    applySidebarState(true);
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "true");
  }

  const nextExpanded = refs.quickCreateMenu.hidden;
  refs.quickCreateMenu.hidden = !nextExpanded;
  refs.quickCreateToggle.setAttribute("aria-expanded", String(nextExpanded));
  refs.mobileQuickCreateToggle?.setAttribute("aria-expanded", String(nextExpanded));
}

function closeProfileMenu() {
  if (!refs.profileMenu || !refs.profileTrigger) {
    return;
  }

  refs.profileMenu.hidden = true;
  refs.profileTrigger.setAttribute("aria-expanded", "false");
}

function toggleProfileMenu() {
  if (!refs.profileMenu || !refs.profileTrigger) {
    return;
  }

  const nextExpanded = refs.profileMenu.hidden;
  refs.profileMenu.hidden = !nextExpanded;
  refs.profileTrigger.setAttribute("aria-expanded", String(nextExpanded));
}

function getOpenModal() {
  return refs.modalShells.find((modal) => !modal.hidden) || null;
}

function syncModalBodyState() {
  document.body.classList.toggle("modal-open", Boolean(getOpenModal()));
}

function openModal(modalId) {
  closeQuickCreateMenu();
  closeProfileMenu();

  if (isMobileViewport() && document.body.classList.contains("mobile-sidebar-open")) {
    applySidebarState(true);
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "true");
  }

  refs.modalShells.forEach((modal) => {
    modal.hidden = modal.id !== modalId;
  });
  syncModalBodyState();
}

function openConfirmDialog({
  title = "Supprimer cet élément ?",
  message = "Cette action est définitive et ne pourra pas être annulée.",
  confirmLabel = "Supprimer",
} = {}) {
  refs.confirmModalTitle.textContent = title;
  refs.confirmModalMessage.textContent = message;
  refs.confirmModalConfirm.textContent = confirmLabel;

  return new Promise((resolve) => {
    confirmDialogState = { resolve };
    openModal("confirm-modal");
  });
}

function closeModal(modalId, options = {}) {
  const modal = refs.modalShells.find((entry) => entry.id === modalId);

  if (!modal) {
    return;
  }

  if (modalId === "confirm-modal" && confirmDialogState && !options.skipConfirmSettle) {
    const { resolve } = confirmDialogState;
    confirmDialogState = null;
    resolve(false);
  }

  modal.hidden = true;

  if (options.resetForm !== false) {
    resetFormForModal(modalId);
  }

  syncModalBodyState();
}

function settleConfirmDialog(confirmed) {
  if (!confirmDialogState) {
    return;
  }

  const { resolve } = confirmDialogState;
  confirmDialogState = null;
  closeModal("confirm-modal", {
    resetForm: false,
    skipConfirmSettle: true,
  });
  resolve(confirmed);
}

function closeAllModals(options = {}) {
  refs.modalShells.forEach((modal) => {
    if (!modal.hidden) {
      closeModal(modal.id, options);
    }
  });
}

function getInitials(value) {
  return String(value || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() || "")
    .join("");
}

function setInlineMessage(element, message = "") {
  if (!element) {
    return;
  }

  element.hidden = !message;
  element.textContent = message;
}

function clearAllFormMessages() {
  [
    refs.productFormError,
    refs.purchaseFormError,
    refs.shipmentFormError,
    refs.orderFormError,
    refs.personnelFormError,
    refs.loginFormError,
    refs.setupFormError,
  ].forEach((element) => setInlineMessage(element));
}

function updateAuthUI() {
  const user = state.auth.user;
  const isAuthenticated = state.auth.isAuthenticated;
  const initials = isAuthenticated ? getInitials(user.displayName || user.login) : "?";
  const canManage = isAuthenticated && canManagePersonnel();

  refs.profileAvatar.textContent = initials;
  if (refs.profileMenuAvatar) {
    refs.profileMenuAvatar.textContent = initials;
  }
  refs.profileName.textContent = isAuthenticated ? user.displayName : "Session fermée";
  refs.profileLogin.textContent = isAuthenticated
    ? `@${user.login}`
    : "Connecte-toi pour accéder au stock";
  refs.logoutButton.hidden = !isAuthenticated;
  if (refs.personnelLink) {
    refs.personnelLink.hidden = !canManage;
  }
  closeProfileMenu();
  refs.authShell.hidden = isAuthenticated;

  if (!canManage) {
    state.tables.personnel = {
      items: [],
      pagination: null,
    };
    setInlineMessage(refs.personnelFormError);
  }

  if (!isAuthenticated) {
    refs.authTitle.textContent = state.auth.requiresSetup
      ? "Créer le premier compte"
      : "Connexion";
    refs.authSubtitle.textContent = state.auth.requiresSetup
      ? "Définis le premier accès sécurisé pour l’application."
      : "Connecte-toi pour accéder au tableau de bord.";
    refs.setupForm.hidden = !state.auth.requiresSetup;
    refs.loginForm.hidden = state.auth.requiresSetup;
  }
}

function applySessionState(payload) {
  state.auth = {
    isAuthenticated: Boolean(payload.isAuthenticated),
    requiresSetup: Boolean(payload.requiresSetup),
    user: payload.user || null,
  };
  updateAuthUI();
}

async function loadSession() {
  const response = await fetch("/api/auth/session");
  const payload = await response.json();
  applySessionState(payload);
  return payload;
}

function getProductById(productId) {
  return state.products.find((product) => product.id === productId);
}

function getPurchaseById(purchaseId) {
  return state.purchases.find((purchase) => purchase.id === purchaseId);
}

function syncSelectedProductsForPurchase() {
  const validProductIds = new Set(state.products.map((product) => product.id));

  [...selectedProductIdsForPurchase].forEach((productId) => {
    if (!validProductIds.has(productId)) {
      selectedProductIdsForPurchase.delete(productId);
    }
  });
}

function getSelectedProductsForPurchase() {
  syncSelectedProductsForPurchase();

  return [...selectedProductIdsForPurchase]
    .map((productId) => getProductById(productId))
    .filter(Boolean);
}

function syncSelectedPurchasesForShipment() {
  const validPurchaseIds = new Set(
    state.purchases.filter((purchase) => purchase.canCreateShipment).map((purchase) => purchase.id),
  );

  [...selectedPurchaseIdsForShipment].forEach((purchaseId) => {
    if (!validPurchaseIds.has(purchaseId)) {
      selectedPurchaseIdsForShipment.delete(purchaseId);
    }
  });
}

function getSelectedPurchasesForShipment() {
  syncSelectedPurchasesForShipment();

  return [...selectedPurchaseIdsForShipment]
    .map((purchaseId) => getPurchaseById(purchaseId))
    .filter(Boolean);
}

function updateProductsCreatePurchaseButton() {
  if (!refs.productsCreatePurchaseButton && !refs.productsCreateOrderButton) {
    return;
  }

  const selectedProducts = getSelectedProductsForPurchase();
  const isHidden = selectedProducts.length === 0;

  if (refs.productsCreatePurchaseButton) {
    refs.productsCreatePurchaseButton.hidden = isHidden;
    refs.productsCreatePurchaseButton.textContent =
      selectedProducts.length <= 1
        ? "Créer un achat"
        : `Créer un achat (${formatNumber(selectedProducts.length, 0)})`;
  }

  if (refs.productsCreateOrderButton) {
    refs.productsCreateOrderButton.hidden = isHidden;
    refs.productsCreateOrderButton.textContent =
      selectedProducts.length <= 1
        ? "Créer une commande"
        : `Créer une commande (${formatNumber(selectedProducts.length, 0)})`;
  }
}

function updatePurchasesCreateShipmentButton() {
  if (!refs.purchasesCreateShipmentButton) {
    return;
  }

  const selectedPurchases = getSelectedPurchasesForShipment();
  const isHidden = selectedPurchases.length === 0;

  refs.purchasesCreateShipmentButton.hidden = isHidden;
  refs.purchasesCreateShipmentButton.textContent =
    selectedPurchases.length <= 1
      ? "Créer un envoi"
      : `Créer un envoi (${formatNumber(selectedPurchases.length, 0)})`;
}

function getTableRecord(tableKey, recordId) {
  return (state.tables[tableKey]?.items ?? []).find((item) => item.id === recordId) || null;
}

function getTablePage(tableKey) {
  return state.tables[tableKey]?.pagination?.page || 1;
}

function getDefaultTableFilters(tableKey) {
  return structuredClone(DEFAULT_TABLE_FILTERS[tableKey] || {});
}

function normalizeFilterValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getTableFilters(tableKey) {
  return {
    ...getDefaultTableFilters(tableKey),
    ...(tableFilters[tableKey] || {}),
  };
}

function resetAllTableFilters() {
  Object.keys(DEFAULT_TABLE_FILTERS).forEach((tableKey) => {
    tableFilters[tableKey] = getDefaultTableFilters(tableKey);
  });
}

function buildTableQuery(tableKey, page = 1) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "10",
  });
  const filters = getTableFilters(tableKey);

  Object.entries(filters).forEach(([key, value]) => {
    const normalizedValue = normalizeFilterValue(value);

    if (normalizedValue) {
      params.set(key, normalizedValue);
    }
  });

  return params.toString();
}

function syncTableFilterForms() {
  refs.tableFilterForms.forEach((form) => {
    const tableKey = form.dataset.tableFilterForm;
    const filters = getTableFilters(tableKey);

    Object.entries(filters).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);

      if (field && "value" in field) {
        field.value = value;
      }
    });
  });
}

function setModalFormError(formType, message = "") {
  const target =
    {
      product: refs.productFormError,
      purchase: refs.purchaseFormError,
      shipment: refs.shipmentFormError,
      order: refs.orderFormError,
      login: refs.loginFormError,
      setup: refs.setupFormError,
    }[formType] || null;

  if (target) {
    setInlineMessage(target, message);
  }
}

function setPersonnelFormError(message = "") {
  setInlineMessage(refs.personnelFormError, message);
}

async function refreshTableData(
  tableKeys = Object.keys(TABLE_ENDPOINTS).filter(
    (tableKey) => tableKey !== "personnel" || canManagePersonnel(),
  ),
) {
  await Promise.all(
    tableKeys.map((tableKey) =>
      loadTablePage(tableKey, getTablePage(tableKey), {
        render: false,
      }),
    ),
  );
  renderAll();
}

function productHasHistory(productId) {
  const collections = [state.purchases, state.shipments, state.orders];

  return collections.some((collection) =>
    collection.some((entry) => (entry.items ?? []).some((item) => item.productId === productId)),
  );
}

function setProductFormMode(product = null) {
  const isEditing = Boolean(product);

  activeProductEditId = product?.id || "";
  refs.productId.value = activeProductEditId;
  refs.productFormTitle.textContent = isEditing ? "Modifier le produit" : "Ajouter un produit";
  refs.productSubmitButton.textContent = isEditing
    ? "Enregistrer les modifications"
    : "Ajouter le produit";
  refs.productCancelButton.hidden = !isEditing;
  refs.productInitialStockQty.disabled = isEditing;
  refs.productInitialStockQty.value = isEditing
    ? "0"
    : refs.productInitialStockQty.value || "0";
  refs.productStockHelp.textContent = isEditing
    ? "Le stock se gère ensuite depuis Achats, Envois et Commandes."
    : "Optionnel. Permet de démarrer avec du stock France dès la création.";
}

function resetProductForm() {
  activeProductEditId = "";
  refs.productForm.reset();
  setModalFormError("product");
  setProductFormMode();
  refs.productForm.elements.minStockAlert.value = state.settings.lowStockDefault || 2;
  refs.productInitialStockQty.value = "0";
  resetProductImageSelection();
}

function handleProductCancel() {
  closeModal("product-modal");
}

function fillProductForm(product) {
  activeProductEditId = product.id;
  refs.productForm.elements.productId.value = product.id;
  refs.productForm.elements.name.value = product.name || "";
  refs.productForm.elements.weightKg.value = product.weightKg
    ? String(convertKgToGrams(product.weightKg))
    : "";
  refs.productForm.elements.minStockAlert.value = product.minStockAlert ?? 0;
  refs.productForm.elements.defaultPurchasePriceEur.value =
    product.defaultPurchasePriceEur ?? "";
  refs.productForm.elements.defaultSalePriceMad.value = product.defaultSalePriceMad ?? "";
  refs.productForm.elements.notes.value = product.notes || "";

  setProductFormMode(product);
  productImageVersion += 1;
  pendingProductImageUpload = null;
  pendingProductImageTask = Promise.resolve(null);
  refs.productImageFile.value = "";

  if (product.imageUrl) {
    updateProductImagePreview({
      src: product.imageUrl,
      title: product.name,
      meta: "Image actuelle. Choisis une nouvelle photo pour la remplacer.",
    });
  } else {
    updateProductImagePreview({
      title: "Aucune photo sélectionnée",
      meta: "Choisis une image si tu veux ajouter ou remplacer la photo produit.",
    });
  }
}

function setPurchaseFormMode(purchase = null) {
  activePurchaseEditId = purchase?.id || "";
  setModalFormError("purchase");
  setPurchaseItemsEditMode(Boolean(purchase?.canCreateShipment));
  refs.purchaseId.value = activePurchaseEditId;
  refs.purchaseFormTitle.textContent = activePurchaseEditId ? "Modifier l'achat" : "Nouvel achat";
  refs.purchaseSubmitButton.textContent = activePurchaseEditId
    ? "Enregistrer les modifications"
    : "Enregistrer l'achat";

  if (!purchase) {
    updatePurchaseInvoicePreview();
  }
}

function setShipmentFormMode(shipment = null) {
  activeShipmentEditId = shipment?.id || "";
  setModalFormError("shipment");
  refs.shipmentId.value = activeShipmentEditId;
  refs.shipmentFormTitle.textContent = activeShipmentEditId
    ? "Modifier l'envoi"
    : "Nouvel envoi";
  refs.shipmentSubmitButton.textContent = activeShipmentEditId
    ? "Enregistrer les modifications"
    : "Enregistrer l'envoi";
}

function setShipmentSourceSelectionMode(purchaseIds = []) {
  activeShipmentSourcePurchaseIds = [...new Set((purchaseIds ?? []).filter(Boolean))];

  if (refs.shipmentAddRowButton) {
    refs.shipmentAddRowButton.hidden = activeShipmentSourcePurchaseIds.length > 0;
  }
}

function setOrderFormMode(order = null) {
  activeOrderEditId = order?.id || "";
  setModalFormError("order");
  refs.orderId.value = activeOrderEditId;
  refs.orderFormTitle.textContent = activeOrderEditId
    ? "Modifier la commande"
    : "Nouvelle commande client";
  refs.orderSubmitButton.textContent = activeOrderEditId
    ? "Enregistrer les modifications"
    : "Enregistrer la commande";
}

function setHealth(status, timestamp) {
  if (!refs.healthPill || !refs.syncTime) {
    return;
  }

  refs.healthPill.textContent = status;
  refs.healthPill.className = "pill";

  if (status === "API OK") {
    refs.healthPill.classList.add("pill-ready");
  } else if (status === "API indisponible") {
    refs.healthPill.classList.add("pill-error");
  } else {
    refs.healthPill.classList.add("pill-wait");
  }

  refs.syncTime.textContent = timestamp
    ? `Mise à jour ${formatDateTime(timestamp)}`
    : "synchronisation en attente";
}

function showFlash(message, tone = "success") {
  refs.flashMessage.hidden = false;
  refs.flashMessage.textContent = message;
  refs.flashMessage.dataset.tone = tone;

  window.clearTimeout(showFlash.timeoutId);
  showFlash.timeoutId = window.setTimeout(() => {
    refs.flashMessage.hidden = true;
  }, 4500);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};

  if (response.status === 401) {
    applySessionState({
      isAuthenticated: false,
      requiresSetup: false,
      user: null,
    });
  }

  if (!response.ok) {
    throw new Error(payload.message || "Une erreur est survenue.");
  }

  return payload;
}

async function loadAppState() {
  const appState = await apiRequest("/api/app-state");
  Object.assign(state, appState);
}

async function loadTablePage(tableKey, page = 1, options = {}) {
  const payload = await apiRequest(`${TABLE_ENDPOINTS[tableKey]}?${buildTableQuery(tableKey, page)}`);
  state.tables[tableKey] = payload;

  if (options.render !== false) {
    renderAll();
  }
}

function getCurrentTableKey() {
  const currentPageKey = getCurrentPageKey();
  return TABLE_ENDPOINTS[currentPageKey] ? currentPageKey : "";
}

async function ensurePageTableData(options = {}) {
  const tableKey = getCurrentTableKey();

  if (!tableKey) {
    if (options.render) {
      renderAll();
    }
    return;
  }

  const currentPage = state.tables[tableKey]?.pagination?.page || 1;

  if (!options.force && state.tables[tableKey]?.pagination) {
    if (options.render) {
      renderAll();
    }
    return;
  }

  await loadTablePage(tableKey, currentPage, { render: false });

  if (options.render !== false) {
    renderAll();
  }
}

async function refreshHealth() {
  try {
    const health = await apiRequest("/api/health");
    setHealth("API OK", health.timestamp);
  } catch (error) {
    setHealth("API indisponible");
    console.error(error);
  }
}

function renderDashboardCards() {
  const { totals } = state.dashboard;

  const cards = [
    {
      label: "Produits",
      value: formatNumber(totals.totalProducts ?? 0, 0),
      meta: "catalogue actif",
    },
    {
      label: "Stock France",
      value: formatNumber(totals.totalFranceStock ?? 0, 0),
      meta: "en attente d'envoi",
    },
    {
      label: "Stock Maroc",
      value: formatNumber(totals.totalMoroccoStock ?? 0, 0),
      meta: "disponible à la vente",
      extra: [
        `Coût stock ${formatCurrency(totals.totalMoroccoStockCostMad ?? 0, "MAD")}`,
        `Vente potentielle ${formatCurrency(
          totals.totalMoroccoStockPotentialRevenueMad ?? 0,
          "MAD",
        )}`,
      ],
    },
    {
      label: "Achats",
      value: formatCurrency(totals.totalPurchaseSpendEur ?? 0, "EUR"),
      meta: "dépense fournisseur",
    },
    {
      label: "CA ventes",
      value: formatCurrency(totals.totalRevenueMad ?? 0, "MAD"),
      meta:
        `${formatNumber(totals.totalOrders ?? 0, 0)} commandes · ` +
        `${formatNumber(totals.totalPaidOrders ?? 0, 0)} payées`,
    },
    {
      label: "Bénéfice",
      value: formatCurrency(totals.totalProfitMad ?? 0, "MAD"),
      meta:
        `${formatNumber(totals.lowStockCount ?? 0, 0)} alertes stock · ` +
        `À encaisser client ${formatCurrency(totals.outstandingRevenueMad ?? 0, "MAD")}`,
    },
  ];

  refs.dashboardCards.innerHTML = cards
    .map(
      (card) => `
        <article class="metric-card">
          <span class="metric-card-label">${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <small>${escapeHtml(card.meta)}</small>
          ${
            card.extra?.length
              ? `
                <div class="metric-card-extra">
                  ${card.extra
                    .map((line) => `<span>${escapeHtml(line)}</span>`)
                    .join("")}
                </div>
              `
              : ""
          }
        </article>
      `,
    )
    .join("");
}

function renderLowStock() {
  const products = state.dashboard.lowStockProducts ?? [];

  if (!products.length) {
    refs.lowStockList.innerHTML = renderEmptyState(
      "Aucun produit n'est sous le seuil de stock faible.",
    );
    return;
  }

  refs.lowStockList.innerHTML = products
    .map(
      (product) => `
        <article class="list-card">
          <div>
            <strong>${escapeHtml(product.name)}</strong>
            <p>${escapeHtml(
              `${formatWeight(product.weightKg)} · coût Maroc ${formatCurrency(
                product.metrics.avgLandedCostMad,
                "MAD",
              )}`,
            )}</p>
          </div>
          <div class="list-card-end">
            <span class="pill pill-error">${formatNumber(product.metrics.moroccoStock, 0)} MA</span>
            <small>Seuil ${formatNumber(product.minStockAlert, 0)}</small>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderActivity() {
  const items = state.dashboard.recentActivity ?? [];

  if (!items.length) {
    refs.activityList.innerHTML = renderEmptyState("Aucune activité pour le moment.");
    return;
  }

  refs.activityList.innerHTML = items
    .map(
      (item) => `
        <article class="list-card">
          <div>
            <span class="activity-type">${escapeHtml(item.type)}</span>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.subtitle)}</p>
          </div>
          <div class="list-card-end">
            <span>${escapeHtml(item.amount)}</span>
            <small>${escapeHtml(formatDate(item.date))}</small>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderPrimaryTableCell(title, subtitle) {
  return `
    <div class="table-primary-cell">
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(subtitle)}</small>
    </div>
  `;
}

function renderTableLines(items, formatter) {
  const preview = items.slice(0, 2).map(formatter).join(" · ");
  const remaining = items.length - Math.min(items.length, 2);
  const label = `${preview}${remaining > 0 ? ` · +${formatNumber(remaining, 0)} autres` : ""}`;
  const fullLabel = items.map(formatter).join(" · ");

  return `
    <div class="table-lines-inline" title="${escapeHtml(fullLabel)}">
      ${escapeHtml(label)}
    </div>
  `;
}

function renderPagination(tableKey, container) {
  const pagination = state.tables[tableKey]?.pagination;

  if (!pagination || pagination.totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <button
      class="ghost-button pagination-button"
      type="button"
      data-table-page="${escapeHtml(tableKey)}"
      data-page="${pagination.page - 1}"
      ${pagination.hasPreviousPage ? "" : "disabled"}
    >
      Précédent
    </button>
    <span class="pagination-label">
      Page ${escapeHtml(formatNumber(pagination.page, 0))} / ${escapeHtml(
        formatNumber(pagination.totalPages, 0),
      )}
    </span>
    <button
      class="ghost-button pagination-button"
      type="button"
      data-table-page="${escapeHtml(tableKey)}"
      data-page="${pagination.page + 1}"
      ${pagination.hasNextPage ? "" : "disabled"}
    >
      Suivant
    </button>
  `;
}

function renderProductsTable() {
  const items = state.tables.products.items ?? [];
  const selectedProductIds = new Set(getSelectedProductsForPurchase().map((product) => product.id));
  const wishlistProductIds = new Set(state.wishlistProductIds ?? []);

  updateProductsCreatePurchaseButton();

  if (!items.length) {
    refs.productsTable.innerHTML = renderEmptyState(
      "Ajoute un premier produit pour démarrer le stock.",
    );
    renderPagination("products", refs.productsPagination);
    return;
  }

  refs.productsTable.innerHTML = `
    <table class="data-table">
      <colgroup>
        <col class="table-col-select" />
        <col class="table-col-photo" />
        <col class="table-col-product" />
        <col class="table-col-compact" />
        <col class="table-col-stock" />
        <col class="table-col-cost" />
        <col class="table-col-cost" />
        <col class="table-col-cost" />
        <col class="table-col-cost" />
        <col class="table-col-profit" />
        <col class="table-col-actions" />
      </colgroup>
      <thead>
        <tr>
          <th></th>
          <th></th>
          <th>Produit</th>
          <th>Poids</th>
          <th>Stock (FR / MA)</th>
          <th>Achat</th>
          <th>Transport</th>
          <th>Coût Maroc</th>
          <th>Vente</th>
          <th>Bénéfice</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (product) => {
              const hasHistory = Boolean(product.hasHistory);
              const isWishlisted = wishlistProductIds.has(product.id);

              return `
              <tr>
                <td>
                  <label class="table-check">
                    <input
                      type="checkbox"
                      data-product-purchase-select="${escapeHtml(product.id)}"
                      ${selectedProductIds.has(product.id) ? "checked" : ""}
                    />
                  </label>
                </td>
                <td>
                  ${renderProductThumb({
                    imageUrl: product.imageUrl,
                    label: product.name,
                    className: "product-thumb-table",
                    fallback: product.name.slice(0, 2).toUpperCase(),
                    button: true,
                  })}
                </td>
                <td>
                  <div class="table-primary-cell table-primary-cell-product">
                    <strong>${escapeHtml(product.name)}</strong>
                    <small>${escapeHtml(
                      `Seuil ${formatNumber(product.minStockAlert, 0)} · vente ${formatCurrency(
                        product.defaultSalePriceMad,
                        "MAD",
                      )}`,
                    )}</small>
                  </div>
                </td>
                <td>${escapeHtml(formatWeight(product.weightKg))}</td>
                <td>
                  <div class="stock-pair">
                    <span class="stock-pill stock-pill-fr">
                      FR ${escapeHtml(formatNumber(product.metrics.franceStock, 0))}
                    </span>
                    <span class="${
                      product.metrics.lowStock
                        ? "stock-pill stock-pill-ma stock-pill-low"
                        : "stock-pill stock-pill-ma"
                    }">
                      MA ${escapeHtml(formatNumber(product.metrics.moroccoStock, 0))}
                    </span>
                  </div>
                </td>
                <td>${escapeHtml(formatCurrency(product.metrics.avgPurchaseCostEur, "EUR"))}</td>
                <td>${escapeHtml(
                  formatCurrency(
                    (product.weightKg || 0) * (state.settings.transportRatePerKgEur || 0),
                    "EUR",
                  ),
                )}</td>
                <td>${escapeHtml(formatCurrency(product.metrics.avgLandedCostMad, "MAD"))}</td>
                <td>${escapeHtml(formatCurrency(product.defaultSalePriceMad, "MAD"))}</td>
                <td>${escapeHtml(formatCurrency(product.metrics.estimatedUnitProfitMad, "MAD"))}</td>
                <td>
                  <div class="table-actions">
                    <button
                      class="ghost-button table-action-button table-icon-favorite ${
                        isWishlisted ? "is-active" : ""
                      }"
                      type="button"
                      data-product-wishlist-add="${escapeHtml(product.id)}"
                      aria-label="${
                        isWishlisted
                          ? `Produit déjà dans la wishlist`
                          : `Ajouter ${escapeHtml(product.name)} à la wishlist`
                      }"
                      title="${
                        isWishlisted ? "Déjà dans la wishlist" : "Ajouter à la wishlist"
                      }"
                      ${isWishlisted ? "disabled" : ""}
                    >
                      ${renderIcon("heart")}
                    </button>
                    <button
                      class="ghost-button table-action-button"
                      type="button"
                      data-product-edit="${escapeHtml(product.id)}"
                      aria-label="Modifier le produit ${escapeHtml(product.name)}"
                      title="Modifier"
                    >
                      ${renderIcon("edit")}
                    </button>
                    <button
                      class="ghost-button table-action-button table-icon-danger"
                      type="button"
                      data-product-delete="${escapeHtml(product.id)}"
                      aria-label="Supprimer le produit ${escapeHtml(product.name)}"
                      title="${
                        hasHistory
                          ? "Impossible de supprimer un produit déjà utilisé."
                          : "Supprimer"
                      }"
                      ${
                        hasHistory ? "disabled" : ""
                      }
                    >
                      ${renderIcon("delete")}
                    </button>
                  </div>
                </td>
              </tr>
            `;
            },
          )
          .join("")}
      </tbody>
    </table>
  `;

  renderPagination("products", refs.productsPagination);
}

function renderWishlistTable() {
  if (!refs.wishlistTable || !refs.wishlistPagination) {
    return;
  }

  const items = state.tables.wishlist.items ?? [];

  if (!items.length) {
    refs.wishlistTable.innerHTML = renderEmptyState(
      "Aucun produit dans la wishlist pour le moment.",
    );
    renderPagination("wishlist", refs.wishlistPagination);
    return;
  }

  refs.wishlistTable.innerHTML = `
    <table class="data-table">
      <colgroup>
        <col class="table-col-photo" />
        <col class="table-col-product" />
        <col class="table-col-small" />
        <col class="table-col-small" />
        <col class="table-col-small" />
        <col class="table-col-medium" />
        <col class="table-col-actions" />
      </colgroup>
      <thead>
        <tr>
          <th></th>
          <th>Produit</th>
          <th>Stock MA</th>
          <th>Vente</th>
          <th>Poids</th>
          <th>Ajouté par</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `
              <tr>
                <td>
                  ${renderProductThumb({
                    imageUrl: item.imageUrl,
                    label: item.name,
                    className: "product-thumb-table",
                    fallback: item.name.slice(0, 2).toUpperCase(),
                    button: true,
                  })}
                </td>
                <td>${renderPrimaryTableCell(
                  item.name,
                  `FR ${formatNumber(item.metrics?.franceStock ?? 0, 0)} · MA ${formatNumber(
                    item.metrics?.moroccoStock ?? 0,
                    0,
                  )}`,
                )}</td>
                <td>${escapeHtml(formatNumber(item.metrics?.moroccoStock ?? 0, 0))}</td>
                <td>${escapeHtml(formatCurrency(item.defaultSalePriceMad ?? 0, "MAD"))}</td>
                <td>${escapeHtml(formatWeight(item.weightKg))}</td>
                <td>${renderPrimaryTableCell(
                  item.createdByName || "Équipe",
                  formatDate(item.createdAt),
                )}</td>
                <td>
                  <div class="table-actions">
                    <button
                      class="ghost-button table-action-button table-icon-danger"
                      type="button"
                      data-wishlist-delete="${escapeHtml(item.id)}"
                      aria-label="Retirer de la wishlist"
                      title="Retirer de la wishlist"
                    >
                      ${renderIcon("delete")}
                    </button>
                  </div>
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;

  renderPagination("wishlist", refs.wishlistPagination);
}

function renderAvailableProducts() {
  if (!refs.availableGrid || !refs.availablePagination) {
    return;
  }

  const items = state.tables.available.items ?? [];

  if (!items.length) {
    refs.availableGrid.innerHTML = renderEmptyState(
      "Aucun produit n'est actuellement disponible à la vente au Maroc.",
    );
    renderPagination("available", refs.availablePagination);
    return;
  }

  refs.availableGrid.innerHTML = `
    <div class="available-products-grid">
      ${items
        .map(
          (product) => `
            <article class="available-stock-card">
              <div class="available-stock-media">
                ${renderProductThumb({
                  imageUrl: product.imageUrl,
                  label: product.name,
                  className: "available-stock-thumb",
                  fallback: product.name.slice(0, 2).toUpperCase(),
                  button: true,
                })}
              </div>
              <div class="available-stock-copy">
                <p class="eyebrow">Disponible Maroc</p>
                <h4>${escapeHtml(product.name)}</h4>
                <div class="available-stock-hero">
                  <strong>${escapeHtml(formatNumber(product.metrics?.moroccoStock ?? 0, 0))}</strong>
                  <span>unités prêtes à vendre</span>
                </div>
                <div class="available-stock-stats">
                  <div>
                    <span>Prix vente</span>
                    <strong>${escapeHtml(formatCurrency(product.defaultSalePriceMad ?? 0, "MAD"))}</strong>
                  </div>
                  <div>
                    <span>Coût Maroc</span>
                    <strong>${escapeHtml(formatCurrency(product.metrics?.avgLandedCostMad ?? 0, "MAD"))}</strong>
                  </div>
                  <div>
                    <span>Valeur stock</span>
                    <strong>${escapeHtml(
                      formatCurrency(
                        (product.metrics?.moroccoStock ?? 0) * (product.metrics?.avgLandedCostMad ?? 0),
                        "MAD",
                      ),
                    )}</strong>
                  </div>
                  <div>
                    <span>CA potentiel</span>
                    <strong>${escapeHtml(
                      formatCurrency(
                        (product.metrics?.moroccoStock ?? 0) * (product.defaultSalePriceMad ?? 0),
                        "MAD",
                      ),
                    )}</strong>
                  </div>
                </div>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;

  renderPagination("available", refs.availablePagination);
}

function renderPurchases() {
  const items = state.tables.purchases.items ?? [];
  const selectedPurchaseIds = new Set(getSelectedPurchasesForShipment().map((purchase) => purchase.id));

  updatePurchasesCreateShipmentButton();

  if (!items.length) {
    refs.purchasesList.innerHTML = renderEmptyState("Aucun achat enregistré.");
    renderPagination("purchases", refs.purchasesPagination);
    return;
  }

  refs.purchasesList.innerHTML = `
    <table class="data-table">
      <colgroup>
        <col class="table-col-select" />
        <col class="table-col-date" />
        <col class="table-col-photo" />
        <col class="table-col-medium" />
        <col class="table-col-medium" />
        <col class="table-col-small" />
        <col class="table-col-small" />
        <col class="table-col-small" />
        <col class="table-col-actions" />
      </colgroup>
      <thead>
        <tr>
          <th></th>
          <th>Date</th>
          <th>Photo</th>
          <th>Fournisseur</th>
          <th>Colis</th>
          <th>Qté</th>
          <th>Poids</th>
          <th>Total</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map((purchase) => {
            const isExpanded = expandedPurchaseIds.has(purchase.id);
            const selectionTitle = purchase.canCreateShipment
              ? "Sélectionner cet achat pour créer un envoi"
              : `Déjà rattaché à un envoi${
                  purchase.linkedShipmentStatus
                    ? ` (${formatShipmentStatusLabel(purchase.linkedShipmentStatus)})`
                    : ""
                }`;

            return `
              <tr>
                <td>
                  <label class="table-check" title="${escapeHtml(selectionTitle)}">
                    <input
                      type="checkbox"
                      data-purchase-shipment-select="${escapeHtml(purchase.id)}"
                      ${selectedPurchaseIds.has(purchase.id) ? "checked" : ""}
                      ${purchase.canCreateShipment ? "" : "disabled"}
                    />
                  </label>
                </td>
                <td>${escapeHtml(formatDate(purchase.orderedAt))}</td>
                <td class="table-media-cell">${renderPurchaseInvoiceThumb(purchase)}</td>
                <td>${renderPrimaryTableCell(
                  purchase.supplierName,
                  purchase.linkedShipmentId
                    ? `${purchase.orderNumber || "Sans référence"} · envoi ${formatShipmentStatusLabel(
                        purchase.linkedShipmentStatus,
                      )}`
                    : purchase.orderNumber || "Sans référence",
                )}</td>
                <td>${renderPurchaseShipmentChip(purchase)}</td>
                <td>${escapeHtml(formatNumber(purchase.totalQty, 0))}</td>
                <td>${escapeHtml(formatWeight(purchase.totalWeightKg))}</td>
                <td>${escapeHtml(formatCurrency(purchase.totalCostEur, "EUR"))}</td>
                <td>
                  <div class="table-actions">
                    <button
                      class="ghost-button table-action-button"
                      type="button"
                      data-purchase-details-toggle="${escapeHtml(purchase.id)}"
                      title="${isExpanded ? "Masquer les articles" : "Afficher les articles"}"
                      aria-label="${isExpanded ? "Masquer les articles" : "Afficher les articles"}"
                      aria-expanded="${isExpanded ? "true" : "false"}"
                      ${isExpanded ? 'data-active="true"' : ""}
                    >
                      ${renderIcon("view")}
                    </button>
                    <button
                      class="ghost-button table-action-button"
                      type="button"
                      data-purchase-edit="${escapeHtml(purchase.id)}"
                      title="Modifier"
                      aria-label="Modifier l'achat"
                    >
                      ${renderIcon("edit")}
                    </button>
                    <button
                      class="ghost-button table-action-button table-icon-danger"
                      type="button"
                      data-purchase-delete="${escapeHtml(purchase.id)}"
                      title="Supprimer"
                      aria-label="Supprimer l'achat"
                    >
                      ${renderIcon("delete")}
                    </button>
                  </div>
                </td>
              </tr>
              ${
                isExpanded
                  ? `
                    <tr class="purchase-detail-row">
                      <td colspan="9">${renderPurchaseItemsDetails(purchase)}</td>
                    </tr>
                  `
                  : ""
              }
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  renderPagination("purchases", refs.purchasesPagination);
}

function renderShipments() {
  const items = state.tables.shipments.items ?? [];

  if (!items.length) {
    refs.shipmentsList.innerHTML = renderEmptyState("Aucun envoi enregistré.");
    renderPagination("shipments", refs.shipmentsPagination);
    return;
  }

  refs.shipmentsList.innerHTML = `
    <table class="data-table">
      <colgroup>
        <col class="table-col-date" />
        <col class="table-col-medium" />
        <col class="table-col-small" />
        <col class="table-col-small" />
        <col class="table-col-small" />
        <col class="table-col-small" />
        <col class="table-col-actions" />
      </colgroup>
      <thead>
        <tr>
          <th>Date</th>
          <th>Statut</th>
          <th>Unités</th>
          <th>Colis</th>
          <th>Coût transport</th>
          <th>Tarif / kg</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (shipment) => `
              <tr>
                <td>${escapeHtml(formatDate(shipment.shippedAt))}</td>
                <td>
                  <button
                    class="status-chip status-chip-button ${escapeHtml(
                      `status-chip-shipment-${shipment.status || "envoye"}`,
                    )}"
                    type="button"
                    data-shipment-status-chip="${escapeHtml(shipment.id)}"
                    title="Cliquer pour changer le statut"
                  >
                    ${escapeHtml(formatShipmentStatusLabel(shipment.status))}
                  </button>
                </td>
                <td>${escapeHtml(formatNumber(shipment.totalQty, 0))}</td>
                <td>${renderPrimaryTableCell(
                  formatWeight(shipment.packageWeightKg),
                  shipment.reference || "Sans référence",
                )}</td>
                <td>${escapeHtml(formatCurrency(shipment.shippingPriceEur, "EUR"))}</td>
                <td>${escapeHtml(`${formatNumber(shipment.packageRatePerKgEur, 2)} EUR/kg`)}</td>
                <td>
                  <div class="table-actions">
                    <button
                      class="ghost-button table-action-button"
                      type="button"
                      data-shipment-view="${escapeHtml(shipment.id)}"
                      title="Voir le détail"
                      aria-label="Voir le détail de l'envoi"
                    >
                      ${renderIcon("view")}
                    </button>
                    <button
                      class="ghost-button table-action-button"
                      type="button"
                      data-shipment-edit="${escapeHtml(shipment.id)}"
                      title="Modifier"
                      aria-label="Modifier l'envoi"
                    >
                      ${renderIcon("edit")}
                    </button>
                    <button
                      class="ghost-button table-action-button table-icon-danger"
                      type="button"
                      data-shipment-delete="${escapeHtml(shipment.id)}"
                      title="Supprimer"
                      aria-label="Supprimer l'envoi"
                    >
                      ${renderIcon("delete")}
                    </button>
                  </div>
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;

  renderPagination("shipments", refs.shipmentsPagination);
}

function renderOrders() {
  const items = state.tables.orders.items ?? [];

  if (!items.length) {
    refs.ordersList.innerHTML = renderEmptyState("Aucune commande client enregistrée.");
    renderPagination("orders", refs.ordersPagination);
    return;
  }

  refs.ordersList.innerHTML = `
    <table class="data-table">
      <colgroup>
        <col class="table-col-date" />
        <col class="table-col-medium" />
        <col class="table-col-small" />
        <col class="table-col-small" />
        <col class="table-col-small" />
        <col class="table-col-small" />
        <col class="table-col-small" />
        <col class="table-col-small" />
        <col class="table-col-actions" />
      </colgroup>
      <thead>
        <tr>
          <th>Date</th>
          <th>Client</th>
          <th>Ville</th>
          <th>Statut</th>
          <th>Paiement</th>
          <th>Total</th>
          <th>Reste</th>
          <th>Bénéfice</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (order) => `
              <tr>
                <td>${escapeHtml(formatDate(order.orderedAt))}</td>
                <td>${renderPrimaryTableCell(
                  order.customer.name,
                  order.customer.phone,
                )}</td>
                <td>${escapeHtml(order.customer.city)}</td>
                <td>
                  <button
                    class="status-chip status-chip-button ${escapeHtml(
                      `status-chip-${order.status}`,
                    )}"
                    type="button"
                    data-order-status-chip="${escapeHtml(order.id)}"
                    title="Cliquer pour changer le statut"
                  >
                    ${escapeHtml(formatOrderStatusLabel(order.status))}
                  </button>
                </td>
                <td>
                  <div class="table-status-stack">
                    <button
                      class="status-chip status-chip-button ${escapeHtml(
                        getPaymentStatusChipClass(order.paymentStatus),
                      )}"
                      type="button"
                      data-order-payment-chip="${escapeHtml(order.id)}"
                      title="Cliquer pour changer le paiement"
                    >
                      ${escapeHtml(formatPaymentStatusLabel(order.paymentStatus))}
                    </button>
                    <small class="table-muted table-muted-wrap">${escapeHtml(
                      order.paymentStatus === "payee"
                        ? "Soldée"
                        : order.advancePaidMad > 0
                        ? `Avance ${formatCurrency(order.advancePaidMad, "MAD")}`
                        : "Aucune avance",
                    )}</small>
                  </div>
                </td>
                <td>${escapeHtml(
                  formatCurrency(order.customerTotalMad ?? order.totalRevenueMad, "MAD"),
                )}</td>
                <td>
                  <div class="table-status-stack">
                    <strong>${escapeHtml(
                      formatCurrency(order.remainingToPayMad ?? order.customerTotalMad ?? 0, "MAD"),
                    )}</strong>
                    <small class="table-muted">${escapeHtml(
                      order.remainingToPayMad > 0 ? "Reste à encaisser" : "Soldée",
                    )}</small>
                  </div>
                </td>
                <td>
                  <div class="table-status-stack">
                    <strong>${escapeHtml(formatCurrency(order.totalProfitMad, "MAD"))}</strong>
                    <small class="table-muted">${escapeHtml(
                      `Marge ${formatNumber(order.marginRate, 2)}%`,
                    )}</small>
                  </div>
                </td>
                <td>
                  <div class="table-actions">
                    <button
                      class="ghost-button table-action-button"
                      type="button"
                      data-order-view="${escapeHtml(order.id)}"
                      aria-label="Voir le détail"
                      title="Voir le détail"
                    >
                      ${renderIcon("view")}
                    </button>
                    <button
                      class="ghost-button table-action-button"
                      type="button"
                      data-order-edit="${escapeHtml(order.id)}"
                      aria-label="Modifier la commande"
                      title="Modifier"
                    >
                      ${renderIcon("edit")}
                    </button>
                    <a
                      class="ghost-button table-action-button"
                      href="/api/orders/${escapeHtml(order.id)}/invoice"
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Ouvrir la facture"
                      title="Ouvrir la facture"
                    >
                      ${renderIcon("invoice")}
                    </a>
                    <a
                      class="ghost-button table-action-button"
                      href="/api/orders/${escapeHtml(order.id)}/invoice?download=1"
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Télécharger la facture"
                      title="Télécharger la facture"
                    >
                      ${renderIcon("download")}
                    </a>
                    <button
                      class="ghost-button table-action-button table-icon-danger"
                      type="button"
                      data-order-delete="${escapeHtml(order.id)}"
                      aria-label="Supprimer la commande"
                      title="Supprimer"
                    >
                      ${renderIcon("delete")}
                    </button>
                  </div>
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;

  renderPagination("orders", refs.ordersPagination);
}

function renderPersonnel() {
  if (!refs.personnelTable) {
    return;
  }

  if (!canManagePersonnel()) {
    refs.personnelTable.innerHTML = renderEmptyState(
      "Seul le compte Mdotnani peut gérer les accès du personnel.",
    );
    refs.personnelPagination.innerHTML = "";
    return;
  }

  const items = state.tables.personnel.items ?? [];

  if (!items.length) {
    refs.personnelTable.innerHTML = renderEmptyState(
      "Aucun autre compte n'est encore créé. Tu peux ajouter Malak ici.",
    );
    renderPagination("personnel", refs.personnelPagination);
    return;
  }

  refs.personnelTable.innerHTML = `
    <table class="data-table personnel-table">
      <colgroup>
        <col class="table-col-medium" />
        <col class="table-col-medium" />
        <col class="table-col-small" />
        <col class="table-col-small" />
      </colgroup>
      <thead>
        <tr>
          <th>Nom</th>
          <th>Identifiant</th>
          <th>Accès</th>
          <th>Créé le</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (user) => `
              <tr>
                <td>${renderPrimaryTableCell(
                  user.displayName,
                  user.canManageUsers ? "Administration du personnel" : "Compte standard",
                )}</td>
                <td>@${escapeHtml(user.login)}</td>
                <td>
                  <span class="status-chip ${
                    user.canManageUsers ? "status-chip-confirmee" : "status-chip-subtle"
                  }">
                    ${escapeHtml(user.canManageUsers ? "Admin" : "Standard")}
                  </span>
                </td>
                <td>${escapeHtml(formatDate(user.createdAt))}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;

  renderPagination("personnel", refs.personnelPagination);
}

function renderBars(container, items, config) {
  if (!items.length) {
    container.innerHTML = renderEmptyState(config.emptyLabel);
    return;
  }

  const maxValue = Math.max(...items.map(config.value));

  container.innerHTML = items
    .map((item) => {
      const currentValue = config.value(item);
      const width = maxValue > 0 ? Math.max((currentValue / maxValue) * 100, 8) : 8;

      return `
        <article class="bar-row">
          <div class="bar-copy">
            <strong>${escapeHtml(config.label(item))}</strong>
            <span>${escapeHtml(config.hint(item))}</span>
          </div>
          <div class="bar-track">
            <span class="bar-fill" style="width:${width}%"></span>
          </div>
          <strong class="bar-value">${escapeHtml(config.format(item))}</strong>
        </article>
      `;
    })
    .join("");
}

function renderStats() {
  renderBars(refs.statsTopSold, state.stats.topSoldProducts ?? [], {
    emptyLabel: "Aucune vente pour le moment.",
    label: (product) => product.name,
    hint: (product) => `${formatNumber(product.metrics.orderCount, 0)} commandes`,
    value: (product) => product.metrics.soldQty,
    format: (product) => `${formatNumber(product.metrics.soldQty, 0)} ventes`,
  });

  renderBars(refs.statsTopProfit, state.stats.topProfitProducts ?? [], {
    emptyLabel: "Aucun bénéfice calculé pour le moment.",
    label: (product) => product.name,
    hint: (product) => `${formatNumber(product.metrics.marginRate, 2)}% de marge`,
    value: (product) => product.metrics.profitMad,
    format: (product) => formatCurrency(product.metrics.profitMad, "MAD"),
  });

  renderBars(refs.statsBestMargin, state.stats.bestMarginProducts ?? [], {
    emptyLabel: "Les marges apparaîtront après les premières ventes.",
    label: (product) => product.name,
    hint: (product) =>
      `Bénéfice unitaire ${formatCurrency(product.metrics.estimatedUnitProfitMad, "MAD")}`,
    value: (product) => product.metrics.marginRate,
    format: (product) => `${formatNumber(product.metrics.marginRate, 2)}%`,
  });

  renderBars(refs.statsTopCities, state.stats.topCities ?? [], {
    emptyLabel: "Aucune ville client pour le moment.",
    label: (entry) => entry.city,
    hint: () => "Commandes clients",
    value: (entry) => entry.count,
    format: (entry) => `${formatNumber(entry.count, 0)} commandes`,
  });
}

function renderEmptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function updateProductImagePreview({
  src = "",
  title = "Aucune photo sélectionnée",
  meta = "Choisis une image depuis ton appareil pour la compresser en WebP.",
  loading = false,
} = {}) {
  refs.productImagePreview.classList.toggle("is-empty", !src && !loading);
  refs.productImagePreview.classList.toggle("is-loading", loading);
  refs.productPreviewImage.hidden = !src;
  refs.productPreviewImage.src = src || "";
  refs.productImageTitle.textContent = title;
  refs.productImageMeta.textContent = meta;
}

function updatePurchaseInvoicePreview({
  src = "",
  title = "Aucune photo sélectionnée",
  meta = "Ajoute la facture Action pour la retrouver ensuite depuis l'icône oeil.",
  loading = false,
} = {}) {
  refs.purchaseInvoicePreview.classList.toggle("is-empty", !src && !loading);
  refs.purchaseInvoicePreview.classList.toggle("is-loading", loading);
  refs.purchaseInvoicePreviewImage.hidden = !src;
  refs.purchaseInvoicePreviewImage.src = src || "";
  refs.purchaseInvoiceTitle.textContent = title;
  refs.purchaseInvoiceMeta.textContent = meta;
}

function resetProductImageSelection() {
  productImageVersion += 1;
  pendingProductImageUpload = null;
  pendingProductImageTask = Promise.resolve(null);
  refs.productImageFile.value = "";
  updateProductImagePreview();
}

function resetPurchaseInvoiceSelection() {
  purchaseInvoiceVersion += 1;
  pendingPurchaseInvoiceUpload = null;
  pendingPurchaseInvoiceTask = Promise.resolve(null);
  refs.purchaseInvoiceFile.value = "";
  updatePurchaseInvoicePreview();
}

function getProductImageDisplayName(productName = "", fallback = "photo-produit.webp") {
  const cleanedName = String(productName ?? "")
    .trim()
    .replace(/\s+/g, " ");

  return cleanedName ? `${cleanedName}.webp` : fallback;
}

function syncPendingProductImageLabel() {
  if (!pendingProductImageUpload?.dataUrl) {
    return;
  }

  refs.productImageTitle.textContent = getProductImageDisplayName(
    refs.productForm.elements.name.value,
    pendingProductImageUpload.fileName,
  );
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Impossible de lire cette image."));
    };

    image.src = objectUrl;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Impossible de convertir l'image compressée."));
    reader.readAsDataURL(blob);
  });
}

async function compressImageUpload(file, fallbackFileName = "image") {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choisis un fichier image valide.");
  }

  const source =
    "createImageBitmap" in window ? await createImageBitmap(file) : await loadImageFromFile(file);
  const maxDimension = 1400;
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const targetWidth = Math.max(1, Math.round(source.width * scale));
  const targetHeight = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    throw new Error("Impossible de préparer la compression de l'image.");
  }

  context.drawImage(source, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (!nextBlob) {
          reject(new Error("La compression WebP a échoué."));
          return;
        }

        resolve(nextBlob);
      },
      "image/webp",
      0.82,
    );
  });

  if (typeof source.close === "function") {
    source.close();
  }

  const dataUrl = await blobToDataUrl(blob);

  return {
    dataUrl,
    fileName: `${file.name.replace(/\.[^.]+$/, "") || fallbackFileName}.webp`,
    width: targetWidth,
    height: targetHeight,
    sizeKb: Math.max(1, Math.round(blob.size / 1024)),
  };
}

function renderAll() {
  syncSelectedProductsForPurchase();
  syncTableFilterForms();
  applyPageLayout();
  renderDashboardCards();
  renderLowStock();
  renderActivity();
  renderProductsTable();
  renderWishlistTable();
  renderAvailableProducts();
  renderPurchases();
  renderShipments();
  renderOrders();
  renderPersonnel();
  renderStats();
  populateSettingsForm();
  syncAllProductSelects();
  ensureStarterRows();
  updateAllSummaries();
  seedStaticDefaults();
}

function renderDetailsItemsTable({ items = [], currency = "MAD", mode = "order" }) {
  return `
    <div class="detail-table-shell">
      <table class="data-table detail-table">
        <thead>
          <tr>
            <th></th>
            <th>Produit</th>
            <th>Qté</th>
            ${
              mode === "shipment"
                ? "<th>Poids</th><th>Coût transport</th><th>Coût total</th>"
                : "<th>Prix unité</th><th>Total ligne</th><th>Coût</th>"
            }
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
                <tr>
                  <td>
                    ${renderProductThumb({
                      imageUrl: item.productImageUrl,
                      label: item.productName,
                      className: "detail-thumb-small",
                      fallback: item.productName.slice(0, 2).toUpperCase(),
                      button: true,
                    })}
                  </td>
                  <td>
                    <div class="table-primary-cell">
                      <strong>${escapeHtml(item.productName)}</strong>
                      <small>${escapeHtml(
                        mode === "shipment"
                          ? `Base ${formatCurrency(item.unitBaseCostEur, "EUR")}`
                          : `Coût ${formatCurrency(item.unitCostMad, "MAD")}`,
                      )}</small>
                    </div>
                  </td>
                  <td>${escapeHtml(formatNumber(item.qty, 0))}</td>
                  ${
                    mode === "shipment"
                      ? `
                        <td>${escapeHtml(formatWeight(item.lineWeightKg))}</td>
                        <td>${escapeHtml(formatCurrency(item.shippingCostEur, "EUR"))}</td>
                        <td>${escapeHtml(formatCurrency(item.totalLandedCostEur, "EUR"))}</td>
                      `
                      : `
                        <td>${escapeHtml(formatCurrency(item.unitSalePriceMad, currency))}</td>
                        <td>${escapeHtml(formatCurrency(item.lineRevenueMad, currency))}</td>
                        <td>${escapeHtml(formatCurrency(item.lineCostMad, currency))}</td>
                      `
                  }
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function populateSettingsForm() {
  refs.companyName.value = state.settings.companyName || "";
  refs.transportRate.value = state.settings.transportRatePerKgEur ?? 1.5;
  refs.eurToMad.value = state.settings.eurToMad ?? 10.8;
  refs.lowStockDefault.value = state.settings.lowStockDefault ?? 2;
}

function seedStaticDefaults() {
  refs.productForm.elements.minStockAlert.value =
    refs.productForm.elements.minStockAlert.value || state.settings.lowStockDefault || 2;
  refs.purchaseForm.elements.orderedAt.value =
    refs.purchaseForm.elements.orderedAt.value || todayInputValue();
  refs.shipmentForm.elements.shippedAt.value =
    refs.shipmentForm.elements.shippedAt.value || todayInputValue();
  refs.orderForm.elements.orderedAt.value =
    refs.orderForm.elements.orderedAt.value || todayInputValue();
  refs.orderForm.elements.paymentStatus.value =
    refs.orderForm.elements.paymentStatus.value || "non_payee";
  refs.orderForm.elements.carrierName.value = refs.orderForm.elements.carrierName.value || "Achraf";
  refs.orderForm.elements.deliveryPriceMad.value =
    refs.orderForm.elements.deliveryPriceMad.value || "0";
}

function normalizeSearchValue(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getProductSearchResults(query = "", selectedId = "") {
  const normalizedQuery = normalizeSearchValue(query);
  const products = [...state.products].sort((left, right) => left.name.localeCompare(right.name, "fr"));
  const selectedProduct = selectedId ? products.find((product) => product.id === selectedId) : null;
  const filteredProducts = normalizedQuery
    ? products.filter((product) => normalizeSearchValue(product.name).includes(normalizedQuery))
    : selectedProduct
      ? [selectedProduct]
      : [];

  if (!selectedProduct) {
    return filteredProducts.slice(0, 8);
  }

  return [
    selectedProduct,
    ...filteredProducts.filter((product) => product.id !== selectedProduct.id),
  ].slice(0, 8);
}

function renderLineItemProductSearchField(productId, mode = "purchase") {
  const product = getProductById(productId);

  return `
    <div class="line-item-product-picker" data-product-picker data-product-picker-mode="${escapeHtml(
      mode,
    )}">
      <input
        class="line-item-product-search-input"
        data-product-search-input
        type="search"
        inputmode="search"
        autocomplete="off"
        spellcheck="false"
        placeholder="Rechercher un produit"
        value="${escapeHtml(product?.name || "")}"
      />
      <input data-field="productId" type="hidden" value="${escapeHtml(productId || "")}" />
      <div class="line-item-product-results" data-product-search-results hidden></div>
    </div>
  `;
}

function renderLineItemProductSearchResults(query = "", selectedId = "", mode = "purchase") {
  const normalizedQuery = normalizeSearchValue(query);

  if (!state.products.length) {
    return `<div class="line-item-product-search-empty">Aucun produit disponible.</div>`;
  }

  if (!normalizedQuery && !selectedId) {
    return `<div class="line-item-product-search-empty">Commence a taper le nom du produit.</div>`;
  }

  const matches = getProductSearchResults(query, selectedId);

  if (!matches.length) {
    return `<div class="line-item-product-search-empty">Aucun produit ne correspond a ta recherche.</div>`;
  }

  return matches
    .map((product) => {
      const meta =
        mode === "order"
          ? `${formatWeight(product.weightKg)} · vente défaut ${formatCurrency(
              product.defaultSalePriceMad,
              "MAD",
            )}`
          : `${formatWeight(product.weightKg)} · achat défaut ${formatCurrency(
              product.defaultPurchasePriceEur,
              "EUR",
            )}`;

      return `
        <button
          class="line-item-product-option ${product.id === selectedId ? "is-selected" : ""}"
          type="button"
          data-product-search-option="${escapeHtml(product.id)}"
        >
          ${renderProductThumb({
            imageUrl: product.imageUrl,
            label: product.name,
            className: "line-item-product-search-thumb",
            fallback: product.name.slice(0, 2).toUpperCase(),
          })}
          <span class="line-item-product-option-copy">
            <strong>${escapeHtml(product.name)}</strong>
            <small>${escapeHtml(meta)}</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function renderLineItemProductPreview(productId, mode = "purchase") {
  const product = getProductById(productId);

  if (!product) {
    return `
      <div class="line-item-product-preview is-empty" data-row-product-preview>
        <div class="line-item-product-copy">
          <strong>Produit non sélectionné</strong>
          <small>Choisis un produit pour afficher sa photo, son poids et son prix.</small>
        </div>
      </div>
    `;
  }

  return `
    <div class="line-item-product-preview" data-row-product-preview>
      ${renderProductThumb({
        imageUrl: product.imageUrl,
        label: product.name,
        className: "line-item-product-thumb",
        fallback: product.name.slice(0, 2).toUpperCase(),
        button: true,
      })}
      <div class="line-item-product-copy">
        <strong>${escapeHtml(product.name)}</strong>
        <small>${escapeHtml(
          mode === "order"
            ? `${formatWeight(product.weightKg)} · vente défaut ${formatCurrency(
                product.defaultSalePriceMad,
                "MAD",
              )}`
            : `${formatWeight(product.weightKg)} · achat défaut ${formatCurrency(
                product.defaultPurchasePriceEur,
                "EUR",
              )}`,
        )}</small>
      </div>
    </div>
  `;
}

function createRowTemplate(type, values = {}) {
  if (type === "purchase") {
    if (values.editableProduct) {
      return `
        <div class="line-item-row is-editable-product" data-type="purchase">
          <div class="field grow">
            <span>Produit</span>
            ${renderLineItemProductPreview(values.productId, "purchase")}
            ${renderLineItemProductSearchField(values.productId, "purchase")}
          </div>
          <div class="field compact">
            <span>Quantité</span>
            <input data-field="qty" type="number" min="1" step="1" value="${escapeHtml(
              values.qty || 1,
            )}" />
          </div>
          <div class="field compact">
            <span>Prix d'achat EUR</span>
            <input
              data-field="unitPurchasePriceEur"
              type="number"
              min="0"
              step="0.01"
              value="${escapeHtml(values.unitPurchasePriceEur || "")}"
            />
            <small class="row-inline-total" data-row-inline-total></small>
          </div>
          <button class="ghost-button row-remove" type="button" data-remove-row>
            ${renderIcon("delete")}
          </button>
          <p class="row-hint" data-row-hint></p>
        </div>
      `;
    }

    return `
      <div class="line-item-row" data-type="purchase">
        <div class="field grow">
          <span>Produit</span>
          ${renderLineItemProductPreview(values.productId, "purchase")}
          <input data-field="productId" type="hidden" value="${escapeHtml(values.productId || "")}" />
        </div>
        <div class="field compact">
          <span>Quantité</span>
          <input data-field="qty" type="number" min="1" step="1" value="${escapeHtml(
            values.qty || 1,
          )}" ${values.readOnly ? "readonly" : ""} />
        </div>
        <div class="field compact">
          <span>Prix d'achat EUR</span>
          <input
            data-field="unitPurchasePriceEur"
            type="number"
            min="0"
            step="0.01"
            value="${escapeHtml(values.unitPurchasePriceEur || "")}"
            ${values.readOnly ? "readonly" : ""}
          />
          <small class="row-inline-total" data-row-inline-total></small>
        </div>
        <p class="row-hint" data-row-hint></p>
      </div>
    `;
  }

  if (type === "shipment") {
    if (values.lockedProduct) {
      return `
        <div class="line-item-row is-locked-product" data-type="shipment">
          <div class="field grow">
            <span>Produit</span>
            ${renderLineItemProductPreview(values.productId, "shipment")}
            <input
              data-field="productId"
              type="hidden"
              value="${escapeHtml(values.productId || "")}"
            />
          </div>
          <div class="field compact">
            <span>Quantité</span>
            <input
              data-field="qty"
              type="number"
              min="1"
              step="1"
              readonly
              value="${escapeHtml(values.qty || 1)}"
            />
          </div>
          <p class="row-hint" data-row-hint></p>
        </div>
      `;
    }

    return `
      <div class="line-item-row" data-type="shipment">
        <div class="field grow">
          <span>Produit</span>
          ${renderLineItemProductPreview(values.productId, "shipment")}
          ${renderLineItemProductSearchField(values.productId, "shipment")}
        </div>
        <div class="field compact">
          <span>Quantité</span>
          <input data-field="qty" type="number" min="1" step="1" value="${escapeHtml(
            values.qty || 1,
          )}" />
        </div>
        <button class="ghost-button row-remove" type="button" data-remove-row>Retirer</button>
        <p class="row-hint" data-row-hint></p>
      </div>
    `;
  }

  if (type === "order" && values.lockedProduct) {
    return `
      <div class="line-item-row is-locked-product" data-type="order">
        <div class="field grow">
          <span>Produit</span>
          ${renderLineItemProductPreview(values.productId, "order")}
          <input data-field="productId" type="hidden" value="${escapeHtml(values.productId || "")}" />
        </div>
        <div class="field compact">
          <span>Quantité</span>
          <input data-field="qty" type="number" min="1" step="1" value="${escapeHtml(
            values.qty || 1,
          )}" />
        </div>
        <div class="field compact">
          <span>Prix de vente MAD</span>
          <input
            data-field="unitSalePriceMad"
            type="number"
            min="0"
            step="0.01"
            value="${escapeHtml(values.unitSalePriceMad || "")}"
          />
        </div>
        <p class="row-hint" data-row-hint></p>
      </div>
    `;
  }

  return `
    <div class="line-item-row" data-type="order">
      <div class="field grow">
        <span>Produit</span>
        ${renderLineItemProductPreview(values.productId, "order")}
        ${renderLineItemProductSearchField(values.productId, "order")}
      </div>
      <div class="field compact">
        <span>Quantité</span>
        <input data-field="qty" type="number" min="1" step="1" value="${escapeHtml(
          values.qty || 1,
        )}" />
      </div>
      <div class="field compact">
        <span>Prix de vente MAD</span>
        <input
          data-field="unitSalePriceMad"
          type="number"
          min="0"
          step="0.01"
          value="${escapeHtml(values.unitSalePriceMad || "")}"
        />
      </div>
      <button class="ghost-button row-remove" type="button" data-remove-row>Retirer</button>
      <p class="row-hint" data-row-hint></p>
    </div>
  `;
}

function addLineItemRow(type, values = {}, options = {}) {
  const container = formTypes[type].container;
  const rowValues =
    type === "purchase" && activePurchaseItemsEditable
      ? { editableProduct: true, ...values }
      : values;
  container.insertAdjacentHTML(options.prepend ? "afterbegin" : "beforeend", createRowTemplate(type, rowValues));
  updateRowsForType(type);
}

function ensureStarterRows() {
  Object.keys(formTypes).forEach((type) => {
    const container = formTypes[type].container;

    if (!container.children.length) {
      addLineItemRow(type);
    }
  });
}

function syncAllProductSelects() {
  Object.keys(formTypes).forEach(updateRowsForType);
}

function updateRowsForType(type) {
  const container = formTypes[type].container;

  [...container.querySelectorAll(".line-item-row")].forEach((row) => {
    const productField = row.querySelector('[data-field="productId"]');
    const selectedId = productField?.value || "";
    const productPicker = row.querySelector("[data-product-picker]");
    const productSearchInput = row.querySelector("[data-product-search-input]");
    const productSearchResults = row.querySelector("[data-product-search-results]");

    const preview = row.querySelector("[data-row-product-preview]");

    if (preview) {
      preview.outerHTML = renderLineItemProductPreview(
        selectedId,
        row.dataset.type === "order"
          ? "order"
          : row.dataset.type === "shipment"
            ? "shipment"
            : "purchase",
      );
    }

    if (productPicker && productSearchInput) {
      const product = getProductById(selectedId);
      productSearchInput.value = product?.name || "";

      if (productSearchResults && !productSearchResults.hidden) {
        productSearchResults.innerHTML = renderLineItemProductSearchResults(
          productSearchInput.value,
          selectedId,
          productPicker.dataset.productPickerMode || type,
        );
      }
    }

    updateRowHint(row, type);
  });
}

function closeProductSearchResults(scope = document) {
  scope.querySelectorAll("[data-product-search-results]").forEach((results) => {
    results.hidden = true;
  });

  scope.querySelectorAll("[data-product-picker]").forEach((picker) => {
    picker.classList.remove("is-open");
  });
}

function openProductSearchResults(row, query = null) {
  const picker = row.querySelector("[data-product-picker]");
  const input = row.querySelector("[data-product-search-input]");
  const productField = row.querySelector('[data-field="productId"]');
  const results = row.querySelector("[data-product-search-results]");

  if (!picker || !input || !productField || !results) {
    return;
  }

  results.innerHTML = renderLineItemProductSearchResults(
    query ?? input.value,
    productField.value || "",
    picker.dataset.productPickerMode || row.dataset.type || "purchase",
  );
  results.hidden = false;
  picker.classList.add("is-open");
}

function applyProductSearchSelection(row, productId) {
  const productField = row.querySelector('[data-field="productId"]');
  const input = row.querySelector("[data-product-search-input]");
  const product = getProductById(productId);
  const salePriceField = row.querySelector('[data-field="unitSalePriceMad"]');
  const purchasePriceField = row.querySelector('[data-field="unitPurchasePriceEur"]');

  if (!productField || !input || !product) {
    return;
  }

  productField.value = product.id;
  input.value = product.name;

  if (salePriceField) {
    salePriceField.value = formatInputAmount(product.defaultSalePriceMad || 0);
  }

  if (purchasePriceField) {
    purchasePriceField.value = formatInputAmount(product.defaultPurchasePriceEur || 0);
  }

  closeProductSearchResults(row);
  updateRowsForType(row.dataset.type);
  updateAllSummaries();
}

function getRowValues(row) {
  const values = {};

  row.querySelectorAll("[data-field]").forEach((field) => {
    values[field.dataset.field] = field.value;
  });

  return values;
}

function updateRowHint(row, type) {
  const hint = row.querySelector("[data-row-hint]");
  const inlineTotal = row.querySelector("[data-row-inline-total]");
  const values = getRowValues(row);
  const product = getProductById(values.productId);
  const qty = Number(values.qty || 0);
  const unitPrice = Number(values.unitPurchasePriceEur || product?.defaultPurchasePriceEur || 0);

  if (inlineTotal) {
    inlineTotal.textContent =
      qty > 0 || unitPrice > 0 ? `Total ligne ${formatCurrency(qty * unitPrice, "EUR")}` : "";
  }

  if (!product) {
    hint.textContent = "Choisis un produit pour voir le coût, le poids et le stock.";
    return;
  }

  if (type === "purchase") {
    hint.textContent =
      `Poids ligne ${formatWeight(product.weightKg * qty)} · ` +
      `FR ${formatNumber(product.metrics.franceStock, 0)} · ` +
      `prix par défaut ${formatCurrency(product.defaultPurchasePriceEur, "EUR")}`;
    return;
  }

  if (type === "shipment") {
    hint.textContent =
      `Poids ligne ${formatWeight(product.weightKg * qty)} · ` +
      `stock FR ${formatNumber(product.metrics.franceStock, 0)} · ` +
      `coût d'achat moyen ${formatCurrency(product.metrics.avgPurchaseCostEur, "EUR")}`;
    return;
  }

  const salePrice = Number(values.unitSalePriceMad || product.defaultSalePriceMad || 0);
  const estimatedRevenue = salePrice * qty;
  const estimatedCost = (product.metrics.avgLandedCostMad || 0) * qty;
  const estimatedProfit = estimatedRevenue - estimatedCost;

  hint.textContent =
    `stock MA ${formatNumber(product.metrics.moroccoStock, 0)} · ` +
    `coût moyen ${formatCurrency(product.metrics.avgLandedCostMad, "MAD")} · ` +
    `bénéfice estimé ${formatCurrency(estimatedProfit, "MAD")}`;
}

function collectRows(type) {
  return [...formTypes[type].container.querySelectorAll(".line-item-row")];
}

function ensureUniqueSelectedProducts(rows) {
  const seen = new Set();

  for (const row of rows) {
    const productId = row.querySelector('[data-field="productId"]').value;

    if (!productId) {
      throw new Error("Chaque ligne doit contenir un produit.");
    }

    if (seen.has(productId)) {
      throw new Error("Sélectionne chaque produit une seule fois par formulaire.");
    }

    seen.add(productId);
  }
}

function updatePurchaseSummary() {
  const rows = collectRows("purchase");
  let totalQty = 0;
  let totalCostEur = 0;
  let totalWeightKg = 0;

  rows.forEach((row) => {
    const values = getRowValues(row);
    const product = getProductById(values.productId);
    const qty = Number(values.qty || 0);
    const unitPrice = Number(values.unitPurchasePriceEur || product?.defaultPurchasePriceEur || 0);

    totalQty += qty;
    totalCostEur += qty * unitPrice;
    totalWeightKg += qty * (product?.weightKg || 0);
  });

  refs.purchaseSummary.innerHTML = `
    <div class="summary-line"><span>Total unités</span><strong>${escapeHtml(
      formatNumber(totalQty, 0),
    )}</strong></div>
    <div class="summary-line"><span>Poids achat</span><strong>${escapeHtml(
      formatWeight(totalWeightKg),
    )}</strong></div>
    <div class="summary-line"><span>Total achat</span><strong>${escapeHtml(
      formatCurrency(totalCostEur, "EUR"),
    )}</strong></div>
  `;
}

function updateShipmentSummary() {
  const rows = collectRows("shipment");
  const packageWeightKg = Number(refs.shipmentForm.elements.packageWeightKg.value || 0);
  const shippingPriceEur = Number(refs.shipmentForm.elements.shippingPriceEur.value || 0);
  let totalQty = 0;
  let totalItemWeightKg = 0;

  rows.forEach((row) => {
    const values = getRowValues(row);
    const product = getProductById(values.productId);
    const qty = Number(values.qty || 0);

    totalQty += qty;
    totalItemWeightKg += qty * (product?.weightKg || 0);
  });

  const rateFromPackage = packageWeightKg > 0 ? shippingPriceEur / packageWeightKg : 0;
  const warning =
    packageWeightKg > 0 && totalItemWeightKg > packageWeightKg
      ? `<p class="summary-warning">Le poids des articles dépasse le poids du colis saisi.</p>`
      : "";

  refs.shipmentSummary.innerHTML = `
    <div class="summary-line"><span>Total unités</span><strong>${escapeHtml(
      formatNumber(totalQty, 0),
    )}</strong></div>
    <div class="summary-line"><span>Poids articles</span><strong>${escapeHtml(
      formatWeight(totalItemWeightKg),
    )}</strong></div>
    <div class="summary-line"><span>Poids colis</span><strong>${escapeHtml(
      formatWeight(packageWeightKg),
    )}</strong></div>
    <div class="summary-line"><span>Tarif réel</span><strong>${escapeHtml(
      `${formatNumber(rateFromPackage, 2)} EUR/kg`,
    )}</strong></div>
    <div class="summary-line"><span>Transport total</span><strong>${escapeHtml(
      formatCurrency(shippingPriceEur, "EUR"),
    )}</strong></div>
    ${warning}
  `;
}

function calculateOrderFormCustomerTotalMad() {
  const rows = collectRows("order");
  const itemsRevenueMad = rows.reduce((total, row) => {
    const values = getRowValues(row);
    const product = getProductById(values.productId);
    const qty = Number(values.qty || 0);
    const salePrice = Number(values.unitSalePriceMad || product?.defaultSalePriceMad || 0);

    return total + qty * salePrice;
  }, 0);

  const deliveryPriceMad = Number(refs.orderForm.elements.deliveryPriceMad.value || 0);
  return itemsRevenueMad + deliveryPriceMad;
}

function syncOrderPaymentFields(trigger = "") {
  const paymentField = refs.orderForm.elements.paymentStatus;
  const advanceField = refs.orderForm.elements.advancePaidMad;
  const customerTotalMad = calculateOrderFormCustomerTotalMad();
  let advancePaidMad = Number(advanceField.value || 0);

  if (!Number.isFinite(advancePaidMad) || advancePaidMad < 0) {
    advancePaidMad = 0;
  }

  if (trigger === "paymentStatus") {
    if (paymentField.value === "non_payee") {
      advanceField.value = "0";
      return;
    }

    if (paymentField.value === "payee") {
      advanceField.value = formatInputAmount(customerTotalMad);
    }

    return;
  }

  advancePaidMad = Math.min(advancePaidMad, customerTotalMad);

  if (advancePaidMad <= 0) {
    paymentField.value = "non_payee";
    advanceField.value = "0";
    return;
  }

  if (customerTotalMad > 0 && advancePaidMad >= customerTotalMad) {
    paymentField.value = "payee";
    advanceField.value = formatInputAmount(customerTotalMad);
    return;
  }

  paymentField.value = "avance";
  advanceField.value = formatInputAmount(advancePaidMad);
}

function updateOrderSummary() {
  const rows = collectRows("order");
  let totalQty = 0;
  let itemsRevenueMad = 0;
  let costMad = 0;

  rows.forEach((row) => {
    const values = getRowValues(row);
    const product = getProductById(values.productId);
    const qty = Number(values.qty || 0);
    const salePrice = Number(values.unitSalePriceMad || product?.defaultSalePriceMad || 0);

    totalQty += qty;
    itemsRevenueMad += qty * salePrice;
    costMad += qty * (product?.metrics.avgLandedCostMad || 0);
  });

  const deliveryPriceMad = Number(refs.orderForm.elements.deliveryPriceMad.value || 0);
  const customerTotalMad = itemsRevenueMad + deliveryPriceMad;
  const selectedPaymentStatus = refs.orderForm.elements.paymentStatus.value || "non_payee";
  let advancePaidMad = Number(refs.orderForm.elements.advancePaidMad.value || 0);

  if (!Number.isFinite(advancePaidMad) || advancePaidMad < 0) {
    advancePaidMad = 0;
  }

  if (selectedPaymentStatus === "payee") {
    advancePaidMad = customerTotalMad;
    refs.orderForm.elements.advancePaidMad.value = formatInputAmount(advancePaidMad);
  } else if (selectedPaymentStatus === "non_payee") {
    advancePaidMad = 0;
    refs.orderForm.elements.advancePaidMad.value = "0";
  } else {
    advancePaidMad = Math.min(advancePaidMad, customerTotalMad);

    if (refs.orderForm.elements.advancePaidMad.value !== "") {
      refs.orderForm.elements.advancePaidMad.value = formatInputAmount(advancePaidMad);
    }
  }

  const remainingToPayMad = Math.max(customerTotalMad - advancePaidMad, 0);
  const profitMad = itemsRevenueMad - costMad;
  const marginRate = itemsRevenueMad > 0 ? (profitMad / itemsRevenueMad) * 100 : 0;

  refs.orderSummary.innerHTML = `
    <div class="summary-line"><span>Total unités</span><strong>${escapeHtml(
      formatNumber(totalQty, 0),
    )}</strong></div>
    <div class="summary-line"><span>Ventes produits</span><strong>${escapeHtml(
      formatCurrency(itemsRevenueMad, "MAD"),
    )}</strong></div>
    <div class="summary-line"><span>Livraison client</span><strong>${escapeHtml(
      formatCurrency(deliveryPriceMad, "MAD"),
    )}</strong></div>
    <div class="summary-line"><span>Total client</span><strong>${escapeHtml(
      formatCurrency(customerTotalMad, "MAD"),
    )}</strong></div>
    <div class="summary-line"><span>Avance reçue</span><strong>${escapeHtml(
      formatCurrency(advancePaidMad, "MAD"),
    )}</strong></div>
    <div class="summary-line"><span>Reste à payer</span><strong>${escapeHtml(
      formatCurrency(remainingToPayMad, "MAD"),
    )}</strong></div>
    <div class="summary-line"><span>Coût estimé</span><strong>${escapeHtml(
      formatCurrency(costMad, "MAD"),
    )}</strong></div>
    <div class="summary-line"><span>Bénéfice estimé</span><strong>${escapeHtml(
      formatCurrency(profitMad, "MAD"),
    )}</strong></div>
    <div class="summary-line"><span>Marge</span><strong>${escapeHtml(
      `${formatNumber(marginRate, 2)}%`,
    )}</strong></div>
  `;
}

function updateAllSummaries() {
  updatePurchaseSummary();
  updateShipmentSummary();
  updateOrderSummary();
}

function resetDynamicForm(form, type) {
  form.reset();
  activePurchaseEditId = type === "purchase" ? "" : activePurchaseEditId;
  activeShipmentEditId = type === "shipment" ? "" : activeShipmentEditId;
  activeOrderEditId = type === "order" ? "" : activeOrderEditId;

  if (type === "purchase") {
    setPurchaseFormMode();
    setPurchaseItemsEditMode(false);
    form.elements.supplierName.value = "Action";
    form.elements.orderedAt.value = todayInputValue();
    resetPurchaseInvoiceSelection();
  }

  if (type === "shipment") {
    setShipmentFormMode();
    setShipmentSourceSelectionMode([]);
    form.elements.shippedAt.value = todayInputValue();
    form.elements.status.value = "achete";
  }

  if (type === "order") {
    setOrderFormMode();
    form.elements.orderedAt.value = todayInputValue();
    form.elements.status.value = "confirmee";
    form.elements.paymentStatus.value = "non_payee";
    form.elements.carrierName.value = "Achraf";
    form.elements.deliveryPriceMad.value = "0";
    form.elements.advancePaidMad.value = "0";
    if (refs.orderAddRowButton) {
      refs.orderAddRowButton.hidden = false;
    }
  }

  const container = formTypes[type].container;
  container.innerHTML = "";

  if (type === "purchase") {
    prefillPurchaseRows(getSelectedProductsForPurchase().map((product) => product.id));
    return;
  }

  addLineItemRow(type);
  updateAllSummaries();
}

function prefillPurchaseRows(productIds = []) {
  const container = formTypes.purchase.container;
  const uniqueProductIds = [...new Set(productIds)].filter((productId) => getProductById(productId));

  container.innerHTML = "";

  uniqueProductIds.forEach((productId) => {
    const product = getProductById(productId);

    addLineItemRow("purchase", {
      productId,
      qty: 1,
      unitPurchasePriceEur: product?.defaultPurchasePriceEur ?? "",
    });
  });

  updateAllSummaries();
}

function prefillOrderRows(productIds = []) {
  const container = formTypes.order.container;
  const uniqueProductIds = [...new Set(productIds)].filter((productId) => getProductById(productId));

  container.innerHTML = "";

  uniqueProductIds.forEach((productId) => {
    const product = getProductById(productId);

    addLineItemRow("order", {
      productId,
      qty: 1,
      unitSalePriceMad: product?.defaultSalePriceMad ?? "",
      lockedProduct: true,
    });
  });

  updateAllSummaries();
}

function prefillShipmentRowsFromPurchases(purchases = []) {
  const container = formTypes.shipment.container;
  const aggregatedItems = new Map();

  container.innerHTML = "";

  purchases.forEach((purchase) => {
    (purchase.items ?? []).forEach((item) => {
      const existingItem = aggregatedItems.get(item.productId);

      if (existingItem) {
        existingItem.qty += Number(item.qty || 0);
        return;
      }

      aggregatedItems.set(item.productId, {
        productId: item.productId,
        qty: Number(item.qty || 0),
      });
    });
  });

  [...aggregatedItems.values()].forEach((item) => {
    addLineItemRow("shipment", {
      productId: item.productId,
      qty: item.qty,
      lockedProduct: true,
    });
  });

  setShipmentSourceSelectionMode(purchases.map((purchase) => purchase.id));
  updateAllSummaries();
}

function resetFormForType(formType) {
  if (formType === "product") {
    resetProductForm();
    return;
  }

  if (formType === "purchase") {
    resetDynamicForm(refs.purchaseForm, "purchase");
    return;
  }

  if (formType === "shipment") {
    resetDynamicForm(refs.shipmentForm, "shipment");
    return;
  }

  if (formType === "order") {
    resetDynamicForm(refs.orderForm, "order");
  }
}

function resetFormForModal(modalId) {
  const formType = MODAL_TO_FORM_TYPE[modalId];

  if (formType) {
    resetFormForType(formType);
  }
}

function openPurchaseFromSelectedProducts() {
  const selectedProducts = getSelectedProductsForPurchase();

  if (!selectedProducts.length) {
    showFlash("Sélectionne au moins un produit pour préparer un achat.", "error");
    return;
  }

  closeQuickCreateMenu();
  setModalFormError("purchase");
  resetDynamicForm(refs.purchaseForm, "purchase");
  prefillPurchaseRows(selectedProducts.map((product) => product.id));
  navigateToPath("/purchases");
  openModal("purchase-modal");
}

function openOrderFromSelectedProducts() {
  const selectedProducts = getSelectedProductsForPurchase();

  if (!selectedProducts.length) {
    showFlash("Sélectionne au moins un produit pour préparer une commande.", "error");
    return;
  }

  closeQuickCreateMenu();
  setModalFormError("order");
  resetDynamicForm(refs.orderForm, "order");
  if (refs.orderAddRowButton) {
    refs.orderAddRowButton.hidden = true;
  }
  prefillOrderRows(selectedProducts.map((product) => product.id));
  navigateToPath("/orders");
  openModal("order-modal");
}

function openShipmentFromSelectedPurchases() {
  const selectedPurchases = getSelectedPurchasesForShipment();

  if (!selectedPurchases.length) {
    showFlash("Sélectionne au moins un achat pour préparer un envoi.", "error");
    return;
  }

  closeQuickCreateMenu();
  setModalFormError("shipment");
  resetDynamicForm(refs.shipmentForm, "shipment");
  prefillShipmentRowsFromPurchases(selectedPurchases);
  navigateToPath("/shipments");
  openModal("shipment-modal");
}

function openCreateFlow(button) {
  const modalId = button.dataset.openModal;
  const targetPath = button.dataset.modalPath;
  const formType = button.dataset.formType;

  closeQuickCreateMenu();

  if (formType === "purchase") {
    navigateToPath("/products");
    openPurchaseFromSelectedProducts();
    return;
  }

  if (formType === "order" && getSelectedProductsForPurchase().length) {
    navigateToPath("/products");
    openOrderFromSelectedProducts();
    return;
  }

  if (formType === "shipment") {
    navigateToPath("/purchases");
    openShipmentFromSelectedPurchases();
    return;
  }

  if (formType) {
    resetFormForType(formType);
  }

  if (targetPath) {
    navigateToPath(targetPath);
  }

  openModal(modalId);
}

function fillDynamicForm(form, type, record) {
  resetDynamicForm(form, type);

  if (type === "purchase") {
    setPurchaseFormMode(record);
    form.elements.purchaseId.value = record.id;
    form.elements.supplierName.value = record.supplierName || "Action";
    form.elements.orderedAt.value = record.orderedAt.slice(0, 10);
    form.elements.orderNumber.value = record.orderNumber || "";
    form.elements.notes.value = record.notes || "";
    purchaseInvoiceVersion += 1;
    pendingPurchaseInvoiceUpload = null;
    pendingPurchaseInvoiceTask = Promise.resolve(null);
    refs.purchaseInvoiceFile.value = "";

    if (record.invoiceImageUrl) {
      updatePurchaseInvoicePreview({
        src: record.invoiceImageUrl,
        title: record.orderNumber || "Facture Action",
        meta: "Photo actuelle. Choisis une nouvelle image pour la remplacer.",
      });
    } else {
      updatePurchaseInvoicePreview();
    }
  }

  if (type === "shipment") {
    setShipmentFormMode(record);
    setShipmentSourceSelectionMode(record.sourcePurchaseIds || []);
    form.elements.shipmentId.value = record.id;
    form.elements.shippedAt.value = record.shippedAt.slice(0, 10);
    form.elements.status.value = record.status || "envoye";
    form.elements.packageWeightKg.value = record.packageWeightKg ?? "";
    form.elements.shippingPriceEur.value = record.shippingPriceEur ?? "";
    form.elements.reference.value = record.reference || "";
    form.elements.notes.value = record.notes || "";
  }

  if (type === "order") {
    setOrderFormMode(record);
    form.elements.orderId.value = record.id;
    form.elements.orderedAt.value = record.orderedAt.slice(0, 10);
    form.elements.status.value = record.status || "confirmee";
    form.elements.paymentStatus.value = record.paymentStatus || "non_payee";
    form.elements.carrierName.value = record.carrierName || "Achraf";
    form.elements.deliveryPriceMad.value = record.deliveryPriceMad ?? 0;
    form.elements.advancePaidMad.value = record.advancePaidMad ?? 0;
    form.elements.customerName.value = record.customer.name || "";
    form.elements.customerPhone.value = record.customer.phone || "";
    form.elements.customerCity.value = record.customer.city || "";
    form.elements.customerAddress.value = record.customer.address || "";
    form.elements.notes.value = record.notes || "";
  }

  const items = type === "purchase" ? record.items : record.items;
  const container = formTypes[type].container;
  container.innerHTML = "";

  items.forEach((item) => {
    addLineItemRow(type, {
      productId: item.productId,
      qty: item.qty,
      readOnly: type === "purchase" && Boolean(record?.id) && !record.canCreateShipment,
      lockedProduct: type === "shipment" && activeShipmentSourcePurchaseIds.length > 0,
      unitPurchasePriceEur: item.unitPurchasePriceEur,
      unitSalePriceMad: item.unitSalePriceMad,
    });
  });

  updateRowsForType(type);
  updateAllSummaries();
}

async function handleProductImageChange(event) {
  const file = event.target.files?.[0];
  const version = ++productImageVersion;

  if (!file) {
    resetProductImageSelection();
    return;
  }

  updateProductImagePreview({
    title: file.name,
    meta: "Compression WebP en cours...",
    loading: true,
  });

  const task = compressImageUpload(file, "product");
  pendingProductImageTask = task;

  try {
    const upload = await task;

    if (version !== productImageVersion) {
      return;
    }

    const namedUpload = {
      ...upload,
      fileName: getProductImageDisplayName(refs.productForm.elements.name.value, upload.fileName),
    };

    pendingProductImageUpload = namedUpload;
    pendingProductImageTask = Promise.resolve(namedUpload);
    updateProductImagePreview({
      src: namedUpload.dataUrl,
      title: namedUpload.fileName,
      meta: `${namedUpload.width} x ${namedUpload.height} px · ${namedUpload.sizeKb} Ko · WebP`,
    });
  } catch (error) {
    if (version !== productImageVersion) {
      return;
    }

    pendingProductImageUpload = null;
    pendingProductImageTask = Promise.resolve(null);
    refs.productImageFile.value = "";
    updateProductImagePreview();
    setModalFormError("product", error.message);
  }
}

async function handlePurchaseInvoiceChange(event) {
  const file = event.target.files?.[0];
  const version = ++purchaseInvoiceVersion;

  if (!file) {
    pendingPurchaseInvoiceUpload = null;
    pendingPurchaseInvoiceTask = Promise.resolve(null);
    updatePurchaseInvoicePreview();
    return;
  }

  setModalFormError("purchase");
  updatePurchaseInvoicePreview({
    title: file.name,
    meta: "Compression en cours...",
    loading: true,
  });

  const task = compressImageUpload(file, "facture-action");
  pendingPurchaseInvoiceTask = task;

  try {
    const upload = await task;

    if (version !== purchaseInvoiceVersion) {
      return;
    }

    pendingPurchaseInvoiceUpload = upload;
    pendingPurchaseInvoiceTask = Promise.resolve(upload);
    updatePurchaseInvoicePreview({
      src: upload.dataUrl,
      title: upload.fileName,
      meta: `${upload.width} x ${upload.height} px · ${upload.sizeKb} Ko · WebP`,
    });
  } catch (error) {
    if (version !== purchaseInvoiceVersion) {
      return;
    }

    pendingPurchaseInvoiceUpload = null;
    pendingPurchaseInvoiceTask = Promise.resolve(null);
    refs.purchaseInvoiceFile.value = "";
    updatePurchaseInvoicePreview({
      title: "Aucune photo sélectionnée",
      meta: error.message,
    });
    setModalFormError("purchase", error.message);
  }
}

function setSubmitting(form, isSubmitting) {
  form.querySelectorAll("button, input, textarea, select").forEach((field) => {
    if (field.dataset.keepEnabled === "true") {
      return;
    }

    field.disabled = isSubmitting;
  });
}

async function handleSettingsSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    setSubmitting(form, true);
    const payload = {
      companyName: form.elements.companyName.value,
      transportRatePerKgEur: Number(form.elements.transportRatePerKgEur.value),
      eurToMad: Number(form.elements.eurToMad.value),
      lowStockDefault: Number(form.elements.lowStockDefault.value),
    };
    const result = await apiRequest("/api/settings", {
      method: "PUT",
      body: payload,
    });
    Object.assign(state, result.appState);
    renderAll();
    showFlash(result.message);
  } catch (error) {
    showFlash(error.message, "error");
  } finally {
    setSubmitting(form, false);
  }
}

function clearProtectedState() {
  selectedProductIdsForPurchase.clear();
  selectedPurchaseIdsForShipment.clear();
  expandedPurchaseIds.clear();
  activeShipmentSourcePurchaseIds = [];
  state.settings = {};
  state.products = [];
  state.purchases = [];
  state.shipments = [];
  state.orders = [];
  state.dashboard = {
    totals: {},
    lowStockProducts: [],
    recentActivity: [],
  };
  state.stats = {
    topSoldProducts: [],
    topProfitProducts: [],
    bestMarginProducts: [],
    topCities: [],
  };
  state.tables = {
    products: { items: [], pagination: null },
    purchases: { items: [], pagination: null },
    shipments: { items: [], pagination: null },
    orders: { items: [], pagination: null },
    personnel: { items: [], pagination: null },
  };
  resetAllTableFilters();
}

async function loadAuthenticatedApp() {
  await Promise.all([loadAppState(), refreshHealth()]);
  await ensurePageTableData({ force: true, render: false });
  renderAll();
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    setModalFormError("login");
    setSubmitting(form, true);
    await apiRequest("/api/auth/login", {
      method: "POST",
      body: {
        login: form.elements.login.value,
        password: form.elements.password.value,
      },
    });
    await loadSession();
    await loadAuthenticatedApp();
    showFlash("Connexion réussie.");
  } catch (error) {
    setModalFormError("login", error.message);
  } finally {
    setSubmitting(form, false);
  }
}

async function handleSetupSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    setModalFormError("setup");
    setSubmitting(form, true);
    await apiRequest("/api/auth/setup", {
      method: "POST",
      body: {
        displayName: form.elements.displayName.value,
        login: form.elements.login.value,
        password: form.elements.password.value,
      },
    });
    await loadSession();
    await loadAuthenticatedApp();
    showFlash("Compte créé.");
  } catch (error) {
    setModalFormError("setup", error.message);
  } finally {
    setSubmitting(form, false);
  }
}

async function handlePersonnelSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    setPersonnelFormError();
    setSubmitting(form, true);
    const result = await apiRequest("/api/users", {
      method: "POST",
      body: {
        displayName: form.elements.displayName.value,
        login: form.elements.login.value,
        password: form.elements.password.value,
      },
    });
    Object.assign(state, result.appState);
    form.reset();
    await refreshTableData(["personnel"]);
    showFlash(result.message);
  } catch (error) {
    setPersonnelFormError(error.message);
  } finally {
    setSubmitting(form, false);
  }
}

async function handleLogout() {
  try {
    await apiRequest("/api/auth/logout", {
      method: "POST",
    });
  } catch {
    // Ignore logout races and clear the UI state locally.
  }

  clearProtectedState();
  applySessionState({
    isAuthenticated: false,
    requiresSetup: false,
    user: null,
  });
  renderAll();
}

async function handleProductSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    setModalFormError("product");
    setSubmitting(form, true);
    const imageUpload = await pendingProductImageTask;
    const productName = form.elements.name.value;
    const productId = activeProductEditId || form.elements.productId.value;
    const isEditing = Boolean(productId);
    const payload = {
      name: productName,
      weightKg: convertGramsToKg(form.elements.weightKg.value),
      defaultPurchasePriceEur: Number(form.elements.defaultPurchasePriceEur.value),
      defaultSalePriceMad: Number(form.elements.defaultSalePriceMad.value),
      minStockAlert: Number(form.elements.minStockAlert.value),
      initialStockQty: Number(form.elements.initialStockQty.value || 0),
      imageUpload: imageUpload
        ? {
            ...imageUpload,
            fileName: getProductImageDisplayName(productName, imageUpload.fileName),
          }
        : null,
      notes: form.elements.notes.value,
    };
    const result = await apiRequest(isEditing ? `/api/products/${productId}` : "/api/products", {
      method: isEditing ? "PUT" : "POST",
      body: payload,
    });
    Object.assign(state, result.appState);
    closeModal("product-modal");
    await refreshTableData(["products", "purchases", "wishlist", "available"]);
    showFlash(result.message);
  } catch (error) {
    setModalFormError("product", error.message);
  } finally {
    setSubmitting(form, false);
  }
}

async function handleProductDelete(button) {
  const productId = button.dataset.productDelete;
  const product = getProductById(productId);

  if (!product) {
    showFlash("Produit introuvable.", "error");
    return;
  }

  const confirmed = await openConfirmDialog({
    title: `Supprimer "${product.name}" ?`,
    message: "Le produit sera supprimé définitivement. Cette action est irréversible.",
    confirmLabel: "Supprimer le produit",
  });

  if (!confirmed) {
    return;
  }

  try {
    button.disabled = true;
    const result = await apiRequest(`/api/products/${productId}`, {
      method: "DELETE",
    });
    Object.assign(state, result.appState);

    if (activeProductEditId === productId) {
      resetProductForm();
    }

    await refreshTableData(["products", "purchases", "wishlist", "available"]);
    showFlash(result.message);
  } catch (error) {
    button.disabled = false;
    showFlash(error.message, "error");
  }
}

async function handleWishlistAdd(productId) {
  try {
    const result = await apiRequest("/api/wishlist", {
      method: "POST",
      body: {
        productId,
      },
    });
    Object.assign(state, result.appState);
    await refreshTableData(["products", "wishlist"]);
    showFlash(result.message);
  } catch (error) {
    showFlash(error.message, "error");
  }
}

async function handlePurchaseSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    setModalFormError("purchase");
    const rows = collectRows("purchase");
    ensureUniqueSelectedProducts(rows);
    setSubmitting(form, true);
    const invoiceImageUpload = await pendingPurchaseInvoiceTask;
    const purchaseId = activePurchaseEditId || form.elements.purchaseId.value;
    const isEditing = Boolean(purchaseId);

    const payload = {
      supplierName: form.elements.supplierName.value,
      orderedAt: form.elements.orderedAt.value,
      orderNumber: form.elements.orderNumber.value,
      notes: form.elements.notes.value,
      invoiceImageUpload,
      items: rows.map((row) => {
        const values = getRowValues(row);
        const product = getProductById(values.productId);

        return {
          productId: values.productId,
          qty: Number(values.qty),
          unitPurchasePriceEur:
            Number(values.unitPurchasePriceEur || product?.defaultPurchasePriceEur || 0),
        };
      }),
    };

    const result = await apiRequest(isEditing ? `/api/purchases/${purchaseId}` : "/api/purchases", {
      method: isEditing ? "PUT" : "POST",
      body: payload,
    });
    Object.assign(state, result.appState);

    if (!isEditing) {
      selectedProductIdsForPurchase.clear();
    }

    closeModal("purchase-modal");
    await refreshTableData(["purchases", "products", "wishlist"]);
    showFlash(result.message);
  } catch (error) {
    setModalFormError("purchase", error.message);
  } finally {
    setSubmitting(form, false);
  }
}

async function handleShipmentSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    setModalFormError("shipment");
    const rows = collectRows("shipment");
    ensureUniqueSelectedProducts(rows);
    setSubmitting(form, true);
    const shipmentId = activeShipmentEditId || form.elements.shipmentId.value;
    const isEditing = Boolean(shipmentId);

    const payload = {
      responsibleName: "MALAK",
      sourcePurchaseIds: activeShipmentSourcePurchaseIds,
      status: form.elements.status.value,
      shippedAt: form.elements.shippedAt.value,
      packageWeightKg: Number(form.elements.packageWeightKg.value),
      shippingPriceEur: Number(form.elements.shippingPriceEur.value),
      reference: form.elements.reference.value,
      notes: form.elements.notes.value,
      items: rows.map((row) => {
        const values = getRowValues(row);

        return {
          productId: values.productId,
          qty: Number(values.qty),
        };
      }),
    };

    const result = await apiRequest(
      isEditing ? `/api/shipments/${shipmentId}` : "/api/shipments",
      {
        method: isEditing ? "PUT" : "POST",
        body: payload,
      },
    );
    Object.assign(state, result.appState);

    if (!isEditing) {
      selectedPurchaseIdsForShipment.clear();
    }

    closeModal("shipment-modal");
    await refreshTableData(["shipments", "products", "purchases", "wishlist", "available"]);
    showFlash(result.message);
  } catch (error) {
    setModalFormError("shipment", error.message);
  } finally {
    setSubmitting(form, false);
  }
}

async function handleOrderSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  try {
    setModalFormError("order");
    const rows = collectRows("order");
    ensureUniqueSelectedProducts(rows);
    setSubmitting(form, true);
    const orderId = activeOrderEditId || form.elements.orderId.value;
    const isEditing = Boolean(orderId);

    const payload = {
      orderedAt: form.elements.orderedAt.value,
      status: form.elements.status.value,
      paymentStatus: form.elements.paymentStatus.value,
      carrierName: form.elements.carrierName.value,
      deliveryPriceMad: Number(form.elements.deliveryPriceMad.value || 0),
      advancePaidMad: Number(form.elements.advancePaidMad.value || 0),
      customerName: form.elements.customerName.value,
      customerPhone: form.elements.customerPhone.value,
      customerCity: form.elements.customerCity.value,
      customerAddress: form.elements.customerAddress.value,
      notes: form.elements.notes.value,
      items: rows.map((row) => {
        const values = getRowValues(row);
        const product = getProductById(values.productId);

        return {
          productId: values.productId,
          qty: Number(values.qty),
          unitSalePriceMad:
            Number(values.unitSalePriceMad || product?.defaultSalePriceMad || 0),
        };
      }),
    };

    const result = await apiRequest(isEditing ? `/api/orders/${orderId}` : "/api/orders", {
      method: isEditing ? "PUT" : "POST",
      body: payload,
    });
    Object.assign(state, result.appState);

    if (!isEditing) {
      selectedProductIdsForPurchase.clear();
    }

    closeModal("order-modal");
    await refreshTableData(["orders", "products", "available"]);
    showFlash(result.message);
  } catch (error) {
    setModalFormError("order", error.message);
  } finally {
    setSubmitting(form, false);
  }
}

function renderOrderDetails(order) {
  refs.orderDetailsTitle.textContent = `${order.customer.name} · ${formatDate(order.orderedAt)}`;
  refs.orderDetailsContent.innerHTML = `
    <div class="details-overview-grid">
      <article class="detail-card">
        <p class="eyebrow">Client</p>
        <h4>${escapeHtml(order.customer.name)}</h4>
        <p>${escapeHtml(order.customer.phone)}</p>
        <p>${escapeHtml(order.customer.city)}</p>
        <p>${escapeHtml(order.customer.address)}</p>
      </article>
      <article class="detail-card">
        <p class="eyebrow">Commande</p>
        <h4>${escapeHtml(formatOrderStatusLabel(order.status))}</h4>
        <p><span class="status-chip ${
          order.status === "brouillon"
            ? "status-chip-brouillon"
            : order.status === "livree"
              ? "status-chip-livree"
              : "status-chip-confirmee"
        }">${escapeHtml(formatOrderStatusLabel(order.status))}</span></p>
        <p><span class="status-chip ${
          getPaymentStatusChipClass(order.paymentStatus)
        }">${escapeHtml(formatPaymentStatusLabel(order.paymentStatus))}</span></p>
        <p>Transporteur ${escapeHtml(order.carrierName || "Sans transporteur")}</p>
        <p>Date ${escapeHtml(formatDate(order.orderedAt))}</p>
      </article>
      <article class="detail-card detail-card-highlight">
        <p class="eyebrow">Résumé</p>
        <h4>${escapeHtml(formatCurrency(order.customerTotalMad ?? order.totalRevenueMad, "MAD"))}</h4>
        <p>Ventes produits ${escapeHtml(formatCurrency(order.totalRevenueMad, "MAD"))}</p>
        <p>Livraison ${escapeHtml(formatCurrency(order.deliveryPriceMad || 0, "MAD"))}</p>
        <p>Avance ${escapeHtml(formatCurrency(order.advancePaidMad || 0, "MAD"))}</p>
        <p>Reste ${escapeHtml(formatCurrency(order.remainingToPayMad || 0, "MAD"))}</p>
        <p>Bénéfice ${escapeHtml(formatCurrency(order.totalProfitMad, "MAD"))}</p>
        <p>Marge ${escapeHtml(`${formatNumber(order.marginRate, 2)}%`)}</p>
      </article>
    </div>
    ${renderDetailsItemsTable({
      items: order.items,
      currency: "MAD",
      mode: "order",
    })}
  `;
}

function renderShipmentDetails(shipment) {
  refs.shipmentDetailsTitle.textContent = `${shipment.responsibleName} · ${formatDate(
    shipment.shippedAt,
  )}`;
  refs.shipmentDetailsContent.innerHTML = `
    <div class="details-overview-grid">
      <article class="detail-card">
        <p class="eyebrow">Envoi</p>
        <h4>${escapeHtml(shipment.responsibleName)}</h4>
        <p><span class="status-chip ${escapeHtml(
          `status-chip-shipment-${shipment.status || "envoye"}`,
        )}">${escapeHtml(formatShipmentStatusLabel(shipment.status))}</span></p>
        <p>Référence ${escapeHtml(shipment.reference || "Sans référence")}</p>
        <p>Date ${escapeHtml(formatDate(shipment.shippedAt))}</p>
        <p>Notes ${escapeHtml(shipment.notes || "Aucune")}</p>
      </article>
      <article class="detail-card">
        <p class="eyebrow">Logistique</p>
        <h4>${escapeHtml(formatWeight(shipment.packageWeightKg))}</h4>
        <p>Poids articles ${escapeHtml(formatWeight(shipment.totalItemWeightKg))}</p>
        <p>Tarif ${escapeHtml(`${formatNumber(shipment.packageRatePerKgEur, 2)} EUR/kg`)}</p>
        <p>Transport ${escapeHtml(formatCurrency(shipment.shippingPriceEur, "EUR"))}</p>
      </article>
      <article class="detail-card detail-card-highlight">
        <p class="eyebrow">Résumé</p>
        <h4>${escapeHtml(formatNumber(shipment.totalQty, 0))} unités</h4>
        <p>Articles ${escapeHtml(formatNumber(shipment.items.length, 0))}</p>
        <p>Coût total ${escapeHtml(formatCurrency(shipment.totalLandedCostEur, "EUR"))}</p>
        <p>Responsable fixé à MALAK</p>
      </article>
    </div>
    ${renderDetailsItemsTable({
      items: shipment.items,
      currency: "EUR",
      mode: "shipment",
    })}
  `;
}

async function handleOrderDetailsOpen(orderId) {
  try {
    const order = await apiRequest(`/api/orders/${orderId}`);
    activeOrderDetails = order;
    renderOrderDetails(order);
    openModal("order-details-modal");
  } catch (error) {
    showFlash(error.message, "error");
  }
}

async function handleShipmentDetailsOpen(shipmentId) {
  try {
    const shipment = await apiRequest(`/api/shipments/${shipmentId}`);
    activeShipmentDetails = shipment;
    renderShipmentDetails(shipment);
    openModal("shipment-details-modal");
  } catch (error) {
    showFlash(error.message, "error");
  }
}

async function handleTableRecordDelete(tableKey, recordId, label) {
  const endpoint = TABLE_ENDPOINTS[tableKey];

  if (!endpoint) {
    return;
  }

  const confirmed = await openConfirmDialog({
    title: `Supprimer ${label} ?`,
    message: "Cette suppression est définitive et peut impacter l'historique affiché.",
    confirmLabel: "Confirmer la suppression",
  });

  if (!confirmed) {
    return;
  }

  try {
    const result = await apiRequest(`${endpoint}/${recordId}`, {
      method: "DELETE",
    });
    Object.assign(state, result.appState);

    const impactedTables =
      {
        products: ["products", "purchases", "wishlist", "available"],
        wishlist: ["wishlist", "products"],
        purchases: ["purchases", "products", "wishlist"],
        shipments: ["shipments", "products", "purchases", "wishlist", "available"],
        orders: ["orders", "products", "available"],
      }[tableKey] || [tableKey];

    await refreshTableData(impactedTables);
    showFlash(result.message);
  } catch (error) {
    showFlash(error.message, "error");
  }
}

async function handleOrderSummaryUpdate(orderId, payload) {
  try {
    const result = await apiRequest(`/api/orders/${orderId}/summary`, {
      method: "PATCH",
      body: payload,
    });
    Object.assign(state, result.appState);
    await refreshTableData(["orders", "available"]);
    showFlash(result.message);
  } catch (error) {
    showFlash(error.message, "error");
  }
}

async function handleShipmentSummaryUpdate(shipmentId, payload) {
  try {
    const result = await apiRequest(`/api/shipments/${shipmentId}/summary`, {
      method: "PATCH",
      body: payload,
    });
    Object.assign(state, result.appState);
    await refreshTableData(["shipments", "products", "purchases", "wishlist", "available"]);
    showFlash(result.message);
  } catch (error) {
    showFlash(error.message, "error");
  }
}

function getNextOrderStatus(status) {
  const flow = ["brouillon", "confirmee", "livree"];
  const currentIndex = flow.indexOf(status);
  return flow[(currentIndex + 1 + flow.length) % flow.length];
}

function getNextShipmentStatus(status) {
  const flow = ["achete", "en_preparation", "envoye", "chez_transporteur", "recu"];
  const currentIndex = flow.indexOf(status);
  return flow[(currentIndex + 1 + flow.length) % flow.length];
}

async function handleOrderStatusCycle(orderId) {
  const order = getTableRecord("orders", orderId);

  if (!order) {
    return;
  }

  await handleOrderSummaryUpdate(orderId, {
    status: getNextOrderStatus(order.status),
  });
}

async function handleOrderPaymentCycle(orderId) {
  const order = getTableRecord("orders", orderId);

  if (!order) {
    return;
  }

  await handleOrderSummaryUpdate(orderId, {
    paymentStatus: order.paymentStatus === "payee" ? "non_payee" : "payee",
  });
}

async function handleShipmentStatusCycle(shipmentId) {
  const shipment = getTableRecord("shipments", shipmentId);

  if (!shipment) {
    return;
  }

  await handleShipmentSummaryUpdate(shipmentId, {
    status: getNextShipmentStatus(shipment.status),
  });
}

async function handleTablePageChange(button) {
  const tableKey = button.dataset.tablePage;
  const page = Number(button.dataset.page || 1);

  try {
    await loadTablePage(tableKey, page);
  } catch (error) {
    showFlash(error.message, "error");
  }
}

async function handleTableFilterSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const tableKey = form.dataset.tableFilterForm;

  if (!tableKey || !TABLE_ENDPOINTS[tableKey]) {
    return;
  }

  const nextFilters = getDefaultTableFilters(tableKey);

  Object.keys(nextFilters).forEach((key) => {
    nextFilters[key] = normalizeFilterValue(form.elements.namedItem(key)?.value || "");
  });

  if (nextFilters.dateFrom && nextFilters.dateTo && nextFilters.dateFrom > nextFilters.dateTo) {
    showFlash("La date de début doit être antérieure ou égale à la date de fin.", "error");
    return;
  }

  tableFilters[tableKey] = nextFilters;

  try {
    await loadTablePage(tableKey, 1);
  } catch (error) {
    showFlash(error.message, "error");
  }
}

async function handleTableFilterReset(button) {
  const tableKey = button.dataset.resetTableFilters;

  if (!tableKey || !TABLE_ENDPOINTS[tableKey]) {
    return;
  }

  tableFilters[tableKey] = getDefaultTableFilters(tableKey);
  syncTableFilterForms();

  try {
    await loadTablePage(tableKey, 1);
  } catch (error) {
    showFlash(error.message, "error");
  }
}

function handleDocumentClick(event) {
  const topbarSidebarToggle = event.target.closest("#topbar-sidebar-toggle");

  if (topbarSidebarToggle) {
    toggleSidebar();
    return;
  }

  const mobileNavMenuToggle = event.target.closest("#mobile-nav-menu-toggle");

  if (mobileNavMenuToggle) {
    toggleSidebar();
    return;
  }

  const sidebarBackdrop = event.target.closest("#sidebar-backdrop");

  if (sidebarBackdrop) {
    applySidebarState(true);
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "true");
    return;
  }

  const quickCreateToggle = event.target.closest("#quick-create-toggle");

  if (quickCreateToggle) {
    closeProfileMenu();
    toggleQuickCreateMenu();
    return;
  }

  const mobileQuickCreateToggle = event.target.closest("#mobile-quick-create-toggle");

  if (mobileQuickCreateToggle) {
    closeProfileMenu();
    toggleQuickCreateMenu();
    return;
  }

  const profileTrigger = event.target.closest("#profile-trigger");

  if (profileTrigger) {
    closeQuickCreateMenu();
    toggleProfileMenu();
    return;
  }

  const productsCreatePurchaseButton = event.target.closest("#products-create-purchase-button");

  if (productsCreatePurchaseButton) {
    openPurchaseFromSelectedProducts();
    return;
  }

  const productsCreateOrderButton = event.target.closest("#products-create-order-button");

  if (productsCreateOrderButton) {
    openOrderFromSelectedProducts();
    return;
  }

  const purchasesCreateShipmentButton = event.target.closest("#purchases-create-shipment-button");

  if (purchasesCreateShipmentButton) {
    openShipmentFromSelectedPurchases();
    return;
  }

  const resetTableFiltersButton = event.target.closest("[data-reset-table-filters]");

  if (resetTableFiltersButton) {
    void handleTableFilterReset(resetTableFiltersButton);
    return;
  }

  const openModalButton = event.target.closest("[data-open-modal]");

  if (openModalButton) {
    closeProfileMenu();
    openCreateFlow(openModalButton);
    return;
  }

  const confirmModalButton = event.target.closest("#confirm-modal-confirm");

  if (confirmModalButton) {
    settleConfirmDialog(true);
    return;
  }

  const closeModalButton = event.target.closest("[data-close-modal]");

  if (closeModalButton) {
    closeModal(closeModalButton.dataset.closeModal);
    return;
  }

  if (!event.target.closest(".quick-create")) {
    closeQuickCreateMenu();
  }

  if (!event.target.closest(".profile-menu-shell")) {
    closeProfileMenu();
  }

  const productEditButton = event.target.closest("[data-product-edit]");

  if (productEditButton) {
    const product = getProductById(productEditButton.dataset.productEdit);

    if (product) {
      fillProductForm(product);
      openModal("product-modal");
    }

    return;
  }

  const productDeleteButton = event.target.closest("[data-product-delete]");

  if (productDeleteButton) {
    void handleProductDelete(productDeleteButton);
    return;
  }

  const productWishlistButton = event.target.closest("[data-product-wishlist-add]");

  if (productWishlistButton) {
    void handleWishlistAdd(productWishlistButton.dataset.productWishlistAdd);
    return;
  }

  const purchaseEditButton = event.target.closest("[data-purchase-edit]");

  if (purchaseEditButton) {
    const purchase = getTableRecord("purchases", purchaseEditButton.dataset.purchaseEdit);

    if (purchase) {
      fillDynamicForm(refs.purchaseForm, "purchase", purchase);
      openModal("purchase-modal");
    }

    return;
  }

  const purchaseDetailsButton = event.target.closest("[data-purchase-details-toggle]");

  if (purchaseDetailsButton) {
    const purchaseId = purchaseDetailsButton.dataset.purchaseDetailsToggle;

    if (expandedPurchaseIds.has(purchaseId)) {
      expandedPurchaseIds.delete(purchaseId);
    } else {
      expandedPurchaseIds.add(purchaseId);
    }

    renderPurchases();
    return;
  }

  const purchaseDeleteButton = event.target.closest("[data-purchase-delete]");

  if (purchaseDeleteButton) {
    void handleTableRecordDelete("purchases", purchaseDeleteButton.dataset.purchaseDelete, "achat");
    return;
  }

  const wishlistDeleteButton = event.target.closest("[data-wishlist-delete]");

  if (wishlistDeleteButton) {
    void handleTableRecordDelete("wishlist", wishlistDeleteButton.dataset.wishlistDelete, "ce produit de la wishlist");
    return;
  }

  const purchaseInvoiceViewButton = event.target.closest("[data-purchase-invoice-view]");

  if (purchaseInvoiceViewButton) {
    const purchase = getTableRecord("purchases", purchaseInvoiceViewButton.dataset.purchaseInvoiceView);

    if (purchase?.invoiceImageUrl) {
      refs.imageViewerTarget.src = purchase.invoiceImageUrl;
      refs.imageViewerTarget.alt = purchase.orderNumber || "Facture Action";
      openModal("image-viewer-modal");
    }

    return;
  }

  const shipmentEditButton = event.target.closest("[data-shipment-edit]");

  if (shipmentEditButton) {
    const shipment = getTableRecord("shipments", shipmentEditButton.dataset.shipmentEdit);

    if (shipment) {
      fillDynamicForm(refs.shipmentForm, "shipment", shipment);
      openModal("shipment-modal");
    }

    return;
  }

  const shipmentDeleteButton = event.target.closest("[data-shipment-delete]");

  if (shipmentDeleteButton) {
    void handleTableRecordDelete("shipments", shipmentDeleteButton.dataset.shipmentDelete, "envoi");
    return;
  }

  const shipmentViewButton = event.target.closest("[data-shipment-view]");

  if (shipmentViewButton) {
    void handleShipmentDetailsOpen(shipmentViewButton.dataset.shipmentView);
    return;
  }

  const shipmentStatusChip = event.target.closest("[data-shipment-status-chip]");

  if (shipmentStatusChip) {
    void handleShipmentStatusCycle(shipmentStatusChip.dataset.shipmentStatusChip);
    return;
  }

  const orderViewButton = event.target.closest("[data-order-view]");

  if (orderViewButton) {
    void handleOrderDetailsOpen(orderViewButton.dataset.orderView);
    return;
  }

  const orderEditButton = event.target.closest("[data-order-edit]");

  if (orderEditButton) {
    const order = getTableRecord("orders", orderEditButton.dataset.orderEdit);

    if (order) {
      fillDynamicForm(refs.orderForm, "order", order);
      openModal("order-modal");
    }

    return;
  }

  const orderDeleteButton = event.target.closest("[data-order-delete]");

  if (orderDeleteButton) {
    void handleTableRecordDelete("orders", orderDeleteButton.dataset.orderDelete, "commande");
    return;
  }

  const orderStatusChip = event.target.closest("[data-order-status-chip]");

  if (orderStatusChip) {
    void handleOrderStatusCycle(orderStatusChip.dataset.orderStatusChip);
    return;
  }

  const orderPaymentChip = event.target.closest("[data-order-payment-chip]");

  if (orderPaymentChip) {
    void handleOrderPaymentCycle(orderPaymentChip.dataset.orderPaymentChip);
    return;
  }

  const paginationButton = event.target.closest("[data-table-page]");

  if (paginationButton) {
    void handleTablePageChange(paginationButton);
    return;
  }

  const imageButton = event.target.closest("[data-image-src]");

  if (imageButton && imageButton.dataset.imageSrc) {
    refs.imageViewerTarget.src = imageButton.dataset.imageSrc;
    refs.imageViewerTarget.alt = imageButton.dataset.imageAlt || "Produit";
    openModal("image-viewer-modal");
    return;
  }

  const productSearchOption = event.target.closest("[data-product-search-option]");

  if (productSearchOption) {
    const row = productSearchOption.closest(".line-item-row");

    if (row) {
      applyProductSearchSelection(row, productSearchOption.dataset.productSearchOption);
    }

    return;
  }

  const productSearchInput = event.target.closest("[data-product-search-input]");

  if (productSearchInput) {
    const row = productSearchInput.closest(".line-item-row");

    if (row) {
      closeProductSearchResults();
      openProductSearchResults(row, productSearchInput.value);
    }

    return;
  }

  closeProductSearchResults();

  const addButton = event.target.closest("[data-add-row]");

  if (addButton) {
    addLineItemRow(addButton.dataset.addRow, {}, { prepend: true });
    return;
  }

  const removeButton = event.target.closest("[data-remove-row]");

  if (removeButton) {
    const row = removeButton.closest(".line-item-row");
    const type = row.dataset.type;
    const container = formTypes[type].container;

    if (container.children.length === 1) {
      return;
    }

    row.remove();
    updateRowsForType(type);
    updateAllSummaries();
  }
}

function handleDocumentKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (document.querySelector("[data-product-picker].is-open")) {
    closeProductSearchResults();
    return;
  }

  if (refs.profileMenu && !refs.profileMenu.hidden) {
    closeProfileMenu();
    return;
  }

  if (!refs.quickCreateMenu.hidden) {
    closeQuickCreateMenu();
    return;
  }

  const openModalRef = getOpenModal();

  if (openModalRef) {
    closeModal(openModalRef.id);
  }
}

function handleFormInput(event) {
  if (event.target.form === refs.productForm && event.target.name === "name") {
    syncPendingProductImageLabel();
  }

  if (event.target.form === refs.orderForm) {
    if (event.target.name === "advancePaidMad") {
      syncOrderPaymentFields("advancePaidMad");
    } else if (event.target.name === "paymentStatus") {
      syncOrderPaymentFields("paymentStatus");
    }
  }

  if (event.target.matches("[data-product-search-input]")) {
    const row = event.target.closest(".line-item-row");

    if (row) {
      closeProductSearchResults();
      openProductSearchResults(row, event.target.value);
    }
  }

  const row = event.target.closest(".line-item-row");

  if (row) {
    updateRowHint(row, row.dataset.type);
  }

  updateAllSummaries();
}

function handleDocumentChange(event) {
  if (event.target.form === refs.orderForm && event.target.name === "paymentStatus") {
    syncOrderPaymentFields("paymentStatus");
    updateAllSummaries();
    return;
  }

  const productPurchaseSelect = event.target.closest("[data-product-purchase-select]");

  if (productPurchaseSelect) {
    if (productPurchaseSelect.checked) {
      selectedProductIdsForPurchase.add(productPurchaseSelect.dataset.productPurchaseSelect);
    } else {
      selectedProductIdsForPurchase.delete(productPurchaseSelect.dataset.productPurchaseSelect);
    }

    updateProductsCreatePurchaseButton();
    return;
  }

  const purchaseShipmentSelect = event.target.closest("[data-purchase-shipment-select]");

  if (purchaseShipmentSelect) {
    if (purchaseShipmentSelect.checked) {
      selectedPurchaseIdsForShipment.add(purchaseShipmentSelect.dataset.purchaseShipmentSelect);
    } else {
      selectedPurchaseIdsForShipment.delete(purchaseShipmentSelect.dataset.purchaseShipmentSelect);
    }

    updatePurchasesCreateShipmentButton();
    return;
  }

  const productSelect = event.target.closest('.line-item-row [data-field="productId"]');

  if (productSelect && productSelect.type !== "hidden") {
    const row = productSelect.closest(".line-item-row");

    if (row) {
      updateRowsForType(row.dataset.type);
      updateAllSummaries();
    }
  }

  const orderStatusSelect = event.target.closest("[data-order-status-select]");

  if (orderStatusSelect) {
    void handleOrderSummaryUpdate(orderStatusSelect.dataset.orderStatusSelect, {
      status: orderStatusSelect.value,
    });
    return;
  }

  const orderPaymentSelect = event.target.closest("[data-order-payment-select]");

  if (orderPaymentSelect) {
    void handleOrderSummaryUpdate(orderPaymentSelect.dataset.orderPaymentSelect, {
      paymentStatus: orderPaymentSelect.value,
    });
  }
}

function bindEvents() {
  refs.sidebarToggle.addEventListener("click", toggleSidebar);
  refs.tableFilterForms.forEach((form) => {
    form.addEventListener("submit", (event) => {
      void handleTableFilterSubmit(event);
    });
  });
  refs.settingsForm.addEventListener("submit", handleSettingsSubmit);
  refs.productForm.addEventListener("submit", handleProductSubmit);
  refs.productCancelButton.addEventListener("click", handleProductCancel);
  refs.productImageFile.addEventListener("change", handleProductImageChange);
  refs.productForm.addEventListener("input", handleFormInput);
  refs.purchaseForm.addEventListener("submit", handlePurchaseSubmit);
  refs.purchaseInvoiceFile.addEventListener("change", handlePurchaseInvoiceChange);
  refs.shipmentForm.addEventListener("submit", handleShipmentSubmit);
  refs.orderForm.addEventListener("submit", handleOrderSubmit);
  refs.personnelForm?.addEventListener("submit", handlePersonnelSubmit);
  refs.loginForm.addEventListener("submit", handleLoginSubmit);
  refs.setupForm.addEventListener("submit", handleSetupSubmit);
  refs.logoutButton.addEventListener("click", () => {
    void handleLogout();
  });

  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleDocumentKeydown);
  document.addEventListener("change", handleDocumentChange);
  refs.shipmentForm.addEventListener("input", handleFormInput);
  refs.orderForm.addEventListener("input", handleFormInput);
  refs.purchaseForm.addEventListener("input", handleFormInput);

  refs.sectionLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      if (isModifiedNavigation(event)) {
        return;
      }

      event.preventDefault();

      if (isMobileViewport()) {
        applySidebarState(true);
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "true");
      }

      closeAllModals();
      closeQuickCreateMenu();
      navigateToPath(link.getAttribute("href") || "/");
    });
  });

  refs.sidebarBrand.addEventListener("click", (event) => {
    if (isModifiedNavigation(event)) {
      return;
    }

    event.preventDefault();

    if (isMobileViewport()) {
      applySidebarState(true);
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "true");
    }

    closeAllModals();
    closeQuickCreateMenu();
    navigateToPath("/");
  });

  window.addEventListener("popstate", () => {
    closeAllModals();
    closeQuickCreateMenu();
    applyPageLayout();

    if (state.auth.isAuthenticated) {
      void ensurePageTableData();
    }
  });

  window.addEventListener("resize", handleViewportResize, { passive: true });
}

function hoistOverlayLayers() {
  [...refs.modalShells, refs.authShell].filter(Boolean).forEach((overlay) => {
    if (overlay.parentElement !== document.body) {
      document.body.appendChild(overlay);
    }
  });
}

async function init() {
  applySidebarState(getInitialSidebarState());
  window.requestAnimationFrame(() => {
    document.body.classList.add("is-ready");
  });
  void setupSidebarBrandLogo();
  hoistOverlayLayers();
  bindEvents();
  resetProductForm();
  resetDynamicForm(refs.purchaseForm, "purchase");
  resetDynamicForm(refs.shipmentForm, "shipment");
  resetDynamicForm(refs.orderForm, "order");
  applyPageLayout();
  seedStaticDefaults();
  setHealth("Connexion...");

  try {
    await loadSession();

    if (state.auth.isAuthenticated) {
      await loadAuthenticatedApp();
    } else {
      await refreshHealth();
      clearProtectedState();
      renderAll();
    }
  } catch (error) {
    showFlash(error.message, "error");
    setHealth("API indisponible");
  }
}

init();
