import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Safe universal path resolution for CJS/ESM bundling
const __currentDirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

const app = express();

function resolvePort(): number {
  if (process.env.PORT) {
    const p = parseInt(process.env.PORT, 10);
    if (!isNaN(p) && p > 0) return p;
  }
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const p = parseInt(process.argv[portArgIndex + 1], 10);
    if (!isNaN(p) && p > 0) return p;
  }
  if (process.env.DEFAULT_APP_PORT) {
    const p = parseInt(process.env.DEFAULT_APP_PORT, 10);
    if (!isNaN(p) && p > 0) return p;
  }
  return 3000;
}

const PORT = resolvePort();
const isDevScript = process.env.npm_lifecycle_event === 'dev' || process.argv.some(arg => arg.includes('tsx'));
const isProduction = process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

function getBaseUrl(req: express.Request): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function getValidSupabaseUrl(): string {
  const envUrl = (process.env.SUPABASE_URL || '').trim();
  if (envUrl.startsWith('http://') || envUrl.startsWith('https://')) {
    return envUrl;
  }
  return 'https://sdkqxjqemomwgveydbfv.supabase.co';
}

function getValidSupabaseKey(): string {
  const envKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (envKey.length >= 10) {
    return envKey;
  }
  return 'sb_secret_3f9IS3tT_0WqMXfsoaRHXA_oi9vzWYu';
}

const SUPABASE_URL = getValidSupabaseUrl();
const SUPABASE_SERVICE_ROLE_KEY = getValidSupabaseKey();

let supabaseAdmin: any;
try {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
} catch (err: any) {
  console.warn('Supabase createClient fallback notice:', err.message);
  supabaseAdmin = {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: (rows: any) => Promise.resolve({ data: rows, error: null }),
      update: (vals: any) => Promise.resolve({ data: vals, error: null }),
      delete: () => Promise.resolve({ data: null, error: null }),
      upsert: (rows: any) => Promise.resolve({ data: rows, error: null })
    }),
    storage: {
      listBuckets: () => Promise.resolve({ data: [] }),
      createBucket: () => Promise.resolve({ data: null }),
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } })
      })
    }
  };
}

const tokenStore: Record<string, { accessToken: string; updatedAt: string; shopName?: string }> = {};
const SHOPIFY_TOKEN_STORE_FILE = path.join(process.cwd(), 'data', 'shopify_token_store.json');

// Load persistent shopify tokens if saved
try {
  if (fs.existsSync(SHOPIFY_TOKEN_STORE_FILE)) {
    const rawTokens = fs.readFileSync(SHOPIFY_TOKEN_STORE_FILE, 'utf-8');
    const parsedTokens = JSON.parse(rawTokens);
    if (parsedTokens && typeof parsedTokens === 'object') {
      Object.assign(tokenStore, parsedTokens);
    }
  }
} catch (tokErr) {
  console.warn('Notice reading shopify token store file:', tokErr);
}

function saveShopifyTokenStore() {
  try {
    const dir = path.dirname(SHOPIFY_TOKEN_STORE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SHOPIFY_TOKEN_STORE_FILE, JSON.stringify(tokenStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed saving shopify token store file:', err);
  }
}

interface CatalogCacheData {
  byId: Record<string, string>;
  byTitle: Record<string, string>;
  byHandle: Record<string, string>;
  byModel: Record<string, string>;
  byModelColor: Record<string, string>;
  lastFetched: number;
}

const PRODUCT_IMAGE_CACHE_FILE = path.join(process.cwd(), 'data', 'product_images_cache.json');

let globalImageCatalog: CatalogCacheData = {
  byId: {},
  byTitle: {},
  byHandle: {},
  byModel: {},
  byModelColor: {},
  lastFetched: 0
};

// Load persistent image catalog cache on startup
try {
  if (fs.existsSync(PRODUCT_IMAGE_CACHE_FILE)) {
    const rawCache = fs.readFileSync(PRODUCT_IMAGE_CACHE_FILE, 'utf-8');
    const parsedCache = JSON.parse(rawCache);
    if (parsedCache && typeof parsedCache === 'object' && Object.keys(parsedCache.byTitle || {}).length > 0) {
      globalImageCatalog = {
        byId: parsedCache.byId || {},
        byTitle: parsedCache.byTitle || {},
        byHandle: parsedCache.byHandle || {},
        byModel: parsedCache.byModel || {},
        byModelColor: parsedCache.byModelColor || {},
        lastFetched: parsedCache.lastFetched || Date.now()
      };
    }
  }
} catch (cacheErr) {
  console.warn('Notice reading product images cache file:', cacheErr);
}

function saveProductImageCache(catalog: CatalogCacheData) {
  try {
    const dir = path.dirname(PRODUCT_IMAGE_CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PRODUCT_IMAGE_CACHE_FILE, JSON.stringify(catalog, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed saving product image cache file:', err);
  }
}

async function getStoreProductImages(shop?: string, token?: string): Promise<CatalogCacheData> {
  const now = Date.now();
  // If cache is fresh (< 30 min) and contains data, return it
  if (Object.keys(globalImageCatalog.byTitle).length > 50 && (now - globalImageCatalog.lastFetched < 30 * 60 * 1000)) {
    return globalImageCatalog;
  }

  const shopsToFetch = ['blkbrdshoemaker.com', 'blkbrdusa.myshopify.com'];
  if (shop) {
    const clean = normalizeShop(shop);
    if (!shopsToFetch.includes(clean)) shopsToFetch.push(clean);
  }

  const byId = { ...globalImageCatalog.byId };
  const byTitle = { ...globalImageCatalog.byTitle };
  const byHandle = { ...globalImageCatalog.byHandle };
  const byModel = { ...globalImageCatalog.byModel };
  const byModelColor = { ...globalImageCatalog.byModelColor };

  for (const shopDomain of shopsToFetch) {
    let page = 1;
    while (page <= 5) {
      try {
        const publicUrl = `https://${shopDomain}/products.json?limit=250&page=${page}`;
        const res = await fetch(publicUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; BLKBRDOperationsHub/3.0)',
            'Accept': 'application/json'
          }
        });

        if (!res.ok) {
          // If public failed and token provided, try Admin API
          if (token && isValidShopifyToken(token)) {
            const adminUrl = `https://${shopDomain}/admin/api/2024-01/products.json?limit=250&fields=id,title,handle,image,images`;
            const adminRes = await fetch(adminUrl, {
              headers: {
                'X-Shopify-Access-Token': token.trim(),
                'Content-Type': 'application/json'
              }
            });
            if (adminRes.ok) {
              const data = await adminRes.json();
              indexProducts(data.products || [], byId, byTitle, byHandle, byModel, byModelColor);
            }
          }
          break;
        }

        const data = await res.json();
        const products = data.products || [];
        if (products.length === 0) break;

        indexProducts(products, byId, byTitle, byHandle, byModel, byModelColor);

        if (products.length < 250) break;
        page++;
        await new Promise(r => setTimeout(r, 60));
      } catch (err: any) {
        console.warn(`Could not index products for ${shopDomain} page ${page}:`, err.message);
        break;
      }
    }
  }

  globalImageCatalog = {
    byId,
    byTitle,
    byHandle,
    byModel,
    byModelColor,
    lastFetched: Date.now()
  };

  saveProductImageCache(globalImageCatalog);
  return globalImageCatalog;
}

function indexProducts(
  products: any[],
  byId: Record<string, string>,
  byTitle: Record<string, string>,
  byHandle: Record<string, string>,
  byModel: Record<string, string>,
  byModelColor: Record<string, string>
) {
  for (const p of products) {
    const imgUrl = p.images?.[0]?.src || p.image?.src || '';
    if (!imgUrl) continue;

    if (p.id) {
      byId[String(p.id)] = imgUrl;
    }

    if (p.handle) {
      byHandle[p.handle.toLowerCase()] = imgUrl;
    }

    if (p.title) {
      const rawTitle = p.title.trim().toLowerCase();
      byTitle[rawTitle] = imgUrl;

      const cleanTitle = rawTitle.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      byTitle[cleanTitle] = imgUrl;

      // Extract primary model name (e.g. "Dixon", "Harley", "Adele", "Meridius", "Tomahawk", "Kingston", "Edward", "Henry", "Rudyard")
      const firstWord = cleanTitle.split(' ')[0];
      if (firstWord && firstWord.length >= 3 && !['the', 'and', 'for', 'men', 'all'].includes(firstWord)) {
        if (!byModel[firstWord]) {
          byModel[firstWord] = imgUrl;
        }
      }

      // Also index model + color keywords (e.g. 'dixon brown', 'harley tan', 'adele black', 'edward toscanello')
      const colors = ['brown', 'black', 'tan', 'oxblood', 'burgundy', 'chestnut', 'cognac', 'cherry', 'wheatbuck', 'pullup', 'suede', 'bison', 'chromexcel', 'horserump', 'museum', 'teacore', 'snuff'];
      for (const col of colors) {
        if (cleanTitle.includes(col)) {
          if (firstWord && firstWord.length >= 3) {
            byModelColor[`${firstWord} ${col}`] = imgUrl;
          }
        }
      }
    }
  }
}

// Background auto-indexing on server boot
setTimeout(() => {
  getStoreProductImages().catch(e => console.warn('Background image indexing notice:', e.message));
}, 1000);

function isValidShopifyToken(token?: string | null): boolean {
  if (!token) return false;
  const t = token.trim();
  if (t.includes('@') || t.startsWith('shpss_')) return false;
  if (t.startsWith('shpat_') || t.startsWith('shpca_') || t.startsWith('shpua_')) return true;
  return t.length >= 24 && /^[a-zA-Z0-9_-]+$/.test(t);
}

const localTableStore: Record<string, any[]> = {
  delinquency_global: [],
  delinquency_llc: [],
  production_remarks: [],
  order_audit_events: [],
  customers_crm: [],
  trial_pairs: [],
  shopify_orders: [],
  returns_global: [],
  returns_llc: [],
  return_stock_in: [],
  return_stock_us: [],
  daily_dispatches: []
};

function normalizeShop(shopRaw: string): string {
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

// Cryptographic password hashing and verification
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(originalHash));
}

interface StaffUserRecord {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'production' | 'logistics' | 'crm';
  passwordHash: string;
  status: 'active' | 'disabled';
  createdAt: string;
  lastLoginAt?: string;
  department?: string;
}

const STAFF_STORAGE_FILE = path.join(process.cwd(), 'data', 'staff_users.json');

function getInitialStaffUsers(): StaffUserRecord[] {
  return [
    {
      id: 'usr-admin-1',
      name: 'Administrator (CRM3)',
      email: 'crm3.blkbrdshoemaker@gmail.com',
      role: 'admin',
      passwordHash: hashPassword('blkbrd@2026'),
      status: 'active',
      department: 'Management & Operations',
      createdAt: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'usr-crm-1',
      name: 'CRM Customer Desk',
      email: 'crm@blkbrdshoemaker.com',
      role: 'crm',
      passwordHash: hashPassword('crm@2026'),
      status: 'active',
      department: 'Customer Inquiries & Support',
      createdAt: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'usr-prod-1',
      name: 'Master Workshop Lead',
      email: 'workshop@blkbrdshoemaker.com',
      role: 'production',
      passwordHash: hashPassword('workshop@2026'),
      status: 'active',
      department: 'Handmade Workshop & Assembly',
      createdAt: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'usr-log-1',
      name: 'Logistics & Dispatch Desk',
      email: 'logistics@blkbrdshoemaker.com',
      role: 'logistics',
      passwordHash: hashPassword('logistics@2026'),
      status: 'active',
      department: 'Fulfillment & Outgoing Courier',
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ];
}

function loadStaffUsers(): StaffUserRecord[] {
  try {
    if (fs.existsSync(STAFF_STORAGE_FILE)) {
      const raw = fs.readFileSync(STAFF_STORAGE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Notice reading staff users file:', e);
  }
  const initial = getInitialStaffUsers();
  saveStaffUsers(initial);
  return initial;
}

function saveStaffUsers(users: StaffUserRecord[]) {
  try {
    const dir = path.dirname(STAFF_STORAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STAFF_STORAGE_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed saving staff users:', e);
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication Endpoint: Verify password
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const staff = loadStaffUsers();
  const user = staff.find(u => u.email.toLowerCase() === cleanEmail);

  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  if (user.status === 'disabled') {
    return res.status(403).json({ success: false, error: 'This staff account has been deactivated by the administrator.' });
  }

  const isPasswordValid = verifyPassword(String(password), user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  // Update last login timestamp
  user.lastLoginAt = new Date().toISOString();
  saveStaffUsers(staff);

  return res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      status: user.status
    }
  });
});

// Admin User Management: List all staff users (sanitized, no password hashes)
app.get('/api/admin/users', (req, res) => {
  const staff = loadStaffUsers();
  const sanitized = staff.map(({ passwordHash, ...safeUser }) => safeUser);
  res.json({ success: true, users: sanitized });
});

// Admin User Management: Create new staff account
app.post('/api/admin/users', (req, res) => {
  const { name, email, role, password, department, status } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const staff = loadStaffUsers();
  if (staff.some(u => u.email.toLowerCase() === cleanEmail)) {
    return res.status(400).json({ success: false, error: `A staff account with email ${cleanEmail} already exists` });
  }

  const newUser: StaffUserRecord = {
    id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: String(name).trim(),
    email: cleanEmail,
    role: (role && ['admin', 'production', 'logistics', 'crm'].includes(role)) ? role : 'production',
    passwordHash: hashPassword(String(password)),
    status: status === 'disabled' ? 'disabled' : 'active',
    department: department ? String(department).trim() : 'Workshop Operations',
    createdAt: new Date().toISOString()
  };

  staff.push(newUser);
  saveStaffUsers(staff);

  const { passwordHash, ...safeUser } = newUser;
  return res.json({ success: true, user: safeUser });
});

// Admin User Management: Update staff details or reset password
app.put('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  const { name, role, password, department, status } = req.body || {};

  const staff = loadStaffUsers();
  const user = staff.find(u => u.id === id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'Staff user not found' });
  }

  if (name) user.name = String(name).trim();
  if (role && ['admin', 'production', 'logistics', 'crm'].includes(role)) user.role = role;
  if (department !== undefined) user.department = String(department).trim();
  if (status && ['active', 'disabled'].includes(status)) user.status = status;
  if (password) {
    user.passwordHash = hashPassword(String(password));
  }

  saveStaffUsers(staff);

  const { passwordHash, ...safeUser } = user;
  return res.json({ success: true, user: safeUser });
});

// Admin User Management: Delete staff user
app.delete('/api/admin/users/:id', (req, res) => {
  const { id } = req.params;
  const staff = loadStaffUsers();
  const index = staff.findIndex(u => u.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Staff user not found' });
  }

  staff.splice(index, 1);
  saveStaffUsers(staff);

  return res.json({ success: true, message: 'User deleted successfully' });
});

// Legacy user session endpoint compatibility
app.get('/api/users', (req, res) => {
  const staff = loadStaffUsers();
  res.json(staff.map(u => ({ id: u.id, uid: u.id, email: u.email, role: u.role })));
});

app.post('/api/users/sync', (req, res) => {
  const { email, uid } = req.body || {};
  res.json({
    id: 1,
    uid: uid || 'crm3-admin',
    email: email || 'crm3.blkbrdshoemaker@gmail.com',
    role: 'admin'
  });
});

// Explicit correct store URLs enforced everywhere
app.get('/api/shopify/status', (req, res) => {
  const appUrl = getBaseUrl(req);
  const globalShop = normalizeShop(process.env.SHOPIFY_GLOBAL_SHOP_DOMAIN || process.env.SHOPIFY_SHOP_DOMAIN || 'blackbirdshoes.myshopify.com');
  const llcShop = normalizeShop(process.env.SHOPIFY_LLC_SHOP_DOMAIN || 'blkbrdusa.myshopify.com');

  const envGlobalToken = isValidShopifyToken(process.env.SHOPIFY_GLOBAL_ACCESS_TOKEN) ? process.env.SHOPIFY_GLOBAL_ACCESS_TOKEN : (isValidShopifyToken(process.env.SHOPIFY_ACCESS_TOKEN) ? process.env.SHOPIFY_ACCESS_TOKEN : undefined);
  const globalToken = tokenStore[globalShop]?.accessToken || envGlobalToken;
  const llcToken = tokenStore[llcShop]?.accessToken || (isValidShopifyToken(process.env.SHOPIFY_LLC_ACCESS_TOKEN) ? process.env.SHOPIFY_LLC_ACCESS_TOKEN : undefined);
  const clientId = process.env.SHOPIFY_CLIENT_ID || '1d6db35a54fea551861eb4c44fd16ae5';

  res.json({
    configured: Boolean(globalToken || llcToken),
    hasClientId: Boolean(clientId),
    clientId,
    hasClientSecret: false,
    hasAccessToken: Boolean(globalToken || llcToken),
    defaultShop: globalShop,
    appUrl,
    callbackUrl: `${appUrl}/api/shopify/callback`,
    global: {
      shopDomain: globalShop,
      hasAccessToken: Boolean(globalToken),
      storeName: tokenStore[globalShop]?.shopName || 'BLKBRD SHOEMAKER | HANDCRAFTED IN INDIA'
    },
    llc: {
      shopDomain: llcShop,
      hasAccessToken: Boolean(llcToken),
      storeName: tokenStore[llcShop]?.shopName || 'BLKBRD USA Store (US)'
    }
  });
});

app.get('/api/shopify/auth-url', (req, res) => {
  try {
    const shopRaw = (req.query.shop as string) || 'blackbirdshoes.myshopify.com';
    const cleanShop = normalizeShop(shopRaw);
    const clientId = (req.query.clientId as string) || process.env.SHOPIFY_CLIENT_ID || '1d6db35a54fea551861eb4c44fd16ae5';
    const appUrl = getBaseUrl(req);
    const redirectUri = `${appUrl}/api/shopify/callback`;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'SHOPIFY_CLIENT_ID is not configured. Please use Admin API Access Token (shpat_...) authentication instead.',
        needsClientId: true,
        redirectUri
      });
    }

    const scopes = 'read_all_orders,read_customers,read_orders,read_products,read_returns';
    const state = 'blkbrd_' + Math.random().toString(36).substring(2, 15);
    const authUrl = `https://${cleanShop}/admin/oauth/authorize?client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

    return res.json({ success: true, url: authUrl, shop: cleanShop, state, redirectUri });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to generate OAuth URL' });
  }
});

app.post('/api/shopify/verify', async (req, res) => {
  try {
    const { shop, accessToken } = req.body;
    if (!shop) return res.status(400).json({ success: false, error: 'Shop domain is required' });

    const cleanShop = normalizeShop(shop);
    const token = (accessToken || '').trim() || tokenStore[cleanShop]?.accessToken;

    if (!token || !isValidShopifyToken(token)) {
      return res.status(400).json({ success: false, error: 'Valid Admin API Access Token starting with shpat_ is required.' });
    }

    const shopifyUrl = `https://${cleanShop}/admin/api/2024-01/shop.json`;
    const verifyRes = await fetch(shopifyUrl, {
      method: 'GET',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
    });

    if (verifyRes.ok) {
      const data = (await verifyRes.json()) as { shop: any };
      tokenStore[cleanShop] = { accessToken: token, updatedAt: new Date().toISOString(), shopName: data.shop?.name };
      saveShopifyTokenStore();
      return res.json({ success: true, shop: data.shop });
    } else {
      const errText = await verifyRes.text();
      return res.status(verifyRes.status).json({ success: false, error: `Shopify API rejected token: ${errText || verifyRes.statusText}` });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Verification network error' });
  }
});

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/i);
    if (match) return match[1];
  }
  return null;
}

async function fetchOrdersFromStore(
  shopRaw: string,
  tokenParam?: string,
  accountParam?: 'Global' | 'LLC',
  limitParam: number | string = 'all'
) {
  const cleanShop = normalizeShop(shopRaw);
  const storeAccount: 'Global' | 'LLC' = accountParam || (cleanShop.includes('llc') || cleanShop.includes('usa') ? 'LLC' : 'Global');
  
  const envGlobalToken = isValidShopifyToken(process.env.SHOPIFY_GLOBAL_ACCESS_TOKEN)
    ? process.env.SHOPIFY_GLOBAL_ACCESS_TOKEN
    : (isValidShopifyToken(process.env.SHOPIFY_ACCESS_TOKEN) ? process.env.SHOPIFY_ACCESS_TOKEN : undefined);

  const envLlcToken = isValidShopifyToken(process.env.SHOPIFY_LLC_ACCESS_TOKEN)
    ? process.env.SHOPIFY_LLC_ACCESS_TOKEN
    : undefined;

  const envToken = storeAccount === 'LLC' ? envLlcToken : envGlobalToken;

  const rawToken = (tokenParam && isValidShopifyToken(tokenParam) ? tokenParam : undefined) ||
    tokenStore[cleanShop]?.accessToken ||
    (isValidShopifyToken(envToken) ? envToken : undefined);

  if (!rawToken) {
    // Attempt fallback from Supabase cache if no token is configured
    try {
      const { data: dbOrders } = await supabaseAdmin
        .from('shopify_orders')
        .select('*')
        .eq('store_account', storeAccount)
        .limit(2000);

      if (dbOrders && dbOrders.length > 0) {
        const mapped = dbOrders.map(o => {
          const rawItems = o.line_items || 'BLKBRD Footwear';
          let imgUrl = '';
          const lowerItems = rawItems.toLowerCase();
          const cleanKey = lowerItems.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
          imgUrl = globalImageCatalog.byTitle[lowerItems] || globalImageCatalog.byTitle[cleanKey] || '';
          if (!imgUrl) {
            const words = cleanKey.split(' ').filter((w: string) => w.length >= 3 && !['the', 'and', 'for', 'men', 'boots', 'shoes', 'boot', 'shoe', 'hand', 'welted'].includes(w));
            const firstWord = words[0];
            if (firstWord && globalImageCatalog.byModel[firstWord]) {
              imgUrl = globalImageCatalog.byModel[firstWord];
            }
          }

          return {
            id: o.id,
            orderNumber: String(o.order_number || o.id || '').replace(/^#/, ''),
            customerName: o.customer_name || 'Customer',
            email: o.email || '',
            customerEmail: o.email || '',
            phone: o.phone || '',
            address: o.address || '',
            totalPrice: o.total_price || (storeAccount === 'LLC' ? '$295.00' : '₹16,500'),
            currency: o.currency || (storeAccount === 'LLC' ? 'USD' : 'INR'),
            financialStatus: o.financial_status || 'paid',
            fulfillmentStatus: o.fulfillment_status || 'unfulfilled',
            operationalStatus: o.operational_status || 'Ready to Ship',
            lineItems: rawItems,
            imageUrl: imgUrl,
            imageUrls: imgUrl ? [imgUrl] : [],
            notes: o.notes || '',
            storeAccount: o.store_account || storeAccount,
            storeTab: o.store_account || storeAccount,
            createdAt: o.created_at || new Date().toISOString()
          };
        });

        mapped.sort((a, b) => {
          const numA = parseInt(a.orderNumber.replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(b.orderNumber.replace(/\D/g, ''), 10) || 0;
          if (numB !== numA) return numB - numA;
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });

        return { success: true, shop: cleanShop, orders: mapped, count: mapped.length, isFallback: true };
      }
    } catch (_fallbackErr) {}

    return { success: false, shop: cleanShop, orders: [], error: `No valid access token provided for ${cleanShop} (${storeAccount}).` };
  }

  const isFetchAll = limitParam === 'all' || typeof limitParam !== 'number';
  const targetMaxOrders = typeof limitParam === 'number' ? limitParam : Infinity;
  // Shopify REST orders limit max per page is 250
  const perPageLimit = Math.min(250, typeof limitParam === 'number' && limitParam > 0 ? limitParam : 250);

  let currentUrl: string | null = `https://${cleanShop}/admin/api/2024-01/orders.json?status=any&limit=${perPageLimit}&order=created_at%20desc`;
  const allRawOrders: any[] = [];
  let pageCount = 0;
  const maxPages = isFetchAll ? 60 : Math.ceil(targetMaxOrders / perPageLimit);

  while (currentUrl && pageCount < maxPages && allRawOrders.length < targetMaxOrders) {
    pageCount++;
    try {
      const ordersRes = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': rawToken.trim(),
          'Content-Type': 'application/json'
        }
      });

      if (!ordersRes.ok) {
        // Handle 429 rate limit with retry
        if (ordersRes.status === 429 && pageCount < maxPages) {
          const retryAfter = parseFloat(ordersRes.headers.get('Retry-After') || '1.5');
          await new Promise(resolve => setTimeout(resolve, Math.max(1000, retryAfter * 1000)));
          continue;
        }

        const errText = await ordersRes.text();
        if (allRawOrders.length > 0) {
          console.warn(`Shopify pagination ended on page ${pageCount} (${ordersRes.status}): ${errText}`);
          break;
        }

        // Resilient fallback to Supabase
        try {
          const { data: dbOrders } = await supabaseAdmin
            .from('shopify_orders')
            .select('*')
            .eq('store_account', storeAccount)
            .limit(2000);

          if (dbOrders && dbOrders.length > 0) {
            const mapped = dbOrders.map(o => ({
              id: o.id,
              orderNumber: String(o.order_number || o.id || '').replace(/^#/, ''),
              customerName: o.customer_name || 'Customer',
              email: o.email || '',
              customerEmail: o.email || '',
              phone: o.phone || '',
              address: o.address || '',
              totalPrice: o.total_price || (storeAccount === 'LLC' ? '$295.00' : '₹16,500'),
              currency: o.currency || (storeAccount === 'LLC' ? 'USD' : 'INR'),
              financialStatus: o.financial_status || 'paid',
              fulfillmentStatus: o.fulfillment_status || 'unfulfilled',
              operationalStatus: o.operational_status || 'Ready to Ship',
              lineItems: o.line_items || 'BLKBRD Footwear',
              notes: o.notes || '',
              storeAccount: o.store_account || storeAccount,
              storeTab: o.store_account || storeAccount,
              createdAt: o.created_at || new Date().toISOString()
            }));

            mapped.sort((a, b) => {
              const numA = parseInt(a.orderNumber.replace(/\D/g, ''), 10) || 0;
              const numB = parseInt(b.orderNumber.replace(/\D/g, ''), 10) || 0;
              if (numB !== numA) return numB - numA;
              return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            });

            return { success: true, shop: cleanShop, orders: mapped, count: mapped.length, isFallback: true, warning: `Shopify API returned ${ordersRes.status}. Displaying latest synced database cache.` };
          }
        } catch (_fErr) {}

        return { success: false, shop: cleanShop, orders: [], error: `Shopify Admin API (${ordersRes.status}): ${errText}` };
      }

      const data = (await ordersRes.json()) as { orders?: any[] };
      const pageOrders = data.orders || [];
      allRawOrders.push(...pageOrders);

      // Check if we hit user-specified target limit
      if (allRawOrders.length >= targetMaxOrders) {
        break;
      }

      // Check next link header
      const linkHeader = ordersRes.headers.get('link') || ordersRes.headers.get('Link');
      const nextUrl = parseNextLink(linkHeader);
      if (!nextUrl || pageOrders.length === 0) {
        break;
      }
      currentUrl = nextUrl;

      // Small delay between pages to respect Shopify API rate limits
      await new Promise(resolve => setTimeout(resolve, 80));
    } catch (pageErr: any) {
      console.warn(`Error on Shopify orders page ${pageCount}:`, pageErr.message || pageErr);
      if (allRawOrders.length > 0) {
        break;
      }
      return { success: false, shop: cleanShop, orders: [], error: pageErr.message || 'Network error fetching Shopify orders' };
    }
  }

  const rawOrdersToFormat = typeof limitParam === 'number' ? allRawOrders.slice(0, targetMaxOrders) : allRawOrders;

  const productImgs = await getStoreProductImages(cleanShop, rawToken);

  const formattedOrders = rawOrdersToFormat.map((o: any) => {
    const isFulfilled = o.fulfillment_status === 'fulfilled';
    const tags = (o.tags || '').toLowerCase();
    const note = (o.note || '').toLowerCase();
    const isReady = !isFulfilled && (tags.includes('ready') || note.includes('ready') || tags.includes('qc_pass') || tags.includes('rtd'));

    // Check SLA / delay (Lead time: 21 days from created_at)
    let isDelayed = false;
    if (!isFulfilled && !isReady && o.created_at) {
      const createdTime = new Date(o.created_at).getTime();
      const expectedTime = createdTime + 21 * 24 * 60 * 60 * 1000;
      // Delinquent is 1 or more days delayed past expected date
      if (Date.now() > expectedTime + 24 * 60 * 60 * 1000) {
        isDelayed = true;
      }
    }

    const operationalStatus: 'Ready to Ship' | 'Shipped' | 'Delayed' | 'In Production' =
      isFulfilled ? 'Shipped' : isReady ? 'Ready to Ship' : isDelayed ? 'Delayed' : 'In Production';

    const rawCustFirst = o.customer?.first_name || o.shipping_address?.first_name || o.billing_address?.first_name || '';
    const rawCustLast = o.customer?.last_name || o.shipping_address?.last_name || o.billing_address?.last_name || '';
    const combinedFirstLast = `${rawCustFirst} ${rawCustLast}`.trim();
    const directAddressName = o.shipping_address?.name || o.billing_address?.name || '';
    const emailPrefix = (o.email || o.customer?.email || '').split('@')[0]?.replace(/[._]/g, ' ') || '';
    
    const customerName = combinedFirstLast || directAddressName.trim() || emailPrefix.trim() || 'Valued Customer';
    const currency = o.currency || (storeAccount === 'LLC' ? 'USD' : 'INR');
    const symbol = currency === 'INR' ? '₹' : '$';

    // Extract Product Images, Detailed Line Items, Custom Properties & CraftsmanNotes
    const rawLineItems = Array.isArray(o.line_items) ? o.line_items : [];
    const itemImages: string[] = [];
    const lineItemDetails: any[] = [];
    const allCraftsmanNotes: string[] = [];
    const orderCustomSpecs: Record<string, string> = {};

    for (const item of rawLineItems) {
      // Authentic image directly from the Shopify order line item, product ID, or product catalog
      let img = item.image?.src || item.image_url || item.featured_image?.url || item.variant?.image?.src || '';
      if (!img && item.product_id && productImgs.byId[String(item.product_id)]) {
        img = productImgs.byId[String(item.product_id)];
      }
      if (!img && item.title) {
        const titleKey = item.title.trim().toLowerCase();
        const cleanKey = titleKey.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        img = productImgs.byTitle[titleKey] || productImgs.byTitle[cleanKey] || '';
        if (!img) {
          const words = cleanKey.split(' ').filter((w: string) => w.length >= 3 && !['the', 'and', 'for', 'men', 'boots', 'shoes', 'boot', 'shoe', 'hand', 'welted'].includes(w));
          const firstWord = words[0];
          if (firstWord && productImgs.byModel[firstWord]) {
            img = productImgs.byModel[firstWord];
          }
        }
      }
      if (img && !itemImages.includes(img)) {
        itemImages.push(img);
      }

      // Parse line item properties (e.g. Globo Product Options, width, Sole, SoleFinish, CraftsmanNotes)
      const rawProps = Array.isArray(item.properties)
        ? item.properties
        : (item.properties && typeof item.properties === 'object')
        ? Object.entries(item.properties).map(([name, value]) => ({ name, value }))
        : [];

      const cleanProps: Array<{ name: string; value: string }> = [];
      const itemSpecs: Record<string, string> = {};
      let itemCraftsmanNote = '';

      for (const p of rawProps) {
        if (!p || !p.name) continue;
        const pName = String(p.name).trim();
        const pVal = p.value !== undefined && p.value !== null ? String(p.value).trim() : '';
        if (!pVal) continue;

        cleanProps.push({ name: pName, value: pVal });

        const lowerName = pName.toLowerCase().replace(/[\s_\-]/g, '');
        if (
          lowerName.includes('craftsman') ||
          lowerName.includes('artisan') ||
          lowerName.includes('customnote') ||
          lowerName.includes('customremark') ||
          lowerName.includes('specialrequest') ||
          lowerName.includes('specialinstruction') ||
          lowerName.includes('workshopnote') ||
          lowerName.includes('shoemaker') ||
          lowerName.includes('remark') ||
          lowerName.includes('note') ||
          lowerName.includes('instruction')
        ) {
          itemCraftsmanNote = pVal;
          if (!allCraftsmanNotes.includes(pVal)) {
            allCraftsmanNotes.push(pVal);
          }
        }

        // Check if property value contains an image upload URL
        if (
          typeof pVal === 'string' &&
          (pVal.startsWith('http://') || pVal.startsWith('https://')) &&
          (pVal.includes('cdn.shopify.com') || /\.(png|jpe?g|webp|gif)/i.test(pVal))
        ) {
          if (!img) img = pVal;
          if (!itemImages.includes(pVal)) itemImages.push(pVal);
        }

        // Store non-internal properties for workshop presentation
        if (!pName.startsWith('_')) {
          itemSpecs[pName] = pVal;
          orderCustomSpecs[pName] = pVal;
        }
      }

      lineItemDetails.push({
        id: item.id || `line-${lineItemDetails.length + 1}`,
        title: item.title || item.name || 'BLKBRD Footwear',
        variantTitle: item.variant_title || '',
        quantity: item.quantity || 1,
        price: item.price ? `${symbol}${parseFloat(item.price).toLocaleString('en-IN')}` : '',
        sku: item.sku || '',
        imageUrl: img,
        properties: cleanProps,
        craftsmanNotes: itemCraftsmanNote,
        customSpecifications: itemSpecs
      });
    }

    // Also check note_attributes for order-level custom notes
    const rawNoteAttributes = Array.isArray(o.note_attributes) ? o.note_attributes : [];
    for (const na of rawNoteAttributes) {
      if (!na || !na.name) continue;
      const naName = String(na.name).trim();
      const naVal = na.value !== undefined && na.value !== null ? String(na.value).trim() : '';
      if (!naVal) continue;
      if (!naName.startsWith('_')) {
        orderCustomSpecs[naName] = naVal;
      }
      const lower = naName.toLowerCase().replace(/[\s_\-]/g, '');
      if (
        lower.includes('craftsman') ||
        lower.includes('artisan') ||
        lower.includes('customnote') ||
        lower.includes('customremark') ||
        lower.includes('remark') ||
        lower.includes('instruction') ||
        lower.includes('special') ||
        lower.includes('workshop')
      ) {
        if (!allCraftsmanNotes.includes(naVal)) {
          allCraftsmanNotes.push(naVal);
        }
      }
    }

    // Include customer order note if present
    if (o.note && typeof o.note === 'string' && o.note.trim()) {
      const cleanOrderNote = o.note.trim();
      if (!allCraftsmanNotes.includes(cleanOrderNote)) {
        allCraftsmanNotes.push(cleanOrderNote);
      }
    }

    const consolidatedCraftsmanNotes = allCraftsmanNotes.join(' • ');
    const shippingMethodTitle = Array.isArray(o.shipping_lines) && o.shipping_lines.length > 0
      ? o.shipping_lines.map((s: any) => s.title).filter(Boolean).join(', ')
      : '';

    const formattedAddress = o.shipping_address
      ? [
          o.shipping_address.address1,
          o.shipping_address.address2,
          o.shipping_address.city,
          o.shipping_address.province,
          o.shipping_address.country,
          o.shipping_address.zip
        ].filter(Boolean).join(', ')
      : '';

    const primaryImageUrl = itemImages[0] || o.image?.src || '';

    return {
      id: String(o.id || `gid://shopify/Order/${o.order_number}`),
      orderNumber: String(o.order_number || o.name || '').replace('#', ''),
      customerName,
      email: o.email || o.customer?.email || 'customer@shopify.com',
      customerEmail: o.customer?.email || o.email || '',
      phone: o.phone || o.customer?.phone || o.shipping_address?.phone || '',
      address: formattedAddress,
      shippingMethod: shippingMethodTitle,
      totalPrice: o.total_price ? `${symbol}${parseFloat(o.total_price).toLocaleString('en-IN')}` : (storeAccount === 'LLC' ? '$295.00' : '₹14,999'),
      currency,
      financialStatus: o.financial_status || 'paid',
      fulfillmentStatus: isFulfilled ? 'fulfilled' : 'unfulfilled',
      operationalStatus,
      createdAt: o.created_at || new Date().toISOString(),
      lineItems: Array.isArray(o.line_items) && o.line_items.length > 0 
        ? o.line_items.map((i: any) => {
            const itemTitle = i.name || (i.variant_title && i.variant_title !== 'Default Title' ? `${i.title} (${i.variant_title})` : i.title);
            const qty = i.quantity ? ` (x${i.quantity})` : '';
            return `${itemTitle}${qty}`;
          }).join(' • ') 
        : 'BLKBRD Footwear',
      lineItemDetails,
      craftsmanNotes: consolidatedCraftsmanNotes,
      customSpecifications: orderCustomSpecs,
      notes: o.note || '',
      storeAccount,
      storeTab: storeAccount,
      imageUrl: primaryImageUrl,
      imageUrls: itemImages,
      tags: typeof o.tags === 'string' ? o.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : (Array.isArray(o.tags) ? o.tags : [])
    };
  });

  if (formattedOrders.length > 0) {
    // Automatically mirror fetched orders to Supabase shopify_orders in background
    (async () => {
      try {
        const mirrorRows = formattedOrders.map(o => ({
          id: String(o.id || `shopify-${o.orderNumber}`),
          order_number: o.orderNumber,
          customer_name: o.customerName || 'Customer',
          email: o.email || '',
          total_price: o.totalPrice || '',
          currency: o.currency || (storeAccount === 'LLC' ? 'USD' : 'INR'),
          financial_status: o.financialStatus || 'paid',
          fulfillment_status: o.fulfillmentStatus || 'unfulfilled',
          operational_status: o.operationalStatus || 'Ready to Ship',
          line_items: o.lineItems || 'BLKBRD Handcrafted Footwear',
          notes: o.notes || '',
          store_account: storeAccount,
          created_at: o.createdAt || new Date().toISOString(),
          synced_at: new Date().toISOString()
        }));

        for (let i = 0; i < mirrorRows.length; i += 100) {
          const chunk = mirrorRows.slice(i, i + 100);
          await supabaseAdmin.from('shopify_orders').upsert(chunk, { onConflict: 'id' });
        }
      } catch (mirrorErr) {
        console.warn('Server shopify_orders auto-mirror warning:', mirrorErr);
      }
    })();
  }

  return { success: true, shop: cleanShop, orders: formattedOrders, count: formattedOrders.length };
}

app.get('/api/shopify/product-images', async (req, res) => {
  try {
    const shopRaw = (req.query.shop as string) || '';
    const tokenQuery = (req.query.token as string) || '';
    const forceRefresh = req.query.refresh === 'true';

    if (forceRefresh) {
      globalImageCatalog.lastFetched = 0;
    }

    const imgs = await getStoreProductImages(shopRaw || undefined, tokenQuery || undefined);
    
    // Set caching headers for browser performance
    res.setHeader('Cache-Control', 'public, max-age=1800');
    return res.json({
      success: true,
      byId: imgs.byId || {},
      byTitle: imgs.byTitle || {},
      byHandle: imgs.byHandle || {},
      byModel: imgs.byModel || {},
      byModelColor: imgs.byModelColor || {},
      count: Object.keys(imgs.byTitle || {}).length,
      lastFetched: imgs.lastFetched
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/shopify/product-images/refresh', async (req, res) => {
  try {
    globalImageCatalog.lastFetched = 0;
    const imgs = await getStoreProductImages();
    return res.json({
      success: true,
      count: Object.keys(imgs.byTitle || {}).length,
      lastFetched: imgs.lastFetched
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/shopify/orders', async (req, res) => {
  try {
    const shopRaw = (req.query.shop as string) || 'blackbirdshoes.myshopify.com';
    const cleanShop = normalizeShop(shopRaw);
    const accountParam = (req.query.account as any) || (cleanShop.includes('llc') || cleanShop.includes('usa') ? 'LLC' : 'Global');
    const tokenQuery = (req.query.token as string) || (req.headers['x-shopify-access-token'] as string);
    const limitQuery = req.query.limit === 'all' || !req.query.limit
      ? 'all'
      : (isNaN(Number(req.query.limit)) ? 'all' : Number(req.query.limit));

    const result = await fetchOrdersFromStore(cleanShop, tokenQuery, accountParam, limitQuery);
    if (result.success) {
      return res.json({ success: true, shop: cleanShop, account: accountParam, count: result.orders.length, orders: result.orders });
    }
    return res.status(400).json({ success: false, shop: cleanShop, error: result.error });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch Shopify orders' });
  }
});

app.all(['/api/shopify/sync-both', '/api/shopify/sync-all'], async (req, res) => {
  try {
    const body = req.method === 'POST' ? req.body : req.query;
    const globalShop = (body.globalShop as string) || 'blackbirdshoes.myshopify.com';
    const globalToken = (body.globalToken as string) || (isValidShopifyToken(process.env.SHOPIFY_GLOBAL_ACCESS_TOKEN) ? process.env.SHOPIFY_GLOBAL_ACCESS_TOKEN : process.env.SHOPIFY_ACCESS_TOKEN);
    const llcShop = (body.llcShop as string) || 'blkbrdusa.myshopify.com';
    const llcToken = (body.llcToken as string) || process.env.SHOPIFY_LLC_ACCESS_TOKEN;

    const [globalResult, llcResult] = await Promise.all([
      fetchOrdersFromStore(globalShop, globalToken, 'Global', 'all'),
      fetchOrdersFromStore(llcShop, llcToken, 'LLC', 'all')
    ]);

    const combinedOrders = [...(globalResult.orders || []), ...(llcResult.orders || [])];
    return res.json({ success: true, count: combinedOrders.length, orders: combinedOrders, global: globalResult, llc: llcResult });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Dual store sync failed' });
  }
});

app.post('/api/shopify/update-order', async (req, res) => {
  try {
    const { orderId, orderNumber, operationalStatus, notes, fulfillmentStatus, customerName, email, totalPrice, lineItems } = req.body;
    if (!orderId && !orderNumber) {
      return res.status(400).json({ success: false, error: 'Missing orderId or orderNumber' });
    }

    const payload: any = {
      synced_at: new Date().toISOString()
    };
    if (operationalStatus !== undefined) payload.operational_status = operationalStatus;
    if (fulfillmentStatus !== undefined) payload.fulfillment_status = fulfillmentStatus;
    if (notes !== undefined) payload.notes = notes;
    if (customerName !== undefined) payload.customer_name = customerName;
    if (email !== undefined) payload.email = email;
    if (totalPrice !== undefined) payload.total_price = totalPrice;
    if (lineItems !== undefined) payload.line_items = lineItems;

    const cleanNum = String(orderNumber || orderId || '').replace(/^#/, '');

    const { data, error } = await supabaseAdmin
      .from('shopify_orders')
      .update(payload)
      .or(`id.eq.${orderId},order_number.eq.${cleanNum}`)
      .select();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, updated: data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Shopify Admin order redirect route using query format
app.get('/api/shopify/redirect-order', async (req, res) => {
  try {
    const { orderNumber, shopifyId, account, shop } = req.query;
    const rawOrder = String(orderNumber || shopifyId || '').replace(/^#/, '').trim();
    const isLlc = account === 'LLC' || rawOrder.toUpperCase().startsWith('US') || shop === 'blkbrdusa.myshopify.com';
    const storeSlug = isLlc ? 'blkbrdusa' : 'blackbirdshoes';

    if (rawOrder) {
      return res.redirect(302, `https://admin.shopify.com/store/${storeSlug}/orders?query=${encodeURIComponent(rawOrder)}`);
    }

    return res.redirect(302, `https://admin.shopify.com/store/${storeSlug}/orders`);
  } catch (err: any) {
    return res.redirect(302, 'https://admin.shopify.com/store/blackbirdshoes/orders');
  }
});

// Supabase Table Verification and Health Status Endpoints
async function getTableStatusInfo(tableName: string) {
  const cleanName = String(tableName || '').trim();
  if (!cleanName) {
    return { exists: false, table: cleanName, error: 'Table name is required' };
  }

  try {
    const { count, error, data } = await supabaseAdmin
      .from(cleanName)
      .select('*', { count: 'exact', head: true });

    if (error) {
      const msg = error.message || '';
      const isNotExistent =
        msg.toLowerCase().includes('does not exist') ||
        msg.toLowerCase().includes('relation') ||
        msg.toLowerCase().includes('could not find') ||
        error.code === '42P01' ||
        error.code === 'PGRST204' ||
        error.code === 'PGRST205' ||
        error.code === 'PGRST200';

      if (isNotExistent) {
        return {
          exists: false,
          table: cleanName,
          error: `Table "${cleanName}" does not exist in Supabase yet. Please execute the creation SQL in Supabase SQL editor.`
        };
      }

      // If table exists but has RLS warning or other query note
      return {
        exists: true,
        table: cleanName,
        sampleCount: localTableStore[cleanName]?.length || 0,
        message: `Table "${cleanName}" exists in Supabase (${msg || 'active'}).`
      };
    }

    const rowCount = typeof count === 'number' ? count : (Array.isArray(data) ? data.length : 0);
    return {
      exists: true,
      table: cleanName,
      sampleCount: rowCount,
      message: `Table "${cleanName}" is verified & active in Supabase with ${rowCount.toLocaleString()} records.`
    };
  } catch (err: any) {
    return {
      exists: false,
      table: cleanName,
      error: err.message || 'Error communicating with Supabase database'
    };
  }
}

app.get('/api/supabase/table-status', async (req, res) => {
  try {
    const tableName = String(req.query.table || req.query.tableName || '').trim();
    if (!tableName) return res.status(400).json({ exists: false, error: 'Missing table parameter' });
    const result = await getTableStatusInfo(tableName);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ exists: false, error: err.message });
  }
});

app.post('/api/supabase/table-status', async (req, res) => {
  try {
    const tableName = String(req.body?.table || req.body?.tableName || req.query.table || '').trim();
    if (!tableName) return res.status(400).json({ exists: false, error: 'Missing table parameter' });
    const result = await getTableStatusInfo(tableName);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ exists: false, error: err.message });
  }
});

app.get('/api/supabase/all-tables-status', async (_req, res) => {
  try {
    const operationalTables = [
      'delinquency_global',
      'delinquency_llc',
      'customers_crm',
      'order_audit_events',
      'production_remarks',
      'shopify_orders',
      'returns_global',
      'returns_llc',
      'return_stock_in',
      'return_stock_us',
      'daily_dispatches',
      'trial_pairs'
    ];

    const results: Record<string, any> = {};
    await Promise.all(
      operationalTables.map(async (tbl) => {
        results[tbl] = await getTableStatusInfo(tbl);
      })
    );

    return res.json({ tables: results, timestamp: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Supabase Proxy Endpoints with resilient fallback handling
app.post('/api/supabase/select', async (req, res) => {
  try {
    const { table, select = '*', order, ascending = true, limit, filters = [] } = req.body;
    if (!table) return res.status(400).json({ data: null, error: { message: 'Missing table parameter' } });

    let query: any = supabaseAdmin.from(table).select(select);
    if (Array.isArray(filters)) {
      for (const f of filters) {
        if (f.op === 'eq') query = query.eq(f.col, f.val);
        if (f.op === 'in') query = query.in(f.col, f.val);
      }
    }
    if (order) query = query.order(order, { ascending: ascending ?? true });
    if (limit && typeof limit === 'number') query = query.limit(limit);

    const { data, error } = await query;
    if (error) return res.json({ data: localTableStore[table] || [], error: null, fallback: true });

    if (Array.isArray(data)) localTableStore[table] = data;
    return res.json({ data: data || [], error: null });
  } catch (err: any) {
    const table = req.body?.table;
    return res.json({ data: table ? (localTableStore[table] || []) : [], error: null, fallback: true });
  }
});

app.post('/api/supabase/insert', async (req, res) => {
  try {
    const { table, rows, select = false } = req.body;
    if (!table || !rows) return res.status(400).json({ data: null, error: { message: 'Missing table or rows parameter' } });

    let query: any = supabaseAdmin.from(table).insert(rows);
    if (select) query = query.select();

    const { data, error } = await query;
    if (error) {
      if (!localTableStore[table]) localTableStore[table] = [];
      const added = Array.isArray(rows) ? rows : [rows];
      localTableStore[table].push(...added);
      if (table === 'delinquency_global' || table === 'delinquency_llc' || table === 'return_stock_in' || table === 'return_stock_us' || table === 'returns_global' || table === 'returns_llc' || table === 'trial_pairs') {
        broadcastSyncEvent('TABLE_UPDATED', { table, rows: added });
      }
      return res.json({ data: added, error: null, fallback: true });
    }
    if (table === 'delinquency_global' || table === 'delinquency_llc' || table === 'return_stock_in' || table === 'return_stock_us' || table === 'returns_global' || table === 'returns_llc' || table === 'trial_pairs') {
      broadcastSyncEvent('TABLE_UPDATED', { table, rows: data });
    }
    return res.json({ data: data || [], error: null });
  } catch (err: any) {
    return res.status(500).json({ data: null, error: { message: err.message } });
  }
});

app.post('/api/supabase/update', async (req, res) => {
  try {
    const { table, values, filters = [], select = false } = req.body;
    if (!table || !values) return res.status(400).json({ data: null, error: { message: 'Missing parameters' } });

    let query: any = supabaseAdmin.from(table).update(values);
    for (const f of filters) {
      if (f.op === 'eq') query = query.eq(f.col, f.val);
      if (f.op === 'in') query = query.in(f.col, f.val);
    }
    if (select) query = query.select();

    const { data, error } = await query;
    if (error) return res.status(400).json({ data: null, error: { message: error.message } });

    if (localTableStore[table] && Array.isArray(localTableStore[table])) {
      localTableStore[table] = localTableStore[table].map(row => {
        let matches = true;
        for (const f of filters) {
          if (f.op === 'eq' && String(row[f.col]) !== String(f.val)) matches = false;
          if (f.op === 'in' && Array.isArray(f.val)) {
            const strVals = f.val.map(String);
            if (!strVals.includes(String(row[f.col]))) matches = false;
          }
        }
        return matches ? { ...row, ...values } : row;
      });
    }

    if (table === 'delinquency_global' || table === 'delinquency_llc' || table === 'return_stock_in' || table === 'return_stock_us') {
      broadcastSyncEvent('TABLE_UPDATED', { table, values });
    }

    return res.json({ data: data || [], error: null });
  } catch (err: any) {
    return res.status(500).json({ data: null, error: { message: err.message } });
  }
});

app.post('/api/supabase/delete', async (req, res) => {
  try {
    const { table, filters = [] } = req.body;
    if (!table) return res.status(400).json({ data: null, error: { message: 'Missing table' } });

    let query: any = supabaseAdmin.from(table).delete();
    for (const f of filters) {
      if (f.op === 'eq') query = query.eq(f.col, f.val);
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ data: null, error: { message: error.message } });

    if (table === 'delinquency_global' || table === 'delinquency_llc' || table === 'return_stock_in' || table === 'return_stock_us') {
      broadcastSyncEvent('TABLE_DELETED', { table });
    }

    return res.json({ data: data || [], error: null });
  } catch (err: any) {
    return res.status(500).json({ data: null, error: { message: err.message } });
  }
});

// =============================================================================
// REAL-TIME MULTI-USER STAGE SYNCHRONIZATION & AUDIT LOGGING
// =============================================================================
const sseClients = new Set<express.Response>();
let globalSyncRevision = 1;
let lastSyncTimestamp = new Date().toISOString();

function broadcastSyncEvent(eventType: string, payload: any = {}) {
  globalSyncRevision++;
  lastSyncTimestamp = new Date().toISOString();
  const data = JSON.stringify({
    type: eventType,
    revision: globalSyncRevision,
    timestamp: lastSyncTimestamp,
    ...payload
  });
  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (_err) {
      sseClients.delete(client);
    }
  }
}

// Keep-alive ping every 20 seconds so SSE connections stay alive through proxies
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(`: ping\n\n`);
    } catch (_err) {
      sseClients.delete(client);
    }
  }
}, 20000);

// SSE connection endpoint for all active clients/browsers
app.get('/api/sync/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', revision: globalSyncRevision, timestamp: lastSyncTimestamp })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Polling status fallback endpoint
app.get('/api/sync/status', (_req, res) => {
  res.json({ revision: globalSyncRevision, timestamp: lastSyncTimestamp });
});

// Dedicated Production Stage Transition & Supabase Audit Stamping
app.post('/api/orders/update-stage', async (req, res) => {
  try {
    const {
      orderId,
      newStage,
      previousStage,
      authorName = 'Production Staff',
      authorRole = 'production',
      remarks = '',
      delayReason = '',
      storeTab = 'Global'
    } = req.body;

    if (!orderId || !newStage) {
      return res.status(400).json({ success: false, error: 'Missing orderId or newStage' });
    }

    const cleanDigits = String(orderId).replace(/\D/g, '');
    const cleanOrderId = String(orderId).replace(/^#/, '').trim();
    const isLlc = storeTab === 'LLC' || cleanOrderId.toUpperCase().startsWith('US');
    const targetTable = isLlc ? 'delinquency_llc' : 'delinquency_global';
    const otherTable = isLlc ? 'delinquency_global' : 'delinquency_llc';

    const isRtd = newStage === 'RTD' || newStage === 'Ready to Ship';
    const isShipped = newStage === 'Shipped';
    const isHold = newStage.toUpperCase() === 'ON HOLD';

    const orderStatus = isShipped ? 'Shipped' : isRtd ? 'Ready to Ship' : isHold ? 'Delayed' : 'In Production';
    const actionRequired = isRtd ? 'Ready to Dispatch (RTD)' : isShipped ? 'Dispatched' : isHold ? 'On Hold: Workshop Review' : `Production Workshop (${newStage})`;

    const updatePayload: Record<string, any> = {
      current_stage: newStage,
      order_status: orderStatus,
      action_required: actionRequired,
      remarks: remarks || `Stage updated to ${newStage} by ${authorName}`,
      updated_at: new Date().toISOString()
    };
    if (delayReason) {
      updatePayload.delay_reason = delayReason;
    }

    const possibleIds = Array.from(new Set([
      orderId,
      cleanOrderId,
      cleanDigits,
      `#${cleanDigits}`,
      `#${cleanOrderId}`,
      `BLKBRD${cleanDigits}`,
      `BLKBRD-${cleanDigits}`,
      `US${cleanDigits}`,
      `US-${cleanDigits}`,
      `USBLKBRD${cleanDigits}`
    ].filter(Boolean)));

    let updated = false;

    // 1. Update in target table
    const { data: d1 } = await supabaseAdmin.from(targetTable).update(updatePayload).in('order_id', possibleIds).select();
    if (d1 && d1.length > 0) updated = true;

    // 2. Try other table if not matched
    if (!updated) {
      const { data: d2 } = await supabaseAdmin.from(otherTable).update(updatePayload).in('order_id', possibleIds).select();
      if (d2 && d2.length > 0) updated = true;
    }

    // 3. Fallback insert if row did not exist yet in either delinquency table
    if (!updated) {
      const formattedOrderId = isLlc ? `US${cleanDigits || cleanOrderId}` : `BLKBRD${cleanDigits || cleanOrderId}`;
      const newOrderRecord = {
        order_id: formattedOrderId,
        customer_name: req.body.customerName || 'Customer',
        client_name: req.body.customerName || 'Customer',
        product: req.body.product || 'BLKBRD Goodyear Welted Footwear',
        order_date: new Date().toISOString().split('T')[0],
        expected_date: new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0],
        current_stage: newStage,
        order_status: orderStatus,
        action_required: actionRequired,
        store_account: storeTab,
        remarks: remarks || `Order registered & stage set to ${newStage} by ${authorName}`,
        delay_reason: delayReason || '',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      try {
        const { data: dInsert } = await supabaseAdmin.from(targetTable).insert([newOrderRecord]).select();
        if (dInsert && dInsert.length > 0) updated = true;
      } catch (insertErr) {
        console.warn('Fallback insert on stage update notice:', insertErr);
      }
    }

    // Update in-memory fallback cache
    if (localTableStore[targetTable] && Array.isArray(localTableStore[targetTable])) {
      let matchedInStore = false;
      localTableStore[targetTable] = localTableStore[targetTable].map(row => {
        if (possibleIds.includes(String(row.order_id))) {
          matchedInStore = true;
          return { ...row, ...updatePayload };
        }
        return row;
      });
      if (!matchedInStore) {
        localTableStore[targetTable].unshift({
          order_id: isLlc ? `US${cleanDigits || cleanOrderId}` : `BLKBRD${cleanDigits || cleanOrderId}`,
          customer_name: req.body.customerName || 'Customer',
          product: req.body.product || 'BLKBRD Footwear',
          ...updatePayload
        });
      }
    }

    // 4. Mirror into shopify_orders operational_status
    try {
      await supabaseAdmin.from('shopify_orders').update({
        operational_status: isRtd ? 'Ready to Ship' : isShipped ? 'Shipped' : 'In Production',
        synced_at: new Date().toISOString()
      }).in('order_number', possibleIds);
    } catch (_sErr) {}

    // 4. Log to official order_audit_events table in Supabase
    try {
      await supabaseAdmin.from('order_audit_events').insert([{
        order_id: cleanOrderId,
        event_type: 'stage_change',
        title: `Stage Progressed: ${newStage}`,
        stage: newStage,
        previous_stage: previousStage || null,
        status: orderStatus,
        author_name: authorName,
        author_role: authorRole,
        delay_reason: delayReason || null,
        remarks_text: remarks || `Order moved to stage ${newStage}`,
        metadata: {
          storeTab,
          updated_at: new Date().toISOString()
        },
        created_at: new Date().toISOString()
      }]);
    } catch (auditErr: any) {
      console.warn('order_audit_events insert notice:', auditErr?.message);
    }

    // 5. Log to production_remarks in Supabase if remarks present
    if (remarks) {
      try {
        await supabaseAdmin.from('production_remarks').insert([{
          order_id: cleanOrderId,
          remark: remarks,
          author: authorName,
          role: authorRole,
          timestamp: new Date().toISOString()
        }]);
      } catch (_remErr) {}
    }

    // 6. IMMEDIATELY BROADCAST REALTIME TO ALL CONNECTED USERS
    broadcastSyncEvent('ORDER_STAGE_UPDATED', {
      orderId: cleanOrderId,
      stage: newStage,
      orderStatus,
      delayReason,
      remarks,
      authorName,
      authorRole,
      timestamp: new Date().toISOString()
    });

    return res.json({
      success: true,
      orderId: cleanOrderId,
      stage: newStage,
      orderStatus,
      updated
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Production Workshop Real Image Upload & Remark Stamping Endpoint
app.post('/api/supabase/upload-image', async (req, res) => {
  try {
    const {
      orderId,
      stage = 'Preparation',
      remark = '',
      imageBase64,
      fileName,
      authorName = 'Production Artisan',
      authorRole = 'production',
      storeTab = 'Global'
    } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Order ID is required' });
    }

    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'Image data is required' });
    }

    const cleanOrderId = String(orderId).replace(/^[#\s]+/, '').trim();
    const cleanStage = String(stage).toUpperCase();
    const timestamp = new Date().toISOString();
    const formattedTime = new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    let finalImageUrl = '';

    // 1. Parse Base64 buffer
    let buffer: Buffer;
    let mimeType = 'image/jpeg';
    if (imageBase64.startsWith('data:')) {
      const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(imageBase64, 'base64');
      }
    } else {
      buffer = Buffer.from(imageBase64, 'base64');
    }

    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const cleanFileName = fileName
      ? `${cleanOrderId}-${cleanStage.toLowerCase()}-${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      : `${cleanOrderId}-${cleanStage.toLowerCase()}-${Date.now()}.${ext}`;
    const storagePath = `orders/${cleanOrderId}/${cleanFileName}`;

    // 2. Upload to Supabase Storage Bucket 'product_workshop_images'
    try {
      const bucketName = 'product_workshop_images';

      // Ensure bucket exists
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      const bucketExists = Array.isArray(buckets) && buckets.some((b: any) => b.name === bucketName || b.id === bucketName);

      if (!bucketExists) {
        await supabaseAdmin.storage.createBucket(bucketName, { public: true, fileSizeLimit: 20971520 });
      }

      const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: true
        });

      if (!uploadErr && uploadData) {
        const { data: publicUrlData } = supabaseAdmin.storage
          .from(bucketName)
          .getPublicUrl(storagePath);

        if (publicUrlData?.publicUrl) {
          finalImageUrl = publicUrlData.publicUrl;
        }
      }
    } catch (storageErr) {
      console.warn('Supabase storage upload notice:', storageErr);
    }

    // Fallback to data URI if storage public URL could not be provisioned
    if (!finalImageUrl) {
      finalImageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:${mimeType};base64,${imageBase64}`;
    }

    const targetTable = storeTab === 'LLC' || cleanOrderId.toUpperCase().startsWith('US') ? 'delinquency_llc' : 'delinquency_global';
    const stampRemarkText = remark 
      ? `[${formattedTime}] Stage: ${cleanStage} (Photo Uploaded by ${authorName}): ${remark}`
      : `[${formattedTime}] Stage: ${cleanStage} (Photo Uploaded by ${authorName})`;

    // 3. Update order in delinquency table with image_url & remarks
    try {
      await supabaseAdmin
        .from(targetTable)
        .update({
          image_url: finalImageUrl,
          current_stage: cleanStage,
          remarks: stampRemarkText
        })
        .eq('order_id', cleanOrderId);
    } catch (tableErr) {
      console.warn('Delinquency table update notice:', tableErr);
    }

    // 4. Record into production_remarks table
    const remarkRow = {
      id: `rem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      order_id: cleanOrderId,
      remark: stampRemarkText,
      image_url: finalImageUrl,
      stage_transition: cleanStage,
      author: authorName,
      role: authorRole,
      created_at: timestamp
    };

    try {
      await supabaseAdmin.from('production_remarks').insert([remarkRow]);
    } catch (remErr) {
      console.warn('Production remarks insert notice:', remErr);
    }

    // 5. Record into order_audit_events table
    const auditRow = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      order_id: cleanOrderId,
      event_type: 'remark',
      title: `Workshop Photo (${cleanStage})`,
      stage: cleanStage,
      author_name: authorName,
      author_role: authorRole,
      remarks_text: stampRemarkText,
      metadata: {
        description: stampRemarkText,
        stage: cleanStage,
        photo_url: finalImageUrl,
        captured_at: timestamp
      },
      created_at: timestamp
    };

    try {
      await supabaseAdmin.from('order_audit_events').insert([auditRow]);
    } catch (audErr) {
      console.warn('Audit events insert notice:', audErr);
    }

    return res.json({
      success: true,
      orderId: cleanOrderId,
      stage: cleanStage,
      imageUrl: finalImageUrl,
      remark: stampRemarkText,
      author: authorName,
      timestamp: formattedTime
    });
  } catch (err: any) {
    console.error('Failed to upload workshop image:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to upload image' });
  }
});

async function startServer() {
  try {
    const distPath = path.join(process.cwd(), 'dist');
    const distIndexPath = path.join(distPath, 'index.html');
    const hasDist = fs.existsSync(distIndexPath);
    const isProdMode = process.env.NODE_ENV === 'production' && hasDist;

    if (!isProdMode) {
      try {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: 'spa'
        });
        app.use(vite.middlewares);
      } catch (viteErr: any) {
        console.warn('Could not initialize Vite middleware, falling back to static files:', viteErr.message);
        if (hasDist) {
          app.use(express.static(distPath, { maxAge: '1d', index: false }));
          app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api')) return next();
            res.sendFile(distIndexPath);
          });
        }
      }
    } else {
      app.use(express.static(distPath, { maxAge: '1d', index: false }));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        if (fs.existsSync(distIndexPath)) {
          return res.sendFile(distIndexPath);
        }
        res.status(200).send('<!DOCTYPE html><html><head><title>BLKBRD Operations</title></head><body><div id="root"></div></body></html>');
      });
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`BLKBRD Operations Server running on http://0.0.0.0:${PORT} (Node ${process.version}, ${process.env.NODE_ENV || 'development'})`);
    });

    const shutdown = (signal: string) => {
      console.log(`Received ${signal}. Gracefully closing server...`);
      server.close(() => {
        console.log('Server closed successfully.');
        process.exit(0);
      });
      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 5000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();