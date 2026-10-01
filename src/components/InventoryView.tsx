import React, { useState, useEffect, useMemo } from 'react';
import { TrialPairItem, BostonStockItem, UserRole, ShoeWidth } from '../types';
import { TrialPairsView } from './TrialPairsView';
import { BostonStockView } from './BostonStockView';
import {
  fetchReturnStock,
  insertReturnStock,
  updateReturnStock,
  deleteReturnStock,
  fetchReturns
} from '../services/supabaseReturnsService';
import { realtimeSync } from '../services/realtimeSync';
import { exportToCsv } from '../utils/csvParser';
import { lookupAndExtractShoeDetails } from '../utils/shoeDetailsExtractor';
import {
  Boxes,
  Footprints,
  Warehouse,
  Sparkles,
  Search,
  Plus,
  RefreshCw,
  LayoutGrid,
  List,
  Download,
  AlertTriangle,
  Wrench,
  CheckCircle2,
  Trash2,
  Edit2,
  Save,
  X,
  Tag,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

export interface WarehouseStockItem {
  id: string;
  serial_number?: number | string;
  order_id: string;
  item_name?: string;
  product?: string;
  leather?: string;
  last?: string;
  sole?: string;
  size: string;
  width?: ShoeWidth | string;
  receiving_date?: string;
  return_tracking_awb?: string;
  warehouse: 'IN' | 'US';
  customization?: string;
  customization_remark?: string;
  notes?: string;
  status?: 'Available' | 'Under Repair / Rework' | 'Reserved for Exchange' | string;
  repair_notes?: string;
  reallocated_to_order_id?: string;
}

interface InventoryViewProps {
  role: UserRole;
  trialPairs: TrialPairItem[];
  bostonStock: BostonStockItem[];
  onUpdateTrial: (item: TrialPairItem) => void;
  onAddTrial: (item: Omit<TrialPairItem, 'id' | 'sNo'>) => void;
  onUpdateBostonStock: (item: BostonStockItem) => void;
  onAddBostonStock: (item: Omit<BostonStockItem, 'id' | 'sNo'>) => void;
  onRefreshAll: () => void;
  onViewOrderSummary: (orderId: string) => void;
  lookupContext?: any;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  role,
  trialPairs,
  bostonStock,
  onUpdateTrial,
  onAddTrial,
  onUpdateBostonStock,
  onAddBostonStock,
  onRefreshAll,
  onViewOrderSummary,
  lookupContext
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'warehouse' | 'trials' | 'boston'>('warehouse');
  const [stockList, setStockList] = useState<WarehouseStockItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState<'ALL' | 'IN' | 'US'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Available' | 'Under Repair / Rework' | 'Reserved for Exchange'>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Add Item Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    order_id: '',
    product: '',
    leather: '',
    last: '',
    sole: '',
    size: 'UK 9 / US 9.5',
    width: 'E' as ShoeWidth,
    warehouse: 'IN' as 'IN' | 'US',
    status: 'Available',
    receiving_date: new Date().toISOString().split('T')[0],
    return_tracking_awb: '',
    customization: 'N',
    customization_remark: '',
    notes: ''
  });
  const [isAutoFetching, setIsAutoFetching] = useState(false);

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<WarehouseStockItem>>({});

  // Re-allocation modal
  const [reallocatingItem, setReallocatingItem] = useState<WarehouseStockItem | null>(null);
  const [reallocateOrderId, setReallocateOrderId] = useState('');

  const canEdit = role === 'admin' || role === 'logistics';

  // Load actual inventory data from Supabase tables return_stock_in & return_stock_us and received returns
  useEffect(() => {
    loadInventoryData();
    const unsub = realtimeSync.onTableUpdated((evt) => {
      if (evt.table === 'all' || evt.table.includes('stock') || evt.table.includes('returns')) {
        loadInventoryData();
      }
    });
    return () => unsub();
  }, []);

  const loadInventoryData = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [stockIn, stockUs, returnsGlobal, returnsLlc] = await Promise.all([
        fetchReturnStock('return_stock_in').catch(() => []),
        fetchReturnStock('return_stock_us').catch(() => []),
        fetchReturns('returns_global').catch(() => []),
        fetchReturns('returns_llc').catch(() => [])
      ]);

      const normalizedIn: WarehouseStockItem[] = (stockIn || []).map(item => normalizeItem(item, 'IN'));
      const normalizedUs: WarehouseStockItem[] = (stockUs || []).map(item => normalizeItem(item, 'US'));

      const existingOrderIds = new Set<string>();
      [...normalizedIn, ...normalizedUs].forEach(i => {
        if (i.order_id) existingOrderIds.add(String(i.order_id).replace(/^#/, '').trim().toUpperCase());
      });

      // Seamlessly integrate returns where return_received === 'Y' that aren't yet directly in stock tables
      const extraFromReturns: WarehouseStockItem[] = [];
      const allReceivedReturns = [
        ...(returnsGlobal || []).map((r: any) => ({ ...r, _table: 'returns_global', _wh: 'IN' })),
        ...(returnsLlc || []).map((r: any) => ({ ...r, _table: 'returns_llc', _wh: 'US' }))
      ].filter((r: any) => (r.return_received || '').toUpperCase() === 'Y');

      for (const ret of allReceivedReturns) {
        const cleanOrderId = String(ret.old_order_id || ret.order_id || '').replace(/^#/, '').trim().toUpperCase();
        if (cleanOrderId && !existingOrderIds.has(cleanOrderId)) {
          existingOrderIds.add(cleanOrderId);
          const details = lookupAndExtractShoeDetails(cleanOrderId, lookupContext || {});
          extraFromReturns.push(normalizeItem({
            id: `ret-synced-${ret.id || cleanOrderId}`,
            order_id: cleanOrderId,
            product: details.product || ret.remarks || 'BLKBRD Goodyear Welted',
            item_name: details.product || ret.remarks || 'BLKBRD Goodyear Welted',
            leather: details.leather || 'French Box Calf',
            last: details.last || 'Classic Round',
            sole: details.sole || 'Dainite Rubber Sole',
            size: ret.old_size || details.size || 'Standard Size',
            width: details.width || 'E',
            receiving_date: ret.return_initiated || new Date().toISOString().split('T')[0],
            return_tracking_awb: ret.incoming_tracking_awb || '',
            warehouse: ret._wh || 'IN',
            notes: ret.remarks || `Received Return (${ret.reason || 'Size'})`,
            reason: ret.reason,
            return_type: ret.return_type
          }, ret._wh));
        }
      }

      setStockList([...normalizedIn, ...normalizedUs, ...extraFromReturns]);
    } catch (err: any) {
      console.error('Failed to load inventory from Supabase:', err);
      setLoadError(err.message || 'Could not load inventory tables. Please check connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const normalizeItem = (item: any, defaultWarehouse: 'IN' | 'US'): WarehouseStockItem => {
    const rawRemarks = (item.notes || item.remarks || item.customization_remark || '').toLowerCase();
    const rawProd = (item.product || item.item_name || '').toLowerCase();
    const rawReason = (item.reason || item.return_reason || '').toLowerCase();
    const rawType = (item.return_type || item.type || '').toLowerCase();
    
    // Check if item needs repair or rework
    const isRepair = rawRemarks.includes('repair') ||
      rawRemarks.includes('rework') ||
      rawRemarks.includes('resole') ||
      rawRemarks.includes('damage') ||
      rawRemarks.includes('alteration') ||
      rawProd.includes('repair') ||
      rawReason.includes('repair') ||
      rawType.includes('repair') ||
      (item.status && item.status.toLowerCase().includes('repair'));

    const isReserved = (item.status && item.status.toLowerCase().includes('reserved')) ||
      Boolean(item.reallocated_to_order_id);

    const status = isRepair
      ? 'Under Repair / Rework'
      : isReserved
      ? 'Reserved for Exchange'
      : (item.status || 'Available');

    return {
      id: item.id || `stk-${Math.random()}`,
      serial_number: item.serial_number,
      order_id: String(item.order_id || '').replace(/^#/, '').trim(),
      product: item.product || item.item_name || 'BLKBRD Goodyear Welted',
      item_name: item.item_name || item.product || 'BLKBRD Goodyear Welted',
      leather: item.leather || 'French Box Calf',
      last: item.last || 'Classic Round',
      sole: item.sole || 'Dainite Rubber Sole',
      size: item.size || 'Standard Size',
      width: item.width || 'E',
      receiving_date: item.receiving_date || new Date().toISOString().split('T')[0],
      return_tracking_awb: item.return_tracking_awb || '',
      warehouse: (item.warehouse === 'US' || defaultWarehouse === 'US') ? 'US' : 'IN',
      customization: item.customization || 'N',
      customization_remark: item.customization_remark || '',
      notes: item.notes || item.remarks || '',
      status,
      reallocated_to_order_id: item.reallocated_to_order_id
    };
  };

  // Auto-fetch shoe specs from order ID when logging new inventory
  const handleAutoFetchSpecs = async (rawOrderId?: string) => {
    const orderIdToLookup = (rawOrderId || addForm.order_id).replace(/^#/, '').trim();
    if (!orderIdToLookup) return;

    setIsAutoFetching(true);
    try {
      const details = lookupAndExtractShoeDetails(orderIdToLookup, lookupContext || {});
      setAddForm(prev => ({
        ...prev,
        order_id: orderIdToLookup,
        product: details.product || prev.product || 'Goodyear Welted Footwear',
        leather: details.leather || prev.leather,
        last: details.last || prev.last,
        sole: details.sole || prev.sole,
        size: details.size || prev.size,
        width: (details.width as ShoeWidth) || prev.width,
        notes: details.notes || prev.notes
      }));
    } catch (_e) {
    } finally {
      setIsAutoFetching(false);
    }
  };

  // Add new inventory item to Supabase
  const handleCreateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.order_id.trim()) {
      alert('Order ID is required to log inventory.');
      return;
    }

    const cleanOrderId = addForm.order_id.replace(/^#/, '').trim();
    const isUs = addForm.warehouse === 'US';
    const targetTable = isUs ? 'return_stock_us' : 'return_stock_in';

    const payload = {
      serial_number: stockList.length + 1,
      receiving_date: addForm.receiving_date || new Date().toISOString().split('T')[0],
      order_id: cleanOrderId,
      item_name: addForm.product || 'BLKBRD Footwear',
      product: addForm.product || 'BLKBRD Footwear',
      leather: addForm.leather,
      last: addForm.last,
      sole: addForm.sole,
      size: addForm.size,
      width: addForm.width,
      warehouse: addForm.warehouse,
      customization: addForm.customization,
      customization_remark: addForm.customization_remark,
      return_tracking_awb: addForm.return_tracking_awb,
      notes: `${addForm.notes || ''} [Status: ${addForm.status}]`.trim()
    };

    try {
      await insertReturnStock(targetTable, payload);
      await loadInventoryData();
      onRefreshAll();
      setIsAddModalOpen(false);
      setAddForm({
        order_id: '',
        product: '',
        leather: '',
        last: '',
        sole: '',
        size: 'UK 9 / US 9.5',
        width: 'E',
        warehouse: 'IN',
        status: 'Available',
        receiving_date: new Date().toISOString().split('T')[0],
        return_tracking_awb: '',
        customization: 'N',
        customization_remark: '',
        notes: ''
      });
    } catch (err: any) {
      alert(`Failed to save inventory to ${targetTable}: ${err.message}`);
    }
  };

  // Inline edit handlers
  const startEdit = (item: WarehouseStockItem) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveEdit = async (item: WarehouseStockItem) => {
    const isUs = (editForm.warehouse || item.warehouse) === 'US';
    const targetTable = isUs ? 'return_stock_us' : 'return_stock_in';

    const updatedPayload = {
      order_id: (editForm.order_id || item.order_id).replace(/^#/, '').trim(),
      item_name: editForm.product || editForm.item_name || item.product,
      product: editForm.product || editForm.item_name || item.product,
      leather: editForm.leather ?? item.leather,
      last: editForm.last ?? item.last,
      sole: editForm.sole ?? item.sole,
      size: editForm.size ?? item.size,
      width: editForm.width ?? item.width,
      warehouse: isUs ? 'US' : 'IN',
      receiving_date: editForm.receiving_date ?? item.receiving_date,
      return_tracking_awb: editForm.return_tracking_awb ?? item.return_tracking_awb,
      customization: editForm.customization ?? item.customization,
      customization_remark: editForm.customization_remark ?? item.customization_remark,
      notes: `${editForm.notes ?? item.notes} [Status: ${editForm.status ?? item.status}]`.trim()
    };

    try {
      if (item.id.startsWith('ret-synced-')) {
        await insertReturnStock(targetTable, {
          order_id: item.order_id,
          item_name: item.product || item.item_name,
          product: item.product,
          leather: item.leather,
          last: item.last,
          sole: item.sole,
          size: item.size,
          width: item.width,
          notes: updatedPayload.notes,
          customization: item.customization,
          customization_remark: item.customization_remark,
          return_tracking_awb: item.return_tracking_awb,
          warehouse: item.warehouse
        });
      } else {
        await updateReturnStock(targetTable, item.id, updatedPayload);
      }
      await loadInventoryData();
      onRefreshAll();
      setEditingId(null);
      setEditForm({});
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    }
  };

  // Quick action: Mark repair completed -> Move to Available
  const handleMarkRepairCompleted = async (item: WarehouseStockItem) => {
    const isUs = item.warehouse === 'US';
    const targetTable = isUs ? 'return_stock_us' : 'return_stock_in';

    const cleanNotes = (item.notes || '')
      .replace(/\[Status:[^\]]+\]/g, '')
      .replace(/needs repair/gi, 'repaired')
      .replace(/under repair/gi, 'repair finished')
      .replace(/repair/gi, 'serviced');

    const updatedNotes = `${cleanNotes} | Repair Completed & Inspected on ${new Date().toLocaleDateString('en-GB')} by Workshop`.trim();

    try {
      if (item.id.startsWith('ret-synced-')) {
        await insertReturnStock(targetTable, {
          order_id: item.order_id,
          item_name: item.product || item.item_name,
          product: item.product,
          leather: item.leather,
          last: item.last,
          sole: item.sole,
          size: item.size,
          width: item.width,
          notes: updatedNotes,
          customization: item.customization,
          customization_remark: item.customization_remark,
          return_tracking_awb: item.return_tracking_awb,
          warehouse: item.warehouse
        });
      } else {
        await updateReturnStock(targetTable, item.id, { notes: updatedNotes });
      }
      await loadInventoryData();
      onRefreshAll();
    } catch (err: any) {
      alert(`Could not mark repair completed: ${err.message}`);
    }
  };

  // Re-allocate to exchange order
  const handleConfirmReallocate = async () => {
    if (!reallocatingItem || !reallocateOrderId.trim()) return;

    const isUs = reallocatingItem.warehouse === 'US';
    const targetTable = isUs ? 'return_stock_us' : 'return_stock_in';
    const targetOrder = reallocateOrderId.trim().toUpperCase();

    const updatedPayload = {
      notes: `${reallocatingItem.notes || ''} [Reserved for Exchange: ${targetOrder} on ${new Date().toLocaleDateString('en-GB')}]`.trim()
    };

    try {
      await updateReturnStock(targetTable, reallocatingItem.id, updatedPayload);
      await loadInventoryData();
      onRefreshAll();
      setReallocatingItem(null);
      setReallocateOrderId('');
    } catch (err: any) {
      alert(`Failed to reserve item: ${err.message}`);
    }
  };

  // Delete inventory item from Supabase
  const handleDeleteStock = async (item: WarehouseStockItem) => {
    if (!window.confirm(`Are you sure you want to remove #${item.order_id} (${item.product} - ${item.size}) from inventory?`)) {
      return;
    }
    const isUs = item.warehouse === 'US';
    const targetTable = isUs ? 'return_stock_us' : 'return_stock_in';

    try {
      await deleteReturnStock(targetTable, item.id);
      await loadInventoryData();
      onRefreshAll();
    } catch (err: any) {
      alert(`Failed to delete inventory record: ${err.message}`);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    const exportData = filteredStock.map((item, idx) => ({
      'S.No': item.serial_number || idx + 1,
      'Order ID': `#${item.order_id}`,
      'Product / Model': item.product || item.item_name || '',
      'Leather': item.leather || '',
      'Last': item.last || '',
      'Sole': item.sole || '',
      'Size': item.size || '',
      'Width': item.width || 'E',
      'Warehouse': item.warehouse,
      'Status': item.status || 'Available',
      'Receiving Date': item.receiving_date || '',
      'Return AWB': item.return_tracking_awb || '',
      'Customization': item.customization || 'N',
      'Customization Remark': item.customization_remark || '',
      'Notes': item.notes || ''
    }));
    exportToCsv(exportData, `BLKBRD_Warehouse_Inventory_${new Date().toISOString().split('T')[0]}.csv`);
  };

  // Filtered Items
  const filteredStock = useMemo(() => {
    return stockList.filter(item => {
      // Warehouse filter
      if (warehouseFilter !== 'ALL' && item.warehouse !== warehouseFilter) return false;

      // Status filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'Available' && item.status !== 'Available') return false;
        if (statusFilter === 'Under Repair / Rework' && item.status !== 'Under Repair / Rework') return false;
        if (statusFilter === 'Reserved for Exchange' && item.status !== 'Reserved for Exchange') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const oId = (item.order_id || '').toLowerCase();
        const prod = (item.product || item.item_name || '').toLowerCase();
        const ltr = (item.leather || '').toLowerCase();
        const lst = (item.last || '').toLowerCase();
        const sz = (item.size || '').toLowerCase();
        const awb = (item.return_tracking_awb || '').toLowerCase();
        return oId.includes(q) || prod.includes(q) || ltr.includes(q) || lst.includes(q) || sz.includes(q) || awb.includes(q);
      }

      return true;
    });
  }, [stockList, warehouseFilter, statusFilter, searchQuery]);

  // Statistics
  const totalStockCount = stockList.length;
  // Available stock strictly excludes items under repair or rework
  const availableCount = stockList.filter(s => s.status === 'Available').length;
  const underRepairCount = stockList.filter(s => s.status === 'Under Repair / Rework').length;
  const reservedCount = stockList.filter(s => s.status === 'Reserved for Exchange').length;
  const inWarehouseCount = stockList.filter(s => s.warehouse === 'IN').length;
  const usWarehouseCount = stockList.filter(s => s.warehouse === 'US').length;

  return (
    <div className="space-y-4">
      {/* Top Sub-navigation for Master Inventory Segment */}
      <div className="glass-panel p-2 rounded-2xl flex flex-wrap items-center justify-between gap-2 border border-neutral-200/80 bg-white/70">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 1. Warehouse Stock (Returned, Available & Repair Stock) */}
          <button
            type="button"
            onClick={() => setActiveSubTab('warehouse')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'warehouse'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            <Boxes className="w-3.5 h-3.5 text-amber-400" />
            <span>Warehouse Stock</span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
              activeSubTab === 'warehouse' ? 'bg-white/20 text-white' : 'bg-neutral-200/80 text-neutral-700'
            }`}>
              {totalStockCount}
            </span>
          </button>

          {/* 2. Fit Trial Pairs */}
          <button
            type="button"
            onClick={() => setActiveSubTab('trials')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'trials'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            <Footprints className="w-3.5 h-3.5" />
            <span>Fit Trial Pairs</span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
              activeSubTab === 'trials' ? 'bg-white/20 text-white' : 'bg-neutral-200/80 text-neutral-700'
            }`}>
              {trialPairs.length}
            </span>
          </button>

          {/* 3. Boston Hub Stock */}
          <button
            type="button"
            onClick={() => setActiveSubTab('boston')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'boston'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            <Warehouse className="w-3.5 h-3.5 text-blue-600" />
            <span>Boston Hub Stock</span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
              activeSubTab === 'boston' ? 'bg-white/20 text-white' : 'bg-neutral-200/80 text-neutral-700'
            }`}>
              {bostonStock.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-neutral-500 font-mono pr-2">
          {activeSubTab === 'warehouse' ? (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <strong className="text-emerald-700 font-bold">{availableCount} Available</strong>
              {underRepairCount > 0 && (
                <span className="text-amber-700 font-semibold">• {underRepairCount} In Repair</span>
              )}
            </span>
          ) : activeSubTab === 'trials' ? (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              {trialPairs.filter(t => t.dispatchStatus === 'Dispatched' || t.status === 'Active Trial').length} Active Trials
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {bostonStock.filter(b => b.status === 'Available').length} Available US
            </span>
          )}
        </div>
      </div>

      {/* RENDER ACTIVE SUBTAB CONTENT */}
      {activeSubTab === 'warehouse' ? (
        <div className="space-y-4">
          {/* Master Inventory Highlights Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. Total Pairs */}
            <div className="bg-white/90 border border-neutral-200/80 rounded-2xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-neutral-500 mb-1">
                <span className="text-xs font-medium">Total Warehouse Stock</span>
                <Boxes className="w-4 h-4 text-neutral-700" />
              </div>
              <div className="text-xl font-bold font-mono text-neutral-900">{totalStockCount}</div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Physical logged pairs</p>
            </div>

            {/* 2. Available to Re-use (Strictly excluding repair items) */}
            <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-2xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-emerald-800 mb-1">
                <span className="text-xs font-semibold">Available for Re-use</span>
                <Sparkles className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-bold font-mono text-emerald-950">{availableCount}</div>
              <p className="text-[11px] text-emerald-700 mt-0.5">Ready for immediate dispatch</p>
            </div>

            {/* 3. Under Repair / Rework (Explicitly excluded from available inventory) */}
            <div className={`rounded-2xl p-3.5 shadow-2xs border ${
              underRepairCount > 0
                ? 'bg-amber-50/80 border-amber-300/80 text-amber-950'
                : 'bg-neutral-50/80 border-neutral-200/70 text-neutral-600'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-amber-600" />
                  Under Repair / Rework
                </span>
                {underRepairCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900">
                    Excluded
                  </span>
                )}
              </div>
              <div className="text-xl font-bold font-mono text-amber-950">{underRepairCount}</div>
              <p className="text-[11px] text-amber-800/80 mt-0.5">Requires workshop attention</p>
            </div>

            {/* 4. Warehouse Split (India vs Boston Hub) */}
            <div className="bg-blue-50/70 border border-blue-200/60 rounded-2xl p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-blue-800 mb-1">
                <span className="text-xs font-semibold">Warehouse Facilities</span>
                <Warehouse className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl font-bold font-mono text-blue-950 flex items-center gap-2">
                <span>IN: {inWarehouseCount}</span>
                <span className="text-neutral-400 font-normal">|</span>
                <span>US: {usWarehouseCount}</span>
              </div>
              <p className="text-[11px] text-blue-700 mt-0.5">India Factory &amp; Boston Hub</p>
            </div>
          </div>

          {/* Filter Bar & Toolbar */}
          <div className="glass-panel p-3.5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-3 border border-neutral-200/80 bg-white/70">
            <div className="flex items-center gap-3 w-full md:w-auto flex-1 flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search model, size, leather, order ID or AWB..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>

              {/* Warehouse Filter */}
              <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl border border-neutral-200 text-xs">
                <span className="text-[10px] font-bold text-neutral-500 uppercase px-1.5">Warehouse:</span>
                <button
                  type="button"
                  onClick={() => setWarehouseFilter('ALL')}
                  className={`px-2 py-0.5 rounded-lg font-medium transition cursor-pointer ${
                    warehouseFilter === 'ALL' ? 'bg-neutral-900 text-white shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  All ({totalStockCount})
                </button>
                <button
                  type="button"
                  onClick={() => setWarehouseFilter('IN')}
                  className={`px-2 py-0.5 rounded-lg font-medium transition cursor-pointer ${
                    warehouseFilter === 'IN' ? 'bg-emerald-700 text-white shadow-2xs' : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  IN ({inWarehouseCount})
                </button>
                <button
                  type="button"
                  onClick={() => setWarehouseFilter('US')}
                  className={`px-2 py-0.5 rounded-lg font-medium transition cursor-pointer ${
                    warehouseFilter === 'US' ? 'bg-blue-700 text-white shadow-2xs' : 'text-blue-700 hover:bg-blue-50'
                  }`}
                >
                  US ({usWarehouseCount})
                </button>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1 overflow-x-auto text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
                    statusFilter === 'ALL' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  All Statuses
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('Available')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
                    statusFilter === 'Available' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  Available ({availableCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('Under Repair / Rework')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
                    statusFilter === 'Under Repair / Rework' ? 'bg-amber-700 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  In Repair ({underRepairCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('Reserved for Exchange')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
                    statusFilter === 'Reserved for Exchange' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  Reserved ({reservedCount})
                </button>
              </div>
            </div>

            {/* View Mode & Action Buttons */}
            <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
              {/* Cards vs Table Toggle */}
              <div className="flex items-center p-0.5 bg-neutral-200/80 rounded-lg border border-neutral-300/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                    viewMode === 'cards' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                    viewMode === 'table' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Table</span>
                </button>
              </div>

              {/* Refresh button */}
              <button
                type="button"
                onClick={loadInventoryData}
                disabled={isLoading}
                className="p-1.5 text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 transition cursor-pointer shadow-2xs"
                title="Reload inventory from database"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>

              {/* Export CSV */}
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredStock.length === 0}
                className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              {/* Add Inventory Button */}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log Inventory</span>
                </button>
              )}
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="py-16 text-center bg-white rounded-3xl border border-neutral-200/80 p-8 shadow-xs">
              <RefreshCw className="w-7 h-7 mx-auto mb-2 text-neutral-400 animate-spin" />
              <p className="text-xs font-bold text-neutral-800">Loading Warehouse Inventory from Database...</p>
              <p className="text-[11px] text-neutral-400 mt-0.5">Fetching domestic India stock and Boston US inventory</p>
            </div>
          )}

          {/* Error State */}
          {!isLoading && loadError && (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-3xl text-center space-y-3">
              <AlertTriangle className="w-8 h-8 mx-auto text-rose-600" />
              <div>
                <h4 className="text-sm font-bold text-rose-900">Database Connection Notice</h4>
                <p className="text-xs text-rose-700 mt-1">{loadError}</p>
              </div>
              <button
                type="button"
                onClick={loadInventoryData}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !loadError && filteredStock.length === 0 && (
            <div className="py-16 text-center bg-white rounded-3xl border border-neutral-200/80 p-8 shadow-xs">
              <Boxes className="w-10 h-10 mx-auto mb-3 text-neutral-300 stroke-[1.5]" />
              <h4 className="text-sm font-bold text-neutral-800">
                {searchQuery || warehouseFilter !== 'ALL' || statusFilter !== 'ALL'
                  ? 'No inventory items match the selected filter criteria'
                  : 'No inventory items logged yet'}
              </h4>
              <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
                {searchQuery || warehouseFilter !== 'ALL' || statusFilter !== 'ALL'
                  ? 'Try clearing the search query or changing warehouse and status filters.'
                  : 'Items received from customer returns or directly logged will automatically appear here with warehouse facility tags.'}
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="mt-4 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log First Inventory Item</span>
                </button>
              )}
            </div>
          )}

          {/* CARDS VIEW */}
          {!isLoading && !loadError && filteredStock.length > 0 && viewMode === 'cards' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredStock.map(item => {
                const isUnderRepair = item.status === 'Under Repair / Rework';
                const isAvailable = item.status === 'Available';
                const isReserved = item.status === 'Reserved for Exchange';
                const isEditing = editingId === item.id;

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl bg-white border transition duration-150 flex flex-col justify-between space-y-3 shadow-2xs hover:shadow-md ${
                      isUnderRepair
                        ? 'border-amber-300/80 bg-amber-50/20'
                        : isReserved
                        ? 'border-blue-300/80'
                        : 'border-neutral-200/80'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-xs text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded-md border border-neutral-200">
                              #{item.order_id}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              item.warehouse === 'US'
                                ? 'bg-blue-100 text-blue-900 border border-blue-200'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                            }`}>
                              {item.warehouse === 'US' ? 'US Hub (Boston)' : 'IN Hub (India)'}
                            </span>
                          </div>
                          <h4 className="font-bold text-sm text-neutral-900 mt-1.5 line-clamp-1">
                            {item.product || item.item_name}
                          </h4>
                        </div>

                        {/* Status Badge */}
                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${
                          isUnderRepair
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : isAvailable
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : 'bg-blue-100 text-blue-900 border border-blue-300'
                        }`}>
                          {item.status}
                        </span>
                      </div>

                      {/* Specifications Block */}
                      <div className="bg-neutral-50/80 p-3 rounded-xl border border-neutral-100 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500">Size &amp; Width:</span>
                          <span className="font-mono font-bold text-neutral-900">
                            {item.size} ({item.width || 'E'})
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500">Leather:</span>
                          <span className="font-medium text-neutral-800 truncate max-w-[170px]">
                            {item.leather || 'French Box Calf'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500">Last &amp; Sole:</span>
                          <span className="text-neutral-700 truncate max-w-[170px]">
                            {item.last} • {item.sole}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-neutral-200/60 text-[11px]">
                          <span className="text-neutral-500">Received Date:</span>
                          <span className="font-mono text-neutral-700">{item.receiving_date || '-'}</span>
                        </div>
                        {item.return_tracking_awb && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-neutral-500">Return AWB:</span>
                            <span className="font-mono text-neutral-700 font-semibold">{item.return_tracking_awb}</span>
                          </div>
                        )}
                        {item.customization === 'Y' && (
                          <div className="pt-1 border-t border-neutral-200/60 text-[11px] text-purple-800">
                            <span className="font-bold">Custom:</span> {item.customization_remark || 'Custom Specification'}
                          </div>
                        )}
                      </div>

                      {/* Notes / Repair alert */}
                      {item.notes && (
                        <div className={`text-[11px] p-2 rounded-lg border ${
                          isUnderRepair ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-neutral-50 text-neutral-600 border-neutral-200/60'
                        }`}>
                          <span className="font-semibold">Notes:</span> {item.notes}
                        </div>
                      )}
                    </div>

                    {/* Card Actions */}
                    {canEdit && (
                      <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-2 flex-wrap">
                        {isUnderRepair ? (
                          <button
                            type="button"
                            onClick={() => handleMarkRepairCompleted(item)}
                            className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
                            title="Mark repair as completed to make pair available in inventory"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Repair Finished → Available</span>
                          </button>
                        ) : isAvailable ? (
                          <button
                            type="button"
                            onClick={() => setReallocatingItem(item)}
                            className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
                            title="Reserve pair for customer exchange"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span>Reserve for Exchange</span>
                          </button>
                        ) : (
                          <span className="text-[11px] font-mono text-blue-700 font-semibold">
                            Reserved for exchange
                          </span>
                        )}

                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg cursor-pointer transition"
                            title="Edit details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStock(item)}
                            className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition"
                            title="Remove from inventory"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* SPREADSHEET TABLE VIEW */}
          {!isLoading && !loadError && filteredStock.length > 0 && viewMode === 'table' && (
            <div className="overflow-x-auto bg-white rounded-2xl border border-neutral-200/80 shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-neutral-50/90 text-neutral-600 font-semibold border-b border-neutral-200/80 uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3">Order ID</th>
                    <th className="py-3 px-3">Model / Product</th>
                    <th className="py-3 px-3">Leather &amp; Last</th>
                    <th className="py-3 px-3">Size &amp; Width</th>
                    <th className="py-3 px-3">Sole</th>
                    <th className="py-3 px-3">Warehouse</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Receiving Date</th>
                    <th className="py-3 px-3">Return AWB</th>
                    <th className="py-3 px-3">Customization</th>
                    {canEdit && <th className="py-3 px-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-normal">
                  {filteredStock.map(item => {
                    const isUnderRepair = item.status === 'Under Repair / Rework';
                    const isAvailable = item.status === 'Available';
                    const isEditing = editingId === item.id;

                    if (isEditing) {
                      return (
                        <tr key={item.id} className="bg-amber-50/40">
                          <td className="p-2">
                            <input
                              type="text"
                              value={editForm.order_id || ''}
                              onChange={e => setEditForm({ ...editForm, order_id: e.target.value })}
                              className="px-2 py-1 text-xs border rounded w-24 font-mono font-bold"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editForm.product || ''}
                              onChange={e => setEditForm({ ...editForm, product: e.target.value })}
                              className="px-2 py-1 text-xs border rounded w-36 font-semibold"
                            />
                          </td>
                          <td className="p-2 space-y-1">
                            <input
                              type="text"
                              placeholder="Leather"
                              value={editForm.leather || ''}
                              onChange={e => setEditForm({ ...editForm, leather: e.target.value })}
                              className="px-2 py-0.5 text-xs border rounded w-28"
                            />
                            <input
                              type="text"
                              placeholder="Last"
                              value={editForm.last || ''}
                              onChange={e => setEditForm({ ...editForm, last: e.target.value })}
                              className="px-2 py-0.5 text-xs border rounded w-28"
                            />
                          </td>
                          <td className="p-2 space-y-1">
                            <input
                              type="text"
                              placeholder="Size"
                              value={editForm.size || ''}
                              onChange={e => setEditForm({ ...editForm, size: e.target.value })}
                              className="px-2 py-0.5 text-xs border rounded w-20 font-bold"
                            />
                            <select
                              value={editForm.width || 'E'}
                              onChange={e => setEditForm({ ...editForm, width: e.target.value as ShoeWidth })}
                              className="px-1.5 py-0.5 text-xs border rounded w-20"
                            >
                              {['E', 'EE', 'EEE', '4E'].map(w => (
                                <option key={w} value={w}>{w}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editForm.sole || ''}
                              onChange={e => setEditForm({ ...editForm, sole: e.target.value })}
                              className="px-2 py-1 text-xs border rounded w-24"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={editForm.warehouse || 'IN'}
                              onChange={e => setEditForm({ ...editForm, warehouse: e.target.value as 'IN' | 'US' })}
                              className="px-2 py-1 text-xs border rounded font-semibold"
                            >
                              <option value="IN">IN (India)</option>
                              <option value="US">US (Boston)</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <select
                              value={editForm.status || 'Available'}
                              onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                              className="px-2 py-1 text-xs border rounded font-semibold"
                            >
                              <option value="Available">Available</option>
                              <option value="Under Repair / Rework">Under Repair / Rework</option>
                              <option value="Reserved for Exchange">Reserved for Exchange</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="date"
                              value={editForm.receiving_date || ''}
                              onChange={e => setEditForm({ ...editForm, receiving_date: e.target.value })}
                              className="px-2 py-1 text-xs border rounded w-28"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editForm.return_tracking_awb || ''}
                              onChange={e => setEditForm({ ...editForm, return_tracking_awb: e.target.value })}
                              className="px-2 py-1 text-xs border rounded w-24"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="Notes"
                              value={editForm.notes || ''}
                              onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                              className="px-2 py-1 text-xs border rounded w-28"
                            />
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(item)}
                                className="px-2.5 py-1 bg-neutral-900 text-white rounded text-xs font-semibold cursor-pointer shadow-xs"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="px-2 py-1 bg-neutral-200 text-neutral-700 rounded text-xs cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={item.id} className="hover:bg-neutral-50/70 transition">
                        <td className="py-2.5 px-3 font-mono font-bold text-neutral-900 whitespace-nowrap">
                          #{item.order_id}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-neutral-900">
                          {item.product || item.item_name}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-600">
                          <div>{item.leather}</div>
                          <div className="text-[10px] text-neutral-400">{item.last}</div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="font-mono font-bold text-neutral-900">{item.size}</span>
                          <span className="text-[10px] text-neutral-500 ml-1">({item.width || 'E'})</span>
                        </td>
                        <td className="py-2.5 px-3 text-neutral-600">
                          {item.sole}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.warehouse === 'US' ? 'bg-blue-100 text-blue-900' : 'bg-emerald-100 text-emerald-900'
                          }`}>
                            {item.warehouse}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isUnderRepair
                              ? 'bg-amber-100 text-amber-900 font-bold'
                              : isAvailable
                              ? 'bg-emerald-100 text-emerald-900 font-bold'
                              : 'bg-blue-100 text-blue-900'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-neutral-500 whitespace-nowrap">
                          {item.receiving_date || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-neutral-700 whitespace-nowrap">
                          {item.return_tracking_awb || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-500">
                          {item.customization === 'Y' ? (
                            <span className="text-purple-700 font-semibold">{item.customization_remark || 'Custom'}</span>
                          ) : (
                            <span className="text-neutral-400">None</span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {isUnderRepair && (
                                <button
                                  type="button"
                                  onClick={() => handleMarkRepairCompleted(item)}
                                  className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold cursor-pointer"
                                  title="Repair completed -> Available"
                                >
                                  Finish Repair
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                className="p-1 text-neutral-500 hover:text-neutral-900 rounded"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteStock(item)}
                                className="p-1 text-neutral-400 hover:text-rose-600 rounded"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* LOG NEW INVENTORY MODAL */}
          {isAddModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/60 backdrop-blur-xs">
              <div className="bg-white rounded-3xl border border-neutral-200 max-w-xl w-full p-5 space-y-4 shadow-2xl animate-in fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                  <div className="flex items-center gap-2">
                    <Boxes className="w-5 h-5 text-neutral-900" />
                    <div>
                      <h3 className="font-bold text-sm text-neutral-900">Log Warehouse Inventory</h3>
                      <p className="text-[11px] text-neutral-500">Record a returned or restocked pair into warehouse stock</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleCreateStock} className="space-y-3.5 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Order ID with auto-fetch */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-neutral-700">Order ID *</label>
                        <button
                          type="button"
                          onClick={() => handleAutoFetchSpecs()}
                          disabled={!addForm.order_id.trim() || isAutoFetching}
                          className="text-[10px] text-blue-600 font-semibold hover:underline flex items-center gap-0.5 cursor-pointer disabled:opacity-40"
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>{isAutoFetching ? 'Fetching...' : 'Auto-fill Specs'}</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="e.g. BLKBRD9960 or US101"
                        value={addForm.order_id}
                        onChange={e => setAddForm({ ...addForm, order_id: e.target.value })}
                        onBlur={e => handleAutoFetchSpecs(e.target.value)}
                        className="w-full px-3 py-2 border rounded-xl font-mono uppercase font-bold"
                      />
                    </div>

                    {/* Warehouse Facility */}
                    <div>
                      <label className="font-bold text-neutral-700 mb-1 block">Warehouse *</label>
                      <select
                        value={addForm.warehouse}
                        onChange={e => setAddForm({ ...addForm, warehouse: e.target.value as 'IN' | 'US' })}
                        className="w-full px-3 py-2 border rounded-xl font-semibold"
                      >
                        <option value="IN">India Hub (IN Warehouse)</option>
                        <option value="US">Boston Hub (US Warehouse)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-neutral-700 mb-1 block">Product / Model</label>
                      <input
                        type="text"
                        placeholder="e.g. Harley Chelsea Boot"
                        value={addForm.product}
                        onChange={e => setAddForm({ ...addForm, product: e.target.value })}
                        className="w-full px-3 py-2 border rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-neutral-700 mb-1 block">Leather</label>
                      <input
                        type="text"
                        placeholder="e.g. French Box Calf Black"
                        value={addForm.leather}
                        onChange={e => setAddForm({ ...addForm, leather: e.target.value })}
                        className="w-full px-3 py-2 border rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="font-bold text-neutral-700 mb-1 block">Last</label>
                      <input
                        type="text"
                        placeholder="Classic Round"
                        value={addForm.last}
                        onChange={e => setAddForm({ ...addForm, last: e.target.value })}
                        className="w-full px-3 py-2 border rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-neutral-700 mb-1 block">Size</label>
                      <input
                        type="text"
                        required
                        placeholder="UK 9 / US 9.5"
                        value={addForm.size}
                        onChange={e => setAddForm({ ...addForm, size: e.target.value })}
                        className="w-full px-3 py-2 border rounded-xl font-bold"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-neutral-700 mb-1 block">Width</label>
                      <select
                        value={addForm.width}
                        onChange={e => setAddForm({ ...addForm, width: e.target.value as ShoeWidth })}
                        className="w-full px-3 py-2 border rounded-xl"
                      >
                        {['E', 'EE', 'EEE', '4E', 'More than 4E'].map(w => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-neutral-700 mb-1 block">Initial Status *</label>
                      <select
                        value={addForm.status}
                        onChange={e => setAddForm({ ...addForm, status: e.target.value })}
                        className="w-full px-3 py-2 border rounded-xl font-semibold"
                      >
                        <option value="Available">Available (Ready for Dispatch)</option>
                        <option value="Under Repair / Rework">Under Repair / Rework (Excluded from Available)</option>
                        <option value="Reserved for Exchange">Reserved for Exchange</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-neutral-700 mb-1 block">Receiving Date</label>
                      <input
                        type="date"
                        value={addForm.receiving_date}
                        onChange={e => setAddForm({ ...addForm, receiving_date: e.target.value })}
                        className="w-full px-3 py-2 border rounded-xl"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-neutral-700 mb-1 block">Return AWB / Tracking</label>
                    <input
                      type="text"
                      placeholder="e.g. 1428392182"
                      value={addForm.return_tracking_awb}
                      onChange={e => setAddForm({ ...addForm, return_tracking_awb: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-neutral-700 mb-1 block">Notes / Inspection Remarks</label>
                    <textarea
                      rows={2}
                      placeholder="Condition, repair requirements, or storage rack..."
                      value={addForm.notes}
                      onChange={e => setAddForm({ ...addForm, notes: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="px-4 py-2 border rounded-xl text-neutral-600 hover:bg-neutral-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold rounded-xl cursor-pointer shadow-xs"
                    >
                      Save to Inventory
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* RE-ALLOCATE / RESERVE MODAL */}
          {reallocatingItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/60 backdrop-blur-xs">
              <div className="bg-white rounded-3xl border border-neutral-200 max-w-md w-full p-5 space-y-4 shadow-2xl animate-in fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                  <h3 className="font-bold text-sm text-neutral-900">Reserve Pair for Customer Exchange</h3>
                  <button
                    type="button"
                    onClick={() => setReallocatingItem(null)}
                    className="p-1 rounded-full text-neutral-400 hover:text-neutral-900"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 text-xs space-y-1">
                  <div className="font-bold text-neutral-900">{reallocatingItem.product}</div>
                  <div className="text-neutral-600">
                    Size: <span className="font-bold">{reallocatingItem.size}</span> ({reallocatingItem.width || 'E'}) • {reallocatingItem.leather}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Facility: {reallocatingItem.warehouse === 'US' ? 'Boston Hub (US)' : 'India Hub (IN)'}
                  </div>
                </div>

                <div>
                  <label className="font-bold text-neutral-700 text-xs mb-1 block">
                    Target Exchange Order ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BLKBRD10400 or US7152"
                    value={reallocateOrderId}
                    onChange={e => setReallocateOrderId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl text-xs font-mono font-bold uppercase"
                    autoFocus
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    This pair will be tagged as Reserved for this order and deducted from general available stock.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 text-xs">
                  <button
                    type="button"
                    onClick={() => setReallocatingItem(null)}
                    className="px-3 py-1.5 border rounded-lg text-neutral-600 hover:bg-neutral-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmReallocate}
                    disabled={!reallocateOrderId.trim()}
                    className="px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold rounded-lg cursor-pointer shadow-xs disabled:opacity-40"
                  >
                    Confirm Reservation
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : activeSubTab === 'trials' ? (
        <TrialPairsView
          items={trialPairs}
          role={role}
          onUpdateItem={onUpdateTrial}
          onAddItem={onAddTrial}
          onRefreshAll={onRefreshAll}
          onViewOrderSummary={onViewOrderSummary}
        />
      ) : (
        <BostonStockView
          items={bostonStock}
          role={role}
          onUpdateItem={onUpdateBostonStock}
          onAddItem={onAddBostonStock}
        />
      )}
    </div>
  );
};
