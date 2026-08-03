"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type ImageItem = { id: string; url: string; alt: string | null };

export function PropertyGallery({
  images,
  title,
}: {
  images: ImageItem[];
  title: string;
}) {
  const items =
    images.length > 0
      ? images
      : [
          {
            id: "fallback",
            url: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1600",
            alt: title,
          },
        ];
  const [active, setActive] = useState(0);

  return (
    <div className="space-y-3">
      <div
        className="aspect-[16/10] overflow-hidden rounded-xl bg-cover bg-center"
        style={{ backgroundImage: `url(${items[active]?.url})` }}
        role="img"
        aria-label={items[active]?.alt ?? title}
      />
      {items.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto">
          {items.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "h-16 w-24 shrink-0 rounded-md bg-cover bg-center border-2",
                i === active ? "border-[var(--primary)]" : "border-transparent opacity-80",
              )}
              style={{ backgroundImage: `url(${img.url})` }}
              aria-label={`Foto ${i + 1}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
