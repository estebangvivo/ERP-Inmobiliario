import { requireStaff } from "@/lib/session";
import { buildReceiptPdfResponse } from "@/features/treasury/lib/build-treasury-pdf-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  await requireStaff();
  const { id } = await context.params;
  return buildReceiptPdfResponse(id);
}
