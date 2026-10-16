// Lecture d'une capture d'écran par Claude : repère les articles et renvoie titre, description, prix en €,
// catégorie et cadre de la photo (pour la découper dans le navigateur).
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, DEFAULT_CATEGORY, classifyTitle, cleanTitle } from "../public/shared/classify.js";

const MODEL = process.env.CLAUDE_VISION_MODEL || "claude-opus-5-5";
const MAX_ITEMS = 40;
const CATEGORY_NAMES = [...CATEGORIES.map((category) => category.name), DEFAULT_CATEGORY];

export class VisionError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

const SCHEMA = {
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

const SYSTEM = `Tu aides une petite entreprise à remplir un catalogue de produits à partir de captures d'écran (page de site marchand, liste d'articles, catalogue, prospectus).

Pour chaque ARTICLE à vendre visible en entier, renvoie :
- title : le nom du produit en français, tel qu'affiché, sans le prix ni la marque de la boutique.
- description : une précision courte (format, taille, couleurs, contenance), 80 caractères maximum, ou une chaîne vide.
- priceEur : le prix de vente en euros affiché pour cet article (nombre, ex. 2.99). 0 si aucun prix n'est lisible. Ne confonds pas avec un prix au kilo ou au litre.
- category : la catégorie la plus adaptée parmi la liste imposée.
- photoX, photoY, photoWidth, photoHeight : le rectangle qui entoure UNIQUEMENT la photo du produit, en millièmes de la largeur et de la hauteur de l'image (0 à 1000), coin haut-gauche + largeur + hauteur. Cadre serré autour du produit, sans texte autour.

Ignore les menus, bannières, publicités, filtres, boutons, logos et les articles coupés par le bord de l'image. S'il n'y a aucun article, renvoie une liste vide.`;

export function visionConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || 0)));

function sanitize(raw) {
  const title = cleanTitle(raw?.title);

  if (title.length < 2) {
    return null;
  }

  const x = clamp(raw.photoX, 0, 980);
  const y = clamp(raw.photoY, 0, 980);
  const width = clamp(raw.photoWidth, 20, 1000 - x);
  const height = clamp(raw.photoHeight, 20, 1000 - y);
  const price = Math.round(Number(raw.priceEur) * 100) / 100;

  return {
    title,
    description: cleanTitle(raw.description).slice(0, 80),
    priceEur: Number.isFinite(price) && price > 0 && price < 10000 ? price : null,
    category: CATEGORY_NAMES.includes(raw.category) ? raw.category : classifyTitle(title),
    box: { x, y, width, height },
  };
}

export async function extractArticlesFromImage(dataUrl) {
  if (!visionConfigured()) {
    throw new VisionError("L'analyse par IA n'est pas encore activée (clé ANTHROPIC_API_KEY absente sur le serveur).", 503);
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));

  if (!match) {
    throw new VisionError("Image invalide (JPEG, PNG ou WebP).", 400);
  }

  if (match[2].length > 5_500_000) {
    throw new VisionError("Image trop lourde pour l'analyse.", 413);
  }

  const client = new Anthropic({ timeout: 90_000, maxRetries: 1 });

  let response;

  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } },
            { type: "text", text: "Voici la capture. Liste les articles et le cadre de leur photo." },
          ],
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new VisionError("La clé API de l'IA est refusée. Vérifie ANTHROPIC_API_KEY.", 503);
    }

    if (error instanceof Anthropic.RateLimitError) {
      throw new VisionError("L'IA est très sollicitée, réessaie dans quelques secondes.", 429);
    }

    if (error instanceof Anthropic.BadRequestError) {
      console.error("[vision] requête refusée", error.message);
      throw new VisionError(`L'IA n'a pas accepté cette image (${String(error.message).slice(0, 120)}).`, 400);
    }

    console.error("[vision] appel impossible", error);
    throw new VisionError("L'IA est momentanément indisponible, réessaie.", 502);
  }

  if (response.stop_reason === "refusal") {
    throw new VisionError("L'IA a refusé d'analyser cette image.", 422);
  }

  const text = response.content.find((block) => block.type === "text")?.text;

  if (!text || response.stop_reason === "max_tokens") {
    throw new VisionError("La réponse de l'IA est incomplète, réessaie avec une capture plus petite.", 502);
  }

  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new VisionError("La réponse de l'IA est illisible, réessaie.", 502);
  }

  return (Array.isArray(parsed.items) ? parsed.items : [])
    .map(sanitize)
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
}
