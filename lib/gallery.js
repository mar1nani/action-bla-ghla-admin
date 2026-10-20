// Photos à acheter (galerie) : API légère (aucune image dans les listes), photos hors du document principal,
// catégories modifiables et boutiques (Normal / Action).
import sharp from "sharp";
import { CATEGORIES, DEFAULT_CATEGORY, SHOPS } from "../public/shared/classify.js";
import { storeUploadedImage } from "./images.js";
import { backupStore, createId, deleteImages, readStoreParts, saveImageBuffer, updateStore, updateStoreParts } from "./store.js";
import { createValidationError, optionalString, requireInteger, requireNumber, requireString } from "./metrics.js";

const MIGRATION_BATCH = 12;
const BULK_ACTIONS = new Set(["purchase", "unpurchase", "delete", "category", "shop"]);
const isInline = (entry) => typeof entry?.imageUrl === "string" && entry.imageUrl.startsWith("data:") && !entry.migrationFailed;

export const cleanShop = (value) => (SHOPS.includes(value) ? value : "");
export const cleanCategory = (value) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 40);

export function mergedCategories(settings) {
  const known = CATEGORIES.map(({ name, icon }) => ({ name, icon, custom: false }));
  const knownKeys = new Set([...known.map((entry) => entry.name.toLowerCase()), DEFAULT_CATEGORY.toLowerCase()]);
  const custom = (Array.isArray(settings?.customCategories) ? settings.customCategories : [])
    .filter((name) => typeof name === "string" && name.trim() && !knownKeys.has(name.toLowerCase()))
    .map((name) => ({ name, icon: "🏷️", custom: true }));

  return [...known, ...custom, { name: DEFAULT_CATEGORY, icon: "✨", custom: false }];
}

// Enregistre une catégorie inconnue dans les réglages pour qu'elle soit proposée partout (photos, produits, catalogue).
export function ensureCategory(store, rawName) {
  const name = cleanCategory(rawName);

  if (!name) return "";

  const existing = mergedCategories(store.settings).find((entry) => entry.name.toLowerCase() === name.toLowerCase());

  if (existing) return existing.name;

  store.settings = store.settings ?? {};
  const list = Array.isArray(store.settings.customCategories) ? store.settings.customCategories : [];

  if (list.length >= 60) {
    throw createValidationError("Trop de catégories personnalisées (60 maximum).");
  }

  store.settings.customCategories = [...list, name];
  return name;
}

function lightItem(entry) {
  const pending = isInline(entry);
  let imageUrl = "";

  if (!pending && typeof entry.imageUrl === "string" && (entry.imageUrl.startsWith("/media/") || entry.imageUrl.startsWith("/uploads/"))) {
    imageUrl = entry.imageUrl;
  }

  return {
    id: entry.id,
    imageUrl,
    pending,
    broken: Boolean(entry.migrationFailed) || (!pending && !imageUrl),
    createdAt: entry.createdAt || new Date().toISOString(),
    createdByName: entry.createdByName || entry.createdByLogin || "Équipe",
    desiredQty: Math.max(1, Number(entry.desiredQty || 1)),
    foundPriceEur: Math.max(0, Number(entry.foundPriceEur || 0)),
    purchased: Boolean(entry.purchased),
    note: entry.note || "",
    shop: cleanShop(entry.shop),
    category: cleanCategory(entry.category),
  };
}

const newestFirst = (left, right) => new Date(right.createdAt) - new Date(left.createdAt);

export function registerGalleryRoutes(app, { asyncRoute, getAuthenticatedUser, createNotFoundError, assertUniqueProductName }) {
  // --- Catégories (communes : photos, produits, catalogue) ---------------------------------------
  app.get(
    "/api/categories",
    asyncRoute(async (_request, response) => {
      const { settings } = await readStoreParts(["settings"]);
      response.json({ categories: mergedCategories(settings), shops: SHOPS });
    }),
  );

  app.post(
    "/api/categories",
    asyncRoute(async (request, response) => {
      const name = cleanCategory(request.body.name);

      if (name.length < 2) {
        throw createValidationError("Donne un nom de catégorie (2 lettres minimum).");
      }

      const { settings } = await updateStoreParts(["settings"], (draft) => {
        const exists = mergedCategories(draft.settings).some((entry) => entry.name.toLowerCase() === name.toLowerCase());

        if (!exists) {
          const list = Array.isArray(draft.settings.customCategories) ? draft.settings.customCategories : [];

          if (list.length >= 60) {
            throw createValidationError("Trop de catégories personnalisées (60 maximum).");
          }

          draft.settings = { ...draft.settings, customCategories: [...list, name] };
        }

        return draft;
      });

      const stored = mergedCategories(settings).find((entry) => entry.name.toLowerCase() === name.toLowerCase());
      response.status(201).json({ name: stored?.name ?? name, categories: mergedCategories(settings), shops: SHOPS });
    }),
  );

  // --- Liste -------------------------------------------------------------------------------------
  app.get(
    "/api/gallery-items",
    asyncRoute(async (_request, response) => {
      const { galleryItems, settings } = await readStoreParts(["galleryItems", "settings"]);
      const items = galleryItems.map(lightItem).sort(newestFirst);

      response.json({
        items,
        pending: items.filter((item) => item.pending).length,
        categories: mergedCategories(settings),
        shops: SHOPS,
      });
    }),
  );

  // Anciennes photos stockées dans le document principal : on les range dans la table d'images, par petits lots.
  app.post(
    "/api/gallery-items/migrate-images",
    asyncRoute(async (_request, response) => {
      const { galleryItems } = await readStoreParts(["galleryItems"]);
      const inline = galleryItems.filter(isInline);

      if (!inline.length) {
        response.json({ migrated: [], remaining: 0 });
        return;
      }

      await backupStore("avant-migration-photos-galerie");

      const results = new Map();

      for (const entry of inline.slice(0, MIGRATION_BATCH)) {
        const match = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(entry.imageUrl);

        try {
          if (!match) throw new Error("format");
          const webp = await sharp(Buffer.from(match[2], "base64"), { failOn: "none" })
            .rotate()
            .resize({ width: 900, height: 1200, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 76 })
            .toBuffer();
          results.set(entry.id, { imageId: await saveImageBuffer(webp, "image/webp") });
        } catch {
          results.set(entry.id, { failed: true });
        }
      }

      await updateStoreParts(["galleryItems"], (draft) => {
        for (const entry of draft.galleryItems) {
          const result = results.get(entry.id);

          if (!result || !isInline(entry)) continue;

          if (result.imageId) {
            entry.imageId = result.imageId;
            entry.imageUrl = `/media/${result.imageId}`;
          } else {
            entry.migrationFailed = true;
          }
        }

        return draft;
      });

      const migrated = [...results.entries()]
        .filter(([, result]) => result.imageId)
        .map(([id, result]) => ({ id, imageUrl: `/media/${result.imageId}` }));
      const failedIds = [...results.entries()].filter(([, result]) => result.failed).map(([id]) => id);

      response.json({ migrated, failedIds, remaining: Math.max(0, inline.length - results.size) });
    }),
  );

  // --- Ajout d'une photo ---------------------------------------------------------------------------
  app.post(
    "/api/gallery-items",
    asyncRoute(async (request, response) => {
      const imageId = await storeUploadedImage(request.body.imageUpload);
      let created;

      await updateStoreParts(["galleryItems", "users"], (draft) => {
        const user = getAuthenticatedUser(request, draft);
        created = {
          id: createId("gal"),
          imageId,
          imageUrl: `/media/${imageId}`,
          createdAt: new Date().toISOString(),
          createdByLogin: user?.login || "",
          createdByName: user?.displayName || user?.login || "Équipe",
          desiredQty: 1,
          foundPriceEur: 0,
          purchased: false,
          note: "",
          shop: cleanShop(request.body.shop),
          category: cleanCategory(request.body.category),
        };
        draft.galleryItems.push(created);
        return draft;
      });

      response.status(201).json({ item: lightItem(created) });
    }),
  );

  // --- Modification d'une photo ----------------------------------------------------------------------
  app.patch(
    "/api/gallery-items/:itemId",
    asyncRoute(async (request, response) => {
      const body = request.body;
      let updated;

      await updateStoreParts(["galleryItems"], (draft) => {
        const entry = draft.galleryItems.find((candidate) => candidate.id === request.params.itemId);

        if (!entry) {
          throw createNotFoundError("Photo introuvable.");
        }

        if (body.desiredQty !== undefined) entry.desiredQty = requireInteger(body.desiredQty, "Quantité à acheter", { min: 1 });
        if (body.foundPriceEur !== undefined) entry.foundPriceEur = requireNumber(body.foundPriceEur, "Prix magasin EUR", { min: 0 });
        if (body.note !== undefined) entry.note = String(body.note).slice(0, 500);
        if (body.purchased !== undefined) entry.purchased = Boolean(body.purchased);
        if (body.shop !== undefined) entry.shop = cleanShop(body.shop);
        if (body.category !== undefined) entry.category = cleanCategory(body.category);

        updated = entry;
        return draft;
      });

      response.json({ item: lightItem(updated) });
    }),
  );

  // --- Suppression -----------------------------------------------------------------------------------
  app.delete(
    "/api/gallery-items/:itemId",
    asyncRoute(async (request, response) => {
      let removed;

      await updateStoreParts(["galleryItems"], (draft) => {
        const index = draft.galleryItems.findIndex((candidate) => candidate.id === request.params.itemId);

        if (index === -1) {
          throw createNotFoundError("Photo introuvable.");
        }

        [removed] = draft.galleryItems.splice(index, 1);
        return draft;
      });

      await deleteImages([removed?.imageId].filter(Boolean));
      response.json({ message: "Photo supprimée." });
    }),
  );

  // --- Actions groupées ------------------------------------------------------------------------------
  app.post(
    "/api/gallery-items/bulk",
    asyncRoute(async (request, response) => {
      const ids = Array.isArray(request.body.ids) ? [...new Set(request.body.ids.map(String))] : [];
      const action = request.body.action;

      if (!ids.length) throw createValidationError("Sélectionne au moins une photo.");
      if (ids.length > 500) throw createValidationError("Trop de photos sélectionnées (500 maximum).");
      if (!BULK_ACTIONS.has(action)) throw createValidationError("Action groupée inconnue.");

      const category = cleanCategory(request.body.category);
      const shop = cleanShop(request.body.shop);

      if (action === "shop" && !shop) throw createValidationError("Choisis une boutique.");

      let affected = 0;
      const removedImages = [];

      await updateStoreParts(["galleryItems"], (draft) => {
        const selected = new Set(ids);

        if (action === "delete") {
          for (const entry of draft.galleryItems) {
            if (selected.has(entry.id) && entry.imageId) removedImages.push(entry.imageId);
          }
          const before = draft.galleryItems.length;
          draft.galleryItems = draft.galleryItems.filter((entry) => !selected.has(entry.id));
          affected = before - draft.galleryItems.length;
          return draft;
        }

        for (const entry of draft.galleryItems) {
          if (!selected.has(entry.id)) continue;

          if (action === "purchase") entry.purchased = true;
          if (action === "unpurchase") entry.purchased = false;
          if (action === "category") entry.category = category;
          if (action === "shop") entry.shop = shop;
          affected += 1;
        }

        return draft;
      });

      await deleteImages(removedImages);

      const labels = {
        purchase: "marquée(s) comme achetée(s)",
        unpurchase: "remise(s) à acheter",
        delete: "supprimée(s)",
        category: "classée(s)",
        shop: "classée(s) par boutique",
      };
      response.json({ affected, message: `${affected} photo(s) ${labels[action]}.` });
    }),
  );

  // --- Photo → produit --------------------------------------------------------------------------------
  app.post(
    "/api/gallery-items/:itemId/to-product",
    asyncRoute(async (request, response) => {
      await updateStore((store) => {
        const user = getAuthenticatedUser(request, store);
        const index = (store.galleryItems ?? []).findIndex((candidate) => candidate.id === request.params.itemId);

        if (index === -1) {
          throw createNotFoundError("Photo introuvable.");
        }

        const photo = store.galleryItems[index];
        const productName = requireString(request.body.name, "Nom du produit");
        assertUniqueProductName(store, productName);

        const product = {
          id: createId("prd"),
          name: productName,
          weightKg: requireNumber(request.body.weightG, "Poids (g)", { min: 1 }) / 1000,
          defaultPurchasePriceEur: Math.max(0, Number(photo.foundPriceEur || 0)),
          defaultSalePriceMad: requireNumber(request.body.salePriceMad, "Prix de vente MAD", { min: 0 }),
          minStockAlert: store.settings?.lowStockDefault ?? 2,
          imageUrl: photo.imageUrl,
          category: ensureCategory(store, photo.category),
          shop: cleanShop(photo.shop),
          notes: optionalString(photo.note),
          createdAt: new Date().toISOString(),
        };

        store.products.push(product);
        store.wishlist = store.wishlist ?? [];
        store.wishlist.push({
          id: createId("wish"),
          productId: product.id,
          desiredQty: Math.max(1, Number(photo.desiredQty || 1)),
          purchased: Boolean(photo.purchased),
          purchasedAt: photo.purchased ? new Date().toISOString() : null,
          createdAt: new Date().toISOString(),
          createdByLogin: user?.login || photo.createdByLogin || "",
          createdByName: user?.displayName || user?.login || photo.createdByName || "Équipe",
          notes: "",
        });

        // La photo devient l'image du produit : on la retire de la galerie sans supprimer le fichier.
        store.galleryItems.splice(index, 1);
        return store;
      });

      response.status(201).json({ message: "Produit créé et ajouté à « Produits à acheter »." });
    }),
  );
}
