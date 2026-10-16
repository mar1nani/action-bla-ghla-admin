// Lit une page Action avec le navigateur de l'utilisateur. Deux méthodes :
// 1) un simple fetch (rapide) ; 2) si le site répond par une vérification anti-robots, on ouvre la page dans un
//    onglet normal en arrière-plan (le navigateur réussit la vérification comme pour n'importe quel visiteur).
const ALLOWED_HOSTS = new Set(["www.action.com"]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const looksChallenged = (status, html) =>
  [401, 403, 429, 503].includes(status) || /just a moment|enable javascript and cookies/i.test(html.slice(0, 3000));

async function viaFetch(url) {
  const response = await fetch(url, { credentials: "include", headers: { accept: "text/html" } });
  const html = await response.text();
  return { ok: response.ok && !looksChallenged(response.status, html), status: response.status, html };
}

async function viaTab(url) {
  const tab = await chrome.tabs.create({ url, active: false });

  try {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await sleep(1000);
      let result;

      try {
        [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            ready:
              document.readyState === "complete" &&
              Boolean(document.querySelector('script[type="application/ld+json"], [data-testid="product-card"]')),
            challenge: /just a moment/i.test(document.title),
            html: document.documentElement.outerHTML,
          }),
        });
      } catch {
        continue; // la page est en cours de navigation (vérification en cours)
      }

      if (result?.ready && !result.challenge) {
        return { ok: true, status: 200, html: result.html };
      }
    }

    return { ok: false, status: 0, error: "La page ne s'est pas chargée (vérification anti-robots ?)." };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => undefined);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "fetch") {
    return false;
  }

  (async () => {
    try {
      const url = new URL(message.url);

      if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
        sendResponse({ ok: false, error: "Site non autorisé par l'extension." });
        return;
      }

      let result = await viaFetch(url.href).catch(() => ({ ok: false }));

      if (!result.ok) {
        result = await viaTab(url.href);
      }

      sendResponse(result);
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();

  return true;
});
