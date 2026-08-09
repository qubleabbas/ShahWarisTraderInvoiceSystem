'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Cloud,
  RefreshCw,
  Download,
  Upload,
  CheckCircle,
  ShieldCheck,
  Building,
  DollarSign,
  FileText,
  LogOut,
  AlertCircle
} from 'lucide-react';
import { db, exportDatabaseToJSON, importDatabaseFromJSON } from '@/lib/db';
import { useToast } from '@/components/ToastProvider';
import {
  getStoredAccessToken,
  initGoogleAuthClient,
  uploadBackupToDrive,
  downloadAndRestoreFromDrive,
  clearAccessToken
} from '@/lib/gdrive';

export default function SettingsPage() {
  const { showToast } = useToast();

  const [googleClientId, setGoogleClientId] = useState(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''
  );
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // Business Profile Form
  const [businessName, setBusinessName] = useState('Qureshi Sharbat & Majoon House');
  const [businessTagline, setBusinessTagline] = useState('Manufacturers of Pure Herbal Sharbats, Majoons & Distillates');
  const [businessAddress, setBusinessAddress] = useState('14-B Industrial Area, Station Road, Gujranwala');
  const [businessPhone, setBusinessPhone] = useState('+92 300 8889900 / +92 55 4231100');
  const [businessEmail, setBusinessEmail] = useState('orders@qureshisharbat.com');
  const [currencySymbol, setCurrencySymbol] = useState('Rs.');
  const [defaultTerms, setDefaultTerms] = useState('1. Payment due within 15 days of invoice date.\n2. Goods once sold are non-refundable.\n3. Verify bottle seals before taking delivery.');
  const [businessLogoUrl, setBusinessLogoUrl] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const bName = await db.settings.get('business_name');
        const bTag = await db.settings.get('business_tagline');
        const bAddr = await db.settings.get('business_address');
        const bPhone = await db.settings.get('business_phone');
        const bEmail = await db.settings.get('business_email');
        const curr = await db.settings.get('currency_symbol');
        const terms = await db.settings.get('default_terms');
        const logo = await db.settings.get('business_logo_url');

        if (bName) setBusinessName(bName.value);
        if (bTag) setBusinessTagline(bTag.value);
        if (bAddr) setBusinessAddress(bAddr.value);
        if (bPhone) setBusinessPhone(bPhone.value);
        if (bEmail) setBusinessEmail(bEmail.value);
        if (curr) setCurrencySymbol(curr.value);
        if (terms) setDefaultTerms(terms.value);
        if (logo) setBusinessLogoUrl(logo.value);

        const token = getStoredAccessToken();
        setIsDriveConnected(!!token);
        setLastSynced(localStorage.getItem('gdrive_last_synced'));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  async function handleSaveBusinessProfile(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      await db.settings.put({ key: 'business_name', value: businessName });
      await db.settings.put({ key: 'business_tagline', value: businessTagline });
      await db.settings.put({ key: 'business_address', value: businessAddress });
      await db.settings.put({ key: 'business_phone', value: businessPhone });
      await db.settings.put({ key: 'business_email', value: businessEmail });
      await db.settings.put({ key: 'currency_symbol', value: currencySymbol });
      await db.settings.put({ key: 'default_terms', value: defaultTerms });
      await db.settings.put({ key: 'business_logo_url', value: businessLogoUrl });

      setMessage({ type: 'success', text: 'Business profile updated successfully!' });
      showToast('Business profile updated successfully!', 'success');
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save settings.' });
      showToast('Failed to save settings.', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const val = event.target.result as string;
        setBusinessLogoUrl(val);
        showToast('Logo image loaded. Click "Save Profile Changes" to save.', 'info');
      }
    };
    reader.readAsDataURL(file);
  }

  // Google OAuth Connection trigger
  function handleConnectGoogleDrive() {
    if (!googleClientId.trim()) {
      alert("Please enter a valid Google OAuth Client ID first.");
      return;
    }

    const client = initGoogleAuthClient(googleClientId.trim(), (token) => {
      setIsDriveConnected(true);
      setMessage({ type: 'success', text: 'Google Drive connected successfully!' });
    });

    if (client) {
      client.requestAccessToken();
    } else {
      alert("Google Identity Services library loading... Please try again in a few seconds.");
    }
  }

  function handleDisconnectGoogle() {
    clearAccessToken();
    setIsDriveConnected(false);
    setLastSynced(null);
    setMessage({ type: 'success', text: 'Disconnected from Google Drive.' });
  }

  // Force Backup Now
  async function handleForceBackup() {
    if (!isDriveConnected) {
      alert("Please connect your Google Drive account first.");
      return;
    }

    setIsSyncing(true);
    const success = await uploadBackupToDrive();
    setIsSyncing(false);

    if (success) {
      const now = new Date().toLocaleString();
      setLastSynced(now);
      setMessage({ type: 'success', text: `Backup uploaded to Google Drive at ${now}` });
    } else {
      setMessage({ type: 'error', text: 'Failed to upload backup to Drive.' });
    }
  }

  // Restore Backup
  async function handleRestoreFromDrive() {
    if (!isDriveConnected) {
      alert("Please connect your Google Drive account first.");
      return;
    }

    if (confirm("Restoring will overwrite your current local database with the latest backup from Google Drive. Continue?")) {
      setIsSyncing(true);
      const success = await downloadAndRestoreFromDrive();
      setIsSyncing(false);

      if (success) {
        setMessage({ type: 'success', text: 'Database restored successfully from Google Drive!' });
        window.location.reload();
      } else {
        setMessage({ type: 'error', text: 'Failed to find or restore backup file from Drive.' });
      }
    }
  }

  // Manual Local Export & Import
  async function handleExportLocalJSON() {
    const jsonStr = await exportDatabaseToJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Qureshi_Database_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportLocalJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content && confirm("Importing will overwrite your current local database. Proceed?")) {
        const success = await importDatabaseFromJSON(content);
        if (success) {
          alert("Database imported successfully!");
          window.location.reload();
        } else {
          alert("Invalid backup file format.");
        }
      }
    };
    reader.readAsText(file);
  }

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center space-x-3">
            <Settings className="text-emerald-400" size={28} />
            <span>Settings & Cloud Backup</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Business Info, Google Drive Sync & Local Database Management
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-sm font-semibold flex items-center space-x-2 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
          }`}
        >
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Cloud Backup Google Drive Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Cloud className="text-emerald-400" size={22} />
            <h2 className="text-lg font-bold text-white">Google Drive Cloud Backup</h2>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-extrabold ${
              isDriveConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400'
            }`}
          >
            {isDriveConnected ? 'Drive Connected' : 'Not Connected'}
          </span>
        </div>

        <div className="space-y-4 text-sm text-slate-300">
          <p className="text-xs text-slate-400 leading-relaxed">
            Connect your Google account to automatically backup your SQLite database file (`Qureshi_Inventory_Backup.json`) to your personal Google Drive. Works 100% offline and syncs in background.
          </p>

          {!isDriveConnected ? (
            <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <label className="block text-xs font-bold uppercase text-slate-400">
                Google OAuth Client ID
              </label>
              <input
                type="text"
                placeholder="e.g. 123456789-abc.apps.googleusercontent.com"
                value={googleClientId}
                onChange={(e) => setGoogleClientId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white"
              />
              <button
                onClick={handleConnectGoogleDrive}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md transition"
              >
                Connect Google Account
              </button>
            </div>
          ) : (
            <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Cloud Backup Status:</span>
                <span className="font-semibold text-emerald-400">Active</span>
              </div>
              {lastSynced && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Last Backup Upload:</span>
                  <span className="font-semibold text-slate-200">{new Date(lastSynced).toLocaleString()}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={handleForceBackup}
                  disabled={isSyncing}
                  className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 transition"
                >
                  <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                  <span>{isSyncing ? 'Syncing...' : 'Force Backup Now'}</span>
                </button>
                <button
                  onClick={handleRestoreFromDrive}
                  disabled={isSyncing}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 transition"
                >
                  <Download size={14} />
                  <span>Restore from Drive</span>
                </button>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleDisconnectGoogle}
                  className="text-xs text-rose-400 hover:text-rose-300 font-medium flex items-center space-x-1"
                >
                  <LogOut size={12} />
                  <span>Disconnect Google Account</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Business Profile Configuration */}
      <form onSubmit={handleSaveBusinessProfile} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4">
        <h2 className="text-lg font-bold text-white border-b border-slate-800 pb-3 flex items-center space-x-2">
          <Building className="text-emerald-400" size={20} />
          <span>Business Profile & Invoice Settings</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Business Name
            </label>
            <input
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Tagline / Description
            </label>
            <input
              type="text"
              value={businessTagline}
              onChange={(e) => setBusinessTagline(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
            Business Address
          </label>
          <input
            type="text"
            value={businessAddress}
            onChange={(e) => setBusinessAddress(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Phone Number(s)
            </label>
            <input
              type="text"
              value={businessPhone}
              onChange={(e) => setBusinessPhone(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={businessEmail}
              onChange={(e) => setBusinessEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Currency Symbol
            </label>
            <input
              type="text"
              value={currencySymbol}
              onChange={(e) => setCurrencySymbol(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
            Default Terms & Conditions
          </label>
          <textarea
            rows={3}
            value={defaultTerms}
            onChange={(e) => setDefaultTerms(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white"
          />
        </div>

        {/* Business Logo Upload Section */}
        <div className="pt-2 border-t border-slate-800">
          <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">
            Invoice Header Business Logo (Optional)
          </label>
          <div className="flex items-center space-x-4">
            {businessLogoUrl ? (
              <div className="flex items-center space-x-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <img src={businessLogoUrl} alt="Business Logo" className="w-12 h-12 object-contain rounded-lg bg-white p-1" />
                <div>
                  <p className="text-xs font-bold text-slate-200">Custom Logo Attached</p>
                  <button
                    type="button"
                    onClick={() => {
                      setBusinessLogoUrl('');
                      showToast('Logo removed.', 'info');
                    }}
                    className="text-[11px] text-rose-400 hover:underline mt-0.5"
                  >
                    Remove Logo
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex items-center space-x-2 px-4 py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl cursor-pointer text-xs text-slate-300 transition">
                <Upload size={16} className="text-emerald-400" />
                <span>Upload Logo Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
            )}
            <span className="text-[11px] text-slate-500 max-w-xs">
              If no logo is uploaded, the invoice template will hide the image area automatically.
            </span>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-md transition"
          >
            {isSaving ? 'Saving Profile...' : 'Save Profile Changes'}
          </button>
        </div>
      </form>

      {/* Manual Local Export / Import */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-card space-y-4">
        <h2 className="text-lg font-bold text-white border-b border-slate-800 pb-3 flex items-center space-x-2">
          <Download className="text-emerald-400" size={20} />
          <span>Manual Local Database Backup (JSON)</span>
        </h2>
        <p className="text-xs text-slate-400">
          Export your raw database as a JSON file to your computer or import a previous JSON backup manually.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={handleExportLocalJSON}
            className="py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center space-x-2 transition"
          >
            <Download size={16} />
            <span>Export Database (.json)</span>
          </button>

          <label className="py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center space-x-2 transition cursor-pointer">
            <Upload size={16} />
            <span>Import Database (.json)</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportLocalJSON}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
