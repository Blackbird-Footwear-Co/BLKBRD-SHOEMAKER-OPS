import {
  ReturnItem,
  BostonStockItem,
  DispatchItem,
  DelinquencyItem,
  ShopifyOrder,
  TrialPairItem,
  ProductionRemark,
  UserProfile,
  UserRole
} from '../types';
import {
  parseReturnsCsv,
  parseDispatchCsv,
  parseDelinquencyCsv,
  normalizeOrderId
} from '../utils/csvParser';
import { calculateExpectedDate, calculateDelayDays, parseFlexibleDate, normalizeStage } from '../utils/delinquencyUtils';
import { resolveCustomerName } from '../utils/customerResolver';
import {
  SEED_RETURNS_CSV,
  SEED_DISPATCH_CSV,
  SEED_DELINQUENCY_CSV
} from '../data/seedCsv';
import { initialShopifyOrders, getStoredShopifyOrders, saveStoredShopifyOrders } from './shopifyApi';
import { initialTrialPairs } from './trialPairsData';

const KEYS = {
  USER: 'blkbrd_user_profile',
  DELINQUENCIES: 'blkbrd_delinquencies',
  DISPATCHES: 'blkbrd_dispatches',
  RETURNS: 'blkbrd_returns',
  BOSTON_STOCK: 'blkbrd_boston_stock',
  SHOPIFY: 'blkbrd_shopify_orders',
  TRIALS: 'blkbrd_trial_pairs',
  REMARKS: 'blkbrd_production_remarks',
  SHEETS_CONFIG: 'blkbrd_sheets_config'
};

export interface SheetsConfig {
  delinquencySheetId: string;
  delinquencyGlobalTab: string;
  delinquencyLlcTab: string;
  delinquencyLlcUrl?: string; // Direct link or GID to LLC tab
  delinquencyLlcGid?: string; // Direct GID for LLC tab
  returnsSheetId: string;
  returnsGlobalTab: string;
  returnsLlcTab: string;
  returnsBostonStockTab: string;
  dispatchSheetId: string;
  dispatchTab: string;
  autoSyncIntervalSec: number;
  lastSyncedAt?: string;
  isSyncing?: boolean;
  syncErrors?: Record<string, string>;
  syncCounts?: {
    delinquencyGlobal?: number;
    delinquencyLlc?: number;
    returnsGlobal?: number;
    returnsLlc?: number;
    bostonStock?: number;
    dispatch?: number;
  };
}

export const defaultSheetsConfig: SheetsConfig = {
  delinquencySheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
  delinquencyGlobalTab: 'Global',
  delinquencyLlcTab: 'LLC',
  delinquencyLlcUrl: '',
  delinquencyLlcGid: '',
  returnsSheetId: '',
  returnsGlobalTab: 'Global',
  returnsLlcTab: 'LLC',
  returnsBostonStockTab: 'Boston Stock',
  dispatchSheetId: '',
  dispatchTab: 'Daily Dispatch',
  autoSyncIntervalSec: 60,
  lastSyncedAt: new Date().toLocaleTimeString(),
  syncCounts: {
    delinquencyGlobal: 0,
    delinquencyLlc: 0,
    returnsGlobal: 0,
    returnsLlc: 0,
    bostonStock: 0,
    dispatch: 0
  }
};

export const initialBostonStock: BostonStockItem[] = [];

export const defaultUsers: Record<UserRole, UserProfile> = {
  admin: {
    email: 'crm3.blkbrdshoemaker@gmail.com',
    name: 'BLKBRD Admin (CRM3)',
    role: 'admin'
  },
  crm: {
    email: 'crm3.blkbrdshoemaker@gmail.com',
    name: 'BLKBRD CRM Manager',
    role: 'crm'
  },
  production: {
    email: 'production@blkbrdshoemaker.com',
    name: 'Production Workshop Lead',
    role: 'production'
  },
  logistics: {
    email: 'logistics@blkbrdshoemaker.com',
    name: 'Logistics & Dispatch Manager',
    role: 'logistics'
  }
};

// Initial Remarks
export const initialRemarks: ProductionRemark[] = [];

// Purge all old dummy/sample test data from localStorage
export function purgeAllDummyDataFromLocalStorage() {
  try {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(KEYS.DELINQUENCIES);
    localStorage.removeItem(KEYS.DISPATCHES);
    localStorage.removeItem(KEYS.RETURNS);
    localStorage.removeItem(KEYS.BOSTON_STOCK);
    localStorage.removeItem(KEYS.TRIALS);
    localStorage.removeItem(KEYS.SHOPIFY);
    localStorage.removeItem(KEYS.REMARKS);
    localStorage.removeItem('blkbrd_shopify_orders');
    localStorage.removeItem('blkbrd_sample_seeded_v3');
    localStorage.setItem('blkbrd_dummy_purged_clean_v4', 'true');
  } catch (e) {
    // Ignore storage restrictions
  }
}

export function resetToSampleDummyData() {
  purgeAllDummyDataFromLocalStorage();
  window.dispatchEvent(new CustomEvent('blkbrd_store_updated', { detail: { key: 'all' } }));
}

// Helper to safely read from localStorage
function readStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof window !== 'undefined' && localStorage.getItem('blkbrd_dummy_purged_clean_v4') !== 'true') {
      purgeAllDummyDataFromLocalStorage();
    }
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as T;
      if (!Array.isArray(parsed) && parsed !== null) return parsed as T;
    }
  } catch (e) {
    console.warn(`Failed reading ${key} from storage:`, e);
  }
  return fallback;
}

// Helper to write to localStorage and trigger local & cross-tab sync
function writeStorage<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('blkbrd_store_updated', { detail: { key, data } }));
  } catch (e) {
    console.warn(`Failed writing ${key} to storage:`, e);
  }
}

// Get current logged-in user
export function getCurrentUser(): UserProfile | null {
  try {
    const isSignedOut = localStorage.getItem('blkbrd_signed_out') === 'true';
    if (isSignedOut) return null;
    const raw = localStorage.getItem(KEYS.USER);
    if (raw) return JSON.parse(raw);
    return defaultUsers.admin;
  } catch (e) {
    console.warn('Failed reading user from storage:', e);
  }
  return null;
}

export function setCurrentUser(user: UserProfile | null) {
  try {
    if (user) {
      localStorage.setItem(KEYS.USER, JSON.stringify(user));
      localStorage.removeItem('blkbrd_signed_out');
    } else {
      localStorage.removeItem(KEYS.USER);
      localStorage.setItem('blkbrd_signed_out', 'true');
    }
    window.dispatchEvent(new CustomEvent('blkbrd_store_updated', { detail: { key: KEYS.USER, data: user } }));
  } catch (e) {
    console.warn(`Failed writing ${KEYS.USER} to storage:`, e);
  }
}

// Delinquencies
export function getDelinquencies(): DelinquencyItem[] {
  const items = readStorage<DelinquencyItem[]>(KEYS.DELINQUENCIES, []);
  if (!items || !Array.isArray(items) || items.length === 0) {
    return [];
  }
  return items.map(item => {
    const parsedOrderDate = parseFlexibleDate(item.orderDate);
    const effectiveOrderDate = parsedOrderDate || item.orderDate;
    let expected = parseFlexibleDate(item.expectedDate);
    if (!expected && effectiveOrderDate) {
      expected = calculateExpectedDate(effectiveOrderDate);
    }
    const cleanOrderId = (item.orderId || '').trim();
    const isLlc = item.storeTab === 'LLC' || cleanOrderId.toUpperCase().startsWith('US');
    const resolvedCustomer = resolveCustomerName(cleanOrderId, item.customerName || item.clientName);
    const isCompleted = item.orderStatus === 'Ready to Ship' || item.orderStatus === 'Shipped' || item.currentStage === 'RTD' || item.currentStage === 'Shipped';
    const computedDelay = isCompleted ? 0 : calculateDelayDays(effectiveOrderDate, expected);
    const computedStatus = isCompleted ? (item.orderStatus || 'Ready to Ship') : (computedDelay >= 1 ? 'Delayed' : 'In Production');

    return {
      ...item,
      customerName: resolvedCustomer,
      clientName: resolvedCustomer,
      orderDate: effectiveOrderDate,
      storeTab: isLlc ? 'LLC' : 'Global',
      expectedDate: expected || item.expectedDate,
      daysDelayed: computedDelay,
      currentStage: normalizeStage(item.currentStage as string),
      orderStatus: computedStatus
    };
  });
}

export function saveDelinquencies(items: DelinquencyItem[]) {
  writeStorage(KEYS.DELINQUENCIES, items);
}

export function bulkAppendDelinquencies(newItems: DelinquencyItem[]): DelinquencyItem[] {
  const current = getDelinquencies();
  const merged = [...current];

  for (const item of newItems) {
    const norm = normalizeOrderId(item.orderId);
    const existingIndex = merged.findIndex(m => normalizeOrderId(m.orderId) === norm);
    if (existingIndex >= 0) {
      merged[existingIndex] = { ...merged[existingIndex], ...item };
    } else {
      merged.unshift(item); // Add newest at top
    }
  }

  saveDelinquencies(merged);
  return merged;
}

// Dispatches
export function getDispatches(): DispatchItem[] {
  return readStorage<DispatchItem[]>(KEYS.DISPATCHES, []);
}

export function saveDispatches(items: DispatchItem[]) {
  writeStorage(KEYS.DISPATCHES, items);
}

// Returns
export function getReturns(): ReturnItem[] {
  return readStorage<ReturnItem[]>(KEYS.RETURNS, []);
}

export function saveReturns(items: ReturnItem[]) {
  writeStorage(KEYS.RETURNS, items);
}

// Boston Stock (Returned Pairs Inventory)
export function getBostonStock(): BostonStockItem[] {
  return readStorage<BostonStockItem[]>(KEYS.BOSTON_STOCK, []);
}

export function saveBostonStock(items: BostonStockItem[]) {
  writeStorage(KEYS.BOSTON_STOCK, items);
}

export function addBostonStockItem(item: Omit<BostonStockItem, 'id'>): BostonStockItem {
  const current = getBostonStock();
  const newItem: BostonStockItem = {
    ...item,
    id: `bos-${Date.now()}`
  };
  const updated = [newItem, ...current];
  saveBostonStock(updated);
  return newItem;
}

export function updateBostonStockItem(item: BostonStockItem) {
  const current = getBostonStock();
  const updated = current.map(b => (b.id === item.id ? item : b));
  saveBostonStock(updated);
}

// Shopify Orders
export function getShopifyOrders(): ShopifyOrder[] {
  return getStoredShopifyOrders();
}

export function saveShopifyOrders(items: ShopifyOrder[]) {
  saveStoredShopifyOrders(items);
  writeStorage(KEYS.SHOPIFY, items);
}

// Trial Pairs
export function getTrialPairs(): TrialPairItem[] {
  return readStorage<TrialPairItem[]>(KEYS.TRIALS, initialTrialPairs);
}

export function saveTrialPairs(items: TrialPairItem[]) {
  writeStorage(KEYS.TRIALS, items);
}

// Remarks
export function getProductionRemarks(): ProductionRemark[] {
  return readStorage<ProductionRemark[]>(KEYS.REMARKS, initialRemarks);
}

export function addProductionRemark(remark: Omit<ProductionRemark, 'id' | 'timestamp' | 'read'>) {
  const current = getProductionRemarks();
  const newRemark: ProductionRemark = {
    ...remark,
    id: `rem-${Date.now()}`,
    timestamp: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
    read: false
  };
  const updated = [newRemark, ...current];
  writeStorage(KEYS.REMARKS, updated);
  return newRemark;
}

export function markRemarkAsRead(id: string) {
  const current = getProductionRemarks();
  const updated = current.map(r => (r.id === id ? { ...r, read: true } : r));
  writeStorage(KEYS.REMARKS, updated);
}

export function markAllRemarksAsRead() {
  const current = getProductionRemarks();
  const updated = current.map(r => ({ ...r, read: true }));
  writeStorage(KEYS.REMARKS, updated);
}

// Sheets Config
export function getSheetsConfig(): SheetsConfig {
  return readStorage<SheetsConfig>(KEYS.SHEETS_CONFIG, defaultSheetsConfig);
}

export function saveSheetsConfig(cfg: SheetsConfig) {
  writeStorage(KEYS.SHEETS_CONFIG, cfg);
}
