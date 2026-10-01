import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const rawUrl = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_URL = (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) ? rawUrl : 'https://sdkqxjqemomwgveydbfv.supabase.co';
const rawKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = rawKey.length >= 10 ? rawKey : 'sb_secret_3f9IS3tT_0WqMXfsoaRHXA_oi9vzWYu';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('Fetching delinquency_global and shopify_orders...');
  const [dRes, sRes] = await Promise.all([
    supabase.from('delinquency_global').select('*').limit(3000),
    supabase.from('shopify_orders').select('*').limit(1000)
  ]);

  const dData = dRes.data || [];
  const sOrders = sRes.data || [];

  const map: Record<string, any[]> = {};
  dData.forEach(r => {
    const cleanNum = r.order_id.replace(/^#|^BLKBRD|^USBLKBRD/i, '').trim();
    if (!map[cleanNum]) map[cleanNum] = [];
    map[cleanNum].push(r);
  });

  const masterDates: Record<string, string> = {};
  const sortedNums = Object.keys(map).map(n => parseInt(n, 10)).filter(n => !isNaN(n)).sort((a,b) => a - b);

  sortedNums.forEach(num => {
    const k = String(num);
    const rows = map[k];
    const nonLate = rows.filter(r => r.order_date && r.order_date < '2026-09-26');
    if (nonLate.length > 0) {
      nonLate.sort((a, b) => a.order_date.localeCompare(b.order_date));
      masterDates[k] = nonLate[0].order_date;
    } else {
      const withDate = rows.filter(r => r.order_date);
      if (withDate.length > 0) {
        masterDates[k] = withDate[0].order_date;
      } else {
        masterDates[k] = '2026-09-26';
      }
    }
  });

  // Ensure 9816 to 10311 are filled
  for (let i = 9816; i <= 10311; i++) {
    const k = String(i);
    if (!masterDates[k]) {
      let prev = '2026-07-28';
      for (let p = i - 1; p >= 9816; p--) {
        if (masterDates[String(p)]) { prev = masterDates[String(p)]; break; }
      }
      masterDates[k] = prev;
    }
  }

  // Save JSON map
  fs.writeFileSync('./src/data/shopifyOrderDateMap.json', JSON.stringify(masterDates, null, 2));
  console.log('Saved src/data/shopifyOrderDateMap.json with', Object.keys(masterDates).length, 'orders');

  // Batch update shopify_orders
  const updatedShopifyRows = sOrders.map(o => {
    const num = o.order_number.replace(/^#/, '');
    const origDate = masterDates[num] || '2026-08-15';
    const hour = 9 + (parseInt(num, 10) % 9);
    const min = (parseInt(num, 10) * 7) % 60;
    const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`;
    const fullCreatedAt = `${origDate}T${timeStr}`;

    return {
      ...o,
      created_at: fullCreatedAt,
      synced_at: fullCreatedAt
    };
  });

  for (let i = 0; i < updatedShopifyRows.length; i += 100) {
    const chunk = updatedShopifyRows.slice(i, i + 100);
    await supabase.from('shopify_orders').upsert(chunk, { onConflict: 'id' });
  }
  console.log('Finished batch updating shopify_orders in Supabase.');

  // Clean duplicate rows in delinquency_global and update order_date / expected_date
  const groupedRows: Record<string, any[]> = {};
  dData.forEach(r => {
    const norm = r.order_id.replace(/^#/, '').trim();
    if (!groupedRows[norm]) groupedRows[norm] = [];
    groupedRows[norm].push(r);
  });

  const duplicateIdsToDelete: string[] = [];
  const keepRowsToUpsert: any[] = [];

  for (const [norm, rows] of Object.entries(groupedRows)) {
    const cleanNum = norm.replace(/^BLKBRD|^USBLKBRD/i, '').trim();
    const origDate = masterDates[cleanNum] || '2026-08-15';
    const expDate = new Date(new Date(origDate).getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    rows.sort((a, b) => {
      if (a.order_date !== '2026-09-26' && b.order_date === '2026-09-26') return -1;
      if (a.order_date === '2026-09-26' && b.order_date !== '2026-09-26') return 1;
      return (b.remarks || '').length - (a.remarks || '').length;
    });

    const keepRow = rows[0];
    const duplicateIds = rows.slice(1).map(r => r.id);
    duplicateIdsToDelete.push(...duplicateIds);

    keepRowsToUpsert.push({
      ...keepRow,
      order_date: origDate,
      expected_date: expDate
    });
  }

  // Delete duplicates in chunks
  for (let i = 0; i < duplicateIdsToDelete.length; i += 100) {
    const chunk = duplicateIdsToDelete.slice(i, i + 100);
    await supabase.from('delinquency_global').delete().in('id', chunk);
  }
  console.log('Deleted', duplicateIdsToDelete.length, 'duplicate rows from delinquency_global.');

  // Upsert cleaned master rows
  for (let i = 0; i < keepRowsToUpsert.length; i += 100) {
    const chunk = keepRowsToUpsert.slice(i, i + 100);
    await supabase.from('delinquency_global').upsert(chunk, { onConflict: 'id' });
  }
  console.log('Upserted', keepRowsToUpsert.length, 'cleaned delinquency_global rows.');
}

run().catch(console.error);
