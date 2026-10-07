// Outils partagés (navigateur + serveur) : catégories, classement automatique, lecture des prix.

export const CATEGORIES = [
  { name: "Cuisine", icon: "🍳", words: "poele casserole assiette verre tasse mug couvert couteau cuisine plat saladier bol cocotte friteuse mixeur bouilloire grille-pain bocal planche decouper passoire ustensile theiere cafetiere carafe torchon tablier moule cuillere fourchette gourde thermos faitout wok vaisselle service poelon egouttoir epluche rape ouvre-boite airfryer micro-ondes" },
  { name: "Meubles", icon: "🛋️", words: "meuble table chaise tabouret etagere commode armoire bureau canape fauteuil banc bibliotheque buffet coiffeuse porte-manteau desserte console lit sommier tiroir caisson pouf" },
  { name: "Déco", icon: "🕯️", words: "decoration deco bougie cadre vase miroir coussin plaid tableau guirlande lanterne photophore statue horloge pendule fleur plante artificielle tapis rideau couronne figurine sculpture bibelot mural parfum diffuseur" },
  { name: "Salle de bain", icon: "🛁", words: "bain douche savon distributeur brosse dents wc toilette peignoir gant toilette tapis-de-bain rideau-de-douche serviette-de-bain serviette-de-toilette serviette-eponge shampoing gel-douche porte-serviette" },
  { name: "Entretien", icon: "🧽", words: "nettoyant lessive eponge balai serpilliere seau menager desinfectant poubelle aspirateur detergent lingette javel desodorisant entretien vitre degraissant adoucissant" },
  { name: "Rangement", icon: "🧺", words: "rangement boite panier organisateur cintre crochet bac coffre malle range-chaussures etagere-de" },
  { name: "Textile & linge", icon: "🛏️", words: "drap housse couette oreiller linge parure taie nappe serviette-de-table couverture literie matelas" },
  { name: "Jardin & extérieur", icon: "🌿", words: "jardin plante pot arrosoir barbecue parasol terrasse exterieur graines terreau jardiniere camping pelle sécateur tondeuse" },
  { name: "Enfants & jouets", icon: "🧸", words: "jouet jeu puzzle peluche enfant bebe poupee lego cartable biberon" },
  { name: "Papeterie & loisirs", icon: "✏️", words: "stylo cahier papier loisir creatif peinture colle agrafeuse classeur feutre crayon carnet scrapbooking fourniture" },
  { name: "Bricolage", icon: "🔧", words: "perceuse tournevis outil marteau vis ampoule rallonge cable pile ruban cadenas bricolage cle scie visseuse" },
  { name: "Électro & high-tech", icon: "🔌", words: "ecouteur chargeur enceinte lampe ventilateur chauffage radio telephone usb batterie montre-connectee" },
  { name: "Alimentation", icon: "🥜", words: "noix snack chocolat biscuit boisson cafe the bonbon sauce pates epice aliment alimentation conserve jus sirop confiture miel cereale bonbons gateau chips amande cajou pecan raisin sucre farine huile sel riz" },
  { name: "Mode & accessoires", icon: "👜", words: "sac bijou montre lunette chaussette bonnet echarpe gant ceinture parapluie" },
];

export const DEFAULT_CATEGORY = "Autres";

const strip = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const KEYWORDS = CATEGORIES.map((category) => ({
  name: category.name,
  words: category.words.split(/\s+/).filter(Boolean).map((word) => strip(word.replace(/-/g, " "))),
}));

function scoreText(text) {
  const haystack = ` ${strip(text).replace(/[^a-z0-9]+/g, " ")} `;
  let best = { name: DEFAULT_CATEGORY, score: 0 };

  for (const { name, words } of KEYWORDS) {
    let score = 0;

    for (const word of words) {
      if (haystack.includes(` ${word} `) || haystack.includes(` ${word}s `) || haystack.includes(` ${word}x `)) {
        score += word.length >= 6 ? 3 : 2;
      } else if (word.length >= 5 && haystack.includes(word)) {
        score += 1;
      }
    }

    if (score > best.score) {
      best = { name, score };
    }
  }

  return best;
}

/** Devine la catégorie à partir du titre ; `hint` = rubrique de la page (titre de page, fil d'Ariane…). */
export function classifyTitle(title, hint = "") {
  const fromTitle = scoreText(title);

  // Un titre sans ambiguïté prime toujours sur la rubrique de la page.
  if (fromTitle.score >= 3) {
    return fromTitle.name;
  }

  const hintText = ` ${strip(hint).replace(/[^a-z0-9]+/g, " ")} `;

  for (const category of CATEGORIES) {
    if (hintText.includes(` ${strip(category.name)} `)) {
      return category.name;
    }
  }

  const fromHint = hint ? scoreText(hint) : { name: DEFAULT_CATEGORY, score: 0 };
  return fromTitle.score >= 2 || fromHint.score < 2 ? fromTitle.name : fromHint.name;
}

/** Titre lisible tiré d'une adresse de fiche produit : /p/2581329/cerneaux-de-noix-xl/ → « Cerneaux de noix xl ». */
export function titleFromUrl(rawUrl) {
  try {
    const parts = new URL(rawUrl).pathname.split("/").filter(Boolean);
    const slug = decodeURIComponent(parts.at(-1) || "").replace(/\.[a-z0-9]{2,5}$/i, "");
    const text = slug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
  } catch {
    return "";
  }
}

/** Extrait un prix en euros d'un texte : « 1,99 € », « €1.99 », « 12 € 99 »… */
export function parsePrice(text) {
  const raw = String(text ?? "").replace(/ /g, " ");
  const patterns = [
    /(\d{1,4})\s*€\s*(\d{2})\b/,
    /(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|\beur\b|\beuros?\b)/i,
    /(?:€|\beur\b)\s*(\d{1,4}(?:[.,]\d{1,2})?)/i,
  ];

  for (const [index, pattern] of patterns.entries()) {
    const match = raw.match(pattern);

    if (!match) {
      continue;
    }

    const value = index === 0 ? Number(`${match[1]}.${match[2]}`) : Number(match[1].replace(",", "."));

    if (Number.isFinite(value) && value > 0 && value < 10000) {
      return Math.round(value * 100) / 100;
    }
  }

  return null;
}

export function cleanTitle(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–•·*]+|[\s\-–•·*]+$/g, "")
    .slice(0, 140);
}
