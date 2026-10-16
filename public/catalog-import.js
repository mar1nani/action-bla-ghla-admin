// Catalogue clients — ajout d'articles : à partir du CODE d'une page (article ou liste) ou d'une capture d'écran lue par l'IA.
// Dans les deux cas : relecture des articles (titre, photo, catégorie, prix en €) avant l'ajout en brouillon.

const $ = (selector, root = document) => root.querySelector(selector);
const bridge = () => window.abg;
const esc = (value) => bridge().escapeHtml(value ?? "");

const session = { items: [], existing: [], onDone: null, onAdded: null, busy: false, token: 0, photoJob: Promise.resolve(), photoText: "", sourceLabel: "" };
const MAX_IMAGES = 10;
const KNOWN = ["Cuisine", "Meubles", "Déco", "Salle de bain", "Entretien", "Rangement", "Textile & linge", "Jardin & extérieur", "Enfants & jouets", "Papeterie & loisirs", "Alimentation", "Bricolage", "Électro & high-tech", "Mode & accessoires", "Autres"];

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function setTab(name) {
  document.querySelectorAll("[data-import-tab]").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.importTab === name));
  document.querySelectorAll("[data-import-pane]").forEach((pane) => (pane.hidden = pane.dataset.importPane !== name));
}

function setStatus(message, tone = "info") {
  const box = $("#import-status");
  box.hidden = !message;
  box.dataset.tone = tone;
  box.textContent = message || "";
}

function setBusy(busy) {
  session.busy = busy;
  document.querySelectorAll("#import-sources .primary-button, #import-sources textarea, #import-sources input").forEach((element) => {
    element.disabled = busy;
  });
}

function markDuplicates(items) {
  const known = new Set(session.existing.map((item) => `${normalize(item.title)}|${item.priceEur ?? ""}`));
  return items.map((item) => {
    const duplicate = Boolean(item.title) && known.has(`${normalize(item.title)}|${item.priceEur ?? ""}`);
    return { ...item, duplicate, selected: !duplicate };
  });
}

function showReview(items, sourceLabel = "") {
  session.items = markDuplicates(items).map((item) => ({
    ...item,
    needsPhoto: !item.imageId && !item.imageData && /^https?:/i.test(item.imageUrl || ""),
  }));
  session.sourceLabel = sourceLabel;
  session.photoText = "";
  $("#import-sources").hidden = true;
  renderReview();
  startPhotoJob();
}

// --- Photos des articles lus dans le code : téléchargées par lots pendant la relecture ---------------
function updatePhotoProgress(done, total) {
  const failed = session.items.filter((item) => item.photoFailed).length;
  session.photoText =
    done >= total
      ? failed
        ? `Photos prêtes (${failed} introuvable${failed > 1 ? "s" : ""} : ajoute-les à la main)`
        : "Photos prêtes ✓"
      : `Téléchargement des photos ${done}/${total}…`;
  const label = $("#import-photo-progress");
  if (label) label.textContent = session.photoText;
}

function startPhotoJob() {
  const token = (session.token += 1);
  const todo = session.items.map((item, index) => ({ item, index })).filter(({ item }) => item.needsPhoto);

  if (!todo.length) {
    session.photoJob = Promise.resolve();
    return;
  }

  updatePhotoProgress(0, todo.length);

  session.photoJob = (async () => {
    let done = 0;
    let failures = 0;

    for (let start = 0; start < todo.length; start += 6) {
      if (token !== session.token) return;
      const batch = todo.slice(start, start + 6);

      try {
        const result = await bridge().apiRequest("/api/catalog/fetch-images", {
          method: "POST",
          body: { urls: batch.map(({ item }) => item.imageUrl) },
        });

        result.results.forEach((entry, position) => {
          const { item, index } = batch[position];
          item.needsPhoto = false;

          if (entry.imageId) {
            item.imageId = entry.imageId;
            item.imageUrl = `/media/${entry.imageId}`;
            const img = document.querySelector(`[data-import-card="${index}"] .import-photo img`);
            if (img) img.src = item.imageUrl;
          } else {
            item.photoFailed = true;
            item.imageUrl = "";
            failures += 1;
          }
        });
      } catch {
        batch.forEach(({ item }) => {
          item.needsPhoto = false;
          item.photoFailed = true;
          item.imageUrl = "";
          failures += 1;
        });
      }

      done += batch.length;
      if (token === session.token) updatePhotoProgress(done, todo.length);
    }

    if (token === session.token && failures) renderReview();
  })();
}

// --- Images : réduction, découpe (capture), photo ajoutée à la main -----------------------------------
function drawScaled(bitmap, maxSide) {
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function encode(canvas) {
  const webp = canvas.toDataURL("image/webp", 0.82);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.86);
}

/** Découpe un rectangle (en millièmes de l'image) de la capture ; 1,5 % de marge autour de la photo. */
function crop(canvas, box, maxSide = 900) {
  const pad = 0.015;
  const left = Math.max(0, box.x / 1000 - pad);
  const top = Math.max(0, box.y / 1000 - pad);
  const right = Math.min(1, (box.x + box.width) / 1000 + pad);
  const bottom = Math.min(1, (box.y + box.height) / 1000 + pad);
  const sx = Math.round(left * canvas.width);
  const sy = Math.round(top * canvas.height);
  const sw = Math.max(8, Math.round((right - left) * canvas.width));
  const sh = Math.max(8, Math.round((bottom - top) * canvas.height));
  const ratio = Math.min(1, maxSide / Math.max(sw, sh));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * ratio));
  out.height = Math.max(1, Math.round(sh * ratio));
  out.getContext("2d").drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return encode(out);
}

async function attachPhoto(index, file) {
  try {
    const bitmap = await createImageBitmap(file);
    const item = session.items[index];
    item.imageData = encode(drawScaled(bitmap, 900));
    item.imageUrl = item.imageData;
    item.imageId = "";
    item.photoFailed = false;
    item.needsPhoto = false;
    renderReview();
  } catch {
    bridge().showFlash("Impossible de lire cette image.", "error");
  }
}

// --- Source 1 : code d'une page ----------------------------------------------------------------------
const slimHtml = (html) =>
  html.replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");

async function analyzeHtml() {
  const raw = $("#import-html").value.trim();
  const baseUrl = $("#import-html-base").value.trim();

  if (raw.length < 300) {
    setStatus("Colle d'abord le code de la page (Sélectionner tout, Copier, Coller).", "error");
    return;
  }

  // Plusieurs pages collées à la suite : on les sépare à chaque <!DOCTYPE html>.
  const pages = raw.split(/(?=<!doctype\s+html)/i).filter((part) => part.trim().length > 300);
  const parts = pages.length ? pages : [raw];

  setBusy(true);
  const collected = [];
  let sourceLabel = "";
  let lastError = "";

  try {
    for (const [index, html] of parts.entries()) {
      setStatus(parts.length > 1 ? `Analyse de la page ${index + 1}/${parts.length}…` : "Analyse du code…");

      try {
        const result = await bridge().apiRequest("/api/catalog/import-html", {
          method: "POST",
          body: { html: slimHtml(html), baseUrl },
        });
        sourceLabel = result.sourceLabel;
        collected.push(...result.items);
      } catch (error) {
        lastError = error.message;
      }
    }

    if (!collected.length) {
      setStatus(lastError || "Aucun article reconnu dans ce code.", "error");
      return;
    }

    setStatus("");
    showReview(collected, sourceLabel);
  } finally {
    setBusy(false);
  }
}

// --- Source 2 : capture d'écran lue par l'IA -----------------------------------------------------------
async function analyzeFile(file, notices) {
  const bitmap = await createImageBitmap(file);
  const canvas = drawScaled(bitmap, 1568);

  try {
    const { items } = await bridge().apiRequest("/api/catalog/extract", {
      method: "POST",
      body: { image: canvas.toDataURL("image/jpeg", 0.85) },
    });

    if (items.length) {
      return items.map((item) => {
        const imageData = crop(canvas, item.box);
        return { ...item, imageData, imageUrl: imageData };
      });
    }

    notices.push("L'IA n'a reconnu aucun article sur une capture : elle est ajoutée telle quelle, complète le titre.");
  } catch (error) {
    notices.push(`${error.message} La capture est ajoutée telle quelle : complète le titre.`);
  }

  const whole = encode(drawScaled(bitmap, 900));
  return [{ title: "", description: "", priceEur: null, category: "Autres", imageData: whole, imageUrl: whole }];
}

async function analyzeFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/")).slice(0, MAX_IMAGES);

  if (!files.length) {
    setStatus("Choisis une image (capture d'écran ou photo).", "error");
    return;
  }

  setBusy(true);
  const notices = [];
  const collected = [];

  try {
    for (const [index, file] of files.entries()) {
      setStatus(`Analyse de la capture ${index + 1}/${files.length}… (quelques secondes)`);
      collected.push(...(await analyzeFile(file, notices)));
    }

    setStatus([...new Set(notices)].join(" "));
    showReview(collected, "Capture d'écran");
  } catch (error) {
    setStatus(`Image illisible : ${error.message}`, "error");
  } finally {
    setBusy(false);
    $("#import-files").value = "";
  }
}

// --- Relecture ----------------------------------------------------------------------------------------
function selectedCount() {
  return session.items.filter((item) => item.selected).length;
}

function renderReview() {
  const review = $("#import-review");
  const selected = selectedCount();
  const withPrice = session.items.filter((item) => item.selected && item.priceEur > 0).length;

  review.hidden = false;
  review.innerHTML = `
    <div class="import-review-head">
      <div>
        <strong>${session.items.length} article${session.items.length > 1 ? "s" : ""} trouvé${session.items.length > 1 ? "s" : ""}</strong>
        <small>${session.sourceLabel ? `Source : ${esc(session.sourceLabel)} · ` : ""}${withPrice} avec prix en euros</small>
        <small id="import-photo-progress">${esc(session.photoText)}</small>
      </div>
      <button class="g-select-all" type="button" data-import-toggle-all>${selected === session.items.length ? "Tout décocher" : "Tout cocher"}</button>
    </div>
    <div class="import-grid">
      ${session.items
        .map(
          (item, index) => `
        <article class="import-card${item.selected ? " is-selected" : ""}${item.duplicate ? " is-duplicate" : ""}" data-import-card="${index}">
          <div class="import-photo">
            ${
              item.imageUrl
                ? `<img src="${esc(item.imageUrl)}" alt="" loading="lazy" />`
                : `<label class="import-photo-add">📷 Ajouter la photo<input type="file" accept="image/*" hidden data-import-photo="${index}" /></label>`
            }
            <button class="select-check${item.selected ? " is-checked" : ""}" type="button" data-import-select="${index}" aria-pressed="${item.selected}" aria-label="Inclure">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>
            </button>
            ${item.duplicate ? `<span class="cat-badge">Déjà ajouté</span>` : ""}
          </div>
          <div class="import-body">
            <input class="cat-title" value="${esc(item.title)}" data-import-field="title" data-import-index="${index}" aria-label="Titre" maxlength="140" placeholder="Titre à compléter" />
            <select class="cat-category" data-import-field="category" data-import-index="${index}" aria-label="Catégorie">
              ${[...new Set([...KNOWN, item.category])].map((name) => `<option value="${esc(name)}"${name === item.category ? " selected" : ""}>${esc(name)}</option>`).join("")}
            </select>
            <label class="cat-price">
              <span>Prix source</span>
              <span class="cat-input"><input type="number" min="0" step="0.01" inputmode="decimal" value="${item.priceEur ?? ""}" data-import-field="priceEur" data-import-index="${index}" placeholder="—" /><em>€</em></span>
            </label>
          </div>
        </article>`,
        )
        .join("")}
    </div>
    <div class="import-footer">
      <button class="ghost-button" type="button" data-import-back>← Recommencer</button>
      <button class="primary-button" type="button" data-import-confirm ${selected ? "" : "disabled"}>Ajouter ${selected} article${selected > 1 ? "s" : ""}</button>
    </div>
    <p class="import-hint">Les articles sont ajoutés en brouillon : tu mets ensuite ton prix en dirhams, puis tu publies.</p>
  `;
}

function refreshFooter() {
  const selected = selectedCount();
  const button = $("[data-import-confirm]");

  if (button) {
    button.disabled = !selected;
    button.textContent = `Ajouter ${selected} article${selected > 1 ? "s" : ""}`;
  }

  const all = $("[data-import-toggle-all]");
  if (all) all.textContent = selected === session.items.length ? "Tout décocher" : "Tout cocher";
}

async function confirmImport() {
  const chosen = session.items.filter((item) => item.selected);

  if (!chosen.length) return;

  const missing = chosen.filter((item) => !item.title.trim());

  if (missing.length) {
    document.querySelectorAll("[data-import-card]").forEach((card) => {
      const item = session.items[Number(card.dataset.importCard)];
      card.classList.toggle("is-missing", Boolean(item?.selected && !item.title.trim()));
    });
    bridge().showFlash("Complète le titre des articles entourés en rouge (ou décoche-les).", "error");
    return;
  }

  session.busy = true;
  const button = $("[data-import-confirm]");
  button.disabled = true;

  try {
    if (chosen.some((item) => item.needsPhoto)) {
      button.textContent = "Téléchargement des photos…";
      await session.photoJob;
    }

    let done = 0;
    const pending = chosen.filter((item) => !item.imageId && item.imageData);
    let cursor = 0;

    await Promise.all(
      Array.from({ length: Math.min(4, pending.length) }, async () => {
        while (cursor < pending.length) {
          const item = pending[cursor];
          cursor += 1;
          const uploaded = await bridge().apiRequest("/api/catalog/images", { method: "POST", body: { imageUpload: item.imageData } });
          item.imageId = uploaded.id;
          done += 1;
          button.textContent = `Envoi des photos ${done}/${pending.length}…`;
        }
      }),
    );

    button.textContent = "Ajout au catalogue…";

    for (let start = 0; start < chosen.length; start += 100) {
      await bridge().apiRequest("/api/catalog/items/bulk-create", {
        method: "POST",
        body: {
          sourceLabel: session.sourceLabel || "Ajout manuel",
          items: chosen.slice(start, start + 100).map((item) => ({
            title: item.title,
            description: item.description || "",
            category: item.category,
            priceEur: item.priceEur === "" || item.priceEur == null ? null : item.priceEur,
            imageId: item.imageId || "",
            sourceUrl: item.sourceUrl || "",
          })),
        },
      });
    }

    bridge().closeModal("import-modal");
    bridge().showFlash(`${chosen.length} article(s) ajouté(s) au catalogue en brouillon.`);
    session.onAdded?.();
    await session.onDone?.();
  } catch (error) {
    bridge().showFlash(error.message, "error");
    button.disabled = false;
    refreshFooter();
  } finally {
    session.busy = false;
  }
}

function resetUi() {
  session.token += 1;
  $("#import-sources").hidden = false;
  $("#import-review").hidden = true;
  $("#import-review").innerHTML = "";
  setStatus("");
}

export function openImport({ existing = [], onDone, onAdded } = {}) {
  session.existing = existing;
  session.onDone = onDone;
  session.onAdded = onAdded;
  resetUi();
  setTab("html");
  bridge().openModal("import-modal");
  $("#import-html")?.focus();
}

const modalOpen = () => !$("#import-modal")?.hidden;
const capturePaneOpen = () => $('[data-import-pane="capture"]') && !$('[data-import-pane="capture"]').hidden;

if (!window.__abgImportBound) {
  window.__abgImportBound = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    const tab = target.closest("[data-import-tab]");

    if (tab) return setTab(tab.dataset.importTab);
    if (target.closest("#import-html-go")) return void analyzeHtml();

    const select = target.closest("[data-import-select]");

    if (select) {
      const item = session.items[Number(select.dataset.importSelect)];
      item.selected = !item.selected;
      select.classList.toggle("is-checked", item.selected);
      select.closest(".import-card").classList.toggle("is-selected", item.selected);
      return refreshFooter();
    }

    if (target.closest("[data-import-toggle-all]")) {
      const all = selectedCount() === session.items.length;
      session.items.forEach((item) => (item.selected = !all));
      return renderReview();
    }

    if (target.closest("[data-import-back]")) return resetUi();
    if (target.closest("[data-import-confirm]")) return void confirmImport();
  });

  document.addEventListener("change", (event) => {
    if (event.target.id === "import-files") {
      void analyzeFiles(event.target.files ?? []);
      return;
    }

    const photo = event.target.closest("[data-import-photo]");

    if (photo && photo.files?.[0]) {
      void attachPhoto(Number(photo.dataset.importPhoto), photo.files[0]);
      return;
    }

    const field = event.target.closest("[data-import-field]");

    if (field) {
      const item = session.items[Number(field.dataset.importIndex)];
      const key = field.dataset.importField;
      item[key] = key === "priceEur" ? (field.value === "" ? "" : Number(field.value)) : field.value;
      if (key === "title") field.closest(".import-card")?.classList.remove("is-missing");
    }
  });

  // Capture collée (Ctrl/Cmd + V) ou glissée, quand l'onglet « Capture » est affiché.
  document.addEventListener("paste", (event) => {
    if (!modalOpen() || session.busy || $("#import-sources").hidden || !capturePaneOpen()) return;
    const images = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith("image/"));

    if (images.length) {
      event.preventDefault();
      void analyzeFiles(images);
    }
  });

  document.addEventListener("dragover", (event) => {
    if (modalOpen() && event.target.closest?.("#import-dropzone")) event.preventDefault();
  });

  document.addEventListener("drop", (event) => {
    if (modalOpen() && event.target.closest?.("#import-dropzone")) {
      event.preventDefault();
      if (!session.busy) void analyzeFiles(event.dataTransfer?.files ?? []);
    }
  });
}
