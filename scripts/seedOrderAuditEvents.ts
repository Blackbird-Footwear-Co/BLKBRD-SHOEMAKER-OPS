import { createClient } from '@supabase/supabase-js';

const rawUrl = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_URL = (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) ? rawUrl : 'https://sdkqxjqemomwgveydbfv.supabase.co';
const rawKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = rawKey.length >= 10 ? rawKey : 'sb_secret_3f9IS3tT_0WqMXfsoaRHXA_oi9vzWYu';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const STAGES = ['CUTTING', 'CLOSING', 'PREPARATION', 'UPPER', 'BOTTOM', 'FINISH', 'QC', 'RTD', 'SHIPPED'];

async function run() {
  console.log('Fetching existing orders to populate order_audit_events in Supabase...');
  const [dRes, sRes, dispRes] = await Promise.all([
    supabase.from('delinquency_global').select('*').limit(2000),
    supabase.from('shopify_orders').select('*').limit(2000),
    supabase.from('daily_dispatches').select('*').limit(1000)
  ]);

  const delinquencies = dRes.data || [];
  const shopifyOrders = sRes.data || [];
  const dispatches = dispRes.data || [];

  const auditEvents: any[] = [];
  const seenIds = new Set<string>();

  // Process delinquency orders
  for (const item of delinquencies) {
    const cleanNum = (item.order_id || '').replace(/^#|^BLKBRD|^USBLKBRD/i, '').trim();
    if (!cleanNum) continue;

    const orderDate = item.order_date || '2026-08-15';
    const createdAt = `${orderDate}T09:00:00.000Z`;

    // 1. Initial Order Placement Event
    const createEventId = `aud-init-${cleanNum}`;
    if (!seenIds.has(createEventId)) {
      seenIds.add(createEventId);
      auditEvents.push({
        id: createEventId,
        order_id: cleanNum,
        event_type: 'order_created',
        title: 'Order Placed & Scheduled',
        stage: 'CUTTING',
        previous_stage: null,
        status: 'In Production',
        author_name: 'Shopify System',
        author_role: 'system',
        delay_reason: null,
        expected_date: item.expected_date || null,
        remarks_text: `Customer ${item.customer_name || 'Client'} placed order for ${item.product || 'Goodyear Welted Footwear'}.`,
        metadata: {
          product: item.product,
          customer: item.customer_name,
          order_date: orderDate
        },
        created_at: createdAt
      });
    }

    // 2. Stage Progress Event
    const currentStage = (item.current_stage || 'PREPARATION').toUpperCase();
    const stageIndex = STAGES.indexOf(currentStage);

    if (stageIndex >= 0) {
      for (let i = 0; i <= stageIndex; i++) {
        const st = STAGES[i];
        const stageEventId = `aud-stage-${cleanNum}-${st.toLowerCase()}`;
        if (!seenIds.has(stageEventId)) {
          seenIds.add(stageEventId);

          const stageTime = new Date(new Date(createdAt).getTime() + i * 2 * 24 * 60 * 60 * 1000).toISOString();
          auditEvents.push({
            id: stageEventId,
            order_id: cleanNum,
            event_type: 'stage_change',
            title: `Stage Progressed: ${st}`,
            stage: st,
            previous_stage: i > 0 ? STAGES[i - 1] : null,
            status: (st === 'RTD' || st === 'SHIPPED') ? (st === 'RTD' ? 'Ready to Ship' : 'Shipped') : 'In Production',
            author_name: 'Master Artisan',
            author_role: 'production',
            delay_reason: item.delay_reason || null,
            expected_date: item.expected_date || null,
            remarks_text: i === stageIndex && item.remarks ? item.remarks : `Order progressed to workshop stage: ${st}`,
            metadata: {
              stage: st,
              sequence: i + 1
            },
            created_at: stageTime
          });
        }
      }
    }

    // 3. Delay Event if applicable
    if (item.delay_reason || (item.days_delayed && item.days_delayed > 0)) {
      const delayEventId = `aud-delay-${cleanNum}`;
      if (!seenIds.has(delayEventId)) {
        seenIds.add(delayEventId);
        auditEvents.push({
          id: delayEventId,
          order_id: cleanNum,
          event_type: 'delay_flagged',
          title: `Production Delay: ${item.delay_reason || 'Workshop Backlog'}`,
          stage: currentStage,
          previous_stage: null,
          status: 'Delayed',
          author_name: 'Production Workshop Lead',
          author_role: 'production',
          delay_reason: item.delay_reason || 'Workshop Delay',
          expected_date: item.expected_date || null,
          remarks_text: item.remarks || `Order delayed due to ${item.delay_reason || 'Production schedule'}`,
          metadata: {
            delay_reason: item.delay_reason,
            days_delayed: item.days_delayed
          },
          created_at: new Date().toISOString()
        });
      }
    }
  }

  // 4. Dispatch Events from daily_dispatches
  for (const disp of dispatches) {
    const cleanNum = (disp.order_id || '').replace(/^#|^BLKBRD|^USBLKBRD/i, '').trim();
    if (!cleanNum) continue;

    const dispEventId = `aud-disp-${cleanNum}`;
    if (!seenIds.has(dispEventId)) {
      seenIds.add(dispEventId);
      auditEvents.push({
        id: dispEventId,
        order_id: cleanNum,
        event_type: 'dispatch',
        title: `Dispatched via ${disp.shipping_partner || 'Bluedart Express'}`,
        stage: 'SHIPPED',
        previous_stage: 'RTD',
        status: 'Shipped',
        author_name: 'Logistics Desk',
        author_role: 'logistics',
        delay_reason: null,
        expected_date: null,
        remarks_text: `Dispatched with Tracking AWB: ${disp.outgoing_tracking_awb || 'Standard Outgoing'}`,
        metadata: {
          courier: disp.shipping_partner,
          tracking_awb: disp.outgoing_tracking_awb,
          dispatch_date: disp.dispatch_date
        },
        created_at: disp.dispatch_date ? `${disp.dispatch_date}T16:00:00.000Z` : new Date().toISOString()
      });
    }
  }

  console.log(`Generated ${auditEvents.length} audit events. Inserting into order_audit_events in batches of 100...`);

  let insertedCount = 0;
  for (let i = 0; i < auditEvents.length; i += 100) {
    const chunk = auditEvents.slice(i, i + 100);
    const { error } = await supabase.from('order_audit_events').upsert(chunk, { onConflict: 'id' });
    if (error) {
      console.error('Batch insert error at chunk', i, error.message);
    } else {
      insertedCount += chunk.length;
    }
  }

  console.log(`Successfully synced ${insertedCount} audit events into Supabase order_audit_events table!`);

  const { count } = await supabase.from('order_audit_events').select('*', { count: 'exact', head: true });
  console.log(`Current total rows in order_audit_events: ${count}`);
}

run().catch(console.error);
