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

export const metadata: Metadata = {
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
