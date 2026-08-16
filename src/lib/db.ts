import Dexie, { Table } from 'dexie';
import { saveSqliteToOPFS } from './sqlite-opfs';
import { scheduleAutoSync } from './gdrive';

// Every syncable record carries `updated_at` (ms epoch), stamped automatically by
// Dexie hooks. It drives last-writer-wins merging across devices.
export interface Category {
  id?: number;
  name: string;
  updated_at?: number;
}

export interface Unit {
  id?: number;
  name: string;
  updated_at?: number;
}

export interface City {
  id?: number;
  name: string;
  created_at?: string;
  updated_at?: number;
}

export interface Company {
  id?: number;
  name: string;
  created_at?: string;
  updated_at?: number;
}

export interface Product {
  id?: number;
  name: string;
  category_id: number;
  company_id?: number;
  unit: string; // ml, gram, piece, litre, bottle, pack, etc.
  price: number; // Sale price
  purchase_price?: number; // Purchase / cost price
  cost_price?: number; // Purchase / cost price (legacy alias)
  stock_quantity: number;
  min_stock_warning?: number;
  updated_at?: number;
}

export interface Customer {
  id?: number;
  name: string;
  phone: string;
  address: string;
  city_id?: number;
  ntn_number?: string;
  stn_number?: string;
  discount_percentage?: number;
  created_at: string;
  updated_at?: number;
}

export interface InvoiceItem {
  id?: number;
  invoice_id?: number;
  product_id: number;
  product_name?: string;
  unit?: string;
  quantity: number;
  unit_price: number; // Actual sale price used in invoice
  purchase_price?: number; // Snapshot of purchase price at time of invoice creation
  item_discount: number;
  item_discount_type?: 'percent' | 'fixed';
  line_total: number;
  updated_at?: number;
}

/**
 * A reusable tax preset the user can save once and quickly apply to invoices
 * (e.g. { label: 'GST', rate: 17 }). Managed independently of any invoice.
 */
export interface TaxRate {
  id?: number;
  label: string;
  rate: number; // percentage
  updated_at?: number;
}

/**
 * A single tax line stored on an invoice. Multiple taxes can be applied,
 * each with its own label and rate; `amount` is the computed value at save time.
 */
export interface InvoiceTax {
  label: string;
  rate: number; // percentage applied to the post-discount amount
  amount: number; // computed tax amount
}

// Canonical payment status derived from recorded payments.
// 'Pending' is retained as a legacy alias for 'Unpaid' so older stored
// invoices and existing UI keep working without a breaking migration.
export type PaymentStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Overdue' | 'Pending';

export interface Invoice {
  id?: number;
  invoice_number: string;
  customer_id: number;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  subtotal: number;
  overall_discount: number;
  overall_discount_type?: 'percent' | 'fixed';
  tax_percent: number; // legacy/combined effective rate — kept for backward compat
  tax_amount: number; // total of all tax lines
  taxes?: InvoiceTax[]; // multiple named tax lines (new); absent on older invoices
  total_amount: number;
  previous_balance?: number; // Outstanding customer balance at time of invoice creation
  include_previous_balance?: boolean; // Whether previous balance was added to grand total
  status: PaymentStatus;
  amount_paid?: number; // Derived cache: sum of all payment records for this invoice
  terms_conditions?: string;
  signature_url?: string;
  stamp_url?: string;
  due_date?: string;
  created_at: string;
  updated_at?: number;
}

/**
 * A single partial (or full) payment made against an invoice.
 * Every payment is stored as its own immutable record so the complete
 * payment history is never lost and totals are always derived, never hard-coded.
 */
export interface Payment {
  id?: number;
  invoice_id: number;
  customer_id: number;
  amount: number;
  payment_date: string; // ISO datetime — carries both the date and the exact time
  method: string; // Cash, Bank Transfer, Cheque, Card, Easypaisa, JazzCash, Other...
  reference?: string; // Reference / transaction ID
  notes?: string;
  is_migrated?: boolean; // true for opening-balance records created during migration
  is_auto?: boolean; // true for convenience "paid in full" payments from a status shortcut
  created_at: string;
  updated_at?: number;
}

export interface Setting {
  key: string;
  value: string;
  updated_at?: number;
}

/**
 * A soft-delete marker. Because devices merge by unioning records, a plain local
 * delete would be resurrected by another device that still has the row. A
 * tombstone records "this key was deleted at time ts" so the delete propagates
 * and wins over any older edit of the same record.
 */
export interface Tombstone {
  table: string;
  key: number | string;
  ts: number;
}

export class QureshiDatabase extends Dexie {
  categories!: Table<Category, number>;
  units!: Table<Unit, number>;
  cities!: Table<City, number>;
  companies!: Table<Company, number>;
  products!: Table<Product, number>;
  customers!: Table<Customer, number>;
  invoices!: Table<Invoice, number>;
  invoice_items!: Table<InvoiceItem, number>;
  payments!: Table<Payment, number>;
  tax_rates!: Table<TaxRate, number>;
  settings!: Table<Setting, string>;
  tombstones!: Table<Tombstone, [string, number | string]>;

  constructor() {
    super('qureshi_inventory_db');
    this.version(2).stores({
      categories: '++id, &name',
      units: '++id, &name',
      products: '++id, name, category_id, stock_quantity',
      customers: '++id, name, phone, created_at',
      invoices: '++id, &invoice_number, customer_id, status, created_at',
      invoice_items: '++id, invoice_id, product_id',
      settings: '&key'
    });

    // v3 — Customer Ledger & partial payments. Purely additive: existing stores
    // are unchanged, so no data is lost and every prior feature keeps working.
    this.version(3).stores({
      categories: '++id, &name',
      units: '++id, &name',
      products: '++id, name, category_id, stock_quantity',
      customers: '++id, name, phone, created_at',
      invoices: '++id, &invoice_number, customer_id, status, created_at',
      invoice_items: '++id, invoice_id, product_id',
      payments: '++id, invoice_id, customer_id, payment_date, method, created_at',
      settings: '&key'
    });

    // v4 — reusable saved tax presets. Additive, non-breaking.
    this.version(4).stores({
      categories: '++id, &name',
      units: '++id, &name',
      products: '++id, name, category_id, stock_quantity',
      customers: '++id, name, phone, created_at',
      invoices: '++id, &invoice_number, customer_id, status, created_at',
      invoice_items: '++id, invoice_id, product_id',
      payments: '++id, invoice_id, customer_id, payment_date, method, created_at',
      tax_rates: '++id, &label',
      settings: '&key'
    });

    // v5 — multi-device merge sync. Adds tombstones (soft-delete markers) so
    // deletions propagate correctly instead of being resurrected by a merge.
    // Existing stores are unchanged (updated_at lives on the records, unindexed).
    this.version(5).stores({
      categories: '++id, &name',
      units: '++id, &name',
      products: '++id, name, category_id, stock_quantity',
      customers: '++id, name, phone, created_at',
      invoices: '++id, &invoice_number, customer_id, status, created_at',
      invoice_items: '++id, invoice_id, product_id',
      payments: '++id, invoice_id, customer_id, payment_date, method, created_at',
      tax_rates: '++id, &label',
      settings: '&key',
      tombstones: '&[table+key], ts'
    }).upgrade(async (tx) => {
      // Backfill a baseline updated_at on every existing record so the merge
      // engine has real timestamps to compare from the very first sync.
      const now = Date.now();
      const names = ['categories', 'units', 'products', 'customers', 'invoices', 'invoice_items', 'payments', 'tax_rates', 'settings'];
      for (const n of names) {
        try {
          await tx.table(n).toCollection().modify((r: any) => {
            if (r.updated_at === undefined) r.updated_at = now;
          });
        } catch {
          /* table may not exist in very old DBs — ignore */
        }
      }
    });

    // v6 — Cities module & customer enhancements (city_id, ntn_number, discount_percentage)
    this.version(6).stores({
      categories: '++id, &name',
      units: '++id, &name',
      cities: '++id, &name',
      products: '++id, name, category_id, stock_quantity',
      customers: '++id, name, phone, city_id, created_at',
      invoices: '++id, &invoice_number, customer_id, status, created_at',
      invoice_items: '++id, invoice_id, product_id',
      payments: '++id, invoice_id, customer_id, payment_date, method, created_at',
      tax_rates: '++id, &label',
      settings: '&key',
      tombstones: '&[table+key], ts'
    }).upgrade(async (tx) => {
      const now = Date.now();
      const names = ['categories', 'units', 'cities', 'products', 'customers', 'invoices', 'invoice_items', 'payments', 'tax_rates', 'settings'];
      for (const n of names) {
        try {
          await tx.table(n).toCollection().modify((r: any) => {
            if (r.updated_at === undefined) r.updated_at = now;
          });
        } catch {
          /* table may not exist in very old DBs — ignore */
        }
      }
    });

    // v7 — Company module & product company linkage (company_id)
    this.version(7).stores({
      categories: '++id, &name',
      units: '++id, &name',
      cities: '++id, &name',
      companies: '++id, &name',
      products: '++id, name, category_id, company_id, stock_quantity',
      customers: '++id, name, phone, city_id, created_at',
      invoices: '++id, &invoice_number, customer_id, status, created_at',
      invoice_items: '++id, invoice_id, product_id',
      payments: '++id, invoice_id, customer_id, payment_date, method, created_at',
      tax_rates: '++id, &label',
      settings: '&key',
      tombstones: '&[table+key], ts'
    }).upgrade(async (tx) => {
      const now = Date.now();
      const names = ['categories', 'units', 'cities', 'companies', 'products', 'customers', 'invoices', 'invoice_items', 'payments', 'tax_rates', 'settings'];
      for (const n of names) {
        try {
          await tx.table(n).toCollection().modify((r: any) => {
            if (r.updated_at === undefined) r.updated_at = now;
          });
        } catch {
          /* table may not exist in very old DBs — ignore */
        }
      }
    });

    // v9 — Include customer previous pending balance in invoice
    this.version(9).stores({
      categories: '++id, &name',
      units: '++id, &name',
      cities: '++id, &name',
      companies: '++id, &name',
      products: '++id, name, category_id, company_id, stock_quantity',
      customers: '++id, name, phone, city_id, created_at',
      invoices: '++id, &invoice_number, customer_id, status, created_at',
      invoice_items: '++id, invoice_id, product_id',
      payments: '++id, invoice_id, customer_id, payment_date, method, created_at',
      tax_rates: '++id, &label',
      settings: '&key',
      tombstones: '&[table+key], ts'
    }).upgrade(async (tx) => {
      const now = Date.now();
      const names = ['categories', 'units', 'cities', 'companies', 'products', 'customers', 'invoices', 'invoice_items', 'payments', 'tax_rates', 'settings'];
      for (const n of names) {
        try {
          await tx.table(n).toCollection().modify((r: any) => {
            if (r.updated_at === undefined) r.updated_at = now;
          });
        } catch {
          /* table may not exist in very old DBs — ignore */
        }
      }
    });
  }
}

export const db = new QureshiDatabase();

// ---------------------------------------------------------------------------
// Multi-device sync primitives
// ---------------------------------------------------------------------------

// Tables that participate in cross-device merge (everything except tombstones).
export const SYNC_TABLES = [
  'categories',
  'units',
  'cities',
  'companies',
  'products',
  'customers',
  'invoices',
  'invoice_items',
  'payments',
  'tax_rates',
  'settings',
] as const;

function primaryKeyName(tableName: string): string {
  return tableName === 'settings' ? 'key' : 'id';
}

// While a merge / bulk restore is applying remote data we suspend the auto-sync
// trigger and the updated_at stamping-that-overrides so remote timestamps and
// tombstone bookkeeping are preserved verbatim.
let suspendSync = false;
export function isSyncSuspended() {
  return suspendSync;
}
export async function withSyncSuspended<T>(fn: () => Promise<T>): Promise<T> {
  const prev = suspendSync;
  suspendSync = true;
  try {
    return await fn();
  } finally {
    suspendSync = prev;
  }
}

// A stable per-device id (handy for debugging / future per-device logs).
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2) + '-' + (Date.now() % 1e7).toString(36);
    localStorage.setItem('device_id', id);
  }
  return id;
}

// Lightweight event bus so open screens can refresh after a background pull
// applies remote changes.
type DataChangedListener = () => void;
const dataChangedListeners = new Set<DataChangedListener>();
export function subscribeDataChanged(fn: DataChangedListener): () => void {
  dataChangedListeners.add(fn);
  return () => dataChangedListeners.delete(fn);
}
export function emitDataChanged() {
  dataChangedListeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error('dataChanged listener error:', err);
    }
  });
}

/**
 * Record a soft-delete marker so the deletion propagates across devices.
 * Call this whenever a syncable record is physically removed.
 */
export async function recordTombstone(table: string, key: number | string): Promise<void> {
  try {
    await db.tombstones.put({ table, key, ts: Date.now() });
  } catch (err) {
    console.error('Failed to record tombstone:', err);
  }
}

// Install Dexie hooks: stamp updated_at on every create/update, and schedule an
// auto-sync on any change. Bulk/transaction writes are covered automatically.
function installSyncHooks() {
  for (const name of SYNC_TABLES) {
    const table = (db as any)[name] as Table<any, any>;
    table.hook('creating', function (_pk: any, obj: any) {
      if (obj && obj.updated_at === undefined) obj.updated_at = Date.now();
      if (!suspendSync) scheduleAutoSync();
    });
    table.hook('updating', function (mods: any) {
      if (!suspendSync) scheduleAutoSync();
      // Respect an explicit updated_at (set by the merge engine); otherwise bump it.
      if (mods && Object.prototype.hasOwnProperty.call(mods, 'updated_at')) return undefined;
      return { updated_at: Date.now() };
    });
    table.hook('deleting', function () {
      if (!suspendSync) scheduleAutoSync();
    });
  }
}
installSyncHooks();

// Ensures the seed routine only ever runs once per page load, even if called
// concurrently (e.g. React Strict Mode invokes effects twice in development).
let seedPromise: Promise<void> | null = null;

// Initialize default seed data if DB is empty
export async function initSeedData() {
  if (!seedPromise) {
    seedPromise = doSeed().catch(err => {
      // Reset so a genuine transient failure can be retried on a later call,
      // but a duplicate-key race simply resolves as a no-op.
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function doSeed() {
  // Run the whole check-and-insert atomically. Dexie serializes transactions on
  // the same tables, so a second concurrent call sees the committed data and the
  // `count === 0` guards short-circuit — no duplicate inserts, no ConstraintError.
  await db.transaction(
    'rw',
    [db.categories, db.units, db.cities, db.companies, db.products, db.customers, db.invoices, db.invoice_items, db.settings],
    async () => {
      const catCount = await db.categories.count();
      if (catCount > 0) return;

      const sharbatCatId = await db.categories.add({ name: 'Sharbat (Syrups)' });
      const majoonCatId = await db.categories.add({ name: 'Majoon (Herbal Pastes)' });
      const arqCatId = await db.categories.add({ name: 'Arq (Distillates)' });
      const khamiraCatId = await db.categories.add({ name: 'Khamira & Tablets' });

      // Seed Default Cities
      const lahoreId = await db.cities.add({ name: 'Lahore', created_at: new Date().toISOString() });
      const rawalpindiId = await db.cities.add({ name: 'Rawalpindi', created_at: new Date().toISOString() });
      await db.cities.bulkAdd([
        { name: 'Karachi', created_at: new Date().toISOString() },
        { name: 'Islamabad', created_at: new Date().toISOString() },
        { name: 'Gujranwala', created_at: new Date().toISOString() },
        { name: 'Faisalabad', created_at: new Date().toISOString() },
        { name: 'Multan', created_at: new Date().toISOString() },
        { name: 'Peshawar', created_at: new Date().toISOString() },
        { name: 'Quetta', created_at: new Date().toISOString() },
        { name: 'Sialkot', created_at: new Date().toISOString() }
      ]);

      // Seed Default Packaging Units
      await db.units.bulkAdd([
        { name: '800 ml bottle' },
        { name: '500 ml bottle' },
        { name: '250 gram jar' },
        { name: '150 gram jar' },
        { name: '100 gram jar' },
        { name: '50 ml' },
        { name: '20 ml' },
        { name: '10 grams' },
        { name: '1 litre' },
        { name: 'Pack of 10' }
      ]);

    // Seed Sample Products with Purchase Price (cost_price / purchase_price) & Sale Price (price)
    await db.products.bulkAdd([
      { name: 'Sharbat Bazoori Motadil', category_id: sharbatCatId, unit: '800 ml bottle', price: 480, purchase_price: 320, cost_price: 320, stock_quantity: 45, min_stock_warning: 10 },
      { name: 'Sharbat Faulad Special', category_id: sharbatCatId, unit: '800 ml bottle', price: 550, purchase_price: 370, cost_price: 370, stock_quantity: 28, min_stock_warning: 8 },
      { name: 'Sharbat Anar Shirin', category_id: sharbatCatId, unit: '500 ml bottle', price: 420, purchase_price: 280, cost_price: 280, stock_quantity: 6, min_stock_warning: 10 },
      { name: 'Majoon Shabab Awar', category_id: majoonCatId, unit: '250 gram jar', price: 1250, purchase_price: 820, cost_price: 820, stock_quantity: 15, min_stock_warning: 5 },
      { name: 'Majoon Dabeed-ul-Ward', category_id: majoonCatId, unit: '150 gram jar', price: 680, purchase_price: 450, cost_price: 450, stock_quantity: 4, min_stock_warning: 5 },
      { name: 'Arq-e-Gulab Khas', category_id: arqCatId, unit: '800 ml bottle', price: 320, purchase_price: 200, cost_price: 200, stock_quantity: 60, min_stock_warning: 15 },
      { name: 'Arq-e-Kasni', category_id: arqCatId, unit: '800 ml bottle', price: 290, purchase_price: 180, cost_price: 180, stock_quantity: 35, min_stock_warning: 10 },
      { name: 'Khamira Abresham Hakim Arshad', category_id: khamiraCatId, unit: '100 gram jar', price: 1850, purchase_price: 1200, cost_price: 1200, stock_quantity: 12, min_stock_warning: 4 },
    ]);

    // Seed Sample Customers
    const cust1 = await db.customers.add({
      name: 'Al-Madina Medical Hall',
      phone: '+92 300 1234567',
      address: 'Main Bazaar, Lahore',
      city_id: lahoreId,
      ntn_number: '1234567-8',
      discount_percentage: 5,
      created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    });

    const cust2 = await db.customers.add({
      name: 'Pansari Brothers Store',
      phone: '+92 321 9876543',
      address: 'Anarkali Market, Rawalpindi',
      city_id: rawalpindiId,
      ntn_number: '9876543-2',
      discount_percentage: 2.5,
      created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    });

    // Seed Sample Settings
    await db.settings.bulkAdd([
      { key: 'business_name', value: 'Qureshi Sharbat & Majoon House' },
      { key: 'business_tagline', value: 'Manufacturers of Pure Herbal Sharbats, Majoons & Distillates' },
      { key: 'business_address', value: '14-B Industrial Area, Station Road, Gujranwala' },
      { key: 'business_phone', value: '+92 300 8889900 / +92 55 4231100' },
      { key: 'business_email', value: 'orders@qureshisharbat.com' },
      { key: 'currency_symbol', value: 'Rs.' },
      { key: 'default_terms', value: '1. Payment due within 15 days of invoice date.\n2. Goods once sold are non-refundable.\n3. Verify bottle seals before taking delivery.' }
    ]);

    // Seed Sample Invoice
    const invId = await db.invoices.add({
      invoice_number: 'SWT-2026-001',
      customer_id: cust1,
      subtotal: 10300,
      overall_discount: 300,
      tax_percent: 5,
      tax_amount: 500,
      total_amount: 10500,
      status: 'Paid',
      terms_conditions: '1. Payment due within 15 days.\n2. Goods once sold are non-refundable.',
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      due_date: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000).toISOString()
    });

      await db.invoice_items.bulkAdd([
        { invoice_id: invId, product_id: 1, quantity: 10, unit_price: 480, purchase_price: 320, item_discount: 0, line_total: 4800 },
        { invoice_id: invId, product_id: 2, quantity: 10, unit_price: 550, purchase_price: 370, item_discount: 0, line_total: 5500 }
      ]);
    }
  );

  // Migration fallback: ensure packaging units exist for older databases that
  // were seeded before units were added. Guarded by count, so it never duplicates.
  await db.transaction('rw', [db.units], async () => {
    const unitCount = await db.units.count();
    if (unitCount === 0) {
      await db.units.bulkAdd([
        { name: '800 ml bottle' },
        { name: '500 ml bottle' },
        { name: '250 gram jar' },
        { name: '150 gram jar' },
        { name: '100 gram jar' },
        { name: '50 ml' },
        { name: '20 ml' },
        { name: '10 grams' },
        { name: '1 litre' },
        { name: 'Pack of 10' }
      ]);
    }
  });

  // Seed a few starter tax presets for new & upgraded databases. Idempotent:
  // guarded by count so it never duplicates, and users can edit/delete freely.
  await db.transaction('rw', [db.tax_rates], async () => {
    const taxCount = await db.tax_rates.count();
    if (taxCount === 0) {
      await db.tax_rates.bulkAdd([
        { label: 'GST', rate: 17 },
        { label: 'Sales Tax', rate: 5 },
      ]);
    }
  });

  // Seed starter companies for new & upgraded databases.
  await db.transaction('rw', [db.companies], async () => {
    const compCount = await db.companies.count();
    if (compCount === 0) {
      await db.companies.bulkAdd([
        { name: 'Hamdard Laboratories' },
        { name: 'Qureshi Sharbat' },
        { name: 'Qarshi Industries' },
        { name: 'Marhaba Laboratories' },
        { name: 'Saeed Ghani Herbal' },
        { name: 'Tayyebi Dawakhana' }
      ]);
    }
  });

  notifyDbMutation();
}

/**
 * Notify all persistence channels of a local database mutation. Debounced so a
 * burst of writes (e.g. a whole invoice + items + stock updates) coalesces into
 * a single OPFS snapshot and a single Drive sync. Also invoked automatically by
 * the Dexie hooks, so every mutation is covered without per-call-site wiring.
 */
let persistTimer: ReturnType<typeof setTimeout> | null = null;
export function notifyDbMutation() {
  if (typeof window === 'undefined' || suspendSync) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistToOPFS();
  }, 1000);
  scheduleAutoSync();
}

async function persistToOPFS() {
  if (typeof window === 'undefined') return;
  try {
    const json = await exportDatabaseToJSON();
    const encoder = new TextEncoder();
    await saveSqliteToOPFS(encoder.encode(json));
  } catch (err) {
    console.error('Error saving snapshot to OPFS:', err);
  }
}

// Database Export/Import utilities for Backup/Restore
export async function exportDatabaseToJSON(): Promise<string> {
  const categories = await db.categories.toArray();
  const units = await db.units.toArray();
  const cities = await db.cities.toArray();
  const companies = await db.companies.toArray();
  const products = await db.products.toArray();
  const customers = await db.customers.toArray();
  const invoices = await db.invoices.toArray();
  const invoice_items = await db.invoice_items.toArray();
  const payments = await db.payments.toArray();
  const tax_rates = await db.tax_rates.toArray();
  const settings = await db.settings.toArray();
  const tombstones = await db.tombstones.toArray();

  const exportData = {
    version: 9,
    exported_at: new Date().toISOString(),
    categories,
    units,
    cities,
    companies,
    products,
    customers,
    invoices,
    invoice_items,
    payments,
    tax_rates,
    settings,
    tombstones
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Destructive restore — replaces ALL local data with the backup. Used for a
 * fresh device (nothing local to lose) and the manual "restore from file/Drive"
 * action. For ongoing multi-device sync use mergeDatabaseFromJSON instead.
 */
export async function importDatabaseFromJSON(jsonString: string): Promise<boolean> {
  try {
    const data = JSON.parse(jsonString);
    if (!data || !data.categories || !data.products) {
      throw new Error("Invalid backup format");
    }

    await withSyncSuspended(() =>
      db.transaction('rw', [db.categories, db.units, db.cities, db.companies, db.products, db.customers, db.invoices, db.invoice_items, db.payments, db.tax_rates, db.settings, db.tombstones], async () => {
        await db.categories.clear();
        await db.units.clear();
        await db.cities.clear();
        await db.companies.clear();
        await db.products.clear();
        await db.customers.clear();
        await db.invoices.clear();
        await db.invoice_items.clear();
        await db.payments.clear();
        await db.tax_rates.clear();
        await db.settings.clear();
        await db.tombstones.clear();

        if (data.categories?.length) await db.categories.bulkAdd(data.categories);
        if (data.units?.length) await db.units.bulkAdd(data.units);
        if (data.cities?.length) await db.cities.bulkAdd(data.cities);
        if (data.companies?.length) await db.companies.bulkAdd(data.companies);
        if (data.products?.length) await db.products.bulkAdd(data.products);
        if (data.customers?.length) await db.customers.bulkAdd(data.customers);
        if (data.invoices?.length) await db.invoices.bulkAdd(data.invoices);
        if (data.invoice_items?.length) await db.invoice_items.bulkAdd(data.invoice_items);
        if (data.payments?.length) await db.payments.bulkAdd(data.payments);
        if (data.tax_rates?.length) await db.tax_rates.bulkAdd(data.tax_rates);
        if (data.settings?.length) await db.settings.bulkAdd(data.settings);
        if (data.tombstones?.length) await db.tombstones.bulkAdd(data.tombstones);
      })
    );

    await persistToOPFS();
    emitDataChanged();
    return true;
  } catch (err) {
    console.error("Failed to restore database backup:", err);
    return false;
  }
}

/**
 * Non-destructive MERGE of a remote backup into the local database, used for
 * multi-device sync. Semantics (last-writer-wins per record + tombstones):
 *   - A record present on both sides keeps whichever has the newer updated_at.
 *   - A record only on one side is kept (union) — so nothing is lost.
 *   - A tombstone (delete) wins over any equal-or-older edit of the same record,
 *     but a NEWER edit wins over an older delete (record was recreated/edited).
 * Returns whether anything changed locally (to decide if the UI should refresh).
 */
export async function mergeDatabaseFromJSON(jsonString: string): Promise<{ changed: boolean }> {
  const data = JSON.parse(jsonString);
  if (!data) return { changed: false };

  let changed = false;
  const tkey = (table: string, key: any) => table + ' ' + JSON.stringify(key);

  // Remote tombstones -> map of table+key => ts
  const remoteTombstones: Tombstone[] = Array.isArray(data.tombstones) ? data.tombstones : [];
  const remoteDel = new Map<string, number>();
  for (const t of remoteTombstones) remoteDel.set(tkey(t.table, t.key), t.ts);

  await withSyncSuspended(() =>
    db.transaction(
      'rw',
      [db.categories, db.units, db.cities, db.companies, db.products, db.customers, db.invoices, db.invoice_items, db.payments, db.tax_rates, db.settings, db.tombstones],
      async () => {
        // Local tombstones -> map
        const localTombstones = await db.tombstones.toArray();
        const localDel = new Map<string, number>();
        for (const t of localTombstones) localDel.set(tkey(t.table, t.key), t.ts);

        for (const name of SYNC_TABLES) {
          const store = (db as any)[name] as Table<any, any>;
          const pk = primaryKeyName(name);
          const remoteRows: any[] = Array.isArray(data[name]) ? data[name] : [];
          if (!remoteRows.length) continue;

          const localRows = await store.toArray();
          const localMap = new Map<string, any>();
          for (const r of localRows) localMap.set(String(r[pk]), r);

          for (const rr of remoteRows) {
            const keyVal = rr[pk];
            const k = tkey(name, keyVal);
            const rUpdated = Number(rr.updated_at) || 0;
            const delTs = Math.max(localDel.get(k) || 0, remoteDel.get(k) || 0);

            // A delete at/after this row's version means the row is gone.
            if (delTs > 0 && delTs >= rUpdated) {
              if (localMap.has(String(keyVal))) {
                await store.delete(keyVal);
                changed = true;
              }
              continue;
            }

            const lr = localMap.get(String(keyVal));
            const lUpdated = lr ? Number(lr.updated_at) || 0 : -1;
            if (!lr || rUpdated > lUpdated) {
              await store.put(rr);
              changed = true;
            }
          }
        }

        // Reconcile tombstones: keep the newest ts per key, delete any local row
        // that a delete supersedes, and drop a tombstone that a newer edit beats.
        for (const [k, ts] of remoteDel) {
          const sep = k.indexOf(' ');
          const tbl = k.slice(0, sep);
          const keyVal = JSON.parse(k.slice(sep + 1));
          const store = (db as any)[tbl] as Table<any, any> | undefined;
          if (!store) continue;

          const localTs = localDel.get(k) || 0;
          const lr = await store.get(keyVal);
          const lrUpdated = lr ? Number(lr.updated_at) || 0 : 0;

          if (lr && lrUpdated > ts) {
            // Record was edited/recreated after the delete — the edit wins.
            await db.tombstones.where('[table+key]').equals([tbl, keyVal]).delete();
            continue;
          }
          if (lr) {
            await store.delete(keyVal);
            changed = true;
          }
          if (ts > localTs) {
            await db.tombstones.put({ table: tbl, key: keyVal, ts });
          }
        }
      }
    )
  );

  if (changed) {
    await persistToOPFS();
    emitDataChanged();
  }
  return { changed };
}

/**
 * Wipe all operational records (invoices, items, payments, products, customers, tombstones)
 * so the system is completely fresh and clean for client delivery.
 * Categories, units, cities, companies, and business settings are preserved.
 */
export async function clearAllOperationalData(): Promise<boolean> {
  try {
    await withSyncSuspended(() =>
      db.transaction(
        'rw',
        [db.invoices, db.invoice_items, db.payments, db.products, db.customers, db.tombstones],
        async () => {
          await db.invoices.clear();
          await db.invoice_items.clear();
          await db.payments.clear();
          await db.products.clear();
          await db.customers.clear();
          await db.tombstones.clear();
        }
      )
    );
    await persistToOPFS();
    emitDataChanged();
    return true;
  } catch (err) {
    console.error('Failed to clear operational data:', err);
    return false;
  }
}

/**
 * Total reset — wipes ALL tables including settings, categories, products, customers, etc.
 * Useful for complete fresh start before handing over to a new client.
 */
export async function clearEntireDatabase(): Promise<boolean> {
  try {
    await withSyncSuspended(() =>
      db.transaction(
        'rw',
        [
          db.categories,
          db.units,
          db.cities,
          db.companies,
          db.products,
          db.customers,
          db.invoices,
          db.invoice_items,
          db.payments,
          db.tax_rates,
          db.settings,
          db.tombstones,
        ],
        async () => {
          await db.categories.clear();
          await db.units.clear();
          await db.cities.clear();
          await db.companies.clear();
          await db.products.clear();
          await db.customers.clear();
          await db.invoices.clear();
          await db.invoice_items.clear();
          await db.payments.clear();
          await db.tax_rates.clear();
          await db.settings.clear();
          await db.tombstones.clear();
        }
      )
    );
    await persistToOPFS();
    emitDataChanged();
    return true;
  } catch (err) {
    console.error('Failed to clear entire database:', err);
    return false;
  }
}
