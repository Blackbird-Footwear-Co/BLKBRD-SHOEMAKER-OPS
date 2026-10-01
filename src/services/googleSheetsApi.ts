import { getCachedAccessToken } from './firebaseAuth';
import {
  parseDelinquencyRows,
  parseReturnsRows,
  parseBostonStockRows,
  parseDispatchRows
} from '../utils/csvParser';
import { DelinquencyItem, ReturnItem, BostonStockItem, DispatchItem } from '../types';
import { SheetsConfig, getDelinquencies } from './store';

export interface SheetTabResult {
  sheetId: string;
  tabName: string;
  rows: string[][];
  source: string;
}

/**
 * Extracts the spreadsheetId and sheet name/gid from various Google Sheets URL formats
 */
export function extractSpreadsheetInfo(urlOrId: string): { spreadsheetId: string; sheetGid?: string } | null {
  const trimmed = (urlOrId || '').trim();
  if (!trimmed) return null;

  // Direct ID check (typically 44 chars)
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return { spreadsheetId: trimmed };
  }

  // URL extraction
  const idMatch = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = trimmed.match(/[?&#]gid=([0-9]+)/);

  if (idMatch && idMatch[1]) {
    return {
      spreadsheetId: idMatch[1],
      sheetGid: gidMatch ? gidMatch[1] : undefined
    };
  }

  return null;
}

/**
 * Fetch a specific tab from Google Sheets via backend proxy.
 * Automatically utilizes OAuth token if available, or GViz export if public.
 */
export async function fetchSheetTab(
  spreadsheetIdOrUrl: string,
  tabName: string,
  range?: string,
  gid?: string
): Promise<SheetTabResult> {
  const info = extractSpreadsheetInfo(spreadsheetIdOrUrl);
  const sheetId = info?.spreadsheetId || spreadsheetIdOrUrl.trim();
  const effectiveGid = gid || info?.sheetGid;

  if (!sheetId) {
    throw new Error('Spreadsheet ID or URL is missing.');
  }

  const token = getCachedAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch('/api/sheets/fetch-tab', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sheetId,
      tabName,
      range,
      gid: effectiveGid
    })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Failed to fetch tab "${tabName}" (HTTP ${res.status})`);
  }

  return {
    sheetId,
    tabName,
    rows: data.rows || [],
    source: data.source || 'unknown'
  };
}

/**
 * Fetch spreadsheet metadata to discover sheet titles and tabs
 */
export async function inspectSheetMetadata(
  spreadsheetIdOrUrl: string
): Promise<{ sheetId: string; title?: string; tabs: string[]; message?: string }> {
  const info = extractSpreadsheetInfo(spreadsheetIdOrUrl);
  const sheetId = info?.spreadsheetId || spreadsheetIdOrUrl.trim();

  if (!sheetId) {
    throw new Error('Invalid Sheet ID or URL');
  }

  const token = getCachedAccessToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`/api/sheets/metadata?sheetId=${encodeURIComponent(sheetId)}`, {
    headers
  });
  const data = await res.json();
  return data;
}

/**
 * Sync Delinquency Tracker:
 * 2 tabs (Global: BLKBRD00000 & LLC: USBLKBRD00000) mentioning delayed orders
 */
export async function syncDelinquencySheets(
  config: SheetsConfig
): Promise<{ items: DelinquencyItem[]; globalCount: number; llcCount: number; llcSource?: string }> {
  if (!config.delinquencySheetId && !config.delinquencyLlcUrl) {
    throw new Error('Delinquency Sheet ID / URL is not configured.');
  }

  const globalTabName = (config.delinquencyGlobalTab || 'Global').trim();
  const configuredLlcTab = (config.delinquencyLlcTab || 'LLC').trim();

  let globalItems: DelinquencyItem[] = [];
  let llcItems: DelinquencyItem[] = [];
  const errors: string[] = [];
  let llcSource: string | undefined;

  // 1. Fetch Global tab
  if (config.delinquencySheetId) {
    try {
      const res = await fetchSheetTab(config.delinquencySheetId, globalTabName);
      globalItems = parseDelinquencyRows(res.rows, 'Global');
    } catch (err: any) {
      errors.push(`Global Tab ("${globalTabName}"): ${err.message}`);
    }
  }

  // 2. Fetch LLC tab
  // Target URL or sheet ID for LLC
  const llcTarget = config.delinquencyLlcUrl?.trim() || config.delinquencySheetId;
  const candidateLlcTabs = Array.from(
    new Set([
      configuredLlcTab,
      'LLC',
      'LLC ',
      ' LLC',
      'USBLKBRD',
      'US',
      'USA',
      'LLC Store',
      'USA Store',
      'LLC Orders',
      'US Orders',
      'Sheet2'
    ])
  );

  let llcFetchSuccess = false;

  // If a direct LLC URL was provided, try fetching that first (especially if it has a gid)
  if (config.delinquencyLlcUrl?.trim()) {
    try {
      const res = await fetchSheetTab(
        config.delinquencyLlcUrl.trim(),
        configuredLlcTab,
        undefined,
        config.delinquencyLlcGid
      );
      const parsed = parseDelinquencyRows(res.rows, 'LLC');
      if (parsed.length > 0) {
        llcItems = parsed;
        llcFetchSuccess = true;
        llcSource = res.source;
      }
    } catch (err: any) {
      errors.push(`LLC Direct Link: ${err.message}`);
    }
  }

  // If not yet fetched, try candidate tab names on the target sheet
  if (!llcFetchSuccess && llcTarget) {
    for (const tabCandidate of candidateLlcTabs) {
      try {
        const res = await fetchSheetTab(
          llcTarget,
          tabCandidate,
          undefined,
          config.delinquencyLlcGid
        );
        const parsed = parseDelinquencyRows(res.rows, 'LLC');
        if (parsed.length > 0) {
          llcItems = parsed;
          llcFetchSuccess = true;
          llcSource = `${res.source} (${tabCandidate})`;
          break;
        }
      } catch {
        // Continue to next candidate
      }
    }
  }

  // 3. Smart Re-partitioning:
  // Check if globalItems actually contained LLC orders (e.g. orders starting with US/USBLKBRD or marked LLC)
  const llcFoundInGlobal = globalItems.filter(
    i => i.storeTab === 'LLC' || i.orderId.toUpperCase().startsWith('US')
  );
  if (llcFoundInGlobal.length > 0) {
    globalItems = globalItems.filter(
      i => i.storeTab !== 'LLC' && !i.orderId.toUpperCase().startsWith('US')
    );
    // Merge without duplicates
    const existingIds = new Set(llcItems.map(i => i.orderId.toUpperCase()));
    for (const item of llcFoundInGlobal) {
      if (!existingIds.has(item.orderId.toUpperCase())) {
        llcItems.push(item);
        existingIds.add(item.orderId.toUpperCase());
      }
    }
    if (!llcSource) {
      llcSource = 'partitioned_from_global';
    }
  }

  // 4. Safe Fallback to prevent wiping out stored LLC items if remote LLC tab could not be accessed
  if (llcItems.length === 0) {
    const currentStoredLlc = getDelinquencies().filter(
      i => i.storeTab === 'LLC' || i.orderId.toUpperCase().startsWith('US')
    );
    if (currentStoredLlc.length > 0) {
      llcItems = currentStoredLlc;
      llcSource = 'retained_from_storage';
    }
  }

  if (globalItems.length === 0 && llcItems.length === 0 && errors.length > 0) {
    throw new Error(`Delinquency sync failed: ${errors.join(' | ')}`);
  }

  const combined = [...globalItems, ...llcItems];
  return {
    items: combined,
    globalCount: globalItems.length,
    llcCount: llcItems.length,
    llcSource
  };
}

/**
 * Test specifically the LLC tab sync for Delinquency Tracker
 */
export async function testLlcDelinquencySync(
  config: SheetsConfig
): Promise<{
  success: boolean;
  count: number;
  sampleOrder?: string;
  tabUsed?: string;
  source?: string;
  message: string;
}> {
  const llcTarget = config.delinquencyLlcUrl?.trim() || config.delinquencySheetId?.trim();
  if (!llcTarget) {
    return {
      success: false,
      count: 0,
      message: 'Please provide either the Delinquency Sheet ID or Direct LLC Tab URL.'
    };
  }

  const configuredLlcTab = (config.delinquencyLlcTab || 'LLC').trim();
  const candidateLlcTabs = Array.from(
    new Set([
      configuredLlcTab,
      'LLC',
      'LLC ',
      ' LLC',
      'USBLKBRD',
      'US',
      'USA',
      'LLC Store',
      'USA Store',
      'LLC Orders',
      'US Orders',
      'Sheet2'
    ])
  );

  let lastError = '';

  for (const tabName of candidateLlcTabs) {
    try {
      const res = await fetchSheetTab(
        llcTarget,
        tabName,
        undefined,
        config.delinquencyLlcGid
      );
      const parsed = parseDelinquencyRows(res.rows, 'LLC');
      if (parsed.length > 0) {
        return {
          success: true,
          count: parsed.length,
          sampleOrder: parsed[0]?.orderId,
          tabUsed: tabName,
          source: res.source,
          message: `Successfully synced ${parsed.length} LLC delayed orders using tab "${tabName}"!`
        };
      }
    } catch (err: any) {
      lastError = err.message || 'Fetch failed';
    }
  }

  return {
    success: false,
    count: 0,
    message: lastError || 'No delayed orders found in LLC tab candidates.'
  };
}

/**
 * Sync Returns Tracker:
 * 3 tabs (Global: BLKBRD00000, LLC: USBLKBRD00000, Boston Stock: received at Boston location)
 */
export async function syncReturnsSheets(
  config: SheetsConfig
): Promise<{
  returns: ReturnItem[];
  bostonStock: BostonStockItem[];
  globalCount: number;
  llcCount: number;
  stockCount: number;
}> {
  if (!config.returnsSheetId) {
    throw new Error('Returns Sheet ID / URL is not configured.');
  }

  const globalTabName = config.returnsGlobalTab || 'Global';
  const llcTabName = config.returnsLlcTab || 'LLC';
  const stockTabName = config.returnsBostonStockTab || 'Boston Stock';

  let globalItems: ReturnItem[] = [];
  let llcItems: ReturnItem[] = [];
  let stockItems: BostonStockItem[] = [];
  const errors: string[] = [];

  // 1. Fetch Global returns tab
  try {
    const res = await fetchSheetTab(config.returnsSheetId, globalTabName);
    globalItems = parseReturnsRows(res.rows, 'Global');
  } catch (err: any) {
    errors.push(`Tab "${globalTabName}": ${err.message}`);
  }

  // 2. Fetch LLC returns tab
  try {
    const res = await fetchSheetTab(config.returnsSheetId, llcTabName);
    llcItems = parseReturnsRows(res.rows, 'LLC');
  } catch (err: any) {
    errors.push(`Tab "${llcTabName}": ${err.message}`);
  }

  // 3. Fetch Boston Stock tab
  try {
    const res = await fetchSheetTab(config.returnsSheetId, stockTabName);
    stockItems = parseBostonStockRows(res.rows);
  } catch (err: any) {
    errors.push(`Tab "${stockTabName}": ${err.message}`);
  }

  if (globalItems.length === 0 && llcItems.length === 0 && stockItems.length === 0 && errors.length > 0) {
    throw new Error(`Returns sync failed: ${errors.join(' | ')}`);
  }

  const combinedReturns = [...globalItems, ...llcItems];
  return {
    returns: combinedReturns,
    bostonStock: stockItems,
    globalCount: globalItems.length,
    llcCount: llcItems.length,
    stockCount: stockItems.length
  };
}

/**
 * Sync Daily Dispatch Sheet:
 * Shipping partner and tracking ID details for customer CRM updates
 */
export async function syncDispatchSheet(
  config: SheetsConfig
): Promise<{ dispatches: DispatchItem[]; count: number }> {
  if (!config.dispatchSheetId) {
    throw new Error('Daily Dispatch Sheet ID / URL is not configured.');
  }

  const dispatchTab = config.dispatchTab || 'Daily Dispatch';
  try {
    const res = await fetchSheetTab(config.dispatchSheetId, dispatchTab);
    const dispatches = parseDispatchRows(res.rows);
    return {
      dispatches,
      count: dispatches.length
    };
  } catch (err: any) {
    // If specific tab name failed, attempt fallback with 'Sheet1'
    try {
      const fallbackRes = await fetchSheetTab(config.dispatchSheetId, 'Sheet1');
      const dispatches = parseDispatchRows(fallbackRes.rows);
      return {
        dispatches,
        count: dispatches.length
      };
    } catch {
      throw new Error(`Daily Dispatch sync failed: ${err.message}`);
    }
  }
}

/**
 * Execute full sync across all 3 sheets according to configured IDs
 */
export async function syncAllOperationsSheets(config: SheetsConfig): Promise<{
  delinquencies?: DelinquencyItem[];
  returns?: ReturnItem[];
  bostonStock?: BostonStockItem[];
  dispatches?: DispatchItem[];
  summary: {
    delinquencyGlobal?: number;
    delinquencyLlc?: number;
    returnsGlobal?: number;
    returnsLlc?: number;
    bostonStock?: number;
    dispatch?: number;
  };
  errors: Record<string, string>;
}> {
  const summary: SheetsConfig['syncCounts'] = {};
  const errors: Record<string, string> = {};
  let delinquencies: DelinquencyItem[] | undefined;
  let returns: ReturnItem[] | undefined;
  let bostonStock: BostonStockItem[] | undefined;
  let dispatches: DispatchItem[] | undefined;

  // 1. Delinquency Tracker
  if (config.delinquencySheetId) {
    try {
      const dResult = await syncDelinquencySheets(config);
      delinquencies = dResult.items;
      summary.delinquencyGlobal = dResult.globalCount;
      summary.delinquencyLlc = dResult.llcCount;
    } catch (e: any) {
      errors.delinquency = e.message;
    }
  }

  // 2. Returns Tracker
  if (config.returnsSheetId) {
    try {
      const rResult = await syncReturnsSheets(config);
      returns = rResult.returns;
      bostonStock = rResult.bostonStock;
      summary.returnsGlobal = rResult.globalCount;
      summary.returnsLlc = rResult.llcCount;
      summary.bostonStock = rResult.stockCount;
    } catch (e: any) {
      errors.returns = e.message;
    }
  }

  // 3. Daily Dispatch
  if (config.dispatchSheetId) {
    try {
      const dispResult = await syncDispatchSheet(config);
      dispatches = dispResult.dispatches;
      summary.dispatch = dispResult.count;
    } catch (e: any) {
      errors.dispatch = e.message;
    }
  }

  return {
    delinquencies,
    returns,
    bostonStock,
    dispatches,
    summary,
    errors
  };
}

/**
 * Appends a new delinquency order row to the live Google Sheet (two-way sync).
 * Now equipped with explicit alerts to diagnose write failures.
 */
export async function appendDelinquencyToSheet(
  item: DelinquencyItem,
  config: SheetsConfig
): Promise<{ success: boolean; message: string; updatedRange?: string }> {
  const isLlc = item.storeTab === 'LLC' || item.orderId.toUpperCase().startsWith('US');
  let targetSheetId = config.delinquencySheetId?.trim();
  
  if (isLlc && config.delinquencyLlcUrl?.trim()) {
    const llcParsed = extractSpreadsheetInfo(config.delinquencyLlcUrl.trim());
    if (llcParsed?.spreadsheetId) {
      targetSheetId = llcParsed.spreadsheetId;
    }
  }

  if (!targetSheetId) {
    alert("CRITICAL ERROR: No Google Sheet ID found in settings. Open Sheets Settings and paste your URL.");
    throw new Error('Delinquency Sheet ID is not configured.');
  }

  const targetTab = (isLlc ? config.delinquencyLlcTab || 'LLC' : config.delinquencyGlobalTab || 'Global').trim();

  // Check for Google Auth Token
  const token = getCachedAccessToken();
  if (!token) {
    alert("AUTH ERROR: You are not signed in with Google! The app cannot write to your sheet without an OAuth token. Click 'Sign in with Google' first.");
    throw new Error('Google authentication required.');
  }

  // Use the standard 10-column BLKBRD layout
  const rowValues = [
    item.sNo || '',
    item.storeTab || (isLlc ? 'LLC' : 'Global'),
    item.orderId.replace(/^#/, '').trim(),
    item.customerName || '',
    item.orderDate || '',
    item.daysDelayed !== undefined ? item.daysDelayed : '',
    item.currentStage || 'Preparation',
    item.delayReason || '',
    item.actionRequired || '',
    item.escalationStatus || 'Normal'
  ];

  try {
    const response = await fetch('/api/sheets/append-row', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        sheetId: targetSheetId,
        tabName: targetTab,
        rowValues
      })
    });

    const resJson = await response.json();

    // If Google rejects it (e.g., 403 Permission Denied)
    if (!response.ok || !resJson.success) {
      alert(`GOOGLE API ERROR: ${resJson.error || response.statusText}`);
      throw new Error(resJson.error || 'Failed to append');
    }

    return { 
      success: true, 
      message: `Appended successfully to ${targetTab}`,
      updatedRange: resJson.updatedRange 
    };

  } catch (err: any) {
    // If the server crashes or network fails
    if (!err.message.includes('authentication required')) {
      alert(`NETWORK/SERVER ERROR: ${err.message}`);
    }
    throw err;
  }
}