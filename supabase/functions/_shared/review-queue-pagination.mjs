export const REVIEW_QUEUE_OVERFLOW_ERROR = "Review queue exceeds safe pagination bound";

export async function collectPaginatedRows({ pageSize, maxPages, fetchPage }) {
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new TypeError("pageSize must be a positive integer");
  if (!Number.isInteger(maxPages) || maxPages <= 0) throw new TypeError("maxPages must be a positive integer");
  if (typeof fetchPage !== "function") throw new TypeError("fetchPage must be a function");

  const items = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const pageItems = await fetchPage(from, to);
    if (!Array.isArray(pageItems)) throw new TypeError("Review queue page fetch must return an array");
    items.push(...pageItems);
    if (pageItems.length < pageSize) return items;
  }

  throw new Error(REVIEW_QUEUE_OVERFLOW_ERROR);
}
