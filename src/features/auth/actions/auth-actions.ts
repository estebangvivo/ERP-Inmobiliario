"use server";

import { redirect } from "next/navigation";
import { clearLocalSessionCookie } from "@/features/auth/lib/session";

export async function logoutLocal(): Promise<void> {
  await clearLocalSessionCookie();
  redirect("/login");
}
