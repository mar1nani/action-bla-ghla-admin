import express from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import {
  allocateByWeight,
  buildAppState,
  createValidationError,
  normalizeMoroccanPhone,
  optionalString,
  requireInteger,
  requireNumber,
  requireString,
  toRecordDate,
} from "./lib/metrics.js";
import { renderInvoiceHtml } from "./lib/invoice-template.js";
import {
  createId,
  getStoreStatus,
  isDatabaseStoreEnabled,
  readStore,
  updateStore,
} from "./lib/store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDirectory = path.join(__dirname, "public", "uploads");
const app = express();
const port = process.env.PORT || 3000;
const SESSION_COOKIE_NAME = "abg_session";
const CATALOG_VISITOR_COOKIE_NAME = "abg_catalog";
const ANALYTICS_RETENTION_DAYS = 120;
const sessions = new Map();

const orderStatuses = new Set(["brouillon", "confirmee", "livree"]);
const orderStockStatuses = new Set(["stock_disponible", "precommande"]);
const paymentStatuses = new Set(["non_payee", "avance", "payee"]);
const shipmentStatuses = new Set([
  "achete",
  "en_preparation",
  "envoye",
  "chez_transporteur",
  "recu",
]);
const carriers = new Set(["Achraf", "Malak", "Marouane", "Ozon Express", "Autres"]);

function asyncRoute(handler) {
  return function wrappedHandler(request, response, next) {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    login: user.login,
    displayName: user.displayName,
    canManageUsers: canManageUsers(user),
  };
}

function sanitizeManagedUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    login: user.login,
    displayName: user.displayName,
    canManageUsers: canManageUsers(user),
    createdAt: user.createdAt || null,
  };
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf("=");
        const key = separatorIndex >= 0 ? entry.slice(0, separatorIndex) : entry;
        const value = separatorIndex >= 0 ? entry.slice(separatorIndex + 1) : "";
        return [key, decodeURIComponent(value)];
      }),
  );
}

function createCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  parts.push("Path=/");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  return parts.join("; ");
}

function appendResponseCookie(response, cookie) {
  const currentCookie = response.getHeader("Set-Cookie");

  if (!currentCookie) {
    response.setHeader("Set-Cookie", cookie);
    return;
  }

  if (Array.isArray(currentCookie)) {
    response.setHeader("Set-Cookie", [...currentCookie, cookie]);
    return;
  }

  response.setHeader("Set-Cookie", [currentCookie, cookie]);
}

function getParisDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDateKey(dateKey, offsetDays) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return getParisDateKey(date);
}

function normalizeAnalytics(store) {
  if (!store.analytics || typeof store.analytics !== "object") {
    store.analytics = {
      catalogVisitorsById: {},
      catalogDaily: [],
    };
  }

  if (!store.analytics.catalogVisitorsById || typeof store.analytics.catalogVisitorsById !== "object") {
    store.analytics.catalogVisitorsById = {};
  }

  if (!Array.isArray(store.analytics.catalogDaily)) {
    store.analytics.catalogDaily = [];
  }

  return store.analytics;
}

function pruneCatalogAnalytics(analytics, todayKey) {
  const minimumDateKey = shiftDateKey(todayKey, -ANALYTICS_RETENTION_DAYS + 1);

  analytics.catalogDaily = analytics.catalogDaily
    .map((entry) => ({
      date: optionalString(entry?.date),
      uniqueSessions: Math.max(0, Number(entry?.uniqueSessions || 0)),
    }))
    .filter((entry) => entry.date && entry.date >= minimumDateKey)
    .sort((left, right) => left.date.localeCompare(right.date));

  analytics.catalogVisitorsById = Object.fromEntries(
    Object.entries(analytics.catalogVisitorsById).filter(
      ([visitorId, lastSeenDate]) =>
        optionalString(visitorId) && optionalString(lastSeenDate) >= minimumDateKey,
    ),
  );
}

async function trackCatalogVisit(request, response) {
  const cookies = parseCookies(request.headers.cookie);
  const existingVisitorId = cookies[CATALOG_VISITOR_COOKIE_NAME] || "";
  const visitorId = existingVisitorId || crypto.randomUUID();
  const todayKey = getParisDateKey();

  if (!existingVisitorId) {
    appendResponseCookie(
      response,
      createCookie(CATALOG_VISITOR_COOKIE_NAME, visitorId, {
        maxAge: 60 * 60 * 24 * 120,
      }),
    );
  }

  const store = await readStore();
  const analytics =
    store.analytics && typeof store.analytics === "object" ? store.analytics : {};
  const lastSeenDate =
    analytics.catalogVisitorsById && typeof analytics.catalogVisitorsById === "object"
      ? optionalString(analytics.catalogVisitorsById[visitorId])
      : "";

  if (lastSeenDate === todayKey) {
    return;
  }

  await updateStore((draft) => {
    const nextAnalytics = normalizeAnalytics(draft);
    pruneCatalogAnalytics(nextAnalytics, todayKey);

    if (optionalString(nextAnalytics.catalogVisitorsById[visitorId]) === todayKey) {
      return draft;
    }

    nextAnalytics.catalogVisitorsById[visitorId] = todayKey;

    const existingDay = nextAnalytics.catalogDaily.find((entry) => entry.date === todayKey);

    if (existingDay) {
      existingDay.uniqueSessions = Math.max(0, Number(existingDay.uniqueSessions || 0)) + 1;
    } else {
      nextAnalytics.catalogDaily.push({
        date: todayKey,
        uniqueSessions: 1,
      });
      nextAnalytics.catalogDaily.sort((left, right) => left.date.localeCompare(right.date));
    }

    pruneCatalogAnalytics(nextAnalytics, todayKey);
    return draft;
  });
}

function getSessionToken(request) {
  return parseCookies(request.headers.cookie)[SESSION_COOKIE_NAME] || "";
}

function getAuthenticatedUser(request, store) {
  const sessionToken = getSessionToken(request);
  const session = sessions.get(sessionToken);

  if (!session) {
    return null;
  }

  return store.users.find((user) => user.id === session.userId) || null;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const passwordHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return {
    passwordSalt: salt,
    passwordHash,
  };
}

function verifyPassword(password, user) {
  const candidateHash = crypto.scryptSync(password, user.passwordSalt, 64);
  const storedHash = Buffer.from(user.passwordHash, "hex");

  if (candidateHash.length !== storedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidateHash, storedHash);
}

function canManageUsers(user) {
  return Boolean(user && (user.isAdmin === true || user.login === "mdotnani"));
}

function startSession(response, userId) {
  const sessionToken = crypto.randomUUID();
  sessions.set(sessionToken, {
    userId,
    createdAt: new Date().toISOString(),
  });
  response.setHeader(
    "Set-Cookie",
    createCookie(SESSION_COOKIE_NAME, sessionToken, {
      maxAge: 60 * 60 * 24 * 30,
    }),
  );
}

function endSession(request, response) {
  const sessionToken = getSessionToken(request);

  if (sessionToken) {
    sessions.delete(sessionToken);
  }

  response.setHeader(
    "Set-Cookie",
    createCookie(SESSION_COOKIE_NAME, "", {
      maxAge: 0,
    }),
  );
}

function buildPublicState(store, request) {
  const state = buildAppState(store);
  const user = getAuthenticatedUser(request, store);

  return {
    ...state,
    auth: {
      isAuthenticated: Boolean(user),
      requiresSetup: store.users.length === 0,
      user: sanitizeUser(user),
    },
  };
}

function readPagination(query) {
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Number.parseInt(query.pageSize || "10", 10) || 10),
  );

  return {
    page,
    pageSize,
  };
}

function createForbiddenError(message) {
  const error = new Error(message);
  error.status = 403;
  return error;
}

function paginateItems(items, query) {
  const { page, pageSize } = readPagination(query);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      hasPreviousPage: safePage > 1,
      hasNextPage: safePage < totalPages,
    },
  };
}

function normalizeFilterText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeFilterDate(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function matchesFilterSearch(query, ...parts) {
  const search = normalizeFilterText(query.search);

  if (!search) {
    return true;
  }

  const haystack = normalizeFilterText(parts.flat().join(" "));
  return haystack.includes(search);
}

function matchesFilterDateRange(value, query) {
  const dateFrom = sanitizeFilterDate(query.dateFrom);
  const dateTo = sanitizeFilterDate(query.dateTo);

  if (!dateFrom && !dateTo) {
    return true;
  }

  const currentDate = String(value || "").slice(0, 10);

  if (!currentDate) {
    return false;
  }

  if (dateFrom && currentDate < dateFrom) {
    return false;
  }

  if (dateTo && currentDate > dateTo) {
    return false;
  }

  return true;
}

function filterProducts(items, query) {
  return items.filter((product) => matchesFilterSearch(query, product.name));
}

function filterWishlist(items, query) {
  return items.filter((entry) =>
    matchesFilterSearch(
      query,
      entry.name,
      entry.createdByName,
      entry.createdByLogin,
      entry.notes,
      entry.defaultSalePriceMad,
      entry.metrics?.franceStock,
      entry.metrics?.moroccoStock,
    ),
  );
}

function filterPurchases(items, query) {
  return items.filter(
    (purchase) =>
      matchesFilterDateRange(purchase.orderedAt, query) &&
      matchesFilterSearch(
        query,
        purchase.supplierName,
        purchase.orderNumber,
        purchase.notes,
        purchase.totalQty,
        purchase.totalCostEur,
        purchase.totalWeightKg,
        (purchase.items ?? []).map((item) => `${item.productName} ${item.qty}`),
      ),
  );
}

function filterShipments(items, query) {
  return items.filter(
    (shipment) =>
      matchesFilterDateRange(shipment.shippedAt, query) &&
      matchesFilterSearch(
        query,
        shipment.reference,
        shipment.status,
        shipment.notes,
        shipment.totalQty,
        shipment.packageWeightKg,
        shipment.shippingPriceEur,
        shipment.packageRatePerKgEur,
        (shipment.items ?? []).map((item) => `${item.productName} ${item.qty}`),
      ),
  );
}

function filterOrders(items, query) {
  return items.filter(
    (order) =>
      matchesFilterDateRange(order.orderedAt, query) &&
      matchesFilterSearch(
        query,
        order.customer?.name,
        order.customer?.phone,
        order.customer?.city,
        order.customer?.address,
        order.status,
        order.stockStatus,
        order.paymentStatus,
        order.carrierName,
        order.deliveryPriceMad,
        order.advancePaidMad,
        order.remainingToPayMad,
        order.customerTotalMad,
        order.totalProfitMad,
        (order.items ?? []).map((item) => `${item.productName} ${item.qty}`),
      ),
  );
}

function buildWishlistItems(state, store) {
  const productById = new Map(state.products.map((product) => [product.id, product]));

  return (store.wishlist ?? [])
    .map((entry) => {
      const product = productById.get(entry.productId);

      if (!product) {
        return null;
      }

      return {
        id: entry.id,
        productId: product.id,
        desiredQty: Math.max(1, Number(entry.desiredQty || 1)),
        purchased: Boolean(entry.purchased),
        purchasedAt: entry.purchasedAt || null,
        createdAt: entry.createdAt || new Date().toISOString(),
        createdByLogin: entry.createdByLogin || "",
        createdByName: entry.createdByName || entry.createdByLogin || "Équipe",
        notes: entry.notes || "",
        name: product.name,
        imageUrl: product.imageUrl || "",
        weightKg: product.weightKg,
        defaultPurchasePriceEur: product.defaultPurchasePriceEur,
        defaultSalePriceMad: product.defaultSalePriceMad,
        metrics: product.metrics,
      };
    })
    .filter(Boolean)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

function buildAvailableProducts(items) {
  return [...items]
    .filter((product) => (product.metrics?.moroccoStock ?? 0) > 0)
    .sort((left, right) => {
      const stockDelta = (right.metrics?.moroccoStock ?? 0) - (left.metrics?.moroccoStock ?? 0);

      if (stockDelta !== 0) {
        return stockDelta;
      }

      return left.name.localeCompare(right.name, "fr");
    });
}

function buildPublicCatalogProducts(store) {
  const state = buildAppState(store);
  const transitByProductId = new Map();
  const visibleShipmentStatuses = new Set(["envoye", "chez_transporteur"]);

  for (const shipment of state.shipments ?? []) {
    if (!visibleShipmentStatuses.has(shipment.status)) {
      continue;
    }

    for (const item of shipment.items ?? []) {
      transitByProductId.set(
        item.productId,
        Number((transitByProductId.get(item.productId) || 0) + Number(item.qty || 0)),
      );
    }
  }

  return state.products
    .map((product) => {
      const franceQty = Number(product.metrics?.franceStock || 0);
      const moroccoQty = Number(product.metrics?.moroccoStock || 0);
      const transitQty = Number(transitByProductId.get(product.id) || 0);
      const hasFranceStock = franceQty > 0;
      const hasMoroccoStock = moroccoQty > 0;
      const hasTransitStock = transitQty > 0;
      const visibilityScore =
        (hasMoroccoStock ? 300000 : 0) +
        (hasTransitStock ? 200000 : 0) +
        (hasFranceStock ? 100000 : 0) +
        moroccoQty * 100 +
        transitQty * 10 +
        franceQty;

      return {
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl || "",
        notes: product.notes || "",
        defaultSalePriceMad: Number(product.defaultSalePriceMad || 0),
        weightKg: Number(product.weightKg || 0),
        availability: {
          franceQty,
          moroccoQty,
          transitQty,
          hasFranceStock,
          hasMoroccoStock,
          hasTransitStock,
        },
        visibilityScore,
      };
    })
    .filter(
      (product) =>
        product.defaultSalePriceMad > 0 &&
        (
          product.availability.hasFranceStock ||
          product.availability.hasMoroccoStock ||
          product.availability.hasTransitStock
        ),
    )
    .sort(
      (left, right) =>
        right.visibilityScore - left.visibilityScore ||
        left.name.localeCompare(right.name, "fr"),
    )
    .map(({ visibilityScore, ...product }) => product);
}

function readWishlistEntryIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((entry) => optionalString(entry)).filter(Boolean))];
}

function assertNonNegativeStocks(store) {
  const state = buildAppState(store);
  const invalidProduct = state.products.find(
    (product) => product.metrics.franceStock < 0 || product.metrics.moroccoStock < 0,
  );

  if (invalidProduct) {
    throw createValidationError(
      `Cette modification rend le stock négatif pour "${invalidProduct.name}".`,
    );
  }
}

function requireCarrier(value) {
  const carrierName = requireString(value, "Transporteur");

  if (!carriers.has(carrierName)) {
    throw createValidationError("Le transporteur est invalide.");
  }

  return carrierName;
}

function requirePersonnelAdmin(user) {
  if (!canManageUsers(user)) {
    throw createForbiddenError("Seul le compte Mdotnani peut gérer le personnel.");
  }
}

function requireAuthenticatedApi(request, response, next) {
  if (request.path === "/health" || request.path.startsWith("/auth/")) {
    return next();
  }

  readStore()
    .then((store) => {
      const user = getAuthenticatedUser(request, store);

      if (!user) {
        response.status(401).json({
          message: "Authentification requise.",
          code: "AUTH_REQUIRED",
        });
        return;
      }

      request.authUser = user;
      request.authStore = store;
      next();
    })
    .catch(next);
}

function findProduct(productId, store) {
  const product = store.products.find((entry) => entry.id === productId);

  if (!product) {
    throw createValidationError("Un produit sélectionné n'existe pas ou plus.");
  }

  return product;
}

function normalizeProductNameKey(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
}

function assertUniqueProductName(store, productName, currentProductId = "") {
  const nameKey = normalizeProductNameKey(productName);
  const duplicate = store.products.find(
    (product) =>
      product.id !== currentProductId && normalizeProductNameKey(product.name) === nameKey,
  );

  if (duplicate) {
    throw createValidationError(`Le produit "${duplicate.name}" existe déjà.`);
  }
}

function buildProductImageFileName(productName, productId) {
  const slug = String(productName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "produit"}-${productId}.webp`;
}

async function syncStoredProductImageName(product) {
  if (isDatabaseStoreEnabled() || !product.imageUrl?.startsWith("/uploads/")) {
    return;
  }

  const nextFileName = buildProductImageFileName(product.name, product.id);
  const nextRelativePath = `/uploads/${nextFileName}`;

  if (product.imageUrl === nextRelativePath) {
    return;
  }

  const currentFilePath = path.join(uploadsDirectory, path.basename(product.imageUrl));
  const nextFilePath = path.join(uploadsDirectory, nextFileName);

  try {
    await fs.rename(currentFilePath, nextFilePath);
    product.imageUrl = nextRelativePath;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

async function persistProductImage(upload, productId, productName, currentImageUrl = "") {
  if (!upload?.dataUrl) {
    return "";
  }

  if (typeof upload.dataUrl !== "string") {
    throw createValidationError("Le format de la photo produit est invalide.");
  }

  const match = upload.dataUrl.match(/^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/);

  if (!match) {
    throw createValidationError("La photo doit être convertie en WebP avant envoi.");
  }

  if (match[1].length > 6_000_000) {
    throw createValidationError("La photo compressée reste trop lourde.");
  }

  if (isDatabaseStoreEnabled()) {
    return upload.dataUrl;
  }

  await fs.mkdir(uploadsDirectory, { recursive: true });

  const fileName = buildProductImageFileName(productName, productId);
  const relativePath = `/uploads/${fileName}`;
  const filePath = path.join(uploadsDirectory, fileName);

  await fs.writeFile(filePath, Buffer.from(match[1], "base64"));

  if (currentImageUrl && currentImageUrl.startsWith("/uploads/") && currentImageUrl !== relativePath) {
    await removeProductImage(currentImageUrl);
  }

  return relativePath;
}

async function persistPurchaseInvoiceImage(upload, purchaseId) {
  if (!upload?.dataUrl) {
    return "";
  }

  if (typeof upload.dataUrl !== "string") {
    throw createValidationError("Le format de la photo de facture est invalide.");
  }

  const match = upload.dataUrl.match(/^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/);

  if (!match) {
    throw createValidationError(
      "La photo de facture doit être convertie en WebP avant envoi.",
    );
  }

  if (match[1].length > 6_000_000) {
    throw createValidationError("La photo de facture compressée reste trop lourde.");
  }

  if (isDatabaseStoreEnabled()) {
    return upload.dataUrl;
  }

  await fs.mkdir(uploadsDirectory, { recursive: true });

  const relativePath = `/uploads/${purchaseId}-invoice.webp`;
  const filePath = path.join(uploadsDirectory, `${purchaseId}-invoice.webp`);

  await fs.writeFile(filePath, Buffer.from(match[1], "base64"));

  return relativePath;
}

function readItemArray(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw createValidationError("Ajoute au moins une ligne produit.");
  }

  return value;
}

async function removeProductImage(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith("/uploads/")) {
    return;
  }

  const fileName = path.basename(imageUrl);
  const filePath = path.join(uploadsDirectory, fileName);
  await fs.rm(filePath, { force: true });
}

function getProductMetricsMap(store) {
  const state = buildAppState(store);
  return new Map(state.products.map((product) => [product.id, product.metrics]));
}

function ensureStockAvailability(items, metricsById, stockKey, label) {
  const requestedByProductId = new Map();

  for (const item of items) {
    requestedByProductId.set(
      item.product.id,
      (requestedByProductId.get(item.product.id) ?? 0) + item.qty,
    );
  }

  for (const [productId, requestedQty] of requestedByProductId.entries()) {
    const metric = metricsById.get(productId);
    const availableQty = metric?.[stockKey] ?? 0;

    if (availableQty < requestedQty) {
      const productName = items.find((entry) => entry.product.id === productId)?.product.name;
      throw createValidationError(
        `Stock ${label} insuffisant pour "${productName}". Disponible: ${availableQty}.`,
      );
    }
  }
}

function resolveOrderStockStatus(value, hasAvailableStock, fallbackValue = "") {
  const requestedStatus = optionalString(value || fallbackValue);

  if (requestedStatus) {
    if (!orderStockStatuses.has(requestedStatus)) {
      throw createValidationError("Le statut stock de la commande est invalide.");
    }

    if (requestedStatus === "stock_disponible" && !hasAvailableStock) {
      throw createValidationError(
        "Le stock Maroc n'est pas suffisant pour cette commande. Passe-la en précommande.",
      );
    }

    return requestedStatus;
  }

  return hasAvailableStock ? "stock_disponible" : "precommande";
}

function createNotFoundError(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function createInitialStockPurchase(product, qty) {
  const orderedAt = new Date().toISOString();
  const lineTotalEur = Number((qty * product.defaultPurchasePriceEur).toFixed(2));

  return {
    id: createId("buy"),
    supplierName: "Stock initial",
    orderNumber: `INIT-${product.id}`,
    orderedAt,
    notes: "Créé automatiquement depuis le formulaire produit.",
    items: [
      {
        productId: product.id,
        qty,
        unitPurchasePriceEur: product.defaultPurchasePriceEur,
        lineTotalEur,
        lineWeightKg: Number((qty * product.weightKg).toFixed(3)),
      },
    ],
    totalQty: qty,
    totalCostEur: lineTotalEur,
    totalWeightKg: Number((qty * product.weightKg).toFixed(3)),
  };
}

function readSourcePurchaseIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((entry) => optionalString(entry)).filter(Boolean))];
}

function normalizePurchaseItemsForComparison(items = []) {
  return [...(items ?? [])]
    .map((item) => ({
      productId: item.productId,
      qty: Number(item.qty || 0),
      unitPurchasePriceEur: Number(item.unitPurchasePriceEur || 0),
    }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
}

function linkedShipmentForPurchase(store, purchaseId) {
  return store.shipments.find((shipment) =>
    (shipment.sourcePurchaseIds ?? []).includes(purchaseId),
  );
}

function validateShipmentSourcePurchases(store, sourcePurchaseIds, currentShipmentId = "") {
  const normalizedIds = readSourcePurchaseIds(sourcePurchaseIds);

  normalizedIds.forEach((purchaseId) => {
    findRecord(store.purchases, purchaseId, "Achat");
  });

  const duplicateShipment = store.shipments.find(
    (shipment) =>
      shipment.id !== currentShipmentId &&
      (shipment.sourcePurchaseIds ?? []).some((purchaseId) => normalizedIds.includes(purchaseId)),
  );

  if (duplicateShipment) {
    throw createValidationError(
      "Un des achats sélectionnés est déjà rattaché à un autre envoi.",
    );
  }

  return normalizedIds;
}

function productHasHistory(productId, store) {
  const collections = [store.purchases, store.shipments, store.orders];

  return collections.some((collection) =>
    collection.some((entry) => (entry.items ?? []).some((item) => item.productId === productId)),
  );
}

function findRecord(collection, recordId, label) {
  const record = collection.find((entry) => entry.id === recordId);

  if (!record) {
    throw createNotFoundError(`${label} introuvable.`);
  }

  return record;
}

function buildPurchaseRecord(payload, store, recordId = createId("buy")) {
  const items = readItemArray(payload.items).map((item) => {
    const product = findProduct(item.productId, store);
    const qty = requireInteger(item.qty, "Quantité achetée", { min: 1 });
    const unitPurchasePriceEur = requireNumber(
      item.unitPurchasePriceEur ?? product.defaultPurchasePriceEur,
      "Prix unitaire d'achat",
      { min: 0 },
    );

    return {
      productId: product.id,
      qty,
      unitPurchasePriceEur,
      lineTotalEur: Number((qty * unitPurchasePriceEur).toFixed(2)),
      lineWeightKg: Number((qty * product.weightKg).toFixed(3)),
    };
  });

  return {
    id: recordId,
    supplierName: requireString(payload.supplierName || "Action", "Fournisseur"),
    orderNumber: optionalString(payload.orderNumber),
    orderedAt: toRecordDate(payload.orderedAt),
    notes: optionalString(payload.notes),
    invoiceImageUrl: optionalString(payload.invoiceImageUrl),
    items,
    totalQty: items.reduce((total, item) => total + item.qty, 0),
    totalCostEur: Number(items.reduce((total, item) => total + item.lineTotalEur, 0).toFixed(2)),
    totalWeightKg: Number(
      items.reduce((total, item) => total + item.lineWeightKg, 0).toFixed(3),
    ),
  };
}

function buildShipmentRecord(payload, store, recordId = createId("shp")) {
  const shipmentBeingEdited = store.shipments.find((entry) => entry.id === recordId);
  const stockStore = shipmentBeingEdited
    ? {
        ...store,
        shipments: store.shipments.filter((entry) => entry.id !== recordId),
      }
    : store;
  const metricsById = getProductMetricsMap(stockStore);
  const sourcePurchaseIds = validateShipmentSourcePurchases(
    store,
    payload.sourcePurchaseIds,
    recordId,
  );
  const rawItemsSource = sourcePurchaseIds.length
    ? sourcePurchaseIds.flatMap((purchaseId) => {
        const purchase = findRecord(store.purchases, purchaseId, "Achat");

        return (purchase.items ?? []).map((item) => ({
          productId: item.productId,
          qty: item.qty,
        }));
      })
    : readItemArray(payload.items);

  const aggregatedSourceItems = new Map();

  rawItemsSource.forEach((item) => {
    const product = findProduct(item.productId, store);
    const qty = requireInteger(item.qty, "Quantité envoyée", { min: 1 });
    const metric = metricsById.get(product.id);
    const existing = aggregatedSourceItems.get(product.id);

    if (existing) {
      existing.qty += qty;
      existing.weightKg = Number((existing.qty * product.weightKg).toFixed(3));
      return;
    }

    aggregatedSourceItems.set(product.id, {
      product,
      qty,
      weightKg: Number((qty * product.weightKg).toFixed(3)),
      avgPurchaseCostEur: metric.avgPurchaseCostEur,
    });
  });

  const rawItems = [...aggregatedSourceItems.values()];

  const packageWeightKg = requireNumber(payload.packageWeightKg, "Poids du colis", {
    min: 0.001,
  });
  const shippingPriceEur = requireNumber(payload.shippingPriceEur, "Prix du transport", {
    min: 0,
  });
  const status = optionalString(payload.status || "achete");

  if (!shipmentStatuses.has(status)) {
    throw createValidationError("Le statut de l'envoi est invalide.");
  }

  const allocatedItems = allocateByWeight(rawItems, shippingPriceEur).map((item) => {
    const unitShippingCostEur = Number((item.allocatedCostEur / item.qty).toFixed(2));
    const unitLandedCostEur = Number(
      (item.avgPurchaseCostEur + item.allocatedCostEur / item.qty).toFixed(2),
    );

    return {
      productId: item.product.id,
      qty: item.qty,
      lineWeightKg: item.weightKg,
      unitBaseCostEur: item.avgPurchaseCostEur,
      shippingCostEur: item.allocatedCostEur,
      unitShippingCostEur,
      unitLandedCostEur,
      totalLandedCostEur: Number(
        (item.qty * item.avgPurchaseCostEur + item.allocatedCostEur).toFixed(2),
      ),
    };
  });

  return {
    id: recordId,
    shippedAt: toRecordDate(payload.shippedAt),
    status,
    responsibleName: "MALAK",
    sourcePurchaseIds,
    reference: optionalString(payload.reference),
    packageWeightKg,
    shippingPriceEur,
    packageRatePerKgEur: Number((shippingPriceEur / packageWeightKg).toFixed(2)),
    totalItemWeightKg: Number(
      allocatedItems.reduce((total, item) => total + item.lineWeightKg, 0).toFixed(3),
    ),
    notes: optionalString(payload.notes),
    items: allocatedItems,
    totalQty: allocatedItems.reduce((total, item) => total + item.qty, 0),
    totalLandedCostEur: Number(
      allocatedItems.reduce((total, item) => total + item.totalLandedCostEur, 0).toFixed(2),
    ),
  };
}

function buildOrderPaymentState({
  paymentStatus,
  advancePaidMad,
  customerTotalMad,
  fallbackAdvancePaidMad = 0,
  fallbackPaidAt = null,
}) {
  const requestedStatus = optionalString(paymentStatus || "non_payee");

  if (!paymentStatuses.has(requestedStatus)) {
    throw createValidationError("Le statut de paiement est invalide.");
  }

  if (customerTotalMad <= 0) {
    return {
      paymentStatus: requestedStatus === "payee" ? "payee" : "non_payee",
      advancePaidMad: 0,
      remainingToPayMad: 0,
      paidAt: requestedStatus === "payee" ? fallbackPaidAt || new Date().toISOString() : null,
    };
  }

  let normalizedAdvancePaidMad;

  if (requestedStatus === "payee") {
    normalizedAdvancePaidMad = customerTotalMad;
  } else if (requestedStatus === "non_payee") {
    normalizedAdvancePaidMad = 0;
  } else if (advancePaidMad === undefined || advancePaidMad === null || advancePaidMad === "") {
    normalizedAdvancePaidMad = requireNumber(
      fallbackAdvancePaidMad,
      "Avance payée MAD",
      { min: 0 },
    );
  } else {
    normalizedAdvancePaidMad = requireNumber(advancePaidMad, "Avance payée MAD", { min: 0 });
  }

  if (normalizedAdvancePaidMad > customerTotalMad) {
    throw createValidationError("L'avance payée ne peut pas dépasser le total client.");
  }

  if (requestedStatus === "avance") {
    if (normalizedAdvancePaidMad <= 0) {
      throw createValidationError("Renseigne une avance payée supérieure à 0.");
    }

    if (normalizedAdvancePaidMad >= customerTotalMad) {
      throw createValidationError("Une avance doit rester inférieure au total client.");
    }
  }

  const remainingToPayMad = Number((customerTotalMad - normalizedAdvancePaidMad).toFixed(2));
  const normalizedStatus =
    normalizedAdvancePaidMad <= 0
      ? "non_payee"
      : remainingToPayMad <= 0
        ? "payee"
        : "avance";

  return {
    paymentStatus: normalizedStatus,
    advancePaidMad: Number(normalizedAdvancePaidMad.toFixed(2)),
    remainingToPayMad,
    paidAt: normalizedStatus === "payee" ? fallbackPaidAt || new Date().toISOString() : null,
  };
}

function buildOrderRecord(payload, store, recordId = createId("ord")) {
  const existingOrder = store.orders.find((entry) => entry.id === recordId);
  const stockStore = existingOrder
    ? {
        ...store,
        orders: store.orders.filter((entry) => entry.id !== recordId),
      }
    : store;
  const metricsById = getProductMetricsMap(stockStore);
  const eurToMad = store.settings.eurToMad;
  const items = readItemArray(payload.items).map((item) => {
    const product = findProduct(item.productId, store);
    const qty = requireInteger(item.qty, "Quantité commandée", { min: 1 });
    const metric = metricsById.get(product.id);
    const unitSalePriceMad = requireNumber(
      item.unitSalePriceMad ?? product.defaultSalePriceMad,
      "Prix unitaire de vente MAD",
      { min: 0 },
    );
    const unitCostEur = metric.avgLandedCostEur;
    const unitCostMad = Number((unitCostEur * eurToMad).toFixed(2));
    const lineRevenueMad = Number((qty * unitSalePriceMad).toFixed(2));
    const lineCostMad = Number((qty * unitCostMad).toFixed(2));
    const lineProfitMad = Number((lineRevenueMad - lineCostMad).toFixed(2));

    return {
      productId: product.id,
      qty,
      unitSalePriceMad,
      unitCostEur,
      unitCostMad,
      lineRevenueMad,
      lineCostMad,
      lineProfitMad,
      marginRate:
        lineRevenueMad > 0 ? Number(((lineProfitMad / lineRevenueMad) * 100).toFixed(2)) : 0,
    };
  });
  const availabilityItems = items.map((item) => ({
    product: findProduct(item.productId, store),
    qty: item.qty,
  }));
  const hasAvailableStock = (() => {
    try {
      ensureStockAvailability(availabilityItems, metricsById, "moroccoStock", "Maroc");
      return true;
    } catch (error) {
      if (error?.status === 400) {
        return false;
      }

      throw error;
    }
  })();
  const stockStatus = resolveOrderStockStatus(
    payload.stockStatus,
    hasAvailableStock,
    existingOrder?.stockStatus || "",
  );

  const status = optionalString(payload.status || "confirmee");

  if (!orderStatuses.has(status)) {
    throw createValidationError("Le statut de commande est invalide.");
  }

  const paymentStatus = optionalString(payload.paymentStatus || "non_payee");

  const deliveryPriceMad = requireNumber(payload.deliveryPriceMad ?? 0, "Prix de livraison MAD", {
    min: 0,
  });
  const carrierName = requireCarrier(payload.carrierName);
  const itemsRevenueMad = Number(
    items.reduce((total, item) => total + item.lineRevenueMad, 0).toFixed(2),
  );
  const customerTotalMad = Number((itemsRevenueMad + deliveryPriceMad).toFixed(2));
  const totalRevenueMad = itemsRevenueMad;
  const totalCostMad = Number(items.reduce((total, item) => total + item.lineCostMad, 0).toFixed(2));
  const totalProfitMad = Number((itemsRevenueMad - totalCostMad).toFixed(2));
  const paymentState = buildOrderPaymentState({
    paymentStatus,
    advancePaidMad: payload.advancePaidMad,
    customerTotalMad,
    fallbackAdvancePaidMad: existingOrder?.advancePaidMad ?? 0,
    fallbackPaidAt: existingOrder?.paidAt || null,
  });

  return {
    id: recordId,
    orderedAt: toRecordDate(payload.orderedAt),
    status,
    stockStatus,
    paymentStatus: paymentState.paymentStatus,
    paidAt: paymentState.paidAt,
    carrierName,
    deliveryPriceMad,
    advancePaidMad: paymentState.advancePaidMad,
    remainingToPayMad: paymentState.remainingToPayMad,
    customer: {
      name: requireString(payload.customerName, "Nom client"),
      phone: normalizeMoroccanPhone(payload.customerPhone),
      city: requireString(payload.customerCity, "Ville"),
      address: requireString(payload.customerAddress, "Adresse"),
    },
    notes: optionalString(payload.notes),
    items,
    totalQty: items.reduce((total, item) => total + item.qty, 0),
    itemsRevenueMad,
    customerTotalMad,
    totalRevenueMad,
    totalCostMad,
    totalProfitMad,
    marginRate:
      totalRevenueMad > 0 ? Number(((totalProfitMad / totalRevenueMad) * 100).toFixed(2)) : 0,
  };
}

function writeInvoicePdf(response, order, settings, options = {}) {
  const download = options.download !== false;
  const doc = new PDFDocument({
    size: "A4",
    margin: 28,
    info: {
      Title: `Facture ${order.id}`,
      Author: settings.companyName || "Action BLA Ghla",
    },
  });

  const rows = order.items.map((item) => ({
    label: `${item.productName} x${item.qty}`,
    amount: new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "MAD",
      maximumFractionDigits: 2,
    }).format(item.lineRevenueMad),
  }));

  if (order.deliveryPriceMad > 0) {
    rows.push({
      label: `Livraison (${order.carrierName})`,
      amount: new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "MAD",
        maximumFractionDigits: 2,
      }).format(order.deliveryPriceMad),
    });
  }

  response.setHeader("Content-Type", "application/pdf");
  response.setHeader(
    "Content-Disposition",
    `${download ? "attachment" : "inline"}; filename="facture-${order.id}.pdf"`,
  );

  doc.pipe(response);

  doc
    .fontSize(19)
    .fillColor("#154284")
    .text(settings.companyName || "Action BLA Ghla", 28, 28)
    .fontSize(8.5)
    .fillColor("#5a6473")
    .text(`Facture ${order.id}`, { align: "right" })
    .text(`Date ${new Date(order.orderedAt).toLocaleDateString("fr-FR")}`, {
      align: "right",
    });

  doc
    .moveDown(1)
    .fontSize(10)
    .fillColor("#111827")
    .text(`Client: ${order.customer.name}`)
    .text(`Téléphone: ${order.customer.phone}`)
    .text(`Ville: ${order.customer.city}`)
    .text(`Adresse: ${order.customer.address}`);

  let cursorY = 148;
  doc
    .roundedRect(28, cursorY, 539, 24, 8)
    .fillAndStroke("#f7c600", "#f7c600")
    .fillColor("#111827")
    .fontSize(9)
    .text("Détail", 40, cursorY + 7)
    .text("Montant", 438, cursorY + 7, { width: 110, align: "right" });

  cursorY += 32;

  rows.forEach((row) => {
    doc
      .fillColor("#111827")
      .fontSize(9)
      .text(row.label, 40, cursorY, { width: 366 })
      .text(row.amount, 438, cursorY, { width: 110, align: "right" });
    cursorY += 18;
  });

  cursorY += 4;
  doc
    .moveTo(28, cursorY)
    .lineTo(567, cursorY)
    .strokeColor("#d1d5db")
    .stroke();
  cursorY += 12;

  doc
    .fontSize(10)
    .fillColor("#5a6473")
    .text("Total à payer", 336, cursorY, { width: 120, align: "right" })
    .fillColor("#111827")
    .fontSize(13)
    .text(
      new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "MAD",
        maximumFractionDigits: 2,
      }).format(order.customerTotalMad ?? order.totalRevenueMad),
      438,
      cursorY - 2,
      { width: 110, align: "right" },
    );

  cursorY += 30;
  doc
    .fontSize(8.5)
    .fillColor("#5a6473")
    .text(`Statut: ${order.status}`, 28, cursorY)
    .text(
      `Paiement: ${
        order.paymentStatus === "payee"
          ? "Payée"
          : order.paymentStatus === "avance"
            ? "Avance reçue"
            : "Non payée"
      }`,
      214,
      cursorY,
    )
    .text(`Transporteur: ${order.carrierName}`, 392, cursorY, { width: 160, align: "right" });

  if (order.notes) {
    cursorY += 20;
    doc
      .fontSize(8)
      .fillColor("#5a6473")
      .text(`Notes: ${order.notes}`, 28, cursorY, { width: 539 });
  }

  doc.end();
}

app.use((request, _response, next) => {
  console.log(`${request.method} ${request.url}`);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    app: "action-bla-ghla-admin",
    stack: "node-express-static",
    storage: getStoreStatus(),
    timestamp: new Date().toISOString(),
  });
});

app.get(
  "/api/auth/session",
  asyncRoute(async (request, response) => {
    const store = await readStore();
    const user = getAuthenticatedUser(request, store);

    response.json({
      isAuthenticated: Boolean(user),
      requiresSetup: store.users.length === 0,
      user: sanitizeUser(user),
    });
  }),
);

app.post(
  "/api/auth/setup",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore((store) => {
      if (store.users.length > 0) {
        throw createValidationError("Un compte existe déjà. Connecte-toi.");
      }

      const password = requireString(request.body.password, "Mot de passe");

      if (password.length < 8) {
        throw createValidationError("Le mot de passe doit contenir au moins 8 caractères.");
      }

      const user = {
        id: createId("usr"),
        login: requireString(request.body.login, "Identifiant").toLowerCase(),
        displayName: requireString(request.body.displayName, "Nom affiché"),
        ...hashPassword(password),
        createdAt: new Date().toISOString(),
      };

      store.users.push(user);
      return store;
    });

    const user = nextStore.users[0];
    startSession(response, user.id);
    response.status(201).json({
      message: "Compte créé et connecté.",
      user: sanitizeUser(user),
    });
  }),
);

app.post(
  "/api/auth/login",
  asyncRoute(async (request, response) => {
    const store = await readStore();
    const login = requireString(request.body.login, "Identifiant").toLowerCase();
    const password = requireString(request.body.password, "Mot de passe");
    const user = store.users.find((entry) => entry.login === login);

    if (!user || !verifyPassword(password, user)) {
      throw createValidationError("Identifiant ou mot de passe incorrect.");
    }

    startSession(response, user.id);
    response.json({
      message: "Connexion réussie.",
      user: sanitizeUser(user),
    });
  }),
);

app.post("/api/auth/logout", (request, response) => {
  endSession(request, response);
  response.json({
    message: "Déconnexion réussie.",
  });
});

app.get(
  "/api/public/catalog",
  asyncRoute(async (_request, response) => {
    const store = await readStore();
    const products = buildPublicCatalogProducts(store);

    response.json({
      appName: store.settings?.companyName || "Action BLA Ghla",
      brandLogoUrl: "/assets/logo-action-bla-ghla.png",
      generatedAt: new Date().toISOString(),
      summary: {
        totalProducts: products.length,
        totalMoroccoReady: products.filter((product) => product.availability.hasMoroccoStock).length,
        totalTransit: products.filter((product) => product.availability.hasTransitStock).length,
        totalFranceReady: products.filter((product) => product.availability.hasFranceStock).length,
      },
      products,
    });
  }),
);

app.use("/api", requireAuthenticatedApi);

app.get(
  "/api/users",
  asyncRoute(async (request, response) => {
    requirePersonnelAdmin(request.authUser);

    const users = request.authStore.users
      .slice()
      .sort((left, right) => {
        const adminDelta = Number(canManageUsers(right)) - Number(canManageUsers(left));

        if (adminDelta !== 0) {
          return adminDelta;
        }

        return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
      })
      .map(sanitizeManagedUser);

    response.json(paginateItems(users, request.query));
  }),
);

app.post(
  "/api/users",
  asyncRoute(async (request, response) => {
    requirePersonnelAdmin(request.authUser);

    const nextStore = await updateStore((store) => {
      const displayName = requireString(request.body.displayName, "Nom affiché");
      const login = requireString(request.body.login, "Identifiant").toLowerCase();
      const password = requireString(request.body.password, "Mot de passe");

      if (password.length < 8) {
        throw createValidationError("Le mot de passe doit contenir au moins 8 caractères.");
      }

      if (store.users.some((user) => user.login === login)) {
        throw createValidationError("Cet identifiant existe déjà.");
      }

      const user = {
        id: createId("usr"),
        login,
        displayName,
        ...hashPassword(password),
        createdAt: new Date().toISOString(),
      };

      store.users.push(user);
      return store;
    });

    const createdUser = nextStore.users.at(-1);

    response.status(201).json({
      message: "Compte créé.",
      user: sanitizeManagedUser(createdUser),
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.get(
  "/api/app-state",
  asyncRoute(async (request, response) => {
    const store = await readStore();
    response.json(buildPublicState(store, request));
  }),
);

app.get(
  "/api/bootstrap",
  asyncRoute(async (request, response) => {
    const store = await readStore();
    const appState = buildPublicState(store, request);

    response.json({
      appName: appState.settings.companyName,
      hostingTarget: "lowest-cost",
      nextBuild: ["produits", "achats", "envois", "commandes", "stats"],
      dashboard: appState.dashboard,
    });
  }),
);

app.get(
  "/api/products",
  asyncRoute(async (request, response) => {
    const store = await readStore();
    const state = buildPublicState(store, request);
    const wishlistIds = new Set(state.wishlistProductIds ?? []);
    const items = state.products.map((product) => ({
      ...product,
      hasHistory: productHasHistory(product.id, store),
      isWishlisted: wishlistIds.has(product.id),
    }));

    response.json(paginateItems(filterProducts(items, request.query), request.query));
  }),
);

app.get(
  "/api/wishlist",
  asyncRoute(async (request, response) => {
    const store = await readStore();
    const state = buildPublicState(store, request);
    response.json({
      items: filterWishlist(buildWishlistItems(state, store), request.query),
      pagination: null,
    });
  }),
);

app.get(
  "/api/available-products",
  asyncRoute(async (request, response) => {
    const store = await readStore();
    const state = buildPublicState(store, request);
    response.json(paginateItems(buildAvailableProducts(state.products), request.query));
  }),
);

app.get(
  "/api/purchases",
  asyncRoute(async (request, response) => {
    const store = await readStore();
    const state = buildPublicState(store, request);
    response.json(paginateItems(filterPurchases(state.purchases, request.query), request.query));
  }),
);

app.get(
  "/api/shipments",
  asyncRoute(async (request, response) => {
    const store = await readStore();
    const state = buildPublicState(store, request);
    response.json(paginateItems(filterShipments(state.shipments, request.query), request.query));
  }),
);

app.get(
  "/api/orders",
  asyncRoute(async (request, response) => {
    const store = await readStore();
    const state = buildPublicState(store, request);
    const productImageById = new Map(
      state.products.map((product) => [product.id, product.imageUrl || ""]),
    );
    const items = state.orders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        productImageUrl: productImageById.get(item.productId) || "",
      })),
    }));

    response.json(paginateItems(filterOrders(items, request.query), request.query));
  }),
);

app.get(
  "/api/shipments/:shipmentId",
  asyncRoute(async (request, response) => {
    const store = await readStore();
    const state = buildPublicState(store, request);
    const shipment = state.shipments.find((entry) => entry.id === request.params.shipmentId);

    if (!shipment) {
      throw createNotFoundError("Envoi introuvable.");
    }

    const productImageById = new Map(
      state.products.map((product) => [product.id, product.imageUrl || ""]),
    );

    response.json({
      ...shipment,
      items: shipment.items.map((item) => ({
        ...item,
        productImageUrl: productImageById.get(item.productId) || "",
      })),
    });
  }),
);

app.put(
  "/api/settings",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore((store) => {
      store.settings.companyName = requireString(
        request.body.companyName,
        "Nom de l'application",
      );
      store.settings.transportRatePerKgEur = requireNumber(
        request.body.transportRatePerKgEur,
        "Transport EUR/kg",
        { min: 0 },
      );
      store.settings.eurToMad = requireNumber(request.body.eurToMad, "Taux EUR vers MAD", {
        min: 0.01,
      });
      store.settings.lowStockDefault = requireInteger(
        request.body.lowStockDefault,
        "Seuil stock faible",
        { min: 0 },
      );

      return store;
    });

    response.json({
      message: "Réglages mis à jour.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.post(
  "/api/products",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore(async (store) => {
      const productName = requireString(request.body.name, "Nom du produit");
      assertUniqueProductName(store, productName);

      const product = {
        id: createId("prd"),
        name: productName,
        weightKg: requireNumber(request.body.weightKg, "Poids produit", { min: 0.001 }),
        defaultPurchasePriceEur: requireNumber(
          request.body.defaultPurchasePriceEur,
          "Prix d'achat EUR",
          { min: 0 },
        ),
        defaultSalePriceMad: requireNumber(request.body.defaultSalePriceMad, "Prix de vente MAD", {
          min: 0,
        }),
        minStockAlert: requireInteger(request.body.minStockAlert, "Seuil stock faible", {
          min: 0,
        }),
        imageUrl: "",
        notes: optionalString(request.body.notes),
        createdAt: new Date().toISOString(),
      };
      const initialStockQty = requireInteger(
        request.body.initialStockQty ?? 0,
        "Stock initial France",
        { min: 0 },
      );

      product.imageUrl =
        (await persistProductImage(request.body.imageUpload, product.id, product.name)) ||
        optionalString(request.body.imageUrl);

      store.products.push(product);

      if (initialStockQty > 0) {
        store.purchases.push(createInitialStockPurchase(product, initialStockQty));
      }

      return store;
    });

    response.status(201).json({
      message: "Produit ajouté.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.put(
  "/api/products/:productId",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore(async (store) => {
      const product = findProduct(request.params.productId, store);
      const productName = requireString(request.body.name, "Nom du produit");

      assertUniqueProductName(store, productName, product.id);

      product.name = productName;
      product.weightKg = requireNumber(request.body.weightKg, "Poids produit", { min: 0.001 });
      product.defaultPurchasePriceEur = requireNumber(
        request.body.defaultPurchasePriceEur,
        "Prix d'achat EUR",
        { min: 0 },
      );
      product.defaultSalePriceMad = requireNumber(
        request.body.defaultSalePriceMad,
        "Prix de vente MAD",
        { min: 0 },
      );
      product.minStockAlert = requireInteger(
        request.body.minStockAlert,
        "Seuil stock faible",
        { min: 0 },
      );
      product.notes = optionalString(request.body.notes);
      product.updatedAt = new Date().toISOString();

      if (request.body.imageUpload?.dataUrl) {
        product.imageUrl = await persistProductImage(
          request.body.imageUpload,
          product.id,
          product.name,
          product.imageUrl,
        );
      } else {
        await syncStoredProductImageName(product);
      }

      return store;
    });

    response.json({
      message: "Produit mis à jour.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.delete(
  "/api/products/:productId",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore(async (store) => {
      const productIndex = store.products.findIndex(
        (entry) => entry.id === request.params.productId,
      );

      if (productIndex === -1) {
        throw createNotFoundError("Produit introuvable.");
      }

      const product = store.products[productIndex];

      if (productHasHistory(product.id, store)) {
        throw createValidationError(
          "Impossible de supprimer ce produit car il est déjà utilisé dans l'historique.",
        );
      }

      store.products.splice(productIndex, 1);
      store.wishlist = (store.wishlist ?? []).filter((entry) => entry.productId !== product.id);
      await removeProductImage(product.imageUrl);
      return store;
    });

    response.json({
      message: "Produit supprimé.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.post(
  "/api/wishlist",
  asyncRoute(async (request, response) => {
    let wishlistAction = "added";

    const nextStore = await updateStore((store) => {
      const user = getAuthenticatedUser(request, store);
      const product = findProduct(request.body.productId, store);
      const existingEntry = (store.wishlist ?? []).find((entry) => entry.productId === product.id);

      if (existingEntry) {
        store.wishlist = (store.wishlist ?? []).filter((entry) => entry.productId !== product.id);
        wishlistAction = "removed";
        return store;
      }

      store.wishlist = store.wishlist ?? [];
      store.wishlist.push({
        id: createId("wish"),
        productId: product.id,
        desiredQty: requireInteger(request.body.desiredQty ?? 1, "Quantité souhaitée", { min: 1 }),
        purchased: false,
        purchasedAt: null,
        createdAt: new Date().toISOString(),
        createdByLogin: user?.login || "",
        createdByName: user?.displayName || user?.login || "Équipe",
      });

      return store;
    });

    response.status(wishlistAction === "added" ? 201 : 200).json({
      message:
        wishlistAction === "added"
          ? "Produit ajouté à la wishlist."
          : "Produit retiré de la wishlist.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.patch(
  "/api/wishlist/:wishlistId",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore((store) => {
      const wishlistEntry = (store.wishlist ?? []).find(
        (entry) => entry.id === request.params.wishlistId,
      );

      if (!wishlistEntry) {
        throw createNotFoundError("Entrée wishlist introuvable.");
      }

      if (request.body.desiredQty !== undefined) {
        wishlistEntry.desiredQty = requireInteger(
          request.body.desiredQty,
          "Quantité souhaitée",
          { min: 1 },
        );
      }

      if (request.body.purchased !== undefined) {
        wishlistEntry.purchased = Boolean(request.body.purchased);
        wishlistEntry.purchasedAt = wishlistEntry.purchased ? new Date().toISOString() : null;
      }

      return store;
    });

    response.json({
      message: "Quantité souhaitée mise à jour.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.delete(
  "/api/wishlist/:wishlistId",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore((store) => {
      const wishlistIndex = (store.wishlist ?? []).findIndex(
        (entry) => entry.id === request.params.wishlistId,
      );

      if (wishlistIndex === -1) {
        throw createNotFoundError("Entrée wishlist introuvable.");
      }

      store.wishlist.splice(wishlistIndex, 1);
      return store;
    });

    response.json({
      message: "Produit retiré de la wishlist.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.post(
  "/api/purchases",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore(async (store) => {
      const sourceWishlistIds = readWishlistEntryIds(request.body.sourceWishlistIds);
      const sourceWishlistEntries = sourceWishlistIds.map((wishlistId) => {
        const entry = (store.wishlist ?? []).find((wishlistEntry) => wishlistEntry.id === wishlistId);

        if (!entry) {
          throw createNotFoundError("Entrée wishlist introuvable.");
        }

        if (!entry.purchased) {
          throw createValidationError(
            "Tous les produits convertis en achat doivent être marqués comme achetés.",
          );
        }

        return entry;
      });

      const purchase = buildPurchaseRecord(request.body, store);
      purchase.invoiceImageUrl =
        (await persistPurchaseInvoiceImage(request.body.invoiceImageUpload, purchase.id)) ||
        purchase.invoiceImageUrl;
      store.purchases.push(purchase);
      if (sourceWishlistEntries.length) {
        const sourceWishlistIdSet = new Set(sourceWishlistEntries.map((entry) => entry.id));
        store.wishlist = (store.wishlist ?? []).filter(
          (entry) => !sourceWishlistIdSet.has(entry.id),
        );
      }
      assertNonNegativeStocks(store);
      return store;
    });

    response.status(201).json({
      message: "Commande fournisseur enregistrée.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.put(
  "/api/purchases/:purchaseId",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore(async (store) => {
      const purchaseIndex = store.purchases.findIndex(
        (entry) => entry.id === request.params.purchaseId,
      );

      if (purchaseIndex === -1) {
        throw createNotFoundError("Achat introuvable.");
      }

      const existingPurchase = store.purchases[purchaseIndex];
      const nextPurchase = buildPurchaseRecord(
        request.body,
        store,
        request.params.purchaseId,
      );
      const linkedShipment = linkedShipmentForPurchase(store, request.params.purchaseId);
      nextPurchase.invoiceImageUrl = existingPurchase.invoiceImageUrl || "";

      if (
        linkedShipment &&
        JSON.stringify(normalizePurchaseItemsForComparison(nextPurchase.items)) !==
          JSON.stringify(normalizePurchaseItemsForComparison(existingPurchase.items))
      ) {
        throw createValidationError(
          "Cet achat est déjà lié à un envoi. Les articles, quantités et prix d'achat ne peuvent plus être modifiés.",
        );
      }

      if (request.body.invoiceImageUpload?.dataUrl) {
        nextPurchase.invoiceImageUrl = await persistPurchaseInvoiceImage(
          request.body.invoiceImageUpload,
          request.params.purchaseId,
        );
      }

      store.purchases[purchaseIndex] = nextPurchase;
      assertNonNegativeStocks(store);
      return store;
    });

    response.json({
      message: "Achat mis à jour.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.delete(
  "/api/purchases/:purchaseId",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore(async (store) => {
      const purchaseIndex = store.purchases.findIndex(
        (entry) => entry.id === request.params.purchaseId,
      );

      if (purchaseIndex === -1) {
        throw createNotFoundError("Achat introuvable.");
      }

      const [purchase] = store.purchases.splice(purchaseIndex, 1);
      await removeProductImage(purchase?.invoiceImageUrl);
      assertNonNegativeStocks(store);
      return store;
    });

    response.json({
      message: "Achat supprimé.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.post(
  "/api/shipments",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore((store) => {
      store.shipments.push(buildShipmentRecord(request.body, store));
      assertNonNegativeStocks(store);
      return store;
    });

    response.status(201).json({
      message: "Envoi vers le Maroc ajouté.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.put(
  "/api/shipments/:shipmentId",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore((store) => {
      const shipmentIndex = store.shipments.findIndex(
        (entry) => entry.id === request.params.shipmentId,
      );

      if (shipmentIndex === -1) {
        throw createNotFoundError("Envoi introuvable.");
      }

      const existingShipment = store.shipments[shipmentIndex];

      store.shipments[shipmentIndex] = buildShipmentRecord(
        {
          ...request.body,
          sourcePurchaseIds:
            request.body.sourcePurchaseIds ?? existingShipment.sourcePurchaseIds ?? [],
        },
        store,
        request.params.shipmentId,
      );
      assertNonNegativeStocks(store);
      return store;
    });

    response.json({
      message: "Envoi mis à jour.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.delete(
  "/api/shipments/:shipmentId",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore((store) => {
      const shipmentIndex = store.shipments.findIndex(
        (entry) => entry.id === request.params.shipmentId,
      );

      if (shipmentIndex === -1) {
        throw createNotFoundError("Envoi introuvable.");
      }

      store.shipments.splice(shipmentIndex, 1);
      assertNonNegativeStocks(store);
      return store;
    });

    response.json({
      message: "Envoi supprimé.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.patch(
  "/api/shipments/:shipmentId/summary",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore((store) => {
      const shipment = findRecord(store.shipments, request.params.shipmentId, "Envoi");
      const nextStatus = optionalString(request.body.status || shipment.status || "envoye");

      if (!shipmentStatuses.has(nextStatus)) {
        throw createValidationError("Le statut de l'envoi est invalide.");
      }

      shipment.status = nextStatus;
      assertNonNegativeStocks(store);
      return store;
    });

    response.json({
      message: "Statut de l'envoi mis à jour.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.post(
  "/api/orders",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore((store) => {
      store.orders.push(buildOrderRecord(request.body, store));
      assertNonNegativeStocks(store);
      return store;
    });

    response.status(201).json({
      message: "Commande client ajoutée.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.put(
  "/api/orders/:orderId",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore((store) => {
      const orderIndex = store.orders.findIndex((entry) => entry.id === request.params.orderId);

      if (orderIndex === -1) {
        throw createNotFoundError("Commande introuvable.");
      }

      store.orders[orderIndex] = buildOrderRecord(request.body, store, request.params.orderId);
      assertNonNegativeStocks(store);
      return store;
    });

    response.json({
      message: "Commande mise à jour.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.delete(
  "/api/orders/:orderId",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore((store) => {
      const orderIndex = store.orders.findIndex((entry) => entry.id === request.params.orderId);

      if (orderIndex === -1) {
        throw createNotFoundError("Commande introuvable.");
      }

      store.orders.splice(orderIndex, 1);
      assertNonNegativeStocks(store);
      return store;
    });

    response.json({
      message: "Commande supprimée.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.patch(
  "/api/orders/:orderId/summary",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore((store) => {
      const order = findRecord(store.orders, request.params.orderId, "Commande");
      const nextStatus = optionalString(request.body.status || order.status);
      const stockStore = {
        ...store,
        orders: store.orders.filter((entry) => entry.id !== order.id),
      };
      const metricsById = getProductMetricsMap(stockStore);
      const availabilityItems = (order.items ?? []).map((item) => ({
        product: findProduct(item.productId, store),
        qty: item.qty,
      }));
      const hasAvailableStock = (() => {
        try {
          ensureStockAvailability(availabilityItems, metricsById, "moroccoStock", "Maroc");
          return true;
        } catch (error) {
          if (error?.status === 400) {
            return false;
          }

          throw error;
        }
      })();
      const nextStockStatus = resolveOrderStockStatus(
        request.body.stockStatus,
        hasAvailableStock,
        order.stockStatus || "",
      );
      const nextPaymentStatus = optionalString(
        request.body.paymentStatus || order.paymentStatus,
      );

      if (!orderStatuses.has(nextStatus)) {
        throw createValidationError("Le statut de commande est invalide.");
      }

      if (!paymentStatuses.has(nextPaymentStatus)) {
        throw createValidationError("Le statut de paiement est invalide.");
      }

      const paymentState = buildOrderPaymentState({
        paymentStatus: nextPaymentStatus,
        advancePaidMad: request.body.advancePaidMad,
        customerTotalMad: order.customerTotalMad ?? 0,
        fallbackAdvancePaidMad: order.advancePaidMad ?? 0,
        fallbackPaidAt: order.paidAt || null,
      });

      order.status = nextStatus;
      order.stockStatus = nextStockStatus;
      order.paymentStatus = paymentState.paymentStatus;
      order.advancePaidMad = paymentState.advancePaidMad;
      order.remainingToPayMad = paymentState.remainingToPayMad;
      order.paidAt = paymentState.paidAt;
      assertNonNegativeStocks(store);
      return store;
    });

    response.json({
      message: "Commande mise à jour.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.patch(
  "/api/orders/:orderId/payment-status",
  asyncRoute(async (request, response) => {
    const nextStore = await updateStore((store) => {
      const order = findRecord(store.orders, request.params.orderId, "Commande");
      const paymentStatus = optionalString(request.body.paymentStatus);

      if (!paymentStatuses.has(paymentStatus)) {
        throw createValidationError("Le statut de paiement est invalide.");
      }

      const paymentState = buildOrderPaymentState({
        paymentStatus,
        advancePaidMad: request.body.advancePaidMad,
        customerTotalMad: order.customerTotalMad ?? 0,
        fallbackAdvancePaidMad: order.advancePaidMad ?? 0,
        fallbackPaidAt: order.paidAt || null,
      });

      order.paymentStatus = paymentState.paymentStatus;
      order.advancePaidMad = paymentState.advancePaidMad;
      order.remainingToPayMad = paymentState.remainingToPayMad;
      order.paidAt = paymentState.paidAt;
      return store;
    });

    response.json({
      message: "Paiement mis à jour.",
      appState: buildPublicState(nextStore, request),
    });
  }),
);

app.get(
  "/api/orders/:orderId",
  asyncRoute(async (request, response) => {
    const store = await readStore();
    const state = buildPublicState(store, request);
    const productImageById = new Map(
      state.products.map((product) => [product.id, product.imageUrl || ""]),
    );
    const order = state.orders.find((entry) => entry.id === request.params.orderId);

    if (!order) {
      throw createNotFoundError("Commande introuvable.");
    }

    response.json({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        productImageUrl: productImageById.get(item.productId) || "",
      })),
    });
  }),
);

app.get(
  "/api/orders/:orderId/invoice",
  asyncRoute(async (request, response) => {
    const store = await readStore();
    const appState = buildPublicState(store, request);
    const order = appState.orders.find((entry) => entry.id === request.params.orderId);

    if (!order) {
      throw createNotFoundError("Commande introuvable.");
    }

    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.send(
      renderInvoiceHtml(order, appState.settings, {
        autoPrint: request.query.download === "1",
      }),
    );
  }),
);

app.get(
  ["/catalog", "/catalogue"],
  asyncRoute(async (request, response) => {
    await trackCatalogVisit(request, response);
    response.sendFile(path.join(__dirname, "public", "catalog.html"));
  }),
);

app.get("*", (_request, response) => {
  response.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((error, _request, response, _next) => {
  const status = error.status ?? 500;

  if (status >= 500) {
    console.error(error);
  }

  response.status(status).json({
    message:
      status >= 500
        ? "Erreur interne du serveur."
        : error.message || "Une erreur est survenue.",
  });
});

readStore()
  .then(() => {
    app.listen(port, () => {
      console.log(`App running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize store", error);
    process.exit(1);
  });
