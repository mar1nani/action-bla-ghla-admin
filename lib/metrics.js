function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function sum(items, selector) {
  return items.reduce((total, item) => total + selector(item), 0);
}

function toIsoDateTime(value) {
  if (!value) {
    return new Date().toISOString();
  }

  if (value.includes("T")) {
    return new Date(value).toISOString();
  }

  return new Date(`${value}T12:00:00`).toISOString();
}

function formatReference(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeShipmentStatus(status) {
  return (
    {
      achete: "achete",
      en_preparation: "en_preparation",
      envoye: "envoye",
      chez_transporteur: "chez_transporteur",
      recu: "recu",
    }[status] || "envoye"
  );
}

function formatShipmentStatus(status) {
  return (
    {
      achete: "Acheté",
      en_preparation: "En préparation",
      envoye: "Envoyé",
      chez_transporteur: "Chez le transporteur",
      recu: "Colis reçu",
    }[status] || "Envoyé"
  );
}

function normalizeOrderPaymentState(order, customerTotalMad) {
  let advancePaidMad = round(order.advancePaidMad ?? 0);

  if (order.paymentStatus === "payee" && advancePaidMad <= 0) {
    advancePaidMad = customerTotalMad;
  }

  advancePaidMad = Math.max(0, Math.min(advancePaidMad, customerTotalMad));

  const remainingToPayMad = round(Math.max(customerTotalMad - advancePaidMad, 0));
  const paymentStatus =
    advancePaidMad <= 0
      ? "non_payee"
      : remainingToPayMad <= 0
        ? "payee"
        : "avance";

  return {
    paymentStatus,
    advancePaidMad,
    remainingToPayMad,
    paidAt: paymentStatus === "payee" ? order.paidAt || order.orderedAt : null,
  };
}

export function createValidationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function requireString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw createValidationError(`Le champ "${fieldName}" est obligatoire.`);
  }

  return value.trim();
}

export function optionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function requireNumber(value, fieldName, options = {}) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw createValidationError(`Le champ "${fieldName}" doit être un nombre valide.`);
  }

  if (options.min !== undefined && number < options.min) {
    throw createValidationError(
      `Le champ "${fieldName}" doit être supérieur ou égal à ${options.min}.`,
    );
  }

  return number;
}

export function requireInteger(value, fieldName, options = {}) {
  const number = requireNumber(value, fieldName, options);

  if (!Number.isInteger(number)) {
    throw createValidationError(`Le champ "${fieldName}" doit être un nombre entier.`);
  }

  return number;
}

export function normalizeMoroccanPhone(value) {
  const cleaned = String(value ?? "")
    .replace(/[^\d+]/g, "")
    .trim();

  if (/^0\d{9}$/.test(cleaned)) {
    return `+212${cleaned.slice(1)}`;
  }

  if (/^\+212\d{9}$/.test(cleaned)) {
    return cleaned;
  }

  if (/^212\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  throw createValidationError(
    'Le numéro client doit être marocain, par exemple "0612345678" ou "+212612345678".',
  );
}

export function toRecordDate(value) {
  return toIsoDateTime(value);
}

export function allocateByWeight(items, totalCost) {
  const totalWeight = sum(items, (item) => item.weightKg);

  if (!items.length) {
    return [];
  }

  if (totalWeight <= 0) {
    return items.map((item, index) => ({
      ...item,
      allocatedCostEur: index === items.length - 1 ? round(totalCost) : 0,
    }));
  }

  let allocated = 0;

  return items.map((item, index) => {
    const remaining = round(totalCost - allocated);
    const nextCost =
      index === items.length - 1
        ? remaining
        : round((item.weightKg / totalWeight) * totalCost);

    allocated += nextCost;

    return {
      ...item,
      allocatedCostEur: nextCost,
    };
  });
}

function createMetricSeed(product) {
  return {
    productId: product.id,
    purchasedQty: 0,
    purchaseSpendEur: 0,
    shippedQty: 0,
    receivedQty: 0,
    shippingSpendEur: 0,
    landedSpendEur: 0,
    soldQty: 0,
    revenueMad: 0,
    profitMad: 0,
    orderCount: 0,
  };
}

export function buildAppState(store) {
  const products = Array.isArray(store.products) ? store.products : [];
  const wishlist = Array.isArray(store.wishlist) ? store.wishlist : [];
  const purchases = Array.isArray(store.purchases) ? store.purchases : [];
  const shipments = Array.isArray(store.shipments) ? store.shipments : [];
  const orders = Array.isArray(store.orders) ? store.orders : [];
  const settings = store.settings ?? {};

  const productMap = new Map(products.map((product) => [product.id, product]));
  const metricsById = Object.fromEntries(
    products.map((product) => [product.id, createMetricSeed(product)]),
  );

  for (const purchase of purchases) {
    for (const item of purchase.items ?? []) {
      const metric = metricsById[item.productId];

      if (!metric) {
        continue;
      }

      metric.purchasedQty += item.qty;
      metric.purchaseSpendEur += item.lineTotalEur;
    }
  }

  for (const shipment of shipments) {
    const normalizedStatus = normalizeShipmentStatus(shipment.status);
    const countsInMorocco = normalizedStatus === "recu";

    for (const item of shipment.items ?? []) {
      const metric = metricsById[item.productId];

      if (!metric) {
        continue;
      }

      metric.shippedQty += item.qty;
      metric.shippingSpendEur += item.shippingCostEur;

      if (countsInMorocco) {
        metric.receivedQty += item.qty;
        metric.landedSpendEur += item.totalLandedCostEur;
      }
    }
  }

  for (const order of orders) {
    const countedProducts = new Set();

    for (const item of order.items ?? []) {
      const metric = metricsById[item.productId];

      if (!metric) {
        continue;
      }

      metric.soldQty += item.qty;
      metric.revenueMad += item.lineRevenueMad;
      metric.profitMad += item.lineProfitMad;

      if (!countedProducts.has(item.productId)) {
        metric.orderCount += 1;
        countedProducts.add(item.productId);
      }
    }
  }

  const enrichedProducts = products
    .map((product) => {
      const metric = metricsById[product.id];
      const avgPurchaseCostEur =
        metric.purchasedQty > 0
          ? round(metric.purchaseSpendEur / metric.purchasedQty)
          : round(product.defaultPurchasePriceEur);
      const avgLandedCostEur =
        metric.receivedQty > 0
          ? round(metric.landedSpendEur / metric.receivedQty)
          : round(avgPurchaseCostEur + product.weightKg * settings.transportRatePerKgEur);
      const avgLandedCostMad = round(avgLandedCostEur * settings.eurToMad);
      const franceStock = metric.purchasedQty - metric.shippedQty;
      const moroccoStock = metric.receivedQty - metric.soldQty;
      const totalStock = franceStock + moroccoStock;
      const revenueMad = round(metric.revenueMad);
      const profitMad = round(metric.profitMad);
      const marginRate = revenueMad > 0 ? round((profitMad / revenueMad) * 100) : 0;
      const estimatedUnitProfitMad = round(product.defaultSalePriceMad - avgLandedCostMad);
      const minStockAlert = product.minStockAlert ?? settings.lowStockDefault ?? 2;

      return {
        ...product,
        metrics: {
          purchasedQty: metric.purchasedQty,
          purchaseSpendEur: round(metric.purchaseSpendEur),
          avgPurchaseCostEur,
          shippedQty: metric.shippedQty,
          receivedQty: metric.receivedQty,
          shippingSpendEur: round(metric.shippingSpendEur),
          avgLandedCostEur,
          avgLandedCostMad,
          soldQty: metric.soldQty,
          franceStock,
          moroccoStock,
          totalStock,
          revenueMad,
          profitMad,
          marginRate,
          estimatedUnitProfitMad,
          orderCount: metric.orderCount,
          lowStock: moroccoStock <= minStockAlert,
        },
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));

  const enrichedShipments = [...shipments]
    .sort((left, right) => new Date(right.shippedAt) - new Date(left.shippedAt))
    .map((shipment) => ({
      ...shipment,
      status: normalizeShipmentStatus(shipment.status),
      responsibleName: "MALAK",
      sourcePurchaseIds: Array.isArray(shipment.sourcePurchaseIds)
        ? [...new Set(shipment.sourcePurchaseIds.filter(Boolean))]
        : [],
      items: (shipment.items ?? []).map((item) => ({
        ...item,
        productName: productMap.get(item.productId)?.name ?? "Produit inconnu",
      })),
    }));

  const purchaseShipmentById = new Map();

  for (const shipment of enrichedShipments) {
    for (const purchaseId of shipment.sourcePurchaseIds ?? []) {
      if (!purchaseShipmentById.has(purchaseId)) {
        purchaseShipmentById.set(purchaseId, shipment);
      }
    }
  }

  const enrichedPurchases = [...purchases]
    .sort((left, right) => new Date(right.orderedAt) - new Date(left.orderedAt))
    .map((purchase) => {
      const linkedShipment = purchaseShipmentById.get(purchase.id);

      return {
        ...purchase,
        linkedShipmentId: linkedShipment?.id || "",
        linkedShipmentStatus: linkedShipment?.status || "",
        linkedShipmentReference: linkedShipment?.reference || "",
        canCreateShipment: !linkedShipment,
        items: (purchase.items ?? []).map((item) => ({
          ...item,
          productName: productMap.get(item.productId)?.name ?? "Produit inconnu",
        })),
      };
    });

  const enrichedOrders = [...orders]
    .sort((left, right) => new Date(right.orderedAt) - new Date(left.orderedAt))
    .map((order) => {
      const items = (order.items ?? []).map((item) => ({
        ...item,
        productName: productMap.get(item.productId)?.name ?? "Produit inconnu",
      }));
      const deliveryPriceMad = round(order.deliveryPriceMad ?? 0);
      const itemsRevenueMad = round(sum(items, (item) => item.lineRevenueMad));
      const totalCostMad = round(sum(items, (item) => item.lineCostMad));
      const totalProfitMad = round(sum(items, (item) => item.lineProfitMad));
      const totalRevenueMad = itemsRevenueMad;
      const customerTotalMad = round(
        order.customerTotalMad ?? round(itemsRevenueMad + deliveryPriceMad),
      );
      const marginRate = totalRevenueMad > 0 ? round((totalProfitMad / totalRevenueMad) * 100) : 0;
      const paymentState = normalizeOrderPaymentState(order, customerTotalMad);

      return {
        ...order,
        carrierName: formatReference(order.carrierName, "Achraf"),
        deliveryPriceMad,
        itemsRevenueMad,
        customerTotalMad,
        totalRevenueMad,
        totalCostMad,
        totalProfitMad,
        marginRate,
        paymentStatus: paymentState.paymentStatus,
        advancePaidMad: paymentState.advancePaidMad,
        remainingToPayMad: paymentState.remainingToPayMad,
        paidAt: paymentState.paidAt,
        items,
      };
    });

  const activity = [
    ...enrichedPurchases.map((purchase) => ({
      id: purchase.id,
      type: "Achat",
      date: purchase.orderedAt,
      title: purchase.supplierName,
      subtitle: purchase.orderNumber || `${purchase.totalQty} articles`,
      amount: `${round(purchase.totalCostEur)} EUR`,
    })),
    ...enrichedShipments.map((shipment) => ({
      id: shipment.id,
      type: "Envoi",
      date: shipment.shippedAt,
      title: shipment.reference || "Envoi Maroc",
      subtitle: `${formatShipmentStatus(shipment.status)} · ${round(shipment.packageWeightKg, 3)} kg`,
      amount: `${round(shipment.shippingPriceEur)} EUR`,
    })),
    ...enrichedOrders.map((order) => ({
      id: order.id,
      type: "Commande",
      date: order.orderedAt,
      title: order.customer.name,
      subtitle: order.customer.city,
      amount: `${round(order.customerTotalMad)} MAD`,
    })),
  ]
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .slice(0, 12);

  const dashboard = {
    totals: {
      totalProducts: enrichedProducts.length,
      totalFranceStock: sum(enrichedProducts, (product) => product.metrics.franceStock),
      totalMoroccoStock: sum(enrichedProducts, (product) => product.metrics.moroccoStock),
      totalMoroccoStockCostMad: round(
        sum(
          enrichedProducts,
          (product) => product.metrics.moroccoStock * product.metrics.avgLandedCostMad,
        ),
      ),
      totalMoroccoStockPotentialRevenueMad: round(
        sum(
          enrichedProducts,
          (product) => product.metrics.moroccoStock * (product.defaultSalePriceMad ?? 0),
        ),
      ),
      lowStockCount: enrichedProducts.filter((product) => product.metrics.lowStock).length,
      totalPurchaseSpendEur: round(sum(enrichedPurchases, (purchase) => purchase.totalCostEur)),
      totalShippingSpendEur: round(
        sum(enrichedShipments, (shipment) => shipment.shippingPriceEur),
      ),
      totalOrders: enrichedOrders.length,
      totalPaidOrders: enrichedOrders.filter((order) => order.paymentStatus === "payee").length,
      totalUnpaidOrders: enrichedOrders.filter((order) => order.remainingToPayMad > 0).length,
      outstandingRevenueMad: round(
        sum(
          enrichedOrders.filter((order) => order.remainingToPayMad > 0),
          (order) => order.remainingToPayMad,
        ),
      ),
      totalRevenueMad: round(sum(enrichedOrders, (order) => order.totalRevenueMad)),
      totalProfitMad: round(sum(enrichedOrders, (order) => order.totalProfitMad)),
    },
    lowStockProducts: enrichedProducts
      .filter((product) => product.metrics.lowStock)
      .slice(0, 8),
    recentActivity: activity,
  };

  const stats = {
    topSoldProducts: [...enrichedProducts]
      .filter((product) => product.metrics.soldQty > 0)
      .sort((left, right) => right.metrics.soldQty - left.metrics.soldQty)
      .slice(0, 6),
    topProfitProducts: [...enrichedProducts]
      .filter((product) => product.metrics.profitMad > 0)
      .sort((left, right) => right.metrics.profitMad - left.metrics.profitMad)
      .slice(0, 6),
    bestMarginProducts: [...enrichedProducts]
      .filter((product) => product.metrics.marginRate > 0)
      .sort((left, right) => right.metrics.marginRate - left.metrics.marginRate)
      .slice(0, 6),
    topCities: Object.entries(
      enrichedOrders.reduce((cities, order) => {
        const city = formatReference(order.customer.city, "Ville inconnue");
        cities[city] = (cities[city] ?? 0) + 1;
        return cities;
      }, {}),
    )
      .map(([city, count]) => ({ city, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6),
  };

  const wishlistProductIds = [...new Set(
    wishlist
      .map((entry) => entry.productId)
      .filter((productId) => productMap.has(productId)),
  )];

  return {
    settings,
    products: enrichedProducts,
    wishlistProductIds,
    wishlistCount: wishlistProductIds.length,
    purchases: enrichedPurchases,
    shipments: enrichedShipments,
    orders: enrichedOrders,
    dashboard,
    stats,
  };
}
