import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";

function clean(value, max = 120) {
  return String(value ?? "").replace(/[^a-zA-Z0-9._:/-]/g, "-").slice(0, max);
}

export async function recordFunnelEvent(event, options = {}) {
  const now = options.now ?? new Date();
  const occurredAt = event.occurredAt ? new Date(event.occurredAt) : now;
  if (!Number.isFinite(occurredAt.getTime())) throw new Error("Invalid funnel event timestamp");
  const date = occurredAt.toISOString().slice(0, 10);
  const eventId = options.eventId || randomUUID().replaceAll("-", "");
  const name = clean(event.event, 60);
  if (!name) throw new Error("Funnel event name is required");
  const body = {
    schemaVersion: 1,
    namespace: "production",
    test: false,
    status: event.status || "observed",
    occurredAt: occurredAt.toISOString(),
    ...event,
    namespace: "production",
    test: false,
    piiStored: false,
  };
  const pathname = `funnel/events/${date}/${name}/${clean(eventId, 100)}.json`;
  await put(pathname, JSON.stringify(body, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: false,
  });
  return { pathname, event: body };
}
