"use client";

import { cn } from "@/lib/utils";

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v|avi)(\?|$)/i.test(url);
}

export function FeatureRequestMediaGallery({
  urls,
  className,
  size = "md",
}: {
  urls: string[];
  className?: string;
  size?: "sm" | "md";
}) {
  if (!urls.length) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {urls.map((url) => {
        const video = isVideoUrl(url);
        return (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "block overflow-hidden rounded-md border border-border bg-black/5",
              size === "sm" ? "w-24" : "w-40",
            )}
          >
            {video ? (
              <video
                src={url}
                className={cn(
                  "w-full object-cover",
                  size === "sm" ? "h-16" : "h-28",
                )}
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt=""
                className={cn(
                  "w-full object-cover",
                  size === "sm" ? "h-16" : "h-28",
                )}
              />
            )}
            <span className="block truncate px-1.5 py-1 text-[10px] text-muted-foreground">
              {video ? "Video" : "Imagen"} · abrir
            </span>
          </a>
        );
      })}
    </div>
  );
}
