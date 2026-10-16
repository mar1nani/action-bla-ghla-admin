// Catalogue clients — import par lien (plusieurs articles ou un seul), puis vérification avant ajout.
// Pour les sites qui refusent les serveurs (Action), la page est lue par l'extension Chrome de l'utilisateur.

import { classifyTitle, titleFromUrl } from "/shared/classify.js";

const $ = (selector, root = document) => root.querySelector(selector);
const bridge = () => window.abg;
const esc = (value) => bridge().escapeHtml(value ?? "");

const session = { items: [], sourceLabel: "", existing: [], onDone: null, onAdded: null, busy: false, token: 0, photoJob: Promise.resolve(), photoText: "" };
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
  session.items = markDuplicates(items).map((item) => ({
    ...item,
    needsPhoto: !item.imageId && !item.imageData && /^https?:/i.test(item.imageUrl || ""),
  }));
  session.sourceLabel = sourceLabel;
  $("#import-sources").hidden = true;
  renderReview();
  startPhotoJob();
}

function updatePhotoProgress(done, total) {
  const failed = session.items.filter((item) => item.photoFailed).length;
  session.photoText =
    done >= total
      ? failed
        ? `Photos prêtes (${failed} introuvable${failed > 1 ? "s" : ""})`
        : "Photos prêtes ✓"
      : `Téléchargement des photos ${done}/${total}…`;
  const label = $("#import-photo-progress");
  if (label) label.textContent = session.photoText;
}

// Les photos sont téléchargées par lots de 6, pendant que tu relis la liste.
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
          }
        });
      } catch {
        batch.forEach(({ item }) => {
          item.needsPhoto = false;
          item.photoFailed = true;
        });
      }

      done += batch.length;
      if (token === session.token) updatePhotoProgress(done, todo.length);
    }
  })();
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
            ${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : `<span>Pas de photo</span>`}
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

// --- Extension Chrome (lecture des pages avec le navigateur de l'utilisateur) -----------------
const EXT_HOSTS = new Set(["www.action.com"]);
const hostOf = (value) => {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
};

function extCall(payload, timeoutMs) {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const onMessage = (event) => {
      if (event.source === window && event.data?.source === "abg-ext" && event.data.id === id) {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(event.data);
      }
    };
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, timeoutMs);
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "abg-app", id, ...payload }, "*");
  });
}

async function extensionAvailable() {
  return (await extCall({ type: "ping" }, 800))?.type === "pong";
}

const slimHtml = (html) =>
  html.replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");

function pageUrl(url, page) {
  const target = new URL(url);
  target.hash = "";
  if (page > 1) target.searchParams.set("page", String(page));
  return target.href;
}

/** Lit une page avec l'extension, puis la fait analyser par le serveur (qui ne contacte pas le site). */
async function importPageViaExtension(url) {
  const result = await extCall({ type: "fetch", url }, 90_000);

  if (!result) throw new Error("L'extension ne répond pas. Recharge la page.");
  if (!result.ok) throw new Error(result.error || "La page n'a pas pu être lue.");

  return bridge().apiRequest("/api/catalog/import-url", {
    method: "POST",
    body: { html: slimHtml(result.html), baseUrl: url },
  });
}

function installHelpHtml() {
  return `
    <div class="ext-help">
    <strong>Action refuse les serveurs : installe l'extension Chrome (1 minute, une seule fois).</strong>
    <ol class="import-steps">
      <li><a class="ghost-button" href="/abg-extension.zip" download>⬇ Télécharger l'extension</a> puis ouvre le fichier : il se décompresse en un dossier.</li>
      <li>Dans Chrome, écris <code>chrome://extensions</code> dans la barre d'adresse, active <em>Mode développeur</em> (en haut à droite), clique <em>Charger l'extension non empaquetée</em> et choisis ce dossier.</li>
      <li><strong>Recharge cette page</strong>, puis recolle ton lien.</li>
    </ol>
    </div>`;
}

function showInstallHelp() {
  const box = $("#import-status");
  box.hidden = false;
  box.dataset.tone = "info";
  box.innerHTML = installHelpHtml();
}

async function analyzeUrl() {
  const url = $("#import-url").value.trim();
  const wanted = Math.min(20, Math.max(1, Number($("#import-pages").value) || 1));

  if (!url) {
    setStatus("Colle l'adresse d'une page.", "error");
    return;
  }

  const viaExtension = EXT_HOSTS.has(hostOf(url));

  if (viaExtension && !(await extensionAvailable())) {
    showInstallHelp();
    return;
  }

  setBusy(true);
  const collected = [];
  let sourceLabel = "";
  let pages = wanted;

  try {
    for (let page = 1; page <= pages; page += 1) {
      setStatus(`Lecture de la page ${page}/${pages}…`);
      const result = viaExtension
        ? await importPageViaExtension(pageUrl(url, page))
        : await bridge().apiRequest("/api/catalog/import-url", { method: "POST", body: { url, page } });
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
      setStatus(error.message, "error");
    }
  } finally {
    setBusy(false);
  }
}

async function confirmImport() {
  const chosen = session.items.filter((item) => item.selected && item.title.trim());

  if (!chosen.length) return;

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
  session.token += 1;
  $("#import-sources").hidden = false;
  $("#import-review").hidden = true;
  $("#import-review").innerHTML = "";
  setStatus("");
  setTab("url");
}

export function openImport({ existing = [], onDone, onAdded, tab = "url" } = {}) {
  session.existing = existing;
  session.onDone = onDone;
  session.onAdded = onAdded;
  resetUi();
  resetSingle();
  setTab(tab);
  bridge().openModal("import-modal");
  (tab === "single" ? $("#single-url") : $("#import-url"))?.focus();
}

// --- Un seul article --------------------------------------------------------------------------
const single = { imageData: "", remoteImage: "", categoryTouched: false };

function resetSingle() {
  single.imageData = "";
  single.remoteImage = "";
  single.categoryTouched = false;
  ["#single-url", "#single-title", "#single-eur", "#single-mad", "#single-file"].forEach((selector) => {
    const field = $(selector);
    if (field) field.value = "";
  });
  const select = $("#single-category");
  if (select) {
    select.innerHTML = KNOWN.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("");
    select.value = "Autres";
  }
  showSinglePhoto("");
  const note = $("#single-note");
  if (note) note.hidden = true;
}

function showSinglePhoto(src) {
  const preview = $("#single-preview");
  const text = $("#single-drop-text");
  if (!preview || !text) return;
  preview.hidden = !src;
  if (src) preview.src = src;
  text.hidden = Boolean(src);
}

function setSingleNote(message, tone = "info") {
  const note = $("#single-note");
  if (!note) return;
  note.hidden = !message;
  note.dataset.tone = tone;
  note.innerHTML = message;
}

async function compressImageFile(file, maxSide = 900) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL("image/webp", 0.82);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.86);
}

function suggestSingleCategory() {
  if (single.categoryTouched) return;
  const title = $("#single-title").value;
  if (title.trim().length > 2) $("#single-category").value = classifyTitle(title);
}

async function fillSingleFromLink() {
  const url = $("#single-url").value.trim();

  if (!url) {
    setSingleNote("Colle d'abord le lien de l'article.", "error");
    return;
  }

  // Ce qu'on peut déduire de l'adresse seule : le nom de l'article.
  if (!$("#single-title").value.trim()) {
    $("#single-title").value = titleFromUrl(url);
    suggestSingleCategory();
  }

  const viaExtension = EXT_HOSTS.has(hostOf(url));

  if (viaExtension && !(await extensionAvailable())) {
    setSingleNote(installHelpHtml());
    return;
  }

  const button = $("#single-fill");
  button.disabled = true;
  setSingleNote(viaExtension ? "Lecture de la page avec ton navigateur…" : "Lecture de la page…");

  try {
    const result = viaExtension
      ? await importPageViaExtension(url)
      : await bridge().apiRequest("/api/catalog/import-url", { method: "POST", body: { url } });

    if (result.items.length > 3) {
      $("#import-url").value = url;
      setSingleNote(
        `Cette page contient <strong>${result.items.length} articles</strong>. Pour tous les importer d'un coup, <a href="#" data-import-goto="url">utilise l'onglet « Plusieurs articles »</a>.`,
      );
      return;
    }

    const item = result.items[0];

    $("#single-title").value = item.title;
    if (item.priceEur) $("#single-eur").value = item.priceEur;
    single.categoryTouched = false;
    $("#single-category").value = item.category;

    if (item.imageUrl && !single.imageData) {
      single.remoteImage = item.imageUrl;
      showSinglePhoto(item.imageUrl);
    }

    setSingleNote("Article lu : fixe ton prix en DH, puis ajoute.");
  } catch (error) {
    setSingleNote(
      `${esc(error.message)} Le nom tiré du lien est gardé : ajoute la <strong>photo</strong> et le <strong>prix</strong> à la main.`,
      "error",
    );
  } finally {
    button.disabled = false;
  }
}

async function addSingle() {
  const title = $("#single-title").value.trim();

  if (!title) {
    setSingleNote("Indique le titre de l'article.", "error");
    return;
  }

  const button = $("#single-add");
  button.disabled = true;
  button.textContent = "Ajout en cours…";

  try {
    let imageId = "";

    if (single.imageData) {
      imageId = (await bridge().apiRequest("/api/catalog/images", { method: "POST", body: { imageUpload: single.imageData } })).id;
    } else if (single.remoteImage) {
      const fetched = await bridge().apiRequest("/api/catalog/fetch-images", { method: "POST", body: { urls: [single.remoteImage] } });
      imageId = fetched.results[0]?.imageId || "";
    }

    const eur = $("#single-eur").value;
    const mad = $("#single-mad").value;

    await bridge().apiRequest("/api/catalog/items/bulk-create", {
      method: "POST",
      body: {
        sourceLabel: $("#single-url").value.trim() ? new URL($("#single-url").value.trim()).hostname.replace(/^www\./, "") : "Ajout manuel",
        items: [
          {
            title,
            category: $("#single-category").value,
            priceEur: eur === "" ? null : Number(eur),
            priceMad: mad === "" ? null : Number(mad),
            imageId,
            sourceUrl: $("#single-url").value.trim(),
          },
        ],
      },
    });

    bridge().closeModal("import-modal");
    bridge().showFlash(imageId ? "Article ajouté au catalogue." : "Article ajouté (sans photo).");
    session.onAdded?.();
    await session.onDone?.();
  } catch (error) {
    setSingleNote(esc(error.message), "error");
  } finally {
    button.disabled = false;
    button.textContent = "Ajouter au catalogue";
  }
}

if (!window.__abgImportBound) {
  window.__abgImportBound = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    const tab = target.closest("[data-import-tab]");

    if (tab) return setTab(tab.dataset.importTab);

    const goto = target.closest("[data-import-goto]");
    if (goto) {
      event.preventDefault();
      setStatus("");
      setTab(goto.dataset.importGoto);
      return;
    }

    if (target.closest("#single-fill")) return void fillSingleFromLink();
    if (target.closest("#single-add")) return void addSingle();
    if (target.closest("#import-url-go")) return void analyzeUrl();

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

  document.addEventListener("input", (event) => {
    if (event.target.id === "single-title") suggestSingleCategory();
  });

  document.addEventListener("change", async (event) => {
    if (event.target.id === "single-category") single.categoryTouched = true;

    if (event.target.id === "single-file" && event.target.files?.[0]) {
      try {
        single.imageData = await compressImageFile(event.target.files[0]);
        single.remoteImage = "";
        showSinglePhoto(single.imageData);
      } catch {
        setSingleNote("Impossible de lire cette image.", "error");
      }
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

    if (event.key === "Enter" && event.target.id === "single-url") {
      event.preventDefault();
      void fillSingleFromLink();
    }
  });

  // Un lien collé dans « 1 article » est lu tout de suite.
  document.addEventListener("paste", (event) => {
    if (event.target.id === "single-url") setTimeout(() => void fillSingleFromLink(), 80);
  });
}
