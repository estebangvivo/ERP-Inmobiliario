import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1c2430",
  },
  header: {
    marginBottom: 20,
    borderBottom: "1pt solid #d7d0c5",
    paddingBottom: 12,
  },
  brand: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#1f4e5f",
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  muted: { color: "#5b6573", marginBottom: 2 },
  section: { marginBottom: 14 },
  label: { fontFamily: "Helvetica-Bold", marginBottom: 4 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottom: "0.5pt solid #ebe6de",
  },
  totalBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#f3f1ec",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  totalStrong: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#5b6573",
    borderTop: "0.5pt solid #d7d0c5",
    paddingTop: 8,
  },
});

export type RentReceiptPdfData = {
  receiptCode: string;
  documentTitle: string;
  contractCode: string;
  propertyTitle: string;
  propertyAddress: string;
  tenantName: string;
  periodMonth: number;
  periodYear: number;
  periodLabel?: string;
  dueDate: string;
  currency: string;
  rentAmount: string;
  contractServicesAmount: string;
  expensesAmount: string;
  lateFeeAmount: string;
  otherAmount: string;
  commissionAmount: string;
  totalAmount: string;
  paidAmount: string;
  status: string;
  serviceLines?: { concept: string; amount: string }[];
  payments: {
    paidAt: string;
    method: string;
    amount: string;
    reference?: string | null;
  }[];
};

function money(amount: string, currency: string) {
  const n = Number(amount);
  return `${currency} ${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function RentReceiptPdfDocument({ data }: { data: RentReceiptPdfData }) {
  const balance = Number(data.totalAmount) - Number(data.paidAmount);
  const isServices = Boolean(data.serviceLines?.length);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>SimpleInmo</Text>
          <Text style={styles.title}>{data.documentTitle}</Text>
          <Text style={styles.muted}>{data.receiptCode}</Text>
          <Text style={styles.muted}>
            {data.periodLabel ??
              `Período ${data.periodMonth}/${data.periodYear}`}{" "}
            · Vence {data.dueDate}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Contrato</Text>
          <Text>{data.contractCode}</Text>
          <Text style={styles.muted}>{data.propertyTitle}</Text>
          <Text style={styles.muted}>{data.propertyAddress}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Inquilino</Text>
          <Text>{data.tenantName}</Text>
          <Text style={styles.muted}>Estado: {data.status}</Text>
        </View>

        <Text style={styles.label}>Conceptos</Text>
        {isServices ? (
          data.serviceLines!.map((line) => (
            <View key={line.concept} style={styles.row}>
              <Text>{line.concept}</Text>
              <Text>{money(line.amount, data.currency)}</Text>
            </View>
          ))
        ) : (
          <>
            <View style={styles.row}>
              <Text>Alquiler</Text>
              <Text>{money(data.rentAmount, data.currency)}</Text>
            </View>
            <View style={styles.row}>
              <Text>Expensas</Text>
              <Text>{money(data.expensesAmount, data.currency)}</Text>
            </View>
            {Number(data.commissionAmount) > 0 ? (
              <View style={styles.row}>
                <Text>Honorarios inmobiliarios</Text>
                <Text>{money(data.commissionAmount, data.currency)}</Text>
              </View>
            ) : null}
          </>
        )}
        <View style={styles.row}>
          <Text>Intereses por mora</Text>
          <Text>{money(data.lateFeeAmount, data.currency)}</Text>
        </View>
        {Number(data.otherAmount) > 0 ? (
          <View style={styles.row}>
            <Text>Otros</Text>
            <Text>{money(data.otherAmount, data.currency)}</Text>
          </View>
        ) : null}

        <View style={styles.totalBox}>
          <View style={styles.totalRow}>
            <Text>Total</Text>
            <Text>{money(data.totalAmount, data.currency)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Pagado</Text>
            <Text>{money(data.paidAmount, data.currency)}</Text>
          </View>
          <View style={styles.totalStrong}>
            <Text>Saldo</Text>
            <Text>{money(String(balance), data.currency)}</Text>
          </View>
        </View>

        {data.payments.length > 0 ? (
          <View style={{ marginTop: 18 }}>
            <Text style={styles.label}>Pagos registrados</Text>
            {data.payments.map((p, i) => (
              <View key={`${p.paidAt}-${i}`} style={styles.row}>
                <Text>
                  {p.paidAt} · {p.method}
                  {p.reference ? ` · ${p.reference}` : ""}
                </Text>
                <Text>{money(p.amount, data.currency)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.footer}>
          Comprobante generado por SimpleInmo. Conservalo como constancia
          de pago / estado de cuenta del período.
        </Text>
      </Page>
    </Document>
  );
}
