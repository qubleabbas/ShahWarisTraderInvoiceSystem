import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { Invoice } from '@/lib/db';

export interface PendingPaymentItem {
  invoice: Invoice;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  cityName?: string;
  pendingAmount: number;
}

export interface CustomerPendingGroup {
  customerId: number;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  cityName?: string;
  items: PendingPaymentItem[];
  customerTotalPending: number;
}

export interface PendingPaymentsDocumentProps {
  customerGroups: CustomerPendingGroup[];
  cityFilterLabel?: string;
  dateFilterLabel?: string;
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  currency?: string;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 28,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#0f172a',
    backgroundColor: '#ffffff'
  },
  header: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#0f172a',
    paddingBottom: 10,
    marginBottom: 12
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  businessLeft: {
    flex: 1,
    paddingRight: 10
  },
  headerRight: {
    alignItems: 'flex-end',
    minWidth: 170
  },
  businessName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    letterSpacing: -0.5
  },
  businessSub: {
    fontSize: 8,
    color: '#475569',
    marginTop: 3,
    lineHeight: 1.3
  },
  docTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#b45309',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'right'
  },
  docMeta: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
    textAlign: 'right'
  },
  summaryBar: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  summaryText: {
    fontSize: 8,
    color: '#334155'
  },
  summaryBold: {
    fontWeight: 'bold',
    color: '#0f172a'
  },
  // Customer Card Block
  customerCard: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
    backgroundColor: '#ffffff'
  },
  customerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 6,
    marginBottom: 6
  },
  customerTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  customerSub: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 1
  },
  // Table
  table: {
    marginVertical: 4
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9'
  },
  tableHead: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#64748b',
    textTransform: 'uppercase'
  },
  tableCell: {
    fontSize: 8,
    color: '#334155'
  },
  tableCellBold: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#b45309'
  },
  tableCellRight: {
    fontSize: 8,
    color: '#334155',
    textAlign: 'right'
  },
  // Subtotal box
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 6,
    marginBottom: 8
  },
  subtotalLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#92400e',
    textTransform: 'uppercase'
  },
  subtotalVal: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#b45309'
  },
  // Handwritten lines
  handwrittenGroup: {
    gap: 6,
    marginTop: 4
  },
  handwrittenLine: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  lineLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#334155',
    width: 100
  },
  blankUnderline: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#94a3b8',
    height: 12,
    marginLeft: 4
  },
  // Grand Total Section
  grandTotalSection: {
    backgroundColor: '#fffbeb',
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    borderRadius: 6,
    padding: 10,
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  grandTotalText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#78350f',
    textTransform: 'uppercase'
  },
  grandTotalVal: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#b45309'
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 15,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 6
  },
  footerText: {
    fontSize: 7,
    color: '#94a3b8'
  }
});

export default function PendingPaymentsDocument({
  customerGroups,
  cityFilterLabel = 'All Cities',
  dateFilterLabel = 'All Dates',
  businessName = 'Qureshi Sharbat & Majoon House',
  businessAddress = '14-B Industrial Area, Station Road, Gujranwala',
  businessPhone = '+92 300 8889900 / +92 55 4231100',
  businessEmail = 'orders@qureshisharbat.com',
  currency = 'Rs.'
}: PendingPaymentsDocumentProps) {
  let totalPendingAmount = 0;
  let totalInvoiceCount = 0;

  customerGroups.forEach((group) => {
    totalPendingAmount += group.customerTotalPending;
    totalInvoiceCount += group.items.length;
  });

  const nowStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <Document title="Pending Payments Sheet">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.businessLeft}>
              <Text style={styles.businessName}>{businessName}</Text>
              <Text style={styles.businessSub}>
                {businessAddress}
                {businessPhone ? `\nPh: ${businessPhone}` : ''}{businessEmail ? ` | Email: ${businessEmail}` : ''}
              </Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.docTitle}>Pending Payments Sheet</Text>
              <Text style={styles.docMeta}>Print Date: {nowStr}</Text>
            </View>
          </View>
        </View>

        {/* Filter Summary */}
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>
            City Filter: <Text style={styles.summaryBold}>{cityFilterLabel}</Text> | Date Filter: <Text style={styles.summaryBold}>{dateFilterLabel}</Text>
          </Text>
          <Text style={styles.summaryText}>
            Customers: <Text style={styles.summaryBold}>{customerGroups.length}</Text> | Invoices: <Text style={styles.summaryBold}>{totalInvoiceCount}</Text>
          </Text>
        </View>

        {/* Customer Blocks */}
        {customerGroups.map((group, gIdx) => (
          <View key={group.customerId || gIdx} style={styles.customerCard} wrap={false}>
            {/* Customer Header */}
            <View style={styles.customerHeader}>
              <View>
                <Text style={styles.customerTitle}>{group.customerName}</Text>
                <Text style={styles.customerSub}>
                  City: {group.cityName || 'N/A'} {group.customerPhone ? `| Ph: ${group.customerPhone}` : ''} {group.customerAddress ? `| ${group.customerAddress}` : ''}
                </Text>
              </View>
              <Text style={styles.subtotalVal}>
                Pending: {currency} {group.customerTotalPending.toLocaleString()}
              </Text>
            </View>

            {/* Customer Pending Invoices Table */}
            <View style={styles.table}>
              <View style={[styles.tableRow, { borderBottomWidth: 1, borderBottomColor: '#cbd5e1' }]}>
                <Text style={[styles.tableHead, { flex: 2 }]}>Invoice #</Text>
                <Text style={[styles.tableHead, { flex: 2 }]}>Invoice Date</Text>
                <Text style={[styles.tableHead, { flex: 2, textAlign: 'right' }]}>Grand Total</Text>
                <Text style={[styles.tableHead, { flex: 2, textAlign: 'right' }]}>Pending Amount</Text>
              </View>
              {group.items.map((item, iIdx) => {
                const invDate = new Date(item.invoice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                return (
                  <View key={item.invoice.id || iIdx} style={styles.tableRow}>
                    <Text style={[styles.tableCell, { flex: 2, fontWeight: 'bold' }]}>{item.invoice.invoice_number}</Text>
                    <Text style={[styles.tableCell, { flex: 2 }]}>{invDate}</Text>
                    <Text style={[styles.tableCellRight, { flex: 2 }]}>{currency} {item.invoice.total_amount.toLocaleString()}</Text>
                    <Text style={[styles.tableCellBold, { flex: 2, textAlign: 'right' }]}>{currency} {item.pendingAmount.toLocaleString()}</Text>
                  </View>
                );
              })}
            </View>

            {/* Customer Subtotal Box */}
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Customer Total Outstanding Balance</Text>
              <Text style={styles.subtotalVal}>{currency} {group.customerTotalPending.toLocaleString()}</Text>
            </View>

            {/* Handwritten Entry Lines */}
            <View style={styles.handwrittenGroup}>
              <View style={styles.handwrittenLine}>
                <Text style={styles.lineLabel}>Received Payment:</Text>
                <View style={styles.blankUnderline} />
              </View>
              <View style={styles.handwrittenLine}>
                <Text style={styles.lineLabel}>Remaining Payment:</Text>
                <View style={styles.blankUnderline} />
              </View>
            </View>
          </View>
        ))}

        {/* Sheet Grand Total Section */}
        <View style={styles.grandTotalSection} wrap={false}>
          <Text style={styles.grandTotalText}>Total Pending Amount (All Selected Invoices)</Text>
          <Text style={styles.grandTotalVal}>{currency} {totalPendingAmount.toLocaleString()}</Text>
        </View>

        {/* Signature & Page Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Collection Agent Signature: __________________</Text>
          <Text style={styles.footerText}>Customer Signature: __________________</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
