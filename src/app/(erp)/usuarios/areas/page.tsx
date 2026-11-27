import Link from "next/link";
import { requireOrgAdmin } from "@/lib/session";
import { listAreas } from "@/features/auth/actions/area-actions";
import { AreasAdminPanel } from "@/features/auth/components/areas-admin-panel";
import { PageHeader } from "@/components/erp/page-chrome";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AreasPage() {
  await requireOrgAdmin();
  const areas = await listAreas();

  return (
    <div>
      <PageHeader
        title="Áreas"
        description="Áreas de la inmobiliaria. Cada agente puede pertenecer a una; el chatbot de WhatsApp deriva a esa persona cuando consultan por el área."
        actions={
          <Link href="/usuarios">
            <Button variant="outline">Volver a usuarios</Button>
          </Link>
        }
      />
      <AreasAdminPanel areas={areas} />
    </div>
  );
}
