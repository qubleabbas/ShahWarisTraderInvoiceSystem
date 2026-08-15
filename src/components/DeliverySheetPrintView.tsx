'use client';

import React, { useState, useEffect } from 'react';
import { Printer, Download, FileSpreadsheet, X, CheckCircle, Truck } from 'lucide-react';
import { db } from '@/lib/db';
import { DeliverySheetItem } from '@/components/pdf/DeliveryCollectionDocument';
import { useToast } from '@/components/ToastProvider';

interface DeliverySheetPrintViewProps {
  sheetItems: DeliverySheetItem[];
  cityFilterLabel: string;
  dateFilterLabel: string;
  onClose: () => void;
}

export default function DeliverySheetPrintView({
  sheetItems,
  cityFilterLabel,
  dateFilterLabel,
  onClose
}: DeliverySheetPrintViewProps) {
  const { showToast } = useToast();
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [currency, setCurrency] = useState('Rs.');
  const [businessName, setBusinessName] = useState('Qureshi Sharbat & Majoon House');
  const [businessAddress, setBusinessAddress] = useState('14-B Industrial Area, Station Road, Gujranwala');
  const [businessPhone, setBusinessPhone] = useState('+92 300 8889900 / +92 55 4231100');
  const [businessEmail, setBusinessEmail] = useState('orders@qureshisharbat.com');

  useEffect(() => {
    async function loadSettings() {
      try {
        const curr = await db.settings.get('currency_symbol');
        const bName = await db.settings.get('business_name');
        const bAddr = await db.settings.get('business_address');
        const bPhone = await db.settings.get('business_phone');
        const bEmail = await db.settings.get('business_email');

        if (curr) setCurrency(curr.value);
        if (bName) setBusinessName(bName.value);
        if (bAddr) setBusinessAddress(bAddr.value);
        if (bPhone) setBusinessPhone(bPhone.value);
        if (bEmail) setBusinessEmail(bEmail.value);
      } catch (err) {
        console.error(err);
      }
    }
    loadSettings();
  }, []);

  const totalAmount = sheetItems.reduce((sum, item) => sum + (item.invoice.total_amount || 0), 0);
  const nowStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // Exact Vector PDF Print via Hidden Iframe
  async function handleVectorPrint() {
    try {
      setIsPrinting(true);
      showToast('Preparing vector PDF print...', 'info');

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'delivery-sheet',
          sheetItems,
          cityFilterLabel,
          dateFilterLabel,
          businessName,
          businessAddress,
          businessPhone,
          businessEmail,
          currency
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate vector PDF');
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      iframe.src = blobUrl;

      document.body.appendChild(iframe);

      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            window.open(blobUrl, '_blank');
          }
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);
          }, 60000);
        }, 300);
      };
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to print vector PDF.', 'error');
    } finally {
      setIsPrinting(false);
    }
  }

  // Download Vector PDF
  async function handleDownloadPdf() {
    try {
      setIsExportingPdf(true);
      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'delivery-sheet',
          sheetItems,
          cityFilterLabel,
          dateFilterLabel,
          businessName,
          businessAddress,
          businessPhone,
          businessEmail,
          currency
        })
      });

      if (!res.ok) throw new Error('Failed to generate PDF');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Delivery-Collection-Sheet-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Delivery Sheet PDF exported successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to export PDF file.', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  }

  // Export CSV / Excel file
  function handleExportCsv() {
    try {
      const rows: string[][] = [
        ['Delivery & Collection Sheet'],
        [`Print Date: ${nowStr}`, `City Filter: ${cityFilterLabel}`, `Date Filter: ${dateFilterLabel}`],
        [`Business Name: ${businessName}`, `Phone: ${businessPhone}`],
        [],
        ['Invoice #', 'Customer Name', 'City', 'Phone', 'Invoice Date', 'Grand Total', 'Status', 'Received Payment (Field)', 'Remaining Payment (Field)']
      ];

      sheetItems.forEach((item) => {
        const isPaid = item.invoice.status.toLowerCase() === 'paid';
        const invDate = new Date(item.invoice.created_at).toLocaleDateString('en-GB');

        rows.push([
          item.invoice.invoice_number,
          item.customerName,
          item.cityName || '',
          item.customerPhone || '',
          invDate,
          String(item.invoice.total_amount),
          item.invoice.status,
          isPaid ? 'PAID IN FULL' : '',
          isPaid ? '0' : ''
        ]);
      });

      const processRow = (row: string[]) => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(processRow).join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Delivery-Collection-Sheet-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Excel/CSV spreadsheet exported successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to export CSV file.', 'error');
    }
  }

  return (
    <div className="print-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      {/* Container */}
      <div className="print-modal-container bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        
        {/* Action Header - Screen Only */}
        <div className="p-4 border-b border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Truck size={20} />
            </div>
            <div>
              <h2 className="font-bold text-white text-base">Delivery & Collection Sheet Preview</h2>
              <p className="text-xs text-slate-400">
                {sheetItems.length} Invoices selected ({currency} {totalAmount.toLocaleString()})
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleVectorPrint}
              disabled={isPrinting}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition disabled:opacity-50 shadow-md"
              title="Print Crisp Vector PDF Document"
            >
              <Printer size={15} />
              <span>{isPrinting ? 'Printing...' : 'Print Sheet'}</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 transition disabled:opacity-50"
              title="Export Vector PDF Document"
            >
              <Download size={15} />
              <span>{isExportingPdf ? 'Exporting...' : 'Export PDF'}</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-emerald-400 hover:bg-slate-700 transition"
              title="Export Excel/CSV Spreadsheet"
            >
              <FileSpreadsheet size={15} />
              <span>Export Excel</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable View Area */}
        <div className="p-6 overflow-y-auto bg-white text-slate-900 space-y-6 print:p-0 print:overflow-visible font-sans text-xs">
          
          {/* Printable Business Header */}
          <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-start">
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 uppercase tracking-tight">{businessName}</h1>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {businessAddress} | Ph: {businessPhone} | Email: {businessEmail}
              </p>
            </div>
            <div className="text-right">
              <h2 className="text-sm font-bold text-emerald-700 uppercase tracking-wide">Delivery & Collection Sheet</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Print Date: {nowStr}</p>
            </div>
          </div>

          {/* Filter Summary Bar */}
          <div className="bg-slate-100 border border-slate-300 rounded-lg p-2.5 flex justify-between items-center text-slate-700 text-xs">
            <div>
              <span>City Filter: <strong className="text-slate-900">{cityFilterLabel}</strong></span>
              <span className="mx-2">•</span>
              <span>Date Filter: <strong className="text-slate-900">{dateFilterLabel}</strong></span>
            </div>
            <div>
              <span>Invoices: <strong className="text-slate-900">{sheetItems.length}</strong></span>
              <span className="mx-2">•</span>
              <span>Total Amount: <strong className="text-emerald-700">{currency} {totalAmount.toLocaleString()}</strong></span>
            </div>
          </div>

          {/* Invoice Cards List */}
          <div className="space-y-4">
            {sheetItems.map((item, idx) => {
              const isPaid = item.invoice.status.toLowerCase() === 'paid';
              const invDate = new Date(item.invoice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

              return (
                <div key={item.invoice.id || idx} className="border border-slate-300 rounded-lg p-4 bg-white shadow-sm space-y-3 page-break-inside-avoid">
                  
                  {/* Invoice Block Header */}
                  <div className="flex justify-between items-start border-b border-slate-200 pb-2">
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-900">{item.customerName}</h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        City: <strong className="text-slate-800">{item.cityName || 'N/A'}</strong>
                        {item.customerPhone ? ` | Ph: ${item.customerPhone}` : ''}
                        {item.customerAddress ? ` | ${item.customerAddress}` : ''}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-extrabold text-sm text-emerald-700">{item.invoice.invoice_number}</p>
                      <p className="text-xs text-slate-500">Date: {invDate}</p>
                    </div>
                  </div>

                  {/* Payment Status / Handwritten Entry Box */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-1">
                    {/* Amount Box */}
                    <div className="bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 text-center min-w-[130px]">
                      <p className="text-[10px] uppercase font-bold text-slate-500">Grand Total</p>
                      <p className="text-sm font-black text-slate-900">{currency} {item.invoice.total_amount.toLocaleString()}</p>
                    </div>

                    {/* Payment Line Items */}
                    <div className="flex-1 w-full">
                      {isPaid ? (
                        <div className="inline-flex items-center space-x-1.5 bg-emerald-100 border border-emerald-500 text-emerald-800 px-3 py-1.5 rounded-md font-bold text-xs">
                          <CheckCircle size={14} />
                          <span>PAID IN FULL</span>
                        </div>
                      ) : (
                        <div className="space-y-2 w-full">
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="font-bold text-slate-800 whitespace-nowrap w-36">Received Payment:</span>
                            <div className="border-b border-slate-400 flex-1 h-5" />
                          </div>
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="font-bold text-slate-800 whitespace-nowrap w-36">Remaining Payment:</span>
                            <div className="border-b border-slate-400 flex-1 h-5" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Printable Footer Signatures */}
          <div className="pt-6 border-t border-slate-300 flex justify-between text-xs text-slate-600">
            <div>
              <p>Delivery Person Signature: ______________________</p>
            </div>
            <div>
              <p>Customer Signature: ______________________</p>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .print-modal-overlay {
            position: static !important;
            background: transparent !important;
            backdrop-filter: none !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          .print-modal-container {
            background: white !important;
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .page-break-inside-avoid {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
