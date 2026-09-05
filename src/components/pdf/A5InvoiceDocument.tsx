import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { InvoicePdfData } from './InvoiceDocument';

const a5Styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 7.5,
    color: '#0F172A',
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 58,
    backgroundColor: '#FFFFFF',
    position: 'relative'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: '#0F172A',
    borderBottomStyle: 'solid',
    paddingBottom: 8,
    marginBottom: 8
  },
  businessInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '65%'
  },
  logo: {
    width: 36,
    height: 36,
    marginRight: 8,
    objectFit: 'contain'
  },
  businessDetails: {
    flexDirection: 'column'
  },
  businessName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#0F172A',
    letterSpacing: -0.2
  },
  businessTagline: {
    fontSize: 7,
    fontFamily: 'Helvetica-Oblique',
    color: '#475569',
    marginTop: 1
  },
  businessText: {
    fontSize: 7,
    color: '#64748B',
    marginTop: 1
  },
  headerRight: {
    alignItems: 'flex-end'
  },
  invoiceBadge: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#047857',
    letterSpacing: 0.5
  },
  invoiceNumber: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: '#0F172A',
    marginTop: 2
  },
  metaText: {
    fontSize: 7,
    color: '#64748B',
    marginTop: 1
  },
  metaTextBold: {
    fontFamily: 'Helvetica-Bold',
    color: '#0F172A'
  },
  billToCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'solid',
    borderRadius: 4,
    padding: 6,
    marginBottom: 8
  },
  billToTitle: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2
  },
  customerName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#0F172A'
  },
  customerText: {
    fontSize: 7,
    color: '#475569',
    marginTop: 1
  },
  table: {
    width: '100%',
    marginBottom: 8
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 2
  },
  tableHeaderCell: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
    textTransform: 'uppercase'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E2E8F0',
    borderBottomStyle: 'solid',
    paddingVertical: 3.5,
    paddingHorizontal: 4,
    alignItems: 'center'
  },
  tableRowEven: {
    backgroundColor: '#F8FAFC'
  },
  colIndex: { width: '6%', textAlign: 'center' },
  colDesc: { width: '44%', textAlign: 'left' },
  colQty: { width: '10%', textAlign: 'center' },
  colPrice: { width: '14%', textAlign: 'right' },
  colDiscount: { width: '12%', textAlign: 'right' },
  colTotal: { width: '14%', textAlign: 'right' },

  tableCell: { fontSize: 7.5, color: '#334155' },
  tableCellMuted: { fontSize: 7, color: '#64748B' },
  tableCellBold: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#0F172A' },
  tableCellDiscount: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#E11D48' },

  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 4,
    marginBottom: 6
  },
  paidStamp: {
    borderWidth: 1.5,
    borderColor: '#059669',
    borderStyle: 'solid',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    transform: 'rotate(-12deg)',
    marginTop: 6,
    marginLeft: 6
  },
  paidStampText: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#059669',
    letterSpacing: 1
  },
  totalsBox: {
    width: 175,
    marginLeft: 'auto',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'solid',
    borderRadius: 4,
    padding: 6
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1.5
  },
  totalRowDiscount: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1.5
  },
  totalRowDivider: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#0F172A',
    borderTopStyle: 'solid',
    paddingTop: 3,
    marginTop: 3
  },
  totalLabel: { fontSize: 7, color: '#475569' },
  totalValue: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#0F172A' },
  grandTotalLabel: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#0F172A' },
  grandTotalValue: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: '#047857' },

  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 8
  },
  stampBox: {
    alignItems: 'center',
    width: 80
  },
  stampImage: {
    width: 36,
    height: 36,
    objectFit: 'contain'
  },
  stampLabel: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#64748B',
    marginTop: 2
  },
  signatureBox: {
    alignItems: 'center',
    width: 90
  },
  signatureImage: {
    width: 55,
    height: 24,
    objectFit: 'contain'
  },
  signatureLabel: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#64748B',
    borderTopWidth: 0.5,
    borderTopColor: '#94A3B8',
    borderTopStyle: 'solid',
    paddingTop: 2,
    marginTop: 2,
    width: '100%',
    textAlign: 'center'
  },

  footer: {
    position: 'absolute',
    bottom: 10,
    left: 16,
    right: 16
  },
  termsContainer: {
    backgroundColor: '#F8FAFC',
    borderWidth: 0.5,
    borderColor: '#CBD5E1',
    borderStyle: 'solid',
    borderRadius: 3,
    padding: 4,
    marginBottom: 3
  },
  termsTitle: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: '#334155',
    textTransform: 'uppercase',
    marginBottom: 1
  },
  termsText: {
    fontSize: 6,
    color: '#475569',
    lineHeight: 1.25
  },
  footerPageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  footerPageNum: {
    fontSize: 6.5,
    color: '#94A3B8'
  }
});

function calculateA5TermsPaddingBottom(termsText?: string): number {
  const text = termsText || '1. Payment due within specified period.\n2. Goods once sold are non-refundable.';
  const lines = text.split('\n');
  let totalLineCount = 0;

  for (const line of lines) {
    const len = line.length;
    if (len === 0) {
      totalLineCount += 0.5;
    } else {
      totalLineCount += Math.max(1, Math.ceil(len / 85));
    }
  }

  const exactHeight = 8 + 6 + (totalLineCount * 7.5) + 10 + 16;
  return Math.max(54, Math.ceil(exactHeight));
}

interface A5InvoiceDocumentProps {
  invoices: InvoicePdfData[];
}

export default function A5InvoiceDocument({ invoices }: A5InvoiceDocumentProps) {
  return (
    <Document title={invoices.length === 1 ? `A5-Invoice-${invoices[0].invoice.invoice_number}` : 'A5-Invoices-Bulk-Export'}>
      {invoices.map((data, pageIdx) => {
        const { invoice, customer, items, businessInfo: bInfo } = data;
        const businessInfo = bInfo || {
          name: 'Qureshi Sharbat & Majoon House',
          tagline: 'Manufacturers of Pure Herbal Sharbats, Majoons & Distillates',
          address: '14-B Industrial Area, Station Road, Gujranwala',
          phone: '+92 300 8889900',
          email: 'orders@qureshisharbat.com',
          currency: 'Rs.'
        };

        const isPaid = invoice.status === 'Paid';
        const hasSignature = !!invoice.signature_url;
        const hasStamp = !!invoice.stamp_url;
        const hasLogo = !!(businessInfo.logo_url && businessInfo.logo_url.trim() !== '');

        const termsPaddingBottom = calculateA5TermsPaddingBottom(invoice.terms_conditions);

        // Financial calculations
        const grossSubtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
        const totalItemDiscounts = items.reduce((sum, item) => {
          if (item.item_discount_type === 'percent') {
            return sum + ((item.quantity * item.unit_price) * (item.item_discount / 100));
          }
          return sum + (item.item_discount || 0);
        }, 0);

        const subtotalAfterItemDiscounts = Math.max(0, grossSubtotal - totalItemDiscounts);
        let overallDiscVal = 0;
        if (invoice.overall_discount_type === 'percent') {
          overallDiscVal = (subtotalAfterItemDiscounts * (invoice.overall_discount || 0)) / 100;
        } else {
          overallDiscVal = invoice.overall_discount || 0;
        }

        const hasOverallDiscount = overallDiscVal > 0;
        const amountAfterDiscount = Math.max(0, subtotalAfterItemDiscounts - overallDiscVal);

        return (
          <Page key={pageIdx} size="A5" style={[a5Styles.page, { paddingBottom: termsPaddingBottom }]}>
            {/* Header Section */}
            <View style={a5Styles.header}>
              <View style={a5Styles.businessInfoContainer}>
                {hasLogo && (
                  <Image src={businessInfo.logo_url!} style={a5Styles.logo} />
                )}
                <View style={a5Styles.businessDetails}>
                  <Text style={a5Styles.businessName}>{businessInfo.name}</Text>
                  {businessInfo.tagline ? (
                    <Text style={a5Styles.businessTagline}>{businessInfo.tagline}</Text>
                  ) : null}
                  {businessInfo.address ? (
                    <Text style={a5Styles.businessText}>{businessInfo.address}</Text>
                  ) : null}
                  {businessInfo.phone ? (
                    <Text style={a5Styles.businessText}>Tel: {businessInfo.phone}</Text>
                  ) : null}
                  {businessInfo.email ? (
                    <Text style={a5Styles.businessText}>Email: {businessInfo.email}</Text>
                  ) : null}
                </View>
              </View>

              {/* Header Right */}
              <View style={a5Styles.headerRight}>
                <Text style={a5Styles.invoiceBadge}>INVOICE</Text>
                <Text style={a5Styles.invoiceNumber}>#{invoice.invoice_number}</Text>
                <Text style={a5Styles.metaText}>
                  Date: <Text style={a5Styles.metaTextBold}>{new Date(invoice.created_at).toLocaleDateString()}</Text>
                </Text>
                {invoice.due_date ? (
                  <Text style={a5Styles.metaText}>
                    Due Date: <Text style={a5Styles.metaTextBold}>{new Date(invoice.due_date).toLocaleDateString()}</Text>
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Bill To Card */}
            <View style={a5Styles.billToCard}>
              <Text style={a5Styles.billToTitle}>Billed To:</Text>
              <Text style={a5Styles.customerName}>{customer?.name || invoice.customer_name || 'Walk-in Customer'}</Text>
              <Text style={a5Styles.customerText}>{customer?.address || invoice.customer_address || 'No address specified'}</Text>
              <Text style={a5Styles.customerText}>Phone: {customer?.phone || invoice.customer_phone || 'N/A'}</Text>
              {(() => {
                const ntn = customer?.ntn_number?.trim();
                const stn = customer?.stn_number?.trim();
                if (!ntn && !stn) return null;
                const taxText = [ntn ? `NTN: ${ntn}` : '', stn ? `STN: ${stn}` : ''].filter(Boolean).join(' | ');
                return <Text style={a5Styles.customerText}>{taxText}</Text>;
              })()}
            </View>

            {/* Itemized Table */}
            <View style={a5Styles.table} wrap={true}>
              <View style={a5Styles.tableHeader} fixed>
                <Text style={[a5Styles.tableHeaderCell, a5Styles.colIndex]}>#</Text>
                <Text style={[a5Styles.tableHeaderCell, a5Styles.colDesc]}>Item Description</Text>
                <Text style={[a5Styles.tableHeaderCell, a5Styles.colQty]}>Qty</Text>
                <Text style={[a5Styles.tableHeaderCell, a5Styles.colPrice]}>Unit Price</Text>
                <Text style={[a5Styles.tableHeaderCell, a5Styles.colDiscount]}>Discount</Text>
                <Text style={[a5Styles.tableHeaderCell, a5Styles.colTotal]}>Total</Text>
              </View>

              {items.map((item, idx) => {
                const isPercent = item.item_discount_type === 'percent';
                const grossLine = item.quantity * item.unit_price;
                const lineDiscVal = isPercent
                  ? grossLine * (item.item_discount / 100)
                  : (item.item_discount || 0);
                const displayLineTotal = item.line_total !== undefined ? item.line_total : Math.max(0, grossLine - lineDiscVal);

                const itemDisplayName = item.product_name || 'Product';
                const pIdPrefix = item.product_id ? `#${item.product_id} - ` : '';
                const fullDescription = item.unit && item.unit.trim() !== ''
                  ? `${pIdPrefix}${itemDisplayName} (${item.unit})`
                  : `${pIdPrefix}${itemDisplayName}`;

                return (
                  <View key={idx} style={[a5Styles.tableRow, idx % 2 === 1 ? a5Styles.tableRowEven : {}]} wrap={false}>
                    <Text style={[a5Styles.tableCellMuted, a5Styles.colIndex]}>{idx + 1}</Text>
                    <Text style={[a5Styles.tableCellBold, a5Styles.colDesc]}>{fullDescription}</Text>
                    <Text style={[a5Styles.tableCellBold, a5Styles.colQty]}>{item.quantity}</Text>
                    <Text style={[a5Styles.tableCell, a5Styles.colPrice]}>
                      {businessInfo.currency} {item.unit_price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={[a5Styles.tableCellDiscount, a5Styles.colDiscount]}>
                      {item.item_discount > 0
                        ? isPercent
                          ? `${item.item_discount}%`
                          : `-${businessInfo.currency} ${item.item_discount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                        : '-'}
                    </Text>
                    <Text style={[a5Styles.tableCellBold, a5Styles.colTotal]}>
                      {businessInfo.currency} {displayLineTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Totals Breakdown */}
            <View style={a5Styles.totalsContainer} wrap={false}>
              {isPaid ? (
                <View style={a5Styles.paidStamp}>
                  <Text style={a5Styles.paidStampText}>PAID</Text>
                </View>
              ) : <View />}

              <View style={a5Styles.totalsBox}>
                <View style={a5Styles.totalRow}>
                  <Text style={a5Styles.totalLabel}>Subtotal:</Text>
                  <Text style={a5Styles.totalValue}>
                    {businessInfo.currency} {subtotalAfterItemDiscounts.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </Text>
                </View>

                {hasOverallDiscount ? (
                  <>
                    <View style={a5Styles.totalRowDiscount}>
                      <Text style={a5Styles.totalLabel}>
                        Bill Discount {invoice.overall_discount_type === 'percent' && invoice.overall_discount > 0 ? `(${invoice.overall_discount}%)` : ''}:
                      </Text>
                      <Text style={a5Styles.tableCellDiscount}>
                        -{businessInfo.currency} {overallDiscVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </Text>
                    </View>

                    <View style={a5Styles.totalRow}>
                      <Text style={a5Styles.totalLabel}>Amount After Discount:</Text>
                      <Text style={a5Styles.totalValue}>
                        {businessInfo.currency} {amountAfterDiscount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </>
                ) : null}

                {invoice.taxes && invoice.taxes.length > 0 ? (
                  invoice.taxes.map((t, i) => (
                    <View style={a5Styles.totalRow} key={i}>
                      <Text style={a5Styles.totalLabel}>{t.label} ({t.rate}%):</Text>
                      <Text style={a5Styles.totalValue}>
                        +{businessInfo.currency} {t.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  ))
                ) : invoice.tax_percent > 0 ? (
                  <View style={a5Styles.totalRow}>
                    <Text style={a5Styles.totalLabel}>Tax ({invoice.tax_percent}%):</Text>
                    <Text style={a5Styles.totalValue}>
                      +{businessInfo.currency} {invoice.tax_amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                ) : null}

                {invoice.include_previous_balance && (invoice.previous_balance || 0) > 0 ? (
                  <View style={a5Styles.totalRow}>
                    <Text style={a5Styles.totalLabel}>Pending Amount:</Text>
                    <Text style={a5Styles.totalValue}>
                      +{businessInfo.currency} {(invoice.previous_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                ) : null}

                <View style={a5Styles.totalRowDivider}>
                  <Text style={a5Styles.grandTotalLabel}>Grand Total:</Text>
                  <Text style={a5Styles.grandTotalValue}>
                    {businessInfo.currency} {invoice.total_amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>
            </View>

            {/* Signature / Stamp */}
            {(hasStamp || hasSignature) ? (
              <View style={a5Styles.signatureRow} wrap={false}>
                <View style={a5Styles.stampBox}>
                  {hasStamp ? (
                    <>
                      <Image src={invoice.stamp_url!} style={a5Styles.stampImage} />
                      <Text style={a5Styles.stampLabel}>Company Seal</Text>
                    </>
                  ) : null}
                </View>

                <View style={a5Styles.signatureBox}>
                  {hasSignature ? (
                    <>
                      <Image src={invoice.signature_url!} style={a5Styles.signatureImage} />
                      <Text style={a5Styles.signatureLabel}>Authorized Signature</Text>
                    </>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Fixed Bottom Footer */}
            <View style={a5Styles.footer} fixed>
              <View style={a5Styles.termsContainer}>
                <Text style={a5Styles.termsTitle}>WARRANTY FORM:</Text>
                <Text style={a5Styles.termsText}>
                  {invoice.terms_conditions || '1. Payment due within specified period.\n2. Goods once sold are non-refundable.'}
                </Text>
              </View>
              <View style={a5Styles.footerPageRow}>
                <Text style={a5Styles.footerPageNum}>{businessInfo.name}</Text>
                <Text
                  style={a5Styles.footerPageNum}
                  render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
                />
              </View>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
