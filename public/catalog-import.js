// Catalogue clients — ajout d'articles depuis une capture d'écran lue par l'IA (titre, photo, catégorie, prix en €).

const $ = (selector, root = document) => root.querySelector(selector);
const bridge = () => window.abg;
const esc = (value) => bridge().escapeHtml(value ?? "");

const session = { items: [], existing: [], onDone: null, onAdded: null, busy: false, notice: "" };
const MAX_IMAGES = 10;
const KNOWN = ["Cuisine", "Meubles", "Déco", "Salle de bain", "Entretien", "Rangement", "Textile & linge", "Jardin & extérieur", "Enfants & jouets", "Papeterie & loisirs", "Alimentation", "Bricolage", "Électro & high-tech", "Mode & accessoires", "Autres"];

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function setStatus(message, tone = "info") {
  const box = $("#import-status");
  box.hidden = !message;
  box.dataset.tone = tone;
  box.textContent = message || "";
}

function markDuplicates(items) {
  const known = new Set(session.existing.map((item) => `${normalize(item.title)}|${item.priceEur ?? ""}`));
  return items.map((item) => {
    const duplicate = Boolean(item.title) && known.has(`${normalize(item.title)}|${item.priceEur ?? ""}`);
    return { ...item, duplicate, selected: !duplicate };
  });
}

// --- Images : réduction pour l'IA, découpe des photos ------------------------------------------
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

async function analyzeFile(file) {
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

    session.notice = "L'IA n'a reconnu aucun article sur une capture : elle est ajoutée telle quelle, complète le titre.";
  } catch (error) {
    session.notice = `${error.message} La capture est ajoutée telle quelle : complète le titre.`;
  }

  const whole = encode(drawScaled(bitmap, 900));
  return [{ title: "", description: "", priceEur: null, category: "Autres", imageData: whole, imageUrl: whole, needsTitle: true }];
}

async function analyzeFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/")).slice(0, MAX_IMAGES);

  if (!files.length) {
    setStatus("Choisis une image (capture d'écran ou photo).", "error");
    return;
  }

  session.busy = true;
  session.notice = "";
  $("#import-files").disabled = true;
  const collected = [];

  try {
    for (const [index, file] of files.entries()) {
      setStatus(`Analyse de la capture ${index + 1}/${files.length}… (quelques secondes)`);
      collected.push(...(await analyzeFile(file)));
    }

    setStatus(session.notice, session.notice ? "info" : "info");
    showReview(collected);
  } catch (error) {
    setStatus(`Image illisible : ${error.message}`, "error");
  } finally {
    session.busy = false;
    $("#import-files").disabled = false;
    $("#import-files").value = "";
  }
}

function showReview(items) {
  session.items = markDuplicates(items);
  $("#import-sources").hidden = true;
  renderReview();
}

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
        <small>${withPrice} avec prix en euros · vérifie et corrige si besoin</small>
      </div>
      <button class="g-select-all" type="button" data-import-toggle-all>${selected === session.items.length ? "Tout décocher" : "Tout cocher"}</button>
    </div>
    <div class="import-grid">
      ${session.items
        .map(
          (item, index) => `
        <article class="import-card${item.selected ? " is-selected" : ""}${item.duplicate ? " is-duplicate" : ""}" data-import-card="${index}">
          <div class="import-photo">
            ${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="" loading="lazy" />` : `<span>Pas de photo</span>`}
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
      <button class="ghost-button" type="button" data-import-back>← Autre capture</button>
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
          sourceLabel: "Capture d'écran",
          items: chosen.slice(start, start + 100).map((item) => ({
            title: item.title,
            description: item.description || "",
            category: item.category,
            priceEur: item.priceEur === "" || item.priceEur == null ? null : item.priceEur,
            imageId: item.imageId || "",
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
  bridge().openModal("import-modal");
}

const modalOpen = () => !$("#import-modal")?.hidden;

if (!window.__abgImportBound) {
  window.__abgImportBound = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
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

    const field = event.target.closest("[data-import-field]");

    if (field) {
      const item = session.items[Number(field.dataset.importIndex)];
      const key = field.dataset.importField;
      item[key] = key === "priceEur" ? (field.value === "" ? "" : Number(field.value)) : field.value;
      if (key === "title") field.closest(".import-card")?.classList.remove("is-missing");
    }
  });

  // Capture collée (Ctrl/Cmd + V) ou glissée dans la fenêtre.
  document.addEventListener("paste", (event) => {
    if (!modalOpen() || session.busy || $("#import-sources").hidden) return;
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
