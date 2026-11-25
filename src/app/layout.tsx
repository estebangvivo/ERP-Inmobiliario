import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BRAND_NAME, BRAND_SLOGAN } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://simpleinmo.com";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: BRAND_NAME,
    template: `%s · ${BRAND_NAME}`,
  },
  description: BRAND_SLOGAN,
  applicationName: BRAND_NAME,
  icons: {
    icon: [{ url: "/brand/simpleinmo-icon.png", type: "image/png" }],
    shortcut: "/brand/simpleinmo-icon.png",
    apple: "/brand/simpleinmo-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: BRAND_NAME,
    title: BRAND_NAME,
    description: BRAND_SLOGAN,
    images: [{ url: "/brand/simpleinmo-logo.png", alt: BRAND_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_NAME,
    description: BRAND_SLOGAN,
    images: ["/brand/simpleinmo-logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
