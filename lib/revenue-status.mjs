export function money(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
    : "Not connected";
}

export function numberOrStatus(value, status = "Not connected") {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : status;
}
