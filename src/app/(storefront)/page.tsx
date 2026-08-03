import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandStorefrontChrome } from "@/components/storefront/brand-storefront-chrome";
import { BRAND_LOGO_SRC, BRAND_NAME, BRAND_SLOGAN } from "@/lib/brand";

export default function StorefrontHomePage() {
  return (
    <BrandStorefrontChrome>
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(120deg, rgba(16,40,51,0.94), rgba(31,78,95,0.82)), url(https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1600) center/cover",
        }}
      >
        <div className="mx-auto flex min-h-[70vh] max-w-6xl flex-col justify-center gap-6 px-6 py-24">
          <Image
            src={BRAND_LOGO_SRC}
            alt={BRAND_NAME}
            width={220}
            height={64}
            className="h-12 w-auto object-contain md:h-14"
            priority
          />
          <h1
            className="max-w-2xl text-5xl font-semibold tracking-tight md:text-6xl"
            style={{ color: "#f7fafb" }}
          >
            {BRAND_NAME}
          </h1>
          <p
            className="max-w-xl text-lg md:text-xl"
            style={{ color: "rgba(247,250,251,0.88)" }}
          >
            {BRAND_SLOGAN}
          </p>
          <p
            className="max-w-xl text-sm"
            style={{ color: "rgba(247,250,251,0.72)" }}
          >
            Cada inmobiliaria publica su propio catálogo con un link exclusivo.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/login">
              <Button
                size="lg"
                className="bg-[#f7fafb] text-[#102833] hover:bg-white"
              >
                Ingresar al ERP
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </BrandStorefrontChrome>
  );
}
