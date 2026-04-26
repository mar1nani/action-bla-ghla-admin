import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDirectory = path.join(__dirname, "..", "data");
const storeFilePath = path.join(dataDirectory, "store.json");
const uploadsDirectory = path.join(__dirname, "..", "public", "uploads");
const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const localFallbackAllowed = process.env.ALLOW_LOCAL_STORE_FALLBACK !== "false";
const localWriteFallbackAllowed = process.env.ALLOW_LOCAL_STORE_WRITE_FALLBACK === "true";
const databaseRetryCooldownMs = Number(process.env.DATABASE_RETRY_COOLDOWN_MS || 30_000);
const STORE_ROW_ID = 1;

let writeQueue = Promise.resolve();
let databasePool = null;
let databaseReadyPromise = null;
let activeStoreMode = databaseUrl ? "database" : "local";
let databaseFallbackReason = "";
let nextDatabaseRetryAt = 0;

function defaultStore() {
  return {
    settings: {
      companyName: "Action BLA Ghla",
      transportRatePerKgEur: 1.5,
      eurToMad: 10.8,
      lowStockDefault: 2,
    },
    analytics: {
      catalogVisitorsById: {},
      catalogDaily: [],
    },
    users: [],
    products: [],
    wishlist: [],
    purchases: [],
    shipments: [],
    orders: [],
  };
}

function normalizeStore(store) {
  const base = defaultStore();

  return {
    settings: {
      ...base.settings,
      ...(store?.settings ?? {}),
    },
    analytics: {
      ...base.analytics,
      ...(store?.analytics ?? {}),
      catalogVisitorsById:
        store?.analytics && typeof store.analytics.catalogVisitorsById === "object"
          ? store.analytics.catalogVisitorsById
          : {},
      catalogDaily: Array.isArray(store?.analytics?.catalogDaily)
        ? store.analytics.catalogDaily
        : [],
    },
    users: Array.isArray(store?.users) ? store.users : [],
    products: Array.isArray(store?.products) ? store.products : [],
    wishlist: Array.isArray(store?.wishlist) ? store.wishlist : [],
    purchases: Array.isArray(store?.purchases) ? store.purchases : [],
    shipments: Array.isArray(store?.shipments) ? store.shipments : [],
    orders: Array.isArray(store?.orders) ? store.orders : [],
  };
}

function isLocalDatabaseHost(connectionString) {
  try {
    const { hostname } = new URL(connectionString);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  return (
    {
      ".webp": "image/webp",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".svg": "image/svg+xml",
    }[extension] || "application/octet-stream"
  );
}

function getDatabasePool() {
  if (!databaseUrl) {
    return null;
  }

  if (!databasePool) {
    databasePool = new Pool({
      connectionString: databaseUrl,
      ssl: isLocalDatabaseHost(databaseUrl) ? false : { rejectUnauthorized: false },
      enableChannelBinding: true,
    });
  }

  return databasePool;
}

export function isDatabaseStoreEnabled() {
  return activeStoreMode === "database";
}

export function getStoreStatus() {
  return {
    configuredDatabase: Boolean(databaseUrl),
    mode: activeStoreMode,
    localFallbackAllowed,
    localWriteFallbackAllowed,
    fallbackReason: databaseFallbackReason || null,
  };
}

async function activateLocalFallback(error) {
  if (!databaseUrl || !localFallbackAllowed) {
    throw error;
  }

  if (activeStoreMode !== "local-fallback") {
    databaseFallbackReason = error?.message || "Database store unavailable.";
    console.warn(
      `[store] Database unavailable, switching to local JSON fallback: ${databaseFallbackReason}`,
    );
  }

  activeStoreMode = "local-fallback";
  databaseReadyPromise = null;
  nextDatabaseRetryAt = Date.now() + Math.max(1_000, databaseRetryCooldownMs);

  if (databasePool) {
    const pool = databasePool;
    databasePool = null;
    await pool.end().catch(() => undefined);
  }
}

function shouldRetryDatabase() {
  return (
    Boolean(databaseUrl) &&
    activeStoreMode === "local-fallback" &&
    Date.now() >= nextDatabaseRetryAt
  );
}

function reenableDatabaseMode() {
  activeStoreMode = "database";
  databaseFallbackReason = "";
}

function createDatabaseUnavailableError() {
  const error = new Error(
    "La base principale est temporairement indisponible. Réessaie dans quelques instants.",
  );
  error.status = 503;
  return error;
}

async function ensureLocalStoreFile() {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    await fs.access(storeFilePath);
  } catch {
    await fs.writeFile(storeFilePath, JSON.stringify(defaultStore(), null, 2));
  }
}

async function writeLocalStore(store) {
  const normalized = normalizeStore(store);
  await ensureLocalStoreFile();
  await fs.writeFile(storeFilePath, JSON.stringify(normalized, null, 2));
  return normalized;
}

async function readLocalStore() {
  await ensureLocalStoreFile();
  const raw = await fs.readFile(storeFilePath, "utf8");
  return normalizeStore(JSON.parse(raw));
}

async function uploadFileToDataUrl(relativeUrl) {
  if (!relativeUrl || !relativeUrl.startsWith("/uploads/")) {
    return relativeUrl || "";
  }

  const fileName = path.basename(relativeUrl);
  const filePath = path.join(uploadsDirectory, fileName);

  try {
    const buffer = await fs.readFile(filePath);
    return `data:${getMimeType(filePath)};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
}

async function embedLocalUploads(store) {
  const nextStore = structuredClone(normalizeStore(store));

  for (const product of nextStore.products) {
    product.imageUrl = await uploadFileToDataUrl(product.imageUrl);
  }

  for (const purchase of nextStore.purchases) {
    purchase.invoiceImageUrl = await uploadFileToDataUrl(purchase.invoiceImageUrl);
  }

  return nextStore;
}

async function buildDatabaseSeedStore() {
  try {
    const localStore = await readLocalStore();
    return embedLocalUploads(localStore);
  } catch {
    return defaultStore();
  }
}

async function ensureDatabaseStore() {
  if (!isDatabaseStoreEnabled()) {
    return;
  }

  if (!databaseReadyPromise) {
    databaseReadyPromise = (async () => {
      const pool = getDatabasePool();
      const seedStore = normalizeStore(await buildDatabaseSeedStore());

      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_store (
          id INTEGER PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(
        `
          INSERT INTO app_store (id, data)
          VALUES ($1, $2::jsonb)
          ON CONFLICT (id) DO NOTHING
        `,
        [STORE_ROW_ID, JSON.stringify(seedStore)],
      );
    })();

    databaseReadyPromise = databaseReadyPromise.catch((error) => {
      databaseReadyPromise = null;
      throw error;
    });
  }

  await databaseReadyPromise;
}

async function readDatabaseStore() {
  await ensureDatabaseStore();

  const pool = getDatabasePool();
  const { rows } = await pool.query("SELECT data FROM app_store WHERE id = $1", [STORE_ROW_ID]);
  return normalizeStore(rows[0]?.data ?? defaultStore());
}

async function updateDatabaseStore(updater) {
  await ensureDatabaseStore();

  const pool = getDatabasePool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query("SELECT data FROM app_store WHERE id = $1 FOR UPDATE", [
      STORE_ROW_ID,
    ]);

    const currentStore = normalizeStore(rows[0]?.data ?? defaultStore());
    const draft = structuredClone(currentStore);
    const updatedStore = (await updater(draft)) ?? draft;
    const normalized = normalizeStore(updatedStore);

    await client.query(
      `
        INSERT INTO app_store (id, data, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `,
      [STORE_ROW_ID, JSON.stringify(normalized)],
    );

    await client.query("COMMIT");
    return normalized;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function readStore() {
  if (shouldRetryDatabase()) {
    reenableDatabaseMode();
  }

  if (databaseUrl && activeStoreMode === "database") {
    try {
      return await readDatabaseStore();
    } catch (error) {
      await activateLocalFallback(error);
    }
  }

  return readLocalStore();
}

export async function updateStore(updater) {
  if (shouldRetryDatabase()) {
    reenableDatabaseMode();
  }

  if (databaseUrl && activeStoreMode === "database") {
    try {
      return await updateDatabaseStore(updater);
    } catch (error) {
      if (error?.status) {
        throw error;
      }

      if (localFallbackAllowed && localWriteFallbackAllowed) {
        await activateLocalFallback(error);
      } else {
        console.error("[store] Database write failed, keeping primary mode only.", error);
        nextDatabaseRetryAt = Date.now() + Math.max(1_000, databaseRetryCooldownMs);
        throw createDatabaseUnavailableError();
      }
    }
  }

  if (databaseUrl && activeStoreMode === "local-fallback" && !localWriteFallbackAllowed) {
    throw createDatabaseUnavailableError();
  }

  const operation = writeQueue.then(async () => {
    const currentStore = await readLocalStore();
    const draft = structuredClone(currentStore);
    const updatedStore = (await updater(draft)) ?? draft;
    return writeLocalStore(updatedStore);
  });

  writeQueue = operation.catch(() => undefined);
  return operation;
}

export function createId(prefix) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}
