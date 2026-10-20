// Import d'un ticket de caisse Action (PDF) : lecture automatique, puis popup pour compléter les nouveaux produits
// (catégorie, boutique, poids, prix de vente au Maroc) avant d'enregistrer l'achat.

const $ = (selector, root = document) => root.querySelector(selector);
const bridge = () => window.abg;
const esc = (value) => bridge().escapeHtml(value ?? "");
const eur = (value) => bridge().formatCurrency(value ?? 0, "EUR");
const mad = (value) => bridge().formatCurrency(value ?? 0, "MAD");

const rc = {
  pdf: "",
  receipt: null,
  lines: [],
  categories: [],
  shops: ["Normal", "Action"],
  settings: { eurToMad: 0, transportRatePerKgEur: 0 },
  busy: false,
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Impossible de lire le fichier."));
    reader.readAsDataURL(file);
  });

const isNew = (line) => !line.productId;
const lineTotal = (line) => Number((line.qty * line.unitPriceEur).toFixed(2));

function categoryOptions(selected) {
  return [{ name: "", icon: "" }, ...rc.categories]
    .map((entry) => `<option value="${esc(entry.name)}"${entry.name === selected ? " selected" : ""}>${esc(entry.name ? `${entry.icon} ${entry.name}` : "À choisir…")}</option>`)
    .join("");
}

function lineHtml(line, index) {
  const total = lineTotal(line);
  const known = !isNew(line);

  return `
    <article class="rc-line ${known ? "is-known" : "is-new"}${line.include ? "" : " is-off"}" data-rc-line="${index}">
      <div class="rc-top">
        <label class="rc-include" title="Inclure cette ligne"><input type="checkbox" data-rc="include" ${line.include ? "checked" : ""} /></label>
        <div class="rc-main">
          ${
            known
              ? `<strong class="rc-name">${esc(line.productName)}</strong><span class="rc-chip rc-chip--known">Déjà au catalogue</span>`
              : `<input class="rc-title" data-rc="title" value="${esc(line.title)}" maxlength="140" aria-label="Nom du produit" /><span class="rc-chip rc-chip--new">Nouveau produit</span>`
          }
          ${line.ref ? `<small class="rc-ref">Réf. ${esc(line.ref)}</small>` : ""}
        </div>
      </div>
      <div class="rc-nums">
        <label>Quantité <input type="number" min="1" step="1" inputmode="numeric" value="${line.qty}" data-rc="qty" /></label>
        <label>Prix unitaire € <input type="number" min="0" step="0.01" inputmode="decimal" value="${line.unitPriceEur}" data-rc="unitPriceEur" /></label>
        <span class="rc-total">Total <b data-rc-total>${eur(total)}</b></span>
      </div>
      ${
        known
          ? ""
          : `<div class="rc-new">
              <label>Catégorie <select data-rc="category" class="${line.category ? "" : "needs-pick"}">${categoryOptions(line.category)}</select></label>
              <label>Boutique <select data-rc="shop">${rc.shops.map((shop) => `<option${shop === line.shop ? " selected" : ""}>${esc(shop)}</option>`).join("")}</select></label>
              <label>Poids (g) <input type="number" min="1" step="1" inputmode="numeric" placeholder="ex. 500" value="${line.weightG ?? ""}" data-rc="weightG" /></label>
              <label>Prix de vente MAD <input type="number" min="0" step="0.01" inputmode="decimal" placeholder="à indiquer" value="${line.salePriceMad ?? ""}" data-rc="salePriceMad" /></label>
              <p class="rc-hint" data-rc-hint></p>
            </div>`
      }
    </article>`;
}

function render() {
  const { receipt } = rc;
  const body = $("#receipt-body");
  const place = [receipt.city ? `Action ${receipt.city}` : "Action"].join("");
  $("#receipt-title").textContent = `Ticket ${place}`;

  const banner = receipt.duplicate
    ? `<p class="rc-banner rc-banner--bad">Ce ticket a déjà été importé (achat du ${esc(new Date(receipt.duplicate.orderedAt).toLocaleDateString("fr-FR"))}). Pour éviter de compter le stock deux fois, il ne peut pas être ajouté une seconde fois.</p>`
    : receipt.verified
      ? `<p class="rc-banner rc-banner--ok">✓ Ticket lu et vérifié : ${receipt.total.qty} article${receipt.total.qty > 1 ? "s" : ""}, ${eur(receipt.total.amountEur)} — comme sur le ticket.</p>`
      : `<p class="rc-banner rc-banner--warn">⚠ Les lignes lues ne correspondent pas exactement au total du ticket${receipt.total ? ` (${receipt.total.qty} articles, ${eur(receipt.total.amountEur)})` : ""}. Vérifie chaque ligne avant d'enregistrer.</p>`;

  body.innerHTML = `
    ${banner}
    <div class="rc-meta">
      <label>Date d'achat <input type="date" id="rc-date" value="${esc(receipt.orderedAt)}" /></label>
      <span>Fournisseur : <b>Action</b>${receipt.transaction ? ` · ticket ${esc(receipt.transaction)}` : ""}</span>
    </div>
    <p class="rc-help">Les produits déjà au catalogue sont reconnus. Pour les <b>nouveaux</b>, choisis la catégorie et indique le poids et ton prix de vente au Maroc.</p>
    <div class="rc-lines">${rc.lines.map(lineHtml).join("")}</div>
    <div class="rc-foot">
      <div class="rc-sum"><strong id="rc-sum-text"></strong><span id="rc-sum-note"></span></div>
      <button class="primary-button" type="button" id="rc-submit" ${receipt.duplicate ? "disabled" : ""}>Ajouter l'achat</button>
    </div>
    <p id="rc-error" class="form-error" hidden></p>`;

  rc.lines.forEach((_, index) => refreshLine(index));
  refreshSummary();
}

function refreshLine(index) {
  const line = rc.lines[index];
  const card = $(`[data-rc-line="${index}"]`);

  if (!card) return;

  card.classList.toggle("is-off", !line.include);
  $("[data-rc-total]", card).textContent = eur(lineTotal(line));

  const hint = $("[data-rc-hint]", card);

  if (hint) {
    const weightKg = (Number(line.weightG) || 0) / 1000;
    const landedMad = (line.unitPriceEur + weightKg * rc.settings.transportRatePerKgEur) * rc.settings.eurToMad;
    hint.textContent = weightKg
      ? `Coût estimé au Maroc : ${mad(landedMad)} par pièce (achat ${eur(line.unitPriceEur)} + transport).`
      : "Indique le poids pour voir le coût estimé au Maroc.";
  }
}

function missingFields() {
  return rc.lines.filter((line) => line.include && isNew(line) && (!line.title.trim() || !(Number(line.weightG) > 0) || line.salePriceMad === "" || line.salePriceMad == null)).length;
}

function refreshSummary() {
  const included = rc.lines.filter((line) => line.include);
  const qty = included.reduce((sum, line) => sum + line.qty, 0);
  const total = included.reduce((sum, line) => sum + lineTotal(line), 0);
  const created = included.filter(isNew).length;
  const missing = missingFields();
  const submit = $("#rc-submit");

  $("#rc-sum-text").textContent = `${included.length} ligne${included.length > 1 ? "s" : ""} · ${qty} article${qty > 1 ? "s" : ""} · ${eur(total)}`;
  $("#rc-sum-note").textContent = missing
    ? `Complète poids et prix de vente pour ${missing} nouveau${missing > 1 ? "x" : ""} produit${missing > 1 ? "s" : ""}.`
    : created
      ? created > 1 ? `${created} nouveaux produits seront créés.` : "1 nouveau produit sera créé."
      : "Aucun nouveau produit à créer.";

  if (submit) {
    submit.disabled = Boolean(rc.receipt.duplicate) || rc.busy || !included.length || missing > 0;
    submit.textContent = created ? `Ajouter l'achat et ${created} produit${created > 1 ? "s" : ""}` : "Ajouter l'achat";
  }
}

async function readFile(file) {
  if (!file) return;

  const button = $("#receipt-import-button");
  button.disabled = true;
  button.textContent = "Lecture du ticket…";

  try {
    rc.pdf = await fileToDataUrl(file);
    const data = await bridge().apiRequest("/api/purchases/receipt/preview", { method: "POST", body: { pdf: rc.pdf } });
    rc.receipt = data.receipt;
    rc.categories = data.categories;
    rc.shops = data.shops;
    rc.settings = data.settings;
    rc.lines = data.lines.map((line) => ({ ...line, include: true, weightG: "", salePriceMad: "" }));
    render();
    bridge().openModal("receipt-modal");
  } catch (error) {
    bridge().showFlash(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Importer un ticket (PDF)";
  }
}

async function submit() {
  const error = $("#rc-error");
  error.hidden = true;
  rc.busy = true;
  refreshSummary();

  try {
    const result = await bridge().apiRequest("/api/purchases/receipt/commit", {
      method: "POST",
      body: {
        pdf: rc.pdf,
        transaction: rc.receipt.transaction,
        city: rc.receipt.city,
        orderedAt: $("#rc-date").value || rc.receipt.orderedAt,
        lines: rc.lines.map((line) => ({
          include: line.include,
          title: line.title,
          ref: line.ref,
          qty: line.qty,
          unitPriceEur: line.unitPriceEur,
          productId: line.productId,
          category: line.category,
          shop: line.shop,
          weightG: Number(line.weightG),
          salePriceMad: Number(line.salePriceMad),
        })),
      },
    });

    bridge().closeModal("receipt-modal");
    await bridge().reload();
    bridge().showFlash(result.message);
  } catch (caught) {
    error.textContent = caught.message;
    error.hidden = false;
  } finally {
    rc.busy = false;
    refreshSummary();
  }
}

document.addEventListener("click", (event) => {
  if (event.target.closest("#receipt-import-button")) {
    $("#receipt-file")?.click();
    return;
  }

  if (event.target.closest("#rc-submit")) {
    void submit();
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;

  if (target.id === "receipt-file") {
    const [file] = target.files ?? [];
    await readFile(file);
    target.value = "";
  }
});

function onField(event) {
  const field = event.target.closest("[data-rc]");
  const card = event.target.closest("[data-rc-line]");

  if (!field || !card) return;

  const index = Number(card.dataset.rcLine);
  const line = rc.lines[index];
  const key = field.dataset.rc;

  if (key === "include") {
    line.include = field.checked;
  } else if (key === "qty") {
    line.qty = Math.max(1, Math.round(Number(field.value) || 1));
  } else if (key === "unitPriceEur") {
    line.unitPriceEur = Math.max(0, Number(field.value) || 0);
  } else if (key === "category") {
    line.category = field.value;
    field.classList.toggle("needs-pick", !field.value);
  } else {
    line[key] = field.value;
  }

  refreshLine(index);
  refreshSummary();
}

document.addEventListener("input", onField);
document.addEventListener("change", onField);
