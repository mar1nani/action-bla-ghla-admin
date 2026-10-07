// Boutique publique : catalogue par catégories, recherche, fiche article, commande WhatsApp.
const $ = (selector, root = document) => root.querySelector(selector);

const state = { data: null, category: "all", search: "" };

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const formatPrice = (value) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function whatsappLink(item) {
  const phone = state.data?.whatsappPhone;
  if (!phone) return "";
  const text = `Bonjour, je suis intéressé(e) par : ${item.title} (${formatPrice(item.priceMad)} DH). Est-il disponible ?`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function filtered() {
  const needle = normalize(state.search).trim();
  return state.data.items.filter(
    (item) =>
      (state.category === "all" || item.category === state.category) &&
      (!needle || normalize(`${item.title} ${item.description} ${item.category}`).includes(needle)),
  );
}

function renderChips() {
  const chips = [{ name: "all", label: "Tout", count: state.data.items.length }, ...state.data.categories.map((c) => ({ name: c.name, label: `${c.icon} ${c.name}`, count: c.count }))];
  $("#chips").innerHTML = chips
    .map((chip) => `<button class="chip${state.category === chip.name ? " is-active" : ""}" type="button" role="tab" data-category="${escapeHtml(chip.name)}">${escapeHtml(chip.label)}</button>`)
    .join("");
}

function card(item, index) {
  return `
    <button class="card" type="button" data-id="${escapeHtml(item.id)}" style="transition-delay:${Math.min(index % 8, 7) * 45}ms">
      <span class="photo"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" /></span>
      <span class="info">
        <h3>${escapeHtml(item.title)}</h3>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
        <span class="price">${formatPrice(item.priceMad)}<small>DH</small></span>
      </span>
    </button>`;
}

function renderGrid() {
  const main = $("#main");
  const items = filtered();

  if (!items.length) {
    main.innerHTML = `<div class="empty"><strong>${state.data.items.length ? "Aucun résultat" : "La collection arrive bientôt"}</strong><span>${state.data.items.length ? "Essayez un autre mot ou une autre catégorie." : "Revenez très vite découvrir nos articles."}</span></div>`;
    return;
  }

  if (state.category === "all" && !state.search.trim()) {
    const sections = state.data.categories
      .map((category) => ({ category, items: items.filter((item) => item.category === category.name) }))
      .filter((section) => section.items.length);

    main.innerHTML = sections
      .map(
        ({ category, items: list }) => `
        <section id="cat-${escapeHtml(category.name)}">
          <div class="section-title"><h2>${escapeHtml(category.name)}</h2><span>${list.length} article${list.length > 1 ? "s" : ""}</span></div>
          <div class="grid">${list.map(card).join("")}</div>
        </section>`,
      )
      .join("");
  } else {
    main.innerHTML = `<div class="grid">${items.map(card).join("")}</div>`;
  }

  observeCards();
}

let observer;
function observeCards() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -6% 0px" },
  );
  document.querySelectorAll(".card").forEach((element) => {
    const img = $("img", element);
    if (img.complete) img.classList.add("is-loaded");
    else img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
    observer.observe(element);
  });
}

function openSheet(id) {
  const item = state.data.items.find((entry) => entry.id === id);
  if (!item) return;

  $("#sheet-img").src = item.imageUrl;
  $("#sheet-img").alt = item.title;
  $("#sheet-cat").textContent = item.category;
  $("#sheet-title").textContent = item.title;
  $("#sheet-desc").textContent = item.description || "";
  $("#sheet-desc").hidden = !item.description;
  $("#sheet-price").innerHTML = `${formatPrice(item.priceMad)}<small>DH</small>`;
  const cta = $("#sheet-cta");
  const link = whatsappLink(item);
  cta.hidden = !link;
  if (link) cta.href = link;
  $("#sheet").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSheet() {
  $("#sheet").hidden = true;
  document.body.style.overflow = "";
}

document.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-category]");
  if (chip) {
    state.category = chip.dataset.category;
    renderChips();
    renderGrid();
    window.scrollTo({ top: $(".filters").offsetTop - 1, behavior: "smooth" });
    return;
  }

  const cardEl = event.target.closest(".card");
  if (cardEl) return openSheet(cardEl.dataset.id);

  if (event.target.closest("[data-close]")) closeSheet();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSheet();
});

$("#search").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderGrid();
});

async function init() {
  try {
    const response = await fetch("/api/public/showcase");
    state.data = await response.json();
    document.title = `La Boutique · ${state.data.appName}`;
    renderChips();
    renderGrid();
  } catch {
    $("#main").innerHTML = `<div class="empty"><strong>Connexion impossible</strong><span>Vérifiez votre connexion puis rechargez la page.</span></div>`;
  }
}

init();
