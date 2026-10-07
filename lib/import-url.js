// Import d'articles depuis une page web (fiche produit ou liste) : JSON-LD, OpenGraph, puis cartes détectées.
import dns from "node:dns/promises";
import net from "node:net";
import * as cheerio from "cheerio";
import sharp from "sharp";
import { classifyTitle, cleanTitle, parsePrice } from "../public/shared/classify.js";
import { saveImageBuffer } from "./store.js";

const USER_AGENT =
  "Mozilla/5.0 (compatible; ActionBlaGhlaCatalogImport/1.0; usage interne, une page à la fois)";
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_ITEMS = 120;
const FETCH_TIMEOUT_MS = 12_000;

export class ImportError extends Error {
  constructor(message, { status = 400, blocked = false } = {}) {
    super(message);
    this.status = status;
    this.blocked = blocked;
  }
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }

  const value = address.toLowerCase();
  return (
    value === "::1" ||
    value === "::" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe80") ||
    value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.")
  );
}

async function assertPublicUrl(rawUrl) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new ImportError("Ce lien n'est pas valide.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ImportError("Seuls les liens http(s) sont acceptés.");
  }

  const records = net.isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await dns.lookup(url.hostname, { all: true }).catch(() => []);

  if (!records.length) {
    throw new ImportError("Impossible de trouver ce site.");
  }

  if (records.some((record) => isPrivateAddress(record.address))) {
    throw new ImportError("Ce lien n'est pas autorisé.");
  }

  return url;
}

async function safeFetch(rawUrl, { maxBytes, accept }) {
  let currentUrl = rawUrl;

  for (let hop = 0; hop < 4; hop += 1) {
    const url = await assertPublicUrl(currentUrl);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": USER_AGENT,
        accept,
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.6",
      },
    }).catch((error) => {
      throw new ImportError(
        error?.name === "TimeoutError" ? "Le site met trop de temps à répondre." : "Impossible de joindre ce site.",
      );
    });

    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get("location")) {
      currentUrl = new URL(response.headers.get("location"), url).toString();
      continue;
    }

    const chunks = [];
    let size = 0;

    try {
      if (response.body) {
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > maxBytes) {
            throw new ImportError("Fichier trop volumineux.");
          }
          chunks.push(chunk);
        }
      }
    } catch (error) {
      if (error instanceof ImportError) throw error;
      throw new ImportError("La lecture de la page a été interrompue (le site est trop lent ou a coupé la connexion).");
    }

    return { response, body: Buffer.concat(chunks), finalUrl: url.toString() };
  }

  throw new ImportError("Trop de redirections.");
}

const robotsCache = new Map();

async function loadRobotsRules(origin) {
  const cached = robotsCache.get(origin);

  if (cached && cached.expires > Date.now()) {
    return cached.rules;
  }

  let rules = [];

  try {
    const response = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(6000),
      headers: { "user-agent": USER_AGENT },
    });

    if (response.ok) {
      let applies = false;

      for (const line of (await response.text()).split(/\r?\n/)) {
        const [rawKey, ...rest] = line.split("#")[0].split(":");
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(":").trim();

        if (key === "user-agent") {
          applies = value === "*";
        } else if (key === "disallow" && applies && value) {
          rules.push(value);
        }
      }
    }
  } catch {
    rules = [];
  }

  robotsCache.set(origin, { rules, expires: Date.now() + 60 * 60 * 1000 });
  return rules;
}

export function isDisallowed(rules, target) {
  return rules.some((rule) => {
    const anchored = rule.endsWith("$");
    const source = (anchored ? rule.slice(0, -1) : rule)
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${source}${anchored ? "$" : ""}`).test(target);
  });
}

async function assertAllowedByRobots(url) {
  const rules = await loadRobotsRules(url.origin);

  if (isDisallowed(rules, `${url.pathname}${url.search}`)) {
    throw new ImportError(
      "Ce site demande aux robots de ne pas lire cette adresse (robots.txt). Choisis une autre page (catégorie ou liste) ou utilise un PDF.",
      { status: 422 },
    );
  }
}

function looksBlocked(response, text) {
  const challenged =
    response.headers.get("cf-mitigated") === "challenge" ||
    /just a moment|enable javascript and cookies|attention required|captcha|access denied|verify you are human/i.test(
      text.slice(0, 4000),
    );
  return [401, 403, 429, 503].includes(response.status) && challenged ? true : challenged && text.length < 20_000;
}

const toArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

function firstImage(value) {
  for (const entry of toArray(value)) {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const candidate = entry.url || entry.contentUrl || entry["@id"];
      if (typeof candidate === "string") return candidate;
    }
  }
  return "";
}

function offerPrice(offers) {
  for (const offer of toArray(offers)) {
    const nested = offer?.offers ? offerPrice(offer.offers) : null;
    if (nested?.price) return nested;
    const raw = offer?.price ?? offer?.lowPrice ?? offer?.priceSpecification?.price;
    const price = Number(String(raw ?? "").replace(",", "."));
    if (Number.isFinite(price) && price > 0) {
      return { price, currency: String(offer.priceCurrency || offer?.priceSpecification?.priceCurrency || "EUR").toUpperCase() };
    }
  }
  return null;
}

function flattenJsonLd(value, bucket = []) {
  for (const node of toArray(value)) {
    if (!node || typeof node !== "object") continue;
    bucket.push(node);
    flattenJsonLd(node["@graph"], bucket);
    flattenJsonLd(node.itemListElement, bucket);
    flattenJsonLd(node.item, bucket);
    flattenJsonLd(node.mainEntity, bucket);
  }
  return bucket;
}

function typeOf(node) {
  return toArray(node["@type"]).map((entry) => String(entry).toLowerCase());
}

function fromJsonLd($, baseUrl) {
  const nodes = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      flattenJsonLd(JSON.parse($(element).contents().text()), nodes);
    } catch {
      /* JSON-LD invalide : ignoré */
    }
  });

  const items = [];

  // Fil d'Ariane (« Boissons & Alimentation › Noix et snacks ») : sert à deviner la catégorie.
  const breadcrumb = nodes
    .filter((node) => typeOf(node).includes("breadcrumblist"))
    .flatMap((node) => toArray(node.itemListElement))
    .map((entry) => cleanTitle(entry?.item?.name || entry?.name || ""))
    .filter(Boolean)
    .join(" ");

  for (const node of nodes) {
    if (!typeOf(node).includes("product")) continue;
    const title = cleanTitle(node.name);
    const image = firstImage(node.image);

    if (!title || !image) continue;

    const offer = offerPrice(node.offers);
    const firstSentence = cleanTitle(String(node.description || "").split(/\.\s/)[0]).replace(/\.$/, "");
    items.push({
      title,
      description: firstSentence.length <= 80 ? firstSentence : "",
      imageUrl: new URL(image, baseUrl).toString(),
      priceEur: offer && offer.currency === "EUR" ? offer.price : null,
      otherCurrency: offer && offer.currency !== "EUR" ? `${offer.price} ${offer.currency}` : "",
      sourceUrl: node.url ? new URL(node.url, baseUrl).toString() : baseUrl,
      categoryHint: [typeof node.category === "string" ? node.category : "", breadcrumb].filter(Boolean).join(" "),
    });
  }

  return items;
}

function fromOpenGraph($, baseUrl) {
  const meta = (name) => $(`meta[property="${name}"], meta[name="${name}"]`).attr("content") || "";
  const title = cleanTitle(meta("og:title") || $("h1").first().text() || $("title").text());
  const image = meta("og:image") || meta("twitter:image");

  if (!title || !image) return [];

  const priceRaw = meta("product:price:amount") || meta("og:price:amount");
  const currency = (meta("product:price:currency") || meta("og:price:currency") || "EUR").toUpperCase();
  const price = Number(String(priceRaw).replace(",", "."));

  return [
    {
      title,
      imageUrl: new URL(image, baseUrl).toString(),
      priceEur: Number.isFinite(price) && price > 0 && currency === "EUR" ? price : parsePrice($("body").text().slice(0, 6000)),
      otherCurrency: "",
      sourceUrl: baseUrl,
      categoryHint: "",
    },
  ];
}

function bestImageUrl($, img, baseUrl) {
  const srcset = img.attr("srcset") || img.attr("data-srcset") || "";
  const fromSet = srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/))
    .filter(([url]) => url)
    .sort((left, right) => parseInt(right[1] || "0", 10) - parseInt(left[1] || "0", 10))[0]?.[0];
  const candidate =
    fromSet || img.attr("data-src") || img.attr("data-lazy-src") || img.attr("data-original") || img.attr("src") || "";

  if (!candidate || candidate.startsWith("data:")) return "";

  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return "";
  }
}

function spacedText($, node) {
  const html = $.html(node).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  return cheerio.load(`<p>${html}</p>`)("p").text().replace(/\s+/g, " ").trim();
}

function pickImage(img, baseUrl, targetWidth = 1000) {
  const entries = (img.attr("srcset") || img.attr("data-srcset") || "")
    .split(",")
    .map((part) => part.trim().split(/\s+/))
    .filter(([url]) => url)
    .map(([url, width]) => ({ url, width: parseInt(width || "0", 10) }))
    .sort((left, right) => left.width - right.width);
  const chosen = entries.find((entry) => entry.width >= targetWidth) || entries.at(-1);
  const candidate =
    chosen?.url || img.attr("data-src") || img.attr("data-lazy-src") || img.attr("data-original") || img.attr("src") || "";

  if (!candidate || candidate.startsWith("data:")) return "";

  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return "";
  }
}

/** Cartes produit balisées (data-testid, itemprop) : titre, description, prix et photo fiables. */
function fromMarkedCards($, baseUrl) {
  const cards = $('[data-testid="product-card"], [itemtype*="schema.org/Product"]');

  if (cards.length < 1) return [];

  const items = [];
  const seen = new Set();

  cards.each((_, element) => {
    const node = $(element);
    const pick = (selector) => spacedText($, node.find(selector).first());
    const title = cleanTitle(pick('[data-testid*="title" i], [itemprop="name"]'));
    const image = pickImage(node.find("img").first(), baseUrl);
    const priceBlock = node.find('[data-testid*="price" i], [itemprop="price"], [class*="price" i]');
    const price = parsePrice(priceBlock.length ? spacedText($, priceBlock) : spacedText($, node));
    const description = cleanTitle(pick('[data-testid*="description" i]:not([data-testid*="price" i])'));
    const link = node.find("a[href]").first().attr("href") || node.closest("a[href]").attr("href");

    if (!title || !image || seen.has(`${title}|${image}`)) return;

    seen.add(`${title}|${image}`);
    items.push({
      title,
      description: description.slice(0, 160),
      imageUrl: image,
      priceEur: price,
      otherCurrency: "",
      sourceUrl: link ? new URL(link, baseUrl).toString() : baseUrl,
      categoryHint: "",
    });
  });

  return items;
}

function fromCards($, baseUrl) {
  const groups = new Map();

  $("li, article, div, section").each((_, element) => {
    const node = $(element);
    const images = node.find("img");

    if (images.length < 1 || images.length > 3 || node.find("li, article").length > 2) return;

    const text = spacedText($, node);

    if (text.length < 4 || text.length > 400 || parsePrice(text) == null) return;

    const signature = `${element.tagName}.${(node.attr("class") || "").split(/\s+/).sort().join(".")}`;
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(element);
  });

  const best = [...groups.values()].sort((left, right) => right.length - left.length)[0];

  if (!best || best.length < 3) return [];

  const seen = new Set();
  const items = [];

  for (const element of best) {
    const node = $(element);
    const image = bestImageUrl($, node.find("img").first(), baseUrl);
    const heading = node.find("h1, h2, h3, h4, h5, [class*=title], [class*=name], a[title]").first();
    const title = cleanTitle(
      heading.attr("title") || heading.text() || node.find("img").first().attr("alt") || node.find("a").first().text(),
    );
    const link = node.find("a[href]").first().attr("href");

    if (!image || !title || seen.has(`${title}|${image}`)) continue;

    seen.add(`${title}|${image}`);
    items.push({
      title,
      imageUrl: image,
      priceEur: parsePrice(spacedText($, node)),
      otherCurrency: "",
      sourceUrl: link ? new URL(link, baseUrl).toString() : baseUrl,
      categoryHint: "",
    });
  }

  return items;
}

export function extractItemsFromHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  const pageHeading = cleanTitle($("h1").first().text());

  let items = fromJsonLd($, baseUrl);
  let method = "données structurées";

  if (items.length < 2) {
    const marked = fromMarkedCards($, baseUrl);
    if (marked.length > items.length) {
      items = marked;
      method = "cartes produit";
    }
  }

  if (items.length < 2) {
    const cards = fromCards($, baseUrl);
    if (cards.length > items.length) {
      items = cards;
      method = "cartes détectées";
    }
  }

  if (!items.length) {
    items = fromOpenGraph($, baseUrl);
    method = "fiche produit";
  }

  const unique = new Map();

  for (const item of items) {
    unique.set(`${item.title}|${item.imageUrl}`, item);
  }

  let pageCount = 1;
  $('a[href*="page="]').each((_, element) => {
    const match = /[?&]page=(\d{1,3})/.exec($(element).attr("href") || "");
    if (match) pageCount = Math.max(pageCount, Number(match[1]));
  });

  return {
    method,
    pageHeading,
    pageCount,
    items: [...unique.values()].slice(0, MAX_ITEMS).map((item) => ({
      ...item,
      category: classifyTitle(item.title, item.categoryHint || pageHeading),
    })),
  };
}

async function mapLimit(values, limit, task) {
  const results = new Array(values.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await task(values[index], index).catch(() => null);
      }
    }),
  );

  return results;
}

export async function downloadAndStoreImage(imageUrl) {
  const { response, body } = await safeFetch(imageUrl, { maxBytes: MAX_IMAGE_BYTES, accept: "image/*" });

  if (!response.ok || !body.length) {
    return null;
  }

  const webp = await sharp(body, { failOn: "none" })
    .rotate()
    .resize({ width: 900, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 74 })
    .toBuffer();

  return saveImageBuffer(webp, "image/webp");
}

export async function storeUploadedImage(dataUrl) {
  const match = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));

  if (!match) {
    throw new ImportError("Image invalide (WebP, JPEG ou PNG).");
  }

  const input = Buffer.from(match[2], "base64");

  if (input.length > 8 * 1024 * 1024) {
    throw new ImportError("Image trop volumineuse.");
  }

  const webp = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: 900, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 74 })
    .toBuffer();

  return saveImageBuffer(webp, "image/webp");
}

/** Importe une page (par lien ou depuis le code collé) et télécharge les photos. */
export async function importFromPage({ url, html, baseUrl, page = 1 }) {
  let pageHtml = html;
  let pageUrl = baseUrl || url || "";

  if (!pageHtml) {
    const target = await assertPublicUrl(url);

    if (page > 1) {
      target.searchParams.set("page", String(page));
    }

    await assertAllowedByRobots(target);

    const { response, body, finalUrl } = await safeFetch(target.toString(), {
      maxBytes: MAX_HTML_BYTES,
      accept: "text/html,application/xhtml+xml",
    });
    pageHtml = body.toString("utf8");
    pageUrl = finalUrl;

    if (looksBlocked(response, pageHtml)) {
      throw new ImportError(
        "Ce site bloque la lecture automatique (protection anti-robots). Utilise « Coller le code de la page » ou un PDF.",
        { status: 422, blocked: true },
      );
    }

    if (!response.ok) {
      throw new ImportError(`Le site a répondu avec une erreur (${response.status}).`, { status: 422 });
    }
  }

  if (!pageUrl && pageHtml) {
    // Adresse facultative : on la lit dans la page elle-même (lien canonique ou og:url).
    const $head = cheerio.load(pageHtml);
    pageUrl = $head('link[rel="canonical"]').attr("href") || $head('meta[property="og:url"]').attr("content") || "";
  }

  if (!/^https?:\/\//i.test(pageUrl)) {
    throw new ImportError("Impossible de retrouver l'adresse de la page : indique-la dans le champ prévu.");
  }

  const { method, pageHeading, pageCount, items } = extractItemsFromHtml(pageHtml, pageUrl);

  if (!items.length) {
    throw new ImportError("Aucun article reconnu sur cette page. Essaie une page de liste ou une fiche produit.", {
      status: 422,
    });
  }

  // Les photos sont téléchargées ensuite, par petits lots (voir fetchAndStoreImages) :
  // une page de 24 articles ne doit pas dépendre de 24 téléchargements dans une seule requête.
  return {
    method,
    pageHeading,
    page,
    pageCount,
    sourceLabel: new URL(pageUrl).hostname.replace(/^www\./, ""),
    items: items.map((item) => ({ ...item, imageId: "" })),
  };
}

/** Télécharge et stocke une liste de photos (8 max, ~20 s max au total). Renvoie un identifiant (ou null) par adresse. */
export async function fetchAndStoreImages(urls) {
  const list = urls.slice(0, 8).map(String);
  const deadline = Date.now() + 20_000;

  const stored = await mapLimit(list, 8, async (url) => {
    if (Date.now() > deadline) return null;
    return Promise.race([
      downloadAndStoreImage(url),
      new Promise((resolve) => setTimeout(() => resolve(null), Math.max(1000, deadline - Date.now()))),
    ]);
  });

  return list.map((url, index) => ({ url, imageId: stored[index] || null }));
}
