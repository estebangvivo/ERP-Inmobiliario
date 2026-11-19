import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

const MANUAL_REL = path.join("docs", "manual", "MANUAL-USUARIO.md");

export function getManualMarkdownPath(): string {
  return path.join(process.cwd(), MANUAL_REL);
}

export function readManualMarkdown(): string {
  const raw = fs.readFileSync(getManualMarkdownPath(), "utf8");
  return raw.replace(/\n## Créditos de capturas[\s\S]*$/m, "\n");
}

export function manualMarkdownForWeb(): string {
  return readManualMarkdown().replace(/\]\(images\//g, "](/manual/images/");
}

export function manualHtmlBody(baseUrl?: string): string {
  const md = readManualMarkdown();
  const origin = (baseUrl ?? "").replace(/\/$/, "");
  const withImages = md.replace(
    /\]\(images\//g,
    origin ? `](${origin}/manual/images/` : "](/manual/images/",
  );
  return marked.parse(withImages, { async: false }) as string;
}

export function buildPrintableManualHtml(
  baseUrl: string,
  options?: { autoPrint?: boolean },
): string {
  const body = manualHtmlBody(baseUrl);
  const updated = new Date().toLocaleDateString("es-AR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const autoPrint = options?.autoPrint
    ? `<script>window.addEventListener("load",()=>{setTimeout(()=>window.print(),250)});</script>`
    : "";
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Manual de usuario — SimpleInmo</title>
  <style>
    :root { color-scheme: light; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      line-height: 1.55;
      color: #111;
      max-width: 48rem;
      margin: 0 auto;
      padding: 2rem 1.25rem 3rem;
    }
    h1 { font-size: 1.85rem; margin-bottom: 0.5rem; }
    h2 {
      font-size: 1.35rem;
      margin-top: 2rem;
      padding-top: 0.75rem;
      border-top: 1px solid #ddd;
    }
    h3 { font-size: 1.1rem; margin-top: 1.25rem; }
    p, li { font-size: 0.98rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
    th { background: #f3f3f3; }
    img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 6px; margin: 0.75rem 0 1.25rem; }
    blockquote { border-left: 3px solid #1f4e5f; margin: 1rem 0; padding: 0.5rem 0.85rem; background: #f7fafb; }
    code { background: #f3f3f3; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
    pre { background: #f3f3f3; padding: 0.75rem 1rem; overflow-x: auto; border-radius: 6px; }
    a { color: #1f4e5f; }
    .meta { color: #555; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      padding: 0.75rem 0 1rem;
      margin: -0.5rem 0 1rem;
      background: rgba(255,255,255,0.95);
      border-bottom: 1px solid #e5e5e5;
    }
    .toolbar button, .toolbar a {
      font-family: system-ui, sans-serif;
      font-size: 0.9rem;
      padding: 0.45rem 0.85rem;
      border-radius: 0.4rem;
      border: 1px solid #1f4e5f;
      background: #1f4e5f;
      color: #fff;
      text-decoration: none;
      cursor: pointer;
    }
    .toolbar a.secondary {
      background: #fff;
      color: #1f4e5f;
    }
    @media print {
      body { padding: 0; max-width: none; }
      a { color: inherit; text-decoration: none; }
      h2 { break-after: avoid; }
      img { break-inside: avoid; }
      .toolbar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button type="button" onclick="window.print()">Imprimir / PDF</button>
    <a class="secondary" href="/api/manual/descargar?format=html">Descargar HTML</a>
    <a class="secondary" href="/api/manual/descargar?format=md">Descargar Markdown</a>
  </div>
  <p class="meta">SimpleInmo · Manual de usuario · Actualizado ${updated}</p>
  ${body}
  ${autoPrint}
</body>
</html>`;
}
