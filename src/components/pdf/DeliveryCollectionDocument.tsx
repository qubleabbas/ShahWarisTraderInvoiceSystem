import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { Invoice, InvoiceItem } from '@/lib/db';

export interface DeliverySheetItem {
  invoice: Invoice;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  cityName?: string;
  items?: InvoiceItem[];
}

export interface DeliveryCollectionDocumentProps {
  sheetItems: DeliverySheetItem[];
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
    color: '#047857',
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
  // Invoice Block
  invoiceCard: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
    backgroundColor: '#ffffff'
  },
  invoiceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
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
  invMetaRight: {
    alignItems: 'flex-end'
  },
  invNumber: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#047857'
  },
  invDate: {
    fontSize: 8,
    color: '#64748b'
  },
  // Details grid
  detailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 4
  },
  grandTotalBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    padding: 6,
    alignItems: 'center',
    minWidth: 110
  },
  grandTotalLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#475569',
    textTransform: 'uppercase'
  },
  grandTotalVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 2
  },
  // Status & Handwritten Lines
  statusContainer: {
    flex: 1,
    marginLeft: 16
  },
  paidBadge: {
    backgroundColor: '#d1fae5',
    borderColor: '#059669',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start'
  },
  paidText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#065f46',
    textTransform: 'uppercase'
  },
  handwrittenGroup: {
    gap: 8
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
  // Line items summary table inside card
  itemsTable: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 6
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2
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
  tableCellRight: {
    fontSize: 8,
    color: '#334155',
    textAlign: 'right'
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

export default function DeliveryCollectionDocument({
  sheetItems,
  cityFilterLabel = 'All Cities',
  dateFilterLabel = 'Today',
  businessName = 'Qureshi Sharbat & Majoon House',
  businessAddress = '14-B Industrial Area, Station Road, Gujranwala',
  businessPhone = '+92 300 8889900 / +92 55 4231100',
  businessEmail = 'orders@qureshisharbat.com',
  currency = 'Rs.'
}: DeliveryCollectionDocumentProps) {
  const totalAmount = sheetItems.reduce((sum, item) => sum + (item.invoice.total_amount || 0), 0);
  const nowStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <Document title="Delivery & Collection Sheet">
      <Page size="A4" style={styles.page}>
        {/* Document Header */}
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
              <Text style={styles.docTitle}>Delivery & Collection Sheet</Text>
              <Text style={styles.docMeta}>Print Date: {nowStr}</Text>
            </View>
          </View>
        </View>

        {/* Filter & Summary Bar */}
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>
            City Filter: <Text style={styles.summaryBold}>{cityFilterLabel}</Text> | Date Filter: <Text style={styles.summaryBold}>{dateFilterLabel}</Text>
          </Text>
          <Text style={styles.summaryText}>
            Invoices Listed: <Text style={styles.summaryBold}>{sheetItems.length}</Text> | Total Value: <Text style={styles.summaryBold}>{currency} {totalAmount.toLocaleString()}</Text>
          </Text>
        </View>

        {/* Invoice Cards */}
        {sheetItems.map((item, idx) => {
          const isPaid = item.invoice.status.toLowerCase() === 'paid';
          const invDate = new Date(item.invoice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

          return (
            <View key={item.invoice.id || idx} style={styles.invoiceCard} wrap={false}>
              {/* Card Header */}
              <View style={styles.invoiceCardHeader}>
                <View>
                  <Text style={styles.customerTitle}>{item.customerName}</Text>
                  <Text style={styles.customerSub}>
                    City: {item.cityName || 'N/A'} {item.customerPhone ? `| Ph: ${item.customerPhone}` : ''} {item.customerAddress ? `| ${item.customerAddress}` : ''}
                  </Text>
                </View>

                <View style={styles.invMetaRight}>
                  <Text style={styles.invNumber}>{item.invoice.invoice_number}</Text>
                  <Text style={styles.invDate}>Date: {invDate}</Text>
                </View>
              </View>

              {/* Details & Handwritten Lines */}
              <View style={styles.detailsGrid}>
                {/* Grand Total Box */}
                <View style={styles.grandTotalBox}>
                  <Text style={styles.grandTotalLabel}>Grand Total</Text>
                  <Text style={styles.grandTotalVal}>
                    {currency} {item.invoice.total_amount.toLocaleString()}
                  </Text>
                </View>

                {/* Status or Handwritten Lines */}
                <View style={styles.statusContainer}>
                  {isPaid ? (
                    <View style={styles.paidBadge}>
                      <Text style={styles.paidText}>Paid in Full</Text>
                    </View>
                  ) : (
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
                  )}
                </View>
              </View>
            </View>
          );
        })}

        {/* Signature & Page Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Delivery Person Signature: __________________</Text>
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
