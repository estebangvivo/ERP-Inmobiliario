import { NextResponse } from "next/server";

/** Healthcheck para Railway / load balancers. */
export async function GET() {
  return NextResponse.json({ ok: true, service: "simpleinmo" });
}
