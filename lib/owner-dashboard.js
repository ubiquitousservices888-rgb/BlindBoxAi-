import { get, list } from "@vercel/blob";

async function readJsonBlob(pathname) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  try {
    return await new Response(result.stream).json();
  } catch {
    return null;
  }
}

async function readPrefix(prefix, limit = 100) {
  const { blobs } = await list({ prefix, limit });
  const events = await Promise.all(
    blobs.map(async (blob) => {
      const event = await readJsonBlob(blob.pathname);
      return event ? { ...event, pathname: blob.pathname } : null;
    }),
  );
  return events.filter(Boolean);
}

export async function getOwnerDashboardSnapshot() {
  const [clicks, notifications] = await Promise.all([
    readPrefix("affiliate/clicks/", 100),
    readPrefix("owner/notifications/", 100),
  ]);

  clicks.sort((a, b) => String(b.clickedAt).localeCompare(String(a.clickedAt)));
  notifications.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const now = Date.now();
  const last24h = clicks.filter((item) => {
    const time = Date.parse(item.clickedAt || "");
    return Number.isFinite(time) && now - time <= 24 * 60 * 60 * 1000;
  }).length;

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      epnClicksLoaded: clicks.length,
      epnClicksLast24h: last24h,
      notificationsLoaded: notifications.length,
    },
    notifications: notifications.slice(0, 40),
    epnClicks: clicks.slice(0, 60),
  };
}
