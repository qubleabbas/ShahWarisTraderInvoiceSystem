import { StyleSheet } from '@react-pdf/renderer';

export const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 28,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    position: 'relative'
  },
  
  // Header Section
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 12,
    marginBottom: 14
  },
  businessInfoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  logo: {
    width: 48,
    height: 48,
    objectFit: 'contain',
    borderRadius: 6
  },
  businessDetails: {
    flexDirection: 'column',
    maxWidth: 240
  },
  businessName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    letterSpacing: -0.3
  },
  businessTagline: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#047857',
    textTransform: 'uppercase',
    marginTop: 2,
    letterSpacing: 0.5
  },
  businessText: {
    fontSize: 8,
    color: '#475569',
    marginTop: 2,
    leading: 1.3
  },

  // Top Right Invoice Meta
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end'
  },
  invoiceBadge: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    fontSize: 8,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 2
  },
  metaText: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 1
  },
  metaTextBold: {
    fontWeight: 'bold',
    color: '#1e293b'
  },

  // Bill To Section
  billToCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 10,
    marginBottom: 14
  },
  billToTitle: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3
  },
  customerName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  customerText: {
    fontSize: 8,
    color: '#475569',
    marginTop: 1
  },

  // Table Section
  table: {
    width: '100%',
    marginBottom: 10
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1.5,
    borderBottomColor: '#0f172a',
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center'
  },
  tableHeaderCell: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center'
  },
  tableRowEven: {
    backgroundColor: '#fafafa'
  },
  tableCell: {
    fontSize: 8.5,
    color: '#1e293b'
  },
  tableCellBold: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  tableCellMuted: {
    fontSize: 8.5,
    color: '#94a3b8'
  },
  tableCellDiscount: {
    fontSize: 8.5,
    color: '#e11d48',
    fontWeight: 'bold'
  },

  // Column Widths
  colIndex: { width: '6%', textAlign: 'left' },
  colDesc: { width: '38%', textAlign: 'left' },
  colQty: { width: '10%', textAlign: 'center' },
  colPrice: { width: '15%', textAlign: 'right' },
  colDiscount: { width: '13%', textAlign: 'right' },
  colTotal: { width: '18%', textAlign: 'right' },

  // Totals Breakdown Section
  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: 18,
    marginTop: 4,
    marginBottom: 14
  },
  totalsBox: {
    width: 220,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 8
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2
  },
  totalLabel: {
    fontSize: 8,
    color: '#475569'
  },
  totalValue: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#1e293b'
  },
  totalRowDiscount: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    color: '#e11d48'
  },
  totalRowDivider: {
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
    marginTop: 4,
    paddingTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  grandTotalLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  grandTotalValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#047857'
  },

  footer: {
    position: 'absolute',
    bottom: 10,
    left: 28,
    right: 28,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 4,
    flexDirection: 'column'
  },
  footerPageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 3
  },
  footerPageNum: {
    fontSize: 7,
    color: '#94a3b8'
  },
  termsContainer: {
    width: '100%',
    marginBottom: 1
  },
  termsTitle: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3
  },
  termsText: {
    fontSize: 7.5,
    color: '#334155',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    lineHeight: 1.3
  },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 10,
    marginBottom: 6,
    minHeight: 40
  },
  stampBox: {
    alignItems: 'center'
  },
  stampImage: {
    height: 36,
    maxWidth: 100,
    objectFit: 'contain'
  },
  stampLabel: {
    fontSize: 6.5,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginTop: 2
  },
  signatureBox: {
    alignItems: 'center',
    minWidth: 110
  },
  signatureImage: {
    height: 28,
    maxWidth: 110,
    objectFit: 'contain',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingBottom: 2
  },
  signatureLabel: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 2
  },

  // Paid Stamp — sits inline next to the Grand Total totals box
  paidStamp: {
    borderWidth: 3,
    borderStyle: 'solid',
    borderColor: '#059669',
    color: '#059669',
    fontSize: 22,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 6,
    opacity: 0.8,
    transform: 'rotate(-12deg)',
    marginBottom: 6
  }
});
