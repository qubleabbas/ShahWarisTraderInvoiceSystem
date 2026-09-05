/**
 * Utility to generate and print vector PDFs using server-side @react-pdf/renderer.
 * This guarantees 100% exact layout match between exported PDF and printed PDF.
 */
export type PrintFormat = 'a4' | 'a5' | 'thermal';

export async function printVectorPdf(payloadList: any[], format: PrintFormat = 'a4'): Promise<void> {
  if (!payloadList || payloadList.length === 0) {
    throw new Error("No invoice data available to print");
  }

  const res = await fetch('/api/generate-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoices: payloadList, format })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to generate vector PDF for printing");
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  // Use hidden iframe to trigger native browser print on the generated vector PDF
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

  return new Promise((resolve) => {
    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error("Iframe print fallback to tab:", e);
          window.open(blobUrl, '_blank');
        }
        // Cleanup iframe after a short delay
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(blobUrl);
        }, 60000);
        resolve();
      }, 300);
    };
  });
}
