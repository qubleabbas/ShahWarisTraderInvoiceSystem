import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { InvoicePdfData } from './InvoiceDocument';

/**
 * Thermal receipt PDF for POS / grocery thermal printers.
 * Renders a narrow 80mm-wide roll with a dynamically computed height so the
 * receipt is one continuous slip (no wasted paper, no forced A4 pagination).
 *
 * All financial logic mirrors the A4 InvoiceDocument so both formats always
 * show identical numbers from the same invoice data.
 */

const MM_TO_PT = 72 / 25.4;
const PAPER_WIDTH_MM = 80; // standard thermal roll; 58mm also common
const PAGE_WIDTH = PAPER_WIDTH_MM * MM_TO_PT; // ~226.77pt
const PADDING = 10;

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: PADDING,
    paddingVertical: 12,
    fontFamily: 'Helvetica',
    color: '#000000',
  },
  center: { textAlign: 'center' },
  businessName: { fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  businessTagline: { fontSize: 6.5, color: '#333333', textAlign: 'center', marginTop: 1 },
  businessText: { fontSize: 7, color: '#222222', textAlign: 'center', marginTop: 1 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#000000', borderStyle: 'dashed', marginVertical: 5 },
  dividerSolid: { borderBottomWidth: 1.5, borderBottomColor: '#000000', marginVertical: 4 },
  metaTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center', letterSpacing: 1 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  metaLabel: { fontSize: 7.5, color: '#333333' },
  metaValue: { fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  sectionLabel: { fontSize: 7, color: '#555555', fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  customerName: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  customerText: { fontSize: 7.5, color: '#222222' },
  itemHeadRow: { flexDirection: 'row', justifyContent: 'space-between' },
  itemHeadCell: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#333333' },
  itemName: { fontSize: 8, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  itemDetailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 },
  itemDetailText: { fontSize: 7.5, color: '#222222' },
  itemLineTotal: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  itemDiscount: { fontSize: 6.5, color: '#444444' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  totalLabel: { fontSize: 7.5, color: '#333333' },
  totalValue: { fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 2 },
  grandLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  grandValue: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  paidBox: {
    marginTop: 6,
    marginHorizontal: 'auto',
    borderWidth: 1.5,
    borderColor: '#000000',
    paddingVertical: 2,
    paddingHorizontal: 14,
    alignSelf: 'center',
  },
  paidText: { fontSize: 10, fontFamily: 'Helvetica-Bold', letterSpacing: 2 },
  thankYou: { fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 8 },
  footerText: { fontSize: 6.5, color: '#444444', textAlign: 'center', marginTop: 3 },
  // Signature & stamp
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  sigCol: { width: '48%', alignItems: 'center' },
  stampImage: { width: 52, height: 52, objectFit: 'contain', marginHorizontal: 'auto' },
  sigImage: { width: 80, height: 34, objectFit: 'contain', marginHorizontal: 'auto' },
  sigLabel: {
    fontSize: 6.5,
    color: '#333333',
    marginTop: 2,
    paddingTop: 2,
    width: '100%',
    textAlign: 'center',
    borderTopWidth: 0.75,
    borderTopColor: '#999999',
  },
  // Terms & Conditions (left-aligned)
  termsSection: { marginTop: 8 },
  termsTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', textAlign: 'left', marginBottom: 2 },
  termsBody: { fontSize: 6.5, color: '#333333', textAlign: 'left', lineHeight: 1.35 },
});

interface ThermalReceiptDocumentProps {
  invoices: InvoicePdfData[];
}

// Estimate the roll height (pt) so each receipt is a single continuous page.
// Deliberately slightly generous — a little trailing feed beats a split receipt.
function estimateHeight(data: InvoicePdfData): number {
  const { invoice, items } = data;
  const b = data.businessInfo;
  let h = 24; // vertical padding

  h += 14; // business name
  if (b?.tagline) h += 9;
  if (b?.address) h += 9;
  if (b?.phone) h += 9;
  h += 10; // divider
  h += 12 + 10 + 9; // title + invoice number + date
  if (invoice.due_date) h += 9;
  h += 10; // divider
  h += 8 + 9 + 9; // billed-to label + name + phone
  h += 10; // divider
  h += 9; // items header

  const contentChars = 34; // rough chars per line at 80mm
  for (const it of items) {
    const name = (it.product_name || 'Product') + (it.unit ? ` (${it.unit})` : '');
    const nameLines = Math.max(1, Math.ceil(name.length / contentChars));
    h += nameLines * 10 + 10; // name line(s) + detail row
    if (it.item_discount && it.item_discount > 0) h += 8;
  }

  h += 10; // divider
  h += 10; // subtotal
  // Only a whole-bill discount adds its own two lines (discount + after-discount).
  const hasOverallDiscount = (invoice.overall_discount || 0) > 0;
  if (hasOverallDiscount) h += 20;
  const taxCount = invoice.taxes && invoice.taxes.length > 0 ? invoice.taxes.length : invoice.tax_percent > 0 ? 1 : 0;
  h += taxCount * 10;
  h += 22; // grand total
  if (invoice.status === 'Paid') h += 28;
  if (invoice.signature_url || invoice.stamp_url) h += 62; // signature / stamp row
  if (invoice.terms_conditions) {
    // divider + title + wrapped lines
    const termLines = invoice.terms_conditions
      .split('\n')
      .reduce((acc, l) => acc + Math.max(1, Math.ceil((l.length || 1) / 34)), 0);
    h += 10 + 12 + termLines * 10;
  }
  h += 14; // thank you
  h += 14; // email footer line

  h += 16; // safety margin
  return Math.max(300, Math.round(h));
}

export default function ThermalReceiptDocument({ invoices }: ThermalReceiptDocumentProps) {
  return (
    <Document
      title={
        invoices.length === 1
          ? `Receipt-${invoices[0].invoice.invoice_number}`
          : 'Receipts-Bulk-Export'
      }
    >
      {invoices.map((data, pageIdx) => {
        const { invoice, customer, items, businessInfo: bInfo } = data;
        const businessInfo = bInfo || {
          name: 'Qureshi Sharbat & Majoon House',
          tagline: 'Manufacturers of Pure Herbal Sharbats, Majoons & Distillates',
          address: '14-B Industrial Area, Station Road, Gujranwala',
          phone: '+92 300 8889900',
          email: 'orders@qureshisharbat.com',
          currency: 'Rs.',
        };

        const isPaid = invoice.status === 'Paid';
        const hasLogo = !!(businessInfo.logo_url && businessInfo.logo_url.trim() !== '');
        const hasSignature = !!invoice.signature_url;
        const hasStamp = !!invoice.stamp_url;
        const cur = businessInfo.currency;
        const money = (n: number) =>
          `${cur} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

        // Financials (identical math to the A4 InvoiceDocument)
        const grossSubtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
        const totalItemDiscounts = items.reduce((s, it) => {
          if (it.item_discount_type === 'percent') {
            return s + it.quantity * it.unit_price * (it.item_discount / 100);
          }
          return s + (it.item_discount || 0);
        }, 0);
        const subtotalAfterItemDiscounts = Math.max(0, grossSubtotal - totalItemDiscounts);
        let overallDiscVal = 0;
        if (invoice.overall_discount_type === 'percent') {
          overallDiscVal = (subtotalAfterItemDiscounts * (invoice.overall_discount || 0)) / 100;
        } else {
          overallDiscVal = invoice.overall_discount || 0;
        }
        // Item discounts stay on their line; only a whole-bill discount is shown.
        const hasOverallDiscount = overallDiscVal > 0;
        const amountAfterDiscount = Math.max(0, subtotalAfterItemDiscounts - overallDiscVal);

        const pageHeight = estimateHeight(data);

        return (
          <Page key={pageIdx} size={{ width: PAGE_WIDTH, height: pageHeight }} style={styles.page}>
            {/* Header */}
            {hasLogo && (
              <Image
                src={businessInfo.logo_url!}
                style={{ width: 46, height: 46, objectFit: 'contain', marginHorizontal: 'auto', marginBottom: 3 }}
              />
            )}
            <Text style={styles.businessName}>{businessInfo.name}</Text>
            {businessInfo.tagline ? <Text style={styles.businessTagline}>{businessInfo.tagline}</Text> : null}
            {businessInfo.address ? <Text style={styles.businessText}>{businessInfo.address}</Text> : null}
            {businessInfo.phone ? <Text style={styles.businessText}>Tel: {businessInfo.phone}</Text> : null}

            <View style={styles.divider} />

            {/* Invoice meta */}
            <Text style={styles.metaTitle}>SALES RECEIPT</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice #</Text>
              <Text style={styles.metaValue}>{invoice.invoice_number}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{new Date(invoice.created_at).toLocaleDateString()}</Text>
            </View>
            {invoice.due_date ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Due</Text>
                <Text style={styles.metaValue}>{new Date(invoice.due_date).toLocaleDateString()}</Text>
              </View>
            ) : null}

            <View style={styles.divider} />

            {/* Customer */}
            <Text style={styles.sectionLabel}>BILLED TO</Text>
            <Text style={styles.customerName}>
              {customer?.name || invoice.customer_name || 'Walk-in Customer'}
            </Text>
            <Text style={styles.customerText}>
              Phone: {customer?.phone || invoice.customer_phone || 'N/A'}
            </Text>
            {customer?.ntn_number && customer.ntn_number.trim() !== '' ? (
              <Text style={styles.customerText}>NTN: {customer.ntn_number.trim()}</Text>
            ) : null}

            <View style={styles.divider} />

            {/* Items header */}
            <View style={styles.itemHeadRow}>
              <Text style={styles.itemHeadCell}>Item</Text>
              <Text style={styles.itemHeadCell}>Amount</Text>
            </View>

            {/* Items */}
            {items.map((item, idx) => {
              const isPercent = item.item_discount_type === 'percent';
              const grossLine = item.quantity * item.unit_price;
              const lineDiscVal = isPercent ? grossLine * (item.item_discount / 100) : item.item_discount || 0;
              const displayLineTotal =
                item.line_total !== undefined ? item.line_total : Math.max(0, grossLine - lineDiscVal);
              const name = item.product_name || 'Product';
              const fullName = item.unit && item.unit.trim() !== '' ? `${name} (${item.unit})` : name;

              return (
                <View key={idx} wrap={false}>
                  <Text style={styles.itemName}>{fullName}</Text>
                  <View style={styles.itemDetailRow}>
                    <Text style={styles.itemDetailText}>
                      {item.quantity} x {money(item.unit_price)}
                    </Text>
                    <Text style={styles.itemLineTotal}>{money(displayLineTotal)}</Text>
                  </View>
                  {item.item_discount > 0 ? (
                    <Text style={styles.itemDiscount}>
                      Discount: {isPercent ? `${item.item_discount}%` : money(item.item_discount)}
                    </Text>
                  ) : null}
                </View>
              );
            })}

            <View style={styles.divider} />

            {/* Totals */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{money(subtotalAfterItemDiscounts)}</Text>
            </View>
            {hasOverallDiscount ? (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    Bill Discount{invoice.overall_discount_type === 'percent' && invoice.overall_discount > 0 ? ` (${invoice.overall_discount}%)` : ''}
                  </Text>
                  <Text style={styles.totalValue}>-{money(overallDiscVal)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>After Discount</Text>
                  <Text style={styles.totalValue}>{money(amountAfterDiscount)}</Text>
                </View>
              </>
            ) : null}

            {invoice.taxes && invoice.taxes.length > 0
              ? invoice.taxes.map((t, i) => (
                  <View style={styles.totalRow} key={i}>
                    <Text style={styles.totalLabel}>
                      {t.label} ({t.rate}%)
                    </Text>
                    <Text style={styles.totalValue}>+{money(t.amount)}</Text>
                  </View>
                ))
              : invoice.tax_percent > 0
              ? (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Tax ({invoice.tax_percent}%)</Text>
                  <Text style={styles.totalValue}>+{money(invoice.tax_amount)}</Text>
                </View>
              )
              : null}

            <View style={styles.dividerSolid} />
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>TOTAL</Text>
              <Text style={styles.grandValue}>{money(invoice.total_amount)}</Text>
            </View>
            <View style={styles.dividerSolid} />

            {isPaid ? (
              <View style={styles.paidBox}>
                <Text style={styles.paidText}>PAID</Text>
              </View>
            ) : null}

            {/* Signature & stamp */}
            {(hasStamp || hasSignature) ? (
              <View style={styles.sigRow}>
                <View style={styles.sigCol}>
                  {hasStamp ? (
                    <>
                      <Image src={invoice.stamp_url!} style={styles.stampImage} />
                      <Text style={styles.sigLabel}>Company Seal</Text>
                    </>
                  ) : null}
                </View>
                <View style={styles.sigCol}>
                  {hasSignature ? (
                    <>
                      <Image src={invoice.signature_url!} style={styles.sigImage} />
                      <Text style={styles.sigLabel}>Authorized Signature</Text>
                    </>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Terms & Conditions — left-aligned block */}
            {invoice.terms_conditions ? (
              <View style={styles.termsSection}>
                <View style={styles.divider} />
                <Text style={styles.termsTitle}>Terms &amp; Conditions</Text>
                <Text style={styles.termsBody}>{invoice.terms_conditions}</Text>
              </View>
            ) : null}

            {/* Footer */}
            <Text style={styles.thankYou}>Thank you for your purchase!</Text>
            {businessInfo.email ? <Text style={styles.footerText}>{businessInfo.email}</Text> : null}
          </Page>
        );
      })}
    </Document>
  );
}
