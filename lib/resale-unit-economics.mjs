function roundedCents(value) {
  const result = Math.round(value * 100) / 100;
  return Object.is(result, -0) ? 0 : result;
}

function amount(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

/**
 * Scenario estimate only. User-entered rates and costs are not marketplace quotations.
 * Does not account for returns, chargebacks, currency conversion, or income taxes.
 */
export function calculateResaleMargin(inputs = {}) {
  const purchase = amount(inputs.purchase);
  const inboundShipping = amount(inputs.inboundShipping);
  const salesTax = amount(inputs.salesTax);
  const salePrice = amount(inputs.salePrice);
  const feePercent = amount(inputs.feePercent);
  const outboundShipping = amount(inputs.outboundShipping);
  const desiredProfit = amount(inputs.desiredProfit);
  if ([purchase, inboundShipping, salesTax, salePrice, feePercent, outboundShipping, desiredProfit].some((n) => n === null) || feePercent >= 100) {
    return { valid: false, reason: "Enter nonnegative costs and a selling fee below 100%." };
  }
  const fixedCosts = purchase + inboundShipping + salesTax + outboundShipping;
  const sellingFee = salePrice * feePercent / 100;
  const netProfit = roundedCents(salePrice - sellingFee - fixedCosts);
  const breakEvenSalePrice = fixedCosts / (1 - feePercent / 100);
  const maxPurchasePrice = roundedCents(salePrice * (1 - feePercent / 100) - inboundShipping - salesTax - outboundShipping - desiredProfit);
  const totalCosts = fixedCosts + sellingFee;
  if (![fixedCosts, sellingFee, netProfit, breakEvenSalePrice, maxPurchasePrice, totalCosts].every(Number.isFinite)) {
    return { valid: false, reason: "These amounts exceed the supported calculation range." };
  }
  return { valid: true, netProfit, sellingFee, breakEvenSalePrice, maxPurchasePrice, totalCosts };
}
