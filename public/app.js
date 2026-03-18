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
    purchases: { items: [], pagination: null },
    shipments: { items: [], pagination: null },
    orders: { items: [], pagination: null },
    personnel: { items: [], pagination: null },
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
const PAGE_CONFIG = {
  dashboard: {
    path: "/",
    documentTitle: "Tableau de bord",
  },
  products: {
    path: "/products",
    documentTitle: "Produits",
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
  purchasesList: document.querySelector("#purchases-list"),
  purchasesPagination: document.querySelector("#purchases-pagination"),
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
  orderForm: document.querySelector("#order-form"),
  orderId: document.querySelector("#order-id"),
  orderFormTitle: document.querySelector("#order-form-title"),
  orderSubmitButton: document.querySelector("#order-submit-button"),
  orderFormError: document.querySelector("#order-form-error"),
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

function formatWeight(value) {
  return `${formatNumber(value, 3)} kg`;
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
  return status === "payee" ? "Payée" : "Non payée";
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

function getTableRecord(tableKey, recordId) {
  return (state.tables[tableKey]?.items ?? []).find((item) => item.id === recordId) || null;
}

function getTablePage(tableKey) {
  return state.tables[tableKey]?.pagination?.page || 1;
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
  refs.productForm.elements.weightKg.value = product.weightKg ?? "";
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
  const payload = await apiRequest(`${TABLE_ENDPOINTS[tableKey]}?page=${page}&pageSize=10`);
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
        `À encaisser ${formatCurrency(totals.outstandingRevenueMad ?? 0, "MAD")}`,
    },
  ];

  refs.dashboardCards.innerHTML = cards
    .map(
      (card) => `
        <article class="metric-card">
          <span class="metric-card-label">${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <small>${escapeHtml(card.meta)}</small>
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

              return `
              <tr>
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

function renderPurchases() {
  const items = state.tables.purchases.items ?? [];

  if (!items.length) {
    refs.purchasesList.innerHTML = renderEmptyState("Aucun achat enregistré.");
    renderPagination("purchases", refs.purchasesPagination);
    return;
  }

  refs.purchasesList.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Fournisseur</th>
          <th>Articles</th>
          <th>Qté</th>
          <th>Poids</th>
          <th>Total</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (purchase) => `
              <tr>
                <td>${escapeHtml(formatDate(purchase.orderedAt))}</td>
                <td>${renderPrimaryTableCell(
                  purchase.supplierName,
                  purchase.orderNumber || "Sans référence",
                )}</td>
                <td>${renderTableLines(
                  purchase.items,
                  (item) => `${item.productName} x${formatNumber(item.qty, 0)}`,
                )}</td>
                <td>${escapeHtml(formatNumber(purchase.totalQty, 0))}</td>
                <td>${escapeHtml(formatWeight(purchase.totalWeightKg))}</td>
                <td>${escapeHtml(formatCurrency(purchase.totalCostEur, "EUR"))}</td>
                <td>
                  <div class="table-actions">
                    <button
                      class="ghost-button table-action-button"
                      type="button"
                      data-purchase-invoice-view="${escapeHtml(purchase.id)}"
                      title="${
                        purchase.invoiceImageUrl
                          ? "Voir la facture"
                          : "Aucune photo de facture"
                      }"
                      aria-label="Voir la photo de facture"
                      ${purchase.invoiceImageUrl ? "" : "disabled"}
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
            `,
          )
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
                  <button
                    class="status-chip status-chip-button ${escapeHtml(
                      order.paymentStatus === "payee"
                        ? "status-chip-paid"
                        : "status-chip-unpaid",
                    )}"
                    type="button"
                    data-order-payment-chip="${escapeHtml(order.id)}"
                    title="Cliquer pour changer le paiement"
                  >
                    ${escapeHtml(formatPaymentStatusLabel(order.paymentStatus))}
                  </button>
                </td>
                <td>${escapeHtml(formatCurrency(order.totalRevenueMad, "MAD"))}</td>
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
  applyPageLayout();
  renderDashboardCards();
  renderLowStock();
  renderActivity();
  renderProductsTable();
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

function buildProductOptions(selectedId = "") {
  const baseOption = `<option value="">Choisir un produit</option>`;

  if (!state.products.length) {
    return `${baseOption}<option value="" disabled>Aucun produit disponible</option>`;
  }

  return `${baseOption}${state.products
    .map(
      (product) => `
        <option value="${escapeHtml(product.id)}" ${
          product.id === selectedId ? "selected" : ""
        }>
          ${escapeHtml(product.name)}
        </option>
      `,
    )
    .join("")}`;
}

function createRowTemplate(type, values = {}) {
  if (type === "purchase") {
    return `
      <div class="line-item-row" data-type="purchase">
        <div class="field grow">
          <span>Produit</span>
          <select data-field="productId">${buildProductOptions(values.productId)}</select>
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
        </div>
        <button class="ghost-button row-remove" type="button" data-remove-row>Retirer</button>
        <p class="row-hint" data-row-hint></p>
      </div>
    `;
  }

  if (type === "shipment") {
    return `
      <div class="line-item-row" data-type="shipment">
        <div class="field grow">
          <span>Produit</span>
          <select data-field="productId">${buildProductOptions(values.productId)}</select>
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

  return `
    <div class="line-item-row" data-type="order">
      <div class="field grow">
        <span>Produit</span>
        <select data-field="productId">${buildProductOptions(values.productId)}</select>
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

function addLineItemRow(type, values = {}) {
  const container = formTypes[type].container;
  container.insertAdjacentHTML("beforeend", createRowTemplate(type, values));
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
    const select = row.querySelector('[data-field="productId"]');
    const selectedId = select.value;
    select.innerHTML = buildProductOptions(selectedId);
    updateRowHint(row, type);
  });
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
  const values = getRowValues(row);
  const product = getProductById(values.productId);
  const qty = Number(values.qty || 0);

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
  const revenueMad = itemsRevenueMad + deliveryPriceMad;
  const profitMad = revenueMad - costMad;
  const marginRate = revenueMad > 0 ? (profitMad / revenueMad) * 100 : 0;

  refs.orderSummary.innerHTML = `
    <div class="summary-line"><span>Total unités</span><strong>${escapeHtml(
      formatNumber(totalQty, 0),
    )}</strong></div>
    <div class="summary-line"><span>CA estimé</span><strong>${escapeHtml(
      formatCurrency(revenueMad, "MAD"),
    )}</strong></div>
    <div class="summary-line"><span>Livraison</span><strong>${escapeHtml(
      formatCurrency(deliveryPriceMad, "MAD"),
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
    form.elements.supplierName.value = "Action";
    form.elements.orderedAt.value = todayInputValue();
    resetPurchaseInvoiceSelection();
  }

  if (type === "shipment") {
    setShipmentFormMode();
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
  }

  const container = formTypes[type].container;
  container.innerHTML = "";
  addLineItemRow(type);
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

function openCreateFlow(button) {
  const modalId = button.dataset.openModal;
  const targetPath = button.dataset.modalPath;
  const formType = button.dataset.formType;

  closeQuickCreateMenu();

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
      weightKg: Number(form.elements.weightKg.value),
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
    await refreshTableData(["products", "purchases"]);
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

    await refreshTableData(["products", "purchases"]);
    showFlash(result.message);
  } catch (error) {
    button.disabled = false;
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
    closeModal("purchase-modal");
    await refreshTableData(["purchases", "products"]);
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
    closeModal("shipment-modal");
    await refreshTableData(["shipments", "products"]);
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
    closeModal("order-modal");
    await refreshTableData(["orders", "products"]);
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
          order.paymentStatus === "payee" ? "status-chip-paid" : "status-chip-unpaid"
        }">${escapeHtml(formatPaymentStatusLabel(order.paymentStatus))}</span></p>
        <p>Transporteur ${escapeHtml(order.carrierName || "Sans transporteur")}</p>
        <p>Date ${escapeHtml(formatDate(order.orderedAt))}</p>
      </article>
      <article class="detail-card detail-card-highlight">
        <p class="eyebrow">Résumé</p>
        <h4>${escapeHtml(formatCurrency(order.totalRevenueMad, "MAD"))}</h4>
        <p>Livraison ${escapeHtml(formatCurrency(order.deliveryPriceMad || 0, "MAD"))}</p>
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
        products: ["products", "purchases"],
        purchases: ["purchases", "products"],
        shipments: ["shipments", "products"],
        orders: ["orders", "products"],
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
    await refreshTableData(["orders"]);
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
    await refreshTableData(["shipments"]);
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

  const purchaseEditButton = event.target.closest("[data-purchase-edit]");

  if (purchaseEditButton) {
    const purchase = getTableRecord("purchases", purchaseEditButton.dataset.purchaseEdit);

    if (purchase) {
      fillDynamicForm(refs.purchaseForm, "purchase", purchase);
      openModal("purchase-modal");
    }

    return;
  }

  const purchaseDeleteButton = event.target.closest("[data-purchase-delete]");

  if (purchaseDeleteButton) {
    void handleTableRecordDelete("purchases", purchaseDeleteButton.dataset.purchaseDelete, "achat");
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

  const addButton = event.target.closest("[data-add-row]");

  if (addButton) {
    addLineItemRow(addButton.dataset.addRow);
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

  const row = event.target.closest(".line-item-row");

  if (row) {
    updateRowHint(row, row.dataset.type);
  }

  updateAllSummaries();
}

function handleDocumentChange(event) {
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
