import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]",
        secondary:
          "border-transparent bg-[var(--secondary)] text-[var(--secondary-foreground)]",
        outline: "border-[var(--border)] text-[var(--foreground)]",
        success:
          "border-transparent bg-emerald-100 text-emerald-800",
        warning:
          "border-transparent bg-amber-100 text-amber-900",
        danger:
          "border-transparent bg-red-100 text-red-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
