"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { logoutLocal } from "@/features/auth/actions/auth-actions";

const INTERVAL_MS = 45_000;

/** Ping periódico para marcar al usuario como en línea. */
export function PresenceHeartbeat() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function beat() {
      if (cancelled || document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/presence/heartbeat", {
          method: "POST",
          credentials: "same-origin",
        });
        if (res.status === 401 && !cancelled) {
          try {
            await logoutLocal();
          } catch {
            router.replace("/login?reason=session");
          }
        }
      } catch {
        /* silencioso */
      }
    }

    void beat();
    const id = window.setInterval(() => void beat(), INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void beat();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
