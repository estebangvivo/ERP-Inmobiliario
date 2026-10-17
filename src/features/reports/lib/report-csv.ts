import { NextResponse } from "next/server";
import { csvResponse } from "@/lib/csv";

function escapeCsv(value: string | number | null | undefined) {
  if (value == null) return "";
  const text = String(value);
  if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Wrapper fino sobre csvResponse para exports del módulo Reportes. */
export function reportCsvResponse(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
) {
  return csvResponse(filename, headers, rows);
}

/** CSV multi-sección: cada bloque tiene título + encabezados propios. */
export function multiSectionCsvResponse(
  filename: string,
  sections: Array<{
    title: string;
    headers: string[];
    rows: Array<Array<string | number | null | undefined>>;
  }>,
) {
  const lines: string[] = [];
  for (const section of sections) {
    if (lines.length) lines.push("");
    lines.push(escapeCsv(section.title));
    lines.push(section.headers.map(escapeCsv).join(";"));
    for (const row of section.rows) {
      lines.push(row.map(escapeCsv).join(";"));
    }
  }
  return new NextResponse(`\uFEFF${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
