const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function money(value, status = "Not connected") {
  return typeof value === "number" && Number.isFinite(value)
    ? USD_FORMATTER.format(value)
    : status;
}

export function numberOrStatus(value, status = "Not connected") {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US")
    : status;
}
