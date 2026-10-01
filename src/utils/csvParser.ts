import { ReturnItem, BostonStockItem, DispatchItem, DelinquencyItem, ClubbedOrderItem } from '../types';
import {
  calculateExpectedDate,
  calculateDelayDays,
  calculateOrderDateFromExpected,
  parseFlexibleDate,
  normalizeStage
} from './delinquencyUtils';

/**
 * Robust CSV parser that handles quotes, escaped quotes, commas inside quotes,
 * and different line endings.
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        // Skip CR in CRLF
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        // Only push row if it contains non-empty cells
        if (currentRow.some(cell => cell.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  // Push final field/row if any
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function parseReturnsRows(rawRows: string[][], storeTab?: 'Global' | 'LLC'): ReturnItem[] {
  if (!rawRows || rawRows.length === 0) return [];

  // Find header row containing client or order
  let headerIndex = -1;
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const rowStr = rawRows[i].join(',').toLowerCase();
    if (rowStr.includes('client') || rowStr.includes('reason') || rowStr.includes('order id') || rowStr.includes('old order')) {
      headerIndex = i;
      break;
    }
  }

  const startRow = headerIndex >= 0 ? headerIndex + 1 : 1;
  const headers = headerIndex >= 0 ? rawRows[headerIndex].map(h => h.trim().toLowerCase()) : [];

  const getIdx = (keywords: string[], defaultIdx: number) => {
    if (headerIndex < 0) return defaultIdx;
    const found = headers.findIndex(h => keywords.some(kw => h.includes(kw)));
    return found >= 0 ? found : defaultIdx;
  };

  const sNoIdx = getIdx(['s.no', 'sr', 's.n'], 0);
  const clientIdx = getIdx(['client', 'customer', 'name'], 1);
  const typeIdx = getIdx(['type', 'return type'], 2);
  const reasonIdx = getIdx(['reason'], 3);
  const oldOrderIdx = getIdx(['old order', 'order id', 'order no'], 4);
  const newOrderIdx = getIdx(['new order', 'replacement order'], 5);
  const returnReceivedIdx = getIdx(['return received', 'received?'], 6);
  const statusIdx = getIdx(['status'], 7);
  const replacementDoneIdx = getIdx(['replament', 'replacement done'], 8);
  const regionIdx = getIdx(['region'], 9);
  const initiatedDateIdx = getIdx(['initiated date', 'date'], 10);
  const targetDateIdx = getIdx(['target date', 'new target'], 11);
  const courierIdx = getIdx(['incoming courier', 'courier'], 12);
  const trackingIdx = getIdx(['incoming tracking', 'tracking no'], 13);
  const exchangeTrackingIdx = getIdx(['exchangetracking', 'exchange tracking'], 14);
  const countryIdx = getIdx(['country'], 15);
  const pictureIdx = getIdx(['picture', 'image'], 16);
  const createdByIdx = getIdx(['createdby', 'created by'], 17);
  const notesIdx = getIdx(['notes', 'note', 'remark'], 18);

  const items: ReturnItem[] = [];

  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const oldOrder = (row[oldOrderIdx] || '').trim();
    const newOrder = (row[newOrderIdx] || '').trim();
    const client = (row[clientIdx] || '').trim();

    if (!oldOrder && !newOrder && !client && !row[sNoIdx]) continue;

    // Detect store tab from order numbers if not explicitly provided
    let detectedTab: 'Global' | 'LLC' = storeTab || 'Global';
    if (!storeTab) {
      if (oldOrder.toUpperCase().includes('USBLKBRD') || newOrder.toUpperCase().includes('USBLKBRD')) {
        detectedTab = 'LLC';
      } else {
        detectedTab = 'Global';
      }
    }

    items.push({
      id: `ret-${r}-${oldOrder || client || r}`,
      sNo: row[sNoIdx] || r,
      clientName: client || 'Customer',
      type: row[typeIdx] || 'Exchange',
      reason: row[reasonIdx] || 'General / Not specified',
      oldOrderId: oldOrder,
      newOrderId: newOrder,
      returnReceived: row[returnReceivedIdx] || 'Pending',
      status: row[statusIdx] || 'Initiated',
      replacementDone: row[replacementDoneIdx] || '',
      region: row[regionIdx] || (detectedTab === 'LLC' ? 'International / USA' : 'Domestic'),
      storeTab: detectedTab,
      initiatedDate: row[initiatedDateIdx] || '',
      newTargetDate: row[targetDateIdx] || '',
      incomingCourier: row[courierIdx] || '',
      incomingTrackingNo: row[trackingIdx] || '',
      exchangeTracking: row[exchangeTrackingIdx] || '',
      country: row[countryIdx] || (detectedTab === 'LLC' ? 'USA' : 'India'),
      picture: row[pictureIdx] || '',
      createdBy: row[createdByIdx] || '',
      notes: row[notesIdx] || ''
    });
  }

  return items;
}

export function parseReturnsCsv(csvText: string, storeTab?: 'Global' | 'LLC'): ReturnItem[] {
  const rawRows = parseCsvRows(csvText);
  return parseReturnsRows(rawRows, storeTab);
}

export function parseBostonStockRows(rawRows: string[][]): BostonStockItem[] {
  if (!rawRows || rawRows.length === 0) return [];

  let headerIndex = -1;
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const rowStr = rawRows[i].join(',').toLowerCase();
    if (rowStr.includes('shoe') || rowStr.includes('model') || rowStr.includes('size') || rowStr.includes('stock') || rowStr.includes('boston')) {
      headerIndex = i;
      break;
    }
  }

  const startRow = headerIndex >= 0 ? headerIndex + 1 : 1;
  const headers = headerIndex >= 0 ? rawRows[headerIndex].map(h => h.trim().toLowerCase()) : [];

  const getIdx = (keywords: string[], defaultIdx: number) => {
    if (headerIndex < 0) return defaultIdx;
    const found = headers.findIndex(h => keywords.some(kw => h.includes(kw)));
    return found >= 0 ? found : defaultIdx;
  };

  const sNoIdx = getIdx(['s.no', 'sr', 's.n', 'id'], 0);
  const modelIdx = getIdx(['model', 'shoe model', 'style', 'article'], 1);
  const sizeIdx = getIdx(['size', 'uk', 'us size'], 2);
  const widthIdx = getIdx(['width', 'last', 'fitting'], 3);
  const leatherIdx = getIdx(['leather', 'color', 'upper', 'material'], 4);
  const conditionIdx = getIdx(['condition', 'quality', 'grade'], 5);
  const originalOrderIdx = getIdx(['order id', 'order no', 'original order', 'order'], 6);
  const clientIdx = getIdx(['client', 'customer', 'returned by'], 7);
  const dateIdx = getIdx(['date', 'received date', 'received'], 8);
  const locationIdx = getIdx(['location', 'rack', 'bin', 'warehouse'], 9);
  const statusIdx = getIdx(['status', 'availability', 'state'], 10);
  const notesIdx = getIdx(['notes', 'remark', 'comments'], 11);

  const items: BostonStockItem[] = [];

  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const shoeModel = (row[modelIdx] || '').trim();
    const size = (row[sizeIdx] || '').trim();
    const orderId = (row[originalOrderIdx] || '').trim();

    if (!shoeModel && !size && !orderId && !row[sNoIdx]) continue;

    const rawCondition = (row[conditionIdx] || '').trim().toLowerCase();
    let condition: BostonStockItem['condition'] = 'Pristine / Like New';
    if (rawCondition.includes('refurb') || rawCondition.includes('resole') || rawCondition.includes('repair')) {
      condition = 'Refurbished';
    } else if (rawCondition.includes('polish') || rawCondition.includes('touch')) {
      condition = 'Needs Polish';
    } else if (rawCondition.includes('crease') || rawCondition.includes('try') || rawCondition.includes('wear')) {
      condition = 'Minor Creasing / Try-on';
    }

    const rawStatus = (row[statusIdx] || '').trim().toLowerCase();
    let status: BostonStockItem['status'] = 'Available';
    if (rawStatus.includes('reserved') || rawStatus.includes('hold')) {
      status = 'Reserved for Exchange';
    } else if (rawStatus.includes('used') || rawStatus.includes('allocated') || rawStatus.includes('repurpose')) {
      status = 'Re-allocated / Used';
    } else if (rawStatus.includes('inspect') || rawStatus.includes('pending')) {
      status = 'Inspection Pending';
    }

    items.push({
      id: `bos-${r}-${shoeModel || r}`,
      sNo: row[sNoIdx] || r,
      shoeModel: shoeModel || 'Handcrafted Footwear',
      size: size || 'Standard Fit',
      widthOrLast: row[widthIdx] || 'Standard D',
      colorLeather: row[leatherIdx] || 'Fine Calfskin',
      condition,
      originalOrderId: orderId || 'N/A',
      clientName: row[clientIdx] || 'Customer Return',
      dateReceived: row[dateIdx] || new Date().toISOString().split('T')[0],
      storageLocation: row[locationIdx] || 'Boston Hub - Main Stock',
      status,
      notes: row[notesIdx] || ''
    });
  }

  return items;
}

export function parseBostonStockCsv(csvText: string): BostonStockItem[] {
  const rawRows = parseCsvRows(csvText);
  return parseBostonStockRows(rawRows);
}

export function parseDispatchRows(rawRows: string[][]): DispatchItem[] {
  if (!rawRows || rawRows.length === 0) return [];

  let headerIndex = -1;
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const rowStr = rawRows[i].join(',').toLowerCase();
    if (rowStr.includes('order') || rowStr.includes('courier') || rowStr.includes('tracking')) {
      headerIndex = i;
      break;
    }
  }

  const startRow = headerIndex >= 0 ? headerIndex + 1 : 1;
  const headers = headerIndex >= 0 ? rawRows[headerIndex].map(h => h.trim().toLowerCase()) : [];

  const getIdx = (keywords: string[], defaultIdx: number) => {
    if (headerIndex < 0) return defaultIdx;
    const found = headers.findIndex(h => keywords.some(kw => h.includes(kw)));
    return found >= 0 ? found : defaultIdx;
  };

  const sNoIdx = getIdx(['s.no', 'sr', 's.n'], 0);
  const dateIdx = getIdx(['date'], 1);
  const orderIdx = getIdx(['order number', 'order id', 'order'], 2);
  const regionIdx = getIdx(['international/domestic', 'region'], 3);
  const trackingIdx = getIdx(['tracking details', 'tracking'], 4);
  const courierIdx = getIdx(['courier'], 5);
  const fulfilledIdx = getIdx(['tracking & ful', 'fulfil', 'website'], 6);
  const notesIdx = getIdx(['notes', 'note'], 7);

  const items: DispatchItem[] = [];

  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const orderNo = (row[orderIdx] || '').trim();
    if (!orderNo && !row[trackingIdx]) continue;

    items.push({
      id: `disp-${r}-${orderNo}`,
      sNo: row[sNoIdx] || r,
      date: row[dateIdx] || '',
      orderNumber: orderNo,
      region: row[regionIdx] || (orderNo.toUpperCase().startsWith('US') ? 'INTERNATIONAL' : 'DOMESTIC'),
      trackingDetails: row[trackingIdx] || '',
      courier: row[courierIdx] || 'STANDARD',
      trackingFulfilled: row[fulfilledIdx] || 'YES',
      notes: row[notesIdx] || ''
    });
  }

  return items;
}

export function parseDispatchCsv(csvText: string): DispatchItem[] {
  const rawRows = parseCsvRows(csvText);
  return parseDispatchRows(rawRows);
}

export function parseDelinquencyRows(rawRows: string[][], storeTab?: 'Global' | 'LLC'): DelinquencyItem[] {
  if (!rawRows || rawRows.length === 0) return [];

  // Helper to test if a string represents a store name rather than an order ID
  const isStoreName = (val: string) =>
    /^(global|llc|usa|usa\s*store|global\s*store|domestic|international|blkbrd\s*global|blkbrd\s*llc|store|store\s*name)$/i.test(
      val.trim()
    );

  // Helper to test if a string represents an order ID
  const isOrderId = (val: string) => {
    const s = val.trim();
    if (!s || isStoreName(s)) return false;
    if (/^(#)?(us)?blkbrd\d+/i.test(s)) return true;
    if (/^[A-Z0-9#\-_]{4,16}$/i.test(s) && /\d{2,}/.test(s)) return true;
    return false;
  };

  // 1. Locate header row by scoring candidate rows
  let headerIndex = -1;
  let highestScore = 0;
  const headerKeywords = [
    'order',
    'customer',
    'client',
    'delay',
    'days',
    'store',
    'stage',
    's.no',
    's.n',
    'date',
    'reason',
    'action'
  ];

  for (let i = 0; i < Math.min(rawRows.length, 12); i++) {
    const rowStr = rawRows[i].join(' ').toLowerCase();
    const score = headerKeywords.reduce((count, kw) => count + (rowStr.includes(kw) ? 1 : 0), 0);
    if (score > highestScore && score >= 2) {
      highestScore = score;
      headerIndex = i;
    }
  }

  const startRow = headerIndex >= 0 ? headerIndex + 1 : 0;
  const headers = headerIndex >= 0 ? rawRows[headerIndex].map(h => h.trim().toLowerCase()) : [];

  // Helper to match column index by patterns while avoiding exclusions
  const getIdx = (patterns: string[], excludePatterns: string[] = [], defaultIdx = -1) => {
    if (headerIndex < 0) return defaultIdx;
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (!h) continue;
      if (excludePatterns.some(ex => h.includes(ex))) continue;
      if (patterns.some(p => h.includes(p))) return c;
    }
    return defaultIdx;
  };

  // Explicit instruction: "Fetch DELAY DAYS from column 'F' from the Delinquency Sheet (Both Tabs - Global & LLC)"
  // Column F is index 5 (A=0, B=1, C=2, D=3, E=4, F=5)
  const daysDelayedColFIdx = 5;
  const daysDelayedHeaderIdx = getIdx(
    ['delay days', 'days delay', 'delayed days', 'delay', 'delayed'],
    [],
    5
  );

  const sNoIdx = getIdx(['s.no', 's.n', 'sr.', 'sr no', 'sn', 'sr_no', 'sl no'], ['reason', 'stage', 'date']);
  const storeIdx = getIdx(['store name', 'store', 'channel', 'brand', 'market'], ['order id', 'customer', 'date']);

  // Order ID: Must NOT match 'store', 'customer', or 'date'
  let orderIdx = getIdx(
    ['order id', 'order no', 'order #', 'order number', 'order_id', 'order-id'],
    ['store', 'customer', 'client', 'name', 'date']
  );
  if (orderIdx === -1) {
    orderIdx = getIdx(['order'], ['store', 'customer', 'client', 'name', 'date', 'stage', 'reason', 'delay', 'status']);
  }

  // Customer: Must NOT match 'store', 'order', or 'date'
  let customerIdx = getIdx(
    ['customer name', 'customer', 'client name', 'client', 'buyer', 'party name', 'party'],
    ['store', 'order', 'date']
  );
  if (customerIdx === -1) {
    customerIdx = getIdx(['name'], ['store', 'order', 'file', 'stage', 'reason', 'delay', 'date', 'status']);
  }

  // --- DATE OF ORDER COLUMN DETECTION ---
  // Comprehensive keywords for Date of Order (e.g. "Date of Order", "Order Date", "Date Ordered")
  const orderDateKeywords = [
    'date of order',
    'order date',
    'date ordered',
    'order dt',
    'order dt.',
    'booking date',
    'date of booking',
    'booking dt',
    'placed date',
    'date placed',
    'order placed',
    'order created',
    'created date',
    'date created',
    'order_date',
    'date_of_order',
    'order timing',
    'order time',
    'purchase date',
    'date of purchase'
  ];
  const orderDateExclusions = ['expected', 'target', 'delivery', 'due', 'exp', 'rtd', 'dispatch', 'delay'];

  let orderDateIdx = getIdx(orderDateKeywords, orderDateExclusions);

  // --- EXPECTED DATE COLUMN DETECTION ---
  const expectedDateKeywords = [
    'expected date',
    'target date',
    'delivery date',
    'due date',
    'exp date',
    'exp. date',
    'expected delivery',
    'target delivery',
    'new target date',
    'expected dt',
    'target dt',
    'dispatch target',
    'expected dispatch',
    'rtd target'
  ];
  const expectedDateExclusions = ['order date', 'date of order', 'booking date', 'date ordered', 'order placed', 'order dt'];

  let expectedDateIdx = getIdx(expectedDateKeywords, expectedDateExclusions);

  // If orderDateIdx was not found by explicit phrase, check for a generic 'Date' column
  if (orderDateIdx === -1) {
    for (let c = 0; c < headers.length; c++) {
      if (c === expectedDateIdx || c === orderIdx || c === customerIdx || c === storeIdx || c === sNoIdx) continue;
      const h = headers[c];
      if (!h) continue;
      if (h.includes('reason') || h.includes('stage') || h.includes('delay') || h.includes('action') || h.includes('status')) continue;
      if (h === 'date' || h === 'dt' || h === 'date:' || h.startsWith('date ') || h.endsWith(' date')) {
        orderDateIdx = c;
        break;
      }
    }
  }

  // Column inspection fallback: If orderDateIdx is still -1, check sample rows for a column containing dates
  if (orderDateIdx === -1 && rawRows.length > startRow) {
    const sampleLimit = Math.min(rawRows.length, startRow + 8);
    let bestCol = -1;
    let bestScore = 0;

    for (let c = 0; c < (rawRows[startRow] ? rawRows[startRow].length : 0); c++) {
      if (c === daysDelayedColFIdx || c === sNoIdx || c === orderIdx || c === customerIdx || c === storeIdx || c === expectedDateIdx) continue;
      let dateCount = 0;
      let totalCount = 0;
      for (let r = startRow; r < sampleLimit; r++) {
        const val = (rawRows[r][c] || '').trim();
        if (val) {
          totalCount++;
          if (parseFlexibleDate(val)) {
            dateCount++;
          }
        }
      }
      if (totalCount > 0 && dateCount / totalCount >= 0.5 && dateCount > bestScore) {
        bestScore = dateCount;
        bestCol = c;
      }
    }
    if (bestCol >= 0) {
      orderDateIdx = bestCol;
    }
  }

  const stageIdx = getIdx(['current stage', 'stage', 'status'], []);
  const delayReasonIdx = getIdx(['delay reason', 'reason', 'root cause'], []);
  const actionIdx = getIdx(['action required', 'action', 'next step', 'remark'], []);
  const escalationIdx = getIdx(['escalation status', 'escalation', 'priority'], []);

  const items: DelinquencyItem[] = [];

  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    // Skip repeated header row
    const rowStr = row.join(' ').toLowerCase();
    if (rowStr.includes('order id') && (rowStr.includes('customer') || rowStr.includes('client'))) continue;

    // --- 1. RESOLVE ORDER ID (Must NEVER be Store Name or Date) ---
    let orderId = '';
    if (orderIdx >= 0 && row[orderIdx]) {
      const candidate = row[orderIdx].trim();
      if (!isStoreName(candidate) && !parseFlexibleDate(candidate)) {
        orderId = candidate;
      }
    }

    // If orderId is missing or was a store name, scan all row cells for the real Order ID
    if (!orderId || isStoreName(orderId)) {
      for (let c = 0; c < row.length; c++) {
        if (c === daysDelayedColFIdx) continue;
        const cell = (row[c] || '').trim();
        if (isOrderId(cell)) {
          orderId = cell;
          break;
        }
      }
    }

    // --- 2. RESOLVE CUSTOMER NAME (Must NEVER be Order ID, Store Name, or Date) ---
    let customer = '';
    if (customerIdx >= 0 && row[customerIdx]) {
      const candidate = row[customerIdx].trim();
      // If customer field mistakenly has order ID, store name, or date, discard it
      if (!isOrderId(candidate) && !isStoreName(candidate) && !parseFlexibleDate(candidate)) {
        customer = candidate;
      }
    }

    // If customer is empty or invalid, scan row cells for a person's name
    if (!customer) {
      for (let c = 0; c < row.length; c++) {
        if (c === daysDelayedColFIdx) continue;
        const cell = (row[c] || '').trim();
        if (!cell) continue;
        if (cell === orderId) continue;
        if (isOrderId(cell)) continue;
        if (isStoreName(cell)) continue;
        if (parseFlexibleDate(cell)) continue; // skip date values
        if (/^\d+$/.test(cell)) continue; // skip numeric S.No
        // Customer name has letters and isn't a status
        if (
          /[a-zA-Z]{2,}/.test(cell) &&
          !/^(confirmed|in queue|on hold|normal|escalated|rtd|rtd\s*-|open|closed|delayed)/i.test(cell)
        ) {
          customer = cell;
          break;
        }
      }
    }

    if (!customer) {
      customer = 'Customer';
    }

    // Clean order ID: remove leading '#'
    const cleanOrderId = orderId.replace(/^#/, '').trim();
    if (!cleanOrderId && !row[0]) continue;

    // --- 3. FETCH DELAY DAYS FROM COLUMN "F" (Both Tabs - Global & LLC) ---
    // Column F is index 5
    let delayDays = 0;
    const colFValue = row[daysDelayedColFIdx] !== undefined ? String(row[daysDelayedColFIdx]).trim() : '';
    const matchF = colFValue.match(/-?\d+/);

    if (matchF) {
      delayDays = Math.max(0, parseInt(matchF[0], 10));
    } else if (
      daysDelayedHeaderIdx >= 0 &&
      daysDelayedHeaderIdx !== daysDelayedColFIdx &&
      row[daysDelayedHeaderIdx]
    ) {
      const matchHeader = String(row[daysDelayedHeaderIdx]).trim().match(/-?\d+/);
      if (matchHeader) {
        delayDays = Math.max(0, parseInt(matchHeader[0], 10));
      }
    }

    // --- 4. DETECT STORE TAB (Global: BLKBRD00000 & LLC: USBLKBRD00000) ---
    const upperOrder = cleanOrderId.toUpperCase();
    const isLlcIndicator =
      upperOrder.startsWith('US') ||
      upperOrder.includes('USBLKBRD') ||
      row.some(c => {
        const cell = (c || '').trim().toUpperCase();
        return cell === 'LLC' || cell.startsWith('LLC ') || cell.endsWith(' LLC') || cell === 'USA' || cell === 'US';
      });

    let detectedTab: 'Global' | 'LLC';
    if (isLlcIndicator) {
      detectedTab = 'LLC';
    } else if (storeTab === 'LLC') {
      detectedTab = 'LLC';
    } else if (upperOrder.startsWith('BLKBRD')) {
      detectedTab = 'Global';
    } else {
      detectedTab = storeTab || 'Global';
    }

    // --- 5. RESOLVE DATE OF ORDER & EXPECTED DATE (+21 DAYS) ---
    let orderDateVal = orderDateIdx >= 0 ? parseFlexibleDate(row[orderDateIdx]) : '';
    let expectedDateVal = expectedDateIdx >= 0 ? parseFlexibleDate(row[expectedDateIdx]) : '';

    // If order date is still empty, scan row cells for a valid date value
    if (!orderDateVal) {
      for (let c = 0; c < row.length; c++) {
        if (c === daysDelayedColFIdx || c === sNoIdx || c === orderIdx || c === customerIdx || c === storeIdx) continue;
        const cell = (row[c] || '').trim();
        if (!cell || isOrderId(cell) || isStoreName(cell) || cell === customer) continue;
        const candidateDate = parseFlexibleDate(cell);
        if (candidateDate && /^\d{4}-\d{2}-\d{2}$/.test(candidateDate)) {
          if (c === expectedDateIdx && !expectedDateVal) {
            expectedDateVal = candidateDate;
          } else {
            orderDateVal = candidateDate;
            break;
          }
        }
      }
    }

    // Expected Date logic: Date of Order + 21 days = Expected Date
    if (!expectedDateVal && orderDateVal) {
      expectedDateVal = calculateExpectedDate(orderDateVal);
    } else if (!orderDateVal && expectedDateVal) {
      // If only Expected Date is available in sheet, infer Date of Order = Expected Date - 21 days
      orderDateVal = calculateOrderDateFromExpected(expectedDateVal);
    }

    // Delay logic: Date of Order + 21 days = Expected Date. If order surpasses Expected Date, count delayed days from Expected Date
    if (orderDateVal) {
      delayDays = calculateDelayDays(orderDateVal, expectedDateVal);
    }

    const rawStage = (stageIdx >= 0 ? row[stageIdx] : '') || '';
    const currentStageVal = normalizeStage(rawStage);

    items.push({
      id: `delinq-${detectedTab.toLowerCase()}-${r}-${cleanOrderId || r}`,
      sNo: sNoIdx >= 0 ? row[sNoIdx] || r : r,
      orderId: cleanOrderId || `ORD-${r}`,
      customerName: customer,
      orderDate: orderDateVal,
      expectedDate: expectedDateVal,
      daysDelayed: delayDays,
      currentStage: currentStageVal,
      delayReason: (delayReasonIdx >= 0 ? row[delayReasonIdx] : '') || 'Production Backlog',
      actionRequired: (actionIdx >= 0 ? row[actionIdx] : '') || '',
      escalationStatus:
        (escalationIdx >= 0 ? row[escalationIdx] : '') ||
        (delayDays > 14 ? 'Escalated to Production Lead' : 'Normal'),
      storeTab: detectedTab
    });
  }

  return items;
}

export function parseDelinquencyCsv(csvText: string, storeTab?: 'Global' | 'LLC'): DelinquencyItem[] {
  const rawRows = parseCsvRows(csvText);
  return parseDelinquencyRows(rawRows, storeTab);
}

/**
 * Clean Order ID for fuzzy cross-matching:
 * Strip '#', spaces, dashes, leading/trailing symbols, and lowercase
 */
export function normalizeOrderId(id: string): string {
  if (!id) return '';
  return id.replace(/[#\s\-_]/g, '').trim().toUpperCase();
}

/**
 * Formats an Order ID according to BLKBRD standards:
 * - 'BLKBRDxxxx' for Global store (e.g. BLKBRD40142)
 * - 'USBLKBRDxxxx' for LLC store (e.g. USBLKBRD10021)
 */
export function formatBlkbrdOrderId(rawId: string, storeTab?: 'Global' | 'LLC' | string): string {
  if (!rawId) return '';
  const clean = String(rawId).replace(/^[#\s]+/, '').trim();
  const isLlc = String(storeTab).toUpperCase() === 'LLC' ||
                clean.toUpperCase().startsWith('US') ||
                clean.toUpperCase().startsWith('USBLKBRD');

  const pureNumber = clean.replace(/^(USBLKBRD|BLKBRD|US)[-_#\s]*/i, '').trim();
  const numOrSuffix = pureNumber || clean;

  if (isLlc) {
    return `USBLKBRD${numOrSuffix}`;
  }
  return `BLKBRD${numOrSuffix}`;
}

/**
 * Checks if two order IDs represent the same order, handling bare numbers and BLKBRD prefixes.
 */
export function orderIdsMatch(idA: string, idB: string): boolean {
  if (!idA || !idB) return false;
  const normA = normalizeOrderId(idA);
  const normB = normalizeOrderId(idB);
  if (normA === normB) return true;

  const isLlcA = normA.startsWith('US');
  const isLlcB = normB.startsWith('US');
  // Different store accounts with explicit prefixes should not match
  if (isLlcA !== isLlcB && (normA.startsWith('BLKBRD') || normB.startsWith('BLKBRD'))) {
    return false;
  }

  const numA = normA.replace(/^(USBLKBRD|BLKBRD|US)/, '');
  const numB = normB.replace(/^(USBLKBRD|BLKBRD|US)/, '');
  return Boolean(numA && numB && numA === numB);
}

/**
 * Cross-sheet correlation engine:
 * Clubs records from Returns Tracker, Daily Dispatch, and Delinquency into a unified Order 360 structure.
 */
export function correlateSheets(
  returns: ReturnItem[],
  dispatches: DispatchItem[],
  delinquencies: DelinquencyItem[]
): ClubbedOrderItem[] {
  const map = new Map<string, ClubbedOrderItem>();

  // 1. Process Delinquencies (high priority for alerts)
  for (const delinq of delinquencies) {
    const norm = normalizeOrderId(delinq.orderId);
    if (!norm) continue;

    const isCompleted = delinq.orderStatus === 'Ready to Ship' || delinq.orderStatus === 'Shipped' || delinq.currentStage === 'RTD' || delinq.currentStage === 'Shipped';
    const delayDays = isCompleted ? 0 : ((delinq.orderDate && delinq.expectedDate)
      ? calculateDelayDays(delinq.orderDate, delinq.expectedDate)
      : (delinq.daysDelayed || 0));
    const isDelinquent = !isCompleted && delayDays >= 1;

    const insights: string[] = [];
    if (isDelinquent && delayDays > 30) {
      insights.push(`🚨 Critical backlog: ${delayDays} days delayed (${delinq.delayReason || 'Reason unspecified'})`);
    } else if (isDelinquent && delayDays > 7) {
      insights.push(`⚠️ Significant delay: ${delayDays} days past expected date`);
    } else if (isDelinquent) {
      insights.push(`⏱️ Delinquent order: +${delayDays} day${delayDays > 1 ? 's' : ''} past expected delivery date`);
    }
    if (isDelinquent && delinq.escalationStatus && delinq.escalationStatus.toLowerCase().includes('escalat')) {
      insights.push(`🔥 Escalation: ${delinq.escalationStatus}`);
    }

    const riskLevel = !isDelinquent ? 'normal' : delayDays > 30 ? 'critical' : delayDays > 7 ? 'high' : 'moderate';

    map.set(norm, {
      orderKey: delinq.orderId,
      matchedCustomer: delinq.customerName,
      delinquencyDetails: {
        ...delinq,
        daysDelayed: delayDays
      },
      sourceCount: 1,
      sources: isDelinquent ? ['Delinquency'] : [],
      riskLevel,
      insights
    });
  }

  // 2. Process Daily Dispatches
  for (const disp of dispatches) {
    const norm = normalizeOrderId(disp.orderNumber);
    if (!norm) continue;

    const existing = map.get(norm);
    if (existing) {
      existing.dispatchDetails = disp;
      if (!existing.sources.includes('Dispatch')) {
        existing.sources.push('Dispatch');
        existing.sourceCount++;
      }
      existing.insights.push(`📦 Dispatched on ${disp.date} via ${disp.courier} (Tracking: ${disp.trackingDetails})`);
      // If it was delinquent but dispatched, lower risk and highlight resolution!
      if (existing.delinquencyDetails) {
        existing.insights.push(`✅ Resolution Alert: Delinquent order ${disp.orderNumber} successfully shipped on ${disp.date}!`);
        existing.riskLevel = 'normal';
      }
    } else {
      map.set(norm, {
        orderKey: disp.orderNumber,
        matchedCustomer: disp.orderNumber.startsWith('BLKBRD') ? 'Customer' : disp.orderNumber,
        dispatchDetails: disp,
        sourceCount: 1,
        sources: ['Dispatch'],
        riskLevel: 'normal',
        insights: [`Shipped on ${disp.date} via ${disp.courier} [${disp.region}]`]
      });
    }
  }

  // 3. Process Returns Tracker
  for (const ret of returns) {
    const oldNorm = normalizeOrderId(ret.oldOrderId);
    const newNorm = normalizeOrderId(ret.newOrderId);

    // Target both old order id and replacement order id
    const targetKeys = [oldNorm, newNorm].filter(k => k.length > 0);

    for (const key of targetKeys) {
      const isNewReplacement = key === newNorm && newNorm.length > 0;
      const existing = map.get(key);

      if (existing) {
        existing.returnDetails = ret;
        if (!existing.sources.includes('Returns')) {
          existing.sources.push('Returns');
          existing.sourceCount++;
        }
        if (!existing.matchedCustomer || existing.matchedCustomer === 'Customer') {
          existing.matchedCustomer = ret.clientName;
        }

        if (isNewReplacement) {
          existing.insights.push(`🔄 Replacement order generated for return of ${ret.oldOrderId} (Reason: ${ret.reason})`);
        } else {
          existing.insights.push(`↩️ Return logged: Status "${ret.status}", Type "${ret.type}", Reason "${ret.reason}"`);
        }

        // Cross-alert: Return order that is also in Delinquency
        if (existing.delinquencyDetails) {
          existing.riskLevel = 'critical';
          existing.insights.push(`⚠️ Double Friction: Customer has both an active return/replacement issue and production delinquency!`);
        }
      } else {
        const insights: string[] = [];
        if (ret.status.toLowerCase().includes('sent') || ret.status.toLowerCase().includes('closed')) {
          insights.push(`Resolved return (${ret.status})`);
        } else {
          insights.push(`Active return: ${ret.type} - ${ret.reason} (Status: ${ret.status})`);
        }

        map.set(key, {
          orderKey: isNewReplacement ? ret.newOrderId : ret.oldOrderId,
          matchedCustomer: ret.clientName,
          returnDetails: ret,
          sourceCount: 1,
          sources: ['Returns'],
          riskLevel: ret.status.toLowerCase().includes('closed') ? 'normal' : 'moderate',
          insights
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    // Prioritize multi-sheet cross-referenced orders first, then risk level
    if (b.sourceCount !== a.sourceCount) {
      return b.sourceCount - a.sourceCount;
    }
    const scoreMap = { critical: 4, high: 3, moderate: 2, normal: 1 };
    return scoreMap[b.riskLevel] - scoreMap[a.riskLevel];
  });
}

/**
 * Generate CSV string from any array of objects
 */
export function exportToCsv(data: Record<string, any>[], filename: string): void {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers
        .map(header => {
          const val = row[header] ?? '';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(',')
    )
  ];

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
