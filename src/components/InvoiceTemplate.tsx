import React from 'react';
import { Invoice, InvoiceItem, Customer } from '@/lib/db';

interface InvoiceTemplateProps {
  invoice: Invoice;
  customer?: Customer;
  items: (InvoiceItem & { product_name?: string; category_name?: string; unit?: string })[];
  businessInfo: {
    name: string;
    tagline: string;
    address: string;
    phone: string;
    email: string;
    currency: string;
    logo_url?: string;
  };
}

export default function InvoiceTemplate({
  invoice,
  customer,
  items,
  businessInfo
}: InvoiceTemplateProps) {
  const isPaid = invoice.status === 'Paid';

  // Show signature, stamp and logo ONLY if present / uploaded by user
  const hasSignature = !!invoice.signature_url;
  const hasStamp = !!invoice.stamp_url;
  const hasLogo = !!(businessInfo.logo_url && businessInfo.logo_url.trim() !== '');

  // Calculate gross amounts and item discounts
  const grossSubtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const totalItemDiscounts = items.reduce((sum, item) => {
    if (item.item_discount_type === 'percent') {
      return sum + ((item.quantity * item.unit_price) * (item.item_discount / 100));
    }
    return sum + (item.item_discount || 0);
  }, 0);

  // Item-level discounts are already baked into each line total, so the totals
  // panel shows the net-of-item-discount figure as the Subtotal. Only a
  // whole-bill (overall) discount is surfaced as a separate discount line.
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
    <div
      id="printable-invoice"
      className="printable-area bg-white text-slate-900 p-6 sm:p-8 rounded-2xl shadow-xl max-w-4xl mx-auto relative font-sans w-full min-h-[1000px] flex flex-col justify-between"
      style={{ boxSizing: 'border-box', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
    >
      {/* Upper main content section */}
      <div className="flex-1 flex flex-col justify-start">
        {/* Top Business Header */}
        <div className="invoice-header flex flex-row justify-between items-start border-b border-slate-200 pb-4 gap-4 mb-4">
          <div className="flex items-start space-x-3.5">
            {hasLogo && (
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <img src={businessInfo.logo_url} alt="Logo" className="w-full h-full object-contain" />
              </div>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {businessInfo.name}
              </h1>
              {businessInfo.tagline && (
                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mt-0.5">
                  {businessInfo.tagline}
                </p>
              )}
              {businessInfo.address && (
                <p className="text-xs text-slate-600 mt-0.5 max-w-sm whitespace-pre-line leading-relaxed">
                  {businessInfo.address}
                </p>
              )}
              {businessInfo.phone && (
                <p className="text-xs text-slate-600 mt-0.5 font-medium">
                  Tel: {businessInfo.phone}
                </p>
              )}
              {businessInfo.email && (
                <p className="text-xs text-slate-600 mt-0.5 font-medium">
                  Email: {businessInfo.email}
                </p>
              )}
            </div>
          </div>

          {/* Top Right Header: INVOICE Label Badge & Invoice Number */}
          <div className="text-right flex flex-col items-end space-y-1 flex-shrink-0">
            <div>
              <span
                className="inline-flex items-center justify-center h-6 px-3 bg-emerald-100 text-emerald-900 text-[10px] font-black uppercase rounded-lg tracking-wider border border-emerald-200/80 leading-none pt-[1px]"
                style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
              >
                INVOICE
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight whitespace-nowrap">
              #{invoice.invoice_number}
            </h2>
            <p className="text-[11px] text-slate-500 whitespace-nowrap">
              Date: <span className="font-semibold text-slate-800">{new Date(invoice.created_at).toLocaleDateString()}</span>
            </p>
            {invoice.due_date && (
              <p className="text-[11px] text-slate-500 whitespace-nowrap">
                Due Date: <span className="font-semibold text-slate-800">{new Date(invoice.due_date).toLocaleDateString()}</span>
              </p>
            )}
          </div>
        </div>

        {/* Bill To Section */}
        <div className="mb-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">
            Billed To:
          </h3>
          <p className="font-bold text-sm text-slate-900">{customer?.name || invoice.customer_name || 'Walk-in Customer'}</p>
          <p className="text-xs text-slate-600 mt-0.5">{customer?.address || invoice.customer_address || 'No address specified'}</p>
          <p className="text-xs text-slate-600 font-medium mt-0.5">Phone: {customer?.phone || invoice.customer_phone || 'N/A'}</p>
          {(() => {
            const ntn = customer?.ntn_number?.trim();
            const stn = customer?.stn_number?.trim();
            if (!ntn && !stn) return null;
            const taxText = [ntn ? `NTN: ${ntn}` : '', stn ? `STN: ${stn}` : ''].filter(Boolean).join(' | ');
            return <p className="text-xs text-slate-600 font-medium mt-0.5">{taxText}</p>;
          })()}
        </div>

        {/* Itemized Table */}
        <table className="w-full border-collapse invoice-master-table mb-4" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead className="print-header-group" style={{ display: 'table-header-group' }}>
            <tr className="border-b-2 border-slate-900 text-[10px] uppercase font-extrabold text-slate-700 bg-slate-100/70" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
              <th className="py-2 px-2.5 text-left w-10 border-0">#</th>
              <th className="py-2 px-2.5 text-left border-0">Item Description</th>
              <th className="py-2 px-2.5 text-center w-14 border-0">Qty</th>
              <th className="py-2 px-2.5 text-right w-24 border-0">Unit Price</th>
              <th className="py-2 px-2.5 text-right w-20 border-0">Discount</th>
              <th className="py-2 px-2.5 text-right w-24 border-0">Total</th>
            </tr>
          </thead>
          <tbody className="text-xs text-slate-800">
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
                <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50/50" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                  <td className="py-2 px-2.5 font-medium text-slate-400">{idx + 1}</td>
                  <td className="py-2 px-2.5 font-bold text-slate-900">
                    {item.product_id && (
                      <span className="font-mono text-[10px] text-slate-500 font-bold mr-1.5 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                        #{item.product_id}
                      </span>
                    )}
                    {fullDescription}
                  </td>
                  <td className="py-2 px-2.5 text-center font-bold">{item.quantity}</td>
                  <td className="py-2 px-2.5 text-right">{businessInfo.currency} {item.unit_price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  <td className="py-2 px-2.5 text-right text-rose-600">
                    {item.item_discount > 0
                      ? isPercent
                        ? `${item.item_discount}%`
                        : `-${businessInfo.currency} ${item.item_discount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                      : '-'}
                  </td>
                  <td className="py-2 px-2.5 text-right font-extrabold text-slate-900">
                    {businessInfo.currency} {displayLineTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Grand Total Financial Breakdown Row */}
        <div className="flex justify-end mb-6" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          <div
            className="w-full sm:w-72 space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs"
            style={{ breakInside: 'avoid', pageBreakInside: 'avoid', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
          >
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span className="font-bold text-slate-800">{businessInfo.currency} {subtotalAfterItemDiscounts.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
            </div>

            {hasOverallDiscount && (
              <>
                <div className="flex justify-between text-rose-600 font-medium">
                  <span>
                    Bill Discount {invoice.overall_discount_type === 'percent' && invoice.overall_discount > 0 ? `(${invoice.overall_discount}%)` : ''}:
                  </span>
                  <span>-{businessInfo.currency} {overallDiscVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                </div>

                <div className="flex justify-between text-slate-700 font-semibold pt-1 border-t border-slate-200">
                  <span>Amount After Discount:</span>
                  <span className="text-slate-900">{businessInfo.currency} {amountAfterDiscount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                </div>
              </>
            )}

            {invoice.taxes && invoice.taxes.length > 0 ? (
              invoice.taxes.map((t, i) => (
                <div key={i} className="flex justify-between text-slate-600">
                  <span>{t.label} ({t.rate}%):</span>
                  <span className="font-bold text-slate-800">+{businessInfo.currency} {t.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                </div>
              ))
            ) : invoice.tax_percent > 0 ? (
              <div className="flex justify-between text-slate-600">
                <span>Tax ({invoice.tax_percent}%):</span>
                <span className="font-bold text-slate-800">+{businessInfo.currency} {invoice.tax_amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
              </div>
            ) : null}

            {invoice.include_previous_balance && (invoice.previous_balance || 0) > 0 && (
              <div className="flex justify-between text-amber-700 font-bold pt-1 border-t border-slate-200">
                <span>Pending Amount:</span>
                <span>+{businessInfo.currency} {(invoice.previous_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
              </div>
            )}

            <div className="pt-1.5 border-t border-slate-300 flex justify-between text-sm font-black text-slate-900">
              <span>Grand Total:</span>
              <span className="text-emerald-800">{businessInfo.currency} {invoice.total_amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Footer Container: Terms & Conditions & Signatures (Pushed to bottom of page on screen & fixed at bottom on print) */}
      <div className="invoice-footer-container space-y-3 pt-2.5 border-t border-slate-200 mt-auto" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
        {/* Terms & Conditions */}
        <div className="space-y-1 w-full" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700">
            WARRANTY FORM:
          </h4>
          <p
            className="text-[11px] text-slate-600 whitespace-pre-line leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-200"
            style={{ breakInside: 'avoid', pageBreakInside: 'avoid', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
          >
            {invoice.terms_conditions || '1. Payment due within 15 days of invoice date.\n2. Goods once sold are non-refundable.\n3. Verify bottle seals before taking delivery.'}
          </p>
        </div>

        {/* Signatures & Stamp Footer */}
        <div className="relative pt-1" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          {/* Paid Stamp */}
          {isPaid && (
            <div className="paid-stamp">
              PAID
            </div>
          )}

          {(hasStamp || hasSignature) && (
            <div className="flex flex-row justify-between items-end min-h-[45px] pr-32">
              {/* Stamp Box */}
              <div>
                {hasStamp && (
                  <div className="text-center space-y-0.5">
                    <img src={invoice.stamp_url} alt="Official Stamp" className="h-11 max-w-[120px] object-contain mx-auto" />
                    <p className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">Company Seal</p>
                  </div>
                )}
              </div>

              {/* Signature Box */}
              <div>
                {hasSignature && (
                  <div className="text-center space-y-0.5 min-w-[130px]">
                    <img src={invoice.signature_url} alt="Authorized Signature" className="h-9 object-contain mx-auto border-b border-slate-300 pb-0.5" />
                    <p className="text-[11px] font-bold text-slate-900">Authorized Signature</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
