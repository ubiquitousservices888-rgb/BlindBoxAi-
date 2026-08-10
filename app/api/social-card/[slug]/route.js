import { ImageResponse } from "next/og.js";
import { jsxs, jsx } from "react/jsx-runtime";
import { getSeries } from "../../../../lib/data";

export const runtime = "nodejs";

const ink = "#16181C";
const paper = "#F1F3EE";
const verify = "#0E7C66";
const muted = "#5E635C";
const line = "#C9CEC3";

function Curve({ y, opacity = 0.18 }) {
  return jsx("svg", {
    width: 1080,
    height: 180,
    viewBox: "0 0 1080 180",
    style: { position: "absolute", left: 0, top: y, opacity },
    children: jsx("path", {
      d: "M-80 92 C 120 8, 280 176, 500 92 S 880 8, 1160 92",
      fill: "none",
      stroke: verify,
      strokeWidth: 3,
    }),
  });
}

export async function GET(_request, context) {
  const { slug } = await context.params;
  const series = getSeries(slug);
  if (!series?.name || !series?.brand) return new Response("Series not found", { status: 404 });

  return new ImageResponse(
    jsxs("div", {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        flexDirection: "column",
        justifyContent: "space-between",
        background: paper,
        color: ink,
        padding: "86px 84px 76px",
        overflow: "hidden",
      },
      children: [
        jsx("div", { style: { position: "absolute", left: 0, top: 0, bottom: 0, width: 20, background: verify } }),
        jsx(Curve, { y: 110, opacity: 0.14 }),
        jsx(Curve, { y: 275, opacity: 0.09 }),
        jsx(Curve, { y: 930, opacity: 0.12 }),
        jsx("div", { style: { position: "absolute", right: -170, top: 310, width: 560, height: 560, borderRadius: "50%", border: `2px solid ${line}`, opacity: 0.65 } }),
        jsx("div", { style: { position: "absolute", right: -105, top: 375, width: 430, height: 430, borderRadius: "50%", border: `2px solid ${verify}`, opacity: 0.28 } }),
        jsxs("div", {
          style: { display: "flex", flexDirection: "column", position: "relative" },
          children: [
            jsxs("div", {
              style: { display: "flex", alignItems: "center", gap: 16 },
              children: [
                jsx("div", { style: { width: 44, height: 8, borderRadius: 99, background: verify } }),
                jsx("div", { style: { fontSize: 25, fontWeight: 700, letterSpacing: 5, color: verify, textTransform: "uppercase" }, children: "BlindBoxAI / Collector Reference" }),
              ],
            }),
            jsx("div", { style: { marginTop: 84, maxWidth: 820, fontSize: 32, letterSpacing: 2.8, textTransform: "uppercase", color: muted, fontWeight: 700 }, children: series.brand }),
            jsx("div", { style: { marginTop: 24, maxWidth: 860, fontSize: series.name.length > 38 ? 78 : 92, lineHeight: 0.98, letterSpacing: -4, fontWeight: 800 }, children: series.name }),
            jsx("div", { style: { marginTop: 46, width: 180, borderTop: `3px solid ${verify}` } }),
            jsx("div", { style: { marginTop: 34, maxWidth: 660, fontSize: 34, lineHeight: 1.35, color: muted, fontWeight: 500 }, children: "Research first. Collect smarter. Keep verified facts separate from the hype." }),
          ],
        }),
        jsxs("div", {
          style: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", position: "relative", paddingTop: 34, borderTop: `2px solid ${line}` },
          children: [
            jsxs("div", {
              style: { display: "flex", flexDirection: "column", gap: 8 },
              children: [
                jsx("div", { style: { fontSize: 27, fontWeight: 800 }, children: "blindboxai.com" }),
                jsx("div", { style: { fontSize: 21, color: muted }, children: "Independent collector research" }),
              ],
            }),
            jsx("div", { style: { display: "flex", border: `2px solid ${verify}`, color: verify, borderRadius: 999, padding: "13px 22px", fontSize: 20, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }, children: "Daily guide" }),
          ],
        }),
      ],
    }),
    {
      width: 1080,
      height: 1350,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
    },
  );
}
