function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(value, currency) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatQty(value) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function renderItems(items) {
  return items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.productName)}</td>
          <td class="cell-center">${escapeHtml(formatQty(item.qty))}</td>
          <td class="cell-right">${escapeHtml(formatCurrency(item.unitSalePriceMad, "MAD"))}</td>
          <td class="cell-right">${escapeHtml(formatCurrency(item.lineRevenueMad, "MAD"))}</td>
        </tr>
      `,
    )
    .join("");
}

export function createInvoiceFileName(order) {
  const safeCustomerName = String(order.customer?.name || "client")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `facture-${order.id}-${safeCustomerName || "client"}.html`;
}

export function renderInvoiceHtml(order, settings, options = {}) {
  const companyName = settings.companyName || "Action BLA Ghla";
  const autoPrint = options.autoPrint === true;
  const balanceLabel =
    order.paymentStatus === "payee"
      ? "Commande déjà réglée"
      : "Montant à payer à la livraison";
  const balanceAmount =
    order.paymentStatus === "payee" ? formatCurrency(0, "MAD") : formatCurrency(order.totalRevenueMad, "MAD");
  const paymentLabel =
    order.paymentStatus === "payee" ? "Payée" : "À payer à la livraison";
  const deliveryLine =
    order.deliveryPriceMad > 0
      ? `
      <div class="totals-row">
        <span>Livraison (${escapeHtml(order.carrierName || "Transporteur")})</span>
        <strong>${escapeHtml(formatCurrency(order.deliveryPriceMad, "MAD"))}</strong>
      </div>
    `
      : "";
  const notes = order.notes
    ? `
      <section class="notes-card">
        <h3>Remarque</h3>
        <p>${escapeHtml(order.notes)}</p>
      </section>
    `
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Facture ${escapeHtml(order.id)}</title>
    <style>
      :root {
        --ink: #18212e;
        --muted: #687384;
        --line: #d7dfeb;
        --line-strong: #bfc8d6;
        --accent: #0f8a92;
        --accent-soft: #eef8f8;
        --warning: #c66041;
        --warning-soft: #fff1eb;
        --panel: #ffffff;
        --bg: #f5f7fb;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        color: var(--ink);
        background: var(--bg);
        font-family: "Inter", "Segoe UI", sans-serif;
      }

      body {
        padding: 16px;
      }

      .page {
        width: min(920px, 100%);
        margin: 0 auto;
        padding: 28px;
        border: 1px solid var(--line);
        border-radius: 22px;
        background: var(--panel);
      }

      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: flex-start;
      }

      .brand-mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 52px;
        height: 52px;
        border-radius: 16px;
        background: linear-gradient(135deg, #132133, #0f8a92);
        color: white;
        font-weight: 800;
        letter-spacing: 0.08em;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 14px;
      }

      .brand-copy h1,
      .summary-card strong,
      .section-card h2,
      .totals-card strong,
      .signature-card h3 {
        margin: 0;
      }

      .brand-copy h1 {
        font-size: 1.4rem;
        line-height: 1.05;
      }

      .brand-copy p,
      .meta-card p,
      .section-card p,
      .notes-card p,
      .signature-card p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }

      .meta-card {
        min-width: 250px;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: #fbfcfe;
      }

      .meta-card h2 {
        margin: 0 0 10px;
        font-size: 1rem;
      }

      .meta-row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 6px 0;
      }

      .meta-row span {
        color: var(--muted);
      }

      .summary-grid,
      .details-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        margin-top: 18px;
      }

      .summary-card,
      .section-card,
      .totals-card,
      .notes-card,
      .signature-card {
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 18px;
      }

      .summary-card {
        background: var(--accent-soft);
        border-color: #d1ecec;
      }

      .summary-card.warning {
        background: var(--warning-soft);
        border-color: #f0d1c5;
      }

      .summary-card span,
      .section-label,
      .totals-row span {
        color: var(--muted);
      }

      .summary-card strong {
        display: block;
        margin-top: 8px;
        font-size: 1.22rem;
      }

      .section-card h2,
      .notes-card h3,
      .signature-card h3 {
        margin: 0 0 10px;
        font-size: 1rem;
      }

      table {
        width: 100%;
        margin-top: 18px;
        border-collapse: collapse;
      }

      thead th {
        padding: 10px 10px;
        border-bottom: 1px solid var(--line-strong);
        color: var(--muted);
        font-size: 0.72rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        text-align: left;
      }

      tbody td {
        padding: 10px 10px;
        border-bottom: 1px solid var(--line);
        vertical-align: top;
        font-size: 0.92rem;
      }

      .cell-center {
        text-align: center;
      }

      .cell-right {
        text-align: right;
      }

      .totals-card {
        width: min(360px, 100%);
        margin: 18px 0 0 auto;
        background: #fbfcfe;
      }

      .totals-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 7px 0;
      }

      .totals-row.total {
        margin-top: 6px;
        padding-top: 10px;
        border-top: 1px solid var(--line-strong);
        font-size: 0.98rem;
        font-weight: 800;
      }

      .notes-card {
        margin-top: 18px;
      }

      .footer {
        margin-top: 18px;
        color: var(--muted);
        font-size: 0.84rem;
        line-height: 1.6;
      }

      .print-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin: 0 auto 12px;
        width: min(920px, 100%);
      }

      .print-actions button {
        border: 0;
        border-radius: 999px;
        padding: 9px 14px;
        background: #132133;
        color: white;
        font: inherit;
        font-size: 0.92rem;
        font-weight: 700;
        cursor: pointer;
      }

      .print-actions button.secondary {
        background: white;
        color: var(--ink);
        border: 1px solid var(--line-strong);
      }

      @media print {
        @page {
          size: A4;
          margin: 10mm;
        }

        body {
          padding: 0;
          background: white;
        }

        .print-actions {
          display: none;
        }

        .page {
          width: 100%;
          padding: 0;
          border: 0;
          border-radius: 0;
        }
      }

      @media (max-width: 720px) {
        body {
          padding: 14px;
        }

        .page {
          padding: 20px;
        }

        .topbar,
        .summary-grid,
        .details-grid {
          grid-template-columns: 1fr;
          display: grid;
        }

        .meta-card,
        .totals-card {
          min-width: 0;
          width: 100%;
        }

        .print-actions {
          justify-content: stretch;
          flex-direction: column;
        }

        .print-actions button {
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <div class="print-actions">
      <button class="secondary" type="button" onclick="window.close()">Fermer</button>
      <button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
    </div>

    <main class="page">
      <header class="topbar">
        <section class="brand">
          <div class="brand-mark">AG</div>
          <div class="brand-copy">
            <h1>${escapeHtml(companyName)}</h1>
            <p>Facture client à joindre au colis</p>
          </div>
        </section>

        <section class="meta-card">
          <h2>Facture</h2>
          <div class="meta-row"><span>Référence</span><strong>${escapeHtml(order.id)}</strong></div>
          <div class="meta-row"><span>Date</span><strong>${escapeHtml(formatDate(order.orderedAt))}</strong></div>
          <div class="meta-row"><span>Statut</span><strong>${escapeHtml(order.status === "livree" ? "Livrée" : order.status === "confirmee" ? "Confirmée" : "Brouillon")}</strong></div>
          <div class="meta-row"><span>Paiement</span><strong>${escapeHtml(paymentLabel)}</strong></div>
        </section>
      </header>

      <section class="summary-grid">
        <article class="section-card">
          <div class="section-label">Client</div>
          <h2>${escapeHtml(order.customer.name)}</h2>
          <p>${escapeHtml(order.customer.phone)}</p>
          <p>${escapeHtml(order.customer.city)}</p>
          <p>${escapeHtml(order.customer.address)}</p>
        </article>

        <article class="summary-card ${order.paymentStatus === "payee" ? "" : "warning"}">
          <span>${escapeHtml(balanceLabel)}</span>
          <strong>${escapeHtml(balanceAmount)}</strong>
          <p>${escapeHtml(order.paymentStatus === "payee" ? "Cette commande est marquée comme réglée dans l'application." : "Merci d'encaisser ce montant lors de la livraison.")}</p>
        </article>
      </section>

      <table>
        <thead>
          <tr>
            <th>Produit</th>
            <th class="cell-center">Qté</th>
            <th class="cell-right">Prix unitaire</th>
            <th class="cell-right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${renderItems(order.items)}
        </tbody>
      </table>

      <section class="totals-card">
        <div class="totals-row">
          <span>Total articles</span>
          <strong>${escapeHtml(formatQty(order.totalQty))}</strong>
        </div>
        <div class="totals-row">
          <span>Sous-total</span>
          <strong>${escapeHtml(formatCurrency(order.itemsRevenueMad || order.totalRevenueMad, "MAD"))}</strong>
        </div>
        ${deliveryLine}
        <div class="totals-row total">
          <span>Total à régler</span>
          <strong>${escapeHtml(formatCurrency(order.totalRevenueMad, "MAD"))}</strong>
        </div>
      </section>

      ${notes}

      <footer class="footer">
        Document généré depuis ${escapeHtml(companyName)} le ${escapeHtml(
          formatDate(new Date().toISOString()),
        )}.
      </footer>
    </main>
    ${
      autoPrint
        ? `
    <script>
      window.addEventListener("load", () => {
        window.setTimeout(() => window.print(), 120);
      });
    </script>
    `
        : ""
    }
  </body>
</html>`;
}
