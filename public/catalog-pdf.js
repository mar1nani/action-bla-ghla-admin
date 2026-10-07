// Lecture d'un catalogue PDF dans le navigateur (pdf.js) : détecte photos, titres et prix, page par page.
import { classifyTitle, cleanTitle, parsePrice } from "/shared/classify.js";

const PDFJS_VERSION = "4.4.168";
const CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/`;
let pdfjsPromise;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import(/* @vite-ignore */ `${CDN}pdf.min.mjs`);
      // Le worker vient d'un autre domaine : on le charge via un blob pour contourner la règle « même origine ».
      const code = await (await fetch(`${CDN}pdf.worker.min.mjs`)).text();
      lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
      return lib;
    })();
  }
  return pdfjsPromise;
}

const multiply = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

function boxOf(matrix) {
  const xs = [];
  const ys = [];

  for (const [x, y] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    xs.push(matrix[0] * x + matrix[2] * y + matrix[4]);
    ys.push(matrix[1] * x + matrix[3] * y + matrix[5]);
  }

  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, right: Math.max(...xs), bottom: Math.max(...ys), width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

function collectImages(pdfjs, operatorList, viewport) {
  const { OPS } = pdfjs;
  const imageOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintJpegXObject].filter((op) => op !== undefined));
  let matrix = viewport.transform.slice();
  const stack = [];
  const images = [];

  operatorList.fnArray.forEach((fn, index) => {
    const args = operatorList.argsArray[index];

    if (fn === OPS.save) stack.push(matrix.slice());
    else if (fn === OPS.restore) matrix = stack.pop() ?? matrix;
    else if (fn === OPS.transform) matrix = multiply(matrix, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(matrix.slice());
      if (Array.isArray(args?.[0])) matrix = multiply(matrix, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) matrix = stack.pop() ?? matrix;
    else if (imageOps.has(fn)) {
      images.push({ name: typeof args?.[0] === "string" ? args[0] : `inline-${index}`, box: boxOf(matrix) });
    }
  });

  return images;
}

function groupLines(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];

  for (const item of sorted) {
    const line = lines.find((entry) => Math.abs(entry.y - item.y) < Math.max(3, item.size * 0.6));
    if (line) line.items.push(item);
    else lines.push({ y: item.y, size: item.size, items: [item] });
  }

  return lines
    .sort((a, b) => a.y - b.y)
    .map((line) => ({
      y: line.y,
      size: Math.max(...line.items.map((entry) => entry.size)),
      text: line.items.sort((a, b) => a.x - b.x).map((entry) => entry.str).join(" ").replace(/\s+/g, " ").trim(),
    }))
    .filter((line) => line.text);
}

function readPrice(lines) {
  for (const line of lines) {
    const price = parsePrice(line.text);
    if (price) return price;
  }

  for (const line of lines) {
    const decimal = /^(\d{1,3})[.,](\d{2})$/.exec(line.text);
    if (decimal) return Number(`${decimal[1]}.${decimal[2]}`);
    const split = /^(\d{1,3})\s+(\d{2})$/.exec(line.text);
    if (split) return Number(`${split[1]}.${split[2]}`);
  }

  return null;
}

const NOISE = /^(promo|nouveau|nouveauté|offre|new|prix|dès|des|à partir de|lot de|semaine|action)\b/i;

function readTitle(lines) {
  const usable = lines.filter(
    (line) =>
      line.text.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 3 &&
      !/€|\d\s*eur(os?)?\b/i.test(line.text) &&
      !/^\d+[\s.,x×-]*\d*\s*(cm|mm|ml|cl|l|g|kg|w|v|pcs?|pièces?)?$/i.test(line.text) &&
      !NOISE.test(line.text),
  );

  const caps = (text) => (text === text.toUpperCase() && text.length > 3 ? text.charAt(0) + text.slice(1).toLowerCase() : text);

  return {
    title: cleanTitle(caps(usable[0]?.text || "")),
    description: cleanTitle(usable[1]?.text && usable[1].text.length <= 80 ? caps(usable[1].text) : ""),
  };
}

function cropToDataUrl(source, box, maxSide = 900) {
  const pad = 2;
  const sx = Math.max(0, Math.floor(box.left) - pad);
  const sy = Math.max(0, Math.floor(box.top) - pad);
  const sw = Math.min(source.width - sx, Math.ceil(box.width) + pad * 2);
  const sh = Math.min(source.height - sy, Math.ceil(box.height) + pad * 2);
  const ratio = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * ratio));
  canvas.height = Math.max(1, Math.round(sh * ratio));
  canvas.getContext("2d").drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  const webp = canvas.toDataURL("image/webp", 0.82);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.86);
}

export async function extractPdfItems(file, { onProgress, onDebug, scale = 2.2, maxItems = 400 } = {}) {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const candidates = [];
  const usage = new Map();

  for (let pageNumber = 1; pageNumber <= pdf.numPages && candidates.length < maxItems; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const [operatorList, textContent] = await Promise.all([page.getOperatorList(), page.getTextContent()]);
    const pageArea = viewport.width * viewport.height;

    const images = collectImages(pdfjs, operatorList, viewport).filter(({ box }) => {
      const ratio = box.width / Math.max(1, box.height);
      return (
        box.width >= viewport.width * 0.07 &&
        box.height >= viewport.width * 0.07 &&
        box.width * box.height <= pageArea * 0.55 &&
        ratio > 0.2 &&
        ratio < 5 &&
        box.left > -box.width * 0.2 &&
        box.top > -box.height * 0.2
      );
    });

    const texts = textContent.items
      .filter((item) => item.str?.trim())
      .map((item) => {
        const m = pdfjs.Util.transform(viewport.transform, item.transform);
        const width = (item.width || 0) * scale;
        return { str: item.str.trim(), x: m[4], y: m[5], w: width, cx: m[4] + width / 2, size: Math.hypot(m[2], m[3]) || 10 };
      });

    const owned = images.map(() => []);
    const loose = [];
    const sortedSizes = texts.map((text) => text.size).sort((a, b) => a - b);
    const medianSize = sortedSizes[Math.floor(sortedSizes.length / 2)] || 10;

    for (const text of texts) {
      if (text.size >= medianSize * 1.6 && !/\d/.test(text.str)) {
        loose.push(text);
        continue;
      }

      let best = { score: Infinity, index: -1 };

      images.forEach(({ box }, index) => {
        const slack = box.width * 0.06;
        const inColumn = text.cx >= box.left - slack && text.cx <= box.right + slack;
        const middle = (box.top + box.bottom) / 2;
        let score = Infinity;

        if (inColumn && text.y >= box.top && text.y <= box.bottom + box.height * 1.1) score = Math.max(0.5, text.y - box.bottom);
        else if (inColumn && text.y < box.top && box.top - text.y <= box.height * 0.3) score = box.top - text.y + box.height * 0.6;
        else if (text.cx > box.right && text.cx - box.right <= box.width && Math.abs(text.y - middle) < box.height * 0.7)
          score = text.cx - box.right + box.height;

        if (score < best.score) best = { score, index };
      });

      if (best.index >= 0) owned[best.index].push(text);
      else loose.push(text);
    }

    onDebug?.({ pageNumber, images: images.map((entry) => ({ name: entry.name, box: entry.box })), owned: owned.map((list) => list.map((text) => text.str)), loose: loose.map((text) => text.str) });
    const heading = loose
      .filter((text) => text.size >= medianSize * 1.5 && !/\d/.test(text.str))
      .map((text) => text.str)
      .slice(0, 4)
      .join(" ");

    let canvas = null;
    let foundOnPage = 0;

    for (const [index, image] of images.entries()) {
      const lines = groupLines(owned[index]);
      const { title, description } = readTitle(lines);

      if (!title) continue;

      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        // Intention « print » : le rendu ne dépend pas de requestAnimationFrame (fonctionne même onglet en arrière-plan).
        await page.render({ canvasContext: canvas.getContext("2d"), viewport, intent: "print" }).promise;
      }

      usage.set(image.name, (usage.get(image.name) ?? 0) + 1);
      const imageData = cropToDataUrl(canvas, image.box);
      candidates.push({
        title,
        description,
        priceEur: readPrice(lines),
        category: classifyTitle(title, heading),
        imageData,
        imageUrl: imageData,
        imageName: image.name,
        sourceUrl: "",
        page: pageNumber,
      });
      foundOnPage += 1;
    }

    page.cleanup();
    onProgress?.(pageNumber, pdf.numPages, candidates.length);
    await new Promise((resolve) => setTimeout(resolve));
    void foundOnPage;
  }

  onDebug?.({ final: true, usage: Object.fromEntries(usage), names: candidates.map((item) => [item.page, item.title, item.imageName]) });

  // Les logos et pictos répétés sur plusieurs pages ne sont pas des articles.
  return candidates.filter((item) => (usage.get(item.imageName) ?? 0) < 4).slice(0, maxItems);
}
