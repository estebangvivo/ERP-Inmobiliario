import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isPlatformSuperadminEmail } from "@/features/auth/lib/platform-admin";
import { listMyOrganizations } from "@/features/auth/actions/organization-actions";
import { SelectOrganizationPanel } from "@/features/auth/components/select-organization-panel";

export default async function SelectOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string; pick?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const isSuperadmin = isPlatformSuperadminEmail(session.user.email);

  // Superadmin no elige empresa al entrar: va a /admin.
  // Solo puede abrir el picker con ?pick=1 (opcional, desde el sistema).
  if (isSuperadmin && params.pick !== "1") {
    redirect("/admin");
  }

  const organizations = await listMyOrganizations();

  // Usuarios normales con una sola org: ir directo al dashboard
  if (!isSuperadmin && organizations.length === 1 && params.required !== "1") {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
      <SelectOrganizationPanel
        organizations={organizations}
        isPlatformSuperadmin={isSuperadmin}
        requireChoice={params.required === "1"}
      />
    </div>
  );
}
