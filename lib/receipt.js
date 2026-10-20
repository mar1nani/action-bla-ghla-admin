// Import d'un ticket de caisse Action (PDF) : lecture des lignes (titre, quantité, prix), reconnaissance des produits
// déjà au catalogue, puis création de l'achat + des nouveaux produits une fois les détails complétés.
// La lecture est faite directement dans le texte du PDF (aucune IA, aucun quota) et contrôlée avec le total du ticket.
import { DEFAULT_CATEGORY, classifyTitle } from "../public/shared/classify.js";
import { cleanShop, ensureCategory, mergedCategories } from "./gallery.js";
import { createValidationError, requireInteger, requireNumber } from "./metrics.js";
import { createId, deleteImages, readImageBuffer, saveImageBuffer } from "./store.js";

const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MAX_LINES = 200;
const MONTHS = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

const strip = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const nameKey = (value) => strip(value).replace(/[^a-z0-9]+/g, " ").trim();
const parseAmount = (text) => {
  const cleaned = String(text ?? "").replace(/[€\s]/g, "").replace(",", ".");
  return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
};
const cents = (value) => Math.round(value * 100);

function decodePdf(input) {
  const base64 = String(input ?? "").replace(/^data:application\/pdf;base64,/, "").replace(/\s+/g, "");

  if (!base64 || !/^[A-Za-z0-9+/=]+$/.test(base64)) {
    throw createValidationError("Choisis un fichier PDF.");
  }

  const buffer = Buffer.from(base64, "base64");

  if (buffer.length > MAX_PDF_BYTES) {
    throw createValidationError("Ce PDF est trop lourd (4 Mo maximum).");
  }

  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw createValidationError("Ce fichier n'est pas un PDF.");
  }

  return buffer;
}

// Texte du PDF avec la position de chaque morceau (les colonnes Article / Quantité / Prix se lisent par leur position).
async function readPdfItems(buffer) {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const items = [];

  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 4); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (typeof item.str === "string" && item.str !== "") {
        items.push({ str: item.str, x: item.transform[4], y: item.transform[5] - (pageNumber - 1) * 100000 });
      }
    }
  }

  return items;
}

function groupLines(items) {
  const sorted = [...items].sort((left, right) => right.y - left.y || left.x - right.x);
  const lines = [];

  for (const item of sorted) {
    const last = lines.at(-1);

    if (last && Math.abs(last.y - item.y) <= 3) {
      last.items.push(item);
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  return lines.map((line) => ({ ...line, items: line.items.sort((left, right) => left.x - right.x) }));
}

const joinText = (items) => items.map((item) => item.str).join("").replace(/\s+/g, " ").trim();

function parseDate(text) {
  const match = /(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})/.exec(strip(text));

  if (!match) {
    return "";
  }

  const [, day, month, year] = match;
  return `${year}-${String(MONTHS[month]).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Lit les lignes d'un ticket Action à partir du texte positionné du PDF. */
export function parseActionReceipt(items) {
  const lines = groupLines(items);
  const header = lines.find((line) => /article/i.test(joinText(line.items)) && /quantit/i.test(joinText(line.items)));

  if (!header) {
    throw createValidationError("Ticket non reconnu : je ne trouve pas le tableau Article / Quantité / Prix.");
  }

  const qtyHeader = header.items.find((item) => /quantit/i.test(item.str));
  const priceHeader = header.items.find((item) => /^prix/i.test(item.str.trim()));
  const nameMax = (qtyHeader?.x ?? 235) - 12;
  const priceMin = (priceHeader?.x ?? 351) - 45;

  const rows = [];
  let total = null;
  let current = null;

  for (const line of lines.filter((candidate) => candidate.y < header.y)) {
    const nameText = joinText(line.items.filter((item) => item.x < nameMax));
    const qtyText = joinText(line.items.filter((item) => item.x >= nameMax && item.x < priceMin));
    const priceText = joinText(line.items.filter((item) => item.x >= priceMin));
    const qty = Number(qtyText);
    const price = parseAmount(priceText);

    if (/^total\b/i.test(nameText) && Number.isInteger(qty) && !Number.isNaN(price)) {
      total = { qty, amountEur: price };
      break;
    }

    if (nameText && Number.isInteger(qty) && qty > 0 && !Number.isNaN(price)) {
      current = { name: nameText, qty, lineTotalEur: price };
      rows.push(current);
    } else if (nameText && current && !qtyText && !priceText) {
      current.name = `${current.name} ${nameText}`;
    }
  }

  if (!rows.length) {
    throw createValidationError("Aucun article trouvé dans ce ticket.");
  }

  const allText = lines.map((line) => joinText(line.items)).join("\n");
  const addressLine = lines.map((line) => joinText(line.items)).find((text) => /F-\d{5}/.test(text)) ?? "";
  const city = /F-\d{5}\s+(.+)$/.exec(addressLine)?.[1]?.trim() ?? "";
  const transactionLine = lines.find((line) => /transaction/i.test(joinText(line.items)));
  const transaction = transactionLine ? (/(\d{8,})/.exec(joinText(transactionLine.items).replace(/\s+/g, ""))?.[1] ?? "") : "";

  const parsed = rows.map((row) => {
    const match = /^(.*?)\s*-\s*(\d{5,9})$/.exec(row.name);
    const title = (match ? match[1] : row.name).replace(/\s+/g, " ").trim();

    return {
      title: title.charAt(0).toUpperCase() + title.slice(1),
      ref: match ? match[2] : "",
      qty: row.qty,
      lineTotalEur: row.lineTotalEur,
    };
  });

  // Le prix du ticket est le total de la ligne (quantité × prix unitaire) : on le contrôle avec le total général.
  const sumQty = parsed.reduce((sum, row) => sum + row.qty, 0);
  const sumEur = parsed.reduce((sum, row) => sum + cents(row.lineTotalEur), 0);
  const verified = Boolean(total) && total.qty === sumQty && cents(total.amountEur) === sumEur;

  // Un même article scanné en deux fois (même référence, même prix) devient une seule ligne avec la quantité cumulée.
  const merged = [];

  for (const row of parsed) {
    const unit = row.lineTotalEur / row.qty;
    const twin = merged.find(
      (entry) => (row.ref ? entry.ref === row.ref : nameKey(entry.title) === nameKey(row.title)) && Math.abs(entry.unitPriceEur - unit) < 0.005,
    );

    if (twin) {
      twin.qty += row.qty;
      twin.lineTotalEur = Number((twin.lineTotalEur + row.lineTotalEur).toFixed(2));
    } else {
      merged.push({ ...row, unitPriceEur: Number(unit.toFixed(4)) });
    }
  }

  return {
    address: addressLine,
    city,
    orderedAt: parseDate(allText.split("\n").slice(0, 6).join(" ")) || parseDate(allText),
    transaction,
    total,
    verified,
    lines: merged,
  };
}

async function parsePdfBuffer(buffer) {
  try {
    return parseActionReceipt(await readPdfItems(buffer));
  } catch (error) {
    if (error.status) throw error;
    console.error("[receipt]", error);
    throw createValidationError("Impossible de lire ce PDF. Vérifie que c'est bien le ticket de caisse Action.");
  }
}

function matchProduct(line, products) {
  const byRef = line.ref ? products.find((product) => product.sourceRef === line.ref) : null;

  if (byRef) return byRef;

  const key = nameKey(line.title);
  return products.find((product) => nameKey(product.name) === key) ?? null;
}

export function registerReceiptRoutes(app, { asyncRoute, readStore, updateStore, buildPurchaseRecord, buildPublicState, assertUniqueProductName, assertNonNegativeStocks }) {
  // --- Lecture du ticket (rien n'est enregistré) ---------------------------------------------------------------
  app.post(
    "/api/purchases/receipt/preview",
    asyncRoute(async (request, response) => {
      const buffer = decodePdf(request.body.pdf);
      const receipt = await parsePdfBuffer(buffer);

      if (receipt.lines.length > MAX_LINES) {
        throw createValidationError("Ticket trop long.");
      }

      const store = await readStore();
      const duplicate = receipt.transaction
        ? (store.purchases ?? []).find((purchase) => purchase.receiptTransaction === receipt.transaction)
        : null;

      const lines = receipt.lines.map((line, index) => {
        const product = matchProduct(line, store.products ?? []);
        const guess = classifyTitle(line.title);
        const known = guess && guess !== DEFAULT_CATEGORY;

        return {
          key: index,
          title: line.title,
          ref: line.ref,
          qty: line.qty,
          unitPriceEur: line.unitPriceEur,
          lineTotalEur: line.lineTotalEur,
          productId: product?.id ?? "",
          productName: product?.name ?? "",
          category: product ? product.category || "" : known ? guess : "",
          categoryKnown: Boolean(product?.category) || known,
          shop: product?.shop || "Action",
        };
      });

      response.json({
        receipt: {
          address: receipt.address,
          city: receipt.city,
          orderedAt: receipt.orderedAt,
          transaction: receipt.transaction,
          total: receipt.total,
          verified: receipt.verified,
          duplicate: duplicate ? { id: duplicate.id, orderedAt: duplicate.orderedAt } : null,
        },
        lines,
        categories: mergedCategories(store.settings),
        shops: ["Normal", "Action"],
        settings: {
          eurToMad: Number(store.settings?.eurToMad || 0),
          transportRatePerKgEur: Number(store.settings?.transportRatePerKgEur || 0),
        },
      });
    }),
  );

  // --- Enregistrement : nouveaux produits + achat + ticket joint ------------------------------------------------
  app.post(
    "/api/purchases/receipt/commit",
    asyncRoute(async (request, response) => {
      const buffer = decodePdf(request.body.pdf);
      const transaction = String(request.body.transaction ?? "").replace(/\D/g, "").slice(0, 30);
      const rawLines = (Array.isArray(request.body.lines) ? request.body.lines : []).filter((line) => line && line.include !== false);

      if (!rawLines.length) {
        throw createValidationError("Aucune ligne à ajouter.");
      }

      if (rawLines.length > MAX_LINES) {
        throw createValidationError("Ticket trop long.");
      }

      const fileId = await saveImageBuffer(buffer, "application/pdf", "doc");
      let created = 0;
      let totalEur = 0;
      let totalQty = 0;

      try {
        const nextStore = await updateStore((store) => {
          if (transaction && (store.purchases ?? []).some((purchase) => purchase.receiptTransaction === transaction)) {
            throw createValidationError("Ce ticket a déjà été importé.");
          }

          const items = [];

          rawLines.forEach((line, index) => {
            const label = `Ligne ${index + 1}`;
            const qty = requireInteger(line.qty, `${label} : quantité`, { min: 1 });
            const unitPurchasePriceEur = requireNumber(line.unitPriceEur, `${label} : prix unitaire`, { min: 0 });
            const ref = String(line.ref ?? "").replace(/\D/g, "").slice(0, 12);
            let product = line.productId ? (store.products ?? []).find((entry) => entry.id === line.productId) : null;

            if (line.productId && !product) {
              throw createValidationError(`${label} : produit introuvable.`);
            }

            if (!product) {
              const name = String(line.title ?? "").replace(/\s+/g, " ").trim().slice(0, 140);

              if (!name) {
                throw createValidationError(`${label} : écris le nom du produit.`);
              }

              assertUniqueProductName(store, name);

              product = {
                id: createId("prd"),
                name,
                weightKg: requireNumber(line.weightG, `${name} : poids (g)`, { min: 1 }) / 1000,
                defaultPurchasePriceEur: unitPurchasePriceEur,
                defaultSalePriceMad: requireNumber(line.salePriceMad, `${name} : prix de vente MAD`, { min: 0 }),
                minStockAlert: store.settings?.lowStockDefault ?? 2,
                imageUrl: "",
                category: ensureCategory(store, line.category),
                shop: cleanShop(line.shop),
                sourceRef: ref,
                notes: "",
                createdAt: new Date().toISOString(),
              };
              store.products.push(product);
              created += 1;
            } else if (ref && !product.sourceRef) {
              product.sourceRef = ref;
            }

            items.push({ productId: product.id, qty, unitPurchasePriceEur });
          });

          const purchase = buildPurchaseRecord(
            {
              supplierName: "Action",
              orderNumber: transaction ? `Ticket ${transaction}` : "",
              orderedAt: request.body.orderedAt || undefined,
              notes: `Importé du ticket de caisse Action${request.body.city ? ` (${String(request.body.city).slice(0, 60)})` : ""}.`,
              items,
            },
            store,
          );
          purchase.receiptTransaction = transaction;
          purchase.invoiceFileUrl = `/api/receipts/${fileId}`;
          totalEur = purchase.totalCostEur;
          totalQty = purchase.totalQty;
          store.purchases.push(purchase);
          assertNonNegativeStocks(store);
          return store;
        });

        response.status(201).json({
          message: `Achat enregistré : ${totalQty} article${totalQty > 1 ? "s" : ""}, ${totalEur.toFixed(2).replace(".", ",")} €${created ? ` · ${created} nouveau${created > 1 ? "x" : ""} produit${created > 1 ? "s" : ""}` : ""}.`,
          appState: buildPublicState(nextStore, request),
        });
      } catch (error) {
        await deleteImages([fileId]).catch(() => undefined);
        throw error;
      }
    }),
  );

  // --- Ticket joint à un achat (réservé aux comptes connectés : la route /api est protégée) ------------------------
  app.get(
    "/api/receipts/:fileId",
    asyncRoute(async (request, response) => {
      const file = request.params.fileId.startsWith("doc_") ? await readImageBuffer(request.params.fileId) : null;

      if (!file || file.mime !== "application/pdf") {
        response.status(404).json({ message: "Ticket introuvable." });
        return;
      }

      response.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="ticket-action.pdf"',
        "Cache-Control": "private, max-age=3600",
      });
      response.send(file.data);
    }),
  );
}

