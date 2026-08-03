"use client";

import { useTransition } from "react";
import { toggleUserActiveAction } from "@/server/actions/users";
import { Button } from "@/components/ui/button";

export function ToggleUserButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(() => {
          void toggleUserActiveAction(id);
        })
      }
    >
      {isActive ? "Desactivar" : "Activar"}
    </Button>
  );
}
