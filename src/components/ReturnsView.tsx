/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ReturnItem, BostonStockItem, UserRole, ShoeWidth, SHOE_WIDTHS, ReturnStockItem } from '../types';
import {
  Edit2,
  Save,
  X,
  Plus,
  Warehouse,
  Search,
  ExternalLink,
  Copy,
  Check,
  Download,
  Sparkles,
  Package,
  Layers,
  CheckCircle2,
  Clock,
  RotateCcw,
  Undo2,
  RefreshCw,
  ArrowRight,
  ArrowUpRight,
  SlidersHorizontal,
  Info,
  ChevronDown,
  ShoppingBag,
  LayoutGrid,
  List,
  Truck,
  Tag,
  Calendar,
  AlertCircle,
  Wrench,
  ArrowLeftRight,
  User,
  ShieldCheck
} from 'lucide-react';
import { exportToCsv, formatBlkbrdOrderId } from '../utils/csvParser';
import { supabase } from '../services/supabaseClient';
import { resolveCustomerName } from '../utils/customerResolver';
import {
  fetchReturns,
  insertReturn,
  updateReturn,
  fetchReturnStock,
  insertReturnStock,
  updateReturnStock
} from '../services/supabaseReturnsService';
import {
  lookupAndExtractShoeDetails,
  lookupOrderProductDetailsAsync,
  COMMON_LEATHERS,
  COMMON_LASTS,
  COMMON_SOLES,
  PRODUCT_DATABASE_RECORDS
} from '../utils/shoeDetailsExtractor';
import { getDelinquencies, getShopifyOrders, getDispatches, getBostonStock } from '../services/store';

interface ReturnsViewProps {
  role: UserRole;
  bostonStockItems?: BostonStockItem[];
  bostonStock?: BostonStockItem[];
  delinquencies?: any[];
  shopifyOrders?: any[];
  dispatches?: any[];
  returns?: any[];
  onUpdateBostonStockItem?: (item: BostonStockItem) => void;
  onUpdateBostonStock?: (item: BostonStockItem) => void;
  onAddBostonStockItem?: (item: Omit<BostonStockItem, 'id' | 'sNo'>) => void;
  onAddBostonStock?: (item: Omit<BostonStockItem, 'id' | 'sNo'>) => void;
  onAddReturn?: (newItem: any) => Promise<void> | void;
  onUpdateReturn?: (updated: any) => Promise<void> | void;
  onRefreshAll?: () => void;
  onViewOrderSummary?: (orderId: string) => void;
}

const AGENT_NAMES = [
  'Logistics Desk',
  'Agent Vikram',
  'Agent Priya',
  'Agent Sarah',
  'Agent Mike',
  'CRM Desk'
];

export function extractShoeDetailsFromReturn(item: any, lookupContext?: any) {
  const remarks = item.remarks || item.notes || '';
  const prodMatch = remarks.match(/Product:\s*([^•|\]]+)/i);
  const leatherMatch = remarks.match(/Leather:\s*([^•|\]]+)/i);
  const lastMatch = remarks.match(/Last:\s*([^•|\]]+)/i);
  const soleMatch = remarks.match(/Sole:\s*([^•|\]]+)/i);
  const widthMatch = remarks.match(/Width:\s*([^•|\]]+)/i);

  if (prodMatch || leatherMatch) {
    return {
      product: prodMatch?.[1]?.trim() || item.product || 'BLKBRD Goodyear Welted',
      leather: leatherMatch?.[1]?.trim() || 'French Boxcalf',
      last: lastMatch?.[1]?.trim() || 'Classic Last',
      sole: soleMatch?.[1]?.trim() || 'Single Leather Sole',
      width: (widthMatch?.[1]?.trim() as ShoeWidth) || 'E'
    };
  }

  const orderId = item.old_order_id || item.oldOrderId || item.new_order_id || item.newOrderId || '';
  const details = lookupAndExtractShoeDetails(orderId, lookupContext);
  return {
    product: details.product || 'BLKBRD Goodyear Welted',
    leather: details.leather || 'French Boxcalf',
    last: details.last || 'Classic Last',
    sole: details.sole || 'Single Leather Sole',
    width: (details.width as ShoeWidth) || 'E'
  };
}

export const ReturnsView: React.FC<ReturnsViewProps> = ({
  role,
  bostonStock,
  delinquencies,
  shopifyOrders,
  dispatches,
  returns: propReturns,
  onAddReturn,
  onUpdateReturn,
  onRefreshAll,
  onViewOrderSummary
}) => {
  const [globalReturns, setGlobalReturns] = useState<any[]>([]);
  const [llcReturns, setLlcReturns] = useState<any[]>([]);
  const [returnStockList, setReturnStockList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_TRANSIT' | 'RECEIVED' | 'EXCHANGE' | 'REPAIR'>('ALL');
  const [copiedAwb, setCopiedAwb] = useState<string | null>(null);

  const [storeTab, setStoreTab] = useState<'Global' | 'LLC' | 'Stock'>('Global');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [isAdding, setIsAdding] = useState(false);

  // Executive KPI summary stats for current returns store tab
  const stats = useMemo(() => {
    const list = storeTab === 'LLC' ? llcReturns : globalReturns;
    const total = list.length;
    const inTransit = list.filter(r => (r.return_received || '').toUpperCase() !== 'Y').length;
    const received = list.filter(r => (r.return_received || '').toUpperCase() === 'Y').length;
    const pendingExchange = list.filter(r => (r.return_type || '').toLowerCase() === 'exchange' && (r.replacement_done || '').toUpperCase() !== 'Y').length;
    const repairCount = list.filter(r => {
      const text = `${r.reason || ''} ${r.remarks || ''} ${r.return_type || ''}`.toLowerCase();
      return text.includes('repair') || text.includes('rework') || text.includes('resole') || text.includes('defect');
    }).length;
    return { total, inTransit, received, pendingExchange, repairCount };
  }, [globalReturns, llcReturns, storeTab]);

  // Dedicated Order Search state for Return Creation
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [isOrderSearchDropdownOpen, setIsOrderSearchDropdownOpen] = useState(false);
  const orderSearchRef = useRef<HTMLDivElement>(null);

  // Return Stock inline edit state
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [stockEditForm, setStockEditForm] = useState<any>({});

  // Quick Modal for logging/updating inventory directly from any return
  const [inventoryModalItem, setInventoryModalItem] = useState<any | null>(null);
  const [inventoryModalForm, setInventoryModalForm] = useState<{
    orderId: string;
    product: string;
    leather: string;
    last: string;
    sole: string;
    size: string;
    width: ShoeWidth;
    notes: string;
    receivingDate: string;
    warehouse: 'IN' | 'US';
    customization: string;
    customizationRemark: string;
    returnTrackingAwb: string;
  }>({
    orderId: '',
    product: '',
    leather: '',
    last: '',
    sole: '',
    size: '',
    width: 'E',
    notes: '',
    receivingDate: new Date().toISOString().split('T')[0],
    warehouse: 'IN',
    customization: 'N',
    customizationRemark: '',
    returnTrackingAwb: ''
  });

  // Return Add Form State with comprehensive inventory parameters
  const [newReturnForm, setNewReturnForm] = useState({
    clientName: '',
    returnType: 'Exchange',
    reason: 'Size',
    oldOrderId: '',
    newOrderId: '',
    oldSize: '',
    newSize: '',
    returnReceived: 'N',
    receivingWarehouse: 'IN' as 'IN' | 'US',
    stockProduct: '',
    stockLeather: '',
    stockLast: '',
    stockSole: '',
    stockSize: '',
    stockWidth: 'E' as ShoeWidth,
    stockNotes: '',
    stockCustomization: 'N' as 'N' | 'Y',
    stockCustomizationRemark: '',
    status: 'Open',
    replacementDone: 'N',
    initiatedDate: new Date().toISOString().split('T')[0],
    newTargetDate: '',
    incomingCourier: 'Delhivery',
    incomingTrackingNo: '',
    exchangeTracking: '',
    region: 'Domestic',
    country: 'India',
    createdBy: 'Logistics Desk',
    notes: ''
  });

  // Stock Add Form State
  const [isAddingStock, setIsAddingStock] = useState(false);
  const [newStockForm, setNewStockForm] = useState({
    receivingDate: new Date().toISOString().split('T')[0],
    orderId: '',
    product: '',
    itemName: 'BLKBRD Goodyear Welted',
    leather: '',
    last: '',
    sole: '',
    size: 'UK 9 / US 9.5',
    width: 'E' as ShoeWidth,
    notes: '',
    customization: 'N',
    customizationRemark: '',
    returnTrackingAwb: '',
    warehouse: 'IN' as 'IN' | 'US'
  });

  // Track original fetched values for new return to enable editing & resetting
  const [fetchedBaseline, setFetchedBaseline] = useState<{
    product: string;
    leather: string;
    last: string;
    sole: string;
    size: string;
    width: ShoeWidth;
    customerName?: string;
    trackingNo?: string;
  } | null>(null);

  // Auto-fetch feedback state
  const [isFetchingOrderDetails, setIsFetchingOrderDetails] = useState(false);
  const [orderFetchFeedback, setOrderFetchFeedback] = useState<string | null>(null);

  // Inventory modal auto-fetch and baseline state
  const [inventoryFetchedBaseline, setInventoryFetchedBaseline] = useState<{
    product: string;
    leather: string;
    last: string;
    sole: string;
    size: string;
    width: ShoeWidth;
  } | null>(null);
  const [isFetchingInventoryDetails, setIsFetchingInventoryDetails] = useState(false);
  const [inventoryFetchFeedback, setInventoryFetchFeedback] = useState<string | null>(null);

  // Inline edit auto-fetch states
  const [isFetchingInlineEdit, setIsFetchingInlineEdit] = useState(false);
  const [isFetchingStockInlineEdit, setIsFetchingStockInlineEdit] = useState(false);

  // Available database orders for auto-selection in return creation flow
  const availableOrdersForSelection = useMemo(() => {
    const map = new Map<string, {
      orderId: string;
      customerName: string;
      product: string;
      source: string;
      storeAccount: 'Global' | 'LLC';
      date?: string;
      status?: string;
    }>();

    (shopifyOrders || []).forEach(s => {
      const clean = String(s.orderNumber || s.id || '').replace(/^#/, '').trim();
      if (clean && !map.has(clean)) {
        const isLlc = s.storeAccount === 'LLC' || clean.toUpperCase().startsWith('US') || clean.toUpperCase().includes('USBLKBRD');
        map.set(clean, {
          orderId: clean,
          customerName: s.customerName || '',
          product: s.lineItems || 'Footwear',
          source: isLlc ? 'Shopify US (LLC)' : 'Shopify Global',
          storeAccount: isLlc ? 'LLC' : 'Global',
          date: s.createdAt ? String(s.createdAt).slice(0, 10) : undefined,
          status: s.fulfillmentStatus || s.workshopStatus || 'Shopify'
        });
      }
    });

    (delinquencies || []).forEach(d => {
      const clean = String(d.orderId || '').replace(/^#/, '').trim();
      if (clean && !map.has(clean)) {
        const isLlc = d.storeTab === 'LLC' || clean.toUpperCase().startsWith('US') || clean.toUpperCase().includes('USBLKBRD');
        map.set(clean, {
          orderId: clean,
          customerName: d.customerName || d.clientName || '',
          product: d.product || d.shoeStyle || 'Footwear',
          source: isLlc ? 'LLC Delinquency' : 'Global Delinquency',
          storeAccount: isLlc ? 'LLC' : 'Global',
          date: d.dateOfOrder || d.orderDate,
          status: d.status || 'Delinquency'
        });
      }
    });

    (dispatches || []).forEach(dp => {
      const clean = String(dp.orderNumber || '').replace(/^#/, '').trim();
      if (clean && !map.has(clean)) {
        const isLlc = clean.toUpperCase().startsWith('US') || clean.toUpperCase().includes('USBLKBRD');
        map.set(clean, {
          orderId: clean,
          customerName: dp.customerName || '',
          product: dp.notes?.replace(/^Product:\s*/i, '') || 'Footwear',
          source: 'Dispatches',
          storeAccount: isLlc ? 'LLC' : 'Global',
          date: dp.dispatchDate,
          status: 'Dispatched'
        });
      }
    });

    [...globalReturns, ...llcReturns, ...(propReturns || [])].forEach(r => {
      const clean = String(r.old_order_id || r.oldOrderId || '').replace(/^#/, '').trim();
      if (clean && !map.has(clean)) {
        const isLlc = r.storeTab === 'LLC' || clean.toUpperCase().startsWith('US') || clean.toUpperCase().includes('USBLKBRD');
        map.set(clean, {
          orderId: clean,
          customerName: r.client_name || r.customer_name || r.clientName || '',
          product: r.remarks || 'Footwear',
          source: isLlc ? 'LLC Returns' : 'Global Returns',
          storeAccount: isLlc ? 'LLC' : 'Global',
          status: r.status || 'Return'
        });
      }
    });

    (bostonStock || []).forEach(b => {
      const clean = String(b.originalOrderId || '').replace(/^#/, '').trim();
      if (clean && !map.has(clean)) {
        map.set(clean, {
          orderId: clean,
          customerName: b.clientName || '',
          product: b.shoeModel || 'Footwear',
          source: 'Boston Stock',
          storeAccount: 'LLC',
          status: 'In Stock'
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.orderId.localeCompare(b.orderId));
  }, [delinquencies, shopifyOrders, dispatches, globalReturns, llcReturns, propReturns, bostonStock]);

  // Filtered orders matching the dedicated search query
  const searchedOrdersForReturn = useMemo(() => {
    if (!orderSearchQuery.trim()) return availableOrdersForSelection.slice(0, 10);
    const q = orderSearchQuery.toLowerCase().trim().replace(/^#/, '');
    return availableOrdersForSelection.filter(o => {
      const matchId = o.orderId.toLowerCase().includes(q);
      const matchCustomer = (o.customerName || '').toLowerCase().includes(q);
      const matchProduct = (o.product || '').toLowerCase().includes(q);
      const matchSource = (o.source || '').toLowerCase().includes(q);
      return matchId || matchCustomer || matchProduct || matchSource;
    }).slice(0, 20);
  }, [availableOrdersForSelection, orderSearchQuery]);

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (orderSearchRef.current && !orderSearchRef.current.contains(e.target as Node)) {
        setIsOrderSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-fetch helper for Return Logging - accurately extracts Product, Leather, Last, Sole, and Size
  const handleAutoFetchReturnDetails = async (orderIdToFetch?: string) => {
    const rawTarget = orderIdToFetch !== undefined ? orderIdToFetch : newReturnForm.oldOrderId;
    const targetId = String(rawTarget || '').replace(/^#/, '').trim();
    if (!targetId) return;

    setIsFetchingOrderDetails(true);
    try {
      const details = await lookupOrderProductDetailsAsync(targetId, {
        delinquencies: delinquencies?.length ? delinquencies : getDelinquencies(),
        shopifyOrders: shopifyOrders?.length ? shopifyOrders : getShopifyOrders(),
        returns: [...globalReturns, ...llcReturns, ...(propReturns || [])],
        dispatches: dispatches?.length ? dispatches : getDispatches(),
        bostonStock: bostonStock?.length ? bostonStock : getBostonStock()
      });

      setFetchedBaseline({
        product: details.product,
        leather: details.leather,
        last: details.last,
        sole: details.sole,
        size: details.size || '',
        width: details.width || 'E',
        customerName: details.customerName,
        trackingNo: details.trackingAwb
      });

      setNewReturnForm(prev => ({
        ...prev,
        oldOrderId: targetId,
        clientName: details.customerName || prev.clientName || '',
        oldSize: details.size || prev.oldSize || '',
        incomingTrackingNo: details.trackingAwb || prev.incomingTrackingNo || '',
        receivingWarehouse: details.warehouse,
        stockProduct: details.product,
        stockLeather: details.leather,
        stockLast: details.last,
        stockSole: details.sole,
        stockSize: details.size || prev.oldSize || '',
        stockWidth: details.width || 'E',
        stockNotes: details.notes || prev.notes || '',
        country: details.warehouse === 'US' ? 'USA' : prev.country || 'India',
        region: details.warehouse === 'US' ? 'International' : prev.region || 'Domestic'
      }));

      setOrderFetchFeedback(`Auto-filled: ${details.product} (${details.leather} • ${details.last} • ${details.sole} • ${details.size}) — You can manually modify any field.`);
      setTimeout(() => setOrderFetchFeedback(null), 6000);
    } catch (err) {
      console.warn('Auto-fetch return error:', err);
    } finally {
      setIsFetchingOrderDetails(false);
    }
  };

  // Handler when an order is selected from the search dropdown
  const handleSelectOrderForReturn = (order: { orderId: string; customerName: string; product: string; storeAccount: 'Global' | 'LLC' }) => {
    setIsOrderSearchDropdownOpen(false);
    setOrderSearchQuery(`#${order.orderId} - ${order.customerName || order.product}`);
    
    // Check if storeTab matches
    if (order.storeAccount === 'LLC' && storeTab !== 'LLC') {
      setStoreTab('LLC');
    } else if (order.storeAccount === 'Global' && storeTab === 'LLC') {
      setStoreTab('Global');
    }

    setNewReturnForm(prev => ({
      ...prev,
      oldOrderId: order.orderId,
      clientName: order.customerName || prev.clientName,
      receivingWarehouse: order.storeAccount === 'LLC' ? 'US' : 'IN'
    }));

    handleAutoFetchReturnDetails(order.orderId);
  };

  const handleResetReturnFieldToFetched = (field: 'product' | 'leather' | 'last' | 'sole' | 'size' | 'width') => {
    if (!fetchedBaseline) return;
    if (field === 'product') setNewReturnForm(p => ({ ...p, stockProduct: fetchedBaseline.product }));
    if (field === 'leather') setNewReturnForm(p => ({ ...p, stockLeather: fetchedBaseline.leather }));
    if (field === 'last') setNewReturnForm(p => ({ ...p, stockLast: fetchedBaseline.last }));
    if (field === 'sole') setNewReturnForm(p => ({ ...p, stockSole: fetchedBaseline.sole }));
    if (field === 'size') setNewReturnForm(p => ({ ...p, stockSize: fetchedBaseline.size, oldSize: fetchedBaseline.size }));
    if (field === 'width') setNewReturnForm(p => ({ ...p, stockWidth: fetchedBaseline.width }));
  };

  const handleResetAllReturnToFetched = () => {
    if (!fetchedBaseline) return;
    setNewReturnForm(p => ({
      ...p,
      stockProduct: fetchedBaseline.product,
      stockLeather: fetchedBaseline.leather,
      stockLast: fetchedBaseline.last,
      stockSole: fetchedBaseline.sole,
      stockSize: fetchedBaseline.size,
      oldSize: fetchedBaseline.size,
      stockWidth: fetchedBaseline.width,
      clientName: fetchedBaseline.customerName || p.clientName,
      incomingTrackingNo: fetchedBaseline.trackingNo || p.incomingTrackingNo
    }));
  };

  // Auto-fetch helper for Return Stock Add
  const handleAutoFetchStockDetails = (orderIdToFetch?: string) => {
    const targetId = orderIdToFetch || newStockForm.orderId;
    if (!targetId || !targetId.trim()) return;

    const details = lookupAndExtractShoeDetails(targetId, {
      delinquencies: delinquencies?.length ? delinquencies : getDelinquencies(),
      shopifyOrders: shopifyOrders?.length ? shopifyOrders : getShopifyOrders(),
      returns: [...globalReturns, ...llcReturns, ...(propReturns || [])],
      dispatches: dispatches?.length ? dispatches : getDispatches(),
      bostonStock: bostonStock?.length ? bostonStock : getBostonStock()
    });

    setNewStockForm(prev => ({
      ...prev,
      product: details.product,
      itemName: details.product,
      leather: details.leather,
      last: details.last,
      sole: details.sole,
      size: details.size || prev.size || '',
      width: details.width || 'E',
      notes: details.notes || prev.notes || '',
      warehouse: details.warehouse,
      returnTrackingAwb: details.trackingAwb || prev.returnTrackingAwb || ''
    }));
  };

  // Open Inventory Modal to log/update return inventory
  const openInventoryModalForReturn = (ret: any) => {
    const rawOrderId = ret.old_order_id || ret.order_id || '';
    const cleanId = String(rawOrderId).replace(/^#/, '').trim();

    const existingStock = returnStockList.find(s => String(s.order_id).replace(/^#/, '').trim() === cleanId);

    const details = lookupAndExtractShoeDetails(cleanId, {
      delinquencies: delinquencies?.length ? delinquencies : getDelinquencies(),
      shopifyOrders: shopifyOrders?.length ? shopifyOrders : getShopifyOrders(),
      returns: [...globalReturns, ...llcReturns, ...(propReturns || [])],
      dispatches: dispatches?.length ? dispatches : getDispatches(),
      bostonStock: bostonStock?.length ? bostonStock : getBostonStock()
    });

    const initialProduct = existingStock?.product || existingStock?.item_name || details.product || 'BLKBRD Footwear';
    const initialLeather = existingStock?.leather || details.leather || '';
    const initialLast = existingStock?.last || details.last || '';
    const initialSole = existingStock?.sole || details.sole || '';
    const initialSize = existingStock?.size || ret.old_size || details.size || '';
    const initialWidth = ((existingStock?.width as ShoeWidth) || details.width || 'E') as ShoeWidth;

    setInventoryFetchedBaseline({
      product: details.product || initialProduct,
      leather: details.leather || initialLeather,
      last: details.last || initialLast,
      sole: details.sole || initialSole,
      size: details.size || ret.old_size || initialSize,
      width: details.width || initialWidth
    });

    setInventoryModalItem(ret);
    setInventoryModalForm({
      orderId: cleanId,
      product: initialProduct,
      leather: initialLeather,
      last: initialLast,
      sole: initialSole,
      size: initialSize,
      width: initialWidth,
      notes: existingStock?.notes || ret.remarks || ret.notes || details.notes || '',
      receivingDate: existingStock?.receiving_date || new Date().toISOString().split('T')[0],
      warehouse: existingStock?.warehouse || (ret.storeTab === 'LLC' || storeTab === 'LLC' ? 'US' : details.warehouse),
      customization: existingStock?.customization || 'N',
      customizationRemark: existingStock?.customization_remark || '',
      returnTrackingAwb: existingStock?.return_tracking_awb || ret.incoming_tracking_awb || ''
    });
  };

  const handleAutoFetchInventoryModalDetails = async (orderIdToFetch?: string) => {
    const cleanId = String(orderIdToFetch !== undefined ? orderIdToFetch : inventoryModalForm.orderId || '').replace(/^#/, '').trim();
    if (!cleanId) return;

    setIsFetchingInventoryDetails(true);
    try {
      const details = await lookupOrderProductDetailsAsync(cleanId, {
        delinquencies: delinquencies?.length ? delinquencies : getDelinquencies(),
        shopifyOrders: shopifyOrders?.length ? shopifyOrders : getShopifyOrders(),
        returns: [...globalReturns, ...llcReturns, ...(propReturns || [])],
        dispatches: dispatches?.length ? dispatches : getDispatches(),
        bostonStock: bostonStock?.length ? bostonStock : getBostonStock()
      });

      setInventoryFetchedBaseline({
        product: details.product,
        leather: details.leather,
        last: details.last,
        sole: details.sole,
        size: details.size || '',
        width: details.width || 'E'
      });

      setInventoryModalForm(prev => ({
        ...prev,
        orderId: cleanId,
        product: details.product,
        leather: details.leather,
        last: details.last,
        sole: details.sole,
        size: details.size || prev.size || '',
        width: details.width || prev.width || 'E',
        notes: details.notes || prev.notes || '',
        warehouse: details.warehouse,
        returnTrackingAwb: details.trackingAwb || prev.returnTrackingAwb || ''
      }));

      setInventoryFetchFeedback(`Re-fetched: ${details.product} (${details.leather} • ${details.last} • ${details.sole} • ${details.size})`);
      setTimeout(() => setInventoryFetchFeedback(null), 5000);
    } catch (err) {
      console.warn('Inventory modal auto-fetch error:', err);
    } finally {
      setIsFetchingInventoryDetails(false);
    }
  };

  const handleResetInventoryFieldToFetched = (field: 'product' | 'leather' | 'last' | 'sole' | 'size' | 'width') => {
    if (!inventoryFetchedBaseline) return;
    if (field === 'product') setInventoryModalForm(p => ({ ...p, product: inventoryFetchedBaseline.product }));
    if (field === 'leather') setInventoryModalForm(p => ({ ...p, leather: inventoryFetchedBaseline.leather }));
    if (field === 'last') setInventoryModalForm(p => ({ ...p, last: inventoryFetchedBaseline.last }));
    if (field === 'sole') setInventoryModalForm(p => ({ ...p, sole: inventoryFetchedBaseline.sole }));
    if (field === 'size') setInventoryModalForm(p => ({ ...p, size: inventoryFetchedBaseline.size }));
    if (field === 'width') setInventoryModalForm(p => ({ ...p, width: inventoryFetchedBaseline.width }));
  };

  const handleResetAllInventoryToFetched = () => {
    if (!inventoryFetchedBaseline) return;
    setInventoryModalForm(p => ({
      ...p,
      product: inventoryFetchedBaseline.product,
      leather: inventoryFetchedBaseline.leather,
      last: inventoryFetchedBaseline.last,
      sole: inventoryFetchedBaseline.sole,
      size: inventoryFetchedBaseline.size,
      width: inventoryFetchedBaseline.width
    }));
  };

  const handleAutoFetchForInlineEdit = async (orderIdToFetch: string) => {
    const cleanId = String(orderIdToFetch || '').replace(/^#/, '').trim();
    if (!cleanId) return;

    setIsFetchingInlineEdit(true);
    try {
      const details = await lookupOrderProductDetailsAsync(cleanId, {
        delinquencies: delinquencies?.length ? delinquencies : getDelinquencies(),
        shopifyOrders: shopifyOrders?.length ? shopifyOrders : getShopifyOrders(),
        returns: [...globalReturns, ...llcReturns, ...(propReturns || [])],
        dispatches: dispatches?.length ? dispatches : getDispatches(),
        bostonStock: bostonStock?.length ? bostonStock : getBostonStock()
      });

      setEditForm((prev: any) => ({
        ...prev,
        old_order_id: cleanId,
        client_name: details.customerName || prev.client_name || '',
        old_size: details.size || prev.old_size || '',
        incoming_tracking_awb: details.trackingAwb || prev.incoming_tracking_awb || '',
        remarks: details.notes || prev.remarks || ''
      }));
    } catch (err) {
      console.warn('Inline edit auto-fetch notice:', err);
    } finally {
      setIsFetchingInlineEdit(false);
    }
  };

  const handleAutoFetchForStockInlineEdit = async (orderIdToFetch: string) => {
    const cleanId = String(orderIdToFetch || '').replace(/^#/, '').trim();
    if (!cleanId) return;

    setIsFetchingStockInlineEdit(true);
    try {
      const details = await lookupOrderProductDetailsAsync(cleanId, {
        delinquencies: delinquencies?.length ? delinquencies : getDelinquencies(),
        shopifyOrders: shopifyOrders?.length ? shopifyOrders : getShopifyOrders(),
        returns: [...globalReturns, ...llcReturns, ...(propReturns || [])],
        dispatches: dispatches?.length ? dispatches : getDispatches(),
        bostonStock: bostonStock?.length ? bostonStock : getBostonStock()
      });

      setStockEditForm((prev: any) => ({
        ...prev,
        order_id: cleanId,
        product: details.product,
        leather: details.leather,
        last: details.last,
        sole: details.sole,
        size: details.size || prev.size || '',
        width: details.width || prev.width || 'E',
        notes: details.notes || prev.notes || '',
        warehouse: details.warehouse,
        return_tracking_awb: details.trackingAwb || prev.return_tracking_awb || ''
      }));
    } catch (err) {
      console.warn('Stock inline edit auto-fetch notice:', err);
    } finally {
      setIsFetchingStockInlineEdit(false);
    }
  };

  // Save Inventory Modal
  const handleSaveInventoryModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inventoryModalForm.orderId || !inventoryModalForm.product) return;

    try {
      const isUsWarehouse = inventoryModalForm.warehouse === 'US';
      const cleanId = inventoryModalForm.orderId.replace(/^#/, '').trim();

      const existingIn = await fetchReturnStock('return_stock_in');
      const existingUs = await fetchReturnStock('return_stock_us');
      const foundIn = existingIn.find((s: any) => String(s.order_id).replace(/^#/, '').trim() === cleanId);
      const foundUs = existingUs.find((s: any) => String(s.order_id).replace(/^#/, '').trim() === cleanId);
      const found = isUsWarehouse ? (foundUs || foundIn) : (foundIn || foundUs);

      const payload = {
        serial_number: found?.serial_number || returnStockList.length + 1,
        receiving_date: inventoryModalForm.receivingDate,
        order_id: cleanId,
        item_name: inventoryModalForm.product,
        product: inventoryModalForm.product,
        leather: inventoryModalForm.leather,
        last: inventoryModalForm.last,
        sole: inventoryModalForm.sole,
        size: inventoryModalForm.size,
        width: inventoryModalForm.width,
        notes: inventoryModalForm.notes,
        customization: inventoryModalForm.customization,
        customization_remark: inventoryModalForm.customizationRemark,
        return_tracking_awb: inventoryModalForm.returnTrackingAwb,
        warehouse: isUsWarehouse ? 'US' : 'IN'
      };

      if (found) {
        const foundTable = found.warehouse === 'US' ? 'return_stock_us' : 'return_stock_in';
        await updateReturnStock(foundTable, found.id, payload);
      } else {
        const targetTable = isUsWarehouse ? 'return_stock_us' : 'return_stock_in';
        await insertReturnStock(targetTable, payload);
      }

      // Also ensure return record itself is marked received if currently 'N'
      if (inventoryModalItem && (inventoryModalItem.return_received || '').toUpperCase() !== 'Y') {
        const retTable = storeTab === 'LLC' || inventoryModalItem.storeTab === 'LLC' ? 'returns_llc' : 'returns_global';
        if (onUpdateReturn) {
          await onUpdateReturn({ ...inventoryModalItem, return_received: 'Y', storeTab: inventoryModalItem.storeTab || storeTab });
        } else {
          await updateReturn(retTable, inventoryModalItem.id, { return_received: 'Y' });
        }
      }

      if (onRefreshAll) onRefreshAll();
      await loadData();
      setInventoryModalItem(null);
    } catch (err: any) {
      alert(`Failed to save inventory parameters: ${err.message}`);
    }
  };

  const canEdit = role === 'admin' || role === 'logistics';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const gData = await fetchReturns('returns_global');
      const llcData = await fetchReturns('returns_llc');
      
      const stockIn = await fetchReturnStock('return_stock_in');
      const stockUs = await fetchReturnStock('return_stock_us');

      setGlobalReturns(gData);
      setLlcReturns(llcData);
      setReturnStockList([...stockIn, ...stockUs]);
    } catch (err) {
      console.error('Failed to load Supabase returns & stock:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAwb(text);
    setTimeout(() => setCopiedAwb(null), 1500);
  };

  const currentList = storeTab === 'LLC' ? llcReturns : globalReturns;

  const handleQuickReceiveReturn = async (item: any) => {
    const targetTable = storeTab === 'LLC' ? 'returns_llc' : 'returns_global';
    try {
      await updateReturn(targetTable, item.id, {
        ...item,
        return_received: 'Y',
        status: 'Received in Workshop'
      });
      const cleanOrderId = String(item.old_order_id || '').replace(/^#/, '').trim();
      const isUs = storeTab === 'LLC' || cleanOrderId.toUpperCase().startsWith('US');
      const stockTable = isUs ? 'return_stock_us' : 'return_stock_in';
      const existing = returnStockList.find(s => String(s.order_id).replace(/^#/, '').trim() === cleanOrderId);
      if (!existing && cleanOrderId) {
        const specs = extractShoeDetailsFromReturn(item, {
          delinquencies: delinquencies?.length ? delinquencies : getDelinquencies(),
          shopifyOrders: shopifyOrders?.length ? shopifyOrders : getShopifyOrders(),
          returns: [...globalReturns, ...llcReturns],
          dispatches: dispatches?.length ? dispatches : getDispatches(),
          bostonStock: bostonStock?.length ? bostonStock : getBostonStock()
        });
        await insertReturnStock(stockTable, {
          serial_number: returnStockList.length + 1,
          receiving_date: new Date().toISOString().split('T')[0],
          order_id: cleanOrderId,
          item_name: specs.product,
          product: specs.product,
          leather: specs.leather,
          last: specs.last,
          sole: specs.sole,
          size: item.old_size || 'Standard Size',
          width: specs.width || 'E',
          notes: item.remarks || '',
          customization: 'N',
          customization_remark: item.remarks || '',
          return_tracking_awb: item.incoming_tracking_awb || '',
          warehouse: isUs ? 'US' : 'IN'
        });
      }
      await loadData();
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      alert(`Quick receive error: ${err.message}`);
    }
  };

  const filteredReturns = currentList.filter(item => {
    if (statusFilter === 'IN_TRANSIT') {
      if ((item.return_received || '').toUpperCase() === 'Y') return false;
    } else if (statusFilter === 'RECEIVED') {
      if ((item.return_received || '').toUpperCase() !== 'Y') return false;
    } else if (statusFilter === 'EXCHANGE') {
      if ((item.return_type || '').toLowerCase() !== 'exchange') return false;
    } else if (statusFilter === 'REPAIR') {
      const text = `${item.reason || ''} ${item.remarks || ''} ${item.return_type || ''}`.toLowerCase();
      if (!text.includes('repair') && !text.includes('rework') && !text.includes('resole') && !text.includes('defect')) return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const cName = resolveCustomerName(item.old_order_id || item.new_order_id, item.client_name || item.customer_name).toLowerCase();
    const oldO = (item.old_order_id || '').toLowerCase();
    const newO = (item.new_order_id || '').toLowerCase();
    const trk = (item.incoming_tracking_awb || '').toLowerCase();
    const exTrk = (item.exchange_tracking_awb || '').toLowerCase();
    const rmk = (item.remarks || '').toLowerCase();
    const rsn = (item.reason || '').toLowerCase();
    return cName.includes(q) || oldO.includes(q) || newO.includes(q) || trk.includes(q) || exTrk.includes(q) || rmk.includes(q) || rsn.includes(q);
  });

  const filteredStock = returnStockList.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const oId = (item.order_id || '').toLowerCase();
    const iName = (item.product || item.item_name || '').toLowerCase();
    const leather = (item.leather || '').toLowerCase();
    const last = (item.last || '').toLowerCase();
    const sole = (item.sole || '').toLowerCase();
    const size = (item.size || '').toLowerCase();
    const width = (item.width || '').toLowerCase();
    const notes = (item.notes || '').toLowerCase();
    const awb = (item.return_tracking_awb || '').toLowerCase();
    return (
      oId.includes(q) ||
      iName.includes(q) ||
      leather.includes(q) ||
      last.includes(q) ||
      sole.includes(q) ||
      size.includes(q) ||
      width.includes(q) ||
      notes.includes(q) ||
      awb.includes(q)
    );
  });

  const handleExportReturns = () => {
    const dateStr = new Date().toISOString().split('T')[0];

    if (storeTab === 'Stock') {
      const list = filteredStock.length > 0 ? filteredStock : returnStockList;
      if (list.length === 0) {
        alert('No return stock inventory records available to export.');
        return;
      }
      const exportData = list.map((item, idx) => ({
        'S.No': item.serial_number || idx + 1,
        'Receiving Date': item.receiving_date || '',
        'Order ID': item.order_id ? `#${String(item.order_id).replace(/^#/, '')}` : '',
        'Product': item.product || item.item_name || '',
        'Leather': item.leather || '',
        'Last': item.last || '',
        'Sole': item.sole || '',
        'Size': item.size || '',
        'Width': item.width || 'E',
        'Notes': item.notes || '',
        'Customization': item.customization || 'N',
        'Customization Remark': item.customization_remark || '',
        'Return Tracking AWB': item.return_tracking_awb || '',
        'Warehouse': item.warehouse || 'IN'
      }));
      exportToCsv(exportData, `BLKBRD_Return_Stock_Inventory_${dateStr}.csv`);
    } else {
      const list = filteredReturns.length > 0 ? filteredReturns : currentList;
      if (list.length === 0) {
        alert(`No ${storeTab} return records available to export.`);
        return;
      }
      const exportData = list.map((item, idx) => ({
        'S.No': item.serial_number || idx + 1,
        'Customer Name': item.client_name || item.customer_name || '',
        'Return Type': item.return_type || item.type || 'Exchange',
        'Reason': item.reason || 'Size',
        'Old Order ID': item.old_order_id ? `#${String(item.old_order_id).replace(/^#/, '')}` : '',
        'New Order ID': item.new_order_id ? `#${String(item.new_order_id).replace(/^#/, '')}` : '',
        'Old Size': item.old_size || '',
        'New Size': item.new_size || '',
        'Return Received': item.return_received || 'N',
        'Status': item.status || 'Open',
        'Replacement Done': item.replacement_done || 'N',
        'Return Initiated Date': item.initiated_date || '',
        'Target Date': item.new_target_date || '',
        'Incoming Courier': item.incoming_courier || '',
        'Incoming Tracking AWB': item.incoming_tracking_awb || '',
        'Exchange Tracking AWB': item.exchange_tracking_awb || '',
        'Region': item.region || '',
        'Country': item.country || '',
        'Created By': item.created_by || '',
        'Remarks': item.notes || ''
      }));
      exportToCsv(exportData, `BLKBRD_${storeTab}_Returns_${dateStr}.csv`);
    }
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveReturn = async (item: any) => {
    const targetTable = storeTab === 'LLC' ? 'returns_llc' : 'returns_global';
    try {
      if (onUpdateReturn) {
        await onUpdateReturn({ ...editForm, storeTab });
      } else {
        await updateReturn(targetTable, item.id, editForm);
      }

      // If return received is set to 'Y', automatically ensure return stock is logged with extracted parameters
      const isReceivedNow = (editForm.return_received || item.return_received || '').toUpperCase() === 'Y';
      if (isReceivedNow) {
        try {
          const cleanOrderId = String(editForm.old_order_id || item.old_order_id || '').replace(/^#/, '').trim();
          if (cleanOrderId) {
            const isUs = storeTab === 'LLC' || cleanOrderId.toUpperCase().startsWith('US') || cleanOrderId.toUpperCase().includes('USBLKBRD');
            const stockTable = isUs ? 'return_stock_us' : 'return_stock_in';
            const existing = returnStockList.find(s => String(s.order_id).replace(/^#/, '').trim() === cleanOrderId);
            if (!existing) {
              const details = lookupAndExtractShoeDetails(cleanOrderId, {
                delinquencies: delinquencies?.length ? delinquencies : getDelinquencies(),
                shopifyOrders: shopifyOrders?.length ? shopifyOrders : getShopifyOrders(),
                returns: [...globalReturns, ...llcReturns, ...(propReturns || [])],
                dispatches: dispatches?.length ? dispatches : getDispatches(),
                bostonStock: bostonStock?.length ? bostonStock : getBostonStock()
              });
              await insertReturnStock(stockTable, {
                serial_number: returnStockList.length + 1,
                receiving_date: new Date().toISOString().split('T')[0],
                order_id: cleanOrderId,
                item_name: details.product,
                product: details.product,
                leather: details.leather,
                last: details.last,
                sole: details.sole,
                size: details.size || editForm.old_size || item.old_size || 'Standard Size',
                width: details.width || 'E',
                notes: details.notes || editForm.remarks || item.remarks || '',
                customization: 'N',
                customization_remark: editForm.remarks || item.remarks || '',
                return_tracking_awb: editForm.incoming_tracking_awb || item.incoming_tracking_awb || '',
                warehouse: isUs ? 'US' : 'IN'
              });
            }
          }
        } catch (stockErr) {
          console.warn('Auto-sync return to stock inventory warning in handleSaveReturn:', stockErr);
        }
      }

      if (onRefreshAll) onRefreshAll();
      await loadData();
      setEditingId(null);
      setEditForm({});
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    }
  };

  const handleCreateReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReturnForm.clientName || !newReturnForm.oldOrderId) {
      alert('Customer Name and Old Order ID are required');
      return;
    }

    // Cross-store mismatch validation check
    const cleanOrderId = newReturnForm.oldOrderId.toUpperCase().trim();
    const isLlcOrder = cleanOrderId.startsWith('US') || cleanOrderId.includes('USBLKBRD');

    if (storeTab === 'Global' && isLlcOrder) {
      const proceed = window.confirm(
        `Warning: Order ID "${newReturnForm.oldOrderId}" appears to be an LLC (USBLKBRD) order, but you are logging it in the Global Returns (BLKBRD) tab.\n\nDo you want to proceed anyway?`
      );
      if (!proceed) return;
    } else if (storeTab === 'LLC' && !isLlcOrder) {
      const proceed = window.confirm(
        `Warning: Order ID "${newReturnForm.oldOrderId}" appears to be a Global (BLKBRD) order, but you are logging it in the LLC Returns (USBLKBRD) tab.\n\nDo you want to proceed anyway?`
      );
      if (!proceed) return;
    }

    const targetTable = storeTab === 'LLC' ? 'returns_llc' : 'returns_global';

    try {
      const payload = {
        serial_number: currentList.length + 1,
        customer_name: newReturnForm.clientName,
        return_type: newReturnForm.returnType,
        reason: newReturnForm.reason,
        old_order_id: formatBlkbrdOrderId(newReturnForm.oldOrderId, storeTab),
        new_order_id: newReturnForm.newOrderId ? formatBlkbrdOrderId(newReturnForm.newOrderId, storeTab) : '',
        old_size: newReturnForm.oldSize,
        new_size: newReturnForm.newSize,
        return_received: newReturnForm.returnReceived,
        status: newReturnForm.status,
        replacement_done: newReturnForm.replacementDone,
        return_initiated: newReturnForm.initiatedDate || null,
        targeted_date: newReturnForm.newTargetDate || null,
        incoming_courier_name: newReturnForm.incomingCourier,
        incoming_tracking_awb: newReturnForm.incomingTrackingNo,
        exchange_tracking_awb: newReturnForm.exchangeTracking,
        region: newReturnForm.region,
        country: newReturnForm.country,
        created_by: newReturnForm.createdBy,
        remarks: newReturnForm.notes,
        stockProduct: newReturnForm.stockProduct,
        stockLeather: newReturnForm.stockLeather,
        stockLast: newReturnForm.stockLast,
        stockSole: newReturnForm.stockSole,
        stockWidth: newReturnForm.stockWidth,
        stockSize: newReturnForm.stockSize,
        storeTab
      };

      if (onAddReturn) {
        await onAddReturn(payload);
      } else {
        await insertReturn(targetTable, payload);
      }

      // Automatically push to return stock inventory if marked as Received (Y) with explicit warehouse routing
      if (newReturnForm.returnReceived === 'Y') {
        try {
          const isUsWarehouse = newReturnForm.receivingWarehouse === 'US';
          const stockTable = isUsWarehouse ? 'return_stock_us' : 'return_stock_in';
          const prodName = newReturnForm.stockProduct || `Return Item (${payload.return_type})`;

          await insertReturnStock(stockTable, {
            serial_number: returnStockList.length + 1,
            receiving_date: new Date().toISOString().split('T')[0],
            order_id: payload.old_order_id,
            item_name: prodName,
            product: prodName,
            leather: newReturnForm.stockLeather || '',
            last: newReturnForm.stockLast || '',
            sole: newReturnForm.stockSole || '',
            size: newReturnForm.stockSize || payload.old_size || 'Standard Size',
            width: newReturnForm.stockWidth || 'E',
            notes: newReturnForm.stockNotes || payload.remarks || '',
            customization: newReturnForm.stockCustomization,
            customization_remark: newReturnForm.stockCustomizationRemark || payload.remarks || 'Auto-logged from Returns Tracker',
            return_tracking_awb: payload.incoming_tracking_awb,
            warehouse: isUsWarehouse ? 'US' : 'IN'
          });
        } catch (stockErr) {
          console.warn('Auto-sync return to stock inventory warning:', stockErr);
        }
      }

      if (onRefreshAll) onRefreshAll();
      await loadData();
      setIsAdding(false);
      setNewReturnForm({
        clientName: '',
        returnType: 'Exchange',
        reason: 'Size',
        oldOrderId: '',
        newOrderId: '',
        oldSize: '',
        newSize: '',
        returnReceived: 'N',
        receivingWarehouse: 'IN',
        stockProduct: '',
        stockLeather: '',
        stockLast: '',
        stockSole: '',
        stockSize: '',
        stockWidth: 'E',
        stockNotes: '',
        stockCustomization: 'N',
        stockCustomizationRemark: '',
        status: 'Open',
        replacementDone: 'N',
        initiatedDate: new Date().toISOString().split('T')[0],
        newTargetDate: '',
        incomingCourier: 'Delhivery',
        incomingTrackingNo: '',
        exchangeTracking: '',
        region: 'Domestic',
        country: 'India',
        createdBy: 'Logistics Desk',
        notes: ''
      });
    } catch (err: any) {
      alert(`Insert failed: ${err.message}`);
    }
  };

  const handleCreateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStockForm.orderId || (!newStockForm.product && !newStockForm.itemName)) return;
    try {
      const isUsWarehouse = newStockForm.warehouse === 'US';
      const productName = newStockForm.product || newStockForm.itemName || 'BLKBRD Footwear';
      const payload = {
        serial_number: returnStockList.length + 1,
        receiving_date: newStockForm.receivingDate,
        order_id: newStockForm.orderId.replace(/^#/, '').trim(),
        item_name: productName,
        product: productName,
        leather: newStockForm.leather,
        last: newStockForm.last,
        sole: newStockForm.sole,
        size: newStockForm.size,
        width: newStockForm.width,
        notes: newStockForm.notes,
        customization: newStockForm.customization,
        customization_remark: newStockForm.customizationRemark,
        return_tracking_awb: newStockForm.returnTrackingAwb,
        warehouse: isUsWarehouse ? 'US' : 'IN'
      };
      
      const targetStockTable = isUsWarehouse ? 'return_stock_us' : 'return_stock_in';
      await insertReturnStock(targetStockTable, payload);

      if (onRefreshAll) onRefreshAll();
      await loadData();
      setIsAddingStock(false);
      setNewStockForm({
        receivingDate: new Date().toISOString().split('T')[0],
        orderId: '',
        product: '',
        itemName: 'BLKBRD Goodyear Welted',
        leather: '',
        last: '',
        sole: '',
        size: 'UK 9 / US 9.5',
        width: 'E',
        notes: '',
        customization: 'N',
        customizationRemark: '',
        returnTrackingAwb: '',
        warehouse: 'IN'
      });
    } catch (err: any) {
      alert(`Stock insert failed: ${err.message}`);
    }
  };

  const startEditStock = (item: any) => {
    setEditingStockId(item.id);
    setStockEditForm({
      ...item,
      product: item.product || item.item_name || 'BLKBRD Footwear',
      item_name: item.item_name || item.product || 'BLKBRD Footwear',
      leather: item.leather || '',
      last: item.last || '',
      sole: item.sole || '',
      size: item.size || '',
      width: (item.width as ShoeWidth) || 'E',
      notes: item.notes || item.remarks || '',
      warehouse: item.warehouse || 'IN',
      customization: item.customization || 'N',
      customization_remark: item.customization_remark || '',
      return_tracking_awb: item.return_tracking_awb || ''
    });
  };

  const cancelEditStock = () => {
    setEditingStockId(null);
    setStockEditForm({});
  };

  const handleSaveStock = async (item: any) => {
    try {
      const isUsWarehouse = (stockEditForm.warehouse || item.warehouse) === 'US';
      const targetTable = isUsWarehouse ? 'return_stock_us' : 'return_stock_in';
      const productName = stockEditForm.product || stockEditForm.item_name || item.item_name || 'BLKBRD Footwear';
      const payload = {
        serial_number: stockEditForm.serial_number ?? item.serial_number,
        receiving_date: stockEditForm.receiving_date ?? item.receiving_date,
        order_id: String(stockEditForm.order_id ?? item.order_id).replace(/^#/, '').trim(),
        item_name: productName,
        product: productName,
        leather: stockEditForm.leather ?? item.leather ?? '',
        last: stockEditForm.last ?? item.last ?? '',
        sole: stockEditForm.sole ?? item.sole ?? '',
        size: stockEditForm.size ?? item.size ?? '',
        width: stockEditForm.width ?? item.width ?? 'E',
        notes: stockEditForm.notes ?? item.notes ?? '',
        customization: stockEditForm.customization ?? item.customization ?? 'N',
        customization_remark: stockEditForm.customization_remark ?? item.customization_remark ?? '',
        return_tracking_awb: stockEditForm.return_tracking_awb ?? item.return_tracking_awb ?? '',
        warehouse: isUsWarehouse ? 'US' : 'IN'
      };

      await updateReturnStock(targetTable, item.id, payload);
      if (onRefreshAll) onRefreshAll();
      await loadData();
      setEditingStockId(null);
      setStockEditForm({});
    } catch (err: any) {
      alert(`Stock update failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Navigator */}
      <div className="bg-white/60 border border-neutral-200/80 rounded-2xl p-2 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => { setStoreTab('Global'); setEditingId(null); }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              storeTab === 'Global' ? 'bg-neutral-900 text-white shadow-xs' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <span>Global Returns (BLKBRD)</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-200/70 text-neutral-800">
              {globalReturns.length}
            </span>
          </button>

          <button
            onClick={() => { setStoreTab('LLC'); setEditingId(null); }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              storeTab === 'LLC' ? 'bg-blue-900 text-white shadow-xs' : 'text-blue-700 hover:bg-blue-50'
            }`}
          >
            <span>LLC Returns (USBLKBRD)</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-900">
              {llcReturns.length}
            </span>
          </button>

          <button
            onClick={() => { setStoreTab('Stock'); setEditingId(null); }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              storeTab === 'Stock' ? 'bg-emerald-900 text-white shadow-xs' : 'text-emerald-800 hover:bg-emerald-50'
            }`}
          >
            <Warehouse className="w-3.5 h-3.5" />
            <span>Return Stock Inventory</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900">
              {returnStockList.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* View Mode Toggle (Cards vs Table) */}
          <div className="flex items-center p-0.5 bg-neutral-200/80 rounded-lg border border-neutral-300/80 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white text-neutral-900 shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
              title="Switch to Card Grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-neutral-900 shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
              title="Switch to Spreadsheet Table view"
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>

          {/* Export CSV Button */}
          <button
            onClick={handleExportReturns}
            disabled={storeTab === 'Stock' ? returnStockList.length === 0 : currentList.length === 0}
            className="px-3.5 py-1.5 text-xs font-semibold text-neutral-800 bg-white hover:bg-neutral-50 border border-neutral-200/80 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[32px]"
            title={`Download ${storeTab === 'Stock' ? 'Return Stock' : `${storeTab} Returns`} records as CSV`}
          >
            <Download className="w-3.5 h-3.5 stroke-[1.5]" />
            <span>Export CSV</span>
            <span className="text-[10px] font-mono text-neutral-500">
              ({storeTab === 'Stock' ? filteredStock.length : filteredReturns.length})
            </span>
          </button>

          {canEdit && (
            <div className="flex items-center gap-2">
              {storeTab !== 'Stock' && (
                <button
                  onClick={() => {
                    setIsAdding(true);
                    setIsOrderSearchDropdownOpen(true);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200/90 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
                  title="Search any order number or customer to add into returns"
                >
                  <Search className="w-3.5 h-3.5 text-blue-600" />
                  <span>Search Order to Return</span>
                </button>
              )}

              {storeTab === 'Stock' ? (
                <button
                  onClick={() => setIsAddingStock(!isAddingStock)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-800 hover:bg-emerald-700 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
                >
                  {isAddingStock ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{isAddingStock ? 'Close' : 'Add Return Stock'}</span>
                </button>
              ) : (
                <button
                  onClick={() => setIsAdding(!isAdding)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
                >
                  {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{isAdding ? 'Close Form' : `Log ${storeTab} Return`}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Executive Returns KPI Metric Summary Cards */}
      {storeTab !== 'Stock' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`p-3 rounded-2xl border text-left transition cursor-pointer shadow-2xs ${
              statusFilter === 'ALL'
                ? 'bg-neutral-900 text-white border-neutral-800 ring-2 ring-neutral-900/20'
                : 'bg-white hover:bg-neutral-50 text-neutral-800 border-neutral-200/80'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold opacity-80 mb-1">
              <span>Total Returns</span>
              <RotateCcw className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-black font-mono tracking-tight">{stats.total}</div>
            <div className="text-[10px] mt-0.5 opacity-70 truncate">{storeTab === 'Global' ? 'BLKBRD Global' : 'USBLKBRD LLC'}</div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('IN_TRANSIT')}
            className={`p-3 rounded-2xl border text-left transition cursor-pointer shadow-2xs ${
              statusFilter === 'IN_TRANSIT'
                ? 'bg-sky-700 text-white border-sky-800 ring-2 ring-sky-700/20'
                : 'bg-sky-50/70 hover:bg-sky-100/70 text-sky-950 border-sky-200/80'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold opacity-85 mb-1">
              <span>In Transit</span>
              <Truck className="w-3.5 h-3.5 text-sky-500" />
            </div>
            <div className="text-xl font-black font-mono tracking-tight">{stats.inTransit}</div>
            <div className="text-[10px] mt-0.5 opacity-80 truncate">Awaiting Arrival</div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('RECEIVED')}
            className={`p-3 rounded-2xl border text-left transition cursor-pointer shadow-2xs ${
              statusFilter === 'RECEIVED'
                ? 'bg-emerald-700 text-white border-emerald-800 ring-2 ring-emerald-700/20'
                : 'bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-950 border-emerald-200/80'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold opacity-85 mb-1">
              <span>Received</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-xl font-black font-mono tracking-tight">{stats.received}</div>
            <div className="text-[10px] mt-0.5 opacity-80 truncate">In Workshop Stock</div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('EXCHANGE')}
            className={`p-3 rounded-2xl border text-left transition cursor-pointer shadow-2xs ${
              statusFilter === 'EXCHANGE'
                ? 'bg-indigo-700 text-white border-indigo-800 ring-2 ring-indigo-700/20'
                : 'bg-indigo-50/70 hover:bg-indigo-100/70 text-indigo-950 border-indigo-200/80'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold opacity-85 mb-1">
              <span>Exchanges</span>
              <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <div className="text-xl font-black font-mono tracking-tight">{stats.pendingExchange}</div>
            <div className="text-[10px] mt-0.5 opacity-80 truncate">Size / Swap Flow</div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('REPAIR')}
            className={`p-3 rounded-2xl border text-left transition cursor-pointer shadow-2xs ${
              statusFilter === 'REPAIR'
                ? 'bg-amber-700 text-white border-amber-800 ring-2 ring-amber-700/20'
                : 'bg-amber-50/70 hover:bg-amber-100/70 text-amber-950 border-amber-200/80'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold opacity-85 mb-1">
              <span>Repair & Rework</span>
              <Wrench className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-xl font-black font-mono tracking-tight">{stats.repairCount}</div>
            <div className="text-[10px] mt-0.5 opacity-80 truncate">Welt / Resole Craft</div>
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="glass-panel p-3 rounded-2xl flex items-center gap-2 bg-white/40">
        <Search className="w-4 h-4 text-neutral-400" />
        <input
          type="text"
          placeholder={storeTab === 'Stock' ? 'Search by Order ID, Item Name, Tracking AWB...' : 'Search by Customer Name, Order ID, Tracking AWB...'}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full text-xs bg-transparent border-none focus:outline-hidden text-neutral-900 placeholder:text-neutral-400"
        />
      </div>

      {/* Add Stock Form */}
      {storeTab === 'Stock' && isAddingStock && canEdit && (
        <form onSubmit={handleCreateStock} className="p-4 sm:p-5 glass-card rounded-3xl border border-emerald-200/80 bg-emerald-50/20 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
            <div>
              <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-emerald-700" />
                <span>Log Inventory to Return Stock</span>
              </h4>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Enter an Order ID to auto-fetch product name, leather, last, sole, size &amp; width specifications.
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-semibold">
              Warehouse Stock
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* Order ID with auto-fetch */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] uppercase font-bold text-neutral-600">Order ID *</label>
                <button
                  type="button"
                  onClick={() => handleAutoFetchStockDetails()}
                  className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-0.5 cursor-pointer"
                  title="Auto-fetch details from database"
                >
                  <Sparkles className="w-2.5 h-2.5" /> Auto-fetch
                </button>
              </div>
              <input
                type="text"
                required
                placeholder="e.g. 39420 or BLKBRD40142"
                value={newStockForm.orderId}
                onChange={e => setNewStockForm({ ...newStockForm, orderId: e.target.value })}
                onBlur={e => handleAutoFetchStockDetails(e.target.value)}
                className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono font-semibold"
              />
            </div>

            {/* Product (Pre-filled) */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Product (Pre-filled) *</label>
              <input
                type="text"
                required
                placeholder="e.g. Henrik Penny Loafer"
                value={newStockForm.product}
                onChange={e => setNewStockForm({ ...newStockForm, product: e.target.value })}
                className="glass-input rounded-xl px-3 py-2 text-xs w-full font-medium"
              />
            </div>

            {/* Leather (Pre-filled) */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Leather (Pre-filled) *</label>
              <input
                type="text"
                placeholder="e.g. Snuff Suede / French Boxcalf"
                value={newStockForm.leather}
                onChange={e => setNewStockForm({ ...newStockForm, leather: e.target.value })}
                className="glass-input rounded-xl px-3 py-2 text-xs w-full"
              />
            </div>

            {/* Last (Pre-filled) */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Last (Pre-filled) *</label>
              <input
                type="text"
                placeholder="e.g. Rui Last / Oscar Last"
                value={newStockForm.last}
                onChange={e => setNewStockForm({ ...newStockForm, last: e.target.value })}
                className="glass-input rounded-xl px-3 py-2 text-xs w-full"
              />
            </div>

            {/* Sole (Pre-filled) */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Sole (Pre-filled) *</label>
              <input
                type="text"
                placeholder="e.g. Dainite Sole / Vibram Commando"
                value={newStockForm.sole}
                onChange={e => setNewStockForm({ ...newStockForm, sole: e.target.value })}
                className="glass-input rounded-xl px-3 py-2 text-xs w-full"
              />
            </div>

            {/* Size (Pre-filled) */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Size (Pre-filled) *</label>
              <input
                type="text"
                required
                placeholder="e.g. UK 9 / US 9.5"
                value={newStockForm.size}
                onChange={e => setNewStockForm({ ...newStockForm, size: e.target.value })}
                className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono"
              />
            </div>

            {/* Width: E, EE, EEE, 4E, More than 4E */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Width *</label>
              <select
                value={newStockForm.width}
                onChange={e => setNewStockForm({ ...newStockForm, width: e.target.value as ShoeWidth })}
                className="glass-input rounded-xl px-3 py-2 text-xs w-full font-semibold"
              >
                {SHOE_WIDTHS.map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            {/* Receiving Date */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Receiving Date *</label>
              <input
                type="date"
                required
                value={newStockForm.receivingDate}
                onChange={e => setNewStockForm({ ...newStockForm, receivingDate: e.target.value })}
                className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono"
              />
            </div>

            {/* Return Tracking AWB */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Return Tracking AWB</label>
              <input
                type="text"
                placeholder="e.g. 88392019"
                value={newStockForm.returnTrackingAwb}
                onChange={e => setNewStockForm({ ...newStockForm, returnTrackingAwb: e.target.value })}
                className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono"
              />
            </div>

            {/* Warehouse */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Warehouse *</label>
              <select
                value={newStockForm.warehouse}
                onChange={e => setNewStockForm({ ...newStockForm, warehouse: e.target.value as any })}
                className="glass-input rounded-xl px-3 py-2 text-xs w-full font-medium"
              >
                <option value="IN">India Workshop (IN)</option>
                <option value="US">US Boston Stock (US)</option>
              </select>
            </div>

            {/* Customization */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Customization</label>
              <select
                value={newStockForm.customization}
                onChange={e => setNewStockForm({ ...newStockForm, customization: e.target.value })}
                className="glass-input rounded-xl px-3 py-2 text-xs w-full font-medium"
              >
                <option value="N">No (N)</option>
                <option value="Y">Yes (Y)</option>
              </select>
            </div>

            {/* Customization Remark */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Customization Remark</label>
              <input
                type="text"
                placeholder="e.g. Brass initials on sole"
                value={newStockForm.customizationRemark}
                onChange={e => setNewStockForm({ ...newStockForm, customizationRemark: e.target.value })}
                className="glass-input rounded-xl px-3 py-2 text-xs w-full"
              />
            </div>

            {/* Notes */}
            <div className="sm:col-span-2 md:col-span-3">
              <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Notes</label>
              <input
                type="text"
                placeholder="e.g. Return inspection notes, fit remarks, defect tags..."
                value={newStockForm.notes}
                onChange={e => setNewStockForm({ ...newStockForm, notes: e.target.value })}
                className="glass-input rounded-xl px-3 py-2 text-xs w-full"
              />
            </div>

            {/* Submit Action */}
            <div className="flex items-end">
              <button
                type="submit"
                className="bg-emerald-900 hover:bg-emerald-800 text-white font-medium py-2 px-4 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-1.5 shadow-xs w-full transition"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Return Stock</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Add Return Form with Interactive Order Search and Auto-Fill */}
      {storeTab !== 'Stock' && isAdding && canEdit && (
        <form onSubmit={handleCreateReturn} className="p-4 sm:p-6 glass-card rounded-3xl border border-neutral-200/90 shadow-sm space-y-5 bg-white/70">
          {/* Form Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-200/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-2xs">
                <RotateCcw className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <span>Log New {storeTab} Return / Exchange</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    storeTab === 'LLC' ? 'bg-blue-100 text-blue-900' : 'bg-neutral-200 text-neutral-900'
                  }`}>
                    {storeTab === 'LLC' ? 'USBLKBRD Store' : 'BLKBRD Global Store'}
                  </span>
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Search any order to auto-populate all customer &amp; footwear specifications, then edit or overwrite details as needed.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* SPOTLIGHT SECTION: Dedicated Order Search & Auto-Fill */}
          <div ref={orderSearchRef} className="relative p-4 rounded-2xl bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-emerald-50/80 border border-blue-200/90 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-blue-950 flex items-center gap-1.5 uppercase tracking-wide">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Search &amp; Auto-Fill Order Details</span>
              </label>
              <span className="text-[10px] text-blue-700 font-medium">
                {availableOrdersForSelection.length} orders indexed across stores
              </span>
            </div>

            <div className="relative">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-600" />
                  <input
                    type="text"
                    placeholder="Search by Order # (e.g. 40142, US1042), Customer Name, Shoe Model, or Line Items..."
                    value={orderSearchQuery}
                    onFocus={() => setIsOrderSearchDropdownOpen(true)}
                    onChange={e => {
                      setOrderSearchQuery(e.target.value);
                      setIsOrderSearchDropdownOpen(true);
                    }}
                    className="w-full pl-9 pr-8 py-2.5 bg-white border border-blue-300/80 rounded-xl text-xs font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 shadow-2xs transition"
                  />
                  {orderSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSearchQuery('');
                        setIsOrderSearchDropdownOpen(false);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const clean = orderSearchQuery.replace(/^#/, '').trim();
                    if (clean) handleAutoFetchReturnDetails(clean);
                  }}
                  disabled={isFetchingOrderDetails || !orderSearchQuery.trim()}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer transition disabled:opacity-50 shrink-0"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isFetchingOrderDetails ? 'animate-spin' : ''}`} />
                  <span>{isFetchingOrderDetails ? 'Fetching...' : 'Fetch & Fill'}</span>
                </button>
              </div>

              {/* Instant Search Results Dropdown */}
              {isOrderSearchDropdownOpen && searchedOrdersForReturn.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-neutral-200 rounded-2xl shadow-xl max-h-72 overflow-y-auto divide-y divide-neutral-100">
                  <div className="p-2 bg-neutral-50/80 text-[10px] font-bold text-neutral-500 uppercase tracking-wider sticky top-0 flex justify-between items-center backdrop-blur-xs">
                    <span>Matching Orders ({searchedOrdersForReturn.length})</span>
                    <span className="text-[9px] text-neutral-400 font-normal">Click any order to auto-populate return form</span>
                  </div>
                  {searchedOrdersForReturn.map(o => (
                    <div
                      key={o.orderId}
                      onClick={() => handleSelectOrderForReturn(o)}
                      className="p-3 hover:bg-blue-50/80 transition cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-neutral-900 group-hover:text-blue-700">
                            #{o.orderId}
                          </span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            o.storeAccount === 'LLC' ? 'bg-blue-100 text-blue-900 font-semibold' : 'bg-neutral-100 text-neutral-800'
                          }`}>
                            {o.source}
                          </span>
                          {o.status && (
                            <span className="text-[10px] font-mono text-neutral-500 bg-neutral-50 px-1.5 py-0.5 rounded border border-neutral-200">
                              {o.status}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-700">
                          {o.customerName && (
                            <span className="font-semibold text-neutral-900 truncate">
                              {o.customerName}
                            </span>
                          )}
                          {o.customerName && <span className="text-neutral-300">•</span>}
                          <span className="text-neutral-600 truncate text-[11px]">
                            {o.product}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-blue-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition shrink-0 bg-blue-100/90 px-2.5 py-1 rounded-lg">
                        <span>Fill Form</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Order Suggestions Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
              <span className="text-neutral-500 text-[10px] font-bold uppercase">Recent Orders:</span>
              {availableOrdersForSelection.slice(0, 6).map(o => (
                <button
                  key={o.orderId}
                  type="button"
                  onClick={() => handleSelectOrderForReturn(o)}
                  className="px-2 py-0.5 bg-white/90 hover:bg-blue-100 text-blue-900 border border-blue-200/80 rounded-lg font-mono text-[10px] transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  title={`Select #${o.orderId} (${o.customerName || o.product})`}
                >
                  <span>#{o.orderId}</span>
                  {o.customerName && <span className="text-neutral-600 font-sans text-[9px] truncate max-w-[80px]">({o.customerName.split(' ')[0]})</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback banner when order details are auto-filled */}
          {orderFetchFeedback && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 text-xs font-medium flex items-center justify-between gap-2 shadow-2xs animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{orderFetchFeedback}</span>
              </div>
              <span className="text-[10px] bg-emerald-200/80 text-emerald-900 font-bold px-2 py-0.5 rounded-full shrink-0">
                100% Editable Below
              </span>
            </div>
          )}

          {/* SECTION 1: PRIMARY ORDER & CUSTOMER INFORMATION */}
          <div className="p-4 glass-panel rounded-2xl border border-neutral-200/80 bg-white/60 space-y-3">
            <h4 className="text-[11px] font-bold text-neutral-800 uppercase tracking-wide flex items-center gap-1.5">
              <span>1. Order &amp; Customer Information</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Old Order ID with inline auto-fetch */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] uppercase font-bold text-neutral-600">Old Order ID *</label>
                  <button
                    type="button"
                    onClick={() => handleAutoFetchReturnDetails()}
                    disabled={isFetchingOrderDetails}
                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
                    title="Auto-fetch footwear parameters from this Order ID"
                  >
                    <Sparkles className={`w-2.5 h-2.5 ${isFetchingOrderDetails ? 'animate-spin' : ''}`} />
                    <span>Auto-fetch</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  list="return-available-orders-datalist"
                  placeholder="e.g. 39420 or BLKBRD40142"
                  value={newReturnForm.oldOrderId}
                  onChange={e => {
                    const val = e.target.value;
                    setNewReturnForm(prev => ({ ...prev, oldOrderId: val }));
                    const clean = val.replace(/^#/, '').trim();
                    if (clean.length >= 4 && availableOrdersForSelection.some(o => o.orderId.toLowerCase() === clean.toLowerCase())) {
                      handleAutoFetchReturnDetails(clean);
                    }
                  }}
                  onBlur={e => handleAutoFetchReturnDetails(e.target.value)}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono font-semibold"
                />
                <datalist id="return-available-orders-datalist">
                  {availableOrdersForSelection.map(o => (
                    <option key={o.orderId} value={o.orderId}>
                      {o.customerName ? `${o.customerName} — ` : ''}{o.product}
                    </option>
                  ))}
                </datalist>
              </div>

              {/* Customer Name */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={newReturnForm.clientName}
                  onChange={e => setNewReturnForm({ ...newReturnForm, clientName: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-medium"
                />
              </div>

              {/* Return Type */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Return Type</label>
                <select
                  value={newReturnForm.returnType}
                  onChange={e => setNewReturnForm({ ...newReturnForm, returnType: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-medium"
                >
                  <option value="Exchange">Exchange</option>
                  <option value="Return">Return</option>
                  <option value="Refund">Refund</option>
                </select>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Reason</label>
                <select
                  value={newReturnForm.reason}
                  onChange={e => setNewReturnForm({ ...newReturnForm, reason: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-medium"
                >
                  <option value="Size">Size / Fitting Issue</option>
                  <option value="Wrong Item">Wrong Item Delivered</option>
                  <option value="Trial">Trial Pair Return</option>
                  <option value="Defect">Quality / Defect</option>
                  <option value="Customer Request">Customer Change of Mind</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* New Order ID */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">New Order ID (Exchange)</label>
                <input
                  type="text"
                  placeholder="e.g. 40102"
                  value={newReturnForm.newOrderId}
                  onChange={e => setNewReturnForm({ ...newReturnForm, newOrderId: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono"
                />
              </div>

              {/* Old Size */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Old Size</label>
                <input
                  type="text"
                  placeholder="e.g. UK 9 / US 9.5"
                  value={newReturnForm.oldSize}
                  onChange={e => setNewReturnForm({ ...newReturnForm, oldSize: e.target.value, stockSize: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono"
                />
              </div>

              {/* New Size */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">New Size (Replacement)</label>
                <input
                  type="text"
                  placeholder="e.g. UK 9.5 / US 10"
                  value={newReturnForm.newSize}
                  onChange={e => setNewReturnForm({ ...newReturnForm, newSize: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono"
                />
              </div>

              {/* Return Received */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Return Received *</label>
                <select
                  value={newReturnForm.returnReceived}
                  onChange={e => setNewReturnForm({ ...newReturnForm, returnReceived: e.target.value })}
                  className={`glass-input rounded-xl px-3 py-2 text-xs w-full font-semibold ${
                    newReturnForm.returnReceived === 'Y' ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : ''
                  }`}
                >
                  <option value="N">No (In Transit / Pending)</option>
                  <option value="Y">Yes (Received &amp; Verified)</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 2: FOOTWEAR PARAMETERS (Auto-filled with Full Manual Overwrite Support) */}
          <div className="p-4 sm:p-5 bg-emerald-50/70 border border-emerald-300/80 rounded-2xl space-y-3.5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-emerald-200">
              <div>
                <div className="text-xs font-bold text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-emerald-700" />
                  <span>2. Footwear Specifications (Auto-Populated &amp; Fully Overwritable)</span>
                  {fetchedBaseline && (
                    <span className="text-[9px] font-semibold bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-full">
                      Live Pre-fill Active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Product, Leather, Last, Sole &amp; Size are pre-filled based on the database. You can manually edit or overwrite any field.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {fetchedBaseline && (
                  <button
                    type="button"
                    onClick={handleResetAllReturnToFetched}
                    className="text-[10px] font-semibold text-emerald-900 hover:text-emerald-950 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1 rounded-lg border border-emerald-300 flex items-center gap-1 cursor-pointer transition shadow-2xs"
                    title="Revert all footwear parameters back to original fetched order specifications"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset All to Fetched</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Product */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] uppercase font-bold text-emerald-950">Product *</label>
                  {fetchedBaseline && newReturnForm.stockProduct !== fetchedBaseline.product && (
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                      <button
                        type="button"
                        onClick={() => handleResetReturnFieldToFetched('product')}
                        title="Reset to fetched"
                        className="text-gray-400 hover:text-amber-800 cursor-pointer"
                      >
                        <Undo2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  required
                  list="returns-view-products-list"
                  placeholder="e.g. Henrik Penny Loafer"
                  value={newReturnForm.stockProduct}
                  onChange={e => setNewReturnForm({ ...newReturnForm, stockProduct: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full bg-white font-medium border-emerald-300 focus:border-emerald-600"
                />
                <datalist id="returns-view-products-list">
                  {Object.values(PRODUCT_DATABASE_RECORDS).map(r => (
                    <option key={r.modelName} value={r.modelName} />
                  ))}
                </datalist>
              </div>

              {/* Leather */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] uppercase font-bold text-emerald-950">Leather *</label>
                  {fetchedBaseline && newReturnForm.stockLeather !== fetchedBaseline.leather && (
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                      <button
                        type="button"
                        onClick={() => handleResetReturnFieldToFetched('leather')}
                        title="Reset to fetched"
                        className="text-gray-400 hover:text-amber-800 cursor-pointer"
                      >
                        <Undo2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  required
                  list="returns-view-leathers-list"
                  placeholder="e.g. Snuff Suede / French Boxcalf"
                  value={newReturnForm.stockLeather}
                  onChange={e => setNewReturnForm({ ...newReturnForm, stockLeather: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full bg-white border-emerald-300 focus:border-emerald-600"
                />
                <datalist id="returns-view-leathers-list">
                  {COMMON_LEATHERS.map(l => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </div>

              {/* Last */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] uppercase font-bold text-emerald-950">Last *</label>
                  {fetchedBaseline && newReturnForm.stockLast !== fetchedBaseline.last && (
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                      <button
                        type="button"
                        onClick={() => handleResetReturnFieldToFetched('last')}
                        title="Reset to fetched"
                        className="text-gray-400 hover:text-amber-800 cursor-pointer"
                      >
                        <Undo2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  required
                  list="returns-view-lasts-list"
                  placeholder="e.g. Rui Last / Oscar Last"
                  value={newReturnForm.stockLast}
                  onChange={e => setNewReturnForm({ ...newReturnForm, stockLast: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full bg-white border-emerald-300 focus:border-emerald-600"
                />
                <datalist id="returns-view-lasts-list">
                  {COMMON_LASTS.map(lt => (
                    <option key={lt} value={lt} />
                  ))}
                </datalist>
              </div>

              {/* Sole */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] uppercase font-bold text-emerald-950">Sole *</label>
                  {fetchedBaseline && newReturnForm.stockSole !== fetchedBaseline.sole && (
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                      <button
                        type="button"
                        onClick={() => handleResetReturnFieldToFetched('sole')}
                        title="Reset to fetched"
                        className="text-gray-400 hover:text-amber-800 cursor-pointer"
                      >
                        <Undo2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  required
                  list="returns-view-soles-list"
                  placeholder="e.g. Single Leather Sole / Dainite Sole"
                  value={newReturnForm.stockSole}
                  onChange={e => setNewReturnForm({ ...newReturnForm, stockSole: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full bg-white border-emerald-300 focus:border-emerald-600"
                />
                <datalist id="returns-view-soles-list">
                  {COMMON_SOLES.map(s => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              {/* Size */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] uppercase font-bold text-emerald-950">Size *</label>
                  {fetchedBaseline && newReturnForm.stockSize !== fetchedBaseline.size && (
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                      <button
                        type="button"
                        onClick={() => handleResetReturnFieldToFetched('size')}
                        title="Reset to fetched"
                        className="text-gray-400 hover:text-amber-800 cursor-pointer"
                      >
                        <Undo2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. UK 9 / US 9.5"
                  value={newReturnForm.stockSize}
                  onChange={e => {
                    const val = e.target.value;
                    setNewReturnForm({ ...newReturnForm, stockSize: val, oldSize: val });
                  }}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full bg-white font-mono border-emerald-300 font-semibold focus:border-emerald-600"
                />
              </div>

              {/* Width */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] uppercase font-bold text-emerald-950">Width *</label>
                  {fetchedBaseline && newReturnForm.stockWidth !== fetchedBaseline.width && (
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                      <button
                        type="button"
                        onClick={() => handleResetReturnFieldToFetched('width')}
                        title="Reset to fetched"
                        className="text-gray-400 hover:text-amber-800 cursor-pointer"
                      >
                        <Undo2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
                <select
                  value={newReturnForm.stockWidth}
                  onChange={e => setNewReturnForm({ ...newReturnForm, stockWidth: e.target.value as ShoeWidth })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-semibold bg-white border-emerald-300 text-emerald-950"
                >
                  {SHOE_WIDTHS.map(w => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>

              {/* Stock / Inspection Notes */}
              <div className="sm:col-span-2 md:col-span-2 lg:col-span-4">
                <label className="block text-[10px] uppercase font-bold text-emerald-950 mb-1">Stock / Return Inspection Notes</label>
                <input
                  type="text"
                  placeholder="Inspection condition, fitting notes, defect tags..."
                  value={newReturnForm.stockNotes}
                  onChange={e => setNewReturnForm({ ...newReturnForm, stockNotes: e.target.value, notes: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full bg-white border-emerald-300"
                />
              </div>
            </div>

            {/* Warehouse routing and Customization when Return Received = 'Y' */}
            {newReturnForm.returnReceived === 'Y' && (
              <div className="pt-3 border-t border-emerald-200/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-emerald-950 mb-1">Warehouse Location *</label>
                  <select
                    value={newReturnForm.receivingWarehouse}
                    onChange={e => setNewReturnForm({ ...newReturnForm, receivingWarehouse: e.target.value as any })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full font-semibold bg-white text-emerald-900 border-emerald-300"
                  >
                    <option value="IN">India Workshop (IN)</option>
                    <option value="US">US Boston Stock (US)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-emerald-950 mb-1">Customization *</label>
                  <select
                    value={newReturnForm.stockCustomization}
                    onChange={e => setNewReturnForm({ ...newReturnForm, stockCustomization: e.target.value as any })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full font-semibold bg-white text-emerald-900 border-emerald-300"
                  >
                    <option value="N">No (Standard Pair)</option>
                    <option value="Y">Yes (Bespoke / Customized)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-emerald-950 mb-1">Customization Remark</label>
                  <input
                    type="text"
                    placeholder="e.g. Brass initials on sole"
                    value={newReturnForm.stockCustomizationRemark}
                    onChange={e => setNewReturnForm({ ...newReturnForm, stockCustomizationRemark: e.target.value })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full bg-white border-emerald-300"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: LOGISTICS & RETURN TRACKING */}
          <div className="p-4 glass-panel rounded-2xl border border-neutral-200/80 bg-white/60 space-y-3">
            <h4 className="text-[11px] font-bold text-neutral-800 uppercase tracking-wide flex items-center gap-1.5">
              <span>3. Logistics, Dates &amp; Tracking</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Return Status</label>
                <select
                  value={newReturnForm.status}
                  onChange={e => setNewReturnForm({ ...newReturnForm, status: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-medium"
                >
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Replacement Done</label>
                <select
                  value={newReturnForm.replacementDone}
                  onChange={e => setNewReturnForm({ ...newReturnForm, replacementDone: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-medium"
                >
                  <option value="N">No (Pending)</option>
                  <option value="Y">Yes (Dispatched / Complete)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Return Initiated Date</label>
                <input
                  type="date"
                  value={newReturnForm.initiatedDate}
                  onChange={e => setNewReturnForm({ ...newReturnForm, initiatedDate: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Targeted Completion Date</label>
                <input
                  type="date"
                  value={newReturnForm.newTargetDate}
                  onChange={e => setNewReturnForm({ ...newReturnForm, newTargetDate: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Incoming Courier</label>
                <input
                  type="text"
                  placeholder="e.g. Delhivery / FedEx"
                  value={newReturnForm.incomingCourier}
                  onChange={e => setNewReturnForm({ ...newReturnForm, incomingCourier: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Incoming Tracking AWB</label>
                <input
                  type="text"
                  placeholder="e.g. 748392"
                  value={newReturnForm.incomingTrackingNo}
                  onChange={e => setNewReturnForm({ ...newReturnForm, incomingTrackingNo: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Exchange Outgoing AWB</label>
                <input
                  type="text"
                  placeholder="e.g. 993821"
                  value={newReturnForm.exchangeTracking}
                  onChange={e => setNewReturnForm({ ...newReturnForm, exchangeTracking: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Created By</label>
                <select
                  value={newReturnForm.createdBy}
                  onChange={e => setNewReturnForm({ ...newReturnForm, createdBy: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full font-medium"
                >
                  {AGENT_NAMES.map(agent => (
                    <option key={agent} value={agent}>{agent}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Region</label>
                <input
                  type="text"
                  placeholder="e.g. Domestic / International"
                  value={newReturnForm.region}
                  onChange={e => setNewReturnForm({ ...newReturnForm, region: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Country</label>
                <input
                  type="text"
                  placeholder="e.g. India / USA"
                  value={newReturnForm.country}
                  onChange={e => setNewReturnForm({ ...newReturnForm, country: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Remarks &amp; Notes</label>
                <input
                  type="text"
                  placeholder="Additional remarks on exchange, fit issue, or delivery..."
                  value={newReturnForm.notes}
                  onChange={e => setNewReturnForm({ ...newReturnForm, notes: e.target.value })}
                  className="glass-input rounded-xl px-3 py-2 text-xs w-full"
                />
              </div>
            </div>
          </div>

          {/* Form Action Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold py-2.5 px-6 rounded-xl text-xs cursor-pointer flex items-center justify-center gap-2 shadow-xs transition"
            >
              <Save className="w-4 h-4" />
              <span>Save &amp; Log {storeTab} Return</span>
            </button>
          </div>
        </form>
      )}

      {/* Return Stock Table */}
      {storeTab === 'Stock' ? (
        <div className="glass-panel rounded-3xl overflow-hidden transition-all">
          <div className="p-4 sm:p-5 border-b border-neutral-200/60 flex items-center justify-between bg-white/40">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-emerald-700" />
                <span>Return Stock Inventory</span>
                <span className="text-[11px] font-mono text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full font-semibold">
                  {filteredStock.length} pairs
                </span>
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Complete warehouse inventory logged from returns including Leather, Last, Sole, Size and Width specifications.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200/60 bg-white/30 text-neutral-500 uppercase font-medium text-[10px] tracking-wider">
                  <th className="py-3 px-3">S.No</th>
                  <th className="py-3 px-3">Receiving Date</th>
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-3">Leather</th>
                  <th className="py-3 px-3">Last</th>
                  <th className="py-3 px-3">Sole</th>
                  <th className="py-3 px-3">Size</th>
                  <th className="py-3 px-3">Width</th>
                  <th className="py-3 px-3">Custom</th>
                  <th className="py-3 px-4">Return Tracking AWB</th>
                  <th className="py-3 px-3">Warehouse</th>
                  <th className="py-3 px-4">Notes</th>
                  {canEdit && <th className="py-3 px-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/50">
                {filteredStock.map((item, idx) => {
                  const isEditingThisStock = editingStockId === item.id;
                  const displayProduct = item.product || item.item_name || 'BLKBRD Footwear';

                  return (
                    <tr key={item.id || idx} className="hover:bg-white/50 transition">
                      <td className="py-3.5 px-3 font-mono text-neutral-500 font-semibold whitespace-nowrap">
                        #{item.serial_number || idx + 1}
                      </td>

                      <td className="py-3.5 px-3 font-mono text-neutral-700 whitespace-nowrap">
                        {isEditingThisStock ? (
                          <input
                            type="date"
                            value={stockEditForm.receiving_date ?? item.receiving_date ?? ''}
                            onChange={e => setStockEditForm({ ...stockEditForm, receiving_date: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono"
                          />
                        ) : (
                          item.receiving_date || '—'
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-semibold text-neutral-900 whitespace-nowrap">
                        {isEditingThisStock ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={stockEditForm.order_id ?? item.order_id ?? ''}
                              onChange={e => setStockEditForm({ ...stockEditForm, order_id: e.target.value })}
                              className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono font-semibold w-24"
                            />
                            <button
                              type="button"
                              onClick={() => handleAutoFetchForStockInlineEdit(stockEditForm.order_id ?? item.order_id)}
                              disabled={isFetchingStockInlineEdit}
                              className="px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded border border-emerald-300 text-[10px] font-semibold flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
                              title="Auto-fetch and populate product, leather, last, sole, size and width from this order"
                            >
                              <Sparkles className={`w-2.5 h-2.5 ${isFetchingStockInlineEdit ? 'animate-spin' : ''}`} />
                              <span>Fetch</span>
                            </button>
                          </div>
                        ) : onViewOrderSummary && item.order_id ? (
                          <button
                            type="button"
                            onClick={() => onViewOrderSummary(item.order_id)}
                            className="hover:text-blue-600 hover:underline flex items-center gap-1 group text-left cursor-pointer transition font-mono font-semibold"
                            title="View Order Summary & History"
                          >
                            <span>#{item.order_id}</span>
                            <ExternalLink className="w-3 h-3 text-neutral-400 group-hover:text-blue-600 transition" />
                          </button>
                        ) : (
                          `#${item.order_id}`
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-neutral-900 whitespace-nowrap">
                        {isEditingThisStock ? (
                          <input
                            type="text"
                            value={stockEditForm.product ?? displayProduct}
                            onChange={e => setStockEditForm({ ...stockEditForm, product: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-medium"
                          />
                        ) : (
                          displayProduct
                        )}
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {isEditingThisStock ? (
                          <input
                            type="text"
                            value={stockEditForm.leather ?? item.leather ?? ''}
                            onChange={e => setStockEditForm({ ...stockEditForm, leather: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs"
                          />
                        ) : item.leather ? (
                          <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-200/80">
                            {item.leather}
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {isEditingThisStock ? (
                          <input
                            type="text"
                            value={stockEditForm.last ?? item.last ?? ''}
                            onChange={e => setStockEditForm({ ...stockEditForm, last: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs"
                          />
                        ) : item.last ? (
                          <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-100 text-neutral-800">
                            {item.last}
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {isEditingThisStock ? (
                          <input
                            type="text"
                            value={stockEditForm.sole ?? item.sole ?? ''}
                            onChange={e => setStockEditForm({ ...stockEditForm, sole: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs"
                          />
                        ) : item.sole ? (
                          <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium bg-stone-100 text-stone-800">
                            {item.sole}
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 font-mono font-bold text-neutral-900 whitespace-nowrap">
                        {isEditingThisStock ? (
                          <input
                            type="text"
                            value={stockEditForm.size ?? item.size ?? ''}
                            onChange={e => setStockEditForm({ ...stockEditForm, size: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono w-16"
                          />
                        ) : (
                          item.size || '—'
                        )}
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {isEditingThisStock ? (
                          <select
                            value={stockEditForm.width ?? item.width ?? 'E'}
                            onChange={e => setStockEditForm({ ...stockEditForm, width: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-bold"
                          >
                            {SHOE_WIDTHS.map(w => (
                              <option key={w} value={w}>{w}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-block font-mono font-bold text-[11px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                            {item.width || 'E'}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {isEditingThisStock ? (
                          <select
                            value={stockEditForm.customization ?? item.customization ?? 'N'}
                            onChange={e => setStockEditForm({ ...stockEditForm, customization: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-medium"
                          >
                            <option value="N">N</option>
                            <option value="Y">Y</option>
                          </select>
                        ) : (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${item.customization === 'Y' ? 'bg-purple-100 text-purple-800' : 'bg-neutral-100 text-neutral-600'}`}>
                            {item.customization || 'N'}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                        {isEditingThisStock ? (
                          <input
                            type="text"
                            value={stockEditForm.return_tracking_awb ?? item.return_tracking_awb ?? ''}
                            onChange={e => setStockEditForm({ ...stockEditForm, return_tracking_awb: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono"
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            <span>{item.return_tracking_awb || '—'}</span>
                            {item.return_tracking_awb && (
                              <button
                                onClick={() => copy(item.return_tracking_awb)}
                                className="p-0.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                              >
                                {copiedAwb === item.return_tracking_awb ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {isEditingThisStock ? (
                          <select
                            value={stockEditForm.warehouse ?? item.warehouse ?? 'IN'}
                            onChange={e => setStockEditForm({ ...stockEditForm, warehouse: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-bold"
                          >
                            <option value="IN">IN</option>
                            <option value="US">US</option>
                          </select>
                        ) : (
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${item.warehouse === 'US' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {item.warehouse || 'IN'}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-neutral-600 max-w-xs truncate">
                        {isEditingThisStock ? (
                          <input
                            type="text"
                            value={stockEditForm.notes ?? item.notes ?? ''}
                            onChange={e => setStockEditForm({ ...stockEditForm, notes: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs w-full"
                          />
                        ) : (
                          item.notes || item.customization_remark || '—'
                        )}
                      </td>

                      {canEdit && (
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {isEditingThisStock ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleSaveStock(item)}
                                className="bg-emerald-900 text-white px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer flex items-center gap-1 shadow-xs"
                              >
                                <Save className="w-3 h-3" /> Save
                              </button>
                              <button
                                onClick={cancelEditStock}
                                className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditStock(item)}
                              className="glass-button text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-medium cursor-pointer ml-auto"
                            >
                              <Edit2 className="w-3 h-3" /> Edit
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Global & LLC Returns Table */
        <div className="glass-panel rounded-3xl overflow-hidden transition-all">
          <div className="p-4 sm:p-5 border-b border-neutral-200/60 flex items-center justify-between bg-white/40">
            <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
              <span>{storeTab === 'Global' ? 'Global Returns' : 'LLC Returns'}</span>
              <span className="text-[11px] font-mono text-neutral-500 glass-pill px-2.5 py-0.5 rounded-full">
                {filteredReturns.length} records
              </span>
            </h3>
          </div>

          {viewMode === 'cards' ? (
            <div className="p-3.5 sm:p-5 bg-neutral-50/60">
              {filteredReturns.length === 0 ? (
                <div className="py-14 text-center text-xs text-neutral-400 bg-white rounded-2xl border border-neutral-200/80 p-6">
                  <RotateCcw className="w-8 h-8 mx-auto stroke-[1.5] text-neutral-300 mb-2" />
                  <p className="font-semibold text-neutral-700">No returns match the selected filters</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredReturns.map((item, idx) => {
                    const clientName = resolveCustomerName(
                      item.old_order_id || item.new_order_id,
                      item.client_name || item.customer_name
                    );
                    const isReceived = (item.return_received || '').trim().toUpperCase() === 'Y';
                    const isReplaced = (item.replacement_done || '').trim().toUpperCase() === 'Y';
                    const serialNumber = item.serial_number || idx + 1;
                    const specs = extractShoeDetailsFromReturn(item, {
                      delinquencies,
                      shopifyOrders,
                      bostonStock
                    });

                    const isExchange = (item.return_type || 'Exchange').toLowerCase() === 'exchange';
                    const isRefund = (item.return_type || '').toLowerCase() === 'refund';
                    const isRepair = `${item.reason || ''} ${item.remarks || ''} ${item.return_type || ''}`.toLowerCase().includes('repair') ||
                                     `${item.reason || ''} ${item.remarks || ''}`.toLowerCase().includes('rework');

                    return (
                      <div
                        key={item.id || idx}
                        className="p-4 rounded-2xl bg-white border border-neutral-200/90 shadow-2xs hover:shadow-md transition duration-200 space-y-3.5 flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          {/* 1. Header: Serial, Order Link, Store Badge, Type Badge, Received Badge */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-neutral-800 bg-neutral-100 px-2 py-0.5 rounded-md border border-neutral-200">
                                #{serialNumber}
                              </span>
                              {onViewOrderSummary && item.old_order_id ? (
                                <button
                                  type="button"
                                  onClick={() => onViewOrderSummary(item.old_order_id)}
                                  className="font-mono font-bold text-xs text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 cursor-pointer bg-blue-50/70 px-2 py-0.5 rounded-md border border-blue-200/70"
                                  title="View Order Summary & History"
                                >
                                  <span>#{item.old_order_id}</span>
                                  <ExternalLink className="w-3 h-3 text-blue-600" />
                                </button>
                              ) : (
                                <span className="font-mono font-bold text-xs text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded-md border border-neutral-200">
                                  #{item.old_order_id || '—'}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                                isExchange
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : isRefund
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : isRepair
                                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                                  : 'bg-neutral-100 text-neutral-800 border-neutral-200'
                              }`}>
                                {item.return_type || 'Exchange'}
                              </span>

                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                isReceived
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : 'bg-sky-50 text-sky-800 border-sky-200'
                              }`}>
                                {isReceived ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>Received</span>
                                  </>
                                ) : (
                                  <>
                                    <Truck className="w-3 h-3 text-sky-600" />
                                    <span>In Transit</span>
                                  </>
                                )}
                              </span>
                            </div>
                          </div>

                          {/* 2. Shoe Model Title & Craftsmanship Specifications Box */}
                          <div className="p-3 bg-neutral-50/90 rounded-xl border border-neutral-200/70 space-y-2">
                            <div className="flex items-center justify-between gap-1.5">
                              <h4 className="font-bold text-xs text-neutral-950 truncate flex items-center gap-1.5" title={specs.product}>
                                <ShoppingBag className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                                <span>{specs.product}</span>
                              </h4>
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white border border-neutral-200 text-neutral-800 shrink-0">
                                Width {specs.width}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap text-[10.5px]">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 font-semibold border border-amber-200/80">
                                <Tag className="w-2.5 h-2.5 text-amber-700" />
                                {specs.leather}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white text-neutral-700 font-medium border border-neutral-200/80">
                                {specs.last} • {specs.sole}
                              </span>
                            </div>
                          </div>

                          {/* 3. Size Swap & Replacement Order Journey */}
                          <div className="p-2.5 rounded-xl bg-blue-50/50 border border-blue-100/90 text-xs">
                            <div className="flex items-center justify-between text-[11px] mb-1 text-neutral-500 font-medium">
                              <span>Original Size</span>
                              <span className="flex items-center gap-1 text-blue-600 font-semibold">
                                <ArrowRight className="w-3 h-3" />
                                <span>Exchange Target</span>
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-neutral-900">{item.old_size || '—'}</span>
                                <span className="text-[10px] text-neutral-400">({item.old_order_id ? `#${item.old_order_id}` : 'Order'})</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-right">
                                <span className="font-mono font-bold text-blue-800">{item.new_size || item.old_size || '—'}</span>
                                {item.new_order_id ? (
                                  <span className="text-[10px] font-mono font-semibold text-blue-600 bg-white px-1.5 py-0.5 rounded border border-blue-200">
                                    #{item.new_order_id}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-neutral-400">
                                    {isRepair ? '(Rework)' : '(Pending)'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 4. Customer Profile & Reason Details */}
                          <div className="bg-white p-2.5 rounded-xl border border-neutral-200/70 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <User className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                                <span className="font-bold text-xs text-neutral-950 truncate" title={clientName}>
                                  {clientName}
                                </span>
                              </div>
                              <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-800 border border-neutral-200 shrink-0">
                                Reason: {item.reason || 'Size'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 border-t border-neutral-100">
                              <span>Region: <strong className="text-neutral-700">{item.region || 'Domestic'}</strong> ({item.country || 'India'})</span>
                              <span>Agent: <strong className="text-neutral-700">{item.created_by || 'Logistics Desk'}</strong></span>
                            </div>
                          </div>

                          {/* 5. Tracking details */}
                          {(item.incoming_tracking_awb || item.exchange_tracking_awb) && (
                            <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200/80 space-y-1.5 text-xs">
                              {item.incoming_tracking_awb && (
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] text-neutral-600 flex items-center gap-1">
                                    <Package className="w-3 h-3 text-blue-600" />
                                    <span>{item.incoming_courier_name || 'Courier'} AWB:</span>
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono font-semibold text-neutral-900">{item.incoming_tracking_awb}</span>
                                    <button
                                      type="button"
                                      onClick={() => copy(item.incoming_tracking_awb)}
                                      className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                                      title="Copy AWB"
                                    >
                                      {copiedAwb === item.incoming_tracking_awb ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                  </div>
                                </div>
                              )}
                              {item.exchange_tracking_awb && (
                                <div className="flex items-center justify-between pt-1 border-t border-neutral-200">
                                  <span className="text-[11px] text-neutral-600 flex items-center gap-1">
                                    <ArrowRight className="w-3 h-3 text-emerald-600" /> Exchange AWB:
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono font-semibold text-neutral-900">{item.exchange_tracking_awb}</span>
                                    <button
                                      type="button"
                                      onClick={() => copy(item.exchange_tracking_awb)}
                                      className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                                    >
                                      {copiedAwb === item.exchange_tracking_awb ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* 6. Return Progress Pipeline */}
                          <div className="p-2 rounded-xl bg-neutral-50/60 border border-neutral-200/60">
                            <div className="flex items-center justify-between text-[10px] font-semibold text-neutral-500 mb-1">
                              <span>Return Initiated</span>
                              <span>In Transit</span>
                              <span>Received</span>
                              <span>Resolved</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1 items-center">
                              <div className="h-1.5 rounded-full bg-blue-600" title="Step 1: Initiated"></div>
                              <div className={`h-1.5 rounded-full ${item.incoming_tracking_awb || isReceived ? 'bg-blue-600' : 'bg-neutral-200'}`} title="Step 2: In Transit"></div>
                              <div className={`h-1.5 rounded-full ${isReceived ? 'bg-emerald-600' : 'bg-neutral-200'}`} title="Step 3: Received in Workshop"></div>
                              <div className={`h-1.5 rounded-full ${isReplaced || item.status === 'Closed' ? 'bg-emerald-600' : 'bg-neutral-200'}`} title="Step 4: Resolved / Restocked"></div>
                            </div>
                          </div>

                          {/* 7. Dates & Remarks */}
                          <div className="flex items-center justify-between text-[11px] text-neutral-500 px-1">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-neutral-400" />
                              <span>Logged: {item.return_initiated || '—'}</span>
                            </span>
                            {item.targeted_date && (
                              <span className="font-medium text-neutral-700">
                                Target: {item.targeted_date}
                              </span>
                            )}
                          </div>

                          {item.remarks && (
                            <p className="text-[11px] text-neutral-600 bg-neutral-50 p-2 rounded-lg border border-neutral-200/60 line-clamp-2">
                              {item.remarks}
                            </p>
                          )}
                        </div>

                        {/* 8. Card Action Footer */}
                        <div className="pt-2.5 border-t border-neutral-100 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            {!isReceived && canEdit ? (
                              <button
                                type="button"
                                onClick={() => handleQuickReceiveReturn(item)}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1 shadow-2xs cursor-pointer transition"
                                title="Mark as received and route to workshop stock inventory"
                              >
                                <Check className="w-3 h-3" />
                                <span>Quick Receive</span>
                              </button>
                            ) : isReceived ? (
                              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>In Stock</span>
                              </span>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => openInventoryModalForReturn(item)}
                              className="text-xs text-emerald-800 hover:text-emerald-950 font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 flex items-center gap-1 cursor-pointer transition shadow-2xs"
                              title="Edit shoe specifications"
                            >
                              <Warehouse className="w-3 h-3 text-emerald-700" />
                              <span>Shoe Specs</span>
                            </button>
                          </div>

                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              className="glass-button text-xs px-3 py-1 rounded-full flex items-center gap-1.5 font-medium cursor-pointer ml-auto hover:bg-neutral-100 transition"
                            >
                              <Edit2 className="w-3 h-3 stroke-[1.5]" />
                              <span>Edit</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200/60 bg-white/30 text-neutral-500 uppercase font-medium text-[10px] tracking-wider">
                  <th className="py-3 px-3">S.No</th>
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-3">Return Type</th>
                  <th className="py-3 px-3">Reason</th>
                  <th className="py-3 px-3">Old Order</th>
                  <th className="py-3 px-3">New Order</th>
                  <th className="py-3 px-3">Old Size</th>
                  <th className="py-3 px-3">New Size</th>
                  <th className="py-3 px-3">Received</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Replacement</th>
                  <th className="py-3 px-3">Initiated</th>
                  <th className="py-3 px-3">Target Date</th>
                  <th className="py-3 px-3">Courier</th>
                  <th className="py-3 px-4">Incoming AWB</th>
                  <th className="py-3 px-4">Exchange AWB</th>
                  <th className="py-3 px-3">Region</th>
                  <th className="py-3 px-3">Country</th>
                  <th className="py-3 px-4">Created By</th>
                  <th className="py-3 px-4">Remarks</th>
                  {canEdit && <th className="py-3 px-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/50">
                {filteredReturns.map((item, idx) => {
                  const isEditing = editingId === item.id;
                  const clientName = item.client_name || item.customer_name || 'Customer';
                  const isReceived = (item.return_received || '').trim().toUpperCase() === 'Y';

                  return (
                    <tr key={item.id} className="hover:bg-white/50 transition">
                      <td className="py-3 px-3 font-mono text-neutral-500 font-semibold whitespace-nowrap">
                        #{item.serial_number || idx + 1}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-medium text-neutral-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.client_name ?? clientName}
                            onChange={e => setEditForm({ ...editForm, client_name: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs"
                          />
                        ) : (
                          clientName
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {isEditing ? (
                          <select
                            value={editForm.return_type ?? item.return_type ?? 'Exchange'}
                            onChange={e => setEditForm({ ...editForm, return_type: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-medium"
                          >
                            <option value="Exchange">Exchange</option>
                            <option value="Return">Return</option>
                            <option value="Refund">Refund</option>
                          </select>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-800">
                            {item.return_type || 'Exchange'}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {isEditing ? (
                          <select
                            value={editForm.reason ?? item.reason ?? 'Size'}
                            onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-medium"
                          >
                            <option value="Size">Size</option>
                            <option value="Wrong Item">Wrong Item</option>
                            <option value="Trial">Trial</option>
                          </select>
                        ) : (
                          <span className="text-neutral-700">{item.reason || 'Size'}</span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono font-semibold text-neutral-900 whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editForm.old_order_id ?? item.old_order_id ?? ''}
                              onChange={e => setEditForm({ ...editForm, old_order_id: e.target.value })}
                              className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono w-24"
                            />
                            <button
                              type="button"
                              onClick={() => handleAutoFetchForInlineEdit(editForm.old_order_id ?? item.old_order_id)}
                              disabled={isFetchingInlineEdit}
                              className="px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded border border-amber-300 text-[10px] font-semibold flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
                              title="Fetch details from this order"
                            >
                              <Sparkles className={`w-2.5 h-2.5 ${isFetchingInlineEdit ? 'animate-spin' : ''}`} />
                              <span>Fetch</span>
                            </button>
                          </div>
                        ) : onViewOrderSummary && item.old_order_id ? (
                          <button
                            type="button"
                            onClick={() => onViewOrderSummary(item.old_order_id)}
                            className="hover:text-blue-600 hover:underline flex items-center gap-1 group text-left cursor-pointer transition font-mono font-semibold"
                            title="View Order Summary & History"
                          >
                            <span>#{item.old_order_id}</span>
                            <ExternalLink className="w-3 h-3 text-neutral-400 group-hover:text-blue-600 transition" />
                          </button>
                        ) : (
                          `#${item.old_order_id || '—'}`
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono text-neutral-700 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.new_order_id ?? item.new_order_id ?? ''}
                            onChange={e => setEditForm({ ...editForm, new_order_id: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono"
                          />
                        ) : onViewOrderSummary && item.new_order_id ? (
                          <button
                            type="button"
                            onClick={() => onViewOrderSummary(item.new_order_id)}
                            className="hover:text-blue-600 hover:underline flex items-center gap-1 group text-left cursor-pointer transition font-mono"
                            title="View Order Summary & History"
                          >
                            <span>#{item.new_order_id}</span>
                            <ExternalLink className="w-3 h-3 text-neutral-400 group-hover:text-blue-600 transition" />
                          </button>
                        ) : (
                          item.new_order_id ? `#${item.new_order_id}` : '—'
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.old_size ?? item.old_size ?? ''}
                            onChange={e => setEditForm({ ...editForm, old_size: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono w-16"
                          />
                        ) : (
                          item.old_size || '—'
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.new_size ?? item.new_size ?? ''}
                            onChange={e => setEditForm({ ...editForm, new_size: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono w-16"
                          />
                        ) : (
                          item.new_size || '—'
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isEditing ? (
                            <select
                              value={editForm.return_received ?? item.return_received ?? 'N'}
                              onChange={e => setEditForm({ ...editForm, return_received: e.target.value })}
                              className="glass-input rounded-lg px-2 py-0.5 text-xs font-medium"
                            >
                              <option value="N">N</option>
                              <option value="Y">Y</option>
                            </select>
                          ) : (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${isReceived ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'}`}>
                              {isReceived ? 'Y' : 'N'}
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => openInventoryModalForReturn(item)}
                            className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300/80 inline-flex items-center gap-1 cursor-pointer transition shadow-2xs"
                            title="Log or update inventory specifications (Product, Leather, Last, Sole, Size, Width, Notes)"
                          >
                            <Warehouse className="w-2.5 h-2.5 text-emerald-700" />
                            <span>{isReceived ? 'Stock' : 'Log Stock'}</span>
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {isEditing ? (
                          <select
                            value={editForm.status ?? item.status ?? 'Open'}
                            onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-medium"
                          >
                            <option value="Open">Open</option>
                            <option value="Closed">Closed</option>
                          </select>
                        ) : (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${item.status === 'Closed' ? 'bg-neutral-200 text-neutral-700' : 'bg-blue-100 text-blue-800'}`}>
                            {item.status || 'Open'}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {isEditing ? (
                          <select
                            value={editForm.replacement_done ?? item.replacement_done ?? 'N'}
                            onChange={e => setEditForm({ ...editForm, replacement_done: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-medium"
                          >
                            <option value="N">N</option>
                            <option value="Y">Y</option>
                          </select>
                        ) : (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${(item.replacement_done || '').toUpperCase() === 'Y' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'}`}>
                            {item.replacement_done || 'N'}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono text-neutral-700 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editForm.return_initiated ?? item.return_initiated ?? ''}
                            onChange={e => setEditForm({ ...editForm, return_initiated: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono"
                          />
                        ) : (
                          item.return_initiated || '—'
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono text-neutral-700 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editForm.targeted_date ?? item.targeted_date ?? ''}
                            onChange={e => setEditForm({ ...editForm, targeted_date: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono"
                          />
                        ) : (
                          item.targeted_date || '—'
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap text-neutral-800">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.incoming_courier_name ?? item.incoming_courier_name ?? ''}
                            onChange={e => setEditForm({ ...editForm, incoming_courier_name: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs"
                          />
                        ) : (
                          item.incoming_courier_name || '—'
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.incoming_tracking_awb ?? item.incoming_tracking_awb ?? ''}
                            onChange={e => setEditForm({ ...editForm, incoming_tracking_awb: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono"
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            <span>{item.incoming_tracking_awb || '—'}</span>
                            {item.incoming_tracking_awb && (
                              <button
                                onClick={() => copy(item.incoming_tracking_awb)}
                                className="p-0.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                              >
                                {copiedAwb === item.incoming_tracking_awb ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.exchange_tracking_awb ?? item.exchange_tracking_awb ?? ''}
                            onChange={e => setEditForm({ ...editForm, exchange_tracking_awb: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono"
                          />
                        ) : (
                          item.exchange_tracking_awb || '—'
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.region ?? item.region ?? ''}
                            onChange={e => setEditForm({ ...editForm, region: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs"
                          />
                        ) : (
                          item.region || '—'
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.country ?? item.country ?? ''}
                            onChange={e => setEditForm({ ...editForm, country: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs"
                          />
                        ) : (
                          item.country || '—'
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-medium text-neutral-700">
                        {isEditing ? (
                          <select
                            value={editForm.created_by ?? item.created_by ?? 'Logistics Desk'}
                            onChange={e => setEditForm({ ...editForm, created_by: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs font-medium"
                          >
                            {AGENT_NAMES.map(agent => (
                              <option key={agent} value={agent}>{agent}</option>
                            ))}
                          </select>
                        ) : (
                          item.created_by || 'Logistics Desk'
                        )}
                      </td>

                      <td className="py-3 px-4 text-neutral-600 max-w-xs truncate">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.remarks ?? item.remarks ?? ''}
                            onChange={e => setEditForm({ ...editForm, remarks: e.target.value })}
                            className="glass-input rounded-lg px-2 py-0.5 text-xs w-full"
                          />
                        ) : (
                          item.remarks || '—'
                        )}
                      </td>

                      {canEdit && (
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleSaveReturn(item)}
                                className="bg-neutral-900 text-white px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openInventoryModalForReturn(item)}
                                className="text-xs text-emerald-800 hover:text-emerald-950 font-semibold px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 flex items-center gap-1 cursor-pointer transition shadow-2xs"
                                title="Edit shoe specifications (Product, Leather, Last, Sole, Size, Width)"
                              >
                                <Warehouse className="w-3 h-3 text-emerald-700" />
                                <span>Specs</span>
                              </button>
                              <button
                                onClick={() => startEdit(item)}
                                className="glass-button text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-medium cursor-pointer"
                              >
                                <Edit2 className="w-3 h-3" /> Edit
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* Inventory Logging / Updating Modal for Returns */}
      {inventoryModalItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-100 flex items-center justify-between bg-gradient-to-r from-emerald-50/70 to-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100/80 text-emerald-800 rounded-2xl border border-emerald-200">
                  <Warehouse className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Log / Update Return Stock Inventory
                  </h3>
                  <p className="text-xs text-neutral-500 font-mono mt-0.5">
                    Order ID: #{inventoryModalForm.orderId} • Customer: {inventoryModalItem.client_name || inventoryModalItem.customer_name || 'Customer'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInventoryModalItem(null)}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-xl hover:bg-neutral-100 cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveInventoryModal} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Order ID & Auto-fetch Header Bar */}
              <div className="bg-emerald-50/70 border border-emerald-300/80 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-700 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-emerald-950">Shoe Details & Specifications</h4>
                      <p className="text-[10px] text-emerald-800">
                        Auto-resolved from order database record • Fully editable below
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {inventoryFetchedBaseline && (
                      inventoryModalForm.product !== inventoryFetchedBaseline.product ||
                      inventoryModalForm.leather !== inventoryFetchedBaseline.leather ||
                      inventoryModalForm.last !== inventoryFetchedBaseline.last ||
                      inventoryModalForm.sole !== inventoryFetchedBaseline.sole ||
                      inventoryModalForm.size !== inventoryFetchedBaseline.size ||
                      inventoryModalForm.width !== inventoryFetchedBaseline.width
                    ) && (
                      <button
                        type="button"
                        onClick={handleResetAllInventoryToFetched}
                        className="text-[10px] font-semibold text-amber-800 hover:text-amber-950 bg-amber-100/90 hover:bg-amber-200 px-2 py-1 rounded-lg border border-amber-300 flex items-center gap-1 cursor-pointer transition"
                        title="Revert all shoe fields to fetched baseline"
                      >
                        <Undo2 className="w-2.5 h-2.5" />
                        <span>Reset All to Fetched</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleAutoFetchInventoryModalDetails(inventoryModalForm.orderId)}
                      disabled={isFetchingInventoryDetails || !inventoryModalForm.orderId}
                      className="text-[11px] font-semibold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 px-2.5 py-1 rounded-lg flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                      title="Re-fetch and overwrite with original order specs"
                    >
                      <RefreshCw className={`w-3 h-3 ${isFetchingInventoryDetails ? 'animate-spin' : ''}`} />
                      <span>{isFetchingInventoryDetails ? 'Fetching...' : 'Re-fetch from Order'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-emerald-200/60">
                  <label className="text-[10px] uppercase font-bold text-emerald-900 shrink-0">Order ID:</label>
                  <input
                    type="text"
                    value={inventoryModalForm.orderId}
                    onChange={e => setInventoryModalForm({ ...inventoryModalForm, orderId: e.target.value })}
                    placeholder="e.g. 10452"
                    className="glass-input rounded-lg px-2.5 py-1 text-xs font-mono font-bold w-32 bg-white border-emerald-300"
                  />
                  <span className="text-[10px] text-emerald-800">Change ID & click &quot;Re-fetch&quot; to test or resolve other orders</span>
                </div>

                {inventoryFetchFeedback && (
                  <div className="p-2 bg-emerald-100/90 text-emerald-900 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border border-emerald-300 animate-in fade-in">
                    <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>{inventoryFetchFeedback}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {/* Product Name */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] uppercase font-bold text-neutral-600">Product *</label>
                    {inventoryFetchedBaseline && inventoryModalForm.product !== inventoryFetchedBaseline.product && (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                        <button
                          type="button"
                          onClick={() => handleResetInventoryFieldToFetched('product')}
                          title="Reset to fetched"
                          className="text-gray-400 hover:text-amber-800 cursor-pointer"
                        >
                          <Undo2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    list="inventory-modal-products-list"
                    placeholder="e.g. Henrik Penny Loafer"
                    value={inventoryModalForm.product}
                    onChange={e => setInventoryModalForm({ ...inventoryModalForm, product: e.target.value })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full font-medium"
                  />
                  <datalist id="inventory-modal-products-list">
                    {Object.values(PRODUCT_DATABASE_RECORDS).map(r => (
                      <option key={r.modelName} value={r.modelName} />
                    ))}
                  </datalist>
                </div>

                {/* Leather */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] uppercase font-bold text-neutral-600">Leather *</label>
                    {inventoryFetchedBaseline && inventoryModalForm.leather !== inventoryFetchedBaseline.leather && (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                        <button
                          type="button"
                          onClick={() => handleResetInventoryFieldToFetched('leather')}
                          title="Reset to fetched"
                          className="text-gray-400 hover:text-amber-800 cursor-pointer"
                        >
                          <Undo2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    list="inventory-modal-leathers-list"
                    placeholder="e.g. Snuff Suede / French Boxcalf"
                    value={inventoryModalForm.leather}
                    onChange={e => setInventoryModalForm({ ...inventoryModalForm, leather: e.target.value })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full"
                  />
                  <datalist id="inventory-modal-leathers-list">
                    {COMMON_LEATHERS.map(l => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </div>

                {/* Last */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] uppercase font-bold text-neutral-600">Last *</label>
                    {inventoryFetchedBaseline && inventoryModalForm.last !== inventoryFetchedBaseline.last && (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                        <button
                          type="button"
                          onClick={() => handleResetInventoryFieldToFetched('last')}
                          title="Reset to fetched"
                          className="text-gray-400 hover:text-amber-800 cursor-pointer"
                        >
                          <Undo2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    list="inventory-modal-lasts-list"
                    placeholder="e.g. Rui Last / Oscar Last"
                    value={inventoryModalForm.last}
                    onChange={e => setInventoryModalForm({ ...inventoryModalForm, last: e.target.value })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full"
                  />
                  <datalist id="inventory-modal-lasts-list">
                    {COMMON_LASTS.map(lt => (
                      <option key={lt} value={lt} />
                    ))}
                  </datalist>
                </div>

                {/* Sole */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] uppercase font-bold text-neutral-600">Sole *</label>
                    {inventoryFetchedBaseline && inventoryModalForm.sole !== inventoryFetchedBaseline.sole && (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                        <button
                          type="button"
                          onClick={() => handleResetInventoryFieldToFetched('sole')}
                          title="Reset to fetched"
                          className="text-gray-400 hover:text-amber-800 cursor-pointer"
                        >
                          <Undo2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    list="inventory-modal-soles-list"
                    placeholder="e.g. Dainite Sole / Vibram Commando"
                    value={inventoryModalForm.sole}
                    onChange={e => setInventoryModalForm({ ...inventoryModalForm, sole: e.target.value })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full"
                  />
                  <datalist id="inventory-modal-soles-list">
                    {COMMON_SOLES.map(s => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>

                {/* Size */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] uppercase font-bold text-neutral-600">Size *</label>
                    {inventoryFetchedBaseline && inventoryModalForm.size !== inventoryFetchedBaseline.size && (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                        <button
                          type="button"
                          onClick={() => handleResetInventoryFieldToFetched('size')}
                          title="Reset to fetched"
                          className="text-gray-400 hover:text-amber-800 cursor-pointer"
                        >
                          <Undo2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g. UK 9 / US 9.5"
                    value={inventoryModalForm.size}
                    onChange={e => setInventoryModalForm({ ...inventoryModalForm, size: e.target.value })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono font-semibold"
                  />
                </div>

                {/* Width */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] uppercase font-bold text-neutral-600">Width *</label>
                    {inventoryFetchedBaseline && inventoryModalForm.width !== inventoryFetchedBaseline.width && (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                        <button
                          type="button"
                          onClick={() => handleResetInventoryFieldToFetched('width')}
                          title="Reset to fetched"
                          className="text-gray-400 hover:text-amber-800 cursor-pointer"
                        >
                          <Undo2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <select
                    value={inventoryModalForm.width}
                    onChange={e => setInventoryModalForm({ ...inventoryModalForm, width: e.target.value as ShoeWidth })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full font-semibold"
                  >
                    {SHOE_WIDTHS.map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>

                {/* Warehouse Location */}
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Warehouse *</label>
                  <select
                    value={inventoryModalForm.warehouse}
                    onChange={e => setInventoryModalForm({ ...inventoryModalForm, warehouse: e.target.value as any })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full font-medium"
                  >
                    <option value="IN">India Workshop (IN)</option>
                    <option value="US">US Boston Stock (US)</option>
                  </select>
                </div>

                {/* Receiving Date */}
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Receiving Date *</label>
                  <input
                    type="date"
                    required
                    value={inventoryModalForm.receivingDate}
                    onChange={e => setInventoryModalForm({ ...inventoryModalForm, receivingDate: e.target.value })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono"
                  />
                </div>

                {/* Return Tracking AWB */}
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Return Tracking AWB</label>
                  <input
                    type="text"
                    placeholder="e.g. 88392019"
                    value={inventoryModalForm.returnTrackingAwb}
                    onChange={e => setInventoryModalForm({ ...inventoryModalForm, returnTrackingAwb: e.target.value })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono"
                  />
                </div>

                {/* Customization */}
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Customization</label>
                  <select
                    value={inventoryModalForm.customization}
                    onChange={e => setInventoryModalForm({ ...inventoryModalForm, customization: e.target.value })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full font-medium"
                  >
                    <option value="N">No (N)</option>
                    <option value="Y">Yes (Y)</option>
                  </select>
                </div>

                {/* Customization Remark */}
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Customization Remark</label>
                  <input
                    type="text"
                    placeholder="e.g. Brass initials on sole"
                    value={inventoryModalForm.customizationRemark}
                    onChange={e => setInventoryModalForm({ ...inventoryModalForm, customizationRemark: e.target.value })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full"
                  />
                </div>

                {/* Notes */}
                <div className="sm:col-span-2 md:col-span-3">
                  <label className="block text-[10px] uppercase font-bold text-neutral-600 mb-1">Notes</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Condition report, fit issues, workshop inspection details..."
                    value={inventoryModalForm.notes}
                    onChange={e => setInventoryModalForm({ ...inventoryModalForm, notes: e.target.value })}
                    className="glass-input rounded-xl px-3 py-2 text-xs w-full resize-none"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setInventoryModalItem(null)}
                  className="px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save to Return Stock</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};