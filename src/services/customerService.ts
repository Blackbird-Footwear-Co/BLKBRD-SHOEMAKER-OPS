/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CustomerProfile,
  CustomerCrmQuery,
  CustomerSource,
  CustomerUnifiedOrder
} from '../types';
import { normalizeOrderId, formatBlkbrdOrderId } from '../utils/csvParser';
import { OrderLookupContext } from '../utils/customerResolver';
const CUSTOMERS_STORAGE_KEY = 'blkbrd_customers_crm_v1';

export const CRM_QUERY_TAGS = [
  'Delay Follow-up',
  'Sizing & Fit Advice',
  'Address & Shipping Update',
  'Return & Exchange',
  'Order Status Inquiry',
  'Bespoke / Customization',
  'Payment & Refund',
  'General Query'
] as const;

export const CUSTOMER_SOURCES: CustomerSource[] = [
  'Website',
  'Social Media',
  'WhatsApp',
  'Phone Call',
  'Exhibition',
  'Referral',
  'Other'
];

export const INITIAL_SEED_CUSTOMERS: CustomerProfile[] = [];

export function customerToSupabaseRow(customer: CustomerProfile) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone || '',
    email: customer.email || '',
    source: customer.source || 'Website',
    order_ids: customer.orderIds || [],
    tags: customer.tags || [],
    city: customer.city || '',
    country: customer.country || '',
    notes: customer.notes || '',
    total_spent: customer.totalSpent || '₹0',
    crm_queries: customer.crmQueries || [],
    created_at: customer.createdAt,
    updated_at: customer.updatedAt
  };
}

export function supabaseRowToCustomer(row: any): CustomerProfile {
  return {
    id: row.id,
    name: row.name || 'Client',
    phone: row.phone || '',
    email: row.email || '',
    source: (row.source as CustomerSource) || 'Website',
    orderIds: Array.isArray(row.order_ids) ? row.order_ids : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    city: row.city || '',
    country: row.country || '',
    notes: row.notes || '',
    totalSpent: row.total_spent || '₹0',
    crmQueries: Array.isArray(row.crm_queries) ? row.crm_queries : [],
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

/**
 * Asynchronously synchronizes a customer record to Supabase table `customers_crm`
 * using dedicated schema columns.
 */
export async function syncCustomerToSupabase(customer: CustomerProfile): Promise<boolean> {
  try {
    const row = customerToSupabaseRow(customer);
    const res = await fetch('/api/supabase/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'customers_crm',
        rows: [row]
      })
    });
    const result = await res.json();
    if (!res.ok || result?.error) {
      // If already exists, update the existing row
      await fetch('/api/supabase/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'customers_crm',
          values: row,
          filters: [{ col: 'id', op: 'eq', val: customer.id }]
        })
      });
    }
    return true;
  } catch (err) {
    console.warn('[customerService] Supabase sync deferred (local copy preserved):', err);
    return false;
  }
}

/**
 * Fetches all live customer profiles from Supabase table `customers_crm`
 */
export async function fetchSupabaseCustomers(): Promise<CustomerProfile[] | null> {
  try {
    const res = await fetch('/api/supabase/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'customers_crm',
        order: 'updated_at',
        ascending: false
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.data)) {
        const mapped = data.data.map(supabaseRowToCustomer);
        // Update local cache
        saveStoredCustomers(mapped);
        return mapped;
      }
    }
    return null;
  } catch (err) {
    console.warn('[customerService] Supabase customers fetch error, falling back to local storage:', err);
    return null;
  }
}

/**
 * Syncs all stored customers to Supabase in one batch operation
 */
export async function syncAllCustomersToSupabase(): Promise<{ success: boolean; count: number; error?: string }> {
  const customers = getStoredCustomers();
  if (customers.length === 0) return { success: true, count: 0 };

  try {
    const rows = customers.map(customerToSupabaseRow);
    const res = await fetch('/api/supabase/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'customers_crm',
        rows
      })
    });
    const data = await res.json();
    if (!res.ok && data?.error) {
      // Try upserting individually if batch fails
      let synced = 0;
      for (const c of customers) {
        const ok = await syncCustomerToSupabase(c);
        if (ok) synced++;
      }
      return { success: synced > 0, count: synced };
    }
    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message };
  }
}

export function getStoredCustomers(): CustomerProfile[] {
  try {
    const raw = localStorage.getItem(CUSTOMERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[customerService] Failed reading customers from storage:', e);
  }

  return [];
}

export function saveStoredCustomers(customers: CustomerProfile[]): void {
  try {
    localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(customers));
  } catch (e) {
    console.warn('[customerService] Failed writing customers to storage:', e);
  }
}

export function addCustomer(data: {
  name: string;
  phone: string;
  email: string;
  source: CustomerSource;
  orderIds: string[];
  tags?: string[];
  city?: string;
  country?: string;
  notes?: string;
  initialQuery?: {
    orderId?: string;
    tag: string;
    remarks: string;
    status: 'Open' | 'In Progress' | 'Resolved';
    agentName: string;
    agentRole: string;
  };
}): CustomerProfile {
  const customers = getStoredCustomers();
  const cleanOrderIds = Array.from(
    new Set(data.orderIds.map(id => normalizeOrderId(id)).filter(Boolean))
  );

  const newId = `cust-${Date.now()}`;
  const now = new Date().toISOString();

  const initialQueries: CustomerCrmQuery[] = [];
  if (data.initialQuery && data.initialQuery.remarks.trim()) {
    initialQueries.push({
      id: `q-${Date.now()}-1`,
      orderId: data.initialQuery.orderId ? normalizeOrderId(data.initialQuery.orderId) : undefined,
      queryDate: now,
      tag: data.initialQuery.tag || 'General Query',
      status: data.initialQuery.status || 'Open',
      remarks: data.initialQuery.remarks.trim(),
      agentName: data.initialQuery.agentName || 'CRM Team',
      agentRole: data.initialQuery.agentRole || 'admin',
      createdAt: now
    });
  }

  const newCustomer: CustomerProfile = {
    id: newId,
    name: data.name.trim(),
    phone: data.phone.trim(),
    email: data.email.trim(),
    source: data.source || 'Website',
    orderIds: cleanOrderIds,
    tags: data.tags || [],
    city: data.city?.trim() || '',
    country: data.country?.trim() || '',
    notes: data.notes?.trim() || '',
    crmQueries: initialQueries,
    createdAt: now,
    updatedAt: now
  };

  const updated = [newCustomer, ...customers];
  saveStoredCustomers(updated);
  // Asynchronously sync to Supabase customers_crm table
  syncCustomerToSupabase(newCustomer).catch(() => {});
  return newCustomer;
}

export function updateCustomer(
  id: string,
  updates: Partial<Omit<CustomerProfile, 'id' | 'createdAt'>>
): CustomerProfile | null {
  const customers = getStoredCustomers();
  const idx = customers.findIndex(c => c.id === id);
  if (idx === -1) return null;

  const existing = customers[idx];
  const updated: CustomerProfile = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString()
  };

  if (updates.orderIds) {
    updated.orderIds = Array.from(
      new Set(updates.orderIds.map(o => normalizeOrderId(o)).filter(Boolean))
    );
  }

  customers[idx] = updated;
  saveStoredCustomers(customers);
  // Asynchronously sync to Supabase customers_crm table
  syncCustomerToSupabase(updated).catch(() => {});
  return updated;
}

export function deleteCustomer(id: string): boolean {
  const customers = getStoredCustomers();
  const filtered = customers.filter(c => c.id !== id);
  if (filtered.length !== customers.length) {
    saveStoredCustomers(filtered);
    // Delete from Supabase if table exists
    fetch('/api/supabase/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'customers_crm',
        filters: [{ col: 'id', op: 'eq', val: id }]
      })
    }).catch(() => {});
    return true;
  }
  return false;
}

export function addCrmQueryToCustomer(
  customerId: string,
  queryData: {
    orderId?: string;
    tag: string;
    status: 'Open' | 'In Progress' | 'Resolved';
    remarks: string;
    resolution?: string;
    agentName: string;
    agentRole: string;
  }
): CustomerCrmQuery | null {
  const customers = getStoredCustomers();
  const cust = customers.find(c => c.id === customerId);
  if (!cust) return null;

  const now = new Date().toISOString();
  const newQuery: CustomerCrmQuery = {
    id: `q-${Date.now()}`,
    orderId: queryData.orderId ? normalizeOrderId(queryData.orderId) : undefined,
    queryDate: now,
    tag: queryData.tag || 'General Query',
    status: queryData.status || 'Open',
    remarks: queryData.remarks.trim(),
    resolution: queryData.resolution?.trim() || '',
    agentName: queryData.agentName || 'CRM Team',
    agentRole: queryData.agentRole || 'admin',
    createdAt: now,
    updatedAt: now
  };

  cust.crmQueries = [newQuery, ...(cust.crmQueries || [])];
  cust.updatedAt = now;

  // Also auto-append orderId to customer's orderIds if not already linked
  if (newQuery.orderId && !cust.orderIds.includes(newQuery.orderId)) {
    cust.orderIds.push(newQuery.orderId);
  }

  saveStoredCustomers(customers);
  // Sync updated customer with new query remark to Supabase
  syncCustomerToSupabase(cust).catch(() => {});
  return newQuery;
}

export function updateCrmQueryStatus(
  customerId: string,
  queryId: string,
  status: 'Open' | 'In Progress' | 'Resolved',
  resolution?: string
): boolean {
  const customers = getStoredCustomers();
  const cust = customers.find(c => c.id === customerId);
  if (!cust || !cust.crmQueries) return false;

  const q = cust.crmQueries.find(item => item.id === queryId);
  if (!q) return false;

  q.status = status;
  if (resolution !== undefined) {
    q.resolution = resolution.trim();
  }
  q.updatedAt = new Date().toISOString();
  cust.updatedAt = new Date().toISOString();

  saveStoredCustomers(customers);
  // Sync updated customer with resolved status to Supabase
  syncCustomerToSupabase(cust).catch(() => {});
  return true;
}

/**
 * Parses a bulk CSV uploaded by the user with customer profiles and order histories
 */
export function parseCustomerCsv(csvContent: string): {
  customers: Array<Omit<CustomerProfile, 'id' | 'createdAt' | 'updatedAt' | 'crmQueries'>>;
  errors: string[];
  skippedCount: number;
} {
  const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const errors: string[] = [];
  const parsedCustomers: Array<Omit<CustomerProfile, 'id' | 'createdAt' | 'updatedAt' | 'crmQueries'>> = [];
  let skippedCount = 0;

  if (lines.length === 0) {
    return { customers: [], errors: ['Uploaded CSV is completely empty.'], skippedCount: 0 };
  }

  // Parse header line
  const headerLine = lines[0];
  const headers = parseCsvRow(headerLine).map(h => h.trim().toLowerCase());

  // Find column indices
  const getIndex = (possibleNames: string[]): number => {
    for (const name of possibleNames) {
      const idx = headers.findIndex(h => h === name || h.includes(name));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const nameIdx = getIndex(['customer name', 'client name', 'customer', 'name', 'full name']);
  const phoneIdx = getIndex(['phone', 'mobile', 'cell', 'telephone', 'contact number', 'phone number']);
  const emailIdx = getIndex(['email', 'email address', 'mail']);
  const sourceIdx = getIndex(['source', 'channel', 'lead source', 'platform', 'origin']);
  const ordersIdx = getIndex(['orders', 'order history', 'order ids', 'order id', 'order numbers', 'shopify orders']);
  const tagsIdx = getIndex(['tags', 'labels', 'tag', 'category']);
  const notesIdx = getIndex(['notes', 'remarks', 'comments', 'description']);
  const cityIdx = getIndex(['city', 'town']);
  const countryIdx = getIndex(['country', 'region', 'nation']);

  if (nameIdx === -1 && phoneIdx === -1 && emailIdx === -1) {
    return {
      customers: [],
      errors: ['Could not detect required customer columns (Customer Name, Phone, or Email). Please check CSV header format.'],
      skippedCount: lines.length - 1
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine) continue;

    const row = parseCsvRow(rawLine);
    const name = nameIdx !== -1 ? row[nameIdx]?.trim() : '';
    const phone = phoneIdx !== -1 ? row[phoneIdx]?.trim() : '';
    const email = emailIdx !== -1 ? row[emailIdx]?.trim() : '';

    if (!name && !phone && !email) {
      skippedCount++;
      continue;
    }

    // Determine source
    let source: CustomerSource = 'Website';
    if (sourceIdx !== -1 && row[sourceIdx]) {
      const rawSource = row[sourceIdx].trim().toLowerCase();
      if (rawSource.includes('social') || rawSource.includes('instagram') || rawSource.includes('facebook') || rawSource.includes('meta')) {
        source = 'Social Media';
      } else if (rawSource.includes('whatsapp') || rawSource.includes('wa')) {
        source = 'WhatsApp';
      } else if (rawSource.includes('phone') || rawSource.includes('call')) {
        source = 'Phone Call';
      } else if (rawSource.includes('exhibit') || rawSource.includes('trunk') || rawSource.includes('fair')) {
        source = 'Exhibition';
      } else if (rawSource.includes('refer') || rawSource.includes('friend') || rawSource.includes('word')) {
        source = 'Referral';
      } else if (rawSource.includes('web') || rawSource.includes('shopify') || rawSource.includes('store')) {
        source = 'Website';
      } else {
        source = 'Other';
      }
    }

    // Parse order IDs (split by commas, semicolons, or spaces)
    const rawOrders = ordersIdx !== -1 ? row[ordersIdx]?.trim() : '';
    const country = countryIdx !== -1 ? row[countryIdx]?.trim() : '';
    const isUsStore = (country || '').toUpperCase().includes('USA') || (country || '').toUpperCase().includes('UNITED STATES');
    const orderIds = rawOrders
      ? rawOrders
          .split(/[,;|/\s]+/)
          .map(o => formatBlkbrdOrderId(o, isUsStore ? 'LLC' : undefined))
          .filter(Boolean)
      : [];

    // Parse tags
    const rawTags = tagsIdx !== -1 ? row[tagsIdx]?.trim() : '';
    const tags = rawTags
      ? rawTags.split(/[,;|]+/).map(t => t.trim()).filter(Boolean)
      : [];

    const notes = notesIdx !== -1 ? row[notesIdx]?.trim() : '';
    const city = cityIdx !== -1 ? row[cityIdx]?.trim() : '';

    parsedCustomers.push({
      name: name || (email ? email.split('@')[0] : 'Valued Customer'),
      phone: phone || '',
      email: email || '',
      source,
      orderIds: Array.from(new Set(orderIds)),
      tags,
      notes,
      city,
      country
    });
  }

  return {
    customers: parsedCustomers,
    errors,
    skippedCount
  };
}

/**
 * Standard CSV line parser with quotation mark handling
 */
function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Aggregates all orders across all application databases (Delinquency, Dispatch, Returns, Trials, Shopify)
 * for a specific customer profile.
 */
export function aggregateCustomerOrders(
  customer: CustomerProfile,
  context?: OrderLookupContext
): CustomerUnifiedOrder[] {
  const results: CustomerUnifiedOrder[] = [];
  const seenOrderIds = new Set<string>();

  const customerNameLower = customer.name.trim().toLowerCase();
  const customerEmailLower = customer.email.trim().toLowerCase();
  const customerPhoneClean = customer.phone.replace(/[^0-9]/g, '');

  const explicitNormalizedOrders = new Set(
    customer.orderIds.map(id => normalizeOrderId(id)).filter(Boolean)
  );

  const matchesCustomer = (orderCustName?: string, orderEmail?: string, orderPhone?: string, orderId?: string): boolean => {
    if (!orderId) return false;
    const cleanId = normalizeOrderId(orderId);
    if (explicitNormalizedOrders.has(cleanId)) return true;

    if (customerEmailLower && orderEmail && orderEmail.trim().toLowerCase() === customerEmailLower) {
      return true;
    }

    if (customerPhoneClean && orderPhone) {
      const cleaned = orderPhone.replace(/[^0-9]/g, '');
      if (cleaned && cleaned.length >= 7 && (cleaned.includes(customerPhoneClean) || customerPhoneClean.includes(cleaned))) {
        return true;
      }
    }

    if (orderCustName && customerNameLower && customerNameLower !== 'customer') {
      const oName = orderCustName.trim().toLowerCase();
      if (oName === customerNameLower || oName.includes(customerNameLower) || customerNameLower.includes(oName)) {
        return true;
      }
    }

    return false;
  };

  // 1. Check Shopify Orders
  if (context?.shopifyOrders) {
    for (const shopify of context.shopifyOrders) {
      const normId = normalizeOrderId(shopify.orderNumber);
      const email = (shopify as any).customerEmail || (shopify as any).email;
      const phone = (shopify as any).customerPhone || (shopify as any).phone;
      if (
        !seenOrderIds.has(normId) &&
        matchesCustomer(shopify.customerName, email, phone, shopify.orderNumber)
      ) {
        seenOrderIds.add(normId);
        let productStr = 'Bespoke Footwear';
        if (Array.isArray((shopify as any).lineItems)) {
          productStr = (shopify as any).lineItems.map((l: any) => l.title || l).join(', ');
        } else if (typeof (shopify as any).lineItems === 'string') {
          productStr = (shopify as any).lineItems;
        }

        results.push({
          orderId: shopify.orderNumber || '',
          normalizedId: normId,
          product: productStr,
          orderDate: (shopify as any).createdAt?.split('T')[0] || '',
          expectedDate: '',
          stage: 'Online Storefront',
          status: (shopify as any).financialStatus === 'paid' ? 'Paid / Confirmed' : (shopify as any).fulfillmentStatus || 'Processing',
          storeTab: (shopify as any).storeAccount || (shopify as any).storeTab || ((shopify as any).currency === 'USD' ? 'LLC' : 'Global'),
          sourceType: 'shopify',
          totalAmount: `${(shopify as any).currency || '$'}${(shopify as any).totalPrice || '0.00'}`
        });
      }
    }
  }

  // 2. Check Delinquencies
  if (context?.delinquencies) {
    for (const d of context.delinquencies as any[]) {
      const normId = normalizeOrderId(d.orderId);
      if (
        !seenOrderIds.has(normId) &&
        matchesCustomer(d.customerName || d.clientName, undefined, undefined, d.orderId)
      ) {
        seenOrderIds.add(normId);
        results.push({
          orderId: d.orderId,
          normalizedId: normId,
          product: d.product || 'Artisan Shoe Build',
          orderDate: d.orderDate,
          expectedDate: d.expectedDate,
          daysDelayed: d.daysDelayed,
          stage: d.currentStage || 'Workshop Floor',
          status: d.daysDelayed > 0 ? `Delayed (${d.daysDelayed}d)` : 'In Production',
          delayReason: d.delayReason || '',
          storeTab: d.storeTab || 'Global',
          sourceType: 'delinquency'
        });
      }
    }
  }

  // 3. Check Returns
  if (context?.returns) {
    for (const ret of context.returns as any[]) {
      const oldNorm = ret.oldOrderId ? normalizeOrderId(ret.oldOrderId) : '';
      const newNorm = ret.newOrderId ? normalizeOrderId(ret.newOrderId) : '';

      if (
        matchesCustomer(ret.clientName || ret.customerName, undefined, undefined, ret.oldOrderId || ret.newOrderId)
      ) {
        if (oldNorm && !seenOrderIds.has(oldNorm)) {
          seenOrderIds.add(oldNorm);
          results.push({
            orderId: ret.oldOrderId,
            normalizedId: oldNorm,
            product: `Return/Exchange: ${ret.type || 'Exchange'} (${ret.reason || 'Size'})`,
            orderDate: ret.initiatedDate,
            expectedDate: ret.newTargetDate,
            stage: ret.status || 'Return Initiated',
            status: ret.returnReceived === 'Yes' || ret.returnReceived === 'Y' ? 'Return Received' : 'Label Sent / In Transit',
            delayReason: ret.reason || 'Size Exchange',
            courier: ret.incomingCourier,
            trackingNo: ret.incomingTrackingNo,
            sourceType: 'return'
          });
        }
        if (newNorm && !seenOrderIds.has(newNorm)) {
          seenOrderIds.add(newNorm);
          results.push({
            orderId: ret.newOrderId,
            normalizedId: newNorm,
            product: `Replacement Pair: ${ret.newSize || 'Custom Size'}`,
            orderDate: ret.initiatedDate,
            expectedDate: ret.newTargetDate,
            stage: 'Replacement Pair Crafting',
            status: ret.replacementDone === 'Y' ? 'Completed' : 'Crafting in Workshop',
            courier: ret.incomingCourier,
            trackingNo: ret.exchangeTracking,
            sourceType: 'return'
          });
        }
      }
    }
  }

  // 4. Any remaining explicit order IDs
  for (const expId of customer.orderIds) {
    const cleanId = normalizeOrderId(expId);
    if (!seenOrderIds.has(cleanId)) {
      seenOrderIds.add(cleanId);
      results.push({
        orderId: expId.startsWith('#') ? expId : `#${expId}`,
        normalizedId: cleanId,
        product: 'Footwear Order (Recorded in CRM)',
        status: 'Linked to Profile',
        sourceType: 'uploaded'
      });
    }
  }

  return results;
}

/**
 * Exports customers to a clean, formatted CSV
 */
export function exportCustomersCsv(customers: CustomerProfile[]): string {
  const headers = [
    'Customer Name',
    'Phone',
    'Email',
    'Source',
    'Order History',
    'Tags',
    'Open Queries',
    'City',
    'Country',
    'Notes',
    'Created Date'
  ];

  const rows = customers.map(c => {
    const openQueriesCount = (c.crmQueries || []).filter(q => q.status === 'Open').length;
    return [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.phone.replace(/"/g, '""')}"`,
      `"${c.email.replace(/"/g, '""')}"`,
      `"${c.source}"`,
      `"${c.orderIds.join(', ')}"`,
      `"${(c.tags || []).join(', ')}"`,
      `"${openQueriesCount}"`,
      `"${(c.city || '').replace(/"/g, '""')}"`,
      `"${(c.country || '').replace(/"/g, '""')}"`,
      `"${(c.notes || '').replace(/"/g, '""')}"`,
      `"${c.createdAt.split('T')[0]}"`
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}