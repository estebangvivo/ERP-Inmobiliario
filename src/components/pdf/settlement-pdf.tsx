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
    marginBottom: 24,
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottom: "0.5pt solid #ebe6de",
  },
  rowLabel: { flex: 1, paddingRight: 8 },
  rowAmount: { width: 100, textAlign: "right" },
  negative: { color: "#b42318" },
  summary: {
    marginTop: 20,
    padding: 12,
    backgroundColor: "#f3f1ec",
    borderRadius: 4,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  net: {
    marginTop: 8,
    fontSize: 13,
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

export type SettlementPdfData = {
  code: string;
  ownerName: string;
  ownerEmail: string;
  periodMonth: number;
  periodYear: number;
  currency: string;
  grossRent: string;
  commissionAmount: string;
  deductionsAmount: string;
  extraordinaryAmount: string;
  netPayout: string;
  bankAlias?: string | null;
  bankCbu?: string | null;
  lines: { concept: string; amount: string; negative: boolean }[];
};

function formatMoneyLabel(amount: string, currency: string) {
  const n = Number(amount);
  return `${currency} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SettlementPdfDocument({ data }: { data: SettlementPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>SimpleInmo</Text>
          <Text style={styles.title}>Liquidación de alquiler</Text>
          <Text style={styles.muted}>{data.code}</Text>
          <Text style={styles.muted}>
            Período {data.periodMonth}/{data.periodYear}
          </Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>
            Propietario
          </Text>
          <Text>{data.ownerName}</Text>
          <Text style={styles.muted}>{data.ownerEmail}</Text>
          {data.bankAlias ? (
            <Text style={styles.muted}>Alias: {data.bankAlias}</Text>
          ) : null}
          {data.bankCbu ? (
            <Text style={styles.muted}>CBU: {data.bankCbu}</Text>
          ) : null}
        </View>

        <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 8 }}>
          Detalle
        </Text>
        {data.lines.length === 0 ? (
          <Text style={styles.muted}>Sin movimientos en el período.</Text>
        ) : (
          data.lines.map((line, i) => (
            <View key={`${line.concept}-${i}`} style={styles.row}>
              <Text style={styles.rowLabel}>{line.concept}</Text>
              <Text
                style={[
                  styles.rowAmount,
                  line.negative ? styles.negative : {},
                ]}
              >
                {formatMoneyLabel(line.amount, data.currency)}
              </Text>
            </View>
          ))
        )}

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text>Alquiler bruto</Text>
            <Text>{formatMoneyLabel(data.grossRent, data.currency)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>Honorarios</Text>
            <Text style={styles.negative}>
              -{formatMoneyLabel(data.commissionAmount, data.currency)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>Reparaciones deducibles</Text>
            <Text style={styles.negative}>
              -{formatMoneyLabel(data.deductionsAmount, data.currency)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text>Expensas extraordinarias</Text>
            <Text style={styles.negative}>
              -{formatMoneyLabel(data.extraordinaryAmount, data.currency)}
            </Text>
          </View>
          <View style={styles.net}>
            <Text>Neto a pagar</Text>
            <Text>{formatMoneyLabel(data.netPayout, data.currency)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Documento generado automáticamente por SimpleInmo. No constituye
          factura fiscal.
        </Text>
      </Page>
    </Document>
  );
}
