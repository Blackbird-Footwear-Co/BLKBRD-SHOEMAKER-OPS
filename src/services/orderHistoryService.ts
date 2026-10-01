import {
  OrderAuditEvent,
  OrderRemarkHistoryItem,
  OrderSummaryData,
  DelinquencyItem,
  DispatchItem,
  ReturnItem,
  TrialPairItem,
  ShopifyOrder,
  ProductionRemark,
  UserRole
} from '../types';
import { resolveCustomerName } from '../utils/customerResolver';
import { normalizeOrderId, formatBlkbrdOrderId, orderIdsMatch } from '../utils/csvParser';
import { calculateExpectedDate, calculateDelayDays } from '../utils/delinquencyUtils';
import { getStoredTableConfig } from './schemaConfigService';

const AUDIT_STORAGE_KEY = 'blkbrd_order_audit_events_v1';
const REMARKS_STORAGE_KEY = 'blkbrd_order_remarks_history_v1';

async function syncAuditEventToSupabase(event: OrderAuditEvent): Promise<void> {
  try {
    const config = getStoredTableConfig('order_audit_events');
    if (!config || !config.syncToSupabase) return;

    const payload: Record<string, any> = {
      id: event.id,
      order_id: event.orderId,
      event_type: event.type,
      title: event.title,
      author_name: event.authorName || 'Artisan',
      author_role: event.authorRole || 'workshop',
      remarks_text: event.remarkText || event.description || '',
      created_at: new Date().toISOString()
    };

    if (event.metadata?.stage) payload.stage = event.metadata.stage;
    if (event.previousValue) payload.previous_stage = event.previousValue;
    if (event.metadata?.status) payload.status = event.metadata.status;
    if (event.metadata?.delayReason) payload.delay_reason = event.metadata.delayReason;
    if (event.metadata?.expectedDate) payload.expected_date = event.metadata.expectedDate;
    payload.metadata = {
      ...(event.description ? { description: event.description } : {}),
      ...(event.metadata || {})
    };

    await fetch('/api/supabase/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: config.tableName || 'order_audit_events',
        rows: [payload]
      })
    });
  } catch {
    // Non-blocking local fallback
  }
}

async function syncRemarkToSupabase(remark: OrderRemarkHistoryItem, orderId: string): Promise<void> {
  try {
    const config = getStoredTableConfig('production_remarks');
    if (!config || !config.syncToSupabase) return;

    const payload: Record<string, any> = {
      id: remark.id,
      order_id: orderId,
      remark: remark.remark,
      author: remark.author,
      role: remark.role || 'workshop',
      stage_transition: remark.stageTransition || '',
      created_at: new Date().toISOString()
    };

    await fetch('/api/supabase/insert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: config.tableName || 'production_remarks',
        rows: [payload]
      })
    });
  } catch {
    // Non-blocking local fallback
  }
}

export function formatAuditTimestamp(dateInput?: string | Date): string {
  if (!dateInput) {
    const now = new Date();
    return now.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    return String(dateInput);
  }

  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(`Failed reading ${key} from storage:`, e);
  }
  return fallback;
}

function writeStorage<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('blkbrd_order_history_updated', { detail: { key, data } }));
  } catch (e) {
    console.warn(`Failed writing ${key} to storage:`, e);
  }
}

/**
 * Get all stored audit events across all orders
 */
export function getAllAuditEvents(): OrderAuditEvent[] {
  return readStorage<OrderAuditEvent[]>(AUDIT_STORAGE_KEY, []);
}

/**
 * Get all stored remarks history items
 */
export function getAllRemarksHistory(): OrderRemarkHistoryItem[] {
  return readStorage<OrderRemarkHistoryItem[]>(REMARKS_STORAGE_KEY, []);
}

/**
 * Record a new audit event for an order
 */
export function recordAuditEvent(
  event: Omit<OrderAuditEvent, 'id' | 'timestamp'> & { timestamp?: string }
): OrderAuditEvent {
  const current = getAllAuditEvents();
  const newEvent: OrderAuditEvent = {
    ...event,
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: event.timestamp || formatAuditTimestamp()
  };

  const updated = [newEvent, ...current];
  writeStorage(AUDIT_STORAGE_KEY, updated);
  syncAuditEventToSupabase(newEvent);
  return newEvent;
}

/**
 * Add a new remark to an order's history and simultaneously log an audit event
 */
export function addOrderRemark(
  orderId: string,
  remarkText: string,
  author: { name: string; role?: UserRole | string } | string,
  stageTransition?: string,
  imageUrl?: string
): OrderRemarkHistoryItem {
  const cleanId = orderId.replace(/^#/, '').trim();
  const currentRemarks = getAllRemarksHistory();
  const timestamp = formatAuditTimestamp();
  const authorName = typeof author === 'string' ? author : (author?.name || 'Staff Member');
  const authorRole = typeof author === 'string' ? 'admin' : (author?.role || 'admin');

  const newRemark: OrderRemarkHistoryItem = {
    id: `rem-hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    orderId: cleanId,
    author: authorName,
    role: authorRole,
    timestamp,
    remark: remarkText.trim(),
    stageTransition,
    imageUrl
  };

  const updatedRemarks = [newRemark, ...currentRemarks];
  writeStorage(REMARKS_STORAGE_KEY, updatedRemarks);
  syncRemarkToSupabase(newRemark, cleanId);

  // Also create a matching audit timeline event
  recordAuditEvent({
    orderId: cleanId,
    type: 'remark',
    title: imageUrl ? `Workshop Photo & Remark [${stageTransition || 'Update'}]` : `Remark logged by ${newRemark.author}`,
    description: remarkText.trim(),
    authorName: newRemark.author,
    authorRole: newRemark.role || 'admin',
    timestamp,
    remarkText: remarkText.trim(),
    imageUrl,
    metadata: { stageTransition, photo_url: imageUrl }
  });

  return newRemark;
}

/**
 * Upload real product photo from workshop camera / file picker and stamp to Supabase & history
 */
export async function uploadWorkshopImage(params: {
  orderId: string;
  stage: string;
  remark?: string;
  imageBase64: string;
  fileName?: string;
  authorName: string;
  authorRole: string;
  storeTab?: 'Global' | 'LLC';
}): Promise<{ success: boolean; imageUrl?: string; remark?: string; error?: string }> {
  try {
    const res = await fetch('/api/supabase/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (data.remark && data.imageUrl) {
        const cleanId = params.orderId.replace(/^#/, '').trim();
        const newRemark: OrderRemarkHistoryItem = {
          id: `rem-img-${Date.now()}`,
          orderId: cleanId,
          author: params.authorName,
          role: params.authorRole,
          timestamp: formatAuditTimestamp(),
          remark: data.remark,
          stageTransition: params.stage,
          imageUrl: data.imageUrl
        };
        const allRemarks = getAllRemarksHistory();
        writeStorage(REMARKS_STORAGE_KEY, [newRemark, ...allRemarks]);

        recordAuditEvent({
          orderId: cleanId,
          type: 'remark',
          title: `Workshop Photo [${params.stage}] by ${params.authorName}`,
          description: data.remark,
          authorName: params.authorName,
          authorRole: params.authorRole,
          timestamp: formatAuditTimestamp(),
          remarkText: data.remark,
          imageUrl: data.imageUrl,
          metadata: { stage: params.stage, photo_url: data.imageUrl }
        });
      }
      return data;
    }
    return { success: false, error: data.error || 'Upload failed' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error uploading image' };
  }
}

/**
 * Record an order update event (e.g. stage change, delay reason, or expected date modification)
 */
export function recordOrderUpdateEvent(
  orderId: string,
  user: { name: string; role?: UserRole | string },
  changes: {
    stageChange?: { from: string; to: string };
    statusChange?: { from: string; to: string };
    delayReasonChange?: { from: string; to: string };
    expectedDateChange?: { from: string; to: string };
    customTitle?: string;
    customDescription?: string;
    remark?: string;
  }
) {
  const cleanId = orderId.replace(/^#/, '').trim();
  const timestamp = formatAuditTimestamp();

  if (changes.stageChange && changes.stageChange.from !== changes.stageChange.to) {
    recordAuditEvent({
      orderId: cleanId,
      type: 'stage_change',
      title: `Crafting Stage updated to "${changes.stageChange.to}"`,
      description: `Workshop lead moved order from ${changes.stageChange.from} to ${changes.stageChange.to}`,
      authorName: user.name,
      authorRole: user.role || 'production',
      timestamp,
      previousValue: changes.stageChange.from,
      newValue: changes.stageChange.to,
      remarkText: changes.remark
    });
  }

  if (changes.statusChange && changes.statusChange.from !== changes.statusChange.to) {
    recordAuditEvent({
      orderId: cleanId,
      type: 'status_change',
      title: `Order Status changed to "${changes.statusChange.to}"`,
      description: `Status updated from ${changes.statusChange.from} to ${changes.statusChange.to}`,
      authorName: user.name,
      authorRole: user.role || 'admin',
      timestamp,
      previousValue: changes.statusChange.from,
      newValue: changes.statusChange.to
    });
  }

  if (changes.delayReasonChange && changes.delayReasonChange.from !== changes.delayReasonChange.to) {
    recordAuditEvent({
      orderId: cleanId,
      type: 'delay_reason',
      title: `Delay Reason updated: "${changes.delayReasonChange.to}"`,
      description: `Reason revised from "${changes.delayReasonChange.from || 'None'}"`,
      authorName: user.name,
      authorRole: user.role || 'admin',
      timestamp,
      previousValue: changes.delayReasonChange.from,
      newValue: changes.delayReasonChange.to
    });
  }

  if (changes.expectedDateChange && changes.expectedDateChange.from !== changes.expectedDateChange.to) {
    recordAuditEvent({
      orderId: cleanId,
      type: 'rescheduled',
      title: `Target Delivery Date rescheduled to ${changes.expectedDateChange.to}`,
      description: `Revised from original target ${changes.expectedDateChange.from}`,
      authorName: user.name,
      authorRole: user.role || 'admin',
      timestamp,
      previousValue: changes.expectedDateChange.from,
      newValue: changes.expectedDateChange.to
    });
  }

  if (changes.remark && changes.remark.trim()) {
    addOrderRemark(cleanId, changes.remark, user);
  } else if (!changes.stageChange && !changes.statusChange && !changes.delayReasonChange && !changes.expectedDateChange) {
    // General update
    recordAuditEvent({
      orderId: cleanId,
      type: 'general_update',
      title: changes.customTitle || `Order details updated by ${user.name}`,
      description: changes.customDescription || 'Delinquency record fields updated and synchronized.',
      authorName: user.name,
      authorRole: user.role || 'admin',
      timestamp
    });
  }
}

/**
 * Record a dispatch event for an order
 */
export function recordDispatchAuditEvent(
  orderId: string,
  user: { name: string; role?: UserRole | string },
  dispatchInfo: {
    courier: string;
    awb: string;
    dispatchDate: string;
    shippingType?: string;
  }
) {
  const cleanId = orderId.replace(/^#/, '').trim();
  const timestamp = formatAuditTimestamp();

  recordAuditEvent({
    orderId: cleanId,
    type: 'dispatch',
    title: `Order Dispatched via ${dispatchInfo.courier}`,
    description: `Outgoing Tracking AWB: ${dispatchInfo.awb} (${dispatchInfo.shippingType || 'Standard'} Shipment)`,
    authorName: user.name,
    authorRole: user.role || 'logistics',
    timestamp,
    metadata: {
      courier: dispatchInfo.courier,
      awb: dispatchInfo.awb,
      dispatchDate: dispatchInfo.dispatchDate
    }
  });

  addOrderRemark(
    cleanId,
    `Dispatched via ${dispatchInfo.courier} [AWB: ${dispatchInfo.awb}] on ${dispatchInfo.dispatchDate}`,
    user,
    'RTD → Shipped'
  );
}

/**
 * Context for compiling a 360 Order Summary
 */
export interface OrderSummaryContext {
  delinquencies: DelinquencyItem[];
  dispatches?: DispatchItem[];
  returns?: ReturnItem[];
  trialPairs?: TrialPairItem[];
  shopifyOrders?: ShopifyOrder[];
  productionRemarks?: ProductionRemark[];
}

/**
 * Compile a comprehensive Shopify-grade Order Summary with full timeline,
 * updates count, and remarks history.
 */
export function buildOrderSummary(
  targetOrderId: string,
  context: OrderSummaryContext
): OrderSummaryData {
  const normTarget = normalizeOrderId(targetOrderId);
  const cleanOrderId = targetOrderId.replace(/^#/, '').trim();

  // 1. Find matching records across databases using centralized matching
  const delinquency = context.delinquencies.find(
    d => orderIdsMatch(d.orderId, targetOrderId)
  );

  const dispatch = context.dispatches?.find(
    dp => orderIdsMatch(dp.orderNumber, targetOrderId)
  );

  const returnItem = context.returns?.find(
    r => orderIdsMatch(r.oldOrderId, targetOrderId) || (r.newOrderId && orderIdsMatch(r.newOrderId, targetOrderId))
  );

  const trialItem = context.trialPairs?.find(
    t => orderIdsMatch(t.orderId, targetOrderId)
  );

  const shopify = context.shopifyOrders?.find(
    s => orderIdsMatch(s.orderNumber, targetOrderId) || orderIdsMatch(s.id, targetOrderId)
  );

  // 2. Resolve primary order fields
  const isLlc =
    delinquency?.storeTab === 'LLC' ||
    cleanOrderId.toUpperCase().startsWith('US') ||
    shopify?.storeAccount === 'LLC' ||
    shopify?.currency === 'USD' ||
    returnItem?.storeTab === 'LLC';

  const storeTab: 'Global' | 'LLC' = isLlc ? 'LLC' : 'Global';
  const formattedOrderId = formatBlkbrdOrderId(cleanOrderId, storeTab);

  const customerName = resolveCustomerName(
    formattedOrderId,
    delinquency?.customerName ||
      delinquency?.clientName ||
      shopify?.customerName ||
      returnItem?.clientName ||
      (dispatch as any)?.customerName,
    {
      delinquencies: context.delinquencies,
      shopifyOrders: context.shopifyOrders || [],
      returns: context.returns || [],
      trialPairs: context.trialPairs || []
    }
  );

  const product =
    delinquency?.product ||
    delinquency?.shoeStyle ||
    shopify?.lineItems ||
    dispatch?.notes?.replace(/^Product:\s*/i, '') ||
    returnItem?.notes ||
    'BLKBRD Goodyear Welted Footwear';

  const orderDate =
    delinquency?.orderDate ||
    shopify?.createdAt?.split('T')[0] ||
    dispatch?.date ||
    '2026-03-01';

  const expectedDate =
    delinquency?.expectedDate ||
    calculateExpectedDate(orderDate);

  const currentStage =
    delinquency?.currentStage ||
    (dispatch ? 'Shipped' : 'Cutting');

  const orderStatus =
    delinquency?.orderStatus ||
    (currentStage === 'Shipped' || dispatch ? 'Shipped' : currentStage === 'RTD' ? 'Ready to Ship' : 'Delayed');

  const delayReason =
    delinquency?.delayReason ||
    (currentStage === 'Shipped' ? 'Delivered / Completed' : 'Production Backlog & Material Sourcing');

  const daysDelayed =
    delinquency?.daysDelayed !== undefined
      ? delinquency.daysDelayed
      : calculateDelayDays(orderDate, expectedDate);

  // 3. Collect stored audit events for this order
  const storedAudits = getAllAuditEvents().filter(
    a => orderIdsMatch(a.orderId, targetOrderId)
  );

  // 4. Collect stored remarks for this order
  const storedRemarks = getAllRemarksHistory().filter(
    r => orderIdsMatch(r.orderId, targetOrderId)
  );

  // 5. Also collect remarks from productionRemarks prop
  const prodRemarks = (context.productionRemarks || []).filter(
    pr => orderIdsMatch(pr.orderId, targetOrderId)
  );

  // Combine remarks into unified history
  const combinedRemarks: OrderRemarkHistoryItem[] = [...storedRemarks];

  for (const pr of prodRemarks) {
    const exists = combinedRemarks.some(
      cr => cr.remark.toLowerCase() === pr.remark.toLowerCase() && cr.timestamp === pr.timestamp
    );
    if (!exists) {
      combinedRemarks.push({
        id: `pr-${pr.id}`,
        orderId: cleanOrderId,
        author: pr.author || 'Production Workshop Lead',
        role: 'production',
        timestamp: formatAuditTimestamp(pr.timestamp),
        remark: pr.remark,
        stageTransition: `${pr.previousStatus} → ${pr.newStatus}`
      });
    }
  }

  // If Delinquency row itself has a remark not in the list, add it
  if (delinquency?.remarks && delinquency.remarks.trim()) {
    const remText = delinquency.remarks.trim();
    const alreadyIncluded = combinedRemarks.some(cr => cr.remark.includes(remText));
    if (!alreadyIncluded) {
      // Determine author from text if available (e.g. "by Agent Vikram" or "by CRM3")
      const authorMatch = remText.match(/by\s+([A-Za-z0-9\s.]+?)(?:$|\[|\()/i);
      const inferredAuthor = authorMatch ? authorMatch[1].trim() : 'Production Team';

      combinedRemarks.unshift({
        id: `delinq-rem-${delinquency.id}`,
        orderId: cleanOrderId,
        author: inferredAuthor,
        role: 'admin',
        timestamp: formatAuditTimestamp(orderDate),
        remark: remText
      });
    }
  }

  // 6. Synthesize baseline chronological timeline events if history is small
  const timelineEvents: OrderAuditEvent[] = [...storedAudits];

  // Check if Order Created event is present
  const hasCreated = timelineEvents.some(e => e.type === 'created');
  if (!hasCreated) {
    timelineEvents.push({
      id: `synth-created-${cleanOrderId}`,
      orderId: cleanOrderId,
      type: 'created',
      title: `Order #${cleanOrderId} Placed & Recorded`,
      description: `Registered in BLKBRD ${storeTab} system for ${customerName}. Style: ${product}.`,
      authorName: shopify ? 'Shopify Webstore' : 'CRM3 Desk',
      authorRole: 'admin',
      timestamp: formatAuditTimestamp(orderDate),
      metadata: {
        channel: storeTab === 'LLC' ? 'Shopify US / US LLC' : 'Shopify Global / International',
        expectedDate
      }
    });
  }

  // If order reached subsequent crafting stages, add synthetic stage history
  const STAGE_ORDER = ['CUTTING', 'CLOSING', 'PREPARATION', 'UPPER', 'BOTTOM', 'FINISH', 'QC', 'RTD', 'SHIPPED', 'ON HOLD'];
  const currentStageIndex = STAGE_ORDER.indexOf((currentStage || '').toUpperCase());

  if (currentStageIndex > 0) {
    const hasStageEvents = timelineEvents.some(e => e.type === 'stage_change');
    if (!hasStageEvents) {
      // Add milestone for intermediate stages
      if (currentStageIndex >= 1) {
        timelineEvents.push({
          id: `synth-stage-cutting-${cleanOrderId}`,
          orderId: cleanOrderId,
          type: 'stage_change',
          title: 'Crafting Initiated: Leather Cutting & Clicking',
          description: 'Master clicker hand-cut upper components according to sizing spec.',
          authorName: 'Production Workshop Lead',
          authorRole: 'production',
          timestamp: formatAuditTimestamp(new Date(new Date(orderDate).getTime() + 2 * 24 * 60 * 60 * 1000)),
          previousValue: 'Queued',
          newValue: 'Cutting'
        });
      }

      if (currentStageIndex >= 3) {
        timelineEvents.push({
          id: `synth-stage-bottom-${cleanOrderId}`,
          orderId: cleanOrderId,
          type: 'stage_change',
          title: 'Welt Stitching & Bottom Assembly',
          description: 'Goodyear welt attached, cork filler applied, and sole bonded.',
          authorName: 'Bottom Workshop Foreman',
          authorRole: 'production',
          timestamp: formatAuditTimestamp(new Date(new Date(orderDate).getTime() + 10 * 24 * 60 * 60 * 1000)),
          previousValue: 'Closing',
          newValue: 'Bottom'
        });
      }

      // Current stage milestone
      timelineEvents.push({
        id: `synth-stage-current-${cleanOrderId}`,
        orderId: cleanOrderId,
        type: 'stage_change',
        title: `Advanced to "${currentStage}" Stage`,
        description: `Current factory milestone under supervision.`,
        authorName: 'Workshop Lead',
        authorRole: 'production',
        timestamp: formatAuditTimestamp(new Date(new Date(orderDate).getTime() + 18 * 24 * 60 * 60 * 1000)),
        newValue: currentStage
      });
    }
  }

  // Add delay event if applicable
  if (daysDelayed > 0 && !timelineEvents.some(e => e.type === 'delay_reason')) {
    timelineEvents.push({
      id: `synth-delay-${cleanOrderId}`,
      orderId: cleanOrderId,
      type: 'delay_reason',
      title: `Delinquency Noted: ${daysDelayed} Days Delay`,
      description: `Reason on record: ${delayReason}`,
      authorName: 'Production Lead',
      authorRole: 'production',
      timestamp: formatAuditTimestamp(expectedDate),
      newValue: delayReason
    });
  }

  // Add Dispatch milestone if dispatched
  if (dispatch || currentStage === 'Shipped') {
    const hasDispatch = timelineEvents.some(e => e.type === 'dispatch');
    if (!hasDispatch) {
      const courier = dispatch?.shippingPartner || dispatch?.courier || 'Bluedart Express';
      const awb = dispatch?.outgoingTrackingAwb || dispatch?.trackingDetails || 'AWB-ASSIGNED';
      timelineEvents.push({
        id: `synth-disp-${cleanOrderId}`,
        orderId: cleanOrderId,
        type: 'dispatch',
        title: `Shipped via ${courier}`,
        description: `Outgoing Tracking AWB: ${awb}`,
        authorName: 'Logistics Manager',
        authorRole: 'logistics',
        timestamp: formatAuditTimestamp(dispatch?.date || expectedDate),
        metadata: { courier, awb }
      });
    }
  }

  // Add Return milestone if return is recorded
  if (returnItem && !timelineEvents.some(e => e.type === 'return_logged')) {
    timelineEvents.push({
      id: `synth-ret-${returnItem.id}`,
      orderId: cleanOrderId,
      type: 'return_logged',
      title: `Return / Exchange Initiated (${returnItem.type})`,
      description: `Reason: ${returnItem.reason}. Incoming Courier: ${returnItem.incomingCourier || 'Courier'} [${returnItem.incomingTrackingNo || 'No AWB'}]. Logged by: ${returnItem.createdBy || 'Logistics Agent'}.`,
      authorName: returnItem.createdBy || 'Logistics Desk',
      authorRole: 'logistics',
      timestamp: formatAuditTimestamp(returnItem.initiatedDate || orderDate)
    });
  }

  // Add all combined remarks as timeline events if not already present
  for (const rem of combinedRemarks) {
    const exists = timelineEvents.some(
      te => te.remarkText === rem.remark || (te.type === 'remark' && te.description === rem.remark)
    );
    if (!exists) {
      timelineEvents.push({
        id: `timeline-rem-${rem.id}`,
        orderId: cleanOrderId,
        type: 'remark',
        title: `Remark by ${rem.author}`,
        description: rem.remark,
        authorName: rem.author,
        authorRole: rem.role || 'admin',
        timestamp: rem.timestamp,
        remarkText: rem.remark,
        metadata: { stageTransition: rem.stageTransition }
      });
    }
  }

  // 7. Sort timeline events newest first for presentation
  timelineEvents.sort((a, b) => {
    const dateA = new Date(a.timestamp).getTime();
    const dateB = new Date(b.timestamp).getTime();
    if (isNaN(dateA) || isNaN(dateB)) return 0;
    return dateB - dateA;
  });

  // Sort remarks newest first
  combinedRemarks.sort((a, b) => {
    const dateA = new Date(a.timestamp).getTime();
    const dateB = new Date(b.timestamp).getTime();
    if (isNaN(dateA) || isNaN(dateB)) return 0;
    return dateB - dateA;
  });

  // 8. Calculate total updates count (Shopify-style: initial created + every stage/status update, remark, and edit)
  // An order created has 1 event. Every subsequent event represents an update.
  const updateCount = Math.max(1, timelineEvents.length - 1 + combinedRemarks.length);

  const firstRecordedAt = timelineEvents[timelineEvents.length - 1]?.timestamp || formatAuditTimestamp(orderDate);
  const lastUpdatedAt = timelineEvents[0]?.timestamp || formatAuditTimestamp();

  return {
    orderId: formattedOrderId,
    cleanOrderId: formattedOrderId,
    customerName,
    product,
    storeTab,
    orderDate,
    expectedDate,
    daysDelayed,
    currentStage,
    orderStatus,
    delayReason,
    latestRemarks: combinedRemarks[0]?.remark || delinquency?.remarks,
    updateCount,
    firstRecordedAt,
    lastUpdatedAt,
    timeline: timelineEvents,
    remarksHistory: combinedRemarks,
    delinquencyDetails: delinquency,
    dispatchDetails: dispatch,
    returnDetails: returnItem,
    trialDetails: trialItem,
    shopifyDetails: shopify
  };
}
