import { redirect } from "next/navigation";
import { BRAND_TERMS_PATH } from "@/lib/brand";

export default function TermsAliasPage() {
  redirect(BRAND_TERMS_PATH);
}
