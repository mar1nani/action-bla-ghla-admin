// Catalogue clients — écran d'administration (liste, édition, prix en dirhams, publication, sélection multiple).

const $ = (selector, root = document) => root.querySelector(selector);
const bridge = () => window.abg;
const esc = (value) => bridge().escapeHtml(value ?? "");

const catalog = {
  items: [],
  loaded: false,
  loading: false,
  known: [],
  eurToMad: 0,
  whatsapp: "",
  filter: { category: "all", status: "all", search: "" },
  selection: new Set(),
  pricingOpen: false,
};

const statusOf = (item) => (item.published ? "published" : item.priceMad > 0 ? "draft" : "todo");
const STATUS_LABEL = { published: "Publié", draft: "Brouillon", todo: "À chiffrer" };

function icon(name) {
  const icons = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
    close: '<path d="M6 6l12 12M18 6L6 18"></path>',
    trash: '<path d="M5 7h14M10 11v6M14 11v6M8 7l1-2h6l1 2M7 7l1 12h8l1-12"></path>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"></path><circle cx="12" cy="12" r="3"></circle>',
    tag: '<path d="M3 12V4h8l9 9-8 8-9-9z"></path><circle cx="7.5" cy="8.5" r="1.4"></circle>',
    folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"></path>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || ""}</svg>`;
}

function formatMoney(value, currency) {
  return bridge().formatCurrency(value ?? 0, currency);
}

async function loadCatalog(force = false) {
  if (catalog.loading || (catalog.loaded && !force)) {
    return;
  }

  catalog.loading = true;
  render();

  try {
    const data = await bridge().apiRequest("/api/catalog/items");
    catalog.items = data.items;
    catalog.known = data.knownCategories;
    catalog.eurToMad = data.eurToMad;
    catalog.whatsapp = data.whatsappPhone || "";
    catalog.loaded = true;

    const ids = new Set(catalog.items.map((item) => item.id));
    for (const id of [...catalog.selection]) {
      if (!ids.has(id)) catalog.selection.delete(id);
    }
  } catch (error) {
    bridge().showFlash(error.message, "error");
  } finally {
    catalog.loading = false;
    render();
  }
}

function visibleItems() {
  const { category, status, search } = catalog.filter;
  const needle = search.trim().toLowerCase();

  return catalog.items.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      (status === "all" || statusOf(item) === status) &&
      (!needle || `${item.title} ${item.description || ""}`.toLowerCase().includes(needle)),
  );
}

function categoryList() {
  const counts = new Map();
  for (const item of catalog.items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);

  const order = (name) => {
    const index = catalog.known.findIndex((entry) => entry.name === name);
    return index === -1 ? 999 : index;
  };

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, icon: catalog.known.find((entry) => entry.name === name)?.icon || "✨" }))
    .sort((left, right) => order(left.name) - order(right.name) || left.name.localeCompare(right.name, "fr"));
}

function categoryOptions(selected) {
  const names = new Set([...catalog.known.map((entry) => entry.name), "Autres", ...catalog.items.map((item) => item.category)]);
  return [...names].map((name) => `<option value="${esc(name)}"${name === selected ? " selected" : ""}>${esc(name)}</option>`).join("");
}

function renderCard(item) {
  const status = statusOf(item);
  const selected = catalog.selection.has(item.id);

  return `
    <article class="cat-card is-${status}${selected ? " is-selected" : ""}" data-cat-card="${esc(item.id)}">
      <div class="cat-photo">
        ${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.title)}" loading="lazy" />` : `<span class="cat-noimg">Pas de photo</span>`}
        <button class="select-check${selected ? " is-checked" : ""}" type="button" data-cat-select="${esc(item.id)}" aria-pressed="${selected}" aria-label="Sélectionner">${icon("check")}</button>
        <span class="cat-badge" data-cat-badge>${STATUS_LABEL[status]}</span>
      </div>
      <div class="cat-body">
        <input class="cat-title" value="${esc(item.title)}" data-cat-field="title" aria-label="Titre" maxlength="140" />
        ${item.description ? `<small class="cat-desc">${esc(item.description)}</small>` : ""}
        <select class="cat-category" data-cat-field="category" aria-label="Catégorie">${categoryOptions(item.category)}</select>
        <div class="cat-prices">
          <label class="cat-price">
            <span>Prix source</span>
            <span class="cat-input"><input type="number" min="0" step="0.01" inputmode="decimal" value="${item.priceEur ?? ""}" data-cat-field="priceEur" placeholder="—" /><em>€</em></span>
          </label>
          <label class="cat-price cat-price--mad">
            <span>Prix client</span>
            <span class="cat-input"><input type="number" min="0" step="1" inputmode="numeric" value="${item.priceMad ?? ""}" data-cat-field="priceMad" placeholder="0" /><em>DH</em></span>
          </label>
        </div>
        <label class="cat-switch">
          <input type="checkbox" data-cat-field="published" ${item.published ? "checked" : ""} />
          <span class="cat-switch-track"></span>
          <span class="cat-switch-label">En vitrine</span>
        </label>
      </div>
    </article>
  `;
}

function render() {
  const host = $("#showcase-body");

  if (!host) {
    return;
  }

  if (!catalog.loaded) {
    host.innerHTML = `<div class="cat-loading">${catalog.loading ? "Chargement du catalogue…" : ""}</div>`;
    return;
  }

  const total = catalog.items.length;
  const count = (status) => catalog.items.filter((item) => statusOf(item) === status).length;
  const visible = visibleItems();
  const categories = categoryList();
  const shareUrl = `${location.origin}/boutique`;

  if (!total) {
    host.innerHTML = `
      <div class="g-empty cat-empty">
        <span class="g-empty-icon">${icon("tag")}</span>
        <strong>Ton catalogue est vide</strong>
        <p>Importe des articles depuis un lien, un PDF ou le code d'une page : tu n'auras plus qu'à mettre tes prix en dirhams.</p>
        <button class="primary-button" type="button" data-cat-import>Importer des articles</button>
      </div>`;
    return;
  }

  const tile = (key, label, value) =>
    `<button class="g-stat cat-tile${catalog.filter.status === key ? " is-active" : ""}" type="button" data-cat-status="${key}"><span>${label}</span><strong>${value}</strong></button>`;

  host.innerHTML = `
    <div class="g-summary cat-summary">
      ${tile("all", "Total", total)}
      ${tile("todo", "À chiffrer", count("todo"))}
      ${tile("draft", "Brouillons", count("draft"))}
      ${tile("published", "En vitrine", count("published"))}
    </div>

    <div class="cat-share">
      <span class="cat-share-link">${esc(shareUrl.replace(/^https?:\/\//, ""))}</span>
      <button class="ghost-button" type="button" data-cat-copy>Copier le lien</button>
    </div>

    <div class="cat-filters">
      <div class="cat-chips" role="tablist">
        <button class="cat-chip${catalog.filter.category === "all" ? " is-active" : ""}" type="button" data-cat-category="all">Tout <b>${total}</b></button>
        ${categories
          .map(
            (entry) =>
              `<button class="cat-chip${catalog.filter.category === entry.name ? " is-active" : ""}" type="button" data-cat-category="${esc(entry.name)}">${entry.icon} ${esc(entry.name)} <b>${entry.count}</b></button>`,
          )
          .join("")}
      </div>
      <input class="cat-search" type="search" placeholder="Rechercher un article…" value="${esc(catalog.filter.search)}" data-cat-search autocomplete="off" />
    </div>

    <div class="cat-toolbar">
      <button class="g-select-all" type="button" data-cat-select-all>${visible.length && visible.every((item) => catalog.selection.has(item.id)) ? "Tout désélectionner" : "Tout sélectionner"}</button>
      <button class="ghost-button cat-pricing-toggle" type="button" data-cat-pricing-toggle>${icon("tag")} Chiffrer en DH</button>
    </div>

    ${catalog.pricingOpen ? renderPricingPanel(visible) : ""}

    <details class="cat-settings">
      <summary>Réglages de la vitrine</summary>
      <label class="field">
        <span>Numéro WhatsApp pour recevoir les commandes</span>
        <span class="cat-inline">
          <input id="cat-whatsapp" type="tel" inputmode="tel" value="${esc(catalog.whatsapp)}" placeholder="06 12 34 56 78" />
          <button class="ghost-button" type="button" data-cat-save-whatsapp>Enregistrer</button>
        </span>
      </label>
    </details>

    ${
      visible.length
        ? `<div class="g-grid cat-grid">${visible.map(renderCard).join("")}</div>`
        : `<div class="g-empty"><strong>Aucun article ici</strong><p>Change de filtre pour voir les autres articles.</p></div>`
    }
  `;

  renderBar();
}

function pricingTargets(visible) {
  return catalog.selection.size
    ? catalog.items.filter((item) => catalog.selection.has(item.id))
    : visible;
}

function renderPricingPanel(visible) {
  const coef = Number(localStorage.getItem("abg-coef")) || 2;
  const rounding = Number(localStorage.getItem("abg-rounding")) || 5;
  const targets = pricingTargets(visible);
  const sample = targets.find((item) => item.priceEur > 0)?.priceEur ?? 1.99;
  const price = Math.max(rounding, Math.round((sample * catalog.eurToMad * coef) / rounding) * rounding);

  return `
    <div class="cat-pricing">
      <p class="cat-pricing-title">Chiffrer ${targets.length} article${targets.length > 1 ? "s" : ""} ${catalog.selection.size ? "sélectionné" + (targets.length > 1 ? "s" : "") : "affiché" + (targets.length > 1 ? "s" : "")}</p>
      <div class="cat-pricing-row">
        <label class="field field-compact-sm"><span>Coefficient</span><input id="cat-coef" type="number" min="0.5" max="20" step="0.1" value="${coef}" inputmode="decimal" /></label>
        <label class="field field-compact-sm"><span>Arrondi (DH)</span>
          <select id="cat-rounding">${[1, 5, 10].map((value) => `<option value="${value}"${value === rounding ? " selected" : ""}>${value}</option>`).join("")}</select>
        </label>
      </div>
      <label class="cat-check"><input id="cat-only-empty" type="checkbox" checked /> Seulement les articles sans prix en DH</label>
      <p class="cat-pricing-preview" id="cat-pricing-preview">Ex. : ${formatMoney(sample, "EUR")} × taux ${catalog.eurToMad} × ${coef} → <strong>${price} DH</strong></p>
      <button class="primary-button" type="button" data-cat-pricing-apply>Appliquer</button>
    </div>`;
}

function updatePricingPreview() {
  const coef = Number($("#cat-coef")?.value) || 0;
  const rounding = Number($("#cat-rounding")?.value) || 5;
  const preview = $("#cat-pricing-preview");

  if (!preview || !(coef > 0)) return;

  const targets = pricingTargets(visibleItems());
  const sample = targets.find((item) => item.priceEur > 0)?.priceEur ?? 1.99;
  const price = Math.max(rounding, Math.round((sample * catalog.eurToMad * coef) / rounding) * rounding);
  preview.innerHTML = `Ex. : ${formatMoney(sample, "EUR")} × taux ${catalog.eurToMad} × ${coef} → <strong>${price} DH</strong>`;
}

// --- Barre d'actions groupées ------------------------------------------------
function renderBar() {
  let bar = $("#bulk-bar");

  if (!bar) {
    bar = document.createElement("div");
    bar.id = "bulk-bar";
    bar.className = "bulk-bar";
    document.body.append(bar);
  }

  if (document.body.dataset.page !== "showcase" || !catalog.selection.size) {
    if (document.body.dataset.page === "showcase") {
      bar.hidden = true;
      bar.innerHTML = "";
      document.body.classList.remove("has-bulk-bar");
    }
    return;
  }

  const items = catalog.items.filter((item) => catalog.selection.has(item.id));
  const canPublish = items.some((item) => !item.published);
  const canUnpublish = items.some((item) => item.published);

  bar.innerHTML = `
    <div class="bulk-bar-info">
      <button class="bulk-bar-clear" type="button" data-cat-clear aria-label="Annuler la sélection">${icon("close")}</button>
      <span><strong>${items.length}</strong> article${items.length > 1 ? "s" : ""}</span>
    </div>
    <div class="bulk-bar-actions">
      ${canPublish ? `<button class="bulk-btn bulk-btn--buy" type="button" data-cat-bulk="publish">${icon("eye")}<span>Publier</span></button>` : ""}
      ${canUnpublish ? `<button class="bulk-btn bulk-btn--undo" type="button" data-cat-bulk="unpublish">${icon("eye")}<span>Retirer</span></button>` : ""}
      <button class="bulk-btn bulk-btn--undo" type="button" data-cat-bulk="category">${icon("folder")}<span>Catégorie</span></button>
      <button class="bulk-btn bulk-btn--undo" type="button" data-cat-bulk="price">${icon("tag")}<span>Prix</span></button>
      <button class="bulk-btn bulk-btn--delete" type="button" data-cat-bulk="delete">${icon("trash")}<span>Supprimer</span></button>
    </div>
    <select id="cat-bulk-category" class="cat-bulk-category" hidden aria-label="Déplacer vers…">
      <option value="">Déplacer vers…</option>${categoryOptions("")}
    </select>`;
  bar.hidden = false;
  document.body.classList.add("has-bulk-bar");
}

function syncSelectionDom() {
  document.querySelectorAll("[data-cat-card]").forEach((card) => {
    const selected = catalog.selection.has(card.dataset.catCard);
    card.classList.toggle("is-selected", selected);
    const check = $("[data-cat-select]", card);
    check?.classList.toggle("is-checked", selected);
    check?.setAttribute("aria-pressed", String(selected));
  });
  const visible = visibleItems();
  const all = $("[data-cat-select-all]");
  if (all) {
    all.textContent = visible.length && visible.every((item) => catalog.selection.has(item.id)) ? "Tout désélectionner" : "Tout sélectionner";
  }
  if (catalog.pricingOpen) {
    const title = $(".cat-pricing-title");
    if (title) {
      const targets = pricingTargets(visible);
      title.textContent = `Chiffrer ${targets.length} article${targets.length > 1 ? "s" : ""} ${catalog.selection.size ? "sélectionné" : "affiché"}${targets.length > 1 ? "s" : ""}`;
    }
    updatePricingPreview();
  }
  renderBar();
}

async function runBulk(action, extra = {}) {
  const ids = [...catalog.selection];

  if (!ids.length) {
    return;
  }

  if (action === "delete") {
    const confirmed = await bridge().openConfirmDialog({
      title: `Supprimer ${ids.length} article${ids.length > 1 ? "s" : ""} ?`,
      message: "Les articles et leurs photos seront supprimés définitivement du catalogue.",
      confirmLabel: `Supprimer (${ids.length})`,
    });
    if (!confirmed) return;
  }

  await applyBulk(ids, action, extra);
  catalog.selection.clear();
  await loadCatalog(true);
}

async function applyBulk(ids, action, extra = {}) {
  try {
    const result = await bridge().apiRequest("/api/catalog/items/bulk", {
      method: "POST",
      body: { ids, action, ...extra },
    });
    bridge().showFlash(result.message);
    return result;
  } catch (error) {
    bridge().showFlash(error.message, "error");
    return null;
  }
}

async function saveField(card, input) {
  const id = card.dataset.catCard;
  const field = input.dataset.catField;
  const item = catalog.items.find((entry) => entry.id === id);

  if (!item) return;

  let value = input.type === "checkbox" ? input.checked : input.value;
  if (field === "priceEur" || field === "priceMad") value = value === "" ? "" : Number(value);

  try {
    const result = await bridge().apiRequest(`/api/catalog/items/${id}`, { method: "PATCH", body: { [field]: value } });
    Object.assign(item, result.item);
    const status = statusOf(item);
    card.classList.remove("is-published", "is-draft", "is-todo");
    card.classList.add(`is-${status}`);
    const badge = $("[data-cat-badge]", card);
    if (badge) badge.textContent = STATUS_LABEL[status];
    if (field === "category" || field === "published" || field === "priceMad") refreshSummary();
  } catch (error) {
    bridge().showFlash(error.message, "error");
    if (input.type === "checkbox") input.checked = !input.checked;
    else input.value = item[field] ?? "";
  }
}

function refreshSummary() {
  const count = (status) => catalog.items.filter((item) => statusOf(item) === status).length;
  const values = { all: catalog.items.length, todo: count("todo"), draft: count("draft"), published: count("published") };
  document.querySelectorAll("[data-cat-status]").forEach((tile) => {
    const strong = $("strong", tile);
    if (strong) strong.textContent = values[tile.dataset.catStatus];
  });
}

// --- Événements ----------------------------------------------------------------
document.addEventListener("click", async (event) => {
  if (document.body.dataset.page !== "showcase" && !event.target.closest("#showcase-import-button, #showcase-add-button")) return;

  const target = event.target;

  if (target.closest("#showcase-import-button, #showcase-add-button, [data-cat-import]")) {
    const module = await import("/catalog-import.js");
    module.openImport({
      existing: catalog.items,
      tab: target.closest("#showcase-add-button") ? "single" : "url",
      onDone: () => loadCatalog(true),
      onAdded: () => (catalog.filter.status = "todo"),
    });
    return;
  }

  const select = target.closest("[data-cat-select]");
  if (select) {
    const id = select.dataset.catSelect;
    catalog.selection.has(id) ? catalog.selection.delete(id) : catalog.selection.add(id);
    syncSelectionDom();
    return;
  }

  const statusTile = target.closest("[data-cat-status]");
  if (statusTile) {
    catalog.filter.status = catalog.filter.status === statusTile.dataset.catStatus ? "all" : statusTile.dataset.catStatus;
    render();
    return;
  }

  const chip = target.closest("[data-cat-category]");
  if (chip) {
    catalog.filter.category = chip.dataset.catCategory;
    render();
    return;
  }

  if (target.closest("[data-cat-select-all]")) {
    const visible = visibleItems();
    const all = visible.length && visible.every((item) => catalog.selection.has(item.id));
    visible.forEach((item) => (all ? catalog.selection.delete(item.id) : catalog.selection.add(item.id)));
    syncSelectionDom();
    return;
  }

  if (target.closest("[data-cat-clear]")) {
    catalog.selection.clear();
    syncSelectionDom();
    return;
  }

  if (target.closest("[data-cat-copy]")) {
    const url = `${location.origin}/boutique`;
    try {
      if (navigator.share && matchMedia("(max-width: 980px)").matches) {
        await navigator.share({ title: "Notre boutique", url });
      } else {
        await navigator.clipboard.writeText(url);
        bridge().showFlash("Lien copié.");
      }
    } catch {
      /* partage annulé */
    }
    return;
  }

  if (target.closest("[data-cat-pricing-toggle]")) {
    catalog.pricingOpen = !catalog.pricingOpen;
    render();
    return;
  }

  if (target.closest("[data-cat-pricing-apply]")) {
    const coef = Number($("#cat-coef").value);
    const rounding = Number($("#cat-rounding").value);
    const onlyEmpty = $("#cat-only-empty").checked;
    const targets = pricingTargets(visibleItems());

    if (!(coef > 0) || !targets.length) {
      bridge().showFlash("Indique un coefficient valide.", "error");
      return;
    }

    localStorage.setItem("abg-coef", String(coef));
    localStorage.setItem("abg-rounding", String(rounding));
    await applyBulk(targets.map((item) => item.id), "price-coef", { coef, rounding, onlyEmpty });
    await loadCatalog(true);
    return;
  }

  if (target.closest("[data-cat-save-whatsapp]")) {
    try {
      const result = await bridge().apiRequest("/api/catalog/settings", {
        method: "PUT",
        body: { whatsappPhone: $("#cat-whatsapp").value },
      });
      catalog.whatsapp = result.whatsappPhone;
      bridge().showFlash(result.message);
    } catch (error) {
      bridge().showFlash(error.message, "error");
    }
    return;
  }

  const bulk = target.closest("[data-cat-bulk]");
  if (bulk) {
    const action = bulk.dataset.catBulk;

    if (action === "category") {
      const picker = $("#cat-bulk-category");
      picker.hidden = !picker.hidden;
      return;
    }

    if (action === "price") {
      catalog.pricingOpen = true;
      render();
      $(".cat-pricing")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    await runBulk(action);
  }
});

document.addEventListener("change", (event) => {
  if (document.body.dataset.page !== "showcase") return;

  const field = event.target.closest("[data-cat-field]");
  if (field) {
    const card = field.closest("[data-cat-card]");
    if (card) void saveField(card, field);
    return;
  }

  if (event.target.id === "cat-bulk-category" && event.target.value) {
    void runBulk("category", { category: event.target.value });
    return;
  }

  if (event.target.id === "cat-rounding" || event.target.id === "cat-only-empty") {
    updatePricingPreview();
  }
});

document.addEventListener("input", (event) => {
  if (document.body.dataset.page !== "showcase") return;

  if (event.target.id === "cat-coef") {
    updatePricingPreview();
    return;
  }

  if (event.target.matches("[data-cat-search]")) {
    catalog.filter.search = event.target.value;
    const caret = event.target.selectionStart;
    const grid = $(".cat-grid, .g-empty:not(.cat-empty)");
    const visible = visibleItems();
    const host = $(".cat-grid");
    if (host) {
      host.innerHTML = visible.map(renderCard).join("");
    } else if (grid && visible.length) {
      render();
      const input = $("[data-cat-search]");
      input?.focus();
      input?.setSelectionRange(caret, caret);
    }
    syncSelectionDom();
  }
});

// Favori « 1 clic » : la page du site ouvre /showcase#import ; on lui dit qu'on est prêt puis on reçoit les pages.
let handshakeStarted = false;

async function startOpenerHandshake() {
  if (handshakeStarted || location.hash !== "#import" || !window.opener) return;
  handshakeStarted = true;

  const importer = await import("/catalog-import.js");

  window.addEventListener("message", async (event) => {
    const data = event.data;

    if (event.source !== window.opener || data?.type !== "abg-import" || !Array.isArray(data.pages)) return;

    const pages = data.pages
      .slice(0, 30)
      .filter((page) => typeof page?.html === "string" && typeof page?.url === "string" && /^https?:\/\//i.test(page.url))
      .map((page) => ({ url: page.url, html: page.html.slice(0, 3_000_000) }));

    history.replaceState({}, "", "/showcase");
    await loadCatalog(true);
    void importer.importFromPages(pages, { existing: catalog.items, onDone: () => loadCatalog(true), onAdded: () => (catalog.filter.status = "todo") });
  });

  importer.showWaiting();
  window.opener.postMessage("abg-ready", "*");
}

function onPage(page) {
  if (page === "showcase" && bridge()?.getState().auth?.isAuthenticated) {
    void loadCatalog(true);
    void startOpenerHandshake();
  }
}

document.addEventListener("abg:page", (event) => onPage(event.detail.page));
if (document.body.dataset.page === "showcase") {
  onPage("showcase");
}
