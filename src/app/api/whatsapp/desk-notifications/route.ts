import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hasModule } from "@/features/auth/lib/modules";
import { isStaffRole } from "@/lib/session";
import { getDeskInboxSnapshot } from "@/features/whatsapp/services/desk-chat-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (
    !session?.organizationId ||
    !isStaffRole(session.organizationRole) ||
    (session.organizationRole !== "ADMIN" &&
      !hasModule(session.allowedModules, "whatsapp"))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getDeskInboxSnapshot(
    session.organizationId,
    session.user.id,
  );
  return NextResponse.json(snapshot);
}
