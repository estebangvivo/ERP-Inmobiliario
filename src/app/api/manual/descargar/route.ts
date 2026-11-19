import { NextRequest, NextResponse } from "next/server";
import {
  buildPrintableManualHtml,
  readManualMarkdown,
} from "@/lib/manual";
import { requireModule } from "@/lib/session";

export const dynamic = "force-dynamic";

function appOrigin(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  await requireModule("manual");

  const format = (request.nextUrl.searchParams.get("format") ?? "html")
    .trim()
    .toLowerCase();
  const inline = request.nextUrl.searchParams.get("inline") === "1";
  const autoPrint = request.nextUrl.searchParams.get("print") === "1";

  if (format === "md" || format === "markdown") {
    const md = readManualMarkdown();
    return new NextResponse(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="Manual-SimpleInmo.md"',
        "Cache-Control": "no-store",
      },
    });
  }

  const html = buildPrintableManualHtml(appOrigin(request), { autoPrint });
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": inline
        ? 'inline; filename="Manual-SimpleInmo.html"'
        : 'attachment; filename="Manual-SimpleInmo.html"',
      "Cache-Control": "no-store",
    },
  });
}
