import { supabase } from './supabaseClient';
import { resolveCustomerName } from '../utils/customerResolver';

// ==========================================
// 1. GLOBAL & LLC RETURNS SERVICES
// ==========================================

export function normalizeReturnPayload(payload: any, table?: 'returns_global' | 'returns_llc') {
  const shoeSpecs: string[] = [];
  const prod = payload.stockProduct || payload.product;
  const leather = payload.stockLeather || payload.leather;
  const last = payload.stockLast || payload.last;
  const sole = payload.stockSole || payload.sole;
  const width = payload.stockWidth || payload.width;
  if (prod) shoeSpecs.push(`Product: ${prod}`);
  if (leather) shoeSpecs.push(`Leather: ${leather}`);
  if (last) shoeSpecs.push(`Last: ${last}`);
  if (sole) shoeSpecs.push(`Sole: ${sole}`);
  if (width) shoeSpecs.push(`Width: ${width}`);

  const rawRemarks = payload.remarks || payload.notes || '';
  let finalRemarks = rawRemarks;
  if (shoeSpecs.length > 0) {
    const specsStr = shoeSpecs.join(' • ');
    if (!finalRemarks.includes(specsStr)) {
      finalRemarks = finalRemarks ? `${finalRemarks} [${specsStr}]` : `[${specsStr}]`;
    }
  }

  const norm: Record<string, any> = {
    customer_name: payload.customer_name || payload.clientName || payload.client_name || 'Customer',
    return_type: payload.return_type || payload.type || payload.returnType || 'Exchange',
    reason: payload.reason || 'Size',
    old_order_id: String(payload.old_order_id || payload.oldOrderId || '').replace(/^#/, '').trim(),
    new_order_id: String(payload.new_order_id || payload.newOrderId || '').replace(/^#/, '').trim(),
    old_size: payload.old_size || payload.oldSize || payload.stockSize || '',
    new_size: payload.new_size || payload.newSize || '',
    return_received: (payload.return_received || payload.returnReceived || 'N').toUpperCase().startsWith('Y') ? 'Y' : 'N',
    status: payload.status || 'Open',
    replacement_done: (payload.replacement_done || payload.replacementDone || 'N').toUpperCase().startsWith('Y') ? 'Y' : 'N',
    return_initiated: payload.return_initiated || payload.returnInitiated || payload.initiatedDate || new Date().toISOString().split('T')[0],
    targeted_date: payload.targeted_date || payload.targetedDate || payload.newTargetDate || null,
    incoming_courier_name: payload.incoming_courier_name || payload.incomingCourierName || payload.incomingCourier || '',
    incoming_tracking_awb: payload.incoming_tracking_awb || payload.incomingTrackingAwb || payload.incomingTrackingNo || '',
    exchange_tracking_awb: payload.exchange_tracking_awb || payload.exchangeTrackingAwb || payload.exchangeTracking || '',
    region: payload.region || (table === 'returns_llc' ? 'USA' : 'Domestic'),
    country: payload.country || (table === 'returns_llc' ? 'United States' : 'India'),
    created_by: payload.created_by || payload.createdBy || 'Logistics Desk',
    remarks: finalRemarks
  };

  const sNo = payload.serial_number ?? payload.sNo;
  if (typeof sNo === 'number' && !isNaN(sNo)) {
    norm.serial_number = sNo;
  }

  return norm;
}

export async function fetchReturns(table: 'returns_global' | 'returns_llc') {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('serial_number', { ascending: true });

  if (error) {
    console.warn(`Supabase notice fetching ${table}:`, error.message || error);
  }

  if (data && data.length > 0) {
    return data;
  }

  return [];
}

export async function insertReturn(table: 'returns_global' | 'returns_llc', payload: any) {
  const norm = normalizeReturnPayload(payload, table);

  const { data, error } = await supabase
    .from(table)
    .insert([norm])
    .select();

  if (error) {
    throw new Error(`Failed to insert into ${table}: ${error.message}`);
  }

  // If marked as trial, automatically sync to trial_pairs table
  if (norm.reason === 'Trial' || norm.return_type === 'Trial') {
    try {
      await supabase.from('trial_pairs').insert([{
        order_id: norm.old_order_id,
        customer_name: norm.customer_name,
        shoe_model: norm.remarks || 'Trial Pair',
        source_type: table === 'returns_global' ? 'Global Returns' : 'LLC Returns',
        outbound_awb: norm.exchange_tracking_awb || norm.incoming_tracking_awb || 'Pending AWB',
        status: 'Active Trial'
      }]);
    } catch (e) {
      console.warn('Auto-sync return to trial_pairs error:', e);
    }
  }

  return { success: true, data: data?.[0] };
}

export async function updateReturn(table: 'returns_global' | 'returns_llc', id: string, payload: any) {
  const norm = normalizeReturnPayload(payload, table);

  const { error } = await supabase
    .from(table)
    .update(norm)
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update ${table}: ${error.message}`);
  }
  return { success: true };
}

// ==========================================
// 2. RETURN STOCK (IN & US) SERVICES
// ==========================================

export function parseStockRemarkDetails(remarkText?: string) {
  const text = remarkText || '';
  const leather = text.match(/Leather:\s*([^|\]•]+)/i)?.[1]?.trim() || '';
  const last = text.match(/Last:\s*([^|\]•]+)/i)?.[1]?.trim() || '';
  const sole = text.match(/Sole:\s*([^|\]•]+)/i)?.[1]?.trim() || '';
  const width = text.match(/Width:\s*([^|\]•]+)/i)?.[1]?.trim() || '';
  const notes = text.match(/Notes:\s*([^|\]•]+)/i)?.[1]?.trim() || '';
  return { leather, last, sole, width, notes };
}

export function normalizeReturnStockPayload(payload: any) {
  const itemName = payload.item_name || payload.itemName || payload.product || 'BLKBRD Footwear';
  const leather = payload.leather || '';
  const last = payload.last || '';
  const sole = payload.sole || '';
  const width = payload.width || 'E';
  const notes = payload.notes || payload.remarks || '';

  const specsParts: string[] = [];
  if (leather) specsParts.push(`Leather: ${leather}`);
  if (last) specsParts.push(`Last: ${last}`);
  if (sole) specsParts.push(`Sole: ${sole}`);
  if (width) specsParts.push(`Width: ${width}`);
  if (notes) specsParts.push(`Notes: ${notes}`);

  let customizationRemark = payload.customization_remark || payload.customizationRemark || '';
  if (specsParts.length > 0) {
    const specsStr = specsParts.join(' | ');
    if (!customizationRemark.includes(specsStr)) {
      customizationRemark = customizationRemark ? `${customizationRemark} | ${specsStr}` : specsStr;
    }
  }

  const norm: Record<string, any> = {
    receiving_date: payload.receiving_date || payload.receivingDate || new Date().toISOString().split('T')[0],
    order_id: String(payload.order_id || payload.orderId || '').replace(/^#/, '').trim(),
    item_name: itemName,
    leather,
    last,
    sole,
    size: payload.size || '',
    width,
    notes,
    customization: (payload.customization || (specsParts.length > 0 ? 'Y' : 'N')).toUpperCase().startsWith('Y') ? 'Y' : 'N',
    customization_remark: customizationRemark,
    return_tracking_awb: payload.return_tracking_awb || payload.returnTrackingAwb || ''
  };
  const sNo = payload.serial_number ?? payload.sNo;
  if (typeof sNo === 'number' && !isNaN(sNo)) {
    norm.serial_number = sNo;
  }

  return norm;
}

export async function fetchReturnStock(table: 'return_stock_in' | 'return_stock_us') {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('serial_number', { ascending: true });

  if (error) {
    console.error(`Error fetching ${table}:`, error);
    return [];
  }
  const defaultWarehouse = table === 'return_stock_us' ? 'US' : 'IN';
  return (data || []).map((row: any) => {
    const parsed = parseStockRemarkDetails(row.customization_remark);
    return {
      ...row,
      product: row.product || row.item_name || 'BLKBRD Footwear',
      leather: row.leather || parsed.leather || '',
      last: row.last || parsed.last || '',
      sole: row.sole || parsed.sole || '',
      size: row.size || '',
      width: row.width || parsed.width || 'E',
      notes: row.notes || parsed.notes || row.remarks || '',
      warehouse: row.warehouse || defaultWarehouse
    };
  });
}

export async function insertReturnStock(table: 'return_stock_in' | 'return_stock_us', payload: any) {
  const norm = normalizeReturnStockPayload(payload);

  const { data, error } = await supabase
    .from(table)
    .insert([norm])
    .select();

  if (error) {
    throw new Error(`Failed to insert into ${table}: ${error.message}`);
  }
  const defaultWarehouse = table === 'return_stock_us' ? 'US' : 'IN';
  return { 
    success: true, 
    data: data?.[0] ? { ...data[0], warehouse: defaultWarehouse } : undefined 
  };
}

export async function updateReturnStock(table: 'return_stock_in' | 'return_stock_us', id: string, payload: any) {
  const norm = normalizeReturnStockPayload(payload);

  const { error } = await supabase
    .from(table)
    .update(norm)
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update ${table}: ${error.message}`);
  }
  return { success: true };
}

export async function deleteReturnStock(table: 'return_stock_in' | 'return_stock_us', id: string) {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete from ${table}: ${error.message}`);
  }
  return { success: true };
}

// Aliases for Boston Stock naming
export async function fetchBostonStock(table: 'return_stock_in' | 'return_stock_us' = 'return_stock_in') {
  return fetchReturnStock(table);
}

export async function insertBostonStock(payload: any, table: 'return_stock_in' | 'return_stock_us' = 'return_stock_in') {
  return insertReturnStock(table, payload);
}

export async function updateBostonStock(payload: any, table: 'return_stock_in' | 'return_stock_us' = 'return_stock_in') {
  return updateReturnStock(table, payload.id, payload);
}


// ==========================================
// 3. DAILY DISPATCHES SERVICES
// ==========================================

export function normalizeDispatchPayload(payload: any) {
  const norm: Record<string, any> = {
    dispatch_date: payload.dispatch_date || payload.date || new Date().toISOString().split('T')[0],
    order_id: String(payload.order_id || payload.orderNumber || payload.orderId || '').replace(/^#/, '').trim(),
    shipping_type: payload.shipping_type || payload.shippingType || 'Domestic',
    shipping_partner: payload.shipping_partner || payload.shippingPartner || payload.courier || 'Bluedart Express',
    outgoing_tracking_awb: payload.outgoing_tracking_awb || payload.outgoingTrackingAwb || payload.trackingDetails || '',
    trial_pair: (payload.trial_pair || payload.trialPair || 'N').toUpperCase().startsWith('Y') ? 'Y' : 'N'
  };

  const sNo = payload.serial_number ?? payload.sNo;
  if (typeof sNo === 'number' && !isNaN(sNo)) {
    norm.serial_number = sNo;
  }

  return norm;
}

export async function fetchDailyDispatches() {
  try {
    const { data, error } = await supabase
      .from('daily_dispatches')
      .select('*')
      .order('serial_number', { ascending: true });

    if (error) {
      console.warn('Supabase notice fetching daily_dispatches:', error.message || error);
    }

    if (data && data.length > 0) {
      return data;
    }
  } catch (err: any) {
    console.warn('Network notice fetching daily_dispatches:', err?.message || err);
  }

  return [];
}

export async function insertDailyDispatch(payload: any) {
  const norm = normalizeDispatchPayload(payload);

  const { data, error } = await supabase
    .from('daily_dispatches')
    .insert([norm])
    .select();

  if (error) {
    throw new Error(`Failed to insert dispatch: ${error.message}`);
  }

  // If marked as trial pair ('Y'), automatically log it into the trial_pairs table
  if (norm.trial_pair === 'Y') {
    try {
      const resolvedCust =
        payload.customer_name ||
        payload.customerName ||
        resolveCustomerName(norm.order_id) ||
        'Customer';
      await supabase.from('trial_pairs').insert([{
        order_id: norm.order_id,
        customer_name: resolvedCust,
        shoe_model: payload.shoe_model || payload.product || payload.notes || 'Trial Pair Sample',
        source_type: 'Daily Dispatch',
        outbound_awb: norm.outgoing_tracking_awb,
        status: 'Sent'
      }]);
    } catch (e) {
      console.warn('Auto-sync dispatch to trial_pairs error:', e);
    }
  }

  return { success: true, data: data?.[0] };
}

export async function updateDailyDispatch(id: string, payload: any) {
  const norm = normalizeDispatchPayload(payload);

  const { error } = await supabase
    .from('daily_dispatches')
    .update(norm)
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update daily_dispatches: ${error.message}`);
  }
  return { success: true };
}

// ==========================================
// 4. TRIAL PAIRS SERVICES
// ==========================================

export async function fetchTrialPairs() {
  const { data, error } = await supabase
    .from('trial_pairs')
    .select('*')
    .order('serial_number', { ascending: true });

  if (error) {
    console.warn('Supabase notice fetching trial_pairs:', error.message || error);
  }

  const directPairs = data || [];
  const existingOrderIds = new Set(directPairs.map(p => String(p.order_id || '').trim()));

  const derivedPairs: any[] = [];

  try {
    const [globalRet, llcRet, dispatches] = await Promise.all([
      supabase.from('returns_global').select('*'),
      supabase.from('returns_llc').select('*'),
      supabase.from('daily_dispatches').select('*')
    ]);

    const isTrial = (text?: string) => (text || '').toLowerCase().includes('trial');

    (globalRet.data || [])
      .filter(r => isTrial(r.reason) || isTrial(r.return_type))
      .forEach(r => {
        const orderId = String(r.old_order_id || '').trim();
        if (orderId && !existingOrderIds.has(orderId)) {
          existingOrderIds.add(orderId);
          derivedPairs.push({
            id: `derived-g-${r.id}`,
            serial_number: r.serial_number,
            order_id: r.old_order_id,
            customer_name: r.customer_name || r.client_name,
            shoe_model: r.remarks || 'Global Return Trial',
            source_type: 'Global Returns',
            outbound_awb: r.exchange_tracking_awb || r.incoming_tracking_awb || 'N/A',
            status: r.status === 'Closed' ? 'Closed' : 'Active Trial',
            created_at: r.created_at
          });
        }
      });

    (llcRet.data || [])
      .filter(r => isTrial(r.reason) || isTrial(r.return_type))
      .forEach(r => {
        const orderId = String(r.old_order_id || '').trim();
        if (orderId && !existingOrderIds.has(orderId)) {
          existingOrderIds.add(orderId);
          derivedPairs.push({
            id: `derived-llc-${r.id}`,
            serial_number: r.serial_number,
            order_id: r.old_order_id,
            customer_name: r.customer_name || r.client_name,
            shoe_model: r.remarks || 'LLC Return Trial',
            source_type: 'LLC Returns',
            outbound_awb: r.exchange_tracking_awb || r.incoming_tracking_awb || 'N/A',
            status: r.status === 'Closed' ? 'Closed' : 'Active Trial',
            created_at: r.created_at
          });
        }
      });

    (dispatches.data || [])
      .filter(d => (d.trial_pair || '').toUpperCase() === 'Y')
      .forEach(d => {
        const orderId = String(d.order_id || '').trim();
        if (orderId && !existingOrderIds.has(orderId)) {
          existingOrderIds.add(orderId);
          const resolvedCustomer = resolveCustomerName(orderId) || 'Customer';
          derivedPairs.push({
            id: `derived-disp-${d.id}`,
            serial_number: d.serial_number,
            order_id: d.order_id,
            customer_name: resolvedCustomer,
            shoe_model: 'Dispatched Trial Pair',
            source_type: 'Daily Dispatch',
            outbound_awb: d.outgoing_tracking_awb || 'N/A',
            status: 'Sent',
            created_at: d.created_at
          });
        }
      });
  } catch (e) {
    console.warn('Notice deriving trial pairs from returns & dispatches:', e);
  }

  const combined = [...directPairs, ...derivedPairs];
  if (combined.length > 0) {
    return combined;
  }

  return [];
}

export async function insertTrialPair(payload: {
  order_id: string;
  customer_name?: string;
  shoe_model?: string;
  source_type?: string;
  outbound_awb?: string;
  status?: string;
  [key: string]: any;
}) {
  const norm: Record<string, any> = {
    order_id: String(payload.order_id || payload.orderNumber || '').replace(/^#/, '').trim(),
    customer_name: payload.customer_name || payload.customerName || 'Customer',
    shoe_model: payload.shoe_model || payload.shoeModel || 'Trial Pair',
    source_type: payload.source_type || payload.sourceType || 'Direct Entry',
    outbound_awb: payload.outbound_awb || payload.outboundAwb || '',
    status: payload.status || 'Active Trial'
  };

  const sNo = payload.serial_number ?? payload.sNo;
  if (typeof sNo === 'number' && !isNaN(sNo)) {
    norm.serial_number = sNo;
  }

  const { data, error } = await supabase
    .from('trial_pairs')
    .insert([norm])
    .select();

  if (error) {
    throw new Error(`Failed to insert trial pair: ${error.message}`);
  }
  return { success: true, data: data?.[0] };
}

export async function updateTrialPair(id: string, payload: any) {
  const norm: Record<string, any> = {};
  if (payload.customer_name || payload.customerName) norm.customer_name = payload.customer_name || payload.customerName;
  if (payload.shoe_model || payload.shoeModel) norm.shoe_model = payload.shoe_model || payload.shoeModel;
  if (payload.source_type || payload.sourceType) norm.source_type = payload.source_type || payload.sourceType;
  if (payload.outbound_awb || payload.outboundAwb) norm.outbound_awb = payload.outbound_awb || payload.outboundAwb;
  if (payload.status) norm.status = payload.status;

  const { error } = await supabase
    .from('trial_pairs')
    .update(norm)
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to update trial pair: ${error.message}`);
  }
  return { success: true };
}