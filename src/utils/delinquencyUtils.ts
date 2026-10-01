import { DelinquencyStage, DELINQUENCY_STAGES } from '../types';

/**
 * Robustly parses dates from Google Sheets, CSVs, GViz exports, Excel serial numbers,
 * and regional formats (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, Month names) into ISO YYYY-MM-DD.
 */
export function parseFlexibleDate(input: any): string {
  if (input === null || input === undefined) return '';
  let s = String(input).trim();
  if (!s || s === '-' || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'null') return '';

  // 1. Google Sheets GViz date format: Date(2026,6,31)
  const gvizMatch = s.match(/Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})/i);
  if (gvizMatch) {
    const y = parseInt(gvizMatch[1], 10);
    const m = String(parseInt(gvizMatch[2], 10) + 1).padStart(2, '0');
    const d = String(parseInt(gvizMatch[3], 10)).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. Pure digits: Only 5-digit numbers can be Excel/Sheets date serial (e.g. 35000-60000)
  if (/^\d+$/.test(s)) {
    if (s.length === 5) {
      const serial = parseInt(s, 10);
      if (serial >= 35000 && serial <= 60000) {
        const utcDays = serial - 25569;
        const date = new Date(utcDays * 86400 * 1000);
        return date.toISOString().split('T')[0];
      }
    }
    // Pure numbers like "1", "20", "2024" alone are not complete date strings
    return '';
  }

  // 3. ISO format: YYYY-MM-DD or YYYY/MM/DD or with timestamp like YYYY-MM-DDTHH:mm:ss
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
    const d = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };

  // 4. DD-MMM-YYYY or DD MMM YYYY or DD/MMM/YYYY (e.g. 31-Jul-2026, 31 Jul 2026, 31-July-2026)
  const dMmmYMatch = s.match(/^(\d{1,2})[-/\s]([a-zA-Z]{3,9})[-/\s]+(\d{2,4})/);
  if (dMmmYMatch) {
    const d = String(parseInt(dMmmYMatch[1], 10)).padStart(2, '0');
    const mStr = dMmmYMatch[2].toLowerCase().substring(0, 3);
    const m = monthMap[mStr];
    let y = dMmmYMatch[3];
    if (y.length === 2) y = '20' + y;
    if (m) return `${y}-${m}-${d}`;
  }

  // 5. MMM DD, YYYY or MMM DD YYYY (e.g. Jul 31, 2026, July 31 2026)
  const mmmDYMatch = s.match(/^([a-zA-Z]{3,9})[-/\s]+(\d{1,2})(?:st|nd|rd|th)?,?[-/\s]+(\d{2,4})/);
  if (mmmDYMatch) {
    const mStr = mmmDYMatch[1].toLowerCase().substring(0, 3);
    const m = monthMap[mStr];
    const d = String(parseInt(mmmDYMatch[2], 10)).padStart(2, '0');
    let y = mmmDYMatch[3];
    if (y.length === 2) y = '20' + y;
    if (m) return `${y}-${m}-${d}`;
  }

  // 6. Regional DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (Standard Indian / British factory format)
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    const part1 = parseInt(dmyMatch[1], 10);
    const part2 = parseInt(dmyMatch[2], 10);
    let y = dmyMatch[3];
    if (y.length === 2) y = '20' + y;

    let d = part1;
    let m = part2;
    // If part1 is <= 12 and part2 > 12, it must be MM/DD/YYYY
    if (part1 <= 12 && part2 > 12) {
      m = part1;
      d = part2;
    }

    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // 7. General Date constructor fallback (must have at least one separator to avoid numeric year coercions)
  if (!/[-/.,\s]/.test(s)) return '';

  const dObj = new Date(s);
  if (!isNaN(dObj.getTime()) && dObj.getFullYear() >= 2015 && dObj.getFullYear() <= 2035) {
    return dObj.toISOString().split('T')[0];
  }

  return '';
}

/**
 * Calculates Expected Date based on: Date of Order + 21 days = Expected Date
 * @param orderDateStr Date string in any format (e.g. DD/MM/YYYY, YYYY-MM-DD, DD-MMM-YYYY)
 */
export function calculateExpectedDate(orderDateStr: string): string {
  if (!orderDateStr) return '';
  const parsed = parseFlexibleDate(orderDateStr);
  if (!parsed) return '';

  const [y, m, d] = parsed.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(dateObj.getTime())) return '';

  // Add 21 calendar days in UTC to prevent timezone shifts
  dateObj.setUTCDate(dateObj.getUTCDate() + 21);
  return dateObj.toISOString().split('T')[0];
}

/**
 * Calculates Date of Order based on: Expected Date - 21 days = Date of Order
 */
export function calculateOrderDateFromExpected(expectedDateStr: string): string {
  if (!expectedDateStr) return '';
  const parsed = parseFlexibleDate(expectedDateStr);
  if (!parsed) return '';

  const [y, m, d] = parsed.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(dateObj.getTime())) return '';

  // Subtract 21 calendar days in UTC
  dateObj.setUTCDate(dateObj.getUTCDate() - 21);
  return dateObj.toISOString().split('T')[0];
}

/**
 * Calculates Delay Days based on: Date of Order + 21 days = Expected Date
 * Delay days = difference in days between current date (today) and Expected Date if surpassed
 */
export function calculateDelayDays(orderDateStr: string, explicitExpectedDate?: string): number {
  const expStr = explicitExpectedDate ? parseFlexibleDate(explicitExpectedDate) : calculateExpectedDate(orderDateStr);
  if (!expStr) return 0;

  const [y, m, d] = expStr.split('-').map(Number);
  const expUtc = Date.UTC(y, m - 1, d);
  if (isNaN(expUtc)) return 0;

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const diffMs = todayUtc - expUtc;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Calculates complete delay & schedule info based on:
 * Order Date + 21 days = Expected Date
 * If an order surpasses Expected Date:
 *   delayedDays = count of days between Expected Date and today
 * If an order has not surpassed Expected Date:
 *   daysRemaining = count of days left until Expected Date
 */
export function calculateDelayInfo(orderDateStr: string, explicitExpectedDate?: string): {
  expectedDate: string;
  isSurpassed: boolean;
  delayedDays: number;
  daysRemaining: number;
} {
  const expStr = explicitExpectedDate ? parseFlexibleDate(explicitExpectedDate) : calculateExpectedDate(orderDateStr);
  if (!expStr) {
    return { expectedDate: '', isSurpassed: false, delayedDays: 0, daysRemaining: 0 };
  }

  const [y, m, d] = expStr.split('-').map(Number);
  const expUtc = Date.UTC(y, m - 1, d);
  if (isNaN(expUtc)) {
    return { expectedDate: expStr, isSurpassed: false, delayedDays: 0, daysRemaining: 0 };
  }

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const diffMs = todayUtc - expUtc;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return {
      expectedDate: expStr,
      isSurpassed: true,
      delayedDays: diffDays,
      daysRemaining: 0
    };
  } else {
    return {
      expectedDate: expStr,
      isSurpassed: false,
      delayedDays: 0,
      daysRemaining: Math.abs(diffDays)
    };
  }
}

/**
 * Accurately determines if an order is Delinquent:
 * Delinquent orders are those only with 1 or more days of delay
 * (Date of order + 21 days Expected date + 1, 2, 3, 4 days and so on).
 * Orders that are Ready to Ship (RTD), Shipped, or within their expected date (0 days delay)
 * are NOT categorized as delinquent.
 */
export function isOrderDelinquent(
  orderDate?: string,
  expectedDate?: string,
  orderStatus?: string,
  currentStage?: string,
  explicitDaysDelayed?: number
): boolean {
  const normStage = (currentStage || '').toUpperCase();
  const normStatus = (orderStatus || '').toUpperCase();
  if (
    normStage === 'RTD' ||
    normStage === 'SHIPPED' ||
    normStatus === 'READY TO SHIP' ||
    normStatus === 'SHIPPED'
  ) {
    return false;
  }

  const delayDays = explicitDaysDelayed !== undefined && explicitDaysDelayed !== null
    ? explicitDaysDelayed
    : (orderDate ? calculateDelayDays(orderDate, expectedDate) : 0);

  return delayDays >= 1;
}

/**
 * Resolves accurate operational status:
 * - 'Ready to Ship' (RTD stage)
 * - 'Shipped' (Shipped stage)
 * - 'Delayed' (Genuinely delinquent: 1 or more days past expected date)
 * - 'In Production' (On track / within expected delivery timeframe)
 */
export function resolveOrderStatus(
  orderDate?: string,
  expectedDate?: string,
  currentStage?: string,
  explicitStatus?: string,
  explicitDaysDelayed?: number
): 'Delayed' | 'Ready to Ship' | 'Shipped' | 'In Production' {
  const normStage = (currentStage || '').toUpperCase();
  const normStatus = (explicitStatus || '').toUpperCase();

  if (normStage === 'RTD' || normStatus === 'READY TO SHIP') {
    return 'Ready to Ship';
  }
  if (normStage === 'SHIPPED' || normStatus === 'SHIPPED') {
    return 'Shipped';
  }

  const delayDays = explicitDaysDelayed !== undefined && explicitDaysDelayed !== null
    ? explicitDaysDelayed
    : (orderDate ? calculateDelayDays(orderDate, expectedDate) : 0);

  if (delayDays >= 1) {
    return 'Delayed';
  }

  return 'In Production';
}


/**
 * Normalizes any freeform stage text into one of the standardized Delinquency stages (ALL CAPS)
 */
export function normalizeStage(rawStage: string): DelinquencyStage {
  if (!rawStage) return 'PREPARATION';
  const clean = rawStage.trim().toLowerCase();

  if (clean.includes('cut') || clean.includes('click')) return 'CUTTING';
  if (clean.includes('clos') || clean.includes('stitch')) return 'CLOSING';
  if (clean.includes('upper')) return 'UPPER';
  if (clean.includes('prep') || clean.includes('queue') || clean.includes('confirm')) return 'PREPARATION';
  if (clean.includes('bottom') || clean.includes('last') || clean.includes('welt') || clean.includes('sole')) return 'BOTTOM';
  if (clean.includes('finish') || clean.includes('polish') || clean.includes('burnish')) return 'FINISH';
  if (clean.includes('qc') || clean.includes('inspect') || clean.includes('check')) return 'QC';
  if (clean.includes('rtd') || clean.includes('ready to ship') || clean.includes('ready to dispatch')) return 'RTD';
  if (clean.includes('ship') || clean.includes('transit') || clean.includes('dispatched')) return 'SHIPPED';
  if (clean.includes('hold') || clean.includes('shortage') || clean.includes('block')) return 'ON HOLD';

  const exactMatch = DELINQUENCY_STAGES.find(s => s.toLowerCase() === clean);
  if (exactMatch) return exactMatch;

  return 'OTHER';
}

/**
 * Returns Tailwind badge styling for each of the Delinquency stages
 */
export function getStageBadgeStyle(stage: string): string {
  const normalized = (stage || '').trim().toUpperCase();
  switch (normalized) {
    case 'CUTTING':
      return 'bg-blue-50 text-blue-800 border-blue-200';
    case 'CLOSING':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'PREPARATION':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'UPPER':
      return 'bg-violet-50 text-violet-900 border-violet-200';
    case 'BOTTOM':
      return 'bg-amber-50 text-amber-900 border-amber-200';
    case 'FINISH':
      return 'bg-teal-50 text-teal-800 border-teal-200';
    case 'QC':
      return 'bg-purple-50 text-purple-800 border-purple-200';
    case 'RTD':
      return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold';
    case 'SHIPPED':
      return 'bg-green-100 text-green-900 border-green-300';
    case 'ON HOLD':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'OTHER':
    default:
      return 'bg-neutral-100 text-neutral-800 border-neutral-200';
  }
}
