import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

export interface CompanyStockItem {
  id?: number;
  name: string;
  unit: string;
  stock_quantity: number;
  purchase_price: number;
  price: number; // retail/sale price
  totalStockValue: number; // stock_quantity * purchase_price
  totalRetailValue: number; // stock_quantity * price
  categoryName?: string;
}

export interface CompanyStockDocumentProps {
  companyName: string;
  items: CompanyStockItem[];
  dateLabel?: string;
  businessName?: string;
  businessTagline?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  businessLogoUrl?: string;
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
    minWidth: 200
  },
  logo: {
    width: 48,
    height: 48,
    objectFit: 'contain',
    marginBottom: 4
  },
  businessName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    letterSpacing: -0.5
  },
  businessTagline: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#047857',
    textTransform: 'uppercase',
    marginTop: 2
  },
  businessSub: {
    fontSize: 8,
    color: '#475569',
    marginTop: 2,
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
  companyBadge: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    alignSelf: 'flex-end'
  },
  companyBadgeText: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#065f46'
  },
  docMeta: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 3,
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
  summaryItem: {
    alignItems: 'center',
    flex: 1
  },
  summaryLabel: {
    fontSize: 7,
    color: '#64748b',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    marginBottom: 2
  },
  summaryValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  summaryValueHighlight: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#047857'
  },
  table: {
    width: '100%',
    marginBottom: 14
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 4
  },
  tableHeaderCell: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 8,
    textTransform: 'uppercase'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 5,
    paddingHorizontal: 4,
    minHeight: 20,
    alignItems: 'center'
  },
  tableRowEven: {
    backgroundColor: '#f8fafc'
  },
  tableCell: {
    fontSize: 8,
    color: '#334155'
  },
  tableCellBold: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  tableCellHighlight: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#047857'
  },
  // Column Widths
  colIndex: { width: '4%', textAlign: 'center' },
  colId: { width: '6%', textAlign: 'center' },
  colName: { width: '26%', textAlign: 'left', paddingRight: 4 },
  colUnit: { width: '11%', textAlign: 'left' },
  colQty: { width: '8%', textAlign: 'right', paddingRight: 4 },
  colCost: { width: '14%', textAlign: 'right', paddingRight: 6 },
  colRetail: { width: '14%', textAlign: 'right', paddingRight: 6 },
  colTotal: { width: '17%', textAlign: 'right' },

  tableFooterRow: {
    flexDirection: 'row',
    backgroundColor: '#ecfdf5',
    borderTopWidth: 1.5,
    borderTopColor: '#047857',
    borderBottomWidth: 1.5,
    borderBottomColor: '#047857',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginTop: 2
  },
  tableFooterCell: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#065f46'
  },
  footer: {
    position: 'absolute',
    bottom: 15,
    left: 28,
    right: 28,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 6,
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'center'
  },
  footerText: {
    fontSize: 7.5,
    color: '#94a3b8'
  }
});

export default function CompanyStockDocument({
  companyName,
  items,
  dateLabel,
  businessName = 'Qureshi Sharbat & Majoon House',
  businessTagline = 'Manufacturers of Pure Herbal Sharbats, Majoons & Distillates',
  businessAddress = '14-B Industrial Area, Station Road, Gujranwala',
  businessPhone = '+92 300 8889900 / +92 55 4231100',
  businessEmail = 'orders@qureshisharbat.com',
  businessLogoUrl,
  currency = 'Rs.'
}: CompanyStockDocumentProps) {
  const currentDate = dateLabel || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const totalStockQty = items.reduce((sum, item) => sum + (item.stock_quantity || 0), 0);
  const totalPurchaseValuation = items.reduce((sum, item) => sum + (item.totalStockValue || 0), 0);
  const totalRetailValuation = items.reduce((sum, item) => sum + (item.totalRetailValue || 0), 0);

  return (
    <Document title={`Company-Stock-Report-${companyName.replace(/\s+/g, '-')}`}>
      <Page size="A4" style={styles.page}>
        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.businessLeft}>
              {businessLogoUrl ? <Image src={businessLogoUrl} style={styles.logo} /> : null}
              <Text style={styles.businessName}>{businessName}</Text>
              {businessTagline ? <Text style={styles.businessTagline}>{businessTagline}</Text> : null}
              <Text style={styles.businessSub}>
                {[businessAddress, businessPhone ? `Tel: ${businessPhone}` : '', businessEmail ? `Email: ${businessEmail}` : '']
                  .filter(Boolean)
                  .join(' | ')}
              </Text>
            </View>

            <View style={styles.headerRight}>
              <Text style={styles.docTitle}>COMPANY STOCK REPORT</Text>
              <View style={styles.companyBadge}>
                <Text style={styles.companyBadgeText}>Company: {companyName}</Text>
              </View>
              <Text style={styles.docMeta}>Report Date: {currentDate}</Text>
            </View>
          </View>
        </View>

        {/* Summary Metrics Bar */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Products</Text>
            <Text style={styles.summaryValue}>{items.length}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Quantity</Text>
            <Text style={styles.summaryValue}>{totalStockQty.toLocaleString()} units</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Stock Amount</Text>
            <Text style={styles.summaryValueHighlight}>{currency} {totalPurchaseValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Retail Amount</Text>
            <Text style={styles.summaryValue}>{currency} {totalRetailValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>
        </View>

        {/* Product Stock Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader} fixed>
            <Text style={[styles.tableHeaderCell, styles.colIndex]}>#</Text>
            <Text style={[styles.tableHeaderCell, styles.colId]}>ID</Text>
            <Text style={[styles.tableHeaderCell, styles.colName]}>Product Name</Text>
            <Text style={[styles.tableHeaderCell, styles.colUnit]}>Unit</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Stock</Text>
            <Text style={[styles.tableHeaderCell, styles.colCost]}>Pur. Price</Text>
            <Text style={[styles.tableHeaderCell, styles.colRetail]}>Retail Price</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>Stock Amount</Text>
          </View>

          {items.map((item, idx) => (
            <View key={item.id || idx} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowEven : {}]} wrap={false}>
              <Text style={[styles.tableCell, styles.colIndex]}>{idx + 1}</Text>
              <Text style={[styles.tableCellBold, styles.colId]}>#{item.id || idx + 1}</Text>
              <Text style={[styles.tableCellBold, styles.colName]}>{item.name}</Text>
              <Text style={[styles.tableCell, styles.colUnit]}>{item.unit}</Text>
              <Text style={[styles.tableCellHighlight, styles.colQty]}>{item.stock_quantity.toLocaleString()}</Text>
              <Text style={[styles.tableCell, styles.colCost]}>{currency} {item.purchase_price.toLocaleString()}</Text>
              <Text style={[styles.tableCell, styles.colRetail]}>{currency} {item.price.toLocaleString()}</Text>
              <Text style={[styles.tableCellHighlight, styles.colTotal]}>
                {currency} {item.totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          ))}

          {/* Grand Total Summary Footer Row */}
          <View style={styles.tableFooterRow} wrap={false}>
            <Text style={[styles.tableFooterCell, { width: '47%', textAlign: 'right', paddingRight: 6 }]}>
              GRAND TOTAL ({items.length} Products):
            </Text>
            <Text style={[styles.tableFooterCell, styles.colQty]}>{totalStockQty.toLocaleString()}</Text>
            <Text style={[styles.tableFooterCell, styles.colCost, { textAlign: 'right', paddingRight: 6 }]}>-</Text>
            <Text style={[styles.tableFooterCell, styles.colRetail, { textAlign: 'right', paddingRight: 6 }]}>
              {currency} {totalRetailValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={[styles.tableFooterCell, styles.colTotal]}>
              {currency} {totalPurchaseValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        {/* Page Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{businessName} — Confidential Stock Inventory Report</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
