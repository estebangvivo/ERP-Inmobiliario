import { PageHeader } from "@/components/erp/page-chrome";
import { ComplexForm } from "@/components/erp/complex-form";
import { requireStaff } from "@/lib/session";

export default async function NuevoComplejoPage() {
  await requireStaff();
  return (
    <div>
      <PageHeader title="Nuevo complejo" description="Alta de edificio o complejo." />
      <ComplexForm mode="create" />
    </div>
  );
}
