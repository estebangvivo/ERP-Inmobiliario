import { redirect } from "next/navigation";
import { BRAND_PRIVACY_PATH } from "@/lib/brand";

export default function PrivacyAliasPage() {
  redirect(BRAND_PRIVACY_PATH);
}
