import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import InvoiceDocument, { InvoicePdfData } from '@/components/pdf/InvoiceDocument';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const invoiceList: InvoicePdfData[] = body.invoices || (body.invoice ? [body] : []);

    if (!invoiceList || invoiceList.length === 0) {
      return NextResponse.json({ error: 'No invoice data provided' }, { status: 400 });
    }

    // Render React-PDF Document to PDF Buffer (Pure JS, Vercel compatible, fast & vector-sharp)
    const pdfBuffer = await renderToBuffer(
      React.createElement(InvoiceDocument, { invoices: invoiceList }) as any
    );

    const filename = invoiceList.length === 1
      ? `Invoice-${invoiceList[0].invoice?.invoice_number || 'export'}.pdf`
      : `Invoices-Bulk-Export-${Date.now()}.pdf`;

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
