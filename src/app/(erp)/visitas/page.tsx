import { PageHeader } from "@/components/erp/page-chrome";
import { VisitBookingsTable } from "@/components/erp/visit-bookings-table";
import { listOrganizationVisitBookings } from "@/server/actions/visit-bookings";

export const dynamic = "force-dynamic";

export default async function VisitasPage() {
  const bookings = await listOrganizationVisitBookings();

  return (
    <div>
      <PageHeader
        title="Visitas"
        description="Turnos reservados desde el portal público (lun–vie 8 a 16 hs)."
      />
      <VisitBookingsTable bookings={bookings} />
    </div>
  );
}
