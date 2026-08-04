import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { requireModule } from "@/lib/session";

export const dynamic = "force-dynamic";

function loadManualHtml(): string {
  const filePath = path.join(process.cwd(), "docs", "manual", "MANUAL-USUARIO.md");
  const raw = fs.readFileSync(filePath, "utf8");
  // Quitar el bloque de "créditos de capturas / regenerar script" del final (uso interno).
  const withoutDevNotes = raw.replace(
    /\n## Créditos de capturas[\s\S]*$/m,
    "\n",
  );
  const withPublicImages = withoutDevNotes.replace(
    /\]\(images\//g,
    "](/manual/images/",
  );
  return marked.parse(withPublicImages, { async: false }) as string;
}

export default async function ManualPage() {
  await requireModule("manual");
  const html = loadManualHtml();

  return (
    <div className="mx-auto max-w-3xl">
      <article
        className="manual-prose rounded-xl border border-[var(--border)] bg-[var(--card)] px-6 py-8 sm:px-10"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style>{`
        .manual-prose h1 {
          font-size: 1.75rem;
          font-weight: 600;
          letter-spacing: -0.02em;
          margin-bottom: 0.75rem;
        }
        .manual-prose h2 {
          font-size: 1.35rem;
          font-weight: 600;
          margin-top: 2rem;
          margin-bottom: 0.75rem;
          padding-top: 0.5rem;
          border-top: 1px solid var(--border);
        }
        .manual-prose h3 {
          font-size: 1.05rem;
          font-weight: 600;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .manual-prose p,
        .manual-prose li {
          font-size: 0.95rem;
          line-height: 1.65;
          color: var(--foreground);
        }
        .manual-prose p { margin-bottom: 0.85rem; }
        .manual-prose ul, .manual-prose ol {
          margin: 0.5rem 0 1rem 1.25rem;
        }
        .manual-prose li { margin-bottom: 0.35rem; }
        .manual-prose blockquote {
          margin: 1rem 0;
          padding: 0.75rem 1rem;
          border-left: 3px solid var(--primary);
          background: var(--muted);
          color: var(--muted-foreground);
          border-radius: 0 0.5rem 0.5rem 0;
        }
        .manual-prose table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0 1.5rem;
          font-size: 0.9rem;
        }
        .manual-prose th,
        .manual-prose td {
          border: 1px solid var(--border);
          padding: 0.5rem 0.75rem;
          text-align: left;
          vertical-align: top;
        }
        .manual-prose th {
          background: var(--muted);
          font-weight: 600;
        }
        .manual-prose img {
          display: block;
          width: 100%;
          max-width: 100%;
          height: auto;
          margin: 1rem 0 1.5rem;
          border: 1px solid var(--border);
          border-radius: 0.75rem;
          background: var(--muted);
        }
        .manual-prose code {
          font-size: 0.85em;
          padding: 0.1em 0.35em;
          border-radius: 0.25rem;
          background: var(--muted);
        }
        .manual-prose pre {
          overflow-x: auto;
          padding: 0.85rem 1rem;
          margin: 0.75rem 0 1.25rem;
          border-radius: 0.5rem;
          background: var(--muted);
          font-size: 0.85rem;
        }
        .manual-prose a {
          color: var(--primary);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .manual-prose hr {
          border: none;
          border-top: 1px solid var(--border);
          margin: 1.5rem 0;
        }
      `}</style>
    </div>
  );
}
