import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import GoogleScriptLoader from '@/components/GoogleScriptLoader';
import InitDbWrapper from '@/components/InitDbWrapper';
import { ToastProvider } from '@/components/ToastProvider';

export const metadata: Metadata = {
  title: 'Qureshi - Inventory & Billing System',
  description: 'Production-grade Inventory & Billing Management System for Qureshi Sharbat, Majoon & Herbal Products',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex antialiased">
        <ToastProvider>
          <GoogleScriptLoader />
          <InitDbWrapper />
          
          {/* Main Navigation Sidebar */}
          <Sidebar />

          {/* Main Content Viewport */}
          <main className="flex-1 min-w-0 lg:pl-64 flex flex-col min-h-screen pt-14 lg:pt-0">
            <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
              {children}
            </div>
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}

