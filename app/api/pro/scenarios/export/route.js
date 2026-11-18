import { proScenarioHandler } from "../../../../../lib/pro-handlers.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) { return proScenarioHandler(request, { csv: true }); }
