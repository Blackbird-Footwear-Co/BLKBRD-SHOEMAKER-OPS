/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShopifyOrder, DelinquencyItem } from '../types';
import { normalizeOrderId } from '../utils/csvParser';

const PRODUCT_IMAGE_CACHE_KEY = 'blkbrd_shopify_product_images_cache_v2';

export interface ImageCatalog {
  byId: Record<string, string>;
  byTitle: Record<string, string>;
  byHandle: Record<string, string>;
  byModel: Record<string, string>;
  byModelColor: Record<string, string>;
  lastFetched: number;
}

let memoryCatalog: ImageCatalog = {
  byId: {},
  byTitle: {},
  byHandle: {},
  byModel: {},
  byModelColor: {},
  lastFetched: 0
};

// Initialize cache from localStorage
try {
  const cached = localStorage.getItem(PRODUCT_IMAGE_CACHE_KEY);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (parsed && (parsed.byId || parsed.byTitle || parsed.byModel)) {
      memoryCatalog = {
        byId: parsed.byId || {},
        byTitle: parsed.byTitle || {},
        byHandle: parsed.byHandle || {},
        byModel: parsed.byModel || {},
        byModelColor: parsed.byModelColor || {},
        lastFetched: parsed.lastFetched || 0
      };
    }
  }
} catch (e) {
  // Ignore
}

/**
 * Normalizes title string for fuzzy key lookup
 */
export function cleanProductKey(title?: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/\s*\(x\d+\)/gi, '') // remove quantity tags like (x1)
    .replace(/customisation:[^,]*/gi, '') // remove customization notes in product titles
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch product catalog images from Shopify API via server proxy
 */
export async function fetchStoreProductImages(forceRefresh = false): Promise<ImageCatalog> {
  try {
    const query = new URLSearchParams();
    if (forceRefresh) query.set('refresh', 'true');

    const baseUrl = typeof window !== 'undefined' ? '' : (process.env.APP_URL || 'http://localhost:3000');
    const res = await fetch(`${baseUrl}/api/shopify/product-images?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && (data.byId || data.byTitle || data.byModel)) {
        memoryCatalog = {
          byId: { ...memoryCatalog.byId, ...(data.byId || {}) },
          byTitle: { ...memoryCatalog.byTitle, ...(data.byTitle || {}) },
          byHandle: { ...memoryCatalog.byHandle, ...(data.byHandle || {}) },
          byModel: { ...memoryCatalog.byModel, ...(data.byModel || {}) },
          byModelColor: { ...memoryCatalog.byModelColor, ...(data.byModelColor || {}) },
          lastFetched: Date.now()
        };

        try {
          localStorage.setItem(PRODUCT_IMAGE_CACHE_KEY, JSON.stringify(memoryCatalog));
        } catch (err) {
          // Ignore storage quota
        }

        window.dispatchEvent(new CustomEvent('blkbrd_product_images_updated', { detail: memoryCatalog }));
      }
    }
  } catch (err) {
    console.warn('Could not fetch Shopify store product images:', err);
  }
  return memoryCatalog;
}

// Auto-trigger fetch on load if empty or older than 1 hour
if (typeof window !== 'undefined') {
  setTimeout(() => {
    if (Object.keys(memoryCatalog.byTitle).length < 20 || Date.now() - memoryCatalog.lastFetched > 60 * 60 * 1000) {
      fetchStoreProductImages().catch(() => {});
    }
  }, 100);
}

/**
 * Synchronous resolver that returns the authentic Shopify image URL for an order or product.
 */
export function resolveProductImage(
  orderId?: string | null,
  productTitle?: string | null,
  shopifyOrders: ShopifyOrder[] = [],
  explicitImageUrl?: string | null
): string | undefined {
  // 1. If explicit URL provided and valid, use it
  if (explicitImageUrl && typeof explicitImageUrl === 'string' && explicitImageUrl.trim().startsWith('http')) {
    return explicitImageUrl.trim();
  }

  // 2. Find matching Shopify order by orderId
  let matchingProductTitle = productTitle || '';
  if (orderId && shopifyOrders.length > 0) {
    const norm = normalizeOrderId(orderId);
    const cleanNum = String(orderId).replace(/^[#\s]+/, '').trim().toLowerCase();

    const matchingOrder = shopifyOrders.find(o => {
      const sNorm = normalizeOrderId(o.orderNumber || o.id);
      const sNum = String(o.orderNumber || o.id).replace(/^[#\s]+/, '').trim().toLowerCase();
      return sNorm === norm || sNum === cleanNum || sNorm.includes(norm) || norm.includes(sNorm);
    });

    if (matchingOrder) {
      if (matchingOrder.imageUrl && matchingOrder.imageUrl.startsWith('http')) {
        return matchingOrder.imageUrl;
      }
      if (Array.isArray(matchingOrder.imageUrls) && matchingOrder.imageUrls[0]?.startsWith('http')) {
        return matchingOrder.imageUrls[0];
      }
      if (Array.isArray(matchingOrder.lineItemDetails)) {
        for (const detail of matchingOrder.lineItemDetails) {
          if (detail.imageUrl && detail.imageUrl.startsWith('http')) {
            return detail.imageUrl;
          }
        }
      }
      if (!matchingProductTitle && matchingOrder.lineItems) {
        matchingProductTitle = matchingOrder.lineItems;
      }
    }
  }

  // 3. Match against the Shopify Store Product Catalog by Product Title/Model
  const rawTitle = matchingProductTitle || '';
  if (rawTitle) {
    const cleanKey = cleanProductKey(rawTitle);
    const lowerRaw = rawTitle.toLowerCase().trim();

    // Direct title match
    if (memoryCatalog.byTitle[lowerRaw]) {
      return memoryCatalog.byTitle[lowerRaw];
    }
    if (memoryCatalog.byTitle[cleanKey]) {
      return memoryCatalog.byTitle[cleanKey];
    }

    // Extract core shoe model name (e.g. 'dixon', 'harley', 'edward', 'adele', 'meridius', 'tomahawk', 'kingston', 'henry', 'rudyard', 'baird', 'conrad', 'sterling', 'outlander', 'romero', 'aurus', 'fenrir')
    const words = cleanKey.split(' ').filter(w => w.length >= 3 && !['the', 'and', 'for', 'men', 'boots', 'shoes', 'boot', 'shoe', 'hand', 'welted', 'collection', 'classics', 'eur', 'uk', 'us'].includes(w));
    const modelCandidate = words[0];

    const colors = ['brown', 'black', 'tan', 'oxblood', 'burgundy', 'chestnut', 'cognac', 'cherry', 'wheatbuck', 'pullup', 'suede', 'bison', 'chromexcel', 'horserump', 'museum', 'teacore', 'snuff', 'zanzibar', 'toscanello'];
    const matchedColor = colors.find(c => cleanKey.includes(c));

    if (modelCandidate) {
      if (matchedColor && memoryCatalog.byModelColor[`${modelCandidate} ${matchedColor}`]) {
        return memoryCatalog.byModelColor[`${modelCandidate} ${matchedColor}`];
      }

      if (memoryCatalog.byModel[modelCandidate]) {
        return memoryCatalog.byModel[modelCandidate];
      }

      // Check partial title matching with modelCandidate in catalog
      for (const [key, url] of Object.entries(memoryCatalog.byTitle)) {
        if (!url) continue;
        if (key.includes(modelCandidate)) {
          if (matchedColor && key.includes(matchedColor)) {
            return url;
          }
        }
      }

      for (const [key, url] of Object.entries(memoryCatalog.byTitle)) {
        if (!url) continue;
        if (key.startsWith(modelCandidate) || key.includes(` ${modelCandidate} `) || key.includes(modelCandidate)) {
          return url;
        }
      }
    }
  }

  return undefined;
}
