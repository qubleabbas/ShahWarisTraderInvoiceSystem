import Dexie, { Table } from 'dexie';
import { saveSqliteToOPFS } from './sqlite-opfs';
import { triggerDebouncedDriveBackup } from './gdrive';

export interface Category {
  id?: number;
  name: string;
}

export interface Unit {
  id?: number;
  name: string;
}

export interface Product {
  id?: number;
  name: string;
  category_id: number;
  unit: string; // ml, gram, piece, litre, bottle, pack, etc.
  price: number; // Sale price
  purchase_price?: number; // Purchase / cost price
  cost_price?: number; // Purchase / cost price (legacy alias)
  stock_quantity: number;
  min_stock_warning?: number;
}

export interface Customer {
  id?: number;
  name: string;
  phone: string;
  address: string;
  created_at: string;
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
}

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
  tax_percent: number;
  tax_amount: number;
  total_amount: number;
  status: 'Paid' | 'Pending' | 'Overdue';
  terms_conditions?: string;
  signature_url?: string;
  stamp_url?: string;
  created_at: string;
  due_date?: string;
  items?: InvoiceItem[];
}

export interface Setting {
  key: string;
  value: string;
}

export class QureshiDatabase extends Dexie {
  categories!: Table<Category, number>;
  units!: Table<Unit, number>;
  products!: Table<Product, number>;
  customers!: Table<Customer, number>;
  invoices!: Table<Invoice, number>;
  invoice_items!: Table<InvoiceItem, number>;
  settings!: Table<Setting, string>;

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
  }
}

export const db = new QureshiDatabase();

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
    [db.categories, db.units, db.products, db.customers, db.invoices, db.invoice_items, db.settings],
    async () => {
      const catCount = await db.categories.count();
      if (catCount > 0) return;

      const sharbatCatId = await db.categories.add({ name: 'Sharbat (Syrups)' });
      const majoonCatId = await db.categories.add({ name: 'Majoon (Herbal Pastes)' });
      const arqCatId = await db.categories.add({ name: 'Arq (Distillates)' });
      const khamiraCatId = await db.categories.add({ name: 'Khamira & Tablets' });

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
      created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    });

    const cust2 = await db.customers.add({
      name: 'Pansari Brothers Store',
      phone: '+92 321 9876543',
      address: 'Anarkali Market, Rawalpindi',
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

  notifyDbMutation();
}

/**
 * Notify all persistence channels (OPFS & Google Drive debounced auto-sync) of database mutation
 */
export async function notifyDbMutation() {
  if (typeof window === 'undefined') return;
  try {
    const json = await exportDatabaseToJSON();
    const encoder = new TextEncoder();
    await saveSqliteToOPFS(encoder.encode(json));
    triggerDebouncedDriveBackup();
  } catch (err) {
    console.error("Error saving to OPFS / Drive auto sync:", err);
  }
}

// Database Export/Import utilities for Backup/Restore
export async function exportDatabaseToJSON(): Promise<string> {
  const categories = await db.categories.toArray();
  const units = await db.units.toArray();
  const products = await db.products.toArray();
  const customers = await db.customers.toArray();
  const invoices = await db.invoices.toArray();
  const invoice_items = await db.invoice_items.toArray();
  const settings = await db.settings.toArray();

  const exportData = {
    version: 2,
    exported_at: new Date().toISOString(),
    categories,
    units,
    products,
    customers,
    invoices,
    invoice_items,
    settings
  };

  return JSON.stringify(exportData, null, 2);
}

export async function importDatabaseFromJSON(jsonString: string): Promise<boolean> {
  try {
    const data = JSON.parse(jsonString);
    if (!data || !data.categories || !data.products) {
      throw new Error("Invalid backup format");
    }

    await db.transaction('rw', [db.categories, db.units, db.products, db.customers, db.invoices, db.invoice_items, db.settings], async () => {
      await db.categories.clear();
      await db.units.clear();
      await db.products.clear();
      await db.customers.clear();
      await db.invoices.clear();
      await db.invoice_items.clear();
      await db.settings.clear();

      if (data.categories?.length) await db.categories.bulkAdd(data.categories);
      if (data.units?.length) await db.units.bulkAdd(data.units);
      if (data.products?.length) await db.products.bulkAdd(data.products);
      if (data.customers?.length) await db.customers.bulkAdd(data.customers);
      if (data.invoices?.length) await db.invoices.bulkAdd(data.invoices);
      if (data.invoice_items?.length) await db.invoice_items.bulkAdd(data.invoice_items);
      if (data.settings?.length) await db.settings.bulkAdd(data.settings);
    });

    notifyDbMutation();
    return true;
  } catch (err) {
    console.error("Failed to restore database backup:", err);
    return false;
  }
}
