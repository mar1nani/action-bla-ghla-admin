// Pont entre l'application (page web) et l'extension : la page envoie {source:"abg-app", id, type, url},
// l'extension répond {source:"abg-ext", id, ...}. Rien d'autre n'est exposé.
const VERSION = "1.0.0";

window.addEventListener("message", (event) => {
  const data = event.data;

  if (event.source !== window || data?.source !== "abg-app" || typeof data.id !== "string") {
    return;
  }

  if (data.type === "ping") {
    window.postMessage({ source: "abg-ext", id: data.id, type: "pong", version: VERSION }, "*");
    return;
  }

  if (data.type === "fetch" && typeof data.url === "string") {
    chrome.runtime.sendMessage({ type: "fetch", url: data.url }, (response) => {
      const failure = chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : null;
      window.postMessage({ source: "abg-ext", id: data.id, type: "result", ...(failure || response || { ok: false, error: "Pas de réponse" }) }, "*");
    });
  }
});
