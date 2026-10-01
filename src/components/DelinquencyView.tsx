import React, { useState, useMemo } from 'react';
import { DelinquencyItem, UserRole, DelinquencyStage, DELINQUENCY_STAGES, STANDARD_DELAY_REASONS, StandardDelayReason } from '../types';
import {
  calculateExpectedDate,
  calculateOrderDateFromExpected,
  calculateDelayDays,
  calculateDelayInfo,
  parseFlexibleDate,
  getStageBadgeStyle,
  normalizeStage
} from '../utils/delinquencyUtils';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Edit2,
  Save,
  X,
  Plus,
  Calendar,
  ChevronDown,
  Info,
  Layers,
  ArrowRight,
  RefreshCw,
  Check,
  Upload,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Database,
  LayoutGrid,
  List
} from 'lucide-react';
import { exportToCsv, formatBlkbrdOrderId } from '../utils/csvParser';
import { resolveCustomerName, OrderLookupContext } from '../utils/customerResolver';
import { DelinquencyBulkUploadModal } from './DelinquencyBulkUploadModal';
import { recordOrderUpdateEvent } from '../services/orderHistoryService';
import { ProductThumbnail } from './ProductThumbnail';
import { resolveProductImage } from '../services/productImageService';
import { getStoredShopifyOrders } from '../services/shopifyApi';

interface DelinquencyViewProps {
  items: DelinquencyItem[];
  role: UserRole;
  onUpdateItem: (
    updated: DelinquencyItem,
    remarkText?: string
  ) => void;
  onAddItem?: (newItem: DelinquencyItem) => Promise<any> | void;
  onBulkAddItems?: (newItems: DelinquencyItem[]) => Promise<any> | void;
  lookupContext?: OrderLookupContext;
  onDispatchQuick: (orderId: string) => void;
  onRefresh?: () => Promise<void> | void;
  onOpenLogin?: () => void;
  onViewOrderSummary?: (orderId: string) => void;
  onOpenSchemaCustomizer?: (tableKey?: any) => void;
}

export const DelinquencyView: React.FC<DelinquencyViewProps> = ({
  items,
  role,
  onUpdateItem,
  onAddItem,
  onBulkAddItems,
  lookupContext,
  onDispatchQuick,
  onRefresh,
  onOpenLogin,
  onViewOrderSummary,
  onOpenSchemaCustomizer
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<DelinquencyItem>>({});
  const [productionRemark, setProductionRemark] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Delayed' | 'In Production' | 'Ready to Ship'>('ALL');
  const [storeFilter, setStoreFilter] = useState<'ALL' | 'Global' | 'LLC'>('ALL');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  // View Mode: Cards vs Table (Card-based default)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Stored shopify orders for live image and metadata resolution
  const shopifyOrders = useMemo(() => getStoredShopifyOrders(), [items]);

  // Bulk CSV Upload Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  const startEdit = (item: DelinquencyItem) => {
    setEditingId(item.id);
    const expected = item.expectedDate || calculateExpectedDate(item.orderDate);
    setEditForm({
      ...item,
      expectedDate: expected,
      currentStage: normalizeStage(item.currentStage as string)
    });
    setProductionRemark('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setProductionRemark('');
  };

  const handleSave = (item: DelinquencyItem) => {
    const updatedExpectedDate = editForm.expectedDate || item.expectedDate || calculateExpectedDate(editForm.orderDate || item.orderDate);
    const updatedOrderDate = editForm.orderDate || item.orderDate;
    
    // Recalculate delay days if date changed
    let updatedDelay = item.daysDelayed;
    if (updatedOrderDate && updatedExpectedDate) {
      updatedDelay = calculateDelayDays(updatedOrderDate, updatedExpectedDate);
    }

    let resolvedStage = normalizeStage(editForm.currentStage as string || item.currentStage as string);
    let resolvedStatus: 'Delayed' | 'Ready to Ship' | 'Shipped' | 'In Production' =
      resolvedStage === 'RTD' ? 'Ready to Ship' : resolvedStage === 'Shipped' ? 'Shipped' : (updatedDelay >= 1 ? 'Delayed' : 'In Production');

    if (editForm.orderStatus && ['Delayed', 'Ready to Ship', 'Shipped', 'In Production'].includes(editForm.orderStatus)) {
      resolvedStatus = editForm.orderStatus as any;
    }

    if (resolvedStage === 'RTD') {
      resolvedStatus = 'Ready to Ship';
    } else if (resolvedStatus === 'Ready to Ship') {
      resolvedStage = 'RTD';
    } else if (resolvedStatus === 'Shipped') {
      resolvedStage = 'Shipped';
    }

    const isCompleted = resolvedStatus === 'Ready to Ship' || resolvedStatus === 'Shipped';
    const finalDelay = isCompleted ? 0 : (updatedOrderDate ? calculateDelayDays(updatedOrderDate, updatedExpectedDate) : 0);
    const finalStatus: 'Delayed' | 'Ready to Ship' | 'Shipped' | 'In Production' = isCompleted
      ? resolvedStatus
      : (editForm.orderStatus === 'In Production' || editForm.orderStatus === 'Delayed'
        ? editForm.orderStatus
        : (finalDelay >= 1 ? 'Delayed' : 'In Production'));

    const resolvedCustomer = resolveCustomerName(
      item.orderId,
      editForm.customerName || editForm.clientName || item.customerName || item.clientName
    );

    const updated: DelinquencyItem = {
      ...item,
      ...editForm,
      customerName: resolvedCustomer,
      clientName: resolvedCustomer,
      orderDate: updatedOrderDate,
      expectedDate: updatedExpectedDate,
      daysDelayed: finalDelay,
      currentStage: resolvedStage,
      orderStatus: finalStatus
    };

    recordOrderUpdateEvent(
      item.orderId,
      {
        name: role === 'admin' ? 'CRM Admin' : role === 'production' ? 'Workshop Lead' : 'Staff Member',
        role
      },
      {
        stageChange: item.currentStage !== resolvedStage ? { from: String(item.currentStage), to: String(resolvedStage) } : undefined,
        statusChange: item.orderStatus !== resolvedStatus ? { from: String(item.orderStatus || 'Delayed'), to: String(resolvedStatus) } : undefined,
        delayReasonChange: editForm.delayReason && editForm.delayReason !== item.delayReason ? { from: String(item.delayReason || ''), to: String(editForm.delayReason) } : undefined,
        expectedDateChange: updatedExpectedDate && updatedExpectedDate !== item.expectedDate ? { from: String(item.expectedDate || ''), to: String(updatedExpectedDate) } : undefined,
        remark: productionRemark
      }
    );

    onUpdateItem(updated, productionRemark);
    setEditingId(null);
    setEditForm({});
    setProductionRemark('');
  };

  const isItemLlc = (item: DelinquencyItem) => {
    return item.storeTab === 'LLC' || item.orderId.toUpperCase().startsWith('US');
  };

  const globalCount = items.filter(i => !isItemLlc(i)).length;
  const llcCount = items.filter(i => isItemLlc(i)).length;

  // Delinquent status counts (Only delay >= 1 is categorized as Delinquent)
  const delayedItemsCount = useMemo(() => {
    return items.filter(i => {
      const isRtd = i.currentStage === 'RTD' || i.orderStatus === 'Ready to Ship';
      const isShipped = i.currentStage === 'Shipped' || i.orderStatus === 'Shipped';
      if (isRtd || isShipped) return false;
      const delay = (i.orderDate && i.expectedDate)
        ? calculateDelayDays(i.orderDate, i.expectedDate)
        : (i.daysDelayed || 0);
      return delay >= 1;
    }).length;
  }, [items]);

  const inProductionCount = useMemo(() => {
    return items.filter(i => {
      const isRtd = i.currentStage === 'RTD' || i.orderStatus === 'Ready to Ship';
      const isShipped = i.currentStage === 'Shipped' || i.orderStatus === 'Shipped';
      if (isRtd || isShipped) return false;
      const delay = (i.orderDate && i.expectedDate)
        ? calculateDelayDays(i.orderDate, i.expectedDate)
        : (i.daysDelayed || 0);
      return delay < 1;
    }).length;
  }, [items]);

  const readyToShipItemsCount = useMemo(() => {
    return items.filter(i => i.currentStage === 'RTD' || i.orderStatus === 'Ready to Ship').length;
  }, [items]);

  // Sorting state (Default is sNo ascending)
  const [sortField, setSortField] = useState<'sNo' | 'orderId' | 'customerName' | 'orderDate' | 'expectedDate' | 'daysDelayed' | 'currentStage' | 'delayReason'>('sNo');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredItems = useMemo(() => {
    const list = items.filter(item => {
      // Filter by Store tab
      if (storeFilter === 'Global' && isItemLlc(item)) return false;
      if (storeFilter === 'LLC' && !isItemLlc(item)) return false;

      // Accurately determine if item is delinquent: only delay >= 1 is delinquent
      const isRtd = item.currentStage === 'RTD' || item.orderStatus === 'Ready to Ship';
      const isShipped = item.currentStage === 'Shipped' || item.orderStatus === 'Shipped';
      const effectiveDelay = isRtd || isShipped ? 0 : ((item.orderDate && item.expectedDate)
        ? calculateDelayDays(item.orderDate, item.expectedDate)
        : (item.daysDelayed || 0));
      const isDelinquent = !isRtd && !isShipped && effectiveDelay >= 1;

      // Filter by Order status
      if (statusFilter === 'Delayed' && !isDelinquent) return false;
      if (statusFilter === 'Ready to Ship' && !isRtd) return false;
      if (statusFilter === 'In Production' && (isDelinquent || isRtd || isShipped)) return false;

      // Filter by Stage
      if (stageFilter !== 'ALL' && normalizeStage(item.currentStage as string) !== stageFilter) return false;

      return true;
    });

    return [...list].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'sNo') {
        const numA = typeof a.sNo === 'number' ? a.sNo : parseInt(String(a.sNo || '').replace(/\D/g, ''), 10) || 0;
        const numB = typeof b.sNo === 'number' ? b.sNo : parseInt(String(b.sNo || '').replace(/\D/g, ''), 10) || 0;
        comparison = numA - numB;
        if (comparison === 0) {
          comparison = String(a.orderId).localeCompare(String(b.orderId));
        }
      } else if (sortField === 'orderId') {
        comparison = String(a.orderId).localeCompare(String(b.orderId));
      } else if (sortField === 'customerName') {
        comparison = String(a.customerName || a.clientName || '').localeCompare(String(b.customerName || b.clientName || ''));
      } else if (sortField === 'orderDate') {
        comparison = String(a.orderDate || '').localeCompare(String(b.orderDate || ''));
      } else if (sortField === 'expectedDate') {
        comparison = String(a.expectedDate || '').localeCompare(String(b.expectedDate || ''));
      } else if (sortField === 'daysDelayed') {
        const delayA = (a.orderStatus === 'Ready to Ship' || a.orderStatus === 'Shipped') ? 0 : calculateDelayDays(a.orderDate, a.expectedDate);
        const delayB = (b.orderStatus === 'Ready to Ship' || b.orderStatus === 'Shipped') ? 0 : calculateDelayDays(b.orderDate, b.expectedDate);
        comparison = delayA - delayB;
      } else if (sortField === 'currentStage') {
        comparison = String(a.currentStage || '').localeCompare(String(b.currentStage || ''));
      } else if (sortField === 'delayReason') {
        comparison = String(a.delayReason || '').localeCompare(String(b.delayReason || ''));
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [items, storeFilter, statusFilter, stageFilter, sortField, sortDirection]);

  const handleExportDelinquencies = () => {
    const list = filteredItems.length > 0 ? filteredItems : items;
    if (list.length === 0) {
      alert('No delinquency records available to export.');
      return;
    }

    const exportData = list.map((item, idx) => {
      const expDate = item.expectedDate || (item.orderDate ? calculateExpectedDate(item.orderDate) : '');
      const isCompleted = item.orderStatus === 'Ready to Ship' || item.orderStatus === 'Shipped';
      const delayDays = isCompleted ? 0 : calculateDelayDays(item.orderDate, expDate);

      return {
        'S.No': item.sNo || idx + 1,
        'Order ID': item.orderId ? `#${String(item.orderId).replace(/^#/, '')}` : '',
        'Customer Name': item.customerName || item.clientName || '',
        'Product / Shoe Style': item.product || item.shoeStyle || '',
        'Store': item.storeTab || (item.orderId.toUpperCase().startsWith('US') ? 'LLC' : 'Global'),
        'Order Date': item.orderDate || '',
        'Expected Delivery Date': expDate,
        'Days Delayed': delayDays,
        'Current Stage': item.currentStage || '',
        'Fulfillment Status': item.orderStatus || 'Delayed',
        'Delay Reason': item.delayReason || '',
        'Action Required': item.actionRequired || '',
        'Workshop Remarks': item.remarks || ''
      };
    });

    const dateStr = new Date().toISOString().split('T')[0];
    exportToCsv(exportData, `BLKBRD_Delinquency_Tracker_${dateStr}.csv`);
  };

  return (
    <div className="bg-white/80 border border-white/80 shadow-2xl rounded-3xl transition-all">
      {/* Header bar */}
      <div className="p-4 sm:p-5 border-b border-neutral-200/60 flex flex-col gap-4 bg-white/50 rounded-t-3xl">
        {/* Tier 1: Title & Main Action Buttons (Perfect Symmetrical Alignment) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm sm:text-base font-semibold text-neutral-900 tracking-tight">
              Delinquency &amp; Delayed Orders Tracker
            </h3>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-neutral-900/5 text-neutral-700 border border-neutral-200 font-medium">
              {filteredItems.length} {filteredItems.length === 1 ? 'Order' : 'Orders'}
            </span>
          </div>

          {/* Action Buttons Bar with Balanced Heights and Spacing */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Bulk CSV Upload Button */}
            {(role === 'admin' || role === 'production') && (
              <button
                id="bulk-csv-upload-btn"
                onClick={() => setIsBulkModalOpen(true)}
                title="Upload CSV to import delayed orders in bulk"
                className="bg-white hover:bg-neutral-50 text-neutral-700 hover:text-neutral-900 border border-neutral-200/80 text-xs px-3 py-2 rounded-xl font-medium flex items-center gap-1.5 transition cursor-pointer shadow-2xs min-h-[36px]"
              >
                <Upload className="w-3.5 h-3.5 stroke-[1.5] text-neutral-600" />
                <span>Upload CSV</span>
              </button>
            )}

            {/* Export CSV Button */}
            <button
              onClick={handleExportDelinquencies}
              disabled={items.length === 0}
              title="Export delinquency tracker records to CSV"
              className="bg-white hover:bg-neutral-50 text-neutral-700 hover:text-neutral-900 border border-neutral-200/80 text-xs px-3 py-2 rounded-xl font-medium flex items-center gap-1.5 transition cursor-pointer shadow-2xs min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5 stroke-[1.5] text-neutral-600" />
              <span>Export CSV</span>
            </button>

            {/* Supabase Schema Customizer Button */}
            {role === 'admin' && onOpenSchemaCustomizer && (
              <button
                onClick={() => onOpenSchemaCustomizer(storeFilter === 'LLC' ? 'delinquency_llc' : 'delinquency_global')}
                title="Customize & inspect Supabase columns for orders"
                className="bg-white hover:bg-neutral-50 text-neutral-700 hover:text-neutral-900 border border-neutral-200/80 text-xs px-3 py-2 rounded-xl font-medium flex items-center gap-1.5 transition cursor-pointer shadow-2xs min-h-[36px]"
              >
                <Database className="w-3.5 h-3.5 stroke-[1.5] text-neutral-600" />
                <span>Supabase Schema</span>
              </button>
            )}

            {/* Reload Action Button */}
            {onRefresh && (
              <button
                onClick={() => onRefresh()}
                title="Reload latest orders from Supabase"
                className="bg-white hover:bg-neutral-50 text-neutral-700 hover:text-neutral-900 border border-neutral-200/80 text-xs px-3 py-2 rounded-xl font-medium flex items-center gap-1.5 transition cursor-pointer shadow-2xs min-h-[36px]"
              >
                <RefreshCw className="w-3.5 h-3.5 stroke-[1.5] text-neutral-600" />
                <span>Reload</span>
              </button>
            )}

            {/* View Mode Toggle (Cards vs Table) */}
            <div className="flex items-center p-0.5 bg-neutral-200/90 rounded-xl border border-neutral-300/80 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white text-neutral-900 shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
                title="Card Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-neutral-900 shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
                title="Spreadsheet Table View"
              >
                <List className="w-3.5 h-3.5" />
                <span>Table</span>
              </button>
            </div>

          </div>
        </div>

        {/* Tier 2: Store Tabs Segmented Control & Status/Stage Sliders (Symmetrical 2-Column Grid) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-3 border-t border-neutral-200/50 items-center">
          {/* Store Segmented Tabs (6 cols) */}
          <div className="lg:col-span-6 flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-500 shrink-0">Store:</span>
            <div className="grid grid-cols-3 gap-1 bg-neutral-200/60 p-1 rounded-xl w-full max-w-md">
              <button
                type="button"
                onClick={() => setStoreFilter('ALL')}
                className={`text-xs py-1.5 px-2.5 rounded-lg font-medium transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                  storeFilter === 'ALL'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <span>All Stores</span>
                <span className="text-[10px] font-mono opacity-70">({items.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setStoreFilter('Global')}
                className={`text-xs py-1.5 px-2.5 rounded-lg font-medium transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                  storeFilter === 'Global'
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <span>Global</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-neutral-100 text-neutral-800 font-semibold">
                  {globalCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setStoreFilter('LLC')}
                className={`text-xs py-1.5 px-2.5 rounded-lg font-medium transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                  storeFilter === 'LLC'
                    ? 'bg-white text-blue-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <span>USA LLC</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-800 font-semibold">
                  {llcCount}
                </span>
              </button>
            </div>
          </div>

          {/* Status Segmented Slider & Stage Dropdown (6 cols) */}
          <div className="lg:col-span-6 flex flex-col sm:flex-row sm:items-center gap-2.5 justify-end">
            {/* Status Slider */}
            <div className="flex items-center gap-2 flex-1 sm:flex-initial">
              <span className="text-xs font-medium text-neutral-500 shrink-0">Status:</span>
              <div className="grid grid-cols-4 gap-1 bg-neutral-200/60 p-1 rounded-xl w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`text-xs py-1.5 px-2.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-center ${
                    statusFilter === 'ALL'
                      ? 'bg-white text-neutral-900 shadow-xs font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  All ({items.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('Delayed')}
                  className={`text-xs py-1.5 px-2.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-center flex items-center justify-center gap-1 ${
                    statusFilter === 'Delayed'
                      ? 'bg-white text-rose-900 shadow-xs font-bold'
                      : 'text-rose-700/80 hover:text-rose-900'
                  }`}
                  title="Delinquent orders with 1 or more days of delay"
                >
                  <span>Delayed</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                    delayedItemsCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-neutral-100 text-neutral-500'
                  }`}>
                    {delayedItemsCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('In Production')}
                  className={`text-xs py-1.5 px-2.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-center flex items-center justify-center gap-1 ${
                    statusFilter === 'In Production'
                      ? 'bg-white text-blue-900 shadow-xs font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                  title="Orders within expected delivery date (on schedule)"
                >
                  <span>On Track</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-blue-50 text-blue-800 font-semibold">
                    {inProductionCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('Ready to Ship')}
                  className={`text-xs py-1.5 px-2.5 rounded-lg font-medium transition cursor-pointer whitespace-nowrap text-center flex items-center justify-center gap-1 ${
                    statusFilter === 'Ready to Ship'
                      ? 'bg-white text-emerald-900 shadow-xs font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                  title="Orders marked Ready to Dispatch (RTD)"
                >
                  <span>Ready</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-800 font-semibold">
                    {readyToShipItemsCount}
                  </span>
                </button>
              </div>
            </div>

            {/* Stage Selector Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-500 shrink-0">Stage:</span>
              <select
                value={stageFilter}
                onChange={e => setStageFilter(e.target.value)}
                className="rounded-xl px-3 py-1.5 text-xs font-medium text-neutral-800 focus:outline-hidden cursor-pointer min-h-[36px] bg-white border border-neutral-200/80 shadow-2xs"
              >
                <option value="ALL">All Stages ({items.length})</option>
                {DELINQUENCY_STAGES.map(st => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

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
          </div>
        </div>
      </div>

      {/* Cards vs Table View Mode */}
      {viewMode === 'cards' ? (
        <div className="p-3.5 sm:p-5 bg-neutral-50/60">
          {filteredItems.length === 0 ? (
            <div className="py-14 text-center text-xs text-neutral-400 bg-white rounded-2xl border border-neutral-200/80 p-6">
              <Clock className="w-8 h-8 mx-auto stroke-[1.5] text-neutral-300 mb-2" />
              <p className="font-semibold text-neutral-700">No delayed orders match the selected filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredItems.map((item, idx) => {
                const isEditing = editingId === item.id;
                const displayOrderDate =
                  item.orderDate || (item.expectedDate ? calculateOrderDateFromExpected(item.expectedDate) : '');
                const calculatedExpected =
                  item.expectedDate || (displayOrderDate ? calculateExpectedDate(displayOrderDate) : '');
                const delayInfo = calculateDelayInfo(displayOrderDate, calculatedExpected);
                const isCompleted = item.orderStatus === 'Ready to Ship' || item.orderStatus === 'Shipped' || item.currentStage === 'RTD' || item.currentStage === 'Shipped';
                const effectiveDaysDelayed = isCompleted ? 0 : delayInfo.delayedDays;
                const daysRemaining = delayInfo.daysRemaining;
                const isDelinquent = !isCompleted && effectiveDaysDelayed >= 1;
                const currentStatus = isCompleted ? (item.orderStatus || 'Ready to Ship') : (isDelinquent ? 'Delayed' : 'In Production');
                const displaySerial = item.sNo !== undefined && item.sNo !== null ? item.sNo : idx + 1;

                return (
                  <div
                    key={item.id ? `${item.id}-${idx}` : `del-${item.orderId || idx}`}
                    className={`p-4 rounded-2xl bg-white border border-neutral-200/80 shadow-2xs hover:shadow-md transition duration-150 space-y-3 flex flex-col justify-between ${
                      currentStatus === 'Ready to Ship' ? 'border-emerald-300/80 bg-emerald-50/20' : ''
                    }`}
                  >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-xs text-neutral-800 bg-neutral-200/70 px-2 py-0.5 rounded-md border border-neutral-300/60">
                    S.No {displaySerial}
                  </span>
                  {onViewOrderSummary ? (
                    <button
                      type="button"
                      onClick={() => onViewOrderSummary(item.orderId)}
                      className="font-mono font-bold text-xs text-neutral-900 hover:text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                      title="Click to view full order summary, journey, and remarks history"
                    >
                      <span>#{item.orderId.replace(/^#/, '')}</span>
                      <ExternalLink className="w-3 h-3 text-blue-600" />
                    </button>
                  ) : (
                    <span className="font-mono font-bold text-xs text-neutral-900">
                      #{item.orderId.replace(/^#/, '')}
                    </span>
                  )}
                  {isItemLlc(item) ? (
                    <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-800 font-mono">
                      LLC (USA)
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-md bg-neutral-100 text-neutral-700 font-mono">
                      Global
                    </span>
                  )}
                  {effectiveDaysDelayed > 0 ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-rose-800 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-full">
                      <Clock className="w-3 h-3 text-rose-600 stroke-[1.5]" />
                      +{effectiveDaysDelayed}d
                    </span>
                  ) : isCompleted ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-full">
                      {currentStatus}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                      {daysRemaining > 0 ? `${daysRemaining}d left` : 'On track'}
                    </span>
                  )}
                </div>
                <div>
                  {currentStatus === 'Ready to Ship' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-900 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Ready
                    </span>
                  ) : currentStatus === 'Shipped' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-900 bg-green-500/10 border border-green-500/20 px-2.5 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                      Shipped
                    </span>
                  ) : isDelinquent ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-900 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                      Delayed (+{effectiveDaysDelayed}d)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                      On Track
                    </span>
                  )}
                </div>
              </div>

              {/* Customer & Stage */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-neutral-400 block">Customer</span>
                  <div className="font-semibold text-xs text-neutral-900">{item.customerName}</div>
                </div>

                {/* Stage Dropdown on Mobile */}
                <div className="text-right">
                  <span className="text-[10px] uppercase font-semibold text-neutral-400 block">Status / Stage</span>
                  <select
                    value={normalizeStage(item.currentStage as string)}
                    onChange={e => {
                      const newStage = e.target.value as DelinquencyStage;
                      const resolvedCustomer = resolveCustomerName(item.orderId, item.customerName || item.clientName);
                      onUpdateItem(
                        {
                          ...item,
                          customerName: resolvedCustomer,
                          clientName: resolvedCustomer,
                          currentStage: newStage,
                          ...(newStage === 'RTD' ? { orderStatus: 'Ready to Ship' } : {})
                        },
                        `Updated stage to ${newStage}`
                      );
                    }}
                    className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border focus:outline-hidden cursor-pointer mt-0.5 ${getStageBadgeStyle(
                      item.currentStage as string
                    )}`}
                  >
                    {DELINQUENCY_STAGES.map(st => (
                      <option key={st} value={st} className="bg-white text-neutral-900 font-bold uppercase">
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Product Details & Shopify Image Thumbnail on Mobile */}
              {(() => {
                const resolvedImg = resolveProductImage(
                  item.orderId,
                  item.product || (item as any).shoeModel,
                  shopifyOrders,
                  item.imageUrl
                );

                return (
                  <div className="flex items-center gap-2.5 bg-white/60 p-2 rounded-xl border border-white/80">
                    <ProductThumbnail
                      src={resolvedImg}
                      alt={item.product || 'Footwear'}
                      size="sm"
                      className="rounded-lg shadow-2xs border border-neutral-200 bg-white shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-neutral-900 block truncate" title={item.product}>
                        {item.product || 'BLKBRD Dixon Chelsea'}
                      </span>
                      <span className="text-[10px] text-neutral-500 font-mono">
                        {resolvedImg ? 'Shopify Image Linked' : 'Handcrafted Model'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Date of Order & Expected Date (+21d) */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-white/50 p-2.5 rounded-xl border border-white/80">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-neutral-400 block">Date of Order</span>
                  <span className="font-medium text-neutral-900 flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3 text-neutral-400 stroke-[1.5]" />
                    {displayOrderDate || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-neutral-400 block">Expected (+21d)</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono text-neutral-800 font-medium">
                      {calculatedExpected || 'N/A'}
                    </span>
                    {effectiveDaysDelayed > 0 ? (
                      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-1.5 py-0.2 rounded font-sans">
                        +{effectiveDaysDelayed}d
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Prominent Delay Banner if Delayed */}
              {effectiveDaysDelayed > 0 && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-rose-50/90 border border-rose-200 text-rose-900 text-xs font-semibold shadow-2xs">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 stroke-[2.5]" />
                    <span>Delayed by <strong>{effectiveDaysDelayed} {effectiveDaysDelayed === 1 ? 'day' : 'days'}</strong></span>
                  </div>
                  <span className="font-mono text-[11px] font-bold bg-rose-200/80 text-rose-900 px-2 py-0.5 rounded-md">
                    +{effectiveDaysDelayed}d overdue
                  </span>
                </div>
              )}

              {/* Reason & Action */}
              <div className="text-xs text-neutral-700 bg-white/40 p-2.5 rounded-xl border border-white/60">
                <div className="font-medium text-neutral-900">{item.delayReason || 'Pending workshop completion'}</div>
                {item.actionRequired && (
                  <div className="text-[11px] text-neutral-500 mt-1">
                    Action: {item.actionRequired}
                  </div>
                )}
              </div>

              {/* Edit Mode or Quick Action */}
              {isEditing ? (
                <div className="space-y-2 pt-1 border-t border-neutral-200/50">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-neutral-500 mb-1">
                      Status / Stage Dropdown:
                    </label>
                    <select
                      value={editForm.currentStage ? normalizeStage(editForm.currentStage as string) : normalizeStage(item.currentStage as string)}
                      onChange={e => setEditForm({ ...editForm, currentStage: e.target.value as any })}
                      className="w-full glass-input rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wide focus:outline-hidden"
                    >
                      {DELINQUENCY_STAGES.map(st => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-neutral-500 mb-1">
                      Fulfillment Status:
                    </label>
                    <select
                      value={editForm.orderStatus || currentStatus}
                      onChange={e => setEditForm({ ...editForm, orderStatus: e.target.value as any })}
                      className="w-full glass-input rounded-xl px-3 py-2 text-xs font-medium focus:outline-hidden"
                    >
                      <option value="In Production">In Production (On Track)</option>
                      <option value="Delayed">Delayed (Delinquent: +1d+)</option>
                      <option value="Ready to Ship">Ready to Ship (RTD)</option>
                      {role === 'admin' && <option value="Shipped">Shipped</option>}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-neutral-500 mb-1">
                      Delay Reason (Dropdown):
                    </label>
                    <select
                      value={editForm.delayReason ?? item.delayReason ?? STANDARD_DELAY_REASONS[0]}
                      onChange={e => setEditForm({ ...editForm, delayReason: e.target.value })}
                      className="w-full glass-input rounded-xl px-3 py-2 text-xs font-medium focus:outline-hidden bg-white text-neutral-800"
                    >
                      {STANDARD_DELAY_REASONS.map(reason => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                      {item.delayReason && !STANDARD_DELAY_REASONS.includes(item.delayReason as any) && (
                        <option value={item.delayReason}>
                          {item.delayReason} (Custom)
                        </option>
                      )}
                    </select>
                  </div>

                  {role === 'production' && (
                    <input
                      type="text"
                      placeholder="Add remark for Admin..."
                      value={productionRemark}
                      onChange={e => setProductionRemark(e.target.value)}
                      className="w-full glass-input rounded-xl px-3 py-2 text-xs focus:outline-hidden"
                    />
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleSave(item)}
                      className="flex-1 min-h-[40px] bg-neutral-900 text-white rounded-full text-xs font-medium flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5 stroke-[1.5]" />
                      <span>Save Changes</span>
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="min-h-[40px] px-4 glass-button text-neutral-600 rounded-full text-xs font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-2 pt-1">
                  {(role === 'admin' || role === 'production') && (
                    <button
                      onClick={() => startEdit(item)}
                      className="glass-button text-xs px-3.5 py-1.5 rounded-full font-medium text-neutral-700 min-h-[36px] flex items-center gap-1.5"
                    >
                      <Edit2 className="w-3 h-3 stroke-[1.5]" />
                      <span>{role === 'production' ? 'Update' : 'Edit'}</span>
                    </button>
                  )}

                  {currentStatus !== 'Ready to Ship' && (role === 'admin' || role === 'production') && (
                    <button
                      onClick={() => {
                        const resolvedCustomer = resolveCustomerName(item.orderId, item.customerName || item.clientName);
                        onUpdateItem(
                          {
                            ...item,
                            customerName: resolvedCustomer,
                            clientName: resolvedCustomer,
                            orderStatus: 'Ready to Ship',
                            currentStage: 'RTD'
                          },
                          'Marked as RTD (Ready to Dispatch) for Logistics by workshop'
                        );
                      }}
                      className="glass-button text-xs px-3.5 py-1.5 rounded-full font-medium text-emerald-900 min-h-[36px] flex items-center gap-1.5 bg-emerald-500/15 border-emerald-500/30"
                      title="Mark as RTD (Ready to Dispatch) so Logistics team can ship it"
                    >
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 stroke-[1.5]" />
                      <span>Mark RTD</span>
                    </button>
                  )}
                  {currentStatus === 'Ready to Ship' && (
                    <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 font-medium">
                      Queued for Logistics
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
            </div>
          )}
        </div>
      ) : (
        /* Spreadsheet Table */
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-neutral-200/60 bg-white/30 text-neutral-500 uppercase font-medium text-[10px] tracking-wider select-none">
              <th
                onClick={() => handleSort('sNo')}
                className="py-3 px-3 cursor-pointer hover:text-neutral-900 transition group"
              >
                <div className="flex items-center gap-1">
                  <span>S.No</span>
                  {sortField === 'sNo' ? (
                    sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-neutral-900" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-neutral-900" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-80 transition" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('orderId')}
                className="py-3 px-3 cursor-pointer hover:text-neutral-900 transition group"
              >
                <div className="flex items-center gap-1">
                  <span>Order ID</span>
                  {sortField === 'orderId' ? (
                    sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-neutral-900" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-neutral-900" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-80 transition" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('customerName')}
                className="py-3 px-4 cursor-pointer hover:text-neutral-900 transition group"
              >
                <div className="flex items-center gap-1">
                  <span>Customer Name</span>
                  {sortField === 'customerName' ? (
                    sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-neutral-900" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-neutral-900" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-80 transition" />
                  )}
                </div>
              </th>
              <th className="py-3 px-4">Product</th>
              <th
                onClick={() => handleSort('orderDate')}
                className="py-3 px-3 cursor-pointer hover:text-neutral-900 transition group"
              >
                <div className="flex items-center gap-1">
                  <span>Order Date</span>
                  {sortField === 'orderDate' ? (
                    sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-neutral-900" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-neutral-900" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-80 transition" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('expectedDate')}
                className="py-3 px-3 cursor-pointer hover:text-neutral-900 transition group"
              >
                <div className="flex items-center gap-1">
                  <span>Expected Date</span>
                  {sortField === 'expectedDate' ? (
                    sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-neutral-900" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-neutral-900" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-80 transition" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('daysDelayed')}
                className="py-3 px-3 cursor-pointer hover:text-neutral-900 transition group"
              >
                <div className="flex items-center gap-1">
                  <span>Days Delayed</span>
                  {sortField === 'daysDelayed' ? (
                    sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-neutral-900" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-neutral-900" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-80 transition" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('currentStage')}
                className="py-3 px-4 cursor-pointer hover:text-neutral-900 transition group"
              >
                <div className="flex items-center gap-1">
                  <span>Current Stage</span>
                  {sortField === 'currentStage' ? (
                    sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-neutral-900" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-neutral-900" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-80 transition" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('delayReason')}
                className="py-3 px-4 cursor-pointer hover:text-neutral-900 transition group"
              >
                <div className="flex items-center gap-1">
                  <span>Delay Reason</span>
                  {sortField === 'delayReason' ? (
                    sortDirection === 'asc' ? (
                      <ArrowUp className="w-3 h-3 text-neutral-900" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-neutral-900" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-80 transition" />
                  )}
                </div>
              </th>
              <th className="py-3 px-4">Remarks</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200/50">
            {filteredItems.map((item, idx) => {
              const isEditing = editingId === item.id;
              const isCompleted = item.orderStatus === 'Ready to Ship' || item.orderStatus === 'Shipped' || item.currentStage === 'RTD' || item.currentStage === 'Shipped';
              const displayOrderDate =
                item.orderDate || (item.expectedDate ? calculateOrderDateFromExpected(item.expectedDate) : '');
              const calculatedExpected =
                item.expectedDate || (displayOrderDate ? calculateExpectedDate(displayOrderDate) : '');
              const delayInfo = calculateDelayInfo(displayOrderDate, calculatedExpected);
              const effectiveDaysDelayed = isCompleted ? 0 : delayInfo.delayedDays;
              const daysRemaining = delayInfo.daysRemaining;
              const isDelinquent = !isCompleted && effectiveDaysDelayed >= 1;
              const currentStatus = isCompleted ? (item.orderStatus || 'Ready to Ship') : (isDelinquent ? 'Delayed' : 'In Production');
              const displaySerial = item.sNo !== undefined && item.sNo !== null ? item.sNo : idx + 1;

              return (
                <tr
                  key={item.id ? `${item.id}-${idx}` : `del-${item.orderId || idx}`}
                  className={`hover:bg-white/50 transition duration-150 ${
                    currentStatus === 'Ready to Ship' ? 'bg-emerald-500/5' : ''
                  }`}
                >
                  {/* S.No */}
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-neutral-100 text-neutral-700 font-mono font-semibold text-xs border border-neutral-200/80">
                      {displaySerial}
                    </span>
                  </td>

                  {/* Order ID */}
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    {onViewOrderSummary ? (
                      <button
                        type="button"
                        onClick={() => onViewOrderSummary(item.orderId)}
                        className="font-mono font-semibold text-neutral-900 hover:text-blue-600 hover:underline flex items-center gap-1 group text-left cursor-pointer transition"
                        title="Click to view full order summary, journey, and remarks history"
                      >
                        <span>#{item.orderId.replace(/^#/, '')}</span>
                        <ExternalLink className="w-3 h-3 text-neutral-400 group-hover:text-blue-600 transition" />
                      </button>
                    ) : (
                      <div className="font-mono font-semibold text-neutral-900">
                        #{item.orderId.replace(/^#/, '')}
                      </div>
                    )}
                    <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {isItemLlc(item) ? (
                        <span className="inline-block text-[10px] font-medium px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                          LLC (USA)
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] font-medium px-1.5 py-0.2 rounded-md bg-neutral-100 text-neutral-600 border border-neutral-200 font-mono">
                          Global
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Customer Name */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="font-semibold text-neutral-900">{item.customerName || 'Customer'}</div>
                  </td>

                  {/* Product */}
                  <td className="py-3.5 px-4 min-w-[200px]">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.product || item.product || ''}
                        onChange={e => setEditForm({ ...editForm, product: e.target.value })}
                        className="glass-input rounded-lg px-2 py-1 text-xs w-full"
                        placeholder="Product name"
                      />
                    ) : (
                      (() => {
                        const resolvedImg = resolveProductImage(
                          item.orderId,
                          item.product || (item as any).shoeModel,
                          shopifyOrders,
                          item.imageUrl
                        );

                        return (
                          <div className="flex items-center gap-2.5">
                            <ProductThumbnail
                              src={resolvedImg}
                              alt={item.product || 'Footwear'}
                              size="xs"
                              className="rounded-lg shadow-2xs border border-neutral-200 bg-white shrink-0"
                            />
                            <div className="min-w-0">
                              <span className="text-neutral-900 font-medium block truncate max-w-[220px]" title={item.product}>
                                {item.product || 'BLKBRD Dixon Chelsea'}
                              </span>
                              {resolvedImg && (
                                <span className="text-[9px] text-emerald-700 font-mono font-medium">
                                  Shopify Synced
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </td>

                  {/* Order Date */}
                  <td className="py-3.5 px-3 whitespace-nowrap font-mono text-neutral-800">
                    {isEditing ? (
                      <input
                        type="date"
                        value={editForm.orderDate || item.orderDate || ''}
                        onChange={e => {
                          const newOrderDate = e.target.value;
                          const newExp = calculateExpectedDate(newOrderDate);
                          setEditForm({
                            ...editForm,
                            orderDate: newOrderDate,
                            expectedDate: newExp
                          });
                        }}
                        className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono"
                      />
                    ) : (
                      <span>{displayOrderDate || '—'}</span>
                    )}
                  </td>

                  {/* Expected Date (+21d from Order Date) */}
                  <td className="py-3.5 px-3 whitespace-nowrap font-mono text-neutral-800">
                    {isEditing ? (
                      <input
                        type="date"
                        value={editForm.expectedDate || calculatedExpected || ''}
                        onChange={e => setEditForm({ ...editForm, expectedDate: e.target.value })}
                        className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono"
                      />
                    ) : (
                      <span className="font-semibold text-neutral-900">{calculatedExpected || '—'}</span>
                    )}
                  </td>

                  {/* Days Delayed */}
                  <td className="py-3.5 px-3 whitespace-nowrap font-mono">
                    {effectiveDaysDelayed > 0 ? (
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200/90 shadow-2xs"
                        title={`Order date: ${displayOrderDate} + 21 days = ${calculatedExpected}. Surpassed by ${effectiveDaysDelayed} days.`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 stroke-[2.5]" />
                        <span>+{effectiveDaysDelayed} {effectiveDaysDelayed === 1 ? 'day' : 'days'}</span>
                      </span>
                    ) : isCompleted ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md font-sans">
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                        <span>{currentStatus}</span>
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md font-sans"
                        title={`Order date: ${displayOrderDate} + 21 days = ${calculatedExpected}. On schedule (${daysRemaining}d remaining).`}
                      >
                        <Clock className="w-3 h-3 text-emerald-600" />
                        <span>{daysRemaining > 0 ? `${daysRemaining}d left` : 'On track (0d)'}</span>
                      </span>
                    )}
                  </td>

                  {/* Current Stage */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isEditing ? (
                      <select
                        value={editForm.currentStage ? normalizeStage(editForm.currentStage as string) : normalizeStage(item.currentStage as string)}
                        onChange={e =>
                          setEditForm({
                            ...editForm,
                            currentStage: e.target.value as any
                          })
                        }
                        className="glass-input rounded-xl px-2.5 py-1 text-xs font-bold uppercase tracking-wide focus:outline-hidden"
                      >
                        {DELINQUENCY_STAGES.map(st => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={normalizeStage(item.currentStage as string)}
                        onChange={e => {
                          const newStage = e.target.value as DelinquencyStage;
                          const resolvedCustomer = resolveCustomerName(item.orderId, item.customerName || item.clientName);
                          onUpdateItem(
                            {
                              ...item,
                              customerName: resolvedCustomer,
                              clientName: resolvedCustomer,
                              currentStage: newStage,
                              ...(newStage === 'RTD' ? { orderStatus: 'Ready to Ship' } : {})
                            },
                            `Updated stage to ${newStage}`
                          );
                        }}
                        className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border focus:outline-hidden cursor-pointer transition ${getStageBadgeStyle(
                          item.currentStage as string
                        )}`}
                        title="Change Status / Stage"
                      >
                        {DELINQUENCY_STAGES.map(st => (
                          <option key={st} value={st} className="bg-white text-neutral-900 font-bold uppercase">
                            {st}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>

                  {/* Delay Reason */}
                  <td className="py-3.5 px-4 max-w-xs">
                    {isEditing ? (
                      <select
                        value={editForm.delayReason ?? item.delayReason ?? STANDARD_DELAY_REASONS[0]}
                        onChange={e => setEditForm({ ...editForm, delayReason: e.target.value })}
                        className="w-full glass-input rounded-xl px-2.5 py-1.5 text-xs focus:outline-hidden bg-white text-neutral-800 font-medium"
                      >
                        {STANDARD_DELAY_REASONS.map(reason => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                        {item.delayReason && !STANDARD_DELAY_REASONS.includes(item.delayReason as any) && (
                          <option value={item.delayReason}>
                            {item.delayReason} (Custom)
                          </option>
                        )}
                      </select>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100/90 text-neutral-800 border border-neutral-200">
                        {item.delayReason || '—'}
                      </span>
                    )}
                  </td>

                  {/* Remarks */}
                  <td className="py-3.5 px-4 max-w-xs">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.remarks ?? item.remarks ?? item.actionRequired ?? ''}
                        onChange={e => setEditForm({ ...editForm, remarks: e.target.value })}
                        placeholder="Remarks"
                        className="w-full glass-input rounded-xl px-2.5 py-1 text-xs focus:outline-hidden"
                      />
                    ) : (
                      <span className="text-neutral-600 text-xs">{item.remarks || item.actionRequired || '—'}</span>
                    )}
                  </td>

                  {/* Actions Column */}
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleSave(item)}
                          className="inline-flex items-center gap-1 bg-neutral-900 hover:bg-neutral-800 text-white px-3 py-1 rounded-full text-xs font-medium cursor-pointer shadow-xs"
                        >
                          <Save className="w-3 h-3 stroke-[1.5]" />
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="glass-button p-1 rounded-full text-neutral-600 hover:text-neutral-900 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5 stroke-[1.5]" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        {(role === 'admin' || role === 'production') && (
                          <button
                            onClick={() => startEdit(item)}
                            className="glass-button inline-flex items-center gap-1 text-xs text-neutral-700 hover:text-neutral-950 px-3 py-1 rounded-full transition cursor-pointer font-medium"
                          >
                            <Edit2 className="w-3 h-3 stroke-[1.5]" />
                            <span>{role === 'production' ? 'Update' : 'Edit'}</span>
                          </button>
                        )}

                        {currentStatus !== 'Ready to Ship' && (role === 'admin' || role === 'production') && (
                          <button
                            onClick={() => {
                              const resolvedCustomer = resolveCustomerName(item.orderId, item.customerName || item.clientName);
                              onUpdateItem(
                                {
                                  ...item,
                                  customerName: resolvedCustomer,
                                  clientName: resolvedCustomer,
                                  orderStatus: 'Ready to Ship',
                                  currentStage: 'RTD'
                                },
                                'Marked as RTD (Ready to Dispatch) for Logistics by workshop'
                              );
                            }}
                            className="glass-button inline-flex items-center gap-1 text-xs text-emerald-900 hover:bg-white px-3 py-1 rounded-full transition cursor-pointer font-medium bg-emerald-500/10 border-emerald-500/20"
                            title="Mark as RTD (Ready to Dispatch) so Logistics team can ship it"
                          >
                            <CheckCircle className="w-3 h-3 stroke-[1.5] text-emerald-700" />
                            <span>Mark RTD</span>
                          </button>
                        )}
                        {currentStatus === 'Ready to Ship' && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 font-medium">
                            Queued for Dispatch
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-neutral-400 text-xs">
                  <Clock className="w-8 h-8 mx-auto stroke-[1.5] text-neutral-300 mb-2" />
                  <p className="font-semibold text-neutral-700">No delayed orders match the selected filters</p>
                  {storeFilter === 'LLC' && llcCount === 0 && (
                    <div className="mt-3 text-neutral-500 max-w-sm mx-auto space-y-2">
                      <p className="text-[11px]">
                        No LLC delayed orders found in Supabase. You can add a new delayed order or reload the database.
                      </p>
                      {onRefresh && (
                        <div className="flex items-center justify-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => onRefresh()}
                            className="bg-neutral-900 text-white text-xs px-3.5 py-1.5 rounded-full font-medium cursor-pointer shadow-xs"
                          >
                            Reload Orders
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Bulk CSV Upload Modal */}
      <DelinquencyBulkUploadModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onBulkImport={async (imported) => {
          if (onBulkAddItems) {
            await onBulkAddItems(imported);
          } else if (onAddItem) {
            for (const item of imported) {
              await onAddItem(item);
            }
          }
          if (onRefresh) {
            await onRefresh();
          }
        }}
        existingItems={items}
        lookupContext={lookupContext}
      />
    </div>
  );
};
