import { NextResponse } from "next/server";

function escapeCsv(value: string | number | null | undefined) {
  if (value == null) return "";
  const text = String(value);
  if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvResponse(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
) {
  const lines = [headers, ...rows].map((row) =>
    row.map(escapeCsv).join(";"),
  );
  return new NextResponse(`\uFEFF${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
