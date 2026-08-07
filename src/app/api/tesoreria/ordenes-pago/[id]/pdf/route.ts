import { requireStaff } from "@/lib/session";
import { buildPaymentOrderPdfResponse } from "@/features/treasury/lib/build-treasury-pdf-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  await requireStaff();
  const { id } = await context.params;
  return buildPaymentOrderPdfResponse(id);
}
