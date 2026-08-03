import { NextResponse } from "next/server";

/** NextAuth deshabilitado — usar /api/auth/login y cookie erp_session. */
export async function GET() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
