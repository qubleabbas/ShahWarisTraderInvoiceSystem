import React from 'react';
import { Document, Page, View, Text, Image } from '@react-pdf/renderer';
import { Invoice, InvoiceItem, Customer } from '@/lib/db';
import { styles } from './PdfStyles';

export interface InvoicePdfData {
  invoice: Invoice;
  customer?: Customer;
  items: (InvoiceItem & { product_name?: string; category_name?: string; unit?: string })[];
  businessInfo?: {
    name: string;
    tagline: string;
    address: string;
    phone: string;
    email: string;
    currency: string;
    logo_url?: string;
  };
}

interface InvoiceDocumentProps {
  invoices: InvoicePdfData[];
}

function calculateTermsPaddingBottom(termsText?: string): number {
  const text = termsText || '1. Payment due within specified period.\n2. Goods once sold are non-refundable.';
  const lines = text.split('\n');
  let totalLineCount = 0;

  for (const line of lines) {
    const len = line.length;
    if (len === 0) {
      totalLineCount += 0.6;
    } else {
      totalLineCount += Math.max(1, Math.ceil(len / 105));
    }
  }

  // Terms title (10pt) + Terms box padding (8pt) + Lines * 9.5pt + Footer page row (14pt) + Top breathing room gap (24pt) + Bottom offset (12pt)
  const exactHeight = 10 + 8 + (totalLineCount * 9.5) + 14 + 24 + 12;
  return Math.max(68, Math.ceil(exactHeight));
}

export default function InvoiceDocument({ invoices }: InvoiceDocumentProps) {
  return (
    <Document title={invoices.length === 1 ? `Invoice-${invoices[0].invoice.invoice_number}` : 'Invoices-Bulk-Export'}>
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

        // Dynamically calculate bottom padding matching the exact height of Terms & Conditions
        const termsPaddingBottom = calculateTermsPaddingBottom(invoice.terms_conditions);

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
          <Page key={pageIdx} size="A4" style={[styles.page, { paddingBottom: termsPaddingBottom }]}>
            {/* Header Section */}
            <View style={styles.header}>
              <View style={styles.businessInfoContainer}>
                {hasLogo && (
                  <Image src={businessInfo.logo_url!} style={styles.logo} />
                )}
                <View style={styles.businessDetails}>
                  <Text style={styles.businessName}>{businessInfo.name}</Text>
                  {businessInfo.tagline ? (
                    <Text style={styles.businessTagline}>{businessInfo.tagline}</Text>
                  ) : null}
                  {businessInfo.address ? (
                    <Text style={styles.businessText}>{businessInfo.address}</Text>
                  ) : null}
                  {businessInfo.phone ? (
                    <Text style={styles.businessText}>Tel: {businessInfo.phone}</Text>
                  ) : null}
                  {businessInfo.email ? (
                    <Text style={styles.businessText}>Email: {businessInfo.email}</Text>
                  ) : null}
                </View>
              </View>

              {/* Right Side Meta Box */}
              <View style={styles.headerRight}>
                <Text style={styles.invoiceBadge}>INVOICE</Text>
                <Text style={styles.invoiceNumber}>#{invoice.invoice_number}</Text>
                <Text style={styles.metaText}>
                  Date: <Text style={styles.metaTextBold}>{new Date(invoice.created_at).toLocaleDateString()}</Text>
                </Text>
                {invoice.due_date ? (
                  <Text style={styles.metaText}>
                    Due Date: <Text style={styles.metaTextBold}>{new Date(invoice.due_date).toLocaleDateString()}</Text>
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Bill To Section */}
            <View style={styles.billToCard}>
              <Text style={styles.billToTitle}>Billed To:</Text>
              <Text style={styles.customerName}>{customer?.name || invoice.customer_name || 'Walk-in Customer'}</Text>
              <Text style={styles.customerText}>{customer?.address || invoice.customer_address || 'No address specified'}</Text>
              <Text style={styles.customerText}>Phone: {customer?.phone || invoice.customer_phone || 'N/A'}</Text>
              {customer?.ntn_number && customer.ntn_number.trim() !== '' ? (
                <Text style={styles.customerText}>NTN: {customer.ntn_number.trim()}</Text>
              ) : null}
            </View>

            {/* Itemized Table */}
            <View style={styles.table} wrap={true}>
              <View style={styles.tableHeader} fixed>
                <Text style={[styles.tableHeaderCell, styles.colIndex]}>#</Text>
                <Text style={[styles.tableHeaderCell, styles.colDesc]}>Item Description</Text>
                <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
                <Text style={[styles.tableHeaderCell, styles.colPrice]}>Unit Price</Text>
                <Text style={[styles.tableHeaderCell, styles.colDiscount]}>Discount</Text>
                <Text style={[styles.tableHeaderCell, styles.colTotal]}>Total</Text>
              </View>

              {items.map((item, idx) => {
                const isPercent = item.item_discount_type === 'percent';
                const grossLine = item.quantity * item.unit_price;
                const lineDiscVal = isPercent
                  ? grossLine * (item.item_discount / 100)
                  : (item.item_discount || 0);
                const displayLineTotal = item.line_total !== undefined ? item.line_total : Math.max(0, grossLine - lineDiscVal);

                const itemDisplayName = item.product_name || 'Product';
                const fullDescription = item.unit && item.unit.trim() !== ''
                  ? `${itemDisplayName} (${item.unit})`
                  : itemDisplayName;

                return (
                  <View key={idx} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowEven : {}]} wrap={false}>
                    <Text style={[styles.tableCellMuted, styles.colIndex]}>{idx + 1}</Text>
                    <Text style={[styles.tableCellBold, styles.colDesc]}>{fullDescription}</Text>
                    <Text style={[styles.tableCellBold, styles.colQty]}>{item.quantity}</Text>
                    <Text style={[styles.tableCell, styles.colPrice]}>
                      {businessInfo.currency} {item.unit_price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={[styles.tableCellDiscount, styles.colDiscount]}>
                      {item.item_discount > 0
                        ? isPercent
                          ? `${item.item_discount}%`
                          : `-${businessInfo.currency} ${item.item_discount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                        : '-'}
                    </Text>
                    <Text style={[styles.tableCellBold, styles.colTotal]}>
                      {businessInfo.currency} {displayLineTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Totals Breakdown Section */}
            <View style={styles.totalsContainer} wrap={false}>
              {isPaid ? (
                <View style={styles.paidStamp}>
                  <Text>PAID</Text>
                </View>
              ) : null}
              <View style={styles.totalsBox}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Subtotal:</Text>
                  <Text style={styles.totalValue}>
                    {businessInfo.currency} {subtotalAfterItemDiscounts.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </Text>
                </View>

                {hasOverallDiscount ? (
                  <>
                    <View style={styles.totalRowDiscount}>
                      <Text style={styles.totalLabel}>
                        Bill Discount {invoice.overall_discount_type === 'percent' && invoice.overall_discount > 0 ? `(${invoice.overall_discount}%)` : ''}:
                      </Text>
                      <Text style={styles.tableCellDiscount}>
                        -{businessInfo.currency} {overallDiscVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </Text>
                    </View>

                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Amount After Discount:</Text>
                      <Text style={styles.totalValue}>
                        {businessInfo.currency} {amountAfterDiscount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </>
                ) : null}

                {invoice.taxes && invoice.taxes.length > 0 ? (
                  invoice.taxes.map((t, i) => (
                    <View style={styles.totalRow} key={i}>
                      <Text style={styles.totalLabel}>{t.label} ({t.rate}%):</Text>
                      <Text style={styles.totalValue}>
                        +{businessInfo.currency} {t.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  ))
                ) : invoice.tax_percent > 0 ? (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Tax ({invoice.tax_percent}%):</Text>
                    <Text style={styles.totalValue}>
                      +{businessInfo.currency} {invoice.tax_amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.totalRowDivider}>
                  <Text style={styles.grandTotalLabel}>Grand Total:</Text>
                  <Text style={styles.grandTotalValue}>
                    {businessInfo.currency} {invoice.total_amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>
            </View>

            {/* Signature / Stamp — flows once at the end (above the repeating
                footer); kept unbreakable so it never splits across pages */}
            {(hasStamp || hasSignature) ? (
              <View style={styles.signatureRow} wrap={false}>
                <View style={styles.stampBox}>
                  {hasStamp ? (
                    <>
                      <Image src={invoice.stamp_url!} style={styles.stampImage} />
                      <Text style={styles.stampLabel}>Company Seal</Text>
                    </>
                  ) : null}
                </View>

                <View style={styles.signatureBox}>
                  {hasSignature ? (
                    <>
                      <Image src={invoice.signature_url!} style={styles.signatureImage} />
                      <Text style={styles.signatureLabel}>Authorized Signature</Text>
                    </>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Fixed Bottom Footer — Terms & Conditions + Page Number (Appears fixed at bottom on EVERY page) */}
            <View style={styles.footer} fixed>
              <View style={styles.termsContainer}>
                <Text style={styles.termsTitle}>Terms & Conditions:</Text>
                <Text style={styles.termsText}>
                  {invoice.terms_conditions || '1. Payment due within specified period.\n2. Goods once sold are non-refundable.'}
                </Text>
              </View>
              <View style={styles.footerPageRow}>
                <Text style={styles.footerPageNum}>{businessInfo.name}</Text>
                <Text
                  style={styles.footerPageNum}
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
