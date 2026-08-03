import { redirect } from "next/navigation";
import { getSession, hasOrganization } from "@/lib/auth";
import { isPlatformSuperadminEmail } from "@/features/auth/lib/platform-admin";
import { PlansSignupView } from "@/features/billing/components/plans-signup-view";

export default async function OnboardingPlanesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (isPlatformSuperadminEmail(session.user.email) && !session.organizationId) {
    redirect("/admin");
  }
  if (hasOrganization(session)) redirect("/dashboard");

  return <PlansSignupView />;
}
