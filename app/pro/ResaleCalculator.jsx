"use client";

import { useState } from "react";
import { calculateResaleMargin } from "../../lib/resale-unit-economics.mjs";

const fields = [
  ["purchase", "Purchase price", "What you pay for the item"],
  ["inboundShipping", "Inbound shipping", "Shipping paid to acquire it"],
  ["salesTax", "Purchase tax", "Sales tax paid when buying"],
  ["salePrice", "Expected resale price", "Use a plausible sale, not an unsold ask"],
  ["feePercent", "Selling fees (%)", "Enter your actual platform/payment rate"],
  ["outboundShipping", "Outbound shipping", "Packing and postage you will pay"],
  ["desiredProfit", "Target profit (optional)", "Profit goal above all listed costs; defaults to zero"],
];

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function ResaleCalculator() {
  const [inputs, setInputs] = useState({});
  const result = calculateResaleMargin(inputs);
  const requiredFields = ["purchase", "inboundShipping", "salesTax", "salePrice", "feePercent", "outboundShipping"];
  const ready = requiredFields.every((key) => inputs[key] !== undefined && inputs[key] !== "");
  const started = Object.values(inputs).some((value) => value !== "");

  return (
    <section className="plan" style={{ marginTop: "24px" }} aria-labelledby="resale-margin-title">
      <h2 id="resale-margin-title">Free resale margin check</h2>
      <p style={{ lineHeight: 1.6 }}>
        A price can look like a bargain and still lose money after fees. Try your
        own what-if numbers. This calculator runs in your browser and does not
        submit or save the amounts.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(205px, 1fr))", gap: "12px" }}>
        {fields.map(([key, label, hint]) => (
          <label key={key} style={{ display: "grid", gap: "4px" }}>
            <strong style={{ fontSize: ".87rem" }}>{label}</strong>
            <input
              type="number"
              min="0"
              max={key === "feePercent" ? "99.99" : undefined}
              step="0.01"
              inputMode="decimal"
              aria-label={label}
              aria-describedby={`resale-hint-${key}`}
              placeholder="0.00"
              value={inputs[key] ?? ""}
              onChange={(e) => setInputs((current) => ({ ...current, [key]: e.target.value }))}
              style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--line, #ccc)", background: "transparent", color: "inherit", width: "100%" }}
            />
            <small className="fine" id={`resale-hint-${key}`}>{hint}</small>
          </label>
        ))}
      </div>
      {started && !ready && <p role="status" className="fine">Complete every purchase, sale, shipping, tax, and fee field before reviewing a margin. Enter 0 explicitly when a cost does not apply. Target profit is optional.</p>}
      {ready && !result.valid && <p role="alert" className="fine">{result.reason}</p>}
      {ready && result.valid && (
        <div aria-live="polite" style={{ marginTop: "16px", padding: "14px", border: "1px solid var(--line, #ccc)", borderRadius: "10px" }}>
          <p><strong>Estimated net {result.netProfit >= 0 ? "profit" : "loss"}: {currency.format(result.netProfit)}</strong></p>
          <p>Estimated selling fee: {currency.format(result.sellingFee)}</p>
          <p>Break-even resale price: {currency.format(result.breakEvenSalePrice)}</p>
          <p><strong>Maximum buy price for target profit: {result.maxPurchasePrice >= 0 ? currency.format(result.maxPurchasePrice) : "No feasible nonnegative price"}</strong></p>
          <p className="fine">The maximum buy price assumes all other inputs stay fixed; purchase tax may change with purchase price.</p>
          <p className="fine">
            {result.netProfit < 0
              ? "This scenario loses money. Consider passing unless the assumptions change."
              : "Positive on paper is not a guaranteed sale. Check completed-sale evidence, condition, authenticity, return risk, and how long your money may be tied up."}
          </p>
        </div>
      )}
      <p className="fine" style={{ marginTop: "10px" }}>
        USD scenario estimate; excludes returns, chargebacks, income tax, and other
        possible fees. Marketplace rates vary. Not financial advice.
      </p>
    </section>
  );
}
