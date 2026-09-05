import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import InvoiceDocument, { InvoicePdfData } from '@/components/pdf/InvoiceDocument';
import ThermalReceiptDocument from '@/components/pdf/ThermalReceiptDocument';
import DeliveryCollectionDocument, { DeliverySheetItem } from '@/components/pdf/DeliveryCollectionDocument';
import PendingPaymentsDocument, { CustomerPendingGroup } from '@/components/pdf/PendingPaymentsDocument';
import CompanyStockDocument, { CompanyStockItem } from '@/components/pdf/CompanyStockDocument';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const format: 'a4' | 'thermal' | 'delivery-sheet' | 'pending-payments' | 'company-stock' = body.format;

    if (format === 'company-stock') {
      const items: CompanyStockItem[] = body.items || [];
      const companyName: string = body.companyName || 'All Companies';

      const documentEl = React.createElement(CompanyStockDocument, {
        companyName,
        items,
        dateLabel: body.dateLabel,
        businessName: body.businessName,
        businessTagline: body.businessTagline,
        businessAddress: body.businessAddress,
        businessPhone: body.businessPhone,
        businessEmail: body.businessEmail,
        businessLogoUrl: body.businessLogoUrl,
        currency: body.currency
      });

      const pdfBuffer = await renderToBuffer(documentEl as any);
      const filename = `Company-Stock-Report-${companyName.replace(/\s+/g, '-')}-${Date.now()}.pdf`;

      return new NextResponse(Buffer.from(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }

    if (format === 'pending-payments') {
      const customerGroups: CustomerPendingGroup[] = body.customerGroups || [];
      if (!customerGroups || customerGroups.length === 0) {
        return NextResponse.json({ error: 'No pending payments data provided' }, { status: 400 });
      }

      const documentEl = React.createElement(PendingPaymentsDocument, {
        customerGroups,
        cityFilterLabel: body.cityFilterLabel,
        dateFilterLabel: body.dateFilterLabel,
        businessName: body.businessName,
        businessAddress: body.businessAddress,
        businessPhone: body.businessPhone,
        businessEmail: body.businessEmail,
        currency: body.currency
      });

      const pdfBuffer = await renderToBuffer(documentEl as any);
      const filename = `Pending-Payments-Sheet-${Date.now()}.pdf`;

      return new NextResponse(Buffer.from(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }

    if (format === 'delivery-sheet') {
      const sheetItems: DeliverySheetItem[] = body.sheetItems || [];
      if (!sheetItems || sheetItems.length === 0) {
        return NextResponse.json({ error: 'No delivery sheet data provided' }, { status: 400 });
      }

      const documentEl = React.createElement(DeliveryCollectionDocument, {
        sheetItems,
        cityFilterLabel: body.cityFilterLabel,
        dateFilterLabel: body.dateFilterLabel,
        businessName: body.businessName,
        businessAddress: body.businessAddress,
        businessPhone: body.businessPhone,
        businessEmail: body.businessEmail,
        currency: body.currency
      });

      const pdfBuffer = await renderToBuffer(documentEl as any);
      const filename = `Delivery-Collection-Sheet-${Date.now()}.pdf`;

      return new NextResponse(Buffer.from(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }

    const invoiceList: InvoicePdfData[] = body.invoices || (body.invoice ? [body] : []);
    if (!invoiceList || invoiceList.length === 0) {
      return NextResponse.json({ error: 'No invoice data provided' }, { status: 400 });
    }

    const documentEl =
      format === 'thermal'
        ? React.createElement(ThermalReceiptDocument, { invoices: invoiceList })
        : React.createElement(InvoiceDocument, { invoices: invoiceList });

    const pdfBuffer = await renderToBuffer(documentEl as any);

    const prefix = format === 'thermal' ? 'Receipt' : 'Invoice';
    const filename = invoiceList.length === 1
      ? `${prefix}-${invoiceList[0].invoice?.invoice_number || 'export'}.pdf`
      : `${prefix}s-Bulk-Export-${Date.now()}.pdf`;

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (err: any) {
    console.error('Error generating PDF via @react-pdf/renderer:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate vector PDF' },
      { status: 500 }
    );
  }
}
