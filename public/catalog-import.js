// Catalogue clients — import en masse : lien, PDF ou code de page, puis vérification avant ajout.

const $ = (selector, root = document) => root.querySelector(selector);
const bridge = () => window.abg;
const esc = (value) => bridge().escapeHtml(value ?? "");

const session = { items: [], sourceLabel: "", existing: [], onDone: null, onAdded: null, busy: false };
const KNOWN = ["Cuisine", "Meubles", "Déco", "Salle de bain", "Entretien", "Rangement", "Textile & linge", "Jardin & extérieur", "Enfants & jouets", "Papeterie & loisirs", "Bricolage", "Électro & high-tech", "Mode & accessoires", "Autres"];

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

function setStatus(message, tone = "info", extra = "") {
  const box = $("#import-status");
  box.hidden = !message;
  box.dataset.tone = tone;
  box.innerHTML = message ? `<span>${esc(message)}</span>${extra}` : "";
}

function setBusy(busy) {
  session.busy = busy;
  document.querySelectorAll("#import-modal .primary-button, #import-modal input, #import-modal textarea").forEach((element) => {
    if (!element.closest("#import-review")) element.disabled = busy;
  });
}

function markDuplicates(items) {
  const known = new Set(session.existing.map((item) => `${normalize(item.title)}|${item.priceEur ?? ""}`));
  return items.map((item) => {
    const duplicate = known.has(`${normalize(item.title)}|${item.priceEur ?? ""}`);
    return { ...item, duplicate, selected: !duplicate };
  });
}

function showReview(items, sourceLabel) {
  session.items = markDuplicates(items);
  session.sourceLabel = sourceLabel;
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
        <small>${session.sourceLabel ? `Source : ${esc(session.sourceLabel)} · ` : ""}${withPrice} avec prix en euros</small>
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
            <input class="cat-title" value="${esc(item.title)}" data-import-field="title" data-import-index="${index}" aria-label="Titre" maxlength="140" />
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
      <button class="ghost-button" type="button" data-import-back>← Autre source</button>
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

async function analyzeUrl() {
  const url = $("#import-url").value.trim();
  const wanted = Math.min(20, Math.max(1, Number($("#import-pages").value) || 1));

  if (!url) {
    setStatus("Colle l'adresse d'une page.", "error");
    return;
  }

  setBusy(true);
  const collected = [];
  let sourceLabel = "";
  let pages = wanted;

  try {
    for (let page = 1; page <= pages; page += 1) {
      setStatus(`Lecture de la page ${page}/${pages}…`);
      const result = await bridge().apiRequest("/api/catalog/import-url", { method: "POST", body: { url, page } });
      sourceLabel = result.sourceLabel;
      collected.push(...result.items);
      if (page === 1) pages = Math.min(wanted, result.pageCount || 1);
    }

    setStatus("");
    showReview(collected, sourceLabel);
  } catch (error) {
    if (collected.length) {
      setStatus("");
      showReview(collected, sourceLabel);
      bridge().showFlash(`Import partiel : ${error.message}`, "error");
    } else {
      const blockedHint = /bloque|robots/i.test(error.message)
        ? `<button class="ghost-button" type="button" data-import-goto="pdf">Essayer avec un PDF</button><button class="ghost-button" type="button" data-import-goto="html">Coller le code de la page</button>`
        : "";
      setStatus(error.message, "error", blockedHint);
    }
  } finally {
    setBusy(false);
  }
}

async function analyzeHtml() {
  const html = $("#import-html").value.trim();
  const baseUrl = $("#import-html-base").value.trim();

  if (!html || !baseUrl) {
    setStatus("Indique l'adresse de la page et colle son code.", "error");
    return;
  }

  setBusy(true);
  setStatus("Analyse du code et téléchargement des photos…");

  try {
    const result = await bridge().apiRequest("/api/catalog/import-url", { method: "POST", body: { html, baseUrl } });
    setStatus("");
    showReview(result.items, result.sourceLabel);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function analyzePdf(file) {
  if (!file) return;

  setBusy(true);
  setStatus("Chargement du lecteur PDF…");

  try {
    const { extractPdfItems } = await import("/catalog-pdf.js");
    const items = await extractPdfItems(file, {
      onProgress: (page, total, found) => setStatus(`Page ${page}/${total} — ${found} article${found > 1 ? "s" : ""} détecté${found > 1 ? "s" : ""}…`),
    });

    if (!items.length) {
      setStatus(
        "Aucun article reconnu dans ce PDF (les pages sont peut-être des images entières). Envoie-moi ce PDF et j'adapterai la détection.",
        "error",
      );
      return;
    }

    setStatus("");
    showReview(items, file.name.replace(/\.pdf$/i, ""));
  } catch (error) {
    setStatus(`Lecture du PDF impossible : ${error.message}`, "error");
  } finally {
    setBusy(false);
    $("#import-pdf-file").value = "";
  }
}

async function confirmImport() {
  const chosen = session.items.filter((item) => item.selected && item.title.trim());

  if (!chosen.length) return;

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
          sourceLabel: session.sourceLabel,
          items: chosen.slice(start, start + 100).map((item) => ({
            title: item.title,
            description: item.description || "",
            category: item.category,
            priceEur: item.priceEur === "" ? null : item.priceEur,
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
  $("#import-sources").hidden = false;
  $("#import-review").hidden = true;
  $("#import-review").innerHTML = "";
  setStatus("");
  setTab("url");
}

export function openImport({ existing = [], onDone, onAdded } = {}) {
  session.existing = existing;
  session.onDone = onDone;
  session.onAdded = onAdded;
  resetUi();
  bridge().openModal("import-modal");
  $("#import-url")?.focus();
}

if (!window.__abgImportBound) {
  window.__abgImportBound = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    const tab = target.closest("[data-import-tab]");

    if (tab) return setTab(tab.dataset.importTab);

    const goto = target.closest("[data-import-goto]");
    if (goto) {
      setStatus("");
      return setTab(goto.dataset.importGoto);
    }

    if (target.closest("#import-url-go")) return void analyzeUrl();
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
    if (event.target.id === "import-pdf-file") {
      void analyzePdf(event.target.files?.[0]);
      return;
    }

    const field = event.target.closest("[data-import-field]");
    if (field) {
      const item = session.items[Number(field.dataset.importIndex)];
      const key = field.dataset.importField;
      item[key] = key === "priceEur" ? (field.value === "" ? "" : Number(field.value)) : field.value;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.id === "import-url") {
      event.preventDefault();
      void analyzeUrl();
    }
  });
}
