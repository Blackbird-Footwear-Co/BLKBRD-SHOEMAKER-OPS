/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShopifyOrder, DelinquencyItem } from '../types';
import { calculateExpectedDate, calculateDelayDays, normalizeStage } from '../utils/delinquencyUtils';
import { normalizeOrderId, formatBlkbrdOrderId, orderIdsMatch } from '../utils/csvParser';
import { resolveShopifyNumericId, resolveCustomerName, isGenericCustomerName } from '../utils/customerResolver';
import { supabase } from './supabaseClient';
import shopifyOrderDateMapJson from '../data/shopifyOrderDateMap.json';

const staticOrderDateMap: Record<string, string> = shopifyOrderDateMapJson as Record<string, string>;

/**
 * Resolves the genuine original placement date for any Shopify order.
 * Ensures the historical order date from July 2026 onwards is strictly preserved.
 */
export function resolveOriginalOrderDate(orderIdentifier?: string | null, rawCreatedAt?: string | null): string {
  const cleanNum = String(orderIdentifier || '').replace(/^[#\sA-Za-z_-]+/, '').replace(/\D/g, '');
  if (cleanNum && staticOrderDateMap[cleanNum]) {
    return staticOrderDateMap[cleanNum];
  }

  if (rawCreatedAt) {
    const parsed = String(rawCreatedAt).split('T')[0];
    if (parsed && parsed !== 'null' && parsed !== 'undefined' && parsed.length === 10) {
      return parsed;
    }
  }

  if (cleanNum) {
    const num = parseInt(cleanNum, 10);
    if (!isNaN(num)) {
      if (num >= 10305) return '2026-09-27';
      if (num >= 10206) return '2026-09-12';
      if (num >= 10100) return '2026-09-01';
      if (num >= 10000) return '2026-08-19';
      if (num >= 9858) return '2026-08-01';
      if (num >= 9816) return '2026-07-28';
    }
  }

  return new Date().toISOString().split('T')[0];
}

/**
 * Synchronizes orders fetched from Shopify into both Supabase tables:
 * 1. public.shopify_orders (as mirror cache)
 * 2. public.delinquency_global / public.delinquency_llc (as active workshop orders for the journey)
 */
export async function syncShopifyOrdersToSupabase(
  orders: ShopifyOrder[]
): Promise<{ insertedCount: number; mirroredCount: number }> {
  if (!orders || orders.length === 0) {
    return { insertedCount: 0, mirroredCount: 0 };
  }

  let insertedCount = 0;
  let mirroredCount = 0;

  try {
    // 1. Mirror into public.shopify_orders with explicit conflict resolution on 'id'
    const mirrorRows = orders.map(o => {
      const cleanNum = String(o.orderNumber || o.id || '').replace(/^#/, '').trim();
      const isLlcStore = o.storeAccount === 'LLC' || o.currency === 'USD' || cleanNum.toUpperCase().startsWith('US');
      const account: 'Global' | 'LLC' = isLlcStore ? 'LLC' : 'Global';

      const numericId = resolveShopifyNumericId(cleanNum, o.id);
      const originalDate = resolveOriginalOrderDate(cleanNum, o.createdAt);
      const fullCreatedAt = (o.createdAt && o.createdAt.length > 10 && !o.createdAt.startsWith('2026-09-26'))
        ? o.createdAt
        : `${originalDate}T10:00:00.000Z`;

      return {
        id: numericId || String(o.id || cleanNum),
        order_number: cleanNum,
        customer_name: o.customerName || 'Valued Customer',
        email: o.email || '',
        total_price: o.totalPrice || '',
        currency: o.currency || (account === 'LLC' ? 'USD' : 'INR'),
        financial_status: (o as any).financial_status || o.financialStatus || 'paid',
        fulfillment_status: o.fulfillmentStatus || 'unfulfilled',
        operational_status: o.operationalStatus || 'Ready to Ship',
        line_items: o.lineItems || 'BLKBRD Goodyear Welted',
        notes: o.notes || '',
        store_account: account,
        created_at: fullCreatedAt,
        synced_at: fullCreatedAt
      };
    });

    // Helper to chunk arrays
    const chunkArray = <T>(arr: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    // 1. Mirror into public.shopify_orders in batches of 100
    for (const batch of chunkArray(mirrorRows, 100)) {
      const { error: mirrorErr } = await supabase
        .from('shopify_orders')
        .upsert(batch, { onConflict: 'id' });

      if (!mirrorErr) {
        mirroredCount += batch.length;
      } else {
        console.warn('Supabase shopify_orders mirror notice:', mirrorErr.message || mirrorErr);
      }
    }

    // 2. Fetch existing delinquency orders to avoid overwriting user journeys
    const [globalRes, llcRes] = await Promise.all([
      supabase.from('delinquency_global').select('order_id, current_stage, order_status'),
      supabase.from('delinquency_llc').select('order_id, current_stage, order_status')
    ]);

    const existingGlobalNorms = new Set<string>();
    (globalRes.data || []).forEach((r: any) => {
      if (r.order_id) existingGlobalNorms.add(normalizeOrderId(r.order_id));
    });

    const existingLlcNorms = new Set<string>();
    (llcRes.data || []).forEach((r: any) => {
      if (r.order_id) existingLlcNorms.add(normalizeOrderId(r.order_id));
    });

    const globalInserts: any[] = [];
    const llcInserts: any[] = [];

    for (const order of orders) {
      const cleanNum = String(order.orderNumber || '').replace(/^#/, '').trim();
      const isLlc = order.storeAccount === 'LLC' || order.currency === 'USD' || cleanNum.toUpperCase().startsWith('US');
      const formattedOrderId = formatBlkbrdOrderId(cleanNum, isLlc ? 'LLC' : 'Global');
      const norm = normalizeOrderId(formattedOrderId);
      const rawNorm = normalizeOrderId(cleanNum);

      const targetSet = isLlc ? existingLlcNorms : existingGlobalNorms;
      if (targetSet.has(norm) || targetSet.has(rawNorm)) {
        continue;
      }

      targetSet.add(norm);

      const orderDate = resolveOriginalOrderDate(cleanNum, order.createdAt);
      const expectedDate = calculateExpectedDate(orderDate);

      const isRtd = order.operationalStatus === 'Ready to Ship';
      const isShipped = order.operationalStatus === 'Shipped';
      const rawDelay = calculateDelayDays(orderDate, expectedDate);
      const isDelayed = !isRtd && !isShipped && rawDelay >= 1;
      const initialStage = isShipped ? 'Shipped' : isRtd ? 'RTD' : 'Preparation';
      const initialStatus = isShipped ? 'Shipped' : isRtd ? 'Ready to Ship' : isDelayed ? 'Delayed' : 'In Production';

      const payload = {
        order_id: formattedOrderId,
        customer_name: (order.customerName || 'Valued Customer').trim(),
        client_name: (order.customerName || 'Valued Customer').trim(),
        product: (order.lineItems || 'BLKBRD Goodyear Welted').trim(),
        order_date: orderDate,
        expected_date: expectedDate,
        current_stage: initialStage,
        delay_reason: '',
        remarks: order.notes ? `Shopify: ${order.notes}` : `Initiated on Shopify (${order.totalPrice || ''})`,
        store_account: isLlc ? 'LLC' : 'Global',
        order_status: initialStatus,
        action_required: isRtd ? 'Ready to Dispatch (RTD)' : isShipped ? 'Dispatched' : 'Production Workshop (Preparation)',
        escalation_status: 'Normal'
      };

      if (isLlc) {
        llcInserts.push(payload);
      } else {
        globalInserts.push(payload);
      }
    }

    for (const batch of chunkArray(globalInserts, 100)) {
      const { error: insErr } = await supabase.from('delinquency_global').insert(batch);
      if (!insErr) {
        insertedCount += batch.length;
      } else {
        console.warn('Auto-insert into delinquency_global notice:', insErr.message || insErr);
      }
    }

    for (const batch of chunkArray(llcInserts, 100)) {
      const { error: insErr } = await supabase.from('delinquency_llc').insert(batch);
      if (!insErr) {
        insertedCount += batch.length;
      } else {
        console.warn('Auto-insert into delinquency_llc notice:', insErr.message || insErr);
      }
    }
  } catch (syncErr) {
    console.warn('Error in syncShopifyOrdersToSupabase:', syncErr);
  }

  return { insertedCount, mirroredCount };
}

export function convertShopifyOrderToDelinquencyItem(
  order: ShopifyOrder,
  sNo: number | string = `S-${order.orderNumber}`
): DelinquencyItem {
  const cleanOrderNumber = String(order.orderNumber || '').replace(/^[#\s]+/, '').trim();
  const orderDate = resolveOriginalOrderDate(cleanOrderNumber, order.createdAt);

  const expectedDate = calculateExpectedDate(orderDate);
  const rawDelay = calculateDelayDays(orderDate, expectedDate);

  const isRtd = order.operationalStatus === 'Ready to Ship';
  const isShipped = order.operationalStatus === 'Shipped';
  // Delinquent orders are those only with 1 or more days of delay (Expected date + 1, 2, 3, 4 days and so on)
  const isDelayed = !isRtd && !isShipped && rawDelay >= 1;

  let currentStage = 'Preparation';
  let orderStatus: 'Delayed' | 'Ready to Ship' | 'Shipped' | 'In Production' = 'In Production';

  if (isRtd) {
    currentStage = 'RTD';
    orderStatus = 'Ready to Ship';
  } else if (isShipped) {
    currentStage = 'Shipped';
    orderStatus = 'Shipped';
  } else if (isDelayed) {
    currentStage = 'Preparation';
    orderStatus = 'Delayed';
  } else {
    currentStage = 'Preparation';
    orderStatus = 'In Production';
  }

  const accountStr = String(order.storeAccount || '').toUpperCase();
  const isLlcStore = accountStr === 'LLC' || order.currency === 'USD' || cleanOrderNumber.toUpperCase().startsWith('US');
  const storeTab: 'Global' | 'LLC' = isLlcStore ? 'LLC' : 'Global';

  const formattedOrderId = formatBlkbrdOrderId(cleanOrderNumber, storeTab);
  const customerName = (order.customerName || 'Valued Customer').trim();
  const product = (order.lineItems || 'BLKBRD Handcrafted Footwear').trim();

  return {
    id: `shopify-${formattedOrderId}`,
    sNo,
    orderId: formattedOrderId,
    customerName,
    clientName: customerName,
    product,
    orderDate,
    expectedDate,
    daysDelayed: isRtd || isShipped ? 0 : Math.max(0, rawDelay),
    currentStage,
    delayReason: isRtd || isShipped ? '' : isDelayed ? (order.notes || 'Workshop SLA Exceeded') : '',
    remarks: order.notes ? `Shopify: ${order.notes}` : `Shopify ${storeTab} Order (${order.totalPrice || ''})`,
    actionRequired: isRtd ? 'Ready to Dispatch (RTD)' : isShipped ? 'Dispatched' : isDelayed ? 'Delayed: Workshop expediting' : 'Production Workshop',
    escalationStatus: rawDelay > 14 && isDelayed ? 'Escalated to Production Lead' : 'Normal',
    storeTab,
    orderStatus,
    imageUrl: order.imageUrl,
    imageUrls: order.imageUrls,
    lineItemDetails: order.lineItemDetails,
    craftsmanNotes: order.craftsmanNotes,
    customSpecifications: order.customSpecifications,
    shippingMethod: order.shippingMethod,
    customerEmail: order.customerEmail || order.email,
    phone: order.phone,
    address: order.address,
    shopifyNotes: order.notes,
    syncedToSheet: true
  };
}

export function convertDelinquencyToShopifyOrder(item: DelinquencyItem): ShopifyOrder {
  const cleanNum = String(item.orderId || '').replace(/^[#\sA-Za-z_-]+/, '').trim() || String(item.orderId || '').replace(/^#/, '');
  const isLlc = item.storeTab === 'LLC' || String(item.orderId).toUpperCase().startsWith('US');
  const storeAccount: 'Global' | 'LLC' = isLlc ? 'LLC' : 'Global';
  const isShipped = item.currentStage === 'Shipped' || item.orderStatus === 'Shipped';
  const isRtd = item.currentStage === 'RTD' || item.orderStatus === 'Ready to Ship';
  const operationalStatus: 'Ready to Ship' | 'Shipped' | 'Delayed' | 'In Production' =
    isShipped ? 'Shipped' : isRtd ? 'Ready to Ship' : (item.orderStatus === 'Delayed' || (item.daysDelayed || 0) > 0) ? 'Delayed' : 'In Production';

  const rawRemarks = (item.remarks || '').replace(/^Shopify:\s*/i, '').trim();

  // Extract Price from remarks if present
  let price = storeAccount === 'LLC' ? '$295.00' : '₹16,500';
  const priceMatch = rawRemarks.match(/(?:₹|\$|INR\s*|USD\s*)([\d,]+)/i) || rawRemarks.match(/\((₹[\d,]+)\)/);
  if (priceMatch) {
    const rawVal = priceMatch[1].trim();
    price = rawVal.startsWith('₹') || rawVal.startsWith('$') ? rawVal : (storeAccount === 'LLC' ? `$${rawVal}` : `₹${rawVal}`);
  }

  // Parse Courier / Tracking / Milestones / Notes
  const lines = rawRemarks.split('\n').map(l => l.trim()).filter(Boolean);
  let shippingMethod = '';
  const craftsmanNotesList: string[] = [];
  const notesList: string[] = [];

  for (const line of lines) {
    if (/courier|ups|bluedart|dhl|fedex|delhivery|tracking|awb/i.test(line)) {
      shippingMethod = line.replace(/^\d+[\/-]\d+[\s-]*/, '').trim() || line;
      notesList.push(line);
    } else if (/cutting|upper|bottom|finish|last|last-|size|sole|width|dainite|midsole|heel|lining|insole|fit/i.test(line)) {
      craftsmanNotesList.push(line);
    } else {
      notesList.push(line);
    }
  }

  // Build detailed line items
  const existingLineItems = Array.isArray(item.lineItemDetails) && item.lineItemDetails.length > 0
    ? item.lineItemDetails
    : (item.product || 'BLKBRD Goodyear Welted').split(/,\s*(?=[A-Z0-9])/).map((p, idx) => {
        const qtyMatch = p.match(/\(x(\d+)\)/);
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
        const cleanTitle = p.replace(/\(x\d+\)/g, '').trim();
        return {
          id: `line-${cleanNum}-${idx + 1}`,
          title: cleanTitle,
          quantity: qty,
          price,
          craftsmanNotes: craftsmanNotesList.join(' • '),
          imageUrl: item.imageUrl || ''
        };
      });

  const consolidatedCraftsmanNotes = item.craftsmanNotes || craftsmanNotesList.join(' • ');
  const consolidatedNotes = item.shopifyNotes || notesList.join(' | ') || rawRemarks;

  const originalDate = resolveOriginalOrderDate(cleanNum, item.orderDate);

  const resolvedName = resolveCustomerName(cleanNum, item.customerName || item.clientName);

  return {
    id: String(item.id || `shopify-${cleanNum}`),
    orderNumber: cleanNum,
    customerName: resolvedName || 'Valued Customer',
    email: item.customerEmail || '',
    customerEmail: item.customerEmail || '',
    phone: item.phone || '',
    address: item.address || '',
    shippingMethod: shippingMethod || (storeAccount === 'LLC' ? 'International DHL / FedEx' : 'Bluedart Express'),
    totalPrice: price,
    currency: storeAccount === 'LLC' ? 'USD' : 'INR',
    financialStatus: 'paid',
    fulfillmentStatus: isShipped ? 'fulfilled' : 'unfulfilled',
    operationalStatus,
    lineItems: item.product || 'BLKBRD Goodyear Welted',
    lineItemDetails: existingLineItems,
    craftsmanNotes: consolidatedCraftsmanNotes,
    customSpecifications: item.customSpecifications || {},
    notes: consolidatedNotes,
    storeAccount,
    storeTab: storeAccount,
    createdAt: `${originalDate}T10:00:00.000Z`,
    imageUrl: item.imageUrl,
    imageUrls: item.imageUrls
  };
}

export function mergeShopifyOrdersIntoDelinquencies(
  existingDelinquencies: DelinquencyItem[],
  shopifyOrders: ShopifyOrder[]
): DelinquencyItem[] {
  if (!shopifyOrders || shopifyOrders.length === 0) {
    return existingDelinquencies;
  }

  const getCanonicalKey = (rawOrderId: string, storeTab?: string): string => {
    const formatted = formatBlkbrdOrderId(rawOrderId, storeTab);
    return formatted || normalizeOrderId(rawOrderId);
  };

  const delinquencyMap = new Map<string, DelinquencyItem>();
  existingDelinquencies.forEach(item => {
    const isLlc = item.storeTab === 'LLC' || String(item.orderId).toUpperCase().startsWith('US');
    const storeTab: 'Global' | 'LLC' = isLlc ? 'LLC' : 'Global';
    const key = getCanonicalKey(item.orderId, storeTab);
    delinquencyMap.set(key, { ...item });
  });

  shopifyOrders.forEach((shopifyOrder, idx) => {
    const cleanNum = String(shopifyOrder.orderNumber || '').replace(/^#/, '').trim();
    if (!cleanNum) return;

    const accountStr = String(shopifyOrder.storeAccount || '').toUpperCase();
    const isLlcStore = accountStr === 'LLC' || shopifyOrder.currency === 'USD' || cleanNum.toUpperCase().startsWith('US');
    const storeTab: 'Global' | 'LLC' = isLlcStore ? 'LLC' : 'Global';

    const canonicalKey = getCanonicalKey(cleanNum, storeTab);

    let existingKey = canonicalKey;
    let existing = delinquencyMap.get(canonicalKey);

    if (!existing) {
      for (const [k, item] of delinquencyMap.entries()) {
        if (orderIdsMatch(item.orderId, cleanNum) || orderIdsMatch(item.orderId, canonicalKey)) {
          existing = item;
          existingKey = k;
          break;
        }
      }
    }

    const isRtd = shopifyOrder.operationalStatus === 'Ready to Ship';
    const isShipped = shopifyOrder.operationalStatus === 'Shipped';

    if (existing) {
      const delayDays = (existing.orderDate && existing.expectedDate)
        ? calculateDelayDays(existing.orderDate, existing.expectedDate)
        : (existing.daysDelayed || 0);

      // Authoritative workshop stage from delinquency database must NEVER be overwritten by Shopify cache status
      let updatedStage = existing.currentStage || 'Cutting';
      if (existing.currentStage === 'Shipped' || isShipped) {
        updatedStage = 'Shipped';
      } else if (existing.currentStage === 'RTD') {
        updatedStage = 'RTD';
      } else if (existing.currentStage) {
        // Strictly preserve Cutting, Closing, Preparation, Upper, Bottom, Finish, QC, ON HOLD
        updatedStage = existing.currentStage;
      }

      const isOrderRtd = updatedStage === 'RTD' || existing.orderStatus === 'Ready to Ship' || isRtd;
      const isOrderShipped = updatedStage === 'Shipped' || existing.orderStatus === 'Shipped' || isShipped;
      const isOrderHold = updatedStage.toUpperCase() === 'ON HOLD';
      const isDelayed = !isOrderRtd && !isOrderShipped && delayDays >= 1;

      const updatedStatus: 'Delayed' | 'Ready to Ship' | 'Shipped' | 'In Production' =
        isOrderShipped ? 'Shipped' : isOrderRtd ? 'Ready to Ship' : (isOrderHold || isDelayed) ? 'Delayed' : 'In Production';

      const updatedAction = isOrderRtd
        ? 'Ready to Dispatch (RTD)'
        : isOrderShipped
        ? 'Dispatched'
        : isOrderHold
        ? (existing.actionRequired || 'On Hold: Workshop Review')
        : existing.actionRequired || `Production Workshop (${updatedStage})`;

      const mergedCustomer = resolveCustomerName(
        cleanNum,
        (!isGenericCustomerName(shopifyOrder.customerName) && shopifyOrder.customerName)
          ? shopifyOrder.customerName
          : (!isGenericCustomerName(existing.customerName) && existing.customerName)
          ? existing.customerName
          : existing.clientName
      );

      delinquencyMap.set(existingKey, {
        ...existing,
        customerName: mergedCustomer,
        clientName: mergedCustomer,
        product: existing.product && existing.product !== 'BLKBRD Goodyear Welted' ? existing.product : shopifyOrder.lineItems || existing.product,
        orderStatus: updatedStatus,
        currentStage: updatedStage,
        storeTab: existing.storeTab || storeTab,
        imageUrl: shopifyOrder.imageUrl || existing.imageUrl,
        imageUrls: (shopifyOrder.imageUrls && shopifyOrder.imageUrls.length > 0) ? shopifyOrder.imageUrls : existing.imageUrls,
        lineItemDetails: (shopifyOrder.lineItemDetails && shopifyOrder.lineItemDetails.length > 0) ? shopifyOrder.lineItemDetails : existing.lineItemDetails,
        craftsmanNotes: shopifyOrder.craftsmanNotes || existing.craftsmanNotes,
        customSpecifications: (shopifyOrder.customSpecifications && Object.keys(shopifyOrder.customSpecifications).length > 0) ? shopifyOrder.customSpecifications : existing.customSpecifications,
        shippingMethod: shopifyOrder.shippingMethod || existing.shippingMethod,
        customerEmail: shopifyOrder.customerEmail || shopifyOrder.email || existing.customerEmail,
        phone: shopifyOrder.phone || existing.phone,
        address: shopifyOrder.address || existing.address,
        shopifyNotes: shopifyOrder.notes || existing.shopifyNotes,
        actionRequired: updatedAction,
        daysDelayed: (isOrderRtd || isOrderShipped) ? 0 : delayDays
      });
    } else {
      const newItem = convertShopifyOrderToDelinquencyItem(shopifyOrder, existingDelinquencies.length + idx + 1);
      delinquencyMap.set(canonicalKey, newItem);
    }
  });

  // Guarantee item.id uniqueness across all returned items
  const finalItems: DelinquencyItem[] = [];
  const seenIds = new Set<string>();

  for (const item of delinquencyMap.values()) {
    let uniqueId = item.id;
    if (!uniqueId || seenIds.has(uniqueId)) {
      uniqueId = `${uniqueId || 'del'}-${item.orderId}-${finalItems.length}`;
    }
    seenIds.add(uniqueId);
    finalItems.push({
      ...item,
      id: uniqueId
    });
  }

  return finalItems;
}