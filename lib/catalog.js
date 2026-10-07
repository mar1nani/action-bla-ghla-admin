// Catalogue clients (vitrine) : articles, catégories, import en masse, API publique.
import { CATEGORIES, DEFAULT_CATEGORY, classifyTitle, cleanTitle } from "../public/shared/classify.js";
import { ImportError, importFromPage, storeUploadedImage } from "./import-url.js";
import { createId, deleteImages, isValidMediaId, readImageBuffer } from "./store.js";
import { createValidationError } from "./metrics.js";

const MAX_BULK = 400;
const BULK_ACTIONS = new Set(["publish", "unpublish", "delete", "category", "price-coef"]);

const roundMoney = (value) => Math.round(value * 100) / 100;

function toMoney(value, label) {
  if (value === "" || value == null) return null;

  const number = Number(String(value).replace(",", "."));

  if (!Number.isFinite(number) || number < 0 || number > 1_000_000) {
    throw createValidationError(`${label} invalide.`);
  }

  return roundMoney(number);
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0") && digits.length === 10) return `212${digits.slice(1)}`;
  return digits;
}

function categoryOrder(name) {
  const index = CATEGORIES.findIndex((category) => category.name === name);
  return index === -1 ? 999 : index;
}

export function listCategories(items) {
  const counts = new Map();

  for (const item of items) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      icon: CATEGORIES.find((category) => category.name === name)?.icon ?? "✨",
    }))
    .sort((left, right) => categoryOrder(left.name) - categoryOrder(right.name) || left.name.localeCompare(right.name, "fr"));
}

function buildItem(raw, user, defaults = {}) {
  const title = cleanTitle(raw.title);

  if (!title) {
    throw createValidationError("Chaque article doit avoir un titre.");
  }

  const imageId = raw.imageId && isValidMediaId(raw.imageId) ? raw.imageId : "";
  const now = new Date().toISOString();

  return {
    id: createId("cat"),
    title,
    description: cleanTitle(raw.description || "").slice(0, 160),
    category: cleanTitle(raw.category) || classifyTitle(title),
    imageId,
    imageUrl: imageId ? `/media/${imageId}` : "",
    priceEur: toMoney(raw.priceEur, "Prix en euros"),
    priceMad: toMoney(raw.priceMad, "Prix en dirhams"),
    sourceLabel: cleanTitle(raw.sourceLabel || defaults.sourceLabel || ""),
    sourceUrl: String(raw.sourceUrl || "").slice(0, 500),
    published: Boolean(raw.published),
    createdAt: now,
    updatedAt: now,
    createdByName: user?.displayName || user?.login || "Équipe",
  };
}

export function registerPublicCatalogRoutes(app, { asyncRoute, readStore }) {
  app.get(
    "/api/public/showcase",
    asyncRoute(async (_request, response) => {
      const store = await readStore();
      const items = (store.catalogItems ?? [])
        .filter((item) => item.published && item.priceMad > 0 && item.imageUrl)
        .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));

      response.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
      response.json({
        appName: store.settings?.companyName || "Action BLA Ghla",
        brandLogoUrl: "/assets/logo-action-bla-ghla.png",
        whatsappPhone: normalizePhone(store.settings?.whatsappPhone),
        categories: listCategories(items),
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description || "",
          category: item.category,
          imageUrl: item.imageUrl,
          priceMad: item.priceMad,
        })),
      });
    }),
  );

  app.get(
    "/media/:imageId",
    asyncRoute(async (request, response) => {
      const image = await readImageBuffer(request.params.imageId);

      if (!image) {
        response.status(404).end();
        return;
      }

      response.set({
        "Content-Type": image.mime,
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      response.send(image.data);
    }),
  );
}

export function registerCatalogAdminRoutes(app, { asyncRoute, readStore, updateStore, getAuthenticatedUser, createNotFoundError }) {
  app.get(
    "/api/catalog/items",
    asyncRoute(async (_request, response) => {
      const store = await readStore();
      const items = [...(store.catalogItems ?? [])].sort(
        (left, right) => new Date(right.createdAt) - new Date(left.createdAt),
      );

      response.json({
        items,
        categories: listCategories(items),
        knownCategories: CATEGORIES.map(({ name, icon }) => ({ name, icon })),
        defaultCategory: DEFAULT_CATEGORY,
        eurToMad: Number(store.settings?.eurToMad || 0),
        whatsappPhone: store.settings?.whatsappPhone || "",
      });
    }),
  );

  app.post(
    "/api/catalog/images",
    asyncRoute(async (request, response) => {
      const id = await storeUploadedImage(request.body.imageUpload);
      response.status(201).json({ id, url: `/media/${id}` });
    }),
  );

  app.post(
    "/api/catalog/import-url",
    asyncRoute(async (request, response) => {
      const url = String(request.body.url || "").trim();
      const html = String(request.body.html || "");

      if (!url && !html) {
        throw createValidationError("Indique un lien ou colle le code de la page.");
      }

      try {
        response.json(await importFromPage({
            url,
            html,
            baseUrl: String(request.body.baseUrl || url || "").trim(),
            page: Math.min(60, Math.max(1, Number(request.body.page) || 1)),
          }));
      } catch (error) {
        if (error instanceof ImportError) {
          response.status(error.status).json({ message: error.message, blocked: error.blocked });
          return;
        }
        throw error;
      }
    }),
  );

  app.post(
    "/api/catalog/items/bulk-create",
    asyncRoute(async (request, response) => {
      const incoming = Array.isArray(request.body.items) ? request.body.items : [];

      if (!incoming.length) {
        throw createValidationError("Aucun article à ajouter.");
      }

      if (incoming.length > MAX_BULK) {
        throw createValidationError(`Trop d'articles d'un coup (${MAX_BULK} maximum).`);
      }

      let created = 0;

      await updateStore((store) => {
        const user = getAuthenticatedUser(request, store);
        store.catalogItems = store.catalogItems ?? [];

        for (const raw of incoming) {
          store.catalogItems.push(buildItem(raw, user, { sourceLabel: request.body.sourceLabel }));
          created += 1;
        }

        return store;
      });

      response.status(201).json({ message: `${created} article(s) ajouté(s) en brouillon.`, created });
    }),
  );

  app.patch(
    "/api/catalog/items/:itemId",
    asyncRoute(async (request, response) => {
      const staleImages = [];

      const store = await updateStore((draft) => {
        const item = (draft.catalogItems ?? []).find((entry) => entry.id === request.params.itemId);

        if (!item) {
          throw createNotFoundError("Article introuvable.");
        }

        const body = request.body;

        if (body.title !== undefined) {
          const title = cleanTitle(body.title);
          if (!title) throw createValidationError("Le titre est obligatoire.");
          item.title = title;
        }
        if (body.description !== undefined) item.description = cleanTitle(body.description).slice(0, 160);
        if (body.category !== undefined) item.category = cleanTitle(body.category) || DEFAULT_CATEGORY;
        if (body.priceEur !== undefined) item.priceEur = toMoney(body.priceEur, "Prix en euros");
        if (body.priceMad !== undefined) item.priceMad = toMoney(body.priceMad, "Prix en dirhams");
        if (body.sourceLabel !== undefined) item.sourceLabel = cleanTitle(body.sourceLabel);
        if (body.published !== undefined) {
          item.published = Boolean(body.published);
          if (item.published && !(item.priceMad > 0)) {
            throw createValidationError("Indique d'abord un prix en dirhams pour publier cet article.");
          }
        }
        if (body.imageId !== undefined && isValidMediaId(body.imageId) && body.imageId !== item.imageId) {
          if (item.imageId) staleImages.push(item.imageId);
          item.imageId = body.imageId;
          item.imageUrl = `/media/${body.imageId}`;
        }

        item.updatedAt = new Date().toISOString();
        return draft;
      });

      await deleteImages(staleImages);
      response.json({ item: store.catalogItems.find((entry) => entry.id === request.params.itemId) });
    }),
  );

  app.post(
    "/api/catalog/items/bulk",
    asyncRoute(async (request, response) => {
      const ids = Array.isArray(request.body.ids) ? [...new Set(request.body.ids.map(String))] : [];
      const action = request.body.action;

      if (!ids.length) throw createValidationError("Sélectionne au moins un article.");
      if (ids.length > 1000) throw createValidationError("Trop d'articles sélectionnés.");
      if (!BULK_ACTIONS.has(action)) throw createValidationError("Action groupée inconnue.");

      const report = { affected: 0, skipped: 0 };
      const removedImages = [];

      await updateStore((store) => {
        const selected = new Set(ids);
        const items = store.catalogItems ?? [];
        const now = new Date().toISOString();

        if (action === "delete") {
          for (const item of items) {
            if (selected.has(item.id) && item.imageId) removedImages.push(item.imageId);
          }
          const before = items.length;
          store.catalogItems = items.filter((item) => !selected.has(item.id));
          report.affected = before - store.catalogItems.length;
          return store;
        }

        const category = cleanTitle(request.body.category);
        const coef = Number(String(request.body.coef ?? "").replace(",", "."));
        const rounding = [1, 5, 10].includes(Number(request.body.rounding)) ? Number(request.body.rounding) : 5;

        if (action === "category" && !category) throw createValidationError("Choisis une catégorie.");
        if (action === "price-coef" && !(coef > 0 && coef < 100)) {
          throw createValidationError("Coefficient invalide.");
        }

        for (const item of items) {
          if (!selected.has(item.id)) continue;

          if (action === "publish") {
            if (item.priceMad > 0) {
              item.published = true;
              report.affected += 1;
            } else {
              report.skipped += 1;
            }
          } else if (action === "unpublish") {
            item.published = false;
            report.affected += 1;
          } else if (action === "category") {
            item.category = category;
            report.affected += 1;
          } else if (action === "price-coef") {
            if (!(item.priceEur > 0) || (request.body.onlyEmpty && item.priceMad > 0)) {
              report.skipped += 1;
              continue;
            }
            const rate = Number(store.settings?.eurToMad || 0);
            item.priceMad = Math.max(rounding, Math.round((item.priceEur * rate * coef) / rounding) * rounding);
            report.affected += 1;
          }

          item.updatedAt = now;
        }

        return store;
      });

      const stillUsed = new Set((await readStore()).catalogItems.map((item) => item.imageId));
      await deleteImages(removedImages.filter((id) => !stillUsed.has(id)));

      const labels = {
        publish: "publié(s)",
        unpublish: "retiré(s) du catalogue",
        delete: "supprimé(s)",
        category: "déplacé(s)",
        "price-coef": "chiffré(s)",
      };
      const note = report.skipped
        ? ` ${report.skipped} ignoré(s) ${action === "publish" ? "(prix en dirhams manquant)" : "(prix en euros manquant ou déjà rempli)"}.`
        : "";

      response.json({ ...report, message: `${report.affected} article(s) ${labels[action]}.${note}` });
    }),
  );

  app.put(
    "/api/catalog/settings",
    asyncRoute(async (request, response) => {
      const phone = String(request.body.whatsappPhone ?? "").trim().slice(0, 30);

      await updateStore((store) => {
        store.settings = { ...store.settings, whatsappPhone: phone };
        return store;
      });

      response.json({ message: "Numéro WhatsApp enregistré.", whatsappPhone: phone });
    }),
  );
}
