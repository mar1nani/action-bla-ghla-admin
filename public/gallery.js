// Photos à acheter — page simple : grille de photos, filtres boutique / catégorie, fiche au toucher, sélection multiple.

const $ = (selector, root = document) => root.querySelector(selector);
const bridge = () => window.abg;
const esc = (value) => bridge().escapeHtml(value ?? "");

const g = {
  items: [],
  categories: [],
  shops: ["Normal", "Action"],
  loaded: false,
  loading: false,
  pending: 0,
  migrating: false,
  filters: { shop: "all", category: "all", tab: "pending" },
  selection: new Set(),
  openId: null,
  addingCategory: false,
  uploading: false,
};

const store = {
  get(key, fallback = "") {
    try {
      return localStorage.getItem(`abg-gallery-${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`abg-gallery-${key}`, value);
    } catch {
      /* stockage indisponible */
    }
  },
};

const SHOP_ICON = { Action: "🅰️", Normal: "🏬" };
const money = (value) => bridge().formatCurrency(value ?? 0, "EUR");

const icon = (name) =>
  ({
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M8 7l1-2h6l1 2M7 7l1 12h8l1-12"></path></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"></path><path d="M4 9h10a6 6 0 010 12h-3"></path></svg>',
    box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21 4 16.5v-9L12 3z"></path><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"></path></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path></svg>',
    photos: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="M21 16l-5-5-8 8"></path></svg>',
    tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4h8l9 9-8 8-9-9z"></path><circle cx="7.5" cy="8.5" r="1.4"></circle></svg>',
    shop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9a3 3 0 006 0 3 3 0 006 0 3 3 0 004 0"></path></svg>',
  })[name] || "";

// --- Données ------------------------------------------------------------------------------------------
async function load(force = false) {
  if (g.loading || (g.loaded && !force)) return;

  g.loading = true;
  render();

  try {
    const data = await bridge().apiRequest("/api/gallery-items");
    g.items = data.items;
    g.categories = data.categories;
    g.shops = data.shops;
    g.pending = data.pending;
    g.loaded = true;

    const ids = new Set(g.items.map((item) => item.id));
    for (const id of [...g.selection]) if (!ids.has(id)) g.selection.delete(id);

    if (window.abgGalleryTab) {
      g.filters.tab = window.abgGalleryTab;
      window.abgGalleryTab = "";
    }
  } catch (error) {
    bridge().showFlash(error.message, "error");
  } finally {
    g.loading = false;
    render();
  }

  if (g.pending > 0) void migrate();
}

// Anciennes photos rangées dans la base principale : on les déplace par petits lots (une seule fois), ça rend tout rapide.
async function migrate() {
  if (g.migrating) return;
  g.migrating = true;
  renderBanner();

  try {
    let guard = 0;

    while (g.pending > 0 && guard < 80) {
      guard += 1;
      const result = await bridge().apiRequest("/api/gallery-items/migrate-images", { method: "POST" });

      for (const entry of result.migrated) {
        const item = g.items.find((candidate) => candidate.id === entry.id);
        if (item) {
          item.imageUrl = entry.imageUrl;
          item.pending = false;
          item.broken = false;
          refreshTilePhoto(item);
        }
      }

      for (const id of result.failedIds ?? []) {
        const item = g.items.find((candidate) => candidate.id === id);
        if (item) {
          item.pending = false;
          item.broken = true;
        }
      }

      g.pending = result.remaining;

      renderBanner();
    }
  } catch {
    /* on réessaiera à la prochaine ouverture */
  } finally {
    g.migrating = false;
    g.pending = g.items.filter((item) => item.pending).length;
    render();
  }
}

// --- Filtres ------------------------------------------------------------------------------------------
const inTab = (item) => (g.filters.tab === "bought" ? item.purchased : !item.purchased);
const matchesShop = (item) => g.filters.shop === "all" || (g.filters.shop === "none" ? !item.shop : item.shop === g.filters.shop);
const matchesCategory = (item) =>
  g.filters.category === "all" || (g.filters.category === "none" ? !item.category : item.category === g.filters.category);

const visible = () => g.items.filter((item) => inTab(item) && matchesShop(item) && matchesCategory(item));

function countBy(predicate) {
  return g.items.filter((item) => inTab(item) && predicate(item)).length;
}

// --- Rendu --------------------------------------------------------------------------------------------
function tileHtml(item) {
  const selected = g.selection.has(item.id);
  const total = item.desiredQty * item.foundPriceEur;
  const photo = item.imageUrl
    ? `<img src="${esc(item.imageUrl)}${item.imageUrl.startsWith("/media/") ? "?w=360" : ""}" alt="" loading="lazy" decoding="async" />`
    : item.pending
      ? `<span class="gl-placeholder is-loading">Optimisation…</span>`
      : `<span class="gl-placeholder">Photo illisible</span>`;

  return `
    <article class="gl-tile${selected ? " is-selected" : ""}${item.purchased ? " is-bought" : ""}" data-gl-tile="${esc(item.id)}">
      <button class="gl-photo" type="button" data-gl-open="${esc(item.id)}" aria-label="Ouvrir la fiche">${photo}</button>
      <button class="select-check${selected ? " is-checked" : ""}" type="button" data-gl-select="${esc(item.id)}" aria-pressed="${selected}" aria-label="Sélectionner">${icon("check")}</button>
      ${item.purchased ? `<span class="gl-done">${icon("check")}</span>` : ""}
      <div class="gl-meta">
        <span class="gl-chips">
          ${item.shop ? `<span class="gl-chip gl-chip--${item.shop === "Action" ? "action" : "normal"}">${esc(item.shop)}</span>` : ""}
          ${item.category ? `<span class="gl-chip">${esc(item.category)}</span>` : ""}
        </span>
        ${total > 0 || item.desiredQty > 1 ? `<span class="gl-price">${item.desiredQty > 1 ? `×${item.desiredQty} ` : ""}${total > 0 ? money(total) : ""}</span>` : ""}
      </div>
    </article>`;
}

function chipsHtml() {
  const shopChips = [
    { key: "all", label: "Toutes les boutiques", count: countBy(() => true) },
    ...g.shops.map((shop) => ({ key: shop, label: `${SHOP_ICON[shop] || ""} ${shop}`, count: countBy((item) => item.shop === shop) })),
  ];
  const unclassifiedShop = countBy((item) => !item.shop);

  if (unclassifiedShop && unclassifiedShop !== shopChips[0].count) {
    shopChips.push({ key: "none", label: "Non classées", count: unclassifiedShop });
  }

  const categoryCounts = new Map();
  for (const item of g.items.filter((entry) => inTab(entry) && matchesShop(entry))) {
    const key = item.category || "";
    categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
  }

  const categoryChips = [
    { key: "all", label: "Toutes", count: [...categoryCounts.values()].reduce((a, b) => a + b, 0) },
    ...g.categories
      .filter((category) => categoryCounts.get(category.name))
      .map((category) => ({ key: category.name, label: `${category.icon} ${category.name}`, count: categoryCounts.get(category.name) })),
  ];

  if (categoryCounts.get("")) categoryChips.push({ key: "none", label: "Sans catégorie", count: categoryCounts.get("") });

  const chip = (group, entry, active) =>
    `<button class="gl-filter${active ? " is-active" : ""}" type="button" data-gl-${group}="${esc(entry.key)}">${esc(entry.label)} <b>${entry.count}</b></button>`;

  return `
    <div class="gl-filters">
      <div class="gl-row" role="tablist" aria-label="Boutique">${shopChips.map((entry) => chip("shop", entry, g.filters.shop === entry.key)).join("")}</div>
      <div class="gl-row" role="tablist" aria-label="Catégorie">
        ${categoryChips.map((entry) => chip("category", entry, g.filters.category === entry.key)).join("")}
        ${
          g.addingCategory
            ? `<form class="gl-newcat" data-gl-newcat-form><input name="name" placeholder="Nouvelle catégorie" maxlength="40" required autocomplete="off" /><button type="submit">OK</button></form>`
            : `<button class="gl-filter gl-filter--add" type="button" data-gl-addcat>＋ Catégorie</button>`
        }
      </div>
    </div>`;
}

function render() {
  const root = $("#gallery-root");

  if (!root) return;

  if (!g.loaded) {
    root.innerHTML = `<div class="gl-loading">${g.loading ? "Chargement des photos…" : ""}</div>`;
    return;
  }

  const list = visible();
  const pendingCount = g.items.filter((item) => !item.purchased).length;
  const boughtCount = g.items.length - pendingCount;
  const allSelected = list.length && list.every((item) => g.selection.has(item.id));

  root.innerHTML = `
    <div class="gl-head">
      <div>
        <p class="eyebrow">À acheter en magasin</p>
        <h3>Photos à acheter</h3>
      </div>
      <button class="primary-button gl-add" type="button" data-gl-upload>${icon("plus")} Ajouter des photos</button>
      <input id="gl-file" type="file" accept="image/*" multiple hidden />
    </div>
    <div id="gl-banner"></div>
    <div class="gl-tabs" role="tablist">
      <button class="gl-tab${g.filters.tab === "pending" ? " is-active" : ""}" type="button" data-gl-tab="pending">À acheter <b>${pendingCount}</b></button>
      <button class="gl-tab${g.filters.tab === "bought" ? " is-active" : ""}" type="button" data-gl-tab="bought">Acheté <b>${boughtCount}</b></button>
    </div>
    ${chipsHtml()}
    ${
      list.length
        ? `<div class="gl-toolbar"><button class="g-select-all" type="button" data-gl-selectall>${allSelected ? "Tout désélectionner" : "Tout sélectionner"}</button><span class="gl-count">${list.length} photo${list.length > 1 ? "s" : ""}</span></div>
           <div class="gl-grid">${list.map(tileHtml).join("")}</div>`
        : `<div class="g-empty"><span class="g-empty-icon">${icon("photos")}</span><strong>${g.items.length ? "Rien ici" : "Aucune photo"}</strong><p>${g.items.length ? "Change de filtre pour voir les autres photos." : "Ajoute des photos des articles à acheter."}</p></div>`
    }
  `;

  renderBanner();
  renderBar();
}

function renderBanner() {
  const banner = $("#gl-banner");
  if (!banner) return;
  banner.innerHTML =
    g.pending > 0
      ? `<div class="gl-banner">Optimisation des anciennes photos (une seule fois) : encore ${g.pending}…</div>`
      : "";
}

function refreshTilePhoto(item) {
  const tile = document.querySelector(`[data-gl-tile="${CSS.escape(item.id)}"] .gl-photo`);
  if (tile) tile.innerHTML = `<img src="${esc(item.imageUrl)}?w=360" alt="" loading="lazy" decoding="async" />`;
}

function refreshTile(id) {
  const item = g.items.find((entry) => entry.id === id);
  const tile = document.querySelector(`[data-gl-tile="${CSS.escape(id)}"]`);
  if (item && tile) tile.outerHTML = tileHtml(item);
}

// --- Sélection groupée ----------------------------------------------------------------------------------
function categoryOptions(selected = "") {
  return [{ name: "", icon: "" }, ...g.categories]
    .map((category) => `<option value="${esc(category.name)}"${category.name === selected ? " selected" : ""}>${esc(category.name ? `${category.icon} ${category.name}` : "Sans catégorie")}</option>`)
    .join("");
}

function renderBar() {
  let bar = $("#bulk-bar");

  if (!bar) {
    bar = document.createElement("div");
    bar.id = "bulk-bar";
    bar.className = "bulk-bar";
    document.body.append(bar);
  }

  if (document.body.dataset.page !== "gallery") return;

  if (!g.selection.size) {
    bar.hidden = true;
    bar.innerHTML = "";
    document.body.classList.remove("has-bulk-bar");
    return;
  }

  const items = g.items.filter((item) => g.selection.has(item.id));
  const bought = items.every((item) => item.purchased);

  bar.innerHTML = `
    <div class="bulk-bar-info">
      <button class="bulk-bar-clear" type="button" data-gl-clear aria-label="Annuler la sélection">${icon("close")}</button>
      <span><strong>${items.length}</strong> photo${items.length > 1 ? "s" : ""}</span>
    </div>
    <div class="bulk-bar-actions">
      <button class="bulk-btn gl-compact ${bought ? "bulk-btn--undo" : "bulk-btn--buy"}" type="button" title="${bought ? "Remettre à acheter" : "Marquer acheté"}" data-gl-bulk="${bought ? "unpurchase" : "purchase"}">${icon(bought ? "undo" : "check")}<span>${bought ? "À acheter" : "Acheté"}</span></button>
      <button class="bulk-btn bulk-btn--undo" type="button" title="Boutique" aria-label="Boutique" data-gl-bulk="shop">${icon("shop")}<span>Boutique</span></button>
      <button class="bulk-btn bulk-btn--undo" type="button" title="Catégorie" aria-label="Catégorie" data-gl-bulk="category">${icon("tag")}<span>Catégorie</span></button>
      <button class="bulk-btn bulk-btn--delete" type="button" title="Supprimer" aria-label="Supprimer" data-gl-bulk="delete">${icon("trash")}<span>Supprimer</span></button>
    </div>
    <div class="gl-picker" id="gl-picker" hidden></div>`;
  bar.hidden = false;
  document.body.classList.add("has-bulk-bar");
}

function syncSelection() {
  document.querySelectorAll("[data-gl-tile]").forEach((tile) => {
    const on = g.selection.has(tile.dataset.glTile);
    tile.classList.toggle("is-selected", on);
    const check = $("[data-gl-select]", tile);
    check?.classList.toggle("is-checked", on);
    check?.setAttribute("aria-pressed", String(on));
  });
  const all = $("[data-gl-selectall]");
  const list = visible();
  if (all) all.textContent = list.length && list.every((item) => g.selection.has(item.id)) ? "Tout désélectionner" : "Tout sélectionner";
  renderBar();
}

function showPicker(kind) {
  const picker = $("#gl-picker");
  if (!picker) return;

  picker.hidden = !picker.hidden || picker.dataset.kind !== kind ? false : true;
  picker.dataset.kind = kind;

  if (kind === "shop") {
    picker.innerHTML = [...g.shops.map((shop) => `<button type="button" data-gl-pick-shop="${esc(shop)}">${SHOP_ICON[shop] || ""} ${esc(shop)}</button>`)].join("");
  } else {
    picker.innerHTML = `<select data-gl-pick-category>${categoryOptions("")}</select>`;
    $("[data-gl-pick-category]", picker).insertAdjacentHTML("afterbegin", '<option value="__choose__" selected disabled>Choisir une catégorie…</option>');
  }
}

async function bulk(action, extra = {}) {
  const ids = [...g.selection];
  if (!ids.length) return;

  if (action === "delete") {
    const confirmed = await bridge().openConfirmDialog({
      title: `Supprimer ${ids.length} photo${ids.length > 1 ? "s" : ""} ?`,
      message: "Les photos sélectionnées seront supprimées définitivement.",
      confirmLabel: `Supprimer (${ids.length})`,
    });
    if (!confirmed) return;
  }

  try {
    const result = await bridge().apiRequest("/api/gallery-items/bulk", { method: "POST", body: { ids, action, ...extra } });
    bridge().showFlash(result.message);
    g.selection.clear();
    await load(true);
  } catch (error) {
    bridge().showFlash(error.message, "error");
  }
}

// --- Fiche d'une photo ----------------------------------------------------------------------------------
function ensureSheet() {
  let sheet = $("#gl-sheet");

  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "gl-sheet";
    sheet.className = "gl-sheet";
    sheet.hidden = true;
    document.body.append(sheet);
  }

  return sheet;
}

function openSheet(id) {
  const item = g.items.find((entry) => entry.id === id);
  if (!item) return;

  g.openId = id;
  const sheet = ensureSheet();
  const total = item.desiredQty * item.foundPriceEur;

  sheet.innerHTML = `
    <div class="gl-sheet-backdrop" data-gl-close></div>
    <article class="gl-sheet-card" role="dialog" aria-modal="true" aria-label="Fiche de la photo">
      <button class="gl-sheet-x" type="button" data-gl-close aria-label="Fermer">${icon("close")}</button>
      <button class="gl-sheet-photo" type="button" data-image-src="${esc(item.imageUrl)}" data-image-alt="Photo à acheter" ${item.imageUrl ? "" : "disabled"}>
        ${item.imageUrl ? `<img src="${esc(item.imageUrl)}${item.imageUrl.startsWith("/media/") ? "?w=720" : ""}" alt="" />` : `<span class="gl-placeholder">Photo illisible</span>`}
      </button>
      <div class="gl-sheet-body">
        <div class="gl-field">
          <span>Boutique</span>
          <div class="gl-seg" role="group">
            ${g.shops.map((shop) => `<button type="button" class="${item.shop === shop ? "is-active" : ""}" data-gl-set-shop="${esc(shop)}">${SHOP_ICON[shop] || ""} ${esc(shop)}</button>`).join("")}
          </div>
        </div>
        <div class="gl-field">
          <span>Catégorie</span>
          <select data-gl-field="category">${categoryOptions(item.category)}<option value="__new__">＋ Nouvelle catégorie…</option></select>
          <form class="gl-newcat gl-newcat--sheet" data-gl-newcat-form data-for-sheet hidden><input name="name" placeholder="Nom de la catégorie" maxlength="40" autocomplete="off" /><button type="submit">Ajouter</button></form>
        </div>
        <div class="gl-two">
          <div class="gl-field">
            <span>Quantité</span>
            <div class="g-stepper">
              <button type="button" data-gl-step="-1" aria-label="Moins">${icon("minus")}</button>
              <input type="number" min="1" step="1" inputmode="numeric" value="${item.desiredQty}" data-gl-field="desiredQty" aria-label="Quantité" />
              <button type="button" data-gl-step="1" aria-label="Plus">${icon("plus")}</button>
            </div>
          </div>
          <div class="gl-field">
            <span>Prix en magasin</span>
            <label class="g-price"><input type="number" min="0" step="0.01" inputmode="decimal" value="${item.foundPriceEur || ""}" placeholder="0" data-gl-field="foundPriceEur" aria-label="Prix en euros" /><em>€</em></label>
          </div>
        </div>
        <p class="gl-total" id="gl-total">${total > 0 ? `Total : <strong>${money(total)}</strong>` : ""}</p>
        <div class="gl-field">
          <span>Note</span>
          <textarea rows="2" placeholder="Taille, couleur, détail…" data-gl-field="note">${esc(item.note)}</textarea>
        </div>
        <div class="gl-actions">
          <button class="gl-act ${item.purchased ? "gl-act--undo" : "gl-act--buy"}" type="button" data-gl-toggle>${icon(item.purchased ? "undo" : "check")} ${item.purchased ? "Remettre à acheter" : "Marquer acheté"}</button>
          <button class="gl-act gl-act--ghost" type="button" data-gl-product>${icon("box")} Créer un produit</button>
          <button class="gl-act gl-act--danger" type="button" data-gl-delete>${icon("trash")} Supprimer</button>
        </div>
      </div>
    </article>`;
  sheet.hidden = false;
  document.body.classList.add("gl-sheet-open");
}

function closeSheet() {
  const sheet = $("#gl-sheet");
  if (sheet) sheet.hidden = true;
  g.openId = null;
  document.body.classList.remove("gl-sheet-open");
}

async function patch(id, body) {
  const item = g.items.find((entry) => entry.id === id);
  if (!item) return;

  try {
    const result = await bridge().apiRequest(`/api/gallery-items/${id}`, { method: "PATCH", body });
    Object.assign(item, result.item, { imageUrl: item.imageUrl || result.item.imageUrl });
    refreshTile(id);

    const total = $("#gl-total");
    if (total && g.openId === id) {
      const sum = item.desiredQty * item.foundPriceEur;
      total.innerHTML = sum > 0 ? `Total : <strong>${money(sum)}</strong>` : "";
    }
  } catch (error) {
    bridge().showFlash(error.message, "error");
  }
}

async function addCategory(name) {
  const result = await bridge().apiRequest("/api/categories", { method: "POST", body: { name } });
  g.categories = result.categories;
  return result.name;
}

// --- Ajout de photos --------------------------------------------------------------------------------------
async function compress(file, maxSide = 900) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL("image/webp", 0.72);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.78);
}

async function upload(files) {
  const images = [...files].filter((file) => file.type.startsWith("image/"));
  if (!images.length || g.uploading) return;

  g.uploading = true;
  const button = $("[data-gl-upload]");
  const shop = ["Normal", "Action"].includes(g.filters.shop) ? g.filters.shop : store.get("shop", "Action");
  const category = !["all", "none"].includes(g.filters.category) ? g.filters.category : "";
  store.set("shop", shop);
  let added = 0;

  try {
    for (const [index, file] of images.entries()) {
      if (button) {
        button.disabled = true;
        button.textContent = `Envoi ${index + 1}/${images.length}…`;
      }
      const imageUpload = await compress(file);
      await bridge().apiRequest("/api/gallery-items", { method: "POST", body: { imageUpload, shop, category } });
      added += 1;
    }

    bridge().showFlash(added > 1 ? `${added} photos ajoutées (${shop}).` : `Photo ajoutée (${shop}).`);
    g.filters.tab = "pending";
    await load(true);
  } catch (error) {
    bridge().showFlash(error.message, "error");
    if (added) await load(true);
  } finally {
    g.uploading = false;
    render();
  }
}

// --- Photo → produit -----------------------------------------------------------------------------------------
function updateProductHint() {
  const form = $("#photo-product-form");
  const hint = $("#photo-product-hint");
  const item = g.items.find((entry) => entry.id === form?.elements.galleryItemId.value);
  if (!form || !hint || !item) return;

  const settings = bridge().getState().settings ?? {};
  const weightKg = (Number(form.elements.weightG.value) || 0) / 1000;
  const landed = (item.foundPriceEur + weightKg * Number(settings.transportRatePerKgEur || 0)) * Number(settings.eurToMad || 0);

  hint.textContent = weightKg
    ? `Coût estimé au Maroc : ${bridge().formatCurrency(landed, "MAD")} (achat ${money(item.foundPriceEur)} + transport)`
    : `Prix d'achat repris de la photo : ${money(item.foundPriceEur)} · quantité ${item.desiredQty}`;
}

function openProductModal(id) {
  const item = g.items.find((entry) => entry.id === id);
  const form = $("#photo-product-form");
  if (!item || !form) return;

  closeSheet();
  form.reset();
  form.elements.galleryItemId.value = id;
  $("#photo-product-img").src = item.imageUrl;
  $("#photo-product-error").hidden = true;
  updateProductHint();
  bridge().openModal("photo-product-modal");
  form.elements.name.focus();
}

async function submitProduct(event) {
  event.preventDefault();
  const form = event.target;
  const error = $("#photo-product-error");
  const submit = form.querySelector('[type="submit"]');
  error.hidden = true;
  submit.disabled = true;

  try {
    const result = await bridge().apiRequest(`/api/gallery-items/${form.elements.galleryItemId.value}/to-product`, {
      method: "POST",
      body: { name: form.elements.name.value, weightG: Number(form.elements.weightG.value), salePriceMad: Number(form.elements.salePriceMad.value) },
    });
    bridge().closeModal("photo-product-modal");
    bridge().showFlash(result.message);
    g.loaded = false;
    await bridge().reload?.();
    bridge().navigateToPath("/wishlist");
  } catch (caught) {
    error.textContent = caught.message;
    error.hidden = false;
  } finally {
    submit.disabled = false;
  }
}

// --- Événements -----------------------------------------------------------------------------------------------
document.addEventListener("click", async (event) => {
  const target = event.target;

  if (document.body.dataset.page !== "gallery" && !target.closest("#gl-sheet")) return;

  if (target.closest("[data-gl-upload]")) return void $("#gl-file")?.click();

  const tab = target.closest("[data-gl-tab]");
  if (tab) {
    g.filters.tab = tab.dataset.glTab;
    g.selection.clear();
    return render();
  }

  const shopChip = target.closest("[data-gl-shop]");
  if (shopChip) {
    g.filters.shop = shopChip.dataset.glShop;
    g.filters.category = "all";
    return render();
  }

  const categoryChip = target.closest("[data-gl-category]");
  if (categoryChip) {
    g.filters.category = categoryChip.dataset.glCategory;
    return render();
  }

  if (target.closest("[data-gl-addcat]")) {
    g.addingCategory = true;
    render();
    return void $(".gl-newcat input")?.focus();
  }

  const select = target.closest("[data-gl-select]");
  if (select) {
    const id = select.dataset.glSelect;
    g.selection.has(id) ? g.selection.delete(id) : g.selection.add(id);
    return syncSelection();
  }

  if (target.closest("[data-gl-selectall]")) {
    const list = visible();
    const all = list.every((item) => g.selection.has(item.id));
    list.forEach((item) => (all ? g.selection.delete(item.id) : g.selection.add(item.id)));
    return syncSelection();
  }

  const open = target.closest("[data-gl-open]");
  if (open) {
    // Dès qu'une sélection est en cours, toucher une photo la coche au lieu d'ouvrir la fiche.
    if (g.selection.size) {
      const id = open.dataset.glOpen;
      g.selection.has(id) ? g.selection.delete(id) : g.selection.add(id);
      return syncSelection();
    }
    return openSheet(open.dataset.glOpen);
  }

  if (target.closest("[data-gl-close]")) return closeSheet();
  if (target.closest("[data-gl-clear]")) {
    g.selection.clear();
    return syncSelection();
  }

  const bulkButton = target.closest("[data-gl-bulk]");
  if (bulkButton) {
    const action = bulkButton.dataset.glBulk;
    if (action === "shop" || action === "category") return showPicker(action);
    return void bulk(action);
  }

  const pickShop = target.closest("[data-gl-pick-shop]");
  if (pickShop) return void bulk("shop", { shop: pickShop.dataset.glPickShop });

  const setShop = target.closest("[data-gl-set-shop]");
  if (setShop && g.openId) {
    const item = g.items.find((entry) => entry.id === g.openId);
    const shop = setShop.dataset.glSetShop;
    store.set("shop", shop);
    document.querySelectorAll("[data-gl-set-shop]").forEach((button) => button.classList.toggle("is-active", button === setShop));
    if (item) item.shop = shop;
    return void patch(g.openId, { shop });
  }

  const step = target.closest("[data-gl-step]");
  if (step && g.openId) {
    const input = $('[data-gl-field="desiredQty"]');
    input.value = String(Math.max(1, (Number.parseInt(input.value, 10) || 1) + Number(step.dataset.glStep)));
    return void patch(g.openId, { desiredQty: Number(input.value) });
  }

  if (target.closest("[data-gl-toggle]") && g.openId) {
    const item = g.items.find((entry) => entry.id === g.openId);
    const id = g.openId;
    closeSheet();
    await patch(id, { purchased: !item.purchased });
    return render();
  }

  if (target.closest("[data-gl-product]") && g.openId) return openProductModal(g.openId);

  if (target.closest("[data-gl-delete]") && g.openId) {
    const id = g.openId;
    const confirmed = await bridge().openConfirmDialog({
      title: "Supprimer cette photo ?",
      message: "La photo sera retirée définitivement.",
      confirmLabel: "Supprimer la photo",
    });
    if (!confirmed) return;
    closeSheet();
    try {
      await bridge().apiRequest(`/api/gallery-items/${id}`, { method: "DELETE" });
      g.items = g.items.filter((item) => item.id !== id);
      g.selection.delete(id);
      render();
      bridge().showFlash("Photo supprimée.");
    } catch (error) {
      bridge().showFlash(error.message, "error");
    }
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;

  if (target.id === "gl-file") {
    const files = target.files ?? [];
    await upload(files);
    target.value = "";
    return;
  }

  if (target.matches("[data-gl-pick-category]")) {
    if (target.value && target.value !== "__choose__") await bulk("category", { category: target.value === "" ? "" : target.value });
    else if (target.value === "") await bulk("category", { category: "" });
    return;
  }

  const field = target.closest("[data-gl-field]");
  if (!field || !g.openId) return;

  const key = field.dataset.glField;

  if (key === "category" && field.value === "__new__") {
    const form = $("[data-for-sheet]");
    form.hidden = false;
    field.value = g.items.find((entry) => entry.id === g.openId)?.category ?? "";
    return void form.querySelector("input")?.focus();
  }

  if (key === "desiredQty") {
    const value = Math.max(1, Math.round(Number(field.value) || 1));
    field.value = String(value);
    return void patch(g.openId, { desiredQty: value });
  }

  if (key === "foundPriceEur") return void patch(g.openId, { foundPriceEur: Math.max(0, Number(field.value) || 0) });

  return void patch(g.openId, { [key]: field.value });
});

document.addEventListener("submit", async (event) => {
  const form = event.target;

  if (form.id === "photo-product-form") return void submitProduct(event);

  if (form.matches("[data-gl-newcat-form]")) {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) return;

    try {
      const saved = await addCategory(name);
      g.addingCategory = false;

      if (form.hasAttribute("data-for-sheet") && g.openId) {
        const id = g.openId;
        await patch(id, { category: saved });
        openSheet(id);
      } else {
        g.filters.category = "all";
        render();
      }

      bridge().showFlash(`Catégorie « ${saved} » ajoutée.`);
    } catch (error) {
      bridge().showFlash(error.message, "error");
    }
  }
});

document.addEventListener("input", (event) => {
  if (event.target.closest("#photo-product-form")) updateProductHint();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && g.openId) closeSheet();
});

function onPage(page) {
  if (page === "gallery" && bridge()?.getState().auth?.isAuthenticated) {
    renderBar();
    void load(true);
    return;
  }

  if (page !== "gallery") {
    closeSheet();
  }
}

document.addEventListener("abg:page", (event) => onPage(event.detail.page));
document.addEventListener("abg:ready", (event) => {
  g.loaded = false;
  onPage(event.detail.page);
});
