import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function OnboardingPagoPage({
  searchParams,
}: {
  searchParams: Promise<{ paymentId?: string; plan?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const payment = params.paymentId
    ? await prisma.billingPayment.findFirst({
        where: { id: params.paymentId, userId: session.user.id },
      })
    : null;

  const settings = await prisma.platformBillingSettings.findUnique({
    where: { id: "default" },
  });

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Pago por transferencia</CardTitle>
          <CardDescription>
            Tu solicitud quedó pendiente de aprobación. Cuando acreditemos el
            pago, tu inmobiliaria quedará activa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {payment && (
            <p>
              Plan: <strong>{payment.plan}</strong> · {String(payment.amount)}{" "}
              {payment.currency}
            </p>
          )}
          {settings && (
            <div className="rounded-md border border-[var(--border)] p-3 text-xs leading-relaxed">
              <p>{settings.transferAccountName}</p>
              <p>CUIT: {settings.transferTaxId}</p>
              <p>
                {settings.transferBankNameArs} · CBU {settings.transferCbuArs}
              </p>
              <p>Alias: {settings.transferAliasArs}</p>
              {settings.transferNotes && <p>{settings.transferNotes}</p>}
            </div>
          )}
          <Link href="/login" className="underline">
            Volver al login
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
