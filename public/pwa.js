// PWA : enregistrement du service worker + invitation à installer l'app
const DISMISS_KEY = "abg-install-dismissed";
let deferredPrompt = null;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
  (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

function wasDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - at < 7 * 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* stockage indisponible */
  }
  document.querySelector("#install-banner")?.remove();
}

function showBanner({ ios = false } = {}) {
  if (document.querySelector("#install-banner") || isStandalone() || wasDismissed()) {
    return;
  }

  const banner = document.createElement("aside");
  banner.id = "install-banner";
  banner.className = "install-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Installer l'application");
  banner.innerHTML = `
    <img src="/icons/icon-192.png" alt="" width="44" height="44" />
    <div class="install-copy">
      <strong>Installer Action bla ghla</strong>
      <span>${
        ios
          ? "Touche <b>Partager</b> <i class=\"ios-share\">⎙</i> puis <b>« Sur l'écran d'accueil »</b>."
          : "Ouvre l'app en un tap depuis ton écran d'accueil."
      }</span>
    </div>
    ${ios ? "" : '<button type="button" class="install-go">Installer</button>'}
    <button type="button" class="install-close" aria-label="Plus tard">×</button>
  `;
  document.body.append(banner);

  banner.querySelector(".install-close").addEventListener("click", dismiss);
  banner.querySelector(".install-go")?.addEventListener("click", async () => {
    if (!deferredPrompt) {
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null;
    banner.remove();
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  window.setTimeout(() => showBanner(), 2500);
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  document.querySelector("#install-banner")?.remove();
});

if (isIos() && !isStandalone()) {
  window.addEventListener("load", () => window.setTimeout(() => showBanner({ ios: true }), 4000));
}
