import { PageHeader } from "@/components/erp/page-chrome";
import { VisitBookingsPanel } from "@/components/erp/visit-bookings-panel";
import {
  listOrganizationVisitBookings,
  listVisitStaffOptions,
} from "@/server/actions/visit-bookings";

export const dynamic = "force-dynamic";

export default async function VisitasPage() {
  const [bookings, staff] = await Promise.all([
    listOrganizationVisitBookings(),
    listVisitStaffOptions(),
  ]);

  return (
    <div>
      <PageHeader
        title="Visitas"
        description="Turnos del portal (lun–vie 8 a 16 hs). Asigná un agente y mirá el calendario semanal."
      />
      <VisitBookingsPanel bookings={bookings} staff={staff} />
    </div>
  );
}
