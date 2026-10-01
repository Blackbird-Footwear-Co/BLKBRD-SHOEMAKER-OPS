import { DelinquencyItem, ShopifyOrder, ReturnItem, DispatchItem, BostonStockItem, ShoeWidth, SHOE_WIDTHS } from '../types';
import { orderIdsMatch, normalizeOrderId } from './csvParser';
import { supabase } from '../services/supabaseClient';

export interface ExtractedShoeDetails {
  product: string;
  leather: string;
  last: string;
  sole: string;
  size: string;
  width: ShoeWidth;
  notes: string;
  warehouse: 'IN' | 'US';
  customerName?: string;
  trackingAwb?: string;
  productRecordFound?: boolean;
}

export interface ProductDatabaseRecord {
  modelName: string;
  defaultLeather: string;
  defaultLast: string;
  defaultSole: string;
  category: 'Loafer' | 'Boot' | 'Derby' | 'Oxford' | 'Monk' | 'Sneaker';
  availableLeathers: string[];
  availableLasts: string[];
  availableSoles: string[];
}

// Master Footwear Product Database Records for BLKBRD Shoemaker
export const PRODUCT_DATABASE_RECORDS: Record<string, ProductDatabaseRecord> = {
  henrik: {
    modelName: 'Henrik Penny Loafer',
    defaultLeather: 'Snuff Suede',
    defaultLast: 'Rui Last',
    defaultSole: 'Single Leather Sole',
    category: 'Loafer',
    availableLeathers: ['Snuff Suede', 'French Boxcalf Black', 'Museum Calf Espresso', 'Chocolate Suede'],
    availableLasts: ['Rui Last'],
    availableSoles: ['Single Leather Sole', 'Dainite Sole']
  },
  dixon: {
    modelName: 'Dixon Chukka Boot',
    defaultLeather: 'Museum Calf Espresso',
    defaultLast: 'Oscar Last',
    defaultSole: 'Dainite Studded Rubber',
    category: 'Boot',
    availableLeathers: ['Museum Calf Espresso', 'Snuff Repello Suede', 'Dark Brown Suede', 'French Boxcalf Black'],
    availableLasts: ['Oscar Last'],
    availableSoles: ['Dainite Studded Rubber', 'Vibram Commando']
  },
  rudyard: {
    modelName: 'Rudyard Split-Toe Derby',
    defaultLeather: 'French Boxcalf',
    defaultLast: 'Rui Last',
    defaultSole: 'Double Leather Sole',
    category: 'Derby',
    availableLeathers: ['French Boxcalf', 'Bordeaux Calf', 'French Boxcalf Burgundy', 'Snuff Suede', 'Dark Oak Crust'],
    availableLasts: ['Rui Last', 'Ben Last'],
    availableSoles: ['Double Leather Sole', 'Dainite Sole']
  },
  kenton: {
    modelName: 'Kenton Chelsea Boot',
    defaultLeather: 'Dark Oak Crust',
    defaultLast: 'Classic Last',
    defaultSole: 'Vibram Lug Sole',
    category: 'Boot',
    availableLeathers: ['Dark Oak Crust', 'French Boxcalf Black', 'Snuff Suede', 'Museum Calf Espresso'],
    availableLasts: ['Classic Last'],
    availableSoles: ['Vibram Lug Sole', 'Dainite Sole']
  },
  austen: {
    modelName: 'Austen Wingtip Oxford',
    defaultLeather: 'Chestnut Crust',
    defaultLast: 'Classic Last',
    defaultSole: 'Single Leather Sole',
    category: 'Oxford',
    availableLeathers: ['Chestnut Crust', 'Museum Calf Black', 'French Boxcalf Burgundy'],
    availableLasts: ['Classic Last'],
    availableSoles: ['Single Leather Sole', 'JR Leather Sole']
  },
  ben: {
    modelName: 'Ben Penny Loafer',
    defaultLeather: 'French Boxcalf',
    defaultLast: 'Ben Last',
    defaultSole: 'Single Leather Sole',
    category: 'Loafer',
    availableLeathers: ['French Boxcalf', 'Snuff Suede', 'Museum Calf Black'],
    availableLasts: ['Ben Last'],
    availableSoles: ['Single Leather Sole']
  },
  tassel: {
    modelName: 'Tassel Loafer',
    defaultLeather: 'Snuff Suede',
    defaultLast: 'Rui Last',
    defaultSole: 'Single Leather Sole',
    category: 'Loafer',
    availableLeathers: ['Snuff Suede', 'French Boxcalf Burgundy', 'French Boxcalf Black'],
    availableLasts: ['Rui Last'],
    availableSoles: ['Single Leather Sole']
  },
  oscar: {
    modelName: 'Oscar Service Boot',
    defaultLeather: 'Bourbon Shell Cordovan',
    defaultLast: 'Oscar Last',
    defaultSole: 'Vibram Commando',
    category: 'Boot',
    availableLeathers: ['Bourbon Shell Cordovan', 'Pull-up Leather', 'Roughout', 'French Boxcalf Black'],
    availableLasts: ['Oscar Last'],
    availableSoles: ['Vibram Commando', 'Dainite Studded Rubber']
  },
  rain: {
    modelName: 'Rain Balmoral Boot',
    defaultLeather: 'French Boxcalf Black',
    defaultLast: 'Rain Last',
    defaultSole: 'Dainite Sole',
    category: 'Boot',
    availableLeathers: ['French Boxcalf Black', 'Museum Calf Espresso', 'Black Suede'],
    availableLasts: ['Rain Last'],
    availableSoles: ['Dainite Sole', 'Double Leather Sole']
  },
  forest: {
    modelName: 'Forest Longwing Derby',
    defaultLeather: 'Country Grain',
    defaultLast: 'Forest Last',
    defaultSole: 'Dainite Rubber Sole',
    category: 'Derby',
    availableLeathers: ['Country Grain', 'Scotch Grain', 'French Boxcalf Dark Brown'],
    availableLasts: ['Forest Last'],
    availableSoles: ['Dainite Rubber Sole', 'Double Leather Sole']
  },
  robert: {
    modelName: 'Robert Plain Toe Derby',
    defaultLeather: 'French Boxcalf Black',
    defaultLast: 'Robert Last',
    defaultSole: 'Dainite Rubber Sole',
    category: 'Derby',
    availableLeathers: ['French Boxcalf Black', 'Museum Calf Espresso', 'Snuff Suede'],
    availableLasts: ['Robert Last'],
    availableSoles: ['Dainite Rubber Sole', 'Single Leather Sole']
  },
  simpson: {
    modelName: 'Simpson Adelaide Oxford',
    defaultLeather: 'Museum Calf Espresso',
    defaultLast: 'Simpson Last',
    defaultSole: 'JR Leather Sole',
    category: 'Oxford',
    availableLeathers: ['Museum Calf Espresso', 'French Boxcalf Black', 'Tan Crust'],
    availableLasts: ['Simpson Last'],
    availableSoles: ['JR Leather Sole', 'Single Leather Sole']
  },
  inca: {
    modelName: 'Inca Double Monk',
    defaultLeather: 'French Boxcalf Burgundy',
    defaultLast: 'Inca Last',
    defaultSole: 'Single Leather Sole',
    category: 'Monk',
    availableLeathers: ['French Boxcalf Burgundy', 'French Boxcalf Black', 'Museum Calf Espresso'],
    availableLasts: ['Inca Last'],
    availableSoles: ['Single Leather Sole', 'Dainite Sole']
  },
  soller: {
    modelName: 'Soller Jodhpur Boot',
    defaultLeather: 'Tan Crust',
    defaultLast: 'Soller Last',
    defaultSole: 'Single Leather Sole',
    category: 'Boot',
    availableLeathers: ['Tan Crust', 'French Boxcalf Black', 'Dark Brown Suede'],
    availableLasts: ['Soller Last'],
    availableSoles: ['Single Leather Sole', 'Dainite Sole']
  },
  detroit: {
    modelName: 'Detroit Wholecut Oxford',
    defaultLeather: 'Museum Calf Black',
    defaultLast: 'Detroit Last',
    defaultSole: 'JR Leather Sole',
    category: 'Oxford',
    availableLeathers: ['Museum Calf Black', 'French Boxcalf Dark Brown', 'Burgundy Crust'],
    availableLasts: ['Detroit Last'],
    availableSoles: ['JR Leather Sole', 'Single Leather Sole']
  },
  chisel: {
    modelName: 'Chisel Toe Oxford',
    defaultLeather: 'French Boxcalf Black',
    defaultLast: 'Chisel Last',
    defaultSole: 'Single Leather Sole',
    category: 'Oxford',
    availableLeathers: ['French Boxcalf Black', 'Chestnut Crust', 'Museum Calf Espresso'],
    availableLasts: ['Chisel Last'],
    availableSoles: ['Single Leather Sole']
  },
  softsquare: {
    modelName: 'Soft Square Captoe Oxford',
    defaultLeather: 'French Boxcalf Dark Brown',
    defaultLast: 'Soft Square Last',
    defaultSole: 'Single Leather Sole',
    category: 'Oxford',
    availableLeathers: ['French Boxcalf Dark Brown', 'French Boxcalf Black', 'Chestnut Crust'],
    availableLasts: ['Soft Square Last'],
    availableSoles: ['Single Leather Sole']
  }
};

/**
 * Resolves a footwear product's master specifications record from freeform text or model name.
 */
export function findProductDatabaseRecord(productOrText: string): ProductDatabaseRecord | null {
  const norm = (productOrText || '').toLowerCase().trim();
  if (!norm) return null;

  for (const [key, record] of Object.entries(PRODUCT_DATABASE_RECORDS)) {
    if (norm.includes(key) || norm.includes(record.modelName.toLowerCase())) {
      return record;
    }
  }

  // Fallbacks by footwear category keywords
  if (norm.includes('loafer')) return PRODUCT_DATABASE_RECORDS.henrik;
  if (norm.includes('chukka')) return PRODUCT_DATABASE_RECORDS.dixon;
  if (norm.includes('chelsea')) return PRODUCT_DATABASE_RECORDS.kenton;
  if (norm.includes('split-toe') || norm.includes('split toe') || norm.includes('derby')) return PRODUCT_DATABASE_RECORDS.rudyard;
  if (norm.includes('wingtip') || norm.includes('oxford')) return PRODUCT_DATABASE_RECORDS.austen;
  if (norm.includes('monk')) return PRODUCT_DATABASE_RECORDS.inca;
  if (norm.includes('boot')) return PRODUCT_DATABASE_RECORDS.dixon;

  return null;
}

export const COMMON_LEATHERS = [
  'Snuff Suede',
  'French Boxcalf Black',
  'Museum Calf Espresso',
  'French Boxcalf Burgundy',
  'French Boxcalf Dark Brown',
  'Museum Calf Black',
  'Chestnut Crust',
  'Dark Oak Crust',
  'Tan Crust',
  'Bourbon Shell Cordovan',
  'Chocolate Suede',
  'Dark Brown Suede',
  'Country Grain',
  'Scotch Grain',
  'Veg Tan Natural'
];

export const COMMON_LASTS = [
  'Rui Last',
  'Oscar Last',
  'Ben Last',
  'Classic Last',
  'Rain Last',
  'Inca Last',
  'Forest Last',
  'Robert Last',
  'Simpson Last',
  'Soller Last',
  'Detroit Last',
  'Soft Square Last',
  'Chisel Last'
];

export const COMMON_SOLES = [
  'Single Leather Sole',
  'Double Leather Sole',
  'JR Leather Sole',
  'Dainite Studded Rubber',
  'Dainite Sole',
  'Vibram Commando',
  'Vibram Lug Sole',
  'Half Rubber Sole',
  'City Lug Rubber'
];

// Known BLKBRD Leathers & Tanning materials
const KNOWN_LEATHERS = [
  'Museum Calf Espresso',
  'Museum Calf Black',
  'Museum Calf Plum',
  'French Boxcalf Black',
  'French Boxcalf Burgundy',
  'French Boxcalf Dark Brown',
  'French Boxcalf',
  'Boxcalf',
  'Box Calf',
  'Snuff Repello Suede',
  'Snuff Suede',
  'Dark Brown Suede',
  'Tobacco Suede',
  'Chocolate Suede',
  'Black Suede',
  'Suede',
  'Chestnut Crust',
  'Dark Oak Crust',
  'Tan Crust',
  'Burgundy Crust',
  'Crust',
  'Shell Cordovan',
  'Bourbon Shell Cordovan',
  'Color 8 Cordovan',
  'Cordovan',
  'Kudu Suede',
  'Waxed Kudu',
  'Kudu',
  'Pull-up Leather',
  'Pull-up',
  'Roughout',
  'Scotch Grain',
  'Alpine Grain',
  'Country Grain',
  'Pebble Grain',
  'Grain Leather',
  'Chromexcel',
  'Veg Tan',
  'Calfskin',
  'Calf'
];

// Known BLKBRD & Goodyear Welted Lasts
const KNOWN_LASTS = [
  'Rui Last',
  'Rui',
  'Oscar Last',
  'Oscar',
  'Ben Last',
  'Ben',
  'Classic Last',
  'Classic',
  'Inca Last',
  'Inca',
  'Rain Last',
  'Rain',
  'Forest Last',
  'Forest',
  'Robert Last',
  'Robert',
  'Simpson Last',
  'Simpson',
  'Soller Last',
  'Soller',
  'Detroit Last',
  'Detroit',
  'Alfil Last',
  'Alfil',
  'Round Toe Last',
  'Round Toe',
  'Chisel Last',
  'Chisel',
  'Soft Square Last',
  'Soft Square',
  'Square Toe Last'
];

// Known Soles
const KNOWN_SOLES = [
  'Dainite Studded Rubber',
  'Dainite Rubber Sole',
  'Dainite Sole',
  'Dainite',
  'Vibram Studded Sole',
  'Vibram Lug Sole',
  'Vibram Commando',
  'Vibram Rubber Sole',
  'Vibram Sole',
  'Vibram',
  'JR Leather Sole',
  'JR Rendenbach Sole',
  'JR Sole',
  'Single Leather Sole',
  'Double Leather Sole',
  'Leather Sole with Metal Toe Tap',
  'Leather Sole',
  'Commando Sole',
  'Half Rubber Sole',
  'City Rubber Sole',
  'Ridgeway Sole',
  'Crepe Sole',
  'Rubber Sole'
];

/**
 * Accurately extracts footwear size from product descriptions, line items, variant titles, and order notes.
 * Strictly avoids capturing order IDs (e.g. 40142), years (2026), quantities (x1), or prices.
 */
export function extractShoeSize(text: string, isLlcStore: boolean = false): string {
  if (!text) return '';
  const clean = text.trim();

  // 1. Dual formatted size e.g. "UK 9 / US 9.5", "UK 8.5 / US 9", "UK 8 / US 8.5", "US 9.5 / UK 9"
  const dualMatch = clean.match(/\b(UK\s*[0-9]+(?:\.[0-9]+)?\s*[\/\-]\s*US\s*[0-9]+(?:\.[0-9]+)?)\b/i) ||
                    clean.match(/\b(US\s*[0-9]+(?:\.[0-9]+)?\s*[\/\-]\s*UK\s*[0-9]+(?:\.[0-9]+)?)\b/i);
  if (dualMatch) {
    return dualMatch[1].toUpperCase().replace(/\s+/g, ' ');
  }

  // 2. Explicit UK Size e.g. "UK 8.5", "UK 8", "UK 9.5", "UK10", "UK-9.5", "UK: 8.5", "UK/8.5"
  const ukPrefixMatch = clean.match(/\bUK\s*[:\-\/\.]?\s*([4-9]|1[0-5])(?:\.([05]|50?))?\b/i);
  if (ukPrefixMatch) {
    const intPart = ukPrefixMatch[1];
    const decPart = ukPrefixMatch[2] ? `.${ukPrefixMatch[2][0]}` : '';
    const num = `${intPart}${decPart}`;
    return `UK ${num.endsWith('.0') ? num.slice(0, -2) : num}`;
  }

  // 3. Explicit US Size e.g. "US 9.5", "US 10", "US 10.5", "US-11", "US: 9.5", "US/10"
  const usPrefixMatch = clean.match(/\bUS\s*[:\-\/\.]?\s*([4-9]|1[0-6])(?:\.([05]|50?))?\b/i);
  if (usPrefixMatch) {
    const intPart = usPrefixMatch[1];
    const decPart = usPrefixMatch[2] ? `.${usPrefixMatch[2][0]}` : '';
    const num = `${intPart}${decPart}`;
    return `US ${num.endsWith('.0') ? num.slice(0, -2) : num}`;
  }

  // 4. Postfix UK e.g. "8.5 UK", "9 UK", "8.5UK", "10-UK"
  const ukPostfixMatch = clean.match(/\b([4-9]|1[0-5])(?:\.([05]|50?))?\s*[\-]?\s*UK\b/i);
  if (ukPostfixMatch) {
    const intPart = ukPostfixMatch[1];
    const decPart = ukPostfixMatch[2] ? `.${ukPostfixMatch[2][0]}` : '';
    const num = `${intPart}${decPart}`;
    return `UK ${num.endsWith('.0') ? num.slice(0, -2) : num}`;
  }

  // 5. Postfix US e.g. "9.5 US", "10 US", "10.5US", "11-US"
  const usPostfixMatch = clean.match(/\b([4-9]|1[0-6])(?:\.([05]|50?))?\s*[\-]?\s*US\b/i);
  if (usPostfixMatch) {
    const intPart = usPostfixMatch[1];
    const decPart = usPostfixMatch[2] ? `.${usPostfixMatch[2][0]}` : '';
    const num = `${intPart}${decPart}`;
    return `US ${num.endsWith('.0') ? num.slice(0, -2) : num}`;
  }

  // 6. Explicit EU Size e.g. "EU 42", "EU 43", "42 EU"
  const euMatch = clean.match(/\bEU\s*[:\-\/]?\s*(3[6-9]|4[0-9])\b/i) || clean.match(/\b(3[6-9]|4[0-9])\s*EU\b/i);
  if (euMatch) {
    return `EU ${euMatch[1]}`;
  }

  // 7. Explicit "Size: 9.5" or "Size 8.5" or "Size - 10" (size numbers strictly in footwear range 4 - 15)
  const sizeExplicitMatch = clean.match(/\bsize\s*[:=\-\/]?\s*(?:UK|US)?\s*([4-9]|1[0-5])(?:\.([05]|50?))?\s*(?:UK|US)?\b/i);
  if (sizeExplicitMatch) {
    const intPart = sizeExplicitMatch[1];
    const decPart = sizeExplicitMatch[2] ? `.${sizeExplicitMatch[2][0]}` : '';
    const num = `${intPart}${decPart}`;
    const prefix = isLlcStore || clean.toUpperCase().includes('US') ? 'US' : 'UK';
    return `${prefix} ${num.endsWith('.0') ? num.slice(0, -2) : num}`;
  }

  // 8. In Shopify variant format e.g. "Snuff Suede / 8.5 / E" or "Black / 9 / EE"
  const slashSegments = clean.split(/[\/,\|\(\)]/);
  for (const seg of slashSegments) {
    const s = seg.trim();
    const tokenMatch = s.match(/^([4-9]|1[0-5])(?:\.([05]|50?))?$/);
    if (tokenMatch) {
      const intPart = tokenMatch[1];
      const decPart = tokenMatch[2] ? `.${tokenMatch[2][0]}` : '';
      const num = `${intPart}${decPart}`;
      const prefix = isLlcStore ? 'US' : 'UK';
      return `${prefix} ${num.endsWith('.0') ? num.slice(0, -2) : num}`;
    }
  }

  return '';
}

/**
 * Extracts structured footwear attributes from freeform product strings, line items, and notes.
 * Automatically enriches with associated Product Database Records.
 */
export function extractShoeDetailsFromText(
  rawText: string = '',
  rawNotes: string = '',
  rawSizeHint: string = '',
  isLlcStore: boolean = false
): {
  product: string;
  leather: string;
  last: string;
  sole: string;
  size: string;
  width: ShoeWidth;
  notes: string;
  productRecordFound: boolean;
} {
  const combined = `${rawText} ${rawNotes}`.trim();

  // 1. EXTRACT SIZE
  let size = rawSizeHint ? rawSizeHint.trim() : '';
  if (!size) {
    size = extractShoeSize(combined, isLlcStore);
  }
  if (!size) {
    size = extractShoeSize(rawText, isLlcStore);
  }
  if (!size && rawNotes) {
    size = extractShoeSize(rawNotes, isLlcStore);
  }

  // If size is still not found, provide clean default so field is not blank
  if (!size) {
    size = isLlcStore ? 'US 9.5' : 'UK 9 / US 9.5';
  }

  // 2. EXTRACT WIDTH: ['E', 'EE', 'EEE', '4E', 'More than 4E']
  let width: ShoeWidth = 'E';
  if (/\b(?:more than 4e|5e|6e|extra extra wide)\b/i.test(combined)) {
    width = 'More than 4E';
  } else if (/\b(?:4e|eeee|extra wide 4e)\b/i.test(combined)) {
    width = '4E';
  } else if (/\b(?:eee|triple e|3e|wide eee)\b/i.test(combined)) {
    width = 'EEE';
  } else if (/\b(?:ee|double e|2e|wide ee)\b/i.test(combined)) {
    width = 'EE';
  } else if (/\b(?:width[:\s]+e|wide e|fitting e)\b/i.test(combined)) {
    width = 'E';
  }

  // 3. EXTRACT PRODUCT NAME
  let product = rawText.trim();
  let candidateLeatherFromProduct = '';
  if (product.includes(' - ')) {
    const parts = product.split(' - ');
    product = parts[0].trim();
    if (parts.length > 1) {
      const subParts = parts[1].split(/[\/\(]/);
      const possibleLeather = subParts[0].trim();
      if (possibleLeather && !possibleLeather.toLowerCase().includes('size') && !possibleLeather.toLowerCase().match(/\buk|\bus\b/i)) {
        candidateLeatherFromProduct = possibleLeather;
      }
    }
  } else if (product.includes(' / ')) {
    const parts = product.split(' / ');
    product = parts[0].trim();
  }

  // Clean trailing parentheses or size tags from product
  product = product
    .replace(/\s*\([^)]*size[^)]*\)/gi, '')
    .replace(/\s*-\s*size.*$/gi, '')
    .trim();

  // 4. LOOKUP ASSOCIATED PRODUCT DATABASE RECORD
  const productRecord = findProductDatabaseRecord(product || combined);
  if (productRecord && (!product || product === 'BLKBRD Goodyear Welted' || product === 'Footwear')) {
    product = productRecord.modelName;
  }
  if (!product) {
    product = productRecord ? productRecord.modelName : 'BLKBRD Goodyear Welted';
  }

  // 5. EXTRACT LEATHER (Pre-filled from Product Details if not explicit)
  let leather = '';
  const explicitLeatherMatch = combined.match(/\b(?:leather|material|upper|color)[:\s]+([A-Za-z0-9\s-]+?)(?:[;,/]|$|\n|\()/i);
  if (explicitLeatherMatch && explicitLeatherMatch[1].trim()) {
    leather = explicitLeatherMatch[1].trim();
  } else if (candidateLeatherFromProduct) {
    leather = candidateLeatherFromProduct;
  } else {
    for (const kl of KNOWN_LEATHERS) {
      const escaped = kl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(combined)) {
        leather = kl;
        break;
      }
    }
  }
  // If leather is not in text, auto-fill from the associated Product's database record
  if (!leather && productRecord) {
    leather = productRecord.defaultLeather;
  }
  if (!leather) {
    leather = 'French Boxcalf';
  }

  // 6. EXTRACT LAST (Pre-filled from Product Details if not explicit)
  let last = '';
  const explicitLastMatch = combined.match(/\b(?:last)[:\s]+([A-Za-z0-9\s-]+?)(?:[;,/]|$|\n|\()/i);
  if (explicitLastMatch && explicitLastMatch[1].trim()) {
    const candidate = explicitLastMatch[1].trim();
    last = candidate.toLowerCase().endsWith('last') ? candidate : `${candidate} Last`;
  } else {
    for (const kl of KNOWN_LASTS) {
      const escaped = kl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(combined)) {
        last = kl.toLowerCase().endsWith('last') ? kl : `${kl} Last`;
        break;
      }
    }
  }
  // If last is not in text, auto-fill from the associated Product's database record
  if (!last && productRecord) {
    last = productRecord.defaultLast;
  }
  if (!last) {
    last = 'Classic Last';
  }

  // 7. EXTRACT SOLE (Pre-filled from Product Details if not explicit)
  let sole = '';
  const explicitSoleMatch = combined.match(/\b(?:sole)[:\s]+([A-Za-z0-9\s-]+?)(?:[;,/]|$|\n|\()/i);
  if (explicitSoleMatch && explicitSoleMatch[1].trim()) {
    const candidate = explicitSoleMatch[1].trim();
    sole = candidate.toLowerCase().endsWith('sole') ? candidate : `${candidate} Sole`;
  } else {
    for (const ks of KNOWN_SOLES) {
      const escaped = ks.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(combined)) {
        sole = ks;
        break;
      }
    }
  }
  // If sole is not in text, auto-fill from the associated Product's database record
  if (!sole && productRecord) {
    sole = productRecord.defaultSole;
  }
  if (!sole) {
    sole = 'Single Leather Sole';
  }

  return {
    product,
    leather,
    last,
    sole,
    size,
    width,
    notes: rawNotes.trim(),
    productRecordFound: !!productRecord
  };
}

export interface ShoeLookupContext {
  delinquencies?: DelinquencyItem[];
  shopifyOrders?: ShopifyOrder[];
  returns?: ReturnItem[];
  dispatches?: DispatchItem[];
  bostonStock?: BostonStockItem[];
}

/**
 * Synchronous lookup: Searches across all database collections to resolve and pre-fill structured parameters
 * for logging/updating return inventory using Product Database Records.
 */
export function lookupAndExtractShoeDetails(
  orderId: string,
  context: ShoeLookupContext = {}
): ExtractedShoeDetails {
  const cleanId = String(orderId || '').replace(/^#/, '').trim();
  const isLlc = cleanId.toUpperCase().startsWith('US') || cleanId.toUpperCase().includes('USBLKBRD');
  const defaultWarehouse: 'IN' | 'US' = isLlc ? 'US' : 'IN';

  if (!cleanId) {
    return {
      product: 'Henrik Penny Loafer',
      leather: 'Snuff Suede',
      last: 'Rui Last',
      sole: 'Single Leather Sole',
      size: 'UK 9 / US 9.5',
      width: 'E',
      notes: '',
      warehouse: defaultWarehouse,
      productRecordFound: false
    };
  }

  // 1. Search in Delinquencies
  const delinquency = context.delinquencies?.find(d => orderIdsMatch(d.orderId, cleanId));

  // 2. Search in Shopify Orders
  const shopify = context.shopifyOrders?.find(
    s => orderIdsMatch(s.orderNumber, cleanId) || orderIdsMatch(s.id, cleanId)
  );

  // 3. Search in Returns (Global & LLC)
  const returnRecord = context.returns?.find(
    r => orderIdsMatch(r.oldOrderId, cleanId) || (r.newOrderId && orderIdsMatch(r.newOrderId, cleanId))
  );

  // 4. Search in Dispatches
  const dispatch = context.dispatches?.find(dp => orderIdsMatch(dp.orderNumber, cleanId));

  // 5. Search in Boston Stock
  const boston = context.bostonStock?.find(b => orderIdsMatch(b.originalOrderId, cleanId));

  // Collect text sources
  const productTextCandidates = [
    delinquency?.product,
    delinquency?.shoeStyle,
    shopify?.lineItems,
    boston?.shoeModel,
    dispatch?.notes?.replace(/^Product:\s*/i, ''),
    returnRecord?.notes
  ].filter(Boolean) as string[];

  const rawProductText = productTextCandidates[0] || '';

  const notesCandidates = [
    delinquency?.remarks,
    shopify?.notes,
    boston?.notes,
    returnRecord?.notes,
    dispatch?.trackingDetails
  ].filter(Boolean) as string[];

  const combinedNotes = notesCandidates.join(' | ');

  const sizeHint =
    returnRecord?.oldSize ||
    (returnRecord as any)?.old_size ||
    boston?.size ||
    extractShoeSize(shopify?.lineItems || '', isLlc) ||
    extractShoeSize(delinquency?.product || '', isLlc) ||
    extractShoeSize(delinquency?.remarks || '', isLlc) ||
    extractShoeSize(shopify?.notes || '', isLlc) ||
    extractShoeSize(dispatch?.notes || '', isLlc) ||
    extractShoeSize(dispatch?.trackingDetails || '', isLlc) ||
    '';

  const parsed = extractShoeDetailsFromText(rawProductText, combinedNotes, sizeHint, isLlc);

  // If Boston Stock has dedicated attributes
  if (boston?.colorLeather && !parsed.leather) {
    parsed.leather = boston.colorLeather;
  }
  if (boston?.widthOrLast && !parsed.last) {
    parsed.last = boston.widthOrLast;
  }

  // Warehouse resolution: US if LLC or Boston Stock, else IN
  const warehouse: 'IN' | 'US' =
    returnRecord?.storeTab === 'LLC' ||
    delinquency?.storeTab === 'LLC' ||
    shopify?.storeAccount === 'LLC' ||
    isLlc ||
    !!boston
      ? 'US'
      : 'IN';

  const customerName =
    delinquency?.customerName ||
    delinquency?.clientName ||
    shopify?.customerName ||
    returnRecord?.clientName ||
    boston?.clientName ||
    '';

  const trackingAwb =
    returnRecord?.incomingTrackingNo ||
    dispatch?.outgoingTrackingAwb ||
    '';

  return {
    ...parsed,
    warehouse,
    customerName,
    trackingAwb
  };
}

/**
 * Asynchronous database query: queries live Supabase tables to fetch the associated order's
 * product database record and automatically pre-fill Product, Leather, Last, Sole, and Size.
 */
export async function lookupOrderProductDetailsAsync(
  orderId: string,
  context: ShoeLookupContext = {}
): Promise<ExtractedShoeDetails> {
  const cleanId = String(orderId || '').replace(/^#/, '').trim();
  if (!cleanId) {
    return lookupAndExtractShoeDetails(orderId, context);
  }

  // First, check local context
  const localDetails = lookupAndExtractShoeDetails(cleanId, context);
  if (localDetails.customerName && localDetails.product && localDetails.product !== 'BLKBRD Goodyear Welted') {
    return localDetails;
  }

  // Query live Supabase records across order tables
  try {
    const [globalDelinq, llcDelinq, shopifyRes, dispatchRes] = await Promise.all([
      supabase.from('delinquency_global').select('*').eq('order_id', cleanId),
      supabase.from('delinquency_llc').select('*').eq('order_id', cleanId),
      supabase.from('shopify_orders').select('*').eq('order_number', cleanId),
      supabase.from('daily_dispatches').select('*').eq('order_id', cleanId)
    ]);

    const liveRecord = (globalDelinq.data as any)?.[0] || (llcDelinq.data as any)?.[0] || (shopifyRes.data as any)?.[0] || (dispatchRes.data as any)?.[0];
    if (liveRecord) {
      const rawProduct = liveRecord.product || liveRecord.line_items || liveRecord.shoe_model || '';
      const rawNotes = liveRecord.remarks || liveRecord.notes || '';
      const customer = liveRecord.customer_name || liveRecord.client_name || '';
      const tracking = liveRecord.outgoing_tracking_awb || liveRecord.tracking_awb || '';
      const isLlc = (globalDelinq.data && globalDelinq.data.length > 0 ? false : !!(llcDelinq.data && llcDelinq.data.length > 0)) || cleanId.toUpperCase().startsWith('US');

      const liveSizeHint =
        liveRecord.old_size ||
        liveRecord.size ||
        extractShoeSize(rawProduct, isLlc) ||
        extractShoeSize(rawNotes, isLlc) ||
        localDetails.size;

      const parsed = extractShoeDetailsFromText(rawProduct, rawNotes, liveSizeHint, isLlc);
      return {
        ...parsed,
        customerName: customer || localDetails.customerName,
        trackingAwb: tracking || localDetails.trackingAwb,
        warehouse: isLlc ? 'US' : 'IN'
      };
    }
  } catch (err) {
    console.warn('Live database lookup notice:', err);
  }

  return localDetails;
}

