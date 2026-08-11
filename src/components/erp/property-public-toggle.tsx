"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { togglePropertyPublicAction } from "@/server/actions/properties";

export function PropertyPublicToggle({
  propertyId,
  listedPublic,
}: {
  propertyId: string;
  listedPublic: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={listedPublic}
        disabled={pending}
        className="h-4 w-4"
        onChange={(e) => {
          const next = e.target.checked;
          start(async () => {
            await togglePropertyPublicAction(propertyId, next);
            router.refresh();
          });
        }}
      />
      <span className={listedPublic ? "font-medium" : "text-[var(--muted-foreground)]"}>
        {listedPublic ? "En portal" : "No publicar"}
      </span>
    </label>
  );
}
