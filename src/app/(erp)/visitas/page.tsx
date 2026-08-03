import { PageHeader } from "@/components/erp/page-chrome";
import { VisitBookingsPanel } from "@/components/erp/visit-bookings-panel";
import { VisitScheduleSettings } from "@/components/erp/visit-schedule-settings";
import {
  getVisitScheduleSettings,
  listOrganizationVisitBookings,
  listVisitStaffOptions,
} from "@/server/actions/visit-bookings";

export const dynamic = "force-dynamic";

export default async function VisitasPage() {
  const [bookings, staff, scheduleSettings] = await Promise.all([
    listOrganizationVisitBookings(),
    listVisitStaffOptions(),
    getVisitScheduleSettings(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visitas"
        description={`Turnos del portal (${scheduleSettings.summary}). Asigná un agente y mirá el calendario semanal.`}
      />
      <VisitScheduleSettings initial={scheduleSettings} />
      <VisitBookingsPanel
        bookings={bookings}
        staff={staff}
        schedule={scheduleSettings.schedule}
      />
    </div>
  );
}
