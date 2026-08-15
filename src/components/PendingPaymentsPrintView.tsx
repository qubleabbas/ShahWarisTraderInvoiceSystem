'use client';

import React, { useState, useEffect } from 'react';
import { Printer, Download, FileSpreadsheet, X, Clock, Building2 } from 'lucide-react';
import { db } from '@/lib/db';
import { CustomerPendingGroup } from '@/components/pdf/PendingPaymentsDocument';
import { useToast } from '@/components/ToastProvider';

interface PendingPaymentsPrintViewProps {
  customerGroups: CustomerPendingGroup[];
  cityFilterLabel: string;
  dateFilterLabel: string;
  onClose: () => void;
}

export default function PendingPaymentsPrintView({
  customerGroups,
  cityFilterLabel,
  dateFilterLabel,
  onClose
}: PendingPaymentsPrintViewProps) {
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

  let grandTotalPending = 0;
  let totalInvoicesCount = 0;

  customerGroups.forEach((group) => {
    grandTotalPending += group.customerTotalPending;
    totalInvoicesCount += group.items.length;
  });

  const nowStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // Exact Vector PDF Print via Hidden Iframe
  async function handleVectorPrint() {
    try {
      setIsPrinting(true);
      showToast('Preparing pending payments vector PDF print...', 'info');

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'pending-payments',
          customerGroups,
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
      showToast(err?.message || 'Failed to print pending payments sheet.', 'error');
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
          format: 'pending-payments',
          customerGroups,
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
      link.download = `Pending-Payments-Sheet-${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Pending Payments Sheet PDF exported successfully!', 'success');
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
        ['Pending Payments Sheet (Grouped by Customer)'],
        [`Print Date: ${nowStr}`, `City Filter: ${cityFilterLabel}`, `Date Filter: ${dateFilterLabel}`],
        [`Business Name: ${businessName}`, `Phone: ${businessPhone}`],
        [],
        ['Customer Name', 'City', 'Phone', 'Invoice #', 'Invoice Date', 'Grand Total', 'Pending Amount', 'Received Payment (Field)', 'Remaining Payment (Field)']
      ];

      customerGroups.forEach((group) => {
        group.items.forEach((item) => {
          const invDate = new Date(item.invoice.created_at).toLocaleDateString('en-GB');
          rows.push([
            group.customerName,
            group.cityName || '',
            group.customerPhone || '',
            item.invoice.invoice_number,
            invDate,
            String(item.invoice.total_amount),
            String(item.pendingAmount),
            '',
            ''
          ]);
        });
        rows.push([
          `SUBTOTAL FOR ${group.customerName.toUpperCase()}`,
          '',
          '',
          '',
          '',
          '',
          String(group.customerTotalPending),
          '',
          ''
        ]);
        rows.push([]); // blank separator line
      });

      rows.push(['GRAND TOTAL PENDING AMOUNT', '', '', '', '', '', String(grandTotalPending), '', '']);

      const processRow = (row: string[]) => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(processRow).join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Pending-Payments-Sheet-${Date.now()}.csv`);
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
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Clock size={20} />
            </div>
            <div>
              <h2 className="font-bold text-white text-base">Pending Payments Sheet Preview</h2>
              <p className="text-xs text-slate-400">
                {customerGroups.length} Customers ({totalInvoicesCount} Invoices) | Total Pending: {currency} {grandTotalPending.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleVectorPrint}
              disabled={isPrinting}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-600 text-white hover:bg-amber-500 transition disabled:opacity-50 shadow-md"
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
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-amber-400 hover:bg-slate-700 transition"
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
              <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wide">Pending Payments Sheet</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Print Date: {nowStr}</p>
            </div>
          </div>

          {/* Filter Summary Bar */}
          <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-2.5 flex justify-between items-center text-slate-700 text-xs">
            <div>
              <span>City Filter: <strong className="text-slate-900">{cityFilterLabel}</strong></span>
              <span className="mx-2">•</span>
              <span>Date Filter: <strong className="text-slate-900">{dateFilterLabel}</strong></span>
            </div>
            <div>
              <span>Customers: <strong className="text-slate-900">{customerGroups.length}</strong></span>
              <span className="mx-2">•</span>
              <span>Total Pending: <strong className="text-amber-700">{currency} {grandTotalPending.toLocaleString()}</strong></span>
            </div>
          </div>

          {/* Customer Group Cards */}
          <div className="space-y-4">
            {customerGroups.map((group, gIdx) => (
              <div key={group.customerId || gIdx} className="border border-slate-300 rounded-lg p-4 bg-white shadow-sm space-y-3 page-break-inside-avoid">
                {/* Customer Block Header */}
                <div className="flex justify-between items-start border-b border-slate-200 pb-2">
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900 flex items-center space-x-2">
                      <span>{group.customerName}</span>
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      City: <strong className="text-slate-800">{group.cityName || 'N/A'}</strong>
                      {group.customerPhone ? ` | Ph: ${group.customerPhone}` : ''}
                      {group.customerAddress ? ` | ${group.customerAddress}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="bg-amber-100 border border-amber-300 text-amber-900 px-2.5 py-1 rounded-md font-bold text-xs">
                      Subtotal Pending: {currency} {group.customerTotalPending.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Pending Invoices Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-300 text-[11px] uppercase">
                      <tr>
                        <th className="py-2 px-3">Invoice #</th>
                        <th className="py-2 px-3">Invoice Date</th>
                        <th className="py-2 px-3 text-right">Grand Total</th>
                        <th className="py-2 px-3 text-right">Pending Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {group.items.map((item, iIdx) => {
                        const invDate = new Date(item.invoice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                        return (
                          <tr key={item.invoice.id || iIdx}>
                            <td className="py-2 px-3 font-bold text-slate-900">{item.invoice.invoice_number}</td>
                            <td className="py-2 px-3 text-slate-600">{invDate}</td>
                            <td className="py-2 px-3 text-right">{currency} {item.invoice.total_amount.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right font-extrabold text-amber-700">
                              {currency} {item.pendingAmount.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Customer Subtotal Box */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex justify-between items-center text-xs">
                  <span className="font-bold text-amber-900 uppercase">Customer Outstanding Balance</span>
                  <span className="font-extrabold text-sm text-amber-700">{currency} {group.customerTotalPending.toLocaleString()}</span>
                </div>

                {/* Handwritten Entry Box */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="font-bold text-slate-800 whitespace-nowrap w-36">Received Payment:</span>
                    <div className="border-b border-slate-400 flex-1 h-5" />
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="font-bold text-slate-800 whitespace-nowrap w-36">Remaining Payment:</span>
                    <div className="border-b border-slate-400 flex-1 h-5" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Grand Total Section */}
          <div className="bg-amber-100 border-2 border-amber-400 rounded-xl p-4 flex justify-between items-center text-slate-900 page-break-inside-avoid">
            <span className="font-extrabold text-sm text-amber-950 uppercase tracking-wide">
              Total Pending Amount (All Selected Invoices)
            </span>
            <span className="font-black text-lg text-amber-800">
              {currency} {grandTotalPending.toLocaleString()}
            </span>
          </div>

          {/* Printable Footer Signatures */}
          <div className="pt-6 border-t border-slate-300 flex justify-between text-xs text-slate-600">
            <div>
              <p>Collection Agent Signature: ______________________</p>
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
