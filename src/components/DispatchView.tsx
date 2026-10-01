import React, { useState, useEffect } from 'react';
import { DispatchItem, DelinquencyItem, UserRole } from '../types';
import {
  Copy,
  Check,
  Plus,
  Edit2,
  Save,
  X,
  PackageCheck,
  Truck,
  Share2,
  ExternalLink,
  Search,
  AlertCircle,
  Clock,
  Send,
  Sparkles,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  Download
} from 'lucide-react';
import {
  fetchDailyDispatches,
  insertDailyDispatch
} from '../services/supabaseReturnsService';
import { supabase } from '../services/supabaseClient';
import { exportToCsv, formatBlkbrdOrderId } from '../utils/csvParser';
import { resolveCustomerName } from '../utils/customerResolver';
import { ProductThumbnail } from './ProductThumbnail';
import { resolveProductImage } from '../services/productImageService';

interface DispatchViewProps {
  role: UserRole;
  rtdOrders?: DelinquencyItem[];
  onAddDispatch?: (item: any) => Promise<void> | void;
  onUpdateDispatch?: (item: DispatchItem) => Promise<void> | void;
  onProcessDispatch?: (
    rtdItem: DelinquencyItem,
    dispatchPayload: {
      orderNumber: string;
      customerName?: string;
      shippingPartner: string;
      outgoingTrackingAwb: string;
      shippingType: 'Domestic' | 'International';
      trialPair: 'Y' | 'N';
      notes?: string;
      date: string;
    }
  ) => Promise<void> | void;
  onRefreshAll?: () => void;
  initialSubTab?: 'rtd' | 'dispatched';
  onViewOrderSummary?: (orderId: string) => void;
}

export const DispatchView: React.FC<DispatchViewProps> = ({
  role,
  rtdOrders = [],
  onAddDispatch,
  onUpdateDispatch,
  onProcessDispatch,
  onRefreshAll,
  initialSubTab = 'rtd',
  onViewOrderSummary
}) => {
  // Sub-tabs: 'rtd' (Ready to Dispatch Queue) vs 'dispatched' (Already Shipped Daily Log)
  const [activeSubTab, setActiveSubTab] = useState<'rtd' | 'dispatched'>(() => {
    if (initialSubTab === 'dispatched') return 'dispatched';
    return rtdOrders.length > 0 ? 'rtd' : 'dispatched';
  });

  const [items, setItems] = useState<DispatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState<string | null>(null);
  const [copiedCrmId, setCopiedCrmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState<'ALL' | 'Global' | 'LLC'>('ALL');

  // Inline editing for dispatched items
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<DispatchItem>>({});

  // Manual Ad-Hoc Dispatch modal
  const [isAdding, setIsAdding] = useState(false);
  const [newForm, setNewForm] = useState({
    date: new Date().toISOString().split('T')[0],
    orderNumber: '',
    shippingType: 'Domestic' as 'Domestic' | 'International',
    shippingPartner: 'Bluedart',
    outgoingTrackingAwb: '',
    trialPair: 'N' as 'Y' | 'N',
    notes: ''
  });

  // Dedicated RTD Dispatch Modal
  const [selectedRtdOrder, setSelectedRtdOrder] = useState<DelinquencyItem | null>(null);
  const [rtdDispatchForm, setRtdDispatchForm] = useState({
    date: new Date().toISOString().split('T')[0],
    shippingType: 'Domestic' as 'Domestic' | 'International',
    shippingPartner: 'Bluedart',
    outgoingTrackingAwb: '',
    trialPair: 'N' as 'Y' | 'N',
    notes: ''
  });
  const [isSubmittingRtd, setIsSubmittingRtd] = useState(false);

  // Success dispatch banner state (for instant customer messaging)
  const [recentDispatchedNotice, setRecentDispatchedNotice] = useState<{
    orderId: string;
    customerName: string;
    courier: string;
    awb: string;
    product: string;
  } | null>(null);

  useEffect(() => {
    loadDispatches();
  }, []);

  // Update active subtab if rtdOrders change and user requested rtd
  useEffect(() => {
    if (initialSubTab === 'rtd') {
      setActiveSubTab('rtd');
    }
  }, [initialSubTab]);

  const loadDispatches = async () => {
    setIsLoading(true);
    try {
      const data = await fetchDailyDispatches();
      const mapped: DispatchItem[] = data.map((d: any, index: number) => ({
        id: d.id,
        sNo: d.serial_number || index + 1,
        date: d.dispatch_date || new Date().toISOString().split('T')[0],
        orderNumber: d.order_id || '',
        shippingType: d.shipping_type || 'Domestic',
        shippingPartner: d.shipping_partner || 'Bluedart',
        outgoingTrackingAwb: d.outgoing_tracking_awb || '',
        trialPair: d.trial_pair || 'N',
        region: d.shipping_type || 'Domestic',
        trackingDetails: d.outgoing_tracking_awb || '',
        courier: d.shipping_partner || 'Bluedart',
        trackingFulfilled: d.trial_pair === 'Y' ? 'Trial' : 'YES',
        notes: d.notes || ''
      }));
      setItems(mapped);
    } catch (err) {
      console.error('Failed to load dispatches:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTracking(text);
    setTimeout(() => setCopiedTracking(null), 1500);
  };

  const copyCrmMessage = (item: DispatchItem) => {
    const partner = item.shippingPartner || item.courier || 'our logistics courier';
    const awb = item.outgoingTrackingAwb || item.trackingDetails || 'Pending update';
    const msg = `Hello! Your handcrafted BLKBRD Shoemaker order #${item.orderNumber} has been dispatched via ${partner}.
Tracking / AWB Number: ${awb}

Track your shipment at the carrier portal or reply here for live support. Thank you for choosing BLKBRD Shoemaker!`;
    navigator.clipboard.writeText(msg);
    setCopiedCrmId(item.id);
    setTimeout(() => setCopiedCrmId(null), 2500);
  };

  const copyCustomerNoticeFromRtd = (info: { orderId: string; customerName: string; courier: string; awb: string; product: string }) => {
    const msg = `Dear ${info.customerName},

Great news! Your custom BLKBRD Shoemaker order #${info.orderId} (${info.product}) has been dispatched from our workshop!

Courier Partner: ${info.courier}
Tracking / AWB Number: ${info.awb}

Thank you for your valued support of bespoke Goodyear-welted shoemaking!`;
    navigator.clipboard.writeText(msg);
    setCopiedTracking(info.awb);
    setTimeout(() => setCopiedTracking(null), 2500);
  };

  const getTrackingUrl = (courier?: string, tracking?: string) => {
    if (!tracking) return null;
    const c = (courier || '').toLowerCase();
    const cleanTrack = tracking.trim();
    if (c.includes('delhivery')) return `https://www.delhivery.com/track/package/${cleanTrack}`;
    if (c.includes('bluedart')) return `https://www.bluedart.com/tracking`;
    if (c.includes('dhl')) return `https://www.dhl.com/en/express/tracking.html?AWB=${cleanTrack}`;
    if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${cleanTrack}`;
    if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${cleanTrack}`;
    if (c.includes('speed') || c.includes('india post')) return `https://www.indiapost.gov.in/`;
    return null;
  };

  // Filter RTD Orders
  const filteredRtdOrders = rtdOrders.filter(order => {
    const isLlc = order.storeTab === 'LLC' || order.orderId.toUpperCase().startsWith('US');
    if (storeFilter === 'Global' && isLlc) return false;
    if (storeFilter === 'LLC' && !isLlc) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const custName = order.customerName || order.clientName || resolveCustomerName(order.orderId);
    return (
      order.orderId.toLowerCase().includes(q) ||
      custName.toLowerCase().includes(q) ||
      (order.shoeStyle || '').toLowerCase().includes(q) ||
      (order.delayReason || '').toLowerCase().includes(q) ||
      (order.actionRequired || '').toLowerCase().includes(q)
    );
  });

  // Filter Dispatched Items
  const filteredDispatchedItems = items.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (item.orderNumber || '').toLowerCase().includes(q) ||
      (item.outgoingTrackingAwb || item.trackingDetails || '').toLowerCase().includes(q) ||
      (item.shippingPartner || item.courier || '').toLowerCase().includes(q) ||
      (item.notes || '').toLowerCase().includes(q)
    );
  });

  // Export Dispatched Items to CSV
  const handleExportDispatches = () => {
    const listToExport = filteredDispatchedItems.length > 0 ? filteredDispatchedItems : items;
    if (listToExport.length === 0) {
      alert('No dispatch records available to export.');
      return;
    }

    const exportRows = listToExport.map((item, idx) => ({
      'S.No': item.sNo || idx + 1,
      'Dispatch Date': item.date || '',
      'Order ID': item.orderNumber ? `#${String(item.orderNumber).replace(/^#/, '')}` : '',
      'Shipping Type': item.shippingType || item.region || 'Domestic',
      'Courier Partner': item.shippingPartner || item.courier || '',
      'Outgoing Tracking AWB': item.outgoingTrackingAwb || item.trackingDetails || '',
      'Trial Pair': item.trialPair || 'N',
      'Notes / Remarks': item.notes || ''
    }));

    const dateStr = new Date().toISOString().split('T')[0];
    exportToCsv(exportRows, `BLKBRD_Daily_Dispatch_Log_${dateStr}.csv`);
  };

  // Export RTD Queue to CSV
  const handleExportRtd = () => {
    const listToExport = filteredRtdOrders.length > 0 ? filteredRtdOrders : rtdOrders;
    if (listToExport.length === 0) {
      alert('No Ready to Dispatch (RTD) records available to export.');
      return;
    }

    const exportRows = listToExport.map((item, idx) => ({
      'S.No': item.sNo || idx + 1,
      'Order ID': item.orderId ? `#${String(item.orderId).replace(/^#/, '')}` : '',
      'Customer Name': item.customerName || item.clientName || resolveCustomerName(item.orderId) || '',
      'Store': item.storeTab || (item.orderId.toUpperCase().startsWith('US') ? 'LLC' : 'Global'),
      'Product / Shoe Style': item.shoeStyle || item.product || '',
      'Order Date': item.orderDate || '',
      'Expected Delivery Date': item.expectedDate || '',
      'Days Delayed': item.daysDelayed || 0,
      'Stage': 'RTD',
      'Fulfillment Status': item.orderStatus || 'Ready to Ship',
      'Delay Reason': item.delayReason || '',
      'Action Required': item.actionRequired || '',
      'Workshop Remarks': item.remarks || ''
    }));

    const dateStr = new Date().toISOString().split('T')[0];
    exportToCsv(exportRows, `BLKBRD_RTD_Queue_${dateStr}.csv`);
  };

  // Open RTD Dispatch Drawer
  const openProcessRtdModal = (rtdItem: DelinquencyItem) => {
    const isInternational = rtdItem.storeTab === 'LLC' || rtdItem.orderId.toUpperCase().startsWith('US');
    setSelectedRtdOrder(rtdItem);
    const productModel = rtdItem.product || rtdItem.shoeStyle || 'BLKBRD Goodyear Welted';
    setRtdDispatchForm({
      date: new Date().toISOString().split('T')[0],
      shippingType: isInternational ? 'International' : 'Domestic',
      shippingPartner: isInternational ? 'DHL' : 'Bluedart',
      outgoingTrackingAwb: '',
      trialPair: 'N',
      notes: `Product: ${productModel}`
    });
  };

  // Submit RTD Dispatch
  const handleConfirmRtdDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRtdOrder) return;
    if (!rtdDispatchForm.outgoingTrackingAwb.trim()) {
      alert('Please enter an Outgoing Tracking AWB number.');
      return;
    }

    setIsSubmittingRtd(true);
    try {
      const cleanOrderId = selectedRtdOrder.orderId.replace(/^#/, '').trim();
      const productModel = selectedRtdOrder.product || selectedRtdOrder.shoeStyle || 'Handcrafted Footwear';
      const exactCustomerName = selectedRtdOrder.customerName || selectedRtdOrder.clientName || resolveCustomerName(selectedRtdOrder.orderId) || 'Valued Client';
      const payload = {
        serial_number: items.length + 1,
        dispatch_date: rtdDispatchForm.date,
        order_id: cleanOrderId,
        customer_name: exactCustomerName,
        customerName: exactCustomerName,
        shoe_model: productModel,
        shipping_type: rtdDispatchForm.shippingType,
        shipping_partner: rtdDispatchForm.shippingPartner,
        outgoing_tracking_awb: rtdDispatchForm.outgoingTrackingAwb.trim(),
        trial_pair: rtdDispatchForm.trialPair,
        notes: rtdDispatchForm.notes || `Dispatched from Workshop RTD. Product: ${productModel}`
      };

      if (onProcessDispatch) {
        await onProcessDispatch(selectedRtdOrder, {
          orderNumber: cleanOrderId,
          customerName: exactCustomerName,
          shippingPartner: rtdDispatchForm.shippingPartner,
          outgoingTrackingAwb: rtdDispatchForm.outgoingTrackingAwb.trim(),
          shippingType: rtdDispatchForm.shippingType,
          trialPair: rtdDispatchForm.trialPair,
          notes: rtdDispatchForm.notes,
          date: rtdDispatchForm.date
        });
      } else if (onAddDispatch) {
        await onAddDispatch(payload);
      } else {
        await insertDailyDispatch(payload);
      }

      setRecentDispatchedNotice({
        orderId: cleanOrderId,
        customerName: exactCustomerName,
        courier: rtdDispatchForm.shippingPartner,
        awb: rtdDispatchForm.outgoingTrackingAwb.trim(),
        product: productModel
      });

      if (onRefreshAll) {
        onRefreshAll();
      }
      await loadDispatches();
      setSelectedRtdOrder(null);
    } catch (err: any) {
      alert(`Failed to dispatch order: ${err.message}`);
    } finally {
      setIsSubmittingRtd(false);
    }
  };

  // Inline Dispatched Item Edit
  const startEdit = (item: DispatchItem) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async (item: DispatchItem) => {
    try {
      if (onUpdateDispatch) {
        await onUpdateDispatch({
          ...item,
          ...editForm,
          orderNumber: editForm.orderNumber || item.orderNumber,
          shippingPartner: editForm.shippingPartner || editForm.courier || item.shippingPartner || item.courier || 'Bluedart',
          outgoingTrackingAwb: editForm.outgoingTrackingAwb ?? editForm.trackingDetails ?? item.outgoingTrackingAwb ?? item.trackingDetails ?? '',
          trackingDetails: editForm.outgoingTrackingAwb ?? editForm.trackingDetails ?? item.outgoingTrackingAwb ?? item.trackingDetails ?? '',
          shippingType: editForm.shippingType || editForm.region || item.shippingType || item.region || 'Domestic',
          trialPair: editForm.trialPair || (editForm.trackingFulfilled === 'Trial' ? 'Y' : (item.trialPair || 'N')),
          date: editForm.date || item.date || new Date().toISOString().split('T')[0],
          notes: editForm.notes ?? item.notes
        });
      } else {
        const { error } = await supabase
          .from('daily_dispatches')
          .update({
            dispatch_date: editForm.date,
            order_id: editForm.orderNumber,
            shipping_type: editForm.shippingType || editForm.region,
            shipping_partner: editForm.shippingPartner || editForm.courier,
            outgoing_tracking_awb: editForm.outgoingTrackingAwb || editForm.trackingDetails,
            trial_pair: editForm.trialPair || (editForm.trackingFulfilled === 'Trial' ? 'Y' : 'N'),
            notes: editForm.notes
          })
          .eq('id', item.id);

        if (error) throw error;
      }

      if (onRefreshAll) onRefreshAll();
      await loadDispatches();
      setEditingId(null);
      setEditForm({});
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    }
  };

  // Manual Ad-Hoc Create
  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.orderNumber || !newForm.outgoingTrackingAwb) return;
    try {
      const cleanOrderId = newForm.orderNumber.replace(/^#/, '').trim();
      const isIntl = newForm.shippingType === 'International' || cleanOrderId.toUpperCase().startsWith('US');
      const formattedOrderId = formatBlkbrdOrderId(cleanOrderId, isIntl ? 'LLC' : 'Global');
      const resolvedCust = resolveCustomerName(formattedOrderId);
      const payload = {
        serial_number: items.length + 1,
        dispatch_date: newForm.date,
        order_id: formattedOrderId,
        customer_name: resolvedCust,
        customerName: resolvedCust,
        shoe_model: newForm.notes || 'Dispatched Footwear',
        shipping_type: newForm.shippingType,
        shipping_partner: newForm.shippingPartner,
        outgoing_tracking_awb: newForm.outgoingTrackingAwb.trim(),
        trial_pair: newForm.trialPair,
        notes: newForm.notes
      };

      if (onAddDispatch) {
        await onAddDispatch(payload);
      } else {
        await insertDailyDispatch(payload);
      }

      if (onRefreshAll) {
        onRefreshAll();
      }
      await loadDispatches();
      setIsAdding(false);
      setNewForm({
        date: new Date().toISOString().split('T')[0],
        orderNumber: '',
        shippingType: 'Domestic',
        shippingPartner: 'Bluedart',
        outgoingTrackingAwb: '',
        trialPair: 'N',
        notes: ''
      });
    } catch (err: any) {
      alert(`Dispatch creation failed: ${err.message}`);
    }
  };

  const canEdit = role === 'admin' || role === 'logistics';

  return (
    <div className="glass-panel rounded-3xl overflow-hidden transition-all shadow-xl">
      {/* Top Header & Sub-Tab Navigation */}
      <div className="p-4 sm:p-5 border-b border-neutral-200/60 flex flex-col gap-4 bg-white/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-neutral-900 tracking-tight flex items-center gap-2">
                <Truck className="w-5 h-5 text-neutral-900" />
                <span>Logistics &amp; Dispatch Operations</span>
              </h3>
              {rtdOrders.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 border border-emerald-500/30 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>{rtdOrders.length} Ready from Workshop</span>
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Process finished pairs from production, assign couriers, log tracking AWBs, and maintain dispatch telemetry.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={activeSubTab === 'rtd' ? handleExportRtd : handleExportDispatches}
              disabled={activeSubTab === 'rtd' ? rtdOrders.length === 0 : items.length === 0}
              className="glass-button text-xs text-neutral-800 px-3.5 py-2 rounded-full font-medium transition cursor-pointer flex items-center gap-1.5 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              title={activeSubTab === 'rtd' ? 'Download Ready to Dispatch (RTD) queue as CSV' : 'Download daily dispatch logs as CSV'}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{activeSubTab === 'rtd' ? 'Export RTD CSV' : 'Export Dispatches CSV'}</span>
              <span className="text-[10px] font-mono text-neutral-500">
                ({activeSubTab === 'rtd' ? filteredRtdOrders.length : filteredDispatchedItems.length})
              </span>
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => setIsAdding(!isAdding)}
                className="glass-button text-xs text-neutral-800 px-3.5 py-2 rounded-full font-medium transition cursor-pointer flex items-center gap-1.5 hover:bg-white"
              >
                {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{isAdding ? 'Close Form' : 'Ad-Hoc Dispatch'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Primary Sub-Navigation: RTD Queue vs Dispatched Orders */}
        <div className="flex items-center justify-between gap-3 flex-wrap border-t border-neutral-200/60 pt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab('rtd')}
              className={`px-4 py-2 rounded-2xl text-xs font-semibold transition cursor-pointer flex items-center gap-2 shadow-xs ${
                activeSubTab === 'rtd'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 ring-2 ring-emerald-500/30'
                  : 'bg-white/70 text-neutral-700 hover:bg-white border border-neutral-200/80'
              }`}
            >
              <PackageCheck className="w-4 h-4 stroke-[1.75]" />
              <span>Ready to Dispatch (RTD) Queue</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                  activeSubTab === 'rtd'
                    ? 'bg-emerald-800/60 text-white'
                    : rtdOrders.length > 0
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse'
                    : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {rtdOrders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('dispatched')}
              className={`px-4 py-2 rounded-2xl text-xs font-semibold transition cursor-pointer flex items-center gap-2 shadow-xs ${
                activeSubTab === 'dispatched'
                  ? 'bg-neutral-900 text-white shadow-md'
                  : 'bg-white/70 text-neutral-700 hover:bg-white border border-neutral-200/80'
              }`}
            >
              <Truck className="w-4 h-4 stroke-[1.75]" />
              <span>Dispatched Orders Log</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-medium ${
                  activeSubTab === 'dispatched'
                    ? 'bg-neutral-700 text-white'
                    : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {items.length}
              </span>
            </button>
          </div>

          {/* Search bar & Store filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            {activeSubTab === 'rtd' && (
              <>
                <div className="flex items-center gap-1 bg-neutral-200/50 p-1 rounded-xl">
                  {(['ALL', 'Global', 'LLC'] as const).map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStoreFilter(st)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition cursor-pointer ${
                        storeFilter === st
                          ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      {st === 'ALL' ? 'All Stores' : st}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleExportRtd}
                  disabled={filteredRtdOrders.length === 0}
                  className="px-3 py-1.5 rounded-xl border border-neutral-200/80 bg-white/80 hover:bg-white text-xs font-semibold text-neutral-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 shadow-2xs shrink-0"
                  title="Download filtered Ready to Dispatch (RTD) queue as CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export RTD</span>
                  <span className="text-[10px] font-mono text-neutral-500">({filteredRtdOrders.length})</span>
                </button>
              </>
            )}

            {activeSubTab === 'dispatched' && (
              <button
                type="button"
                onClick={handleExportDispatches}
                disabled={filteredDispatchedItems.length === 0}
                className="px-3 py-1.5 rounded-xl border border-neutral-200/80 bg-white/80 hover:bg-white text-xs font-semibold text-neutral-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 shadow-2xs shrink-0"
                title="Download filtered daily dispatch logs as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export CSV</span>
                <span className="text-[10px] font-mono text-neutral-500">({filteredDispatchedItems.length})</span>
              </button>
            )}

            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder={
                  activeSubTab === 'rtd'
                    ? 'Search ready orders, client, style...'
                    : 'Search order, AWB, courier, notes...'
                }
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8.5 pr-3 py-1.5 glass-input rounded-xl text-xs focus:outline-hidden"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Success Customer Notice Banner */}
      {recentDispatchedNotice && (
        <div className="m-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm animate-in fade-in">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-200 text-emerald-900 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-emerald-900">
                Order #{recentDispatchedNotice.orderId} successfully dispatched!
              </div>
              <div className="text-[11px] text-emerald-700">
                Dispatched via <span className="font-semibold">{recentDispatchedNotice.courier}</span> &bull; AWB: <span className="font-mono font-semibold">{recentDispatchedNotice.awb}</span> &bull; Client: {recentDispatchedNotice.customerName}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => copyCustomerNoticeFromRtd(recentDispatchedNotice)}
              className="text-xs px-3.5 py-1.5 rounded-xl bg-emerald-800 text-white font-medium hover:bg-emerald-900 transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              {copiedTracking === recentDispatchedNotice.awb ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Notice Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Customer Update</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setRecentDispatchedNotice(null)}
              className="p-1.5 text-emerald-700 hover:text-emerald-950 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Manual Ad-Hoc Create Form */}
      {isAdding && canEdit && (
        <form
          onSubmit={handleCreateManual}
          className="m-4 p-4 glass-card rounded-2xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 border border-neutral-200 animate-in fade-in"
        >
          <div>
            <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Date *</label>
            <input
              type="date"
              required
              value={newForm.date}
              onChange={e => setNewForm({ ...newForm, date: e.target.value })}
              className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Order ID *</label>
            <input
              type="text"
              required
              placeholder="e.g. BLKBRD10050"
              value={newForm.orderNumber}
              onChange={e => setNewForm({ ...newForm, orderNumber: e.target.value })}
              className="glass-input rounded-xl px-3 py-2 text-xs w-full font-mono font-semibold"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Shipping Type *</label>
            <select
              value={newForm.shippingType}
              onChange={e => setNewForm({ ...newForm, shippingType: e.target.value as any })}
              className="glass-input rounded-xl px-3 py-2 text-xs font-medium w-full"
            >
              <option value="Domestic">Domestic</option>
              <option value="International">International</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Shipping Partner *</label>
            <select
              value={newForm.shippingPartner}
              onChange={e => setNewForm({ ...newForm, shippingPartner: e.target.value })}
              className="glass-input rounded-xl px-3 py-2 text-xs font-medium w-full"
            >
              <option value="Bluedart">Bluedart</option>
              <option value="Shree Maruti">Shree Maruti</option>
              <option value="DHL">DHL Express</option>
              <option value="FedEx">FedEx</option>
              <option value="UPS">UPS</option>
              <option value="Delhivery">Delhivery</option>
              <option value="Shiprocket">Shiprocket</option>
              <option value="India Post">India Post (Speed Post)</option>
              <option value="DTDC">DTDC</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Outgoing AWB / Tracking *</label>
            <input
              type="text"
              required
              placeholder="e.g. 748392019"
              value={newForm.outgoingTrackingAwb}
              onChange={e => setNewForm({ ...newForm, outgoingTrackingAwb: e.target.value })}
              className="glass-input rounded-xl px-3 py-2 text-xs font-mono w-full"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Trial Pair</label>
            <div className="flex gap-2">
              <select
                value={newForm.trialPair}
                onChange={e => setNewForm({ ...newForm, trialPair: e.target.value as any })}
                className="glass-input rounded-xl px-3 py-2 text-xs font-medium w-full"
              >
                <option value="N">No</option>
                <option value="Y">Yes</option>
              </select>
              <button
                type="submit"
                className="glass-button-dark text-xs px-4 py-2 rounded-xl text-white font-medium transition shrink-0 cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 1: READY TO DISPATCH (RTD) QUEUE                                   */}
      {/* ========================================================================= */}
      {activeSubTab === 'rtd' && (
        <div className="animate-in fade-in">
          {/* Workshop Dispatch Handover Overview Header */}
          <div className="px-4 py-3 bg-emerald-500/5 border-b border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <div className="text-xs text-neutral-700">
                <span className="font-semibold text-emerald-950">Workshop Dispatch Pipeline:</span> Showing pairs that passed final workshop inspection &amp; were marked <span className="font-semibold text-emerald-900">RTD (Ready to Dispatch)</span>.
              </div>
            </div>
            <div className="text-[11px] font-mono text-neutral-500">
              {filteredRtdOrders.length} pair{filteredRtdOrders.length !== 1 ? 's' : ''} awaiting courier handover
            </div>
          </div>

          {filteredRtdOrders.length === 0 ? (
            <div className="py-16 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 border border-emerald-200">
                <PackageCheck className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-neutral-900">All RTD Orders Have Been Dispatched</h4>
              <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
                No orders are currently waiting in the workshop dispatch bay. When the Production team marks delayed or regular orders as "RTD / Ready to Ship", they will appear right here for logistics processing.
              </p>
              <button
                type="button"
                onClick={() => setActiveSubTab('dispatched')}
                className="mt-4 text-xs font-medium text-emerald-800 hover:text-emerald-950 underline underline-offset-4 cursor-pointer"
              >
                View Dispatched Orders Log &rarr;
              </button>
            </div>
          ) : (
            <>
              {/* Mobile RTD Card View */}
              <div className="block sm:hidden divide-y divide-neutral-200/50">
                {filteredRtdOrders.map((item, idx) => {
                  const isLlc = item.storeTab === 'LLC' || item.orderId.toUpperCase().startsWith('US');
                  const productModel = item.product || item.shoeStyle || 'BLKBRD Goodyear Welted';
                  return (
                    <div key={item.id ? `${item.id}-${idx}` : `rtd-mob-${item.orderId || idx}`} className="p-4 space-y-2.5 bg-white/40">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {onViewOrderSummary ? (
                            <button
                              type="button"
                              onClick={() => onViewOrderSummary(item.orderId)}
                              className="font-mono text-xs font-bold text-neutral-900 hover:text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                              title="View Order Summary & History"
                            >
                              <span>#{item.orderId.replace(/^#/, '')}</span>
                              <ExternalLink className="w-3 h-3 text-blue-600" />
                            </button>
                          ) : (
                            <span className="font-mono text-xs font-bold text-neutral-900">
                              #{item.orderId.replace(/^#/, '')}
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-bold ${
                              isLlc
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-blue-50 text-blue-900 border border-blue-200'
                            }`}
                          >
                            {isLlc ? 'LLC' : 'Global'}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">
                          RTD (Ready)
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <ProductThumbnail
                          src={resolveProductImage(item.orderId, productModel, [], item.imageUrl)}
                          alt={productModel}
                          size="sm"
                          className="rounded-lg shadow-2xs border border-neutral-200 bg-white shrink-0"
                        />
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-neutral-900 truncate">
                              {item.customerName || item.clientName || resolveCustomerName(item.orderId)}
                            </span>
                            <span className="text-[9px] text-neutral-400 font-mono shrink-0">From Order</span>
                          </div>
                          <div className="text-xs text-neutral-600 truncate">{productModel}</div>
                        </div>
                      </div>

                      {item.delayReason && (
                        <div className="text-[11px] text-neutral-500 bg-neutral-100/80 p-2 rounded-xl">
                          <span className="font-medium text-neutral-700">Workshop Note:</span> {item.delayReason}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <div className="text-[11px] font-mono text-neutral-500">
                          {item.daysDelayed > 0 ? `${item.daysDelayed}d lead delay` : 'On schedule'}
                        </div>
                        <button
                          type="button"
                          onClick={() => openProcessRtdModal(item)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition cursor-pointer"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Dispatch Now</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop RTD Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200/60 bg-white/40 text-neutral-500 uppercase font-medium text-[10px] tracking-wider">
                      <th className="py-3 px-3">S.No</th>
                      <th className="py-3 px-3">Store</th>
                      <th className="py-3 px-3">Order ID</th>
                      <th className="py-3 px-4">Customer Name</th>
                      <th className="py-3 px-4">Product / Style</th>
                      <th className="py-3 px-3">Lead Status</th>
                      <th className="py-3 px-4">Workshop Notes</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-4 text-right">Logistics Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200/50">
                    {filteredRtdOrders.map((item, index) => {
                      const isLlc = item.storeTab === 'LLC' || item.orderId.toUpperCase().startsWith('US');
                      const productModel = item.product || item.shoeStyle || 'BLKBRD Goodyear Welted';
                      return (
                        <tr
                          key={item.id ? `${item.id}-${index}` : `rtd-row-${item.orderId || index}`}
                          className="hover:bg-emerald-50/30 transition-colors duration-150"
                        >
                          <td className="py-3.5 px-3 font-mono text-neutral-400 text-[11px]">
                            {index + 1}
                          </td>
                          <td className="py-3.5 px-3">
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-bold ${
                                isLlc
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-blue-50 text-blue-900 border border-blue-200'
                              }`}
                            >
                              {isLlc ? 'LLC' : 'Global'}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 font-mono font-bold text-neutral-900">
                            {onViewOrderSummary ? (
                              <button
                                type="button"
                                onClick={() => onViewOrderSummary(item.orderId)}
                                className="hover:text-blue-600 hover:underline flex items-center gap-1 group text-left cursor-pointer transition font-mono font-bold"
                                title="View Order Summary & History"
                              >
                                <span>#{item.orderId.replace(/^#/, '')}</span>
                                <ExternalLink className="w-3 h-3 text-neutral-400 group-hover:text-blue-600 transition" />
                              </button>
                            ) : (
                              `#${item.orderId.replace(/^#/, '')}`
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-neutral-900">
                            <div className="flex flex-col">
                              <span className="font-semibold text-neutral-900 leading-tight">
                                {item.customerName || item.clientName || resolveCustomerName(item.orderId)}
                              </span>
                              <span className="text-[10px] text-neutral-400 font-mono flex items-center gap-1 mt-0.5">
                                From Order
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-neutral-700 min-w-[200px] max-w-[260px]">
                            <div className="flex items-center gap-2.5">
                              <ProductThumbnail
                                src={resolveProductImage(item.orderId, productModel, [], item.imageUrl)}
                                alt={productModel}
                                size="xs"
                                className="rounded-lg shadow-2xs border border-neutral-200 bg-white shrink-0"
                              />
                              <span className="truncate text-xs font-medium text-neutral-800" title={productModel}>
                                {productModel}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3 font-mono text-[11px]">
                            {item.daysDelayed > 0 ? (
                              <span className="text-amber-800 font-medium">+{item.daysDelayed}d delay</span>
                            ) : (
                              <span className="text-emerald-700 font-medium">Ready on schedule</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-neutral-600 text-[11px] max-w-[220px] truncate" title={item.delayReason || item.actionRequired || 'Ready for dispatch'}>
                            {item.delayReason || item.actionRequired || 'Workshop completed & boxed'}
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>RTD</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => openProcessRtdModal(item)}
                              className="inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition cursor-pointer shadow-xs"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>Dispatch</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: DISPATCHED ORDERS LOG                                           */}
      {/* ========================================================================= */}
      {activeSubTab === 'dispatched' && (
        <div className="animate-in fade-in">
          {isLoading && (
            <div className="py-12 text-center text-xs text-neutral-500 font-mono">
              Loading daily dispatches from Supabase...
            </div>
          )}

          {!isLoading && filteredDispatchedItems.length === 0 && (
            <div className="py-12 text-center text-xs text-neutral-400">
              No dispatched orders found matching your search.
            </div>
          )}

          {/* Mobile Dispatched Cards */}
          <div className="block sm:hidden divide-y divide-neutral-200/50">
            {filteredDispatchedItems.map((item, idx) => {
              const trackUrl = getTrackingUrl(item.shippingPartner || item.courier, item.outgoingTrackingAwb || item.trackingDetails);

              return (
                <div key={item.id ? `${item.id}-${idx}` : `disp-mob-${idx}`} className="p-4 space-y-2 bg-white/40">
                  <div className="flex items-center justify-between">
                    {onViewOrderSummary ? (
                      <button
                        type="button"
                        onClick={() => onViewOrderSummary(item.orderNumber)}
                        className="font-mono text-xs font-bold text-neutral-900 hover:text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                        title="View Order Summary & History"
                      >
                        <span>#{item.orderNumber}</span>
                        <ExternalLink className="w-3 h-3 text-blue-600" />
                      </button>
                    ) : (
                      <span className="font-mono text-xs font-bold text-neutral-900">#{item.orderNumber}</span>
                    )}
                    <span className="text-[10px] font-mono text-neutral-500">{item.date}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 font-medium">
                      {item.shippingType || item.region || 'Domestic'}
                    </span>
                    <span className="text-xs font-semibold text-neutral-800">
                      {item.shippingPartner || item.courier || 'Bluedart'}
                    </span>
                    {item.trialPair === 'Y' && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-purple-50 text-purple-700 border border-purple-200 font-semibold">
                        Trial
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5 font-mono text-xs text-neutral-900 font-medium">
                      <span>AWB: {item.outgoingTrackingAwb || item.trackingDetails}</span>
                      <button
                        type="button"
                        onClick={() => copy(item.outgoingTrackingAwb || item.trackingDetails || '')}
                        className="p-1 text-neutral-400 hover:text-neutral-700"
                        title="Copy AWB"
                      >
                        {copiedTracking === (item.outgoingTrackingAwb || item.trackingDetails) ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {trackUrl && (
                        <a
                          href={trackUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-neutral-500 hover:text-neutral-900 p-1"
                          title="Track on Courier Portal"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => copyCrmMessage(item)}
                        className="p-1 text-neutral-400 hover:text-neutral-700"
                        title="Copy CRM Message"
                      >
                        {copiedCrmId === item.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Share2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Dispatched Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200/60 bg-white/40 text-neutral-500 uppercase font-medium text-[10px] tracking-wider">
                  <th className="py-3 px-3">S.No</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Order ID</th>
                  <th className="py-3 px-3">Shipping Type</th>
                  <th className="py-3 px-4">Courier / Partner</th>
                  <th className="py-3 px-4">Outgoing Tracking AWB</th>
                  <th className="py-3 px-3">Trial</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/50">
                {filteredDispatchedItems.map((item, index) => {
                  const isEditing = editingId === item.id;
                  const trackUrl = getTrackingUrl(item.shippingPartner || item.courier, item.outgoingTrackingAwb || item.trackingDetails);

                  return (
                    <tr key={item.id ? `${item.id}-${index}` : `disp-row-${index}`} className="hover:bg-white/40 transition-colors duration-150">
                      <td className="py-3.5 px-3 font-mono text-neutral-400 text-[11px]">{item.sNo || index + 1}</td>

                      <td className="py-3.5 px-3 font-mono text-neutral-600">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editForm.date || item.date}
                            onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                            className="glass-input rounded-md px-2 py-1 text-xs font-mono"
                          />
                        ) : (
                          item.date
                        )}
                      </td>

                      <td className="py-3.5 px-3 font-mono font-bold text-neutral-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.orderNumber || item.orderNumber}
                            onChange={e => setEditForm({ ...editForm, orderNumber: e.target.value })}
                            className="glass-input rounded-md px-2 py-1 text-xs font-mono font-bold"
                          />
                        ) : onViewOrderSummary ? (
                          <button
                            type="button"
                            onClick={() => onViewOrderSummary(item.orderNumber)}
                            className="hover:text-blue-600 hover:underline flex items-center gap-1 group text-left cursor-pointer transition font-mono font-bold"
                            title="View Order Summary & History"
                          >
                            <span>#{item.orderNumber}</span>
                            <ExternalLink className="w-3 h-3 text-neutral-400 group-hover:text-blue-600 transition" />
                          </button>
                        ) : (
                          `#${item.orderNumber}`
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        {isEditing ? (
                          <select
                            value={editForm.shippingType || item.shippingType || item.region || 'Domestic'}
                            onChange={e => setEditForm({ ...editForm, shippingType: e.target.value as any })}
                            className="glass-input rounded-md px-2 py-1 text-xs"
                          >
                            <option value="Domestic">Domestic</option>
                            <option value="International">International</option>
                          </select>
                        ) : (
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-medium ${
                              (item.shippingType || item.region) === 'International'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-neutral-100 text-neutral-700'
                            }`}
                          >
                            {item.shippingType || item.region || 'Domestic'}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-neutral-800">
                        {isEditing ? (
                          <select
                            value={editForm.shippingPartner || item.shippingPartner || item.courier || 'Bluedart'}
                            onChange={e => setEditForm({ ...editForm, shippingPartner: e.target.value })}
                            className="glass-input rounded-md px-2 py-1 text-xs"
                          >
                            <option value="Bluedart">Bluedart</option>
                            <option value="Shree Maruti">Shree Maruti</option>
                            <option value="DHL">DHL Express</option>
                            <option value="FedEx">FedEx</option>
                            <option value="UPS">UPS</option>
                            <option value="Delhivery">Delhivery</option>
                            <option value="Shiprocket">Shiprocket</option>
                            <option value="India Post">India Post</option>
                            <option value="DTDC">DTDC</option>
                          </select>
                        ) : (
                          item.shippingPartner || item.courier || 'Bluedart'
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.outgoingTrackingAwb || item.outgoingTrackingAwb || item.trackingDetails || ''}
                            onChange={e => setEditForm({ ...editForm, outgoingTrackingAwb: e.target.value })}
                            className="glass-input rounded-md px-2 py-1 text-xs font-mono"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 font-mono text-neutral-900 font-semibold">
                            <span>{item.outgoingTrackingAwb || item.trackingDetails || '-'}</span>
                            {(item.outgoingTrackingAwb || item.trackingDetails) && (
                              <button
                                type="button"
                                onClick={() => copy(item.outgoingTrackingAwb || item.trackingDetails || '')}
                                className="text-neutral-400 hover:text-neutral-700 p-0.5 cursor-pointer"
                                title="Copy AWB Tracking Number"
                              >
                                {copiedTracking === (item.outgoingTrackingAwb || item.trackingDetails) ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            )}
                            {trackUrl && (
                              <a
                                href={trackUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-neutral-400 hover:text-blue-600 p-0.5"
                                title="Open Courier Tracking Page"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        {isEditing ? (
                          <select
                            value={editForm.trialPair || (item.trialPair === 'Y' ? 'Y' : 'N')}
                            onChange={e => setEditForm({ ...editForm, trialPair: e.target.value as any })}
                            className="glass-input rounded-md px-2 py-1 text-xs"
                          >
                            <option value="N">No</option>
                            <option value="Y">Yes</option>
                          </select>
                        ) : item.trialPair === 'Y' ? (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-purple-50 text-purple-700 border border-purple-200 font-semibold">
                            Trial
                          </span>
                        ) : (
                          <span className="text-neutral-400 text-[11px]">-</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-neutral-500 max-w-[180px] truncate">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.notes || item.notes || ''}
                            onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                            className="glass-input rounded-md px-2 py-1 text-xs"
                          />
                        ) : (
                          item.notes || '-'
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSave(item)}
                                className="glass-button text-xs text-emerald-800 hover:text-emerald-950 px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer"
                              >
                                <Save className="w-3 h-3" />
                                <span>Save</span>
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="glass-button text-xs text-neutral-600 px-2 py-1 rounded-md cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => copyCrmMessage(item)}
                                className="glass-button inline-flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-900 px-2.5 py-1 rounded-md transition cursor-pointer"
                                title="Copy Client WhatsApp/Email Notice"
                              >
                                {copiedCrmId === item.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span className="text-[10px] text-emerald-700">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Share2 className="w-3 h-3" />
                                    <span className="text-[10px]">Notice</span>
                                  </>
                                )}
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => startEdit(item)}
                                  className="text-neutral-400 hover:text-neutral-900 p-1 cursor-pointer"
                                  title="Edit entry"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PROCESS RTD ORDER DISPATCH (PERFECTLY CENTERED & WELL-FITTED)      */}
      {/* ========================================================================= */}
      {selectedRtdOrder && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in">
          <div className="glass-panel w-full max-w-2xl rounded-3xl border border-neutral-200/80 shadow-2xl bg-white/98 flex flex-col my-auto overflow-hidden">
            {/* Modal Header */}
            <div className="sticky top-0 z-20 px-6 py-4 border-b border-neutral-200/80 flex items-center justify-between bg-emerald-500/10 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-900 flex items-center justify-center font-bold">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Dispatch Order #{selectedRtdOrder.orderId.replace(/^#/, '')}
                  </h3>
                  <p className="text-[11px] text-neutral-600">
                    Client: <span className="font-semibold text-neutral-900">{selectedRtdOrder.customerName || selectedRtdOrder.clientName || resolveCustomerName(selectedRtdOrder.orderId)}</span> &bull; Store: <span className="font-mono font-semibold text-neutral-900">{selectedRtdOrder.storeTab || 'Global'}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRtdOrder(null)}
                className="p-1.5 text-neutral-400 hover:text-neutral-900 rounded-full hover:bg-neutral-200/60 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Order Product Spec Info */}
            <div className="px-6 py-3 bg-neutral-100/90 border-b border-neutral-200/80 text-xs flex items-center justify-between">
              <div>
                <span className="text-[9px] uppercase font-mono text-neutral-500 font-bold block">Footwear Model / Product:</span>
                <span className="font-bold text-neutral-900 text-xs">
                  {selectedRtdOrder.product || selectedRtdOrder.shoeStyle || 'BLKBRD Goodyear Welted'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase font-mono text-neutral-500 font-bold block">Workshop Status:</span>
                <span className="text-emerald-800 font-bold font-mono text-[11px]">RTD &bull; QC Passed &amp; Boxed</span>
              </div>
            </div>

            {/* Dispatch Form */}
            <form onSubmit={handleConfirmRtdDispatch} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-800 mb-1">
                    Dispatch Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={rtdDispatchForm.date}
                    onChange={e => setRtdDispatchForm({ ...rtdDispatchForm, date: e.target.value })}
                    className="glass-input rounded-xl px-3.5 py-2 text-xs font-mono w-full"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-800 mb-1">
                    Shipping Type *
                  </label>
                  <select
                    value={rtdDispatchForm.shippingType}
                    onChange={e => setRtdDispatchForm({ ...rtdDispatchForm, shippingType: e.target.value as any })}
                    className="glass-input rounded-xl px-3.5 py-2 text-xs font-medium w-full"
                  >
                    <option value="Domestic">Domestic (India)</option>
                    <option value="International">International Air Freight</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-800 mb-1">
                  Shipping Partner / Courier *
                </label>
                <select
                  value={rtdDispatchForm.shippingPartner}
                  onChange={e => setRtdDispatchForm({ ...rtdDispatchForm, shippingPartner: e.target.value })}
                  className="glass-input rounded-xl px-3.5 py-2 text-xs font-semibold w-full"
                >
                  <option value="Bluedart">Bluedart</option>
                  <option value="Shree Maruti">Shree Maruti</option>
                  <option value="DHL">DHL Express Worldwide</option>
                  <option value="FedEx">FedEx International Priority</option>
                  <option value="UPS">UPS Worldwide Saver</option>
                  <option value="Delhivery">Delhivery Surface/Air</option>
                  <option value="Shiprocket">Shiprocket</option>
                  <option value="India Post">India Post (Speed Post)</option>
                  <option value="DTDC">DTDC Air</option>
                  <option value="Other">Other Courier Partner</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-800 mb-1 flex items-center justify-between">
                  <span>Outgoing Tracking AWB Number *</span>
                  <span className="text-[10px] font-normal text-neutral-500 font-mono">Provided by courier partner</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 7849201938 or 2849102830"
                  value={rtdDispatchForm.outgoingTrackingAwb}
                  onChange={e => setRtdDispatchForm({ ...rtdDispatchForm, outgoingTrackingAwb: e.target.value })}
                  autoFocus
                  className="glass-input rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-neutral-900 w-full focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-800 mb-1">
                    Trial Pair Fulfillment?
                  </label>
                  <select
                    value={rtdDispatchForm.trialPair}
                    onChange={e => setRtdDispatchForm({ ...rtdDispatchForm, trialPair: e.target.value as any })}
                    className="glass-input rounded-xl px-3.5 py-2 text-xs font-medium w-full"
                  >
                    <option value="N">No (Final Customer Pair)</option>
                    <option value="Y">Yes (Fit Sample Trial Pair)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-800 mb-1">
                    Special Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Insured, signature required"
                    value={rtdDispatchForm.notes}
                    onChange={e => setRtdDispatchForm({ ...rtdDispatchForm, notes: e.target.value })}
                    className="glass-input rounded-xl px-3.5 py-2 text-xs w-full"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200/80 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedRtdOrder(null)}
                  disabled={isSubmittingRtd}
                  className="px-4 py-2 text-xs font-semibold text-neutral-700 hover:text-neutral-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRtd}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSubmittingRtd ? 'Logging Dispatch...' : 'Confirm & Log Dispatch'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};