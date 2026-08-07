import Link from "next/link";
import { requireModule } from "@/lib/session";
import { listOpenSupplierInvoices } from "@/features/treasury/queries/account-statements";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/features/treasury/lib/labels";
import { PageHeader } from "@/components/erp/page-chrome";

type PageProps = { params: Promise<{ supplierId: string }> };

export default async function CuentaProveedorPage({ params }: PageProps) {
  const session = await requireModule("tesoreria");
  const { supplierId } = await params;
  const supplier = await prisma.user.findFirst({
    where: {
      id: supplierId,
      supplierInvoices: {
        some: { workOrder: { organizationId: session.organizationId } },
      },
    },
  });
  if (!supplier) {
    return <p>Proveedor no encontrado.</p>;
  }

  const invoices = await listOpenSupplierInvoices({ supplierId });

  return (
    <div className="space-y-6">
      <PageHeader title={supplier.name} description="Facturas con saldo abierto" />
      <ul className="divide-y divide-[var(--border)] border-y">
        {invoices.map((i) => (
          <li key={i.id} className="flex justify-between py-3 text-sm">
            <span>{i.label}</span>
            <span className="tabular-nums">{formatMoney(i.balance, i.currency)}</span>
          </li>
        ))}
      </ul>
      <Link href="/tesoreria/cuentas" className="text-sm text-[var(--primary)]">
        ← Cuentas corrientes
      </Link>
    </div>
  );
}
