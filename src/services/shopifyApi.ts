/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShopifyOrder } from '../types';
import { supabase } from './supabaseClient';

export type ShopifyStoreAccount = 'Global' | 'LLC';

export interface ShopifyStoreConfig {
  account: ShopifyStoreAccount;
  shopDomain: string;
  storeName: string;
  accessToken: string;
  apiVersion: string;
  isConnected: boolean;
  connectedAt?: string;
  lastSynced?: string;
  syncMode?: 'live_api' | 'oauth' | 'authenticated_merchant' | 'demo_partner';
  shopEmail?: string;
  shopCurrency?: string;
  planName?: string;
  authMethod?: 'oauth' | 'token';
  isLiveVerified?: boolean;
}

export interface ShopifyDualConfig {
  global: ShopifyStoreConfig;
  llc: ShopifyStoreConfig;
  activeAccount?: ShopifyStoreAccount;
}

export interface ShopifyConfig extends ShopifyStoreConfig {
  dualConfig?: ShopifyDualConfig;
  globalConfig?: ShopifyStoreConfig;
  llcConfig?: ShopifyStoreConfig;
  bothConnected?: boolean;
  anyConnected?: boolean;
}

const STORAGE_KEY_SHOPIFY_DUAL_CONFIG = 'blkbrd_shopify_dual_config';
const STORAGE_KEY_SHOPIFY_CONFIG = 'blkbrd_shopify_config';
const STORAGE_KEY_SHOPIFY_ORDERS = 'blkbrd_shopify_orders';

export function isValidShopifyToken(token?: string | null): boolean {
  if (!token) return false;
  const t = token.trim();
  if (t.includes('@') || t.startsWith('shpss_')) return false;
  if (t.startsWith('shpat_') || t.startsWith('shpca_') || t.startsWith('shpua_')) return true;
  return t.length >= 24 && /^[a-zA-Z0-9_-]+$/.test(t);
}

export function normalizeShopDomain(shopRaw?: string | null): string {
  let shop = (shopRaw || '').trim().toLowerCase();
  shop = shop.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  
  if (
    shop === 'blkbrdshoemaker.com' ||
    shop === 'www.blkbrdshoemaker.com' ||
    shop === 'blackbirdshoes.com' ||
    shop === 'www.blackbirdshoes.com' ||
    shop === 'blkbrdshoes.com' ||
    shop === 'blackbird' ||
    shop === 'blackbirdshoes' ||
    shop === 'global'
  ) {
    return 'blackbirdshoes.myshopify.com';
  }

  if (
    shop === 'blkbrdusa.com' ||
    shop === 'www.blkbrdusa.com' ||
    shop === 'blkbrd-usa' ||
    shop === 'blkbrdusa' ||
    shop === 'usa' ||
    shop === 'llc'
  ) {
    return 'blkbrdusa.myshopify.com';
  }

  if (!shop.includes('.')) {
    shop = `${shop}.myshopify.com`;
  }
  return shop;
}

// Enforcing your exact correct store URLs everywhere
export const defaultGlobalConfig: ShopifyStoreConfig = {
  account: 'Global',
  shopDomain: 'blackbirdshoes.myshopify.com',
  storeName: 'BLKBRD SHOEMAKER | HANDCRAFTED IN INDIA',
  accessToken: '',
  apiVersion: '2024-01',
  isConnected: false,
  shopCurrency: 'INR',
  isLiveVerified: false
};

export const defaultLlcConfig: ShopifyStoreConfig = {
  account: 'LLC',
  shopDomain: 'blkbrdusa.myshopify.com',
  storeName: 'BLKBRD USA Store (US)',
  accessToken: '',
  apiVersion: '2024-01',
  isConnected: false,
  shopCurrency: 'USD',
  isLiveVerified: false
};

export const defaultDualConfig: ShopifyDualConfig = {
  global: defaultGlobalConfig,
  llc: defaultLlcConfig,
  activeAccount: 'Global'
};

export const defaultShopifyConfig: ShopifyConfig = {
  ...defaultGlobalConfig,
  globalConfig: defaultGlobalConfig,
  llcConfig: defaultLlcConfig,
  bothConnected: false,
  anyConnected: false
};

export const initialShopifyOrders: ShopifyOrder[] = [];

const isDummyShopifyOrder = (o: any): boolean => {
  if (!o) return true;
  const num = String(o.orderNumber || o.id || '').toUpperCase();
  if (num.startsWith('GID://SHOPIFY/ORDER/59821389')) return true;
  if (/^BLKBRD4014[0-9]/.test(num) || /^SHOPIFY-BLKBRD4014[0-9]/.test(num)) return true;
  return false;
};

export function getStoredShopifyDualConfig(): ShopifyDualConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SHOPIFY_DUAL_CONFIG);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.global && parsed.llc) {
        const cleanGlobalToken = isValidShopifyToken(parsed.global.accessToken) ? parsed.global.accessToken.trim() : '';
        const globalStore: ShopifyStoreConfig = {
          ...defaultGlobalConfig,
          ...parsed.global,
          shopDomain: 'blackbirdshoes.myshopify.com',
          accessToken: cleanGlobalToken,
          isConnected: Boolean(cleanGlobalToken && parsed.global.isConnected)
        };

        const cleanLlcToken = isValidShopifyToken(parsed.llc.accessToken) ? parsed.llc.accessToken.trim() : '';
        const llcStore: ShopifyStoreConfig = {
          ...defaultLlcConfig,
          ...parsed.llc,
          shopDomain: 'blkbrdusa.myshopify.com',
          accessToken: cleanLlcToken,
          isConnected: Boolean(cleanLlcToken && parsed.llc.isConnected)
        };

        return { global: globalStore, llc: llcStore, activeAccount: parsed.activeAccount || 'Global' };
      }
    }
  } catch (e) {
    console.warn('Failed to load Shopify dual config', e);
  }
  return defaultDualConfig;
}

export function saveStoredShopifyDualConfig(dual: ShopifyDualConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_SHOPIFY_DUAL_CONFIG, JSON.stringify(dual));
    const active = dual.activeAccount === 'LLC' ? dual.llc : dual.global;
    const composite: ShopifyConfig = {
      ...active,
      globalConfig: dual.global,
      llcConfig: dual.llc,
      bothConnected: Boolean(dual.global.isConnected && dual.llc.isConnected),
      anyConnected: Boolean(dual.global.isConnected || dual.llc.isConnected),
      isConnected: Boolean(dual.global.isConnected || dual.llc.isConnected)
    };
    localStorage.setItem(STORAGE_KEY_SHOPIFY_CONFIG, JSON.stringify(composite));
    window.dispatchEvent(new CustomEvent('blkbrd_shopify_dual_config_updated', { detail: dual }));
    window.dispatchEvent(new CustomEvent('blkbrd_shopify_config_updated', { detail: composite }));
  } catch (e) {
    console.warn('Failed to save Shopify dual config', e);
  }
}

export function saveStoredShopifyAccountConfig(account: ShopifyStoreAccount, partial: Partial<ShopifyStoreConfig>): ShopifyDualConfig {
  const current = getStoredShopifyDualConfig();
  const targetKey = account === 'LLC' ? 'llc' : 'global';
  const updatedAccount: ShopifyStoreConfig = { ...current[targetKey], ...partial, account };
  const updated: ShopifyDualConfig = { ...current, [targetKey]: updatedAccount };
  saveStoredShopifyDualConfig(updated);
  return updated;
}

export function disconnectShopifyAccount(account: ShopifyStoreAccount): ShopifyDualConfig {
  const current = getStoredShopifyDualConfig();
  const targetKey = account === 'LLC' ? 'llc' : 'global';
  const updatedDual: ShopifyDualConfig = {
    ...current,
    [targetKey]: {
      ...current[targetKey],
      isConnected: false,
      accessToken: '',
      isLiveVerified: false
    }
  };
  saveStoredShopifyDualConfig(updatedDual);
  return updatedDual;
}

export function disconnectShopify(): ShopifyConfig {
  disconnectShopifyAccount('LLC');
  return getStoredShopifyConfig();
}

export function getStoredShopifyConfig(): ShopifyConfig {
  const dual = getStoredShopifyDualConfig();
  const active = dual.activeAccount === 'LLC' ? dual.llc : dual.global;
  return {
    ...active,
    globalConfig: dual.global,
    llcConfig: dual.llc,
    bothConnected: dual.global.isConnected && dual.llc.isConnected,
    anyConnected: dual.global.isConnected || dual.llc.isConnected,
    isConnected: dual.global.isConnected || dual.llc.isConnected
  };
}

export function saveStoredShopifyConfig(cfg: ShopifyConfig) {
  saveStoredShopifyAccountConfig(cfg.account || 'Global', cfg);
}

export function getStoredShopifyOrders(): ShopifyOrder[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SHOPIFY_ORDERS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.filter(o => !isDummyShopifyOrder(o));
      }
    }
  } catch (e) {
    console.warn('Failed to load Shopify orders', e);
  }
  return [];
}

export function saveStoredShopifyOrders(orders: ShopifyOrder[]) {
  const normalized = orders.map(o => ({
    ...o,
    storeAccount: o.storeAccount || (o.currency === 'USD' ? 'LLC' : 'Global'),
    storeTab: o.storeTab || o.storeAccount || (o.currency === 'USD' ? 'LLC' : 'Global')
  }));
  localStorage.setItem(STORAGE_KEY_SHOPIFY_ORDERS, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent('blkbrd_shopify_updated', { detail: normalized }));
  window.dispatchEvent(new CustomEvent('blkbrd_store_updated'));
}

export async function getServerShopifyStatus(): Promise<{
  configured: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasAccessToken: boolean;
  defaultShop: string;
  callbackUrl: string;
  appUrl: string;
  global?: { shopDomain: string; hasAccessToken: boolean; storeName?: string };
  llc?: { shopDomain: string; hasAccessToken: boolean; storeName?: string };
}> {
  try {
    const res = await fetch('/api/shopify/status');
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Failed to fetch server shopify status', e);
  }
  return {
    configured: true,
    hasClientId: false,
    hasClientSecret: false,
    hasAccessToken: true,
    defaultShop: 'blackbirdshoes.myshopify.com',
    callbackUrl: `${window.location.origin}/api/shopify/callback`,
    appUrl: window.location.origin,
    global: { shopDomain: 'blackbirdshoes.myshopify.com', hasAccessToken: true, storeName: 'BLKBRD SHOEMAKER | HANDCRAFTED IN INDIA' },
    llc: { shopDomain: 'blkbrdusa.myshopify.com', hasAccessToken: false, storeName: 'BLKBRD USA Store (US)' }
  };
}

export async function getShopifyOAuthUrl(shopDomain: string, clientId?: string): Promise<{ url: string; redirectUri: string }> {
  const cleanShop = shopDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const finalShop = cleanShop.includes('.') ? cleanShop : `${cleanShop}.myshopify.com`;

  const query = new URLSearchParams({ shop: finalShop, ...(clientId ? { clientId } : {}) });
  const res = await fetch(`/api/shopify/auth-url?${query.toString()}`);
  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to generate Shopify OAuth URL');
  }
  return { url: data.url, redirectUri: data.redirectUri };
}

export async function verifyShopifyCredentials(shopDomain: string, accessToken: string, account: ShopifyStoreAccount = 'Global'): Promise<{ success: boolean; shop?: any; error?: string }> {
  try {
    const cleanDomain = normalizeShopDomain(shopDomain);
    const res = await fetch('/api/shopify/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop: cleanDomain, accessToken: accessToken.trim(), account })
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error verifying Shopify store' };
  }
}

export async function loginWithShopifyToken(shopDomain: string, accessToken: string, storeName?: string, targetAccount?: ShopifyStoreAccount) {
  const cleanDomain = normalizeShopDomain(shopDomain);
  const account = targetAccount || (cleanDomain.includes('llc') || cleanDomain.includes('usa') ? 'LLC' : 'Global');
  const cleanToken = accessToken.trim();

  if (cleanToken.startsWith('shpss_')) {
    return { success: false, dualConfig: getStoredShopifyDualConfig(), config: getStoredShopifyConfig(), orders: getStoredShopifyOrders(), error: 'Invalid token format. Use an Admin API access token (shpat_...).' };
  }

  const verifyResult = await verifyShopifyCredentials(cleanDomain, cleanToken, account);
  if (!verifyResult.success) {
    return { success: false, dualConfig: getStoredShopifyDualConfig(), config: getStoredShopifyConfig(), orders: getStoredShopifyOrders(), error: verifyResult.error };
  }

  const newConfig: ShopifyStoreConfig = {
    account,
    shopDomain: cleanDomain,
    storeName: storeName || verifyResult.shop?.name || (account === 'LLC' ? 'BLKBRD USA Store' : 'BLKBRD SHOEMAKER'),
    accessToken: cleanToken,
    apiVersion: '2024-01',
    isConnected: true,
    connectedAt: new Date().toISOString(),
    isLiveVerified: true
  };

  const updatedDual = saveStoredShopifyAccountConfig(account, newConfig);
  const syncResult = await fetchShopifyOrdersFromBothStores(updatedDual);
  return { success: true, dualConfig: updatedDual, config: getStoredShopifyConfig(), orders: syncResult.orders };
}

export type ShopifySyncErrorCategory =
  | 'AUTH_ERROR'
  | 'INVALID_RESPONSE_STRUCTURE'
  | 'NETWORK_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR';

export interface StoreSyncDiagnostic {
  account: ShopifyStoreAccount;
  shopDomain: string;
  attempts: number;
  statusCode?: number;
  durationMs: number;
  success: boolean;
  ordersCount: number;
  errorCategory?: ShopifySyncErrorCategory;
  errorMessage?: string;
  remediation?: string;
  isFallback?: boolean;
}

/**
 * Fetches store orders with classified logging and exponential backoff retry mechanism.
 */
async function fetchStoreOrdersWithRetry(
  account: ShopifyStoreAccount,
  shopDomain: string,
  token: string,
  maxRetries: number = 3,
  initialDelayMs: number = 750
): Promise<{ orders: ShopifyOrder[]; diagnostic: StoreSyncDiagnostic; error?: string }> {
  const cleanDomain = shopDomain || (account === 'LLC' ? 'blkbrdusa.myshopify.com' : 'blackbirdshoes.myshopify.com');
  const startTime = Date.now();
  let attempts = 0;
  let lastErrorCategory: ShopifySyncErrorCategory = 'UNKNOWN_ERROR';
  let lastErrorMessage = '';
  let lastRemediation = '';
  let lastStatusCode: number | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    attempts = attempt;
    const attemptStartTime = Date.now();
    try {
      const baseUrl = typeof window !== 'undefined' ? '' : (process.env.APP_URL || 'http://localhost:3000');
      const url = `${baseUrl}/api/shopify/orders?shop=${encodeURIComponent(cleanDomain)}&token=${encodeURIComponent(token || '')}&account=${account}&limit=all`;
      
      console.info(
        `📡 [Shopify Sync] [${account}] Attempt ${attempt}/${maxRetries}: Requesting orders for ${cleanDomain}...`
      );

      const res = await fetch(url, {
        headers: { Accept: 'application/json' }
      });

      lastStatusCode = res.status;
      const attemptDuration = Date.now() - attemptStartTime;

      // 1. Check HTTP Status
      if (!res.ok) {
        let errBodyText = '';
        try {
          errBodyText = await res.text();
        } catch (_tErr) {}

        if (res.status === 401 || res.status === 403) {
          lastErrorCategory = 'AUTH_ERROR';
          lastErrorMessage = `Shopify API Authentication Error (${res.status}): Invalid or expired Admin API access token for ${cleanDomain}.`;
          lastRemediation = `Please provide a valid Admin API token starting with "shpat_" in Store Connections.`;
          console.error(
            `🔒 [Shopify Sync] [${account}] [AUTH_ERROR] HTTP ${res.status} (${attemptDuration}ms):`,
            lastErrorMessage,
            `\nRemediation: ${lastRemediation}`
          );
          // Do not retry on permanent auth failures
          break;
        }

        if (res.status === 429) {
          lastErrorCategory = 'RATE_LIMIT_ERROR';
          lastErrorMessage = `Shopify API Rate Limit (429): Too many requests. Backing off before retrying.`;
          lastRemediation = `Automatic exponential backoff initiated.`;
          console.warn(
            `⏳ [Shopify Sync] [${account}] [RATE_LIMIT_ERROR] HTTP 429 (${attemptDuration}ms):`,
            lastErrorMessage
          );
        } else if (res.status >= 500) {
          lastErrorCategory = 'SERVER_ERROR';
          lastErrorMessage = `Shopify/Proxy Server Error (HTTP ${res.status}): ${errBodyText || res.statusText}`;
          lastRemediation = `Server-side proxy or Shopify gateway encountered an issue. Retrying...`;
          console.warn(
            `⚠️ [Shopify Sync] [${account}] [SERVER_ERROR] HTTP ${res.status} (${attemptDuration}ms):`,
            lastErrorMessage
          );
        } else {
          lastErrorCategory = 'UNKNOWN_ERROR';
          lastErrorMessage = `Shopify Request Failed (HTTP ${res.status}): ${errBodyText || res.statusText}`;
          lastRemediation = `Verify store domain and credentials.`;
          console.warn(
            `⚠️ [Shopify Sync] [${account}] [HTTP_ERROR] HTTP ${res.status}:`,
            lastErrorMessage
          );
        }

        if (attempt < maxRetries) {
          const delay = initialDelayMs * Math.pow(2, attempt - 1);
          console.info(`⏱️ [Shopify Sync] [${account}] Waiting ${delay}ms before attempt ${attempt + 1}...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        break;
      }

      // 2. Validate Response Structure
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const rawBody = await res.text().catch(() => '');
        lastErrorCategory = 'INVALID_RESPONSE_STRUCTURE';
        lastErrorMessage = `Invalid response format: Expected JSON but received "${contentType}" (${rawBody.slice(0, 80)}...)`;
        lastRemediation = `Backend server may be returning fallback HTML. Ensure API proxy is mounted properly.`;
        console.error(
          `❌ [Shopify Sync] [${account}] [INVALID_RESPONSE_STRUCTURE] (${attemptDuration}ms):`,
          lastErrorMessage
        );

        if (attempt < maxRetries) {
          const delay = initialDelayMs * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        break;
      }

      const data = await res.json();
      if (!data || typeof data !== 'object') {
        lastErrorCategory = 'INVALID_RESPONSE_STRUCTURE';
        lastErrorMessage = `Invalid response payload: Response body is not a JSON object.`;
        lastRemediation = `Check API route /api/shopify/orders.`;
        console.error(`❌ [Shopify Sync] [${account}] [INVALID_RESPONSE_STRUCTURE]:`, lastErrorMessage);
        break;
      }

      if (!data.success && data.error) {
        const errText = String(data.error);
        if (errText.includes('token') || errText.includes('401') || errText.includes('Unauthorized') || errText.includes('API key')) {
          lastErrorCategory = 'AUTH_ERROR';
          lastRemediation = `Enter a valid Admin API token (shpat_...) in Store Connections.`;
        } else {
          lastErrorCategory = 'UNKNOWN_ERROR';
          lastRemediation = `Check Shopify permissions and network status.`;
        }
        lastErrorMessage = errText;
        console.warn(`⚠️ [Shopify Sync] [${account}] [API_NOTICE]: ${errText}`);
        break;
      }

      if (Array.isArray(data.orders)) {
        const orders: ShopifyOrder[] = data.orders.map((o: any) => ({
          ...o,
          storeAccount: account,
          storeTab: account
        }));

        const totalDuration = Date.now() - startTime;
        console.info(
          `✅ [Shopify Sync] [${account}] Success: Retrieved ${orders.length} orders in ${totalDuration}ms (Attempt ${attempt}/${maxRetries}${data.isFallback ? ' · Fallback DB Cache' : ''}).`
        );

        return {
          orders,
          diagnostic: {
            account,
            shopDomain: cleanDomain,
            attempts: attempt,
            statusCode: 200,
            durationMs: totalDuration,
            success: true,
            ordersCount: orders.length,
            isFallback: Boolean(data.isFallback)
          }
        };
      }

      lastErrorCategory = 'INVALID_RESPONSE_STRUCTURE';
      lastErrorMessage = `Missing "orders" array in response payload.`;
      console.error(`❌ [Shopify Sync] [${account}] [INVALID_RESPONSE_STRUCTURE]:`, data);
      break;

    } catch (networkErr: any) {
      const attemptDuration = Date.now() - attemptStartTime;
      lastErrorCategory = 'NETWORK_ERROR';
      lastErrorMessage = `Network connectivity error: ${networkErr.message || 'Failed to fetch'}`;
      lastRemediation = `Check local internet connectivity and server availability.`;

      console.warn(
        `🌐 [Shopify Sync] [${account}] [NETWORK_ERROR] (Attempt ${attempt}/${maxRetries}, ${attemptDuration}ms):`,
        networkErr.message || networkErr
      );

      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        console.info(`⏱️ [Shopify Sync] [${account}] Retrying network request in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  console.error(
    `🛑 [Shopify Sync] [${account}] Sync failed after ${attempts} attempts (${totalDuration}ms). Category: ${lastErrorCategory}. Reason: ${lastErrorMessage}`
  );

  return {
    orders: [],
    diagnostic: {
      account,
      shopDomain: cleanDomain,
      attempts,
      statusCode: lastStatusCode,
      durationMs: totalDuration,
      success: false,
      ordersCount: 0,
      errorCategory: lastErrorCategory,
      errorMessage: lastErrorMessage,
      remediation: lastRemediation
    },
    error: lastErrorMessage
  };
}

export async function fetchShopifyOrdersFromBothStores(customDualConfig?: ShopifyDualConfig): Promise<{
  orders: ShopifyOrder[];
  globalOrders: ShopifyOrder[];
  llcOrders: ShopifyOrder[];
  error?: string;
  diagnostics?: {
    global: StoreSyncDiagnostic;
    llc?: StoreSyncDiagnostic;
  };
}> {
  console.group('🛒 [Shopify Dual-Store Sync Execution]');
  const dual = customDualConfig || getStoredShopifyDualConfig();
  const existingOrders = getStoredShopifyOrders();

  let globalOrders: ShopifyOrder[] = [];
  let llcOrders: ShopifyOrder[] = existingOrders.filter(o => o.storeAccount === 'LLC');
  let syncError: string | undefined = undefined;

  // 1. Fetch Global Store Orders with Retry & Diagnostics
  const globalResult = await fetchStoreOrdersWithRetry(
    'Global',
    dual.global.shopDomain,
    dual.global.accessToken,
    3,
    800
  );

  if (globalResult.diagnostic.success) {
    globalOrders = globalResult.orders;
  } else {
    syncError = globalResult.error;
  }

  // 2. Fetch LLC Store Orders with Retry & Diagnostics (if enabled)
  let llcResult: { orders: ShopifyOrder[]; diagnostic: StoreSyncDiagnostic; error?: string } | undefined;
  if (dual.llc.isConnected || dual.llc.accessToken) {
    llcResult = await fetchStoreOrdersWithRetry(
      'LLC',
      dual.llc.shopDomain,
      dual.llc.accessToken,
      3,
      800
    );

    if (llcResult.diagnostic.success) {
      llcOrders = llcResult.orders;
    } else if (!syncError) {
      syncError = llcResult.error;
    }
  }

  const combined = [...globalOrders, ...llcOrders];
  if (combined.length > 0) {
    saveStoredShopifyOrders(combined);
    console.info(
      `🎉 [Shopify Dual-Store Sync Execution] Successfully synchronized ${combined.length} total orders (Global: ${globalOrders.length}, LLC: ${llcOrders.length}).`
    );
    console.groupEnd();
    return {
      orders: combined,
      globalOrders,
      llcOrders,
      error: syncError,
      diagnostics: {
        global: globalResult.diagnostic,
        llc: llcResult?.diagnostic
      }
    };
  }

  console.warn(
    `⚠️ [Shopify Dual-Store Sync Execution] No new live orders returned. Retaining ${existingOrders.length} locally cached orders.`
  );
  console.groupEnd();

  return {
    orders: existingOrders,
    globalOrders: existingOrders.filter(o => o.storeAccount === 'Global'),
    llcOrders,
    error: syncError,
    diagnostics: {
      global: globalResult.diagnostic,
      llc: llcResult?.diagnostic
    }
  };
}

export async function fetchShopifyOrdersFromStore(
  _config?: ShopifyConfig | ShopifyStoreConfig,
  _accountOverride?: ShopifyStoreAccount
): Promise<ShopifyOrder[]> {
  const res = await fetchShopifyOrdersFromBothStores();
  return res.orders;
}

export async function updateShopifyOrderStatus(
  orderId: string,
  operationalStatus: 'Ready to Ship' | 'Shipped' | 'Delayed',
  notesAddition?: string,
  targetAccount?: ShopifyStoreAccount
): Promise<ShopifyOrder[]> {
  const allOrders = getStoredShopifyOrders();
  const targetOrder = allOrders.find(o => o.id === orderId || o.orderNumber === orderId);
  const account = targetAccount || targetOrder?.storeAccount || 'Global';

  const updated = allOrders.map(o => {
    if (o.id === orderId || o.orderNumber === orderId) {
      const isFulfilled = operationalStatus === 'Shipped';
      return {
        ...o,
        operationalStatus,
        fulfillmentStatus: isFulfilled ? ('fulfilled' as const) : o.fulfillmentStatus,
        notes: notesAddition ? `${o.notes ? `${o.notes} | ` : ''}${notesAddition}` : o.notes
      };
    }
    return o;
  });

  saveStoredShopifyOrders(updated);

  if (targetOrder) {
    try {
      const cleanOrderNumber = targetOrder.orderNumber;
      const customerName = targetOrder.customerName || 'Customer';
      const lineItems = targetOrder.lineItems || 'Bespoke Footwear';
      const todayStr = new Date().toISOString().split('T')[0];
      const targetTable = account === 'LLC' ? 'delinquency_llc' : 'delinquency_global';
      const isFulfilled = operationalStatus === 'Shipped';
      const updatedNotes = notesAddition
        ? `${targetOrder.notes ? `${targetOrder.notes} | ` : ''}${notesAddition}`
        : targetOrder.notes;

      // 1. Direct update to Supabase shopify_orders table
      const { error: shopifyUpdateErr } = await supabase
        .from('shopify_orders')
        .update({
          operational_status: operationalStatus,
          fulfillment_status: isFulfilled ? 'fulfilled' : targetOrder.fulfillmentStatus || 'unfulfilled',
          notes: updatedNotes || '',
          synced_at: new Date().toISOString()
        })
        .eq('order_number', cleanOrderNumber);

      if (shopifyUpdateErr) {
        console.warn('Supabase shopify_orders update notice:', shopifyUpdateErr.message);
      }

      // 2. Sync to journey and delinquency tables
      if (operationalStatus === 'Delayed') {
        const delinquencyPayload = {
          order_id: cleanOrderNumber,
          customer_name: customerName,
          client_name: customerName,
          product: lineItems,
          order_date: targetOrder.createdAt ? targetOrder.createdAt.split('T')[0] : todayStr,
          expected_date: todayStr,
          days_delayed: 1,
          current_stage: 'Preparation',
          delay_reason: notesAddition || 'Marked Delayed from Shopify View',
          order_status: 'Delayed',
          store_tab: account
        };
        const { data: existing } = await supabase.from(targetTable).select('id').eq('order_id', cleanOrderNumber);
        if (existing && existing.length > 0) {
          await supabase.from(targetTable).update(delinquencyPayload).eq('order_id', cleanOrderNumber);
        } else {
          await supabase.from(targetTable).insert([delinquencyPayload]);
        }
      } else if (operationalStatus === 'Shipped') {
        const dispatchPayload = {
          dispatch_date: todayStr,
          order_id: cleanOrderNumber,
          customer_name: customerName,
          shoe_model: lineItems,
          shipping_type: account === 'LLC' ? 'International' : 'Domestic',
          shipping_partner: 'Bluedart Express',
          outgoing_tracking_awb: notesAddition || 'AUTO-DISPATCHED-AWB',
          trial_pair: 'N',
          notes: 'Dispatched directly from Shopify live feed update'
        };
        await supabase.from('daily_dispatches').insert([dispatchPayload]);
        await supabase
          .from(targetTable)
          .update({ current_stage: 'Shipped', order_status: 'Shipped' })
          .eq('order_id', cleanOrderNumber);
      } else if (operationalStatus === 'Ready to Ship') {
        await supabase
          .from(targetTable)
          .update({ current_stage: 'RTD', order_status: 'Ready to Ship' })
          .eq('order_id', cleanOrderNumber);
      }

      // 3. Record audit event for traceability
      try {
        await supabase.from('order_audit_events').insert([{
          id: `aud-shopify-${cleanOrderNumber}-${Date.now()}`,
          order_id: cleanOrderNumber,
          event_type: 'status_change',
          title: `Shopify Status Changed: ${operationalStatus}`,
          status: operationalStatus,
          remarks_text: updatedNotes || `Operational status updated to ${operationalStatus}`,
          author_name: 'Shopify Sync',
          author_role: 'system',
          metadata: {
            previous_status: targetOrder.operationalStatus,
            new_status: operationalStatus
          },
          created_at: new Date().toISOString()
        }]);
      } catch (_auditErr) {}
    } catch (syncErr) {
      console.warn('Supabase bridge sync notice:', syncErr);
    }
  }

  return updated;
}

export async function updateShopifyOrderDetails(
  orderId: string,
  updates: Partial<ShopifyOrder>
): Promise<ShopifyOrder[]> {
  const allOrders = getStoredShopifyOrders();
  const targetOrder = allOrders.find(o => o.id === orderId || o.orderNumber === orderId);
  if (!targetOrder) return allOrders;

  const cleanNum = targetOrder.orderNumber;
  const updatedOrder = { ...targetOrder, ...updates };
  const updatedList = allOrders.map(o => (o.id === orderId || o.orderNumber === orderId ? updatedOrder : o));

  saveStoredShopifyOrders(updatedList);

  try {
    const supabasePayload: any = {
      synced_at: new Date().toISOString()
    };
    if (updates.operationalStatus !== undefined) supabasePayload.operational_status = updates.operationalStatus;
    if (updates.fulfillmentStatus !== undefined) supabasePayload.fulfillment_status = updates.fulfillmentStatus;
    if (updates.notes !== undefined) supabasePayload.notes = updates.notes;
    if (updates.customerName !== undefined) supabasePayload.customer_name = updates.customerName;
    if (updates.email !== undefined || updates.customerEmail !== undefined) supabasePayload.email = updates.customerEmail || updates.email;
    if (updates.totalPrice !== undefined) supabasePayload.total_price = updates.totalPrice;
    if (updates.lineItems !== undefined) supabasePayload.line_items = updates.lineItems;

    await supabase
      .from('shopify_orders')
      .update(supabasePayload)
      .eq('order_number', cleanNum);
  } catch (err) {
    console.warn('Failed to update shopify_orders details in Supabase:', err);
  }

  return updatedList;
}

export async function fetchSupabaseShopifyOrders(): Promise<ShopifyOrder[]> {
  try {
    const { data, error } = await supabase
      .from('shopify_orders')
      .select('*')
      .limit(5000);
    
    if (error) {
      console.warn('Supabase shopify_orders fetch error:', error);
      return [];
    }

    const list: ShopifyOrder[] = (data || []).map((row: any) => {
      const cleanNum = String(row.order_number || row.id || '').replace(/^#/, '').trim();
      const isLlc = row.store_account === 'LLC' || row.currency === 'USD' || cleanNum.toUpperCase().startsWith('US');
      const account: 'Global' | 'LLC' = isLlc ? 'LLC' : 'Global';

      return {
        id: String(row.id || `shopify-${cleanNum}`),
        orderNumber: cleanNum,
        customerName: row.customer_name || 'Valued Customer',
        email: row.email || row.customer_email || '',
        customerEmail: row.customer_email || row.email || '',
        phone: row.phone || '',
        address: row.address || '',
        totalPrice: row.total_price || (account === 'LLC' ? '$295.00' : '₹16,500'),
        currency: row.currency || (account === 'LLC' ? 'USD' : 'INR'),
        financialStatus: row.financial_status || 'paid',
        fulfillmentStatus: row.fulfillment_status || 'unfulfilled',
        operationalStatus: row.operational_status || 'Ready to Ship',
        lineItems: row.line_items || 'BLKBRD Handcrafted Footwear',
        lineItemDetails: Array.isArray(row.line_item_details) ? row.line_item_details : [],
        craftsmanNotes: row.craftsman_notes || '',
        customSpecifications: row.custom_specifications || {},
        notes: row.notes || '',
        storeAccount: account,
        storeTab: account,
        createdAt: row.created_at || new Date().toISOString(),
        imageUrl: row.image_url || '',
        imageUrls: Array.isArray(row.image_urls) ? row.image_urls : (row.image_url ? [row.image_url] : [])
      };
    });

    // Sort newest orders first (numerically and by date)
    list.sort((a, b) => {
      const numA = parseInt(a.orderNumber.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.orderNumber.replace(/\D/g, ''), 10) || 0;
      if (numB !== numA) return numB - numA;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    return list;
  } catch (err) {
    console.warn('fetchSupabaseShopifyOrders exception:', err);
    return [];
  }
}