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
  AlertCircle,
  PenLine,
  Stamp,
  Trash2
} from 'lucide-react';
import { db, exportDatabaseToJSON, importDatabaseFromJSON, clearAllOperationalData, clearEntireDatabase } from '@/lib/db';
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

  // Signature & Company Seal (stored once here, reused on every invoice)
  const [signatureUrl, setSignatureUrl] = useState<string>('');
  const [stampUrl, setStampUrl] = useState<string>('');
  const [includeSignature, setIncludeSignature] = useState<boolean>(true);
  const [includeStamp, setIncludeStamp] = useState<boolean>(true);

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
        const sig = await db.settings.get('default_signature_url');
        const stp = await db.settings.get('default_stamp_url');
        const showSig = await db.settings.get('default_show_signature');
        const showStp = await db.settings.get('default_show_stamp');

        if (bName) setBusinessName(bName.value);
        if (bTag) setBusinessTagline(bTag.value);
        if (bAddr) setBusinessAddress(bAddr.value);
        if (bPhone) setBusinessPhone(bPhone.value);
        if (bEmail) setBusinessEmail(bEmail.value);
        if (curr) setCurrencySymbol(curr.value);
        if (terms) setDefaultTerms(terms.value);
        if (logo) setBusinessLogoUrl(logo.value);
        if (sig) setSignatureUrl(sig.value);
        if (stp) setStampUrl(stp.value);
        if (showSig) setIncludeSignature(showSig.value === 'true');
        if (showStp) setIncludeStamp(showStp.value === 'true');

        const gIdSetting = await db.settings.get('google_client_id');
        const savedGId = gIdSetting?.value || localStorage.getItem('google_client_id') || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
        if (savedGId) {
          setGoogleClientId(savedGId);
          if (typeof window !== 'undefined') localStorage.setItem('google_client_id', savedGId);
        }

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

  function handleClientIdChange(val: string) {
    setGoogleClientId(val);
    const trimmed = val.trim();
    if (typeof window !== 'undefined') {
      localStorage.setItem('google_client_id', trimmed);
    }
    db.settings.put({ key: 'google_client_id', value: trimmed }).catch(console.error);
  }

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
      await db.settings.put({ key: 'default_signature_url', value: signatureUrl });
      await db.settings.put({ key: 'default_stamp_url', value: stampUrl });
      await db.settings.put({ key: 'default_show_signature', value: String(includeSignature) });
      await db.settings.put({ key: 'default_show_stamp', value: String(includeStamp) });
      await db.settings.put({ key: 'google_client_id', value: googleClientId.trim() });
      if (typeof window !== 'undefined') localStorage.setItem('google_client_id', googleClientId.trim());

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

  // Upload & immediately store the signature / company seal so every invoice can reuse it
  function handleSignatureStampUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'signature' | 'stamp'
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      if (!event.target?.result) return;
      const val = event.target.result as string;
      try {
        if (kind === 'signature') {
          setSignatureUrl(val);
          await db.settings.put({ key: 'default_signature_url', value: val });
          await db.settings.put({ key: 'default_show_signature', value: String(includeSignature) });
          showToast('Signature saved — it will appear on all invoices.', 'success');
        } else {
          setStampUrl(val);
          await db.settings.put({ key: 'default_stamp_url', value: val });
          await db.settings.put({ key: 'default_show_stamp', value: String(includeStamp) });
          showToast('Company seal saved — it will appear on all invoices.', 'success');
        }
      } catch (err) {
        console.error(err);
        showToast('Failed to save image.', 'error');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleRemoveSignatureStamp(kind: 'signature' | 'stamp') {
    try {
      if (kind === 'signature') {
        setSignatureUrl('');
        await db.settings.put({ key: 'default_signature_url', value: '' });
        showToast('Signature removed.', 'info');
      } else {
        setStampUrl('');
        await db.settings.put({ key: 'default_stamp_url', value: '' });
        showToast('Company seal removed.', 'info');
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleToggleInclude(kind: 'signature' | 'stamp', value: boolean) {
    if (kind === 'signature') {
      setIncludeSignature(value);
      await db.settings.put({ key: 'default_show_signature', value: String(value) });
    } else {
      setIncludeStamp(value);
      await db.settings.put({ key: 'default_show_stamp', value: String(value) });
    }
  }

  // Google OAuth Connection trigger
  function handleConnectGoogleDrive() {
    const trimmedId = googleClientId.trim();
    if (!trimmedId) {
      alert("Please enter a valid Google OAuth Client ID first.");
      return;
    }

    // Validation: Check if user accidentally entered an email address instead of an OAuth Client ID
    if (trimmedId.includes('@') || !trimmedId.includes('.apps.googleusercontent.com')) {
      alert(
        "⚠️ Invalid Google Client ID Format!\n\n" +
        "You entered an email address or invalid text. A Google OAuth Client ID is NOT your Gmail address.\n\n" +
        "It is a developer credential from Google Cloud Console that ends with '.apps.googleusercontent.com' (e.g. 123456789-xyz.apps.googleusercontent.com).\n\n" +
        "💡 Tip: If you want instant 1-click backup without setting up Google Cloud Console, use the 'Export Database (.json)' button below!"
      );
      return;
    }

    // Save permanently into DB & localStorage so it is NEVER lost
    handleClientIdChange(trimmedId);

    const client = initGoogleAuthClient(trimmedId, (token) => {
      setIsDriveConnected(true);
      setMessage({ type: 'success', text: 'Google Drive connected and Client ID saved permanently!' });
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
    setMessage({ type: 'success', text: 'Disconnected active session from Google Drive. Your saved Client ID is retained.' });
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

  async function handleClearOperationalData() {
    if (
      confirm(
        "⚠️ FRESH CLIENT HANDOVER RESET\n\nThis action will clear all sample Invoices, Invoice Items, Payments, Products, and Customers.\n\nYour categories, packaging units, cities, companies, and business settings will be kept.\n\nAre you sure you want to clean all operational data for client delivery?"
      )
    ) {
      const ok = await clearAllOperationalData();
      if (ok) {
        showToast('All operational data cleared! Database is fresh for client handover.', 'success');
        window.location.reload();
      } else {
        showToast('Failed to clear operational data.', 'error');
      }
    }
  }

  async function handleClearEntireDatabase() {
    if (
      confirm(
        "🚨 TOTAL DATABASE WIPE\n\nThis action will PERMANENTLY ERASE ALL DATA (Invoices, Customers, Products, Settings, Categories, Units, Cities, Companies).\n\nAre you sure you want to completely wipe the database?"
      )
    ) {
      const ok = await clearEntireDatabase();
      if (ok) {
        showToast('Database wiped clean.', 'success');
        window.location.reload();
      } else {
        showToast('Failed to wipe database.', 'error');
      }
    }
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

          <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold uppercase text-slate-400">
                  Google OAuth Client ID <span className="text-rose-400 font-normal text-[11px]">(Do NOT enter email address)</span>
                </label>
                {googleClientId.trim() && (
                  <span className="text-[11px] font-semibold text-emerald-400 flex items-center space-x-1">
                    <ShieldCheck size={13} />
                    <span>Saved Permanently</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mb-2">
                Must be a Google OAuth 2.0 Client ID created in Google Cloud Console ending with <code className="text-emerald-400">.apps.googleusercontent.com</code>.
              </p>
              <input
                type="text"
                placeholder="e.g. 123456789-abc.apps.googleusercontent.com"
                value={googleClientId}
                onChange={(e) => handleClientIdChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {!isDriveConnected ? (
              <button
                onClick={handleConnectGoogleDrive}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md transition flex items-center justify-center space-x-2"
              >
                <Cloud size={16} />
                <span>{googleClientId.trim() ? 'Authorize & Connect Google Drive' : 'Connect Google Drive Account'}</span>
              </button>
            ) : (
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Cloud Backup Status:</span>
                  <span className="font-semibold text-emerald-400">Active & Syncing</span>
                </div>
                {lastSynced && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Last Backup Upload:</span>
                    <span className="font-semibold text-slate-200">{new Date(lastSynced).toLocaleString()}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-1">
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

                <div className="pt-2 flex justify-between items-center text-xs">
                  <button
                    onClick={handleConnectGoogleDrive}
                    className="text-slate-400 hover:text-emerald-400 font-medium transition"
                  >
                    Re-Authorize Session
                  </button>
                  <button
                    onClick={handleDisconnectGoogle}
                    className="text-rose-400 hover:text-rose-300 font-medium flex items-center space-x-1"
                  >
                    <LogOut size={12} />
                    <span>Disconnect Active Session</span>
                  </button>
                </div>
              </div>
            )}
          </div>
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
            Default Warranty Form
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

        {/* Signature & Company Seal — stored once, applied to every invoice */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <PenLine className="text-emerald-400" size={16} />
              <span>Authorized Signature & Company Seal</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Upload these once. They are stored securely on this device and automatically applied to every new invoice.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Signature */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase text-slate-300 flex items-center space-x-1.5">
                  <PenLine size={14} className="text-emerald-400" />
                  <span>Signature</span>
                </span>
                <label className="flex items-center space-x-1.5 text-[11px] text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSignature}
                    onChange={(e) => handleToggleInclude('signature', e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>Show on invoices</span>
                </label>
              </div>

              {signatureUrl ? (
                <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg p-2">
                  <img src={signatureUrl} alt="Signature" className="h-12 max-w-[140px] object-contain bg-white rounded px-1" />
                  <button
                    type="button"
                    onClick={() => handleRemoveSignatureStamp('signature')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-900/30 transition"
                    title="Remove signature"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-800 rounded-lg cursor-pointer hover:border-emerald-500 transition">
                  <Upload size={18} className="text-slate-400 mb-1" />
                  <span className="text-[10px] text-slate-400">Upload signature image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleSignatureStampUpload(e, 'signature')}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* Stamp / Seal */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase text-slate-300 flex items-center space-x-1.5">
                  <Stamp size={14} className="text-emerald-400" />
                  <span>Company Seal</span>
                </span>
                <label className="flex items-center space-x-1.5 text-[11px] text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeStamp}
                    onChange={(e) => handleToggleInclude('stamp', e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>Show on invoices</span>
                </label>
              </div>

              {stampUrl ? (
                <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg p-2">
                  <img src={stampUrl} alt="Company Seal" className="h-12 max-w-[140px] object-contain bg-white rounded px-1" />
                  <button
                    type="button"
                    onClick={() => handleRemoveSignatureStamp('stamp')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-900/30 transition"
                    title="Remove company seal"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-800 rounded-lg cursor-pointer hover:border-emerald-500 transition">
                  <Upload size={18} className="text-slate-400 mb-1" />
                  <span className="text-[10px] text-slate-400">Upload seal / stamp image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleSignatureStampUpload(e, 'stamp')}
                    className="hidden"
                  />
                </label>
              )}
            </div>
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

      {/* Client Handover & Data Reset Zone */}
      <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-6 shadow-card space-y-4">
        <h2 className="text-lg font-bold text-rose-400 border-b border-slate-800 pb-3 flex items-center space-x-2">
          <Trash2 size={20} />
          <span>Client Delivery & Data Handover Reset</span>
        </h2>
        <p className="text-xs text-slate-400">
          Use these options to wipe test/sample data before handing the clean application over to your client.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={handleClearOperationalData}
            className="py-3 bg-amber-600/20 hover:bg-amber-600 border border-amber-500/40 text-amber-300 hover:text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-2 transition"
          >
            <RefreshCw size={16} />
            <span>Clear Invoices, Products & Customers (Fresh Start)</span>
          </button>

          <button
            type="button"
            onClick={handleClearEntireDatabase}
            className="py-3 bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-2 transition"
          >
            <Trash2 size={16} />
            <span>Wipe Entire Database (Total Reset)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
