import { proAuthHandler, proSignoutHandler } from "../../../../lib/pro-handlers.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = proAuthHandler;
export const DELETE = proSignoutHandler;
