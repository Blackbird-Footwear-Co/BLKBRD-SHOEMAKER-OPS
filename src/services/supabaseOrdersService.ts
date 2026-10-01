import { supabase } from './supabaseClient';
import { DelinquencyItem, DispatchItem } from '../types';
import { resolveCustomerName } from '../utils/customerResolver';
import { calculateExpectedDate, calculateDelayDays } from '../utils/delinquencyUtils';

export interface DepartmentUser {
  name: string;
  role: 'admin' | 'production' | 'logistics';
}

// 1. Live Fetch: Pulls from delinquency_global and delinquency_llc tables
export async function fetchLiveDatabaseOrders() {
  const [globalRes, llcRes] = await Promise.all([
    supabase.from('delinquency_global').select('*').order('serial_number', { ascending: true }),
    supabase.from('delinquency_llc').select('*').order('serial_number', { ascending: true })
  ]);

  if (globalRes.error) console.warn('Supabase delinquency_global notice:', globalRes.error.message || globalRes.error);
  if (llcRes.error) console.warn('Supabase delinquency_llc notice:', llcRes.error.message || llcRes.error);

  const globalRows = globalRes.data || [];
  const llcRows = llcRes.data || [];

  const mapRowToDelinquency = (row: any, storeTab: 'Global' | 'LLC', idx: number): DelinquencyItem => {
    const orderDateStr = row.order_date || '';
    const expectedDateStr = row.expected_date || (orderDateStr ? calculateExpectedDate(orderDateStr) : '');
    const daysDelayed = orderDateStr ? calculateDelayDays(orderDateStr, expectedDateStr) : 0;

    const rawCustomer = (row.customer_name || row.client_name || row.customerName || row.clientName || '').trim();
    const resolvedCustomer = resolveCustomerName(row.order_id, rawCustomer);

    const isRtd = row.current_stage === 'RTD' || (row.order_status || '').toUpperCase() === 'READY TO SHIP';
    const isShipped = row.current_stage === 'Shipped' || (row.order_status || '').toUpperCase() === 'SHIPPED';
    const isDelayed = !isRtd && !isShipped && daysDelayed >= 1;
    const computedStatus: 'Delayed' | 'Ready to Ship' | 'Shipped' | 'In Production' =
      isShipped ? 'Shipped' : isRtd ? 'Ready to Ship' : isDelayed ? 'Delayed' : 'In Production';

    return {
      id: row.id,
      sNo: row.serial_number !== undefined && row.serial_number !== null ? Number(row.serial_number) : idx + 1,
      orderId: row.order_id,
      customerName: resolvedCustomer,
      clientName: resolvedCustomer,
      product: row.product || 'BLKBRD Goodyear Welted',
      orderDate: orderDateStr,
      expectedDate: expectedDateStr,
      daysDelayed: (isRtd || isShipped) ? 0 : daysDelayed,
      currentStage: row.current_stage || 'Preparation',
      delayReason: row.delay_reason || '',
      remarks: row.remarks || '',
      actionRequired: row.delay_reason ? `Review issue: ${row.delay_reason}` : (isDelayed ? 'Delayed: Workshop expediting required' : 'Standard workshop flow'),
      escalationStatus: daysDelayed > 10 ? 'Escalated to Production Lead' : 'Normal',
      storeTab,
      orderStatus: computedStatus,
      syncedToSheet: true
    };
  };

  const delinquencies: DelinquencyItem[] = [
    ...globalRows.map((r, i) => mapRowToDelinquency(r, 'Global', i)),
    ...llcRows.map((r, i) => mapRowToDelinquency(r, 'LLC', i))
  ].sort((a, b) => {
    const numA = typeof a.sNo === 'number' ? a.sNo : parseInt(String(a.sNo).replace(/\D/g, ''), 10) || 0;
    const numB = typeof b.sNo === 'number' ? b.sNo : parseInt(String(b.sNo).replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) return numA - numB;
    return String(a.orderId).localeCompare(String(b.orderId));
  });

  // Map to Dispatch view for items marked as Shipped or RTD
  const allRows = [...globalRows, ...llcRows];
  const dispatches: DispatchItem[] = allRows
    .filter((row) => row.current_stage === 'Shipped')
    .map((row, idx) => ({
      id: `disp-${row.id}`,
      sNo: idx + 1,
      date: row.order_date || new Date().toISOString().split('T')[0],
      orderNumber: row.order_id,
      shippingType: row.id.includes('llc') ? 'International' : 'Domestic',
      shippingPartner: 'Bluedart Express',
      outgoingTrackingAwb: row.remarks?.match(/AWB:\s*([^\s\]]+)/)?.[1] || 'Awaiting AWB',
      trialPair: 'N',
      region: row.id.includes('llc') ? 'International' : 'Domestic',
      courier: 'Bluedart Express',
      trackingDetails: row.remarks || 'Awaiting AWB',
      trackingFulfilled: 'YES',
      notes: `Product: ${row.product || 'Footwear'}`
    }));

  return { delinquencies, dispatches };
}

// 2. CRM (Admin) Authority: Unrestricted write (New Order Creation to Supabase)
export async function createOrderAdmin(newItem: DelinquencyItem, user: DepartmentUser) {
  const targetTable = newItem.storeTab === 'LLC' ? 'delinquency_llc' : 'delinquency_global';
  
  const payload: Record<string, any> = {
    order_id: newItem.orderId.replace(/^#/, '').trim(),
    customer_name: newItem.customerName,
    product: newItem.product || 'BLKBRD Goodyear Welted',
    order_date: newItem.orderDate || new Date().toISOString().split('T')[0],
    expected_date: newItem.expectedDate || new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    current_stage: newItem.currentStage || 'Cutting',
    delay_reason: newItem.delayReason || 'New Factory Order',
    remarks: newItem.remarks || `Created by ${user.name}`
  };

  if (newItem.sNo && typeof newItem.sNo === 'number') {
    payload.serial_number = newItem.sNo;
  }

  // Clean insert without .select() to prevent proxy 400 errors
  const { error } = await supabase.from(targetTable).insert([payload]);

  if (error) throw new Error(error.message);
  return { success: true };
}

// Bulk Order Creation (Import CSV)
export async function bulkCreateOrdersAdmin(
  items: DelinquencyItem[],
  user: DepartmentUser
): Promise<{ success: boolean; insertedCount: number; errors?: string[] }> {
  if (!items.length) return { success: true, insertedCount: 0 };

  const globalItems = items.filter(i => i.storeTab !== 'LLC');
  const llcItems = items.filter(i => i.storeTab === 'LLC');

  const mapToPayload = (item: DelinquencyItem) => {
    const cleanOrderId = item.orderId.replace(/^#/, '').trim();
    const orderDate = item.orderDate || new Date().toISOString().split('T')[0];
    const expDate =
      item.expectedDate ||
      new Date(new Date(orderDate).getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const customer = item.customerName || item.clientName || resolveCustomerName(cleanOrderId);
    const parsedSNo = typeof item.sNo === 'number' ? item.sNo : parseInt(String(item.sNo || '').replace(/\D/g, ''), 10);

    const payload: any = {
      order_id: cleanOrderId,
      customer_name: customer || 'Valued Client',
      product: item.product || item.shoeStyle || 'BLKBRD Goodyear Welted',
      order_date: orderDate,
      expected_date: expDate,
      current_stage: item.currentStage || 'Preparation',
      delay_reason: item.delayReason || 'Imported via Bulk CSV',
      remarks: item.remarks || `Imported via Bulk CSV by ${user.name}`
    };

    if (parsedSNo && !isNaN(parsedSNo)) {
      payload.serial_number = parsedSNo;
    }

    return payload;
  };

  let insertedCount = 0;
  const errors: string[] = [];

  if (globalItems.length > 0) {
    const payloads = globalItems.map(mapToPayload);
    try {
      const { error } = await (supabase.from('delinquency_global') as any).insert(payloads);
      if (error) {
        errors.push(`Global: ${error.message}`);
      } else {
        insertedCount += globalItems.length;
      }
    } catch (e: any) {
      errors.push(`Global exception: ${e.message}`);
    }
  }

  if (llcItems.length > 0) {
    const payloads = llcItems.map(mapToPayload);
    try {
      const { error } = await (supabase.from('delinquency_llc') as any).insert(payloads);
      if (error) {
        errors.push(`LLC: ${error.message}`);
      } else {
        insertedCount += llcItems.length;
      }
    } catch (e: any) {
      errors.push(`LLC exception: ${e.message}`);
    }
  }

  return { success: errors.length === 0, insertedCount, errors };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(id?: string | null): boolean {
  if (!id) return false;
  return UUID_REGEX.test(id.trim());
}

// Update complete delinquency item
export async function updateDelinquencyOrder(item: DelinquencyItem, user: DepartmentUser = { name: 'CRM3 Staff', role: 'admin' }) {
  const cleanDigits = item.orderId.replace(/\D/g, '');
  const cleanOrderId = item.orderId.replace(/^#/, '').trim();
  const isLlc = item.storeTab === 'LLC' || cleanOrderId.toUpperCase().startsWith('US');
  const targetTable = isLlc ? 'delinquency_llc' : 'delinquency_global';
  const otherTable = isLlc ? 'delinquency_global' : 'delinquency_llc';

  const isRtd = item.currentStage === 'RTD' || item.orderStatus === 'Ready to Ship';
  const isShipped = item.currentStage === 'Shipped' || item.orderStatus === 'Shipped';
  const isHold = (item.currentStage || '').toUpperCase() === 'ON HOLD';

  const orderStatus: 'Ready to Ship' | 'Shipped' | 'Delayed' | 'In Production' =
    isShipped ? 'Shipped' : isRtd ? 'Ready to Ship' : isHold ? 'Delayed' : ((item.orderStatus as any) || 'In Production');

  const actionRequired = isRtd
    ? 'Ready to Dispatch (RTD)'
    : isShipped
    ? 'Dispatched'
    : isHold
    ? 'On Hold: Workshop Review'
    : `Production Workshop (${item.currentStage || 'Preparation'})`;

  const payload: Record<string, any> = {
    customer_name: item.customerName || item.clientName || 'Valued Client',
    product: item.product || item.shoeStyle || 'BLKBRD Goodyear Welted',
    order_date: item.orderDate,
    expected_date: item.expectedDate,
    current_stage: item.currentStage || 'Preparation',
    order_status: orderStatus,
    action_required: actionRequired,
    delay_reason: item.delayReason || '',
    remarks: item.remarks || `Updated by ${user.name}`,
    updated_at: new Date().toISOString()
  };

  const possibleOrderIds = Array.from(new Set([
    item.orderId,
    cleanOrderId,
    cleanDigits,
    `#${cleanDigits}`,
    `#${cleanOrderId}`,
    `BLKBRD${cleanDigits}`,
    `BLKBRD-${cleanDigits}`,
    `BLKBRD ${cleanDigits}`,
    `US${cleanDigits}`,
    `US-${cleanDigits}`,
    `USBLKBRD${cleanDigits}`,
    `USBLKBRD-${cleanDigits}`
  ].filter(Boolean)));

  let updated = false;

  if (item.id && isUuid(item.id)) {
    const { data } = await supabase.from(targetTable).update(payload).eq('id', item.id).select();
    if (data && data.length > 0) updated = true;
  }

  if (!updated) {
    const { data } = await supabase.from(targetTable).update(payload).in('order_id', possibleOrderIds).select();
    if (data && data.length > 0) updated = true;
  }

  if (!updated) {
    const { data } = await supabase.from(otherTable).update(payload).in('order_id', possibleOrderIds).select();
    if (data && data.length > 0) updated = true;
  }

  // If no existing row was updated in Supabase, insert it
  if (!updated) {
    try {
      await supabase.from(targetTable).insert([{
        order_id: cleanOrderId,
        store_account: isLlc ? 'LLC' : 'Global',
        ...payload
      }]);
    } catch (insertErr) {
      console.warn(`Supabase upsert into ${targetTable} note:`, insertErr);
    }
  }

  // Mirror operational status into shopify_orders
  try {
    const shopifyStatus = isRtd ? 'Ready to Ship' : isShipped ? 'Shipped' : 'In Production';
    await supabase.from('shopify_orders').update({
      operational_status: shopifyStatus,
      synced_at: new Date().toISOString()
    }).in('order_number', possibleOrderIds);
  } catch (sErr) {
    // Ignore non-fatal shopify mirror error
  }

  return { success: true };
}

// 3. Production Authority: Updates factory stage and remarks in the respective table
export async function updateProductionStatus(
  orderId: string,
  newStage: string,
  remarkText: string,
  user: DepartmentUser,
  storeTab: 'Global' | 'LLC' = 'Global',
  extraContext?: { customerName?: string; product?: string; delayReason?: string; previousStage?: string }
) {
  // 1. Authoritative Backend Endpoint Call: persists to database and broadcasts SSE realtime to all users
  try {
    const res = await fetch('/api/orders/update-stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        newStage,
        previousStage: extraContext?.previousStage,
        authorName: user.name || 'Production Artisan',
        authorRole: user.role || 'production',
        remarks: remarkText,
        storeTab,
        customerName: extraContext?.customerName,
        product: extraContext?.product,
        delayReason: extraContext?.delayReason
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return { success: true, ...data };
      }
    }
  } catch (apiErr) {
    console.warn('Backend update-stage endpoint warning, attempting direct Supabase write:', apiErr);
  }

  const cleanDigits = orderId.replace(/\D/g, '');
  const cleanOrderId = orderId.replace(/^#/, '').trim();
  const isLlc = storeTab === 'LLC' || cleanOrderId.toUpperCase().startsWith('US');
  const targetTable = isLlc ? 'delinquency_llc' : 'delinquency_global';
  const otherTable = isLlc ? 'delinquency_global' : 'delinquency_llc';

  const isRtd = newStage === 'RTD' || newStage === 'Ready to Ship';
  const isShipped = newStage === 'Shipped';
  const isHold = newStage.toUpperCase() === 'ON HOLD';

  const orderStatus: 'Ready to Ship' | 'Shipped' | 'Delayed' | 'In Production' =
    isShipped ? 'Shipped' : isRtd ? 'Ready to Ship' : isHold ? 'Delayed' : 'In Production';

  const actionRequired = isRtd
    ? 'Ready to Dispatch (RTD)'
    : isShipped
    ? 'Dispatched'
    : isHold
    ? 'On Hold: Workshop Review'
    : `Production Workshop (${newStage})`;

  const payload: Record<string, any> = {
    current_stage: newStage,
    order_status: orderStatus,
    action_required: actionRequired,
    remarks: remarkText || `Status updated to ${newStage} by ${user.name}`,
    updated_at: new Date().toISOString()
  };

  const possibleOrderIds = Array.from(new Set([
    orderId,
    cleanOrderId,
    cleanDigits,
    `#${cleanDigits}`,
    `#${cleanOrderId}`,
    `BLKBRD${cleanDigits}`,
    `BLKBRD-${cleanDigits}`,
    `BLKBRD ${cleanDigits}`,
    `US${cleanDigits}`,
    `US-${cleanDigits}`,
    `USBLKBRD${cleanDigits}`,
    `USBLKBRD-${cleanDigits}`
  ].filter(Boolean)));

  let updated = false;

  // 1. Try target table
  const { data: mainData, error: mainErr } = await supabase
    .from(targetTable)
    .update(payload)
    .in('order_id', possibleOrderIds)
    .select();

  if (!mainErr && mainData && mainData.length > 0) {
    updated = true;
  }

  // 2. Try other table if not found
  if (!updated) {
    const { data: otherData, error: otherErr } = await supabase
      .from(otherTable)
      .update(payload)
      .in('order_id', possibleOrderIds)
      .select();

    if (!otherErr && otherData && otherData.length > 0) {
      updated = true;
    }
  }

  // 3. If row didn't exist in either table, insert it
  if (!updated) {
    const formattedId = isLlc ? `US${cleanDigits}` : `BLKBRD${cleanDigits || cleanOrderId}`;
    const todayStr = new Date().toISOString().split('T')[0];
    const expectedDateStr = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    try {
      await supabase.from(targetTable).insert([{
        order_id: formattedId,
        customer_name: 'Valued Customer',
        client_name: 'Valued Customer',
        product: 'BLKBRD Goodyear Welted',
        order_date: todayStr,
        expected_date: expectedDateStr,
        store_account: isLlc ? 'LLC' : 'Global',
        ...payload
      }]);
    } catch (insertErr) {
      console.warn(`Supabase upsert into ${targetTable} note:`, insertErr);
    }
  }

  // 4. Mirror operational status into shopify_orders
  try {
    const shopifyOperationalStatus = isRtd ? 'Ready to Ship' : isShipped ? 'Shipped' : 'In Production';
    const shopifyPayload: Record<string, any> = {
      operational_status: shopifyOperationalStatus,
      synced_at: new Date().toISOString()
    };
    if (isShipped) {
      shopifyPayload.fulfillment_status = 'fulfilled';
    }
    await supabase
      .from('shopify_orders')
      .update(shopifyPayload)
      .in('order_number', possibleOrderIds);
  } catch (shopErr) {
    console.warn('Mirror shopify_orders update notice:', shopErr);
  }

  return { success: true };
}

// 4. Logistics Authority: Assigns shipment status
export async function updateLogisticsShipment(
  orderId: string,
  courier: string,
  trackingNumber: string,
  user: DepartmentUser,
  storeTab: 'Global' | 'LLC' = 'Global'
) {
  const targetTable = storeTab === 'LLC' ? 'delinquency_llc' : 'delinquency_global';

  const { error } = await supabase
    .from(targetTable)
    .update({
      current_stage: 'Shipped',
      remarks: `Shipped via ${courier} [AWB: ${trackingNumber}] by ${user.name}`
    })
    .eq('order_id', orderId);

  if (error) throw new Error(error.message);
  return { success: true };
}