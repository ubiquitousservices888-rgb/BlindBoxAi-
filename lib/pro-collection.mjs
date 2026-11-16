import { calculateResaleMargin } from "./resale-unit-economics.mjs";
import { ProError } from "./pro-config.mjs";

export const PRO_INPUT_KEYS = ["purchase", "inboundShipping", "salesTax", "salePrice", "feePercent", "outboundShipping", "desiredProfit"];
export const PRO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeProScenario(body) {
  const name = typeof body?.name === "string" ? body.name.replace(/[\x00-\x1f\x7f]/g, " ").trim() : "";
  if (!PRO_UUID.test(body?.id || "") || !name || name.length > 120 ||
      !Number.isInteger(body?.quantity) || body.quantity < 1 || body.quantity > 100000) throw new ProError("invalid_scenario", 400);
  const inputs = {};
  for (const key of PRO_INPUT_KEYS) {
    const value = body.inputs?.[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100000000 || (key === "feePercent" && value >= 100)) throw new ProError("invalid_scenario", 400);
    inputs[key] = value;
  }
  if (!calculateResaleMargin(inputs).valid) throw new ProError("invalid_scenario", 400);
  return { id: body.id, name, inputs, quantity: body.quantity };
}

function csvCell(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function proScenariosCsv(rows) {
  const output = [["Scenario", "Quantity", ...PRO_INPUT_KEYS, "Estimated profit per item USD", "Estimated total profit USD", "Break-even resale USD", "Source"]];
  for (const row of rows) {
    const scenario = normalizeProScenario(row);
    const result = calculateResaleMargin(scenario.inputs);
    output.push([scenario.name, scenario.quantity, ...PRO_INPUT_KEYS.map(key => scenario.inputs[key]), result.netProfit, Math.round(result.netProfit * scenario.quantity * 100) / 100, Math.round(result.breakEvenSalePrice * 100) / 100, "User assumptions; not verified sales or cash revenue"]);
  }
  return output.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
