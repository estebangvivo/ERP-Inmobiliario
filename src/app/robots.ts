import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/i/", "/propiedades"],
      disallow: [
        "/dashboard",
        "/gestion",
        "/login",
        "/cobros",
        "/contratos",
        "/complejos",
        "/expensas",
        "/mantenimiento",
        "/rendiciones",
        "/usuarios",
        "/leads",
        "/api",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
