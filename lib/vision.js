// Lecture d'une capture d'écran par une IA : repère les articles et renvoie titre, description, prix en €,
// catégorie et cadre de la photo (découpée ensuite dans le navigateur).
// Fournisseur : Google Gemini (offre gratuite, GEMINI_API_KEY) en priorité, sinon Claude (ANTHROPIC_API_KEY, payant).
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, DEFAULT_CATEGORY, classifyTitle, cleanTitle } from "../public/shared/classify.js";

const MAX_ITEMS = 40;
const CATEGORY_NAMES = [...CATEGORIES.map((category) => category.name), DEFAULT_CATEGORY];
const GEMINI_BASE = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
// Les noms de modèles gratuits changent souvent : on essaie l'alias « dernier Flash » puis des valeurs de repli.
const GEMINI_MODELS = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"].filter(Boolean);
const CLAUDE_MODEL = process.env.CLAUDE_VISION_MODEL || "claude-opus-5-5";

export class VisionError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

const SYSTEM = `Tu aides une petite entreprise à remplir un catalogue de produits à partir de captures d'écran (page de site marchand, liste d'articles, catalogue, prospectus).

Pour chaque ARTICLE à vendre visible en entier, renvoie :
- title : le nom du produit en français, tel qu'affiché, sans le prix ni la marque de la boutique.
- description : une précision courte (format, taille, couleurs, contenance), 80 caractères maximum, ou une chaîne vide.
- priceEur : le prix de vente en euros affiché pour cet article (nombre, ex. 2.99). 0 si aucun prix n'est lisible. Ne confonds pas avec un prix au kilo ou au litre.
- category : la catégorie la plus adaptée parmi la liste imposée.
- box : le rectangle qui entoure UNIQUEMENT la photo du produit, sous la forme [ymin, xmin, ymax, xmax], en millièmes de la hauteur et de la largeur de l'image (0 à 1000). Cadre serré autour du produit, sans texte autour.

Ignore les menus, bannières, publicités, filtres, boutons, logos et les articles coupés par le bord de l'image. S'il n'y a aucun article, renvoie une liste vide.`;

const USER_TEXT = "Voici la capture. Liste les articles et le cadre de leur photo.";

/** "gemini" | "claude" | null : sert à l'indicateur de /api/health (jamais la clé elle-même). */
export function visionProvider() {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "claude";
  return null;
}

export function visionConfigured() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || 0)));

/** Normalise un article renvoyé par l'IA ; `raw.box` = { x, y, width, height } en millièmes. */
function sanitize(raw) {
  const title = cleanTitle(raw?.title);

  if (title.length < 2) {
    return null;
  }

  const x = clamp(raw.box?.x, 0, 980);
  const y = clamp(raw.box?.y, 0, 980);
  const width = clamp(raw.box?.width, 20, 1000 - x);
  const height = clamp(raw.box?.height, 20, 1000 - y);
  const price = Math.round(Number(raw.priceEur) * 100) / 100;

  return {
    title,
    description: cleanTitle(raw.description).slice(0, 80),
    priceEur: Number.isFinite(price) && price > 0 && price < 10000 ? price : null,
    category: CATEGORY_NAMES.includes(raw.category) ? raw.category : classifyTitle(title),
    box: { x, y, width, height },
  };
}

// --- Google Gemini (gratuit) --------------------------------------------------------------------------
const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          description: { type: "STRING" },
          priceEur: { type: "NUMBER" },
          category: { type: "STRING", enum: CATEGORY_NAMES },
          box: { type: "ARRAY", items: { type: "INTEGER" } },
        },
        required: ["title", "description", "priceEur", "category", "box"],
      },
    },
  },
  required: ["items"],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(mediaType, data) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  let lastStatus = 0;

  for (const model of [...new Set(GEMINI_MODELS)]) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response;

      try {
        response = await fetch(`${GEMINI_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          signal: AbortSignal.timeout(60_000),
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: "user", parts: [{ inlineData: { mimeType: mediaType, data } }, { text: USER_TEXT }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: GEMINI_SCHEMA, temperature: 0.1 },
          }),
        });
      } catch {
        throw new VisionError("L'IA est momentanément injoignable, réessaie.", 502);
      }

      lastStatus = response.status;

      if (response.status === 429 || response.status === 503) {
        if (attempt === 0) {
          await sleep(4000);
          continue;
        }

        throw new VisionError(
          response.status === 429
            ? "Le quota gratuit de l'IA est atteint pour le moment (limite par minute ou par jour). Réessaie un peu plus tard."
            : "L'IA est très sollicitée, réessaie dans un instant.",
          429,
        );
      }

      if (response.status === 404) {
        break; // modèle inconnu : on passe au suivant
      }

      if (response.status === 401 || response.status === 403 || (response.status === 400 && /api key|API_KEY/i.test(await response.clone().text()))) {
        throw new VisionError("La clé de l'IA est refusée. Vérifie GEMINI_API_KEY sur le serveur.", 503);
      }

      if (!response.ok) {
        console.error("[vision] Gemini", response.status, (await response.text()).slice(0, 300));
        throw new VisionError("L'IA n'a pas accepté cette image, réessaie avec une autre capture.", 400);
      }

      const payload = await response.json();
      const candidate = payload.candidates?.[0];

      if (payload.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY") {
        throw new VisionError("L'IA a refusé d'analyser cette image.", 422);
      }

      const text = candidate?.content?.parts?.map((part) => part.text || "").join("");

      if (!text || candidate?.finishReason === "MAX_TOKENS") {
        throw new VisionError("La réponse de l'IA est incomplète, réessaie.", 502);
      }

      return parseItems(text, (item) => {
        const [ymin = 0, xmin = 0, ymax = 0, xmax = 0] = Array.isArray(item.box) ? item.box : [];
        return { ...item, box: { x: xmin, y: ymin, width: xmax - xmin, height: ymax - ymin } };
      });
    }
  }

  throw new VisionError(
    lastStatus === 404 ? "Aucun modèle d'IA gratuit n'est disponible avec cette clé. Précise GEMINI_MODEL sur le serveur." : "L'IA est indisponible, réessaie.",
    502,
  );
}

// --- Claude (payant, facultatif) ---------------------------------------------------------------------
const CLAUDE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          priceEur: { type: "number" },
          category: { type: "string", enum: CATEGORY_NAMES },
          photoX: { type: "integer" },
          photoY: { type: "integer" },
          photoWidth: { type: "integer" },
          photoHeight: { type: "integer" },
        },
        required: ["title", "description", "priceEur", "category", "photoX", "photoY", "photoWidth", "photoHeight"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

async function callClaude(mediaType, data) {
  const client = new Anthropic({ timeout: 90_000, maxRetries: 1 });
  let response;

  try {
    response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: SYSTEM.replace(
        "- box : le rectangle qui entoure UNIQUEMENT la photo du produit, sous la forme [ymin, xmin, ymax, xmax], en millièmes de la hauteur et de la largeur de l'image (0 à 1000). Cadre serré autour du produit, sans texte autour.",
        "- photoX, photoY, photoWidth, photoHeight : le rectangle qui entoure UNIQUEMENT la photo du produit, en millièmes de la largeur et de la hauteur de l'image (0 à 1000), coin haut-gauche + largeur + hauteur. Cadre serré, sans texte autour.",
      ),
      output_config: { effort: "low", format: { type: "json_schema", schema: CLAUDE_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: USER_TEXT },
          ],
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new VisionError("La clé de l'IA est refusée. Vérifie ANTHROPIC_API_KEY sur le serveur.", 503);
    }

    if (error instanceof Anthropic.RateLimitError) {
      throw new VisionError("L'IA est très sollicitée, réessaie dans quelques secondes.", 429);
    }

    if (error instanceof Anthropic.BadRequestError) {
      console.error("[vision] Claude : requête refusée", error.message);
      throw new VisionError("L'IA n'a pas accepté cette image, réessaie avec une autre capture.", 400);
    }

    console.error("[vision] Claude : appel impossible", error);
    throw new VisionError("L'IA est momentanément indisponible, réessaie.", 502);
  }

  if (response.stop_reason === "refusal") {
    throw new VisionError("L'IA a refusé d'analyser cette image.", 422);
  }

  const text = response.content.find((block) => block.type === "text")?.text;

  if (!text || response.stop_reason === "max_tokens") {
    throw new VisionError("La réponse de l'IA est incomplète, réessaie.", 502);
  }

  return parseItems(text, (item) => ({
    ...item,
    box: { x: item.photoX, y: item.photoY, width: item.photoWidth, height: item.photoHeight },
  }));
}

function parseItems(text, toBox) {
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new VisionError("La réponse de l'IA est illisible, réessaie.", 502);
  }

  return (Array.isArray(parsed.items) ? parsed.items : [])
    .map((item) => sanitize(toBox(item)))
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
}

export async function extractArticlesFromImage(dataUrl) {
  if (!visionConfigured()) {
    throw new VisionError("L'analyse par IA n'est pas encore activée (clé manquante sur le serveur).", 503);
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));

  if (!match) {
    throw new VisionError("Image invalide (JPEG, PNG ou WebP).", 400);
  }

  if (match[2].length > 5_500_000) {
    throw new VisionError("Image trop lourde pour l'analyse.", 413);
  }

  const useGemini = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  return useGemini ? callGemini(match[1], match[2]) : callClaude(match[1], match[2]);
}
