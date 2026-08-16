'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  FolderTree,
  Scale,
  Building2,
  Users,
  FileText,
  BarChart3,
  Settings,
  Cloud,
  Menu,
  X,
  PlusCircle,
  FlaskConical,
  RefreshCw
} from 'lucide-react';
import { subscribeSyncStatus, SyncStatus } from '@/lib/gdrive';

import { db } from '@/lib/db';

function SidebarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ isLoggedIn: false, isSyncing: false });
  const [businessName, setBusinessName] = useState('Qureshi');
  const [businessTagline, setBusinessTagline] = useState('Sharbat & Majoons');

  useEffect(() => {
    const unsubscribe = subscribeSyncStatus((status) => {
      setSyncStatus(status);
    });

    async function loadBusinessDetails() {
      try {
        const nameSetting = await db.settings.get('business_name');
        const taglineSetting = await db.settings.get('business_tagline');
        if (nameSetting?.value) setBusinessName(nameSetting.value);
        if (taglineSetting?.value) setBusinessTagline(taglineSetting.value);
      } catch (err) {
        console.error("Error loading sidebar business settings:", err);
      }
    }

    loadBusinessDetails();
    const interval = setInterval(loadBusinessDetails, 2000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Billing & Invoices', href: '/invoices', icon: FileText },
    { name: 'Products & Stock', href: '/products', icon: Package },
    { name: 'Customers', href: '/customers', icon: Users },
    { name: 'Sales Analytics', href: '/sales', icon: BarChart3 },
    { name: 'Settings & Cloud', href: '/settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Top Navbar Header */}
      <div className="lg:hidden no-print fixed top-0 left-0 right-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:text-emerald-400 focus:outline-none"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-900/50">
              {businessName.charAt(0)}
            </div>
            <span className="font-bold text-lg text-white tracking-wide truncate max-w-[160px]">{businessName}</span>
          </div>
        </div>

        <Link
          href="/invoices/new"
          className="flex items-center space-x-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1.5 rounded-lg shadow-md transition"
        >
          <PlusCircle size={14} />
          <span>New Bill</span>
        </Link>
      </div>

      {/* Backdrop for mobile */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } no-print`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Business Branding */}
          <div className="p-5 border-b border-slate-800 flex items-center space-x-3 bg-slate-900/50">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-emerald-900/40">
              {businessName.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-extrabold text-white text-base tracking-tight truncate leading-tight">
                {businessName}
              </h1>
              <p className="text-[10px] font-medium text-emerald-400 mt-0.5 uppercase tracking-wider truncate">
                {businessTagline}
              </p>
            </div>
          </div>

          {/* Action Button */}
          <div className="px-4 pt-5 pb-2">
            <Link
              href="/invoices/new"
              onClick={() => setMobileOpen(false)}
              className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-900/30 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <PlusCircle size={18} />
              <span>Create New Invoice</span>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Core Modules
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-slate-800 text-emerald-400 font-semibold shadow-sm border-l-4 border-emerald-500'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon size={19} className={isActive ? 'text-emerald-400' : 'text-slate-400'} />
                    <span>{item.name}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer Status Widget */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60">
          <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className={`w-2.5 h-2.5 rounded-full ${
                syncStatus.isSyncing
                  ? 'bg-blue-400 animate-ping'
                  : syncStatus.isLoggedIn
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-amber-500'
              }`} />
              <div>
                <p className="text-xs font-semibold text-slate-200 flex items-center space-x-1">
                  <span>{syncStatus.isSyncing ? 'Syncing...' : syncStatus.isLoggedIn ? 'Google Drive Active' : 'Local Storage'}</span>
                  {syncStatus.isSyncing && <RefreshCw size={10} className="animate-spin text-emerald-400" />}
                </p>
                <p className="text-[10px] text-slate-400">
                  {syncStatus.isSyncing ? 'Uploading backup' : syncStatus.isLoggedIn ? 'Auto Cloud Sync' : 'Offline Mode'}
                </p>
              </div>
            </div>
            <Link href="/settings" className="text-slate-400 hover:text-emerald-400 p-1">
              <Cloud size={16} />
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}

export default function Sidebar() {
  return (
    <Suspense fallback={<div className="w-64 bg-slate-900 border-r border-slate-800" />}>
      <SidebarContent />
    </Suspense>
  );
}
