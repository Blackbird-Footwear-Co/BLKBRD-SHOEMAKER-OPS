import React, { useState, useMemo } from 'react';
import {
  DispatchItem,
  DelinquencyItem,
  ReturnItem,
  TrialPairItem,
  BostonStockItem,
  ShopifyOrder,
  UserProfile
} from '../types';
import {
  Truck,
  PackageCheck,
  RotateCcw,
  Footprints,
  Boxes,
  Search,
  Plus,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  ShoppingBag,
  User,
  Calendar,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Edit2,
  Save,
  X,
  Share2,
  Package,
  Phone,
  Mail,
  MapPin,
  Sparkles,
  MessageSquare
} from 'lucide-react';
import { resolveCustomerName, getShopifyAdminOrderUrl } from '../utils/customerResolver';
import { resolveProductImage } from '../services/productImageService';
import { ProductThumbnail } from './ProductThumbnail';
import { exportToCsv, orderIdsMatch } from '../utils/csvParser';

export type LogisticsSidebarTab = 'rtd' | 'shipped' | 'returns' | 'trials' | 'inventory';

interface LogisticsDashboardViewProps {
  currentUser: UserProfile;
  rtdOrders: DelinquencyItem[];
  dispatches: DispatchItem[];
  returns: ReturnItem[];
  trialPairs: TrialPairItem[];
  bostonStock: BostonStockItem[];
  shopifyOrders: ShopifyOrder[];
  onProcessDispatch: (
    rtdItem: DelinquencyItem,
    payload: {
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
  onAddDispatch: (payload: any) => Promise<void> | void;
  onUpdateDispatch?: (item: DispatchItem) => Promise<void> | void;
  onAddReturn: (item: any) => Promise<void> | void;
  onUpdateReturn: (item: ReturnItem) => Promise<void> | void;
  onAddTrial: (item: any) => Promise<void> | void;
  onUpdateTrial: (item: TrialPairItem) => Promise<void> | void;
  onAddBostonStock?: (item: any) => void;
  onUpdateBostonStock?: (item: BostonStockItem) => void;
  onViewOrderSummary?: (orderId: string) => void;
  onRefresh: () => void;
}

const SHIPPING_PARTNERS = [
  'Bluedart',
  'Shree Maruti',
  'DHL Express',
  'FedEx',
  'UPS',
  'Delhivery',
  'Shiprocket',
  'India Post (Speed Post)',
  'DTDC',
  'Other'
];

export const LogisticsDashboardView: React.FC<LogisticsDashboardViewProps> = ({
  currentUser,
  rtdOrders = [],
  dispatches = [],
  returns = [],
  trialPairs = [],
  bostonStock = [],
  shopifyOrders = [],
  onProcessDispatch,
  onAddDispatch,
  onUpdateDispatch,
  onAddReturn,
  onUpdateReturn,
  onAddTrial,
  onUpdateTrial,
  onAddBostonStock,
  onUpdateBostonStock,
  onViewOrderSummary,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<LogisticsSidebarTab>('rtd');
  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState<'ALL' | 'Global' | 'LLC'>('ALL');
  const [copiedTracking, setCopiedTracking] = useState<string | null>(null);
  const [copiedCrmId, setCopiedCrmId] = useState<string | null>(null);

  // Expanded order card states (for accordion order details)
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  // RTD Shipping Form State (per order ID)
  const [shippingForms, setShippingForms] = useState<Record<string, {
    awb: string;
    partner: string;
    type: 'Domestic' | 'International';
    trial: 'Y' | 'N';
    notes: string;
    isSubmitting?: boolean;
  }>>({});

  // Inline edit state for shipped dispatches
  const [editingDispatchId, setEditingDispatchId] = useState<string | null>(null);
  const [editDispatchForm, setEditDispatchForm] = useState<Partial<DispatchItem>>({});
  const [shippedAwbFilter, setShippedAwbFilter] = useState<'all' | 'missing_awb' | 'with_awb'>('all');

  // Modals for adding ad-hoc records
  const [isAddReturnOpen, setIsAddReturnOpen] = useState(false);
  const [newReturnForm, setNewReturnForm] = useState({
    orderNumber: '',
    customerName: '',
    storeTab: 'Global' as 'Global' | 'LLC',
    reason: 'Size Exchange',
    courier: 'Bluedart',
    trackingNumber: '',
    conditionStatus: 'Good Condition (Restock)',
    notes: ''
  });

  const [isAddTrialOpen, setIsAddTrialOpen] = useState(false);
  const [newTrialForm, setNewTrialForm] = useState({
    orderId: '',
    customerName: '',
    shoeModel: '',
    size: 'UK 8',
    outboundAwb: '',
    courier: 'Bluedart',
    status: 'With Customer',
    notes: ''
  });

  const [inventoryCategory, setInventoryCategory] = useState<'all' | 'stock' | 'returns' | 'trials'>('all');
  const [isAddStockOpen, setIsAddStockOpen] = useState(false);
  const [newStockForm, setNewStockForm] = useState({
    shoeModel: '',
    size: 'UK 8',
    widthOrLast: 'E (Standard)',
    colorLeather: 'Black Box Calf',
    condition: 'Pristine / Like New' as 'Pristine / Like New' | 'Minor Creasing / Try-on' | 'Refurbished' | 'Needs Polish',
    storageLocation: 'Warehouse Hub - Rack A1',
    status: 'Available' as 'Available' | 'Reserved for Exchange' | 'Re-allocated / Used' | 'Inspection Pending',
    notes: '',
    originalOrderId: '',
    clientName: ''
  });

  // Recent dispatch notice banner
  const [recentNotice, setRecentNotice] = useState<{
    orderId: string;
    customerName: string;
    courier: string;
    awb: string;
    product: string;
  } | null>(null);

  const toggleExpand = (orderId: string) => {
    setExpandedOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const copyToClipboard = (text: string, trackingKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTracking(trackingKey);
    setTimeout(() => setCopiedTracking(null), 2000);
  };

  const copyCustomerNotice = (item: { orderNumber: string; customerName?: string; shippingPartner?: string; outgoingTrackingAwb?: string; date?: string }) => {
    const partner = item.shippingPartner || 'Courier Partner';
    const awb = item.outgoingTrackingAwb || 'N/A';
    const trackUrl = getTrackingUrl(partner, awb) || 'the carrier portal';
    const msg = `Hello ${item.customerName || 'there'}!\n\nYour handcrafted BLKBRD Shoemaker order #${item.orderNumber} has been dispatched.\n\n📦 Courier: ${partner}\n📄 AWB / Tracking: ${awb}\n🔗 Tracking link: ${trackUrl}\n\nThank you for choosing BLKBRD Shoemaker!`;
    navigator.clipboard.writeText(msg);
    setCopiedCrmId(item.orderNumber);
    setTimeout(() => setCopiedCrmId(null), 2500);
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

  // 1. Filtered RTD Orders
  const filteredRtd = useMemo(() => {
    return rtdOrders.filter(item => {
      const isLlc = item.storeTab === 'LLC' || String(item.orderId || '').toUpperCase().startsWith('US');
      if (storeFilter === 'Global' && isLlc) return false;
      if (storeFilter === 'LLC' && !isLlc) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const name = (item.customerName || item.clientName || resolveCustomerName(item.orderId)).toLowerCase();
      const id = (item.orderId || '').toLowerCase();
      const prod = (item.product || item.shoeStyle || '').toLowerCase();
      return id.includes(q) || name.includes(q) || prod.includes(q);
    });
  }, [rtdOrders, storeFilter, searchQuery]);

  // Shipped orders AWB metrics
  const missingAwbCount = useMemo(() => {
    return dispatches.filter(d => !(d.outgoingTrackingAwb || d.trackingDetails || '').trim()).length;
  }, [dispatches]);

  const withAwbCount = useMemo(() => {
    return dispatches.filter(d => Boolean((d.outgoingTrackingAwb || d.trackingDetails || '').trim())).length;
  }, [dispatches]);

  // 2. Filtered Dispatches (Shipped Orders)
  const filteredDispatches = useMemo(() => {
    return dispatches.filter(item => {
      const cleanNum = String(item.orderNumber || '');
      const isLlc = cleanNum.toUpperCase().startsWith('US') || item.shippingType === 'International';
      if (storeFilter === 'Global' && isLlc) return false;
      if (storeFilter === 'LLC' && !isLlc) return false;

      const hasAwb = Boolean((item.outgoingTrackingAwb || item.trackingDetails || '').trim());
      if (shippedAwbFilter === 'missing_awb' && hasAwb) return false;
      if (shippedAwbFilter === 'with_awb' && !hasAwb) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const name = (item.customerName || '').toLowerCase();
      const awb = (item.outgoingTrackingAwb || item.trackingDetails || '').toLowerCase();
      const courier = (item.shippingPartner || item.courier || '').toLowerCase();
      return cleanNum.toLowerCase().includes(q) || name.includes(q) || awb.includes(q) || courier.includes(q);
    });
  }, [dispatches, storeFilter, shippedAwbFilter, searchQuery]);

  // 3. Filtered Returns
  const filteredReturns = useMemo(() => {
    return returns.filter(item => {
      const isLlc = item.storeTab === 'LLC';
      if (storeFilter === 'Global' && isLlc) return false;
      if (storeFilter === 'LLC' && !isLlc) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const num = String(item.orderNumber || '').toLowerCase();
      const cust = String(item.customerName || '').toLowerCase();
      const awb = String(item.incomingTrackingAwb || '').toLowerCase();
      const reason = String(item.reason || item.notes || '').toLowerCase();
      return num.includes(q) || cust.includes(q) || awb.includes(q) || reason.includes(q);
    });
  }, [returns, storeFilter, searchQuery]);

  // 4. Filtered Trial Pairs
  const filteredTrials = useMemo(() => {
    return trialPairs.filter(item => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const num = String(item.orderId || '').toLowerCase();
      const cust = String(item.customerName || '').toLowerCase();
      const model = String(item.shoeModel || '').toLowerCase();
      const awb = String(item.outboundAwb || '').toLowerCase();
      return num.includes(q) || cust.includes(q) || model.includes(q) || awb.includes(q);
    });
  }, [trialPairs, searchQuery]);

  // Inventory count calculations
  const totalStockCount = useMemo(() => {
    const trialWithCust = trialPairs.filter(t => (t.status || '').toLowerCase().includes('customer')).length;
    const trialInStock = trialPairs.length - trialWithCust;
    const returnedPairs = returns.filter(r => (r.status || '').toLowerCase().includes('received') || (r.status || '').toLowerCase().includes('restock')).length;
    const warehouseStock = bostonStock.length;
    return {
      trialWithCust,
      trialInStock: Math.max(0, trialInStock),
      returnedPairs,
      warehouseStock,
      totalTracked: trialPairs.length + returnedPairs + warehouseStock
    };
  }, [trialPairs, returns, bostonStock]);

  // 5. Filtered Warehouse Stock (Boston Inventory)
  const filteredBostonStock = useMemo(() => {
    return bostonStock.filter(item => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const model = String(item.shoeModel || '').toLowerCase();
      const loc = String(item.storageLocation || '').toLowerCase();
      const order = String(item.originalOrderId || '').toLowerCase();
      const client = String(item.clientName || '').toLowerCase();
      const size = String(item.size || '').toLowerCase();
      const leather = String(item.colorLeather || '').toLowerCase();
      return model.includes(q) || loc.includes(q) || order.includes(q) || client.includes(q) || size.includes(q) || leather.includes(q);
    });
  }, [bostonStock, searchQuery]);

  const handleCreateStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStockForm.shoeModel.trim()) return;

    if (onAddBostonStock) {
      onAddBostonStock({
        shoeModel: newStockForm.shoeModel.trim(),
        size: newStockForm.size.trim(),
        widthOrLast: newStockForm.widthOrLast.trim(),
        colorLeather: newStockForm.colorLeather.trim(),
        condition: newStockForm.condition,
        storageLocation: newStockForm.storageLocation.trim(),
        status: newStockForm.status,
        originalOrderId: newStockForm.originalOrderId.trim(),
        clientName: newStockForm.clientName.trim(),
        dateReceived: new Date().toISOString().split('T')[0],
        notes: newStockForm.notes.trim()
      });
    }

    setIsAddStockOpen(false);
    setNewStockForm({
      shoeModel: '',
      size: 'UK 8',
      widthOrLast: 'E (Standard)',
      colorLeather: 'Black Box Calf',
      condition: 'Pristine / Like New',
      storageLocation: 'Warehouse Hub - Rack A1',
      status: 'Available',
      notes: '',
      originalOrderId: '',
      clientName: ''
    });
  };

  // Handle Quick Dispatch of an RTD order
  const handleQuickDispatchOrder = async (item: DelinquencyItem) => {
    const form = shippingForms[item.orderId] || {
      awb: '',
      partner: 'Bluedart',
      type: item.storeTab === 'LLC' || String(item.orderId).toUpperCase().startsWith('US') ? 'International' : 'Domestic',
      trial: 'N',
      notes: ''
    };

    if (!form.awb.trim()) {
      alert('Please enter an Outgoing Tracking AWB number before dispatching.');
      return;
    }

    setShippingForms(prev => ({
      ...prev,
      [item.orderId]: { ...form, isSubmitting: true }
    }));

    try {
      const today = new Date().toISOString().split('T')[0];
      const custName = item.customerName || item.clientName || resolveCustomerName(item.orderId);
      const cleanOrderNum = item.orderId.replace(/^#/, '');

      await onProcessDispatch(item, {
        orderNumber: cleanOrderNum,
        customerName: custName,
        shippingPartner: form.partner,
        outgoingTrackingAwb: form.awb.trim(),
        shippingType: form.type,
        trialPair: form.trial,
        notes: form.notes,
        date: today
      });

      setRecentNotice({
        orderId: cleanOrderNum,
        customerName: custName,
        courier: form.partner,
        awb: form.awb.trim(),
        product: item.product || item.shoeStyle || 'Goodyear Welted Footwear'
      });

      // Clear form
      setShippingForms(prev => {
        const next = { ...prev };
        delete next[item.orderId];
        return next;
      });
    } catch (err: any) {
      alert(`Error processing dispatch: ${err.message || err}`);
    } finally {
      setShippingForms(prev => ({
        ...prev,
        [item.orderId]: { ...form, isSubmitting: false }
      }));
    }
  };

  const handleCreateReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReturnForm.orderNumber.trim()) return;

    try {
      await onAddReturn({
        order_number: newReturnForm.orderNumber.trim(),
        orderNumber: newReturnForm.orderNumber.trim(),
        customer_name: newReturnForm.customerName.trim() || 'Customer',
        customerName: newReturnForm.customerName.trim() || 'Customer',
        storeTab: newReturnForm.storeTab,
        reason: newReturnForm.reason,
        courier: newReturnForm.courier,
        incoming_tracking_awb: newReturnForm.trackingNumber.trim(),
        incomingTrackingAwb: newReturnForm.trackingNumber.trim(),
        status: 'Received',
        notes: newReturnForm.notes || newReturnForm.conditionStatus,
        return_date: new Date().toISOString().split('T')[0]
      });

      setIsAddReturnOpen(false);
      setNewReturnForm({
        orderNumber: '',
        customerName: '',
        storeTab: 'Global',
        reason: 'Size Exchange',
        courier: 'Bluedart',
        trackingNumber: '',
        conditionStatus: 'Good Condition (Restock)',
        notes: ''
      });
    } catch (err: any) {
      alert(`Failed to log return: ${err.message}`);
    }
  };

  const handleCreateTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrialForm.orderId.trim()) return;

    try {
      await onAddTrial({
        orderId: newTrialForm.orderId.trim(),
        customerName: newTrialForm.customerName.trim() || 'Customer',
        shoeModel: `${newTrialForm.shoeModel} (${newTrialForm.size})`.trim(),
        outboundAwb: newTrialForm.outboundAwb.trim(),
        courier: newTrialForm.courier,
        status: newTrialForm.status,
        notes: newTrialForm.notes
      });

      setIsAddTrialOpen(false);
      setNewTrialForm({
        orderId: '',
        customerName: '',
        shoeModel: '',
        size: 'UK 8',
        outboundAwb: '',
        courier: 'Bluedart',
        status: 'With Customer',
        notes: ''
      });
    } catch (err: any) {
      alert(`Failed to add trial pair: ${err.message}`);
    }
  };

  const [isSavingDispatch, setIsSavingDispatch] = useState(false);

  const handleStartEditDispatch = (item: DispatchItem) => {
    const cleanId = item.id || item.orderNumber;
    setEditingDispatchId(cleanId);
    setEditDispatchForm({
      id: item.id,
      orderNumber: item.orderNumber,
      customerName: item.customerName || resolveCustomerName(item.orderNumber),
      shippingPartner: item.shippingPartner || item.courier || 'Bluedart',
      outgoingTrackingAwb: item.outgoingTrackingAwb || item.trackingDetails || '',
      shippingType: (item.shippingType as any) || 'Domestic',
      trialPair: item.trialPair || 'N',
      date: item.date || new Date().toISOString().split('T')[0],
      notes: item.notes || ''
    });
  };

  const handleCancelEditDispatch = () => {
    setEditingDispatchId(null);
    setEditDispatchForm({});
  };

  const handleSaveDispatchEdit = async (originalItem: DispatchItem) => {
    if (!onUpdateDispatch) return;
    setIsSavingDispatch(true);
    try {
      const updated: DispatchItem = {
        ...originalItem,
        ...editDispatchForm,
        orderNumber: originalItem.orderNumber,
        shippingPartner: editDispatchForm.shippingPartner || originalItem.shippingPartner || 'Bluedart',
        outgoingTrackingAwb: editDispatchForm.outgoingTrackingAwb !== undefined ? editDispatchForm.outgoingTrackingAwb.trim() : (originalItem.outgoingTrackingAwb || '').trim(),
        trackingDetails: editDispatchForm.outgoingTrackingAwb !== undefined ? editDispatchForm.outgoingTrackingAwb.trim() : (originalItem.outgoingTrackingAwb || '').trim(),
        shippingType: editDispatchForm.shippingType || originalItem.shippingType || 'Domestic',
        trialPair: editDispatchForm.trialPair || originalItem.trialPair || 'N',
        date: editDispatchForm.date || originalItem.date || new Date().toISOString().split('T')[0],
        notes: editDispatchForm.notes ?? (originalItem.notes || '')
      };
      await onUpdateDispatch(updated);
      setEditingDispatchId(null);
      setEditDispatchForm({});
    } catch (err: any) {
      alert(`Could not save dispatch changes: ${err.message || err}`);
    } finally {
      setIsSavingDispatch(false);
    }
  };

  const handleExportCsv = () => {
    if (activeTab === 'shipped') {
      const rows = filteredDispatches.map((d, idx) => ({
        'S.No': idx + 1,
        'Order Number': d.orderNumber,
        'Customer': d.customerName,
        'Dispatch Date': d.date,
        'Courier': d.shippingPartner || d.courier,
        'AWB Tracking': d.outgoingTrackingAwb || d.trackingDetails,
        'Shipping Type': d.shippingType,
        'Trial Pair': d.trialPair,
        'Notes': d.notes
      }));
      exportToCsv(rows, `BLKBRD_Dispatched_Orders_${new Date().toISOString().split('T')[0]}.csv`);
    } else if (activeTab === 'rtd') {
      const rows = filteredRtd.map((r, idx) => ({
        'S.No': idx + 1,
        'Order ID': r.orderId,
        'Customer': r.customerName || r.clientName,
        'Store': r.storeTab,
        'Product': r.product || r.shoeStyle,
        'Days Delayed': r.daysDelayed,
        'Workshop Notes': r.delayReason || r.actionRequired
      }));
      exportToCsv(rows, `BLKBRD_RTD_Queue_${new Date().toISOString().split('T')[0]}.csv`);
    } else if (activeTab === 'returns') {
      const rows = filteredReturns.map((r, idx) => ({
        'S.No': idx + 1,
        'Order Number': r.orderNumber,
        'Customer': r.customerName,
        'Store': r.storeTab,
        'Reason': r.reason,
        'Courier': r.courier,
        'Incoming AWB': r.incomingTrackingAwb,
        'Status': r.status,
        'Notes': r.notes
      }));
      exportToCsv(rows, `BLKBRD_Returns_Log_${new Date().toISOString().split('T')[0]}.csv`);
    } else if (activeTab === 'trials') {
      const rows = filteredTrials.map((t, idx) => ({
        'S.No': idx + 1,
        'Order ID': t.orderId,
        'Customer': t.customerName,
        'Shoe Model': t.shoeModel,
        'Outbound AWB': t.outboundAwb,
        'Status': t.status,
        'Notes': t.notes
      }));
      exportToCsv(rows, `BLKBRD_Trial_Pairs_${new Date().toISOString().split('T')[0]}.csv`);
    } else if (activeTab === 'inventory') {
      const rows = filteredBostonStock.map((b, idx) => ({
        'S.No': idx + 1,
        'Shoe Model': b.shoeModel,
        'Size': b.size,
        'Width/Last': b.widthOrLast || 'Standard',
        'Color/Leather': b.colorLeather,
        'Condition': b.condition,
        'Location': b.storageLocation,
        'Status': b.status,
        'Original Order': b.originalOrderId,
        'Client': b.clientName,
        'Notes': b.notes
      }));
      exportToCsv(rows, `BLKBRD_Inventory_Stock_${new Date().toISOString().split('T')[0]}.csv`);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 space-y-4">
      {/* Top Banner / Customer Notice on Dispatch */}
      {recentNotice && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-200/90 text-emerald-900 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            </div>
            <div>
              <div className="text-xs font-bold text-emerald-900 flex items-center gap-2 flex-wrap">
                <span>Order #{recentNotice.orderId} successfully dispatched!</span>
                <span className="font-mono text-[10px] bg-emerald-100 px-2 py-0.5 rounded text-emerald-800 border border-emerald-200">
                  AWB: {recentNotice.awb}
                </span>
              </div>
              <div className="text-[11px] text-emerald-800 mt-0.5">
                Shipped via <span className="font-semibold">{recentNotice.courier}</span> to <span className="font-semibold">{recentNotice.customerName}</span>. Ready for customer dispatch notice.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => copyCustomerNotice({
                orderNumber: recentNotice.orderId,
                customerName: recentNotice.customerName,
                shippingPartner: recentNotice.courier,
                outgoingTrackingAwb: recentNotice.awb
              })}
              className="text-xs px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              {copiedCrmId === recentNotice.orderId ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Notice Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy WhatsApp Notice</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setRecentNotice(null)}
              className="p-1.5 text-emerald-700 hover:text-emerald-950 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Container with Sidebar + Order Card Canvas */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* ======================================================== */}
        {/* SIDEBAR: Shipped, RTD Orders, Returns, Trial Pairs       */}
        {/* ======================================================== */}
        <aside className="w-full lg:w-64 shrink-0 space-y-3.5">
          <div className="bg-white rounded-2xl border border-neutral-200/90 p-3 shadow-2xs space-y-1.5">
            <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-neutral-400">
              Logistics Operations
            </div>

            {/* RTD Orders */}
            <button
              type="button"
              onClick={() => setActiveTab('rtd')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'rtd'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <PackageCheck className="w-4 h-4" />
                <span>RTD Orders</span>
              </div>
              <span className={`text-[10.5px] font-mono font-bold px-2 py-0.5 rounded-full ${
                activeTab === 'rtd' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}>
                {rtdOrders.length}
              </span>
            </button>

            {/* Shipped */}
            <button
              type="button"
              onClick={() => setActiveTab('shipped')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'shipped'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Truck className="w-4 h-4" />
                <span>Shipped</span>
              </div>
              <span className={`text-[10.5px] font-mono font-bold px-2 py-0.5 rounded-full ${
                activeTab === 'shipped' ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
              }`}>
                {dispatches.length}
              </span>
            </button>

            {/* Returns */}
            <button
              type="button"
              onClick={() => setActiveTab('returns')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'returns'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <RotateCcw className="w-4 h-4" />
                <span>Returns</span>
              </div>
              <span className={`text-[10.5px] font-mono font-bold px-2 py-0.5 rounded-full ${
                activeTab === 'returns' ? 'bg-amber-700 text-white' : 'bg-amber-50 text-amber-900 border border-amber-200'
              }`}>
                {returns.length}
              </span>
            </button>

            {/* Trial Pairs */}
            <button
              type="button"
              onClick={() => setActiveTab('trials')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'trials'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Footprints className="w-4 h-4" />
                <span>Trial Pairs</span>
              </div>
              <span className={`text-[10.5px] font-mono font-bold px-2 py-0.5 rounded-full ${
                activeTab === 'trials' ? 'bg-purple-700 text-white' : 'bg-purple-50 text-purple-900 border border-purple-200'
              }`}>
                {trialPairs.length}
              </span>
            </button>

            {/* Inventory */}
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Boxes className="w-4 h-4" />
                <span>Inventory</span>
              </div>
              <span className={`text-[10.5px] font-mono font-bold px-2 py-0.5 rounded-full ${
                activeTab === 'inventory' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-900 border border-blue-200'
              }`}>
                {totalStockCount.totalTracked}
              </span>
            </button>
          </div>

          {/* Quick Inventory Summary Widget */}
          <div className="bg-white rounded-2xl border border-neutral-200/90 p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-neutral-500" />
                <span>Inventory Pipeline</span>
              </span>
              <span className="font-mono text-[10px] font-bold text-neutral-600">
                {totalStockCount.totalTracked} Pairs
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between p-2 rounded-xl bg-neutral-50 border border-neutral-200/60">
                <span className="text-neutral-600 text-[11px]">Trial Pairs with Clients:</span>
                <span className="font-mono font-bold text-neutral-900">{totalStockCount.trialWithCust}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-neutral-50 border border-neutral-200/60">
                <span className="text-neutral-600 text-[11px]">Returns in QA / Restocked:</span>
                <span className="font-mono font-bold text-neutral-900">{totalStockCount.returnedPairs}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-neutral-50 border border-neutral-200/60">
                <span className="text-neutral-600 text-[11px]">Warehouse Stock Pairs:</span>
                <span className="font-mono font-bold text-neutral-900">{totalStockCount.warehouseStock}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ======================================================== */}
        {/* MAIN CANVAS: Order Cards View                            */}
        {/* ======================================================== */}
        <main className="flex-1 w-full min-w-0 space-y-3.5">
          {/* Header Controls Bar */}
          <div className="bg-white rounded-2xl border border-neutral-200/90 p-3 sm:p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder={
                  activeTab === 'rtd'
                    ? 'Search ready orders, client, style...'
                    : activeTab === 'shipped'
                    ? 'Search shipped order, AWB, courier...'
                    : activeTab === 'returns'
                    ? 'Search returns by order #, client, AWB...'
                    : activeTab === 'trials'
                    ? 'Search trial pairs by order, client, size...'
                    : 'Search inventory by model, size, location, order #...'
                }
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 sm:py-2 text-xs bg-neutral-50 focus:bg-white border border-neutral-200 focus:border-neutral-900 rounded-xl text-neutral-900 placeholder:text-neutral-400 outline-none transition"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Store Channel Filter */}
              <select
                value={storeFilter}
                onChange={e => setStoreFilter(e.target.value as any)}
                className="text-xs px-2.5 py-1.5 sm:py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-neutral-800 font-semibold focus:border-neutral-900 outline-none cursor-pointer"
              >
                <option value="ALL">All Stores</option>
                <option value="Global">Global</option>
                <option value="LLC">LLC (USA)</option>
              </select>

              {/* Action Buttons based on Active Tab */}
              {activeTab === 'inventory' && (
                <button
                  type="button"
                  onClick={() => setIsAddStockOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-2xs transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Stock Pair</span>
                </button>
              )}

              {activeTab === 'returns' && (
                <button
                  type="button"
                  onClick={() => setIsAddReturnOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-2xs transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log New Return</span>
                </button>
              )}

              {activeTab === 'trials' && (
                <button
                  type="button"
                  onClick={() => setIsAddTrialOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-2xs transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Trial Pair</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleExportCsv}
                title="Export current view to CSV"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold text-xs border border-neutral-200/80 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-neutral-600" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* TAB 1: RTD ORDERS (Ready to Dispatch Queue)                              */}
          {/* ========================================================================= */}
          {activeTab === 'rtd' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between px-1">
                <div className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Ready to Dispatch ({filteredRtd.length} orders awaiting courier pickup)</span>
                </div>
                <span className="text-[11px] text-neutral-500 font-mono">
                  Enter AWB &amp; Shipping Partner to dispatch
                </span>
              </div>

              {filteredRtd.length === 0 ? (
                <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center space-y-2.5 shadow-2xs">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-bold text-neutral-900">All RTD Orders Have Been Dispatched!</h4>
                  <p className="text-[11px] text-neutral-500 max-w-sm mx-auto">
                    When the workshop marks delayed or active pairs as "RTD", they will automatically appear here as order cards ready for shipping.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5">
                  {filteredRtd.map(item => {
                    const cleanId = (item.orderId || '').replace(/^#/, '').trim();
                    const matchingShopify = shopifyOrders.find(s => orderIdsMatch(s.orderNumber, item.orderId));
                    const isLlc = item.storeTab === 'LLC' || matchingShopify?.storeAccount === 'LLC' || cleanId.toUpperCase().startsWith('US');
                    const shopifyAdminUrl = getShopifyAdminOrderUrl(item.orderId, matchingShopify?.id, isLlc ? 'LLC' : 'Global');

                    const resolvedImgUrl = resolveProductImage(
                      item.orderId,
                      item.product || item.shoeStyle,
                      shopifyOrders,
                      item.imageUrl || matchingShopify?.imageUrl
                    );

                    const isExpanded = !!expandedOrders[item.orderId];
                    const form = shippingForms[item.orderId] || {
                      awb: '',
                      partner: isLlc ? 'DHL Express' : 'Bluedart',
                      type: isLlc ? 'International' : 'Domestic',
                      trial: 'N',
                      notes: ''
                    };

                    return (
                      <div
                        key={item.id || item.orderId}
                        className="bg-white rounded-2xl p-3.5 sm:p-4 border border-neutral-200/90 shadow-2xs space-y-3 hover:border-neutral-300 transition"
                      >
                        {/* Top Header */}
                        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-neutral-100 flex-wrap sm:flex-nowrap">
                          {/* Top Left: Customer icon + Customer Name */}
                          <div className="flex items-center gap-1.5 min-w-0">
                            <User className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                            <span className="font-semibold text-xs text-neutral-900 truncate" title={item.customerName || 'Customer'}>
                              {item.customerName || item.clientName || resolveCustomerName(item.orderId)}
                            </span>
                          </div>

                          {/* Top Right: Order dropdown, Store, RTD Badge, Shopify */}
                          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto flex-wrap justify-end">
                            <button
                              type="button"
                              onClick={() => toggleExpand(item.orderId)}
                              className="font-mono font-bold text-xs text-neutral-900 bg-neutral-100 hover:bg-neutral-200 px-2 py-1 rounded-lg border border-neutral-200 flex items-center gap-1 cursor-pointer transition shrink-0"
                              title="Tap to toggle full order details"
                            >
                              <span>#{cleanId}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3 text-neutral-500" /> : <ChevronDown className="w-3 h-3 text-neutral-500" />}
                            </button>

                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-bold ${
                              isLlc ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-blue-50 text-blue-900 border border-blue-200'
                            }`}>
                              {isLlc ? 'LLC (USA)' : 'Global'}
                            </span>

                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 stroke-[2.5]" />
                              <span>RTD</span>
                            </span>

                            <a
                              href={shopifyAdminUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 transition shrink-0"
                              title={`Open order #${cleanId} directly on Shopify Admin`}
                            >
                              <ShoppingBag className="w-3 h-3 text-emerald-600" />
                              <span>Shopify</span>
                              <ExternalLink className="w-2.5 h-2.5 text-emerald-600" />
                            </a>
                          </div>
                        </div>

                        {/* Product Row */}
                        <div className="flex items-start gap-3 bg-neutral-50/90 p-2.5 sm:p-3 rounded-2xl border border-neutral-200/70">
                          <ProductThumbnail
                            src={resolvedImgUrl}
                            alt={item.product || item.shoeStyle || 'Footwear Model'}
                            size="md"
                            className="rounded-xl shadow-2xs border border-neutral-200 bg-white shrink-0"
                          />
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="text-xs font-bold text-neutral-900 leading-snug">
                              {item.product || item.shoeStyle || 'BLKBRD Goodyear Welted Footwear'}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-neutral-600 flex-wrap">
                              {item.orderDate && (
                                <span className="flex items-center gap-1 font-mono">
                                  <Calendar className="w-3 h-3 text-neutral-400" />
                                  <span>Ordered: {item.orderDate}</span>
                                </span>
                              )}
                              {item.expectedDate && (
                                <span className="flex items-center gap-1 font-mono">
                                  <Clock className="w-3 h-3 text-neutral-400" />
                                  <span>Expected: {item.expectedDate}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Dropdown Expanded Details (Customer Address, Notes, Shopify Notes) */}
                        {isExpanded && (
                          <div className="p-3.5 sm:p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80 space-y-3 text-[11px] animate-in fade-in shadow-2xs">
                            {/* Sleek Inline Ordered & Expected Dates Bar */}
                            <div className="flex items-center flex-wrap gap-x-3.5 gap-y-1 bg-white px-3 py-1.5 rounded-xl border border-neutral-200/70 text-xs">
                              {item.orderDate && (
                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                  <span className="text-[10px] uppercase font-bold text-neutral-400">Ordered Date:</span>
                                  <span className="font-mono font-semibold text-neutral-900">{item.orderDate}</span>
                                </div>
                              )}
                              {item.expectedDate && (
                                <>
                                  <span className="text-neutral-300 hidden xs:inline">•</span>
                                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                                    <span className="text-[10px] uppercase font-bold text-neutral-400">Expected Date:</span>
                                    <span className="font-mono font-semibold text-neutral-900">{item.expectedDate}</span>
                                  </div>
                                </>
                              )}
                              {matchingShopify?.totalPrice && (
                                <>
                                  <span className="text-neutral-300 hidden xs:inline">•</span>
                                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                                    <span className="text-[10px] uppercase font-bold text-neutral-400">Total:</span>
                                    <span className="font-mono font-semibold text-neutral-900">{matchingShopify.totalPrice}</span>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Customer Contact & Address Details */}
                            {(matchingShopify?.phone || matchingShopify?.customerEmail || matchingShopify?.address || item.customerName) && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-neutral-700 bg-white/70 p-2.5 rounded-xl border border-neutral-200/60">
                                {matchingShopify?.phone && (
                                  <div className="flex items-center gap-1.5">
                                    <Phone className="w-3 h-3 text-neutral-400" />
                                    <span className="text-neutral-400 text-[9px] uppercase font-bold">Phone:</span>
                                    <span className="font-mono text-neutral-900 font-medium">{matchingShopify.phone}</span>
                                  </div>
                                )}
                                {matchingShopify?.customerEmail && (
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <Mail className="w-3 h-3 text-neutral-400" />
                                    <span className="text-neutral-400 text-[9px] uppercase font-bold">Email:</span>
                                    <span className="font-mono text-neutral-900 truncate">{matchingShopify.customerEmail}</span>
                                  </div>
                                )}
                                {matchingShopify?.address && (
                                  <div className="sm:col-span-2 flex items-start gap-1.5">
                                    <MapPin className="w-3 h-3 text-neutral-400 shrink-0 mt-0.5" />
                                    <span className="text-neutral-400 text-[9px] uppercase font-bold shrink-0 mt-0.5">Address:</span>
                                    <span className="text-neutral-800 text-[10.5px] leading-tight">{matchingShopify.address}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* SHOPIFY NOTES, CRAFTSMAN NOTES & WORKSHOP NOTES */}
                            {(() => {
                              const craftsmanNote = item.craftsmanNotes || matchingShopify?.craftsmanNotes || '';
                              const shopifyNote = item.shopifyNotes || matchingShopify?.notes || '';
                              const workshopDelayReason = item.delayReason || '';

                              return (
                                <div className="space-y-2.5 pt-1 border-t border-neutral-200/70">
                                  {/* Craftsman Notes Banner */}
                                  {craftsmanNote && (
                                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 shadow-2xs space-y-1">
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                                        <span className="uppercase font-mono tracking-wider">Craftsman Notes (Artisan Instructions)</span>
                                      </div>
                                      <div className="text-xs font-medium text-amber-950 bg-white/80 p-2 rounded-lg border border-amber-200">
                                        {craftsmanNote}
                                      </div>
                                    </div>
                                  )}

                                  {/* Shopify Admin Notes */}
                                  {shopifyNote && (
                                    <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/90 text-amber-950 space-y-1">
                                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase font-mono tracking-wider text-amber-900">
                                        <MessageSquare className="w-3 h-3 text-amber-600" />
                                        <span>Shopify Order Notes:</span>
                                      </div>
                                      <div className="text-[11px] font-mono text-neutral-800 whitespace-pre-line bg-white/90 p-2 rounded-lg border border-amber-200/70">
                                        {shopifyNote}
                                      </div>
                                    </div>
                                  )}

                                  {/* Workshop Notes */}
                                  {workshopDelayReason && (
                                    <div className="p-2 rounded-lg bg-white border border-neutral-200 text-xs text-neutral-800">
                                      <span className="font-bold text-neutral-700">Workshop Note:</span> {workshopDelayReason}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* ===================================================== */}
                        {/* SHIPPING ACTION FORM (Directly on the Order Card)     */}
                        {/* ===================================================== */}
                        <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-2.5">
                          <div className="text-[10px] uppercase font-bold text-emerald-900 tracking-wider flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Truck className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Logistics Dispatch Handover</span>
                            </span>
                            <span className="text-[9.5px] font-mono text-emerald-800">
                              Direct AWB Stamp &bull; Ready to Ship
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                            {/* Shipping Partner */}
                            <div>
                              <label className="block text-[9.5px] uppercase font-bold text-neutral-500 mb-0.5">Shipping Partner *</label>
                              <select
                                value={form.partner}
                                onChange={e => setShippingForms(prev => ({
                                  ...prev,
                                  [item.orderId]: { ...form, partner: e.target.value }
                                }))}
                                className="w-full text-xs px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 font-semibold focus:border-emerald-600 outline-none"
                              >
                                {SHIPPING_PARTNERS.map(p => (
                                  <option key={p} value={p}>{p}</option>
                                ))}
                              </select>
                            </div>

                            {/* Outgoing AWB Tracking Number */}
                            <div>
                              <label className="block text-[9.5px] uppercase font-bold text-neutral-500 mb-0.5">Outgoing AWB Tracking *</label>
                              <input
                                type="text"
                                placeholder="Enter or paste AWB..."
                                value={form.awb}
                                onChange={e => setShippingForms(prev => ({
                                  ...prev,
                                  [item.orderId]: { ...form, awb: e.target.value }
                                }))}
                                className="w-full text-xs font-mono font-bold px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:border-emerald-600 outline-none"
                              />
                            </div>

                            {/* Shipping Type */}
                            <div>
                              <label className="block text-[9.5px] uppercase font-bold text-neutral-500 mb-0.5">Shipping Type</label>
                              <select
                                value={form.type}
                                onChange={e => setShippingForms(prev => ({
                                  ...prev,
                                  [item.orderId]: { ...form, type: e.target.value as any }
                                }))}
                                className="w-full text-xs px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 font-medium focus:border-emerald-600 outline-none"
                              >
                                <option value="Domestic">Domestic</option>
                                <option value="International">International</option>
                              </select>
                            </div>

                            {/* Trial Pair & Submit Button */}
                            <div className="flex items-end gap-1.5">
                              <div className="flex-1">
                                <label className="block text-[9.5px] uppercase font-bold text-neutral-500 mb-0.5">Trial Pair?</label>
                                <select
                                  value={form.trial}
                                  onChange={e => setShippingForms(prev => ({
                                    ...prev,
                                    [item.orderId]: { ...form, trial: e.target.value as any }
                                  }))}
                                  className="w-full text-xs px-2 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 font-medium focus:border-emerald-600 outline-none"
                                >
                                  <option value="N">No (Final Pair)</option>
                                  <option value="Y">Yes (Trial Pair)</option>
                                </select>
                              </div>

                              <button
                                type="button"
                                disabled={form.isSubmitting}
                                onClick={() => handleQuickDispatchOrder(item)}
                                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs transition cursor-pointer shadow-xs shrink-0 flex items-center gap-1 disabled:opacity-50"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>{form.isSubmitting ? 'Shipping...' : 'Ship'}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: SHIPPED ORDERS (Dispatches Daily Log)                               */}
          {/* ========================================================================= */}
          {activeTab === 'shipped' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                <div className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-neutral-600" />
                  <span>Shipped Dispatches ({filteredDispatches.length} orders)</span>
                </div>
                <span className="text-[11px] text-neutral-500 font-mono">
                  1-Click AWB Tracking &amp; Customer Updates
                </span>
              </div>

              {/* AWB Status Filter Chips */}
              <div className="flex items-center gap-2 flex-wrap px-1">
                <button
                  type="button"
                  onClick={() => setShippedAwbFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    shippedAwbFilter === 'all'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>All Shipped ({dispatches.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShippedAwbFilter('missing_awb')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    shippedAwbFilter === 'missing_awb'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : missingAwbCount > 0
                      ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                      : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
                  }`}
                >
                  <AlertTriangle className={`w-3.5 h-3.5 ${missingAwbCount > 0 && shippedAwbFilter !== 'missing_awb' ? 'text-amber-600 animate-pulse' : ''}`} />
                  <span>Missing AWB ({missingAwbCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShippedAwbFilter('with_awb')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    shippedAwbFilter === 'with_awb'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Tracking Active ({withAwbCount})</span>
                </button>
              </div>

              {/* Missing AWB Alert Callout if any */}
              {missingAwbCount > 0 && shippedAwbFilter === 'all' && (
                <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-300/80 flex items-center justify-between gap-3 text-xs text-amber-950 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      <strong className="font-bold">{missingAwbCount} shipped order(s)</strong> have no AWB tracking number assigned. You can click <strong>&ldquo;Add AWB&rdquo;</strong> on any card to update the courier and tracking code anytime.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShippedAwbFilter('missing_awb')}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition cursor-pointer shadow-2xs"
                  >
                    View Needs AWB
                  </button>
                </div>
              )}

              {filteredDispatches.length === 0 ? (
                <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center space-y-2.5 shadow-2xs">
                  <Truck className="w-8 h-8 text-neutral-400 mx-auto" />
                  <h4 className="text-xs font-bold text-neutral-900">No Dispatched Orders Found</h4>
                  <p className="text-[11px] text-neutral-500">
                    No shipped orders match the current search query or store filter.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredDispatches.map(item => {
                    const cleanNum = String(item.orderNumber || '').replace(/^#/, '').trim();
                    const partner = item.shippingPartner || item.courier || 'Bluedart';
                    const awb = item.outgoingTrackingAwb || item.trackingDetails || '';
                    const trackUrl = getTrackingUrl(partner, awb);
                    const matchingShopify = shopifyOrders.find(s => orderIdsMatch(s.orderNumber, item.orderNumber));
                    const isLlc = item.storeTab === 'LLC' || matchingShopify?.storeAccount === 'LLC' || cleanNum.toUpperCase().startsWith('US') || item.shippingType === 'International';
                    const shopifyAdminUrl = getShopifyAdminOrderUrl(item.orderNumber || cleanNum, matchingShopify?.id, isLlc ? 'LLC' : 'Global');

                    const isExpanded = !!expandedOrders[item.orderNumber || cleanNum];
                    const isEditing = Boolean(
                      editingDispatchId && (
                        editingDispatchId === item.id ||
                        editingDispatchId === item.orderNumber ||
                        editingDispatchId === cleanNum
                      )
                    );

                    const resolvedImgUrl = resolveProductImage(
                      item.orderNumber,
                      matchingShopify?.lineItems || item.notes,
                      shopifyOrders,
                      matchingShopify?.imageUrl
                    );

                    return (
                      <div
                        key={item.id || item.orderNumber}
                        className={`relative bg-white rounded-2xl p-3.5 sm:p-4 border shadow-2xs space-y-3 transition hover:border-neutral-300 ${
                          isEditing
                            ? 'border-blue-400 ring-2 ring-blue-500/20'
                            : !awb
                            ? 'border-amber-300/80 hover:border-amber-400 bg-amber-50/10'
                            : 'border-neutral-200/90'
                        }`}
                      >
                        {/* Shipped Card Header */}
                        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-neutral-100 flex-wrap sm:flex-nowrap">
                          {/* Top Left: Customer icon + Customer Name */}
                          <div className="flex items-center gap-1.5 min-w-0">
                            <User className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                            <span className="font-semibold text-xs text-neutral-900 truncate" title={item.customerName || resolveCustomerName(item.orderNumber)}>
                              {item.customerName || resolveCustomerName(item.orderNumber)}
                            </span>
                          </div>

                          {/* Top Right: Order dropdown, Store, Shipped Badge, Shopify Link */}
                          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto flex-wrap justify-end">
                            <button
                              type="button"
                              onClick={() => toggleExpand(item.orderNumber || cleanNum)}
                              className="font-mono font-bold text-xs text-neutral-900 bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 rounded-lg border border-neutral-200 flex items-center gap-1 cursor-pointer transition shrink-0"
                              title="Tap to toggle full order details and Shopify notes"
                            >
                              <span>#{cleanNum}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3 text-neutral-500" /> : <ChevronDown className="w-3 h-3 text-neutral-500" />}
                            </button>

                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-bold ${
                              isLlc ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-blue-50 text-blue-900 border border-blue-200'
                            }`}>
                              {isLlc ? 'LLC (USA)' : 'Global'}
                            </span>

                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              <Truck className="w-2.5 h-2.5 text-emerald-600 stroke-[2.5]" />
                              <span>Shipped</span>
                            </span>

                            <a
                              href={shopifyAdminUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 transition shrink-0"
                              title={`Open order #${cleanNum} directly on Shopify Admin`}
                            >
                              <ShoppingBag className="w-3 h-3 text-emerald-600" />
                              <span>Shopify</span>
                              <ExternalLink className="w-2.5 h-2.5 text-emerald-600" />
                            </a>

                            {/* Blinking beige / amber badge on extreme right corner when missing AWB */}
                            {!awb && !isEditing && (
                              <span
                                className="absolute -top-2.5 -right-2 text-[10px] sm:text-[10.5px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border-2 border-white shadow-md flex items-center justify-center gap-1 shrink-0 z-10 animate-pulse"
                                title="Missing Outgoing AWB Tracking Number"
                              >
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-600 stroke-[2.5]" />
                                <span>No AWB</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Product / Model & Dates Row */}
                        <div className="flex items-start gap-3 bg-neutral-50/90 p-2.5 sm:p-3 rounded-2xl border border-neutral-200/70">
                          <ProductThumbnail
                            src={resolvedImgUrl}
                            alt={matchingShopify?.lineItems || item.notes || 'Footwear Model'}
                            size="md"
                            className="rounded-xl shadow-2xs border border-neutral-200 bg-white shrink-0"
                          />
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="text-xs font-bold text-neutral-900 leading-snug">
                              {matchingShopify?.lineItems || (item.notes && !item.notes.startsWith('Shipped via') ? item.notes : 'BLKBRD Goodyear Welted Footwear')}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-neutral-600 flex-wrap">
                              {item.date && (
                                <span className="flex items-center gap-1 font-mono">
                                  <Calendar className="w-3 h-3 text-neutral-400" />
                                  <span>Dispatched: {item.date}</span>
                                </span>
                              )}
                              {matchingShopify?.createdAt && (
                                <span className="flex items-center gap-1 font-mono">
                                  <Clock className="w-3 h-3 text-neutral-400" />
                                  <span>Ordered: {matchingShopify.createdAt.split('T')[0]}</span>
                                </span>
                              )}
                              {matchingShopify?.totalPrice && (
                                <span className="font-mono font-bold text-neutral-800 text-[10.5px]">
                                  {matchingShopify.totalPrice}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Dropdown Expanded Details (Customer Address, Contact, Shopify Notes, Craftsman Notes) */}
                        {isExpanded && (
                          <div className="p-3.5 sm:p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80 space-y-3 text-[11px] animate-in fade-in shadow-2xs">
                            {/* Sleek Inline Ordered & Dispatched Dates Bar */}
                            <div className="flex items-center flex-wrap gap-x-3.5 gap-y-1 bg-white px-3 py-1.5 rounded-xl border border-neutral-200/70 text-xs">
                              <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-[10px] uppercase font-bold text-neutral-400">Dispatched Date:</span>
                                <span className="font-mono font-semibold text-neutral-900">{item.date || '—'}</span>
                              </div>
                              {matchingShopify?.createdAt && (
                                <>
                                  <span className="text-neutral-300 hidden xs:inline">•</span>
                                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                                    <span className="text-[10px] uppercase font-bold text-neutral-400">Ordered Date:</span>
                                    <span className="font-mono font-semibold text-neutral-900">{matchingShopify.createdAt.split('T')[0]}</span>
                                  </div>
                                </>
                              )}
                              {matchingShopify?.totalPrice && (
                                <>
                                  <span className="text-neutral-300 hidden xs:inline">•</span>
                                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                                    <span className="text-[10px] uppercase font-bold text-neutral-400">Total:</span>
                                    <span className="font-mono font-semibold text-neutral-900">{matchingShopify.totalPrice}</span>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Customer Contact & Address Details */}
                            {(matchingShopify?.phone || matchingShopify?.customerEmail || matchingShopify?.address || item.customerName) && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-neutral-700 bg-white/70 p-2.5 rounded-xl border border-neutral-200/60">
                                {matchingShopify?.phone && (
                                  <div className="flex items-center gap-1.5">
                                    <Phone className="w-3 h-3 text-neutral-400" />
                                    <span className="text-neutral-400 text-[9px] uppercase font-bold">Phone:</span>
                                    <span className="font-mono text-neutral-900 font-medium">{matchingShopify.phone}</span>
                                  </div>
                                )}
                                {matchingShopify?.customerEmail && (
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <Mail className="w-3 h-3 text-neutral-400" />
                                    <span className="text-neutral-400 text-[9px] uppercase font-bold">Email:</span>
                                    <span className="font-mono text-neutral-900 truncate">{matchingShopify.customerEmail}</span>
                                  </div>
                                )}
                                {matchingShopify?.address && (
                                  <div className="sm:col-span-2 flex items-start gap-1.5">
                                    <MapPin className="w-3 h-3 text-neutral-400 shrink-0 mt-0.5" />
                                    <span className="text-neutral-400 text-[9px] uppercase font-bold shrink-0 mt-0.5">Address:</span>
                                    <span className="text-neutral-800 text-[10.5px] leading-tight">{matchingShopify.address}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* SHOPIFY NOTES & CRAFTSMAN NOTES SECTION */}
                            {(() => {
                              const craftsmanNote = matchingShopify?.craftsmanNotes || '';
                              const shopifyNote = matchingShopify?.notes || '';
                              const dispatchNote = item.notes && !item.notes.startsWith('Shipped via') ? item.notes : '';

                              return (
                                <div className="space-y-2.5 pt-1 border-t border-neutral-200/70">
                                  {/* Craftsman Notes Banner */}
                                  {craftsmanNote && (
                                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 shadow-2xs space-y-1">
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                                        <span className="uppercase font-mono tracking-wider">Craftsman Notes (Artisan Instructions)</span>
                                      </div>
                                      <div className="text-xs font-medium text-amber-950 bg-white/80 p-2 rounded-lg border border-amber-200">
                                        {craftsmanNote}
                                      </div>
                                    </div>
                                  )}

                                  {/* Shopify Admin Notes */}
                                  {shopifyNote && (
                                    <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/90 text-amber-950 space-y-1">
                                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase font-mono tracking-wider text-amber-900">
                                        <MessageSquare className="w-3 h-3 text-amber-600" />
                                        <span>Shopify Order Notes:</span>
                                      </div>
                                      <div className="text-[11px] font-mono text-neutral-800 whitespace-pre-line bg-white/90 p-2 rounded-lg border border-amber-200/70">
                                        {shopifyNote}
                                      </div>
                                    </div>
                                  )}

                                  {/* Additional Dispatch / Logistics Remarks if present */}
                                  {dispatchNote && dispatchNote !== shopifyNote && (
                                    <div className="p-2 rounded-lg bg-white border border-neutral-200 text-xs text-neutral-800">
                                      <span className="font-bold text-neutral-700">Dispatch Logistics Note:</span> {dispatchNote}
                                    </div>
                                  )}

                                  {/* Detailed Line Items if present */}
                                  {matchingShopify?.lineItemDetails && matchingShopify.lineItemDetails.length > 0 && (
                                    <div className="space-y-1.5 pt-1">
                                      <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider block">
                                        Ordered Pairs ({matchingShopify.lineItemDetails.length})
                                      </span>
                                      {matchingShopify.lineItemDetails.map((li, lIdx) => (
                                        <div key={li.id || lIdx} className="p-2.5 rounded-xl bg-white border border-neutral-200 flex items-center justify-between text-xs">
                                          <div className="font-semibold text-neutral-900">{li.title}</div>
                                          {li.variantTitle && (
                                            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-neutral-100 rounded text-neutral-700 border border-neutral-200">
                                              {li.variantTitle}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* ===================================================== */}
                        {/* EDIT MODE: Direct in-card editor for Shipped details  */}
                        {/* ===================================================== */}
                        {isEditing ? (
                          <div className="p-3 sm:p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3 animate-in fade-in">
                            <div className="flex items-center justify-between pb-2 border-b border-blue-200/60">
                              <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                                <Edit2 className="w-3.5 h-3.5 text-blue-700" />
                                <span>Update Shipping &amp; AWB Tracking &bull; Order #{cleanNum}</span>
                              </span>
                              <button
                                type="button"
                                onClick={handleCancelEditDispatch}
                                className="text-neutral-400 hover:text-neutral-700 p-0.5 rounded cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                              {/* Shipping Partner */}
                              <div>
                                <label className="block text-[9.5px] uppercase font-bold text-neutral-500 mb-0.5">Shipping Partner *</label>
                                <select
                                  value={editDispatchForm.shippingPartner || partner}
                                  onChange={e => setEditDispatchForm({ ...editDispatchForm, shippingPartner: e.target.value })}
                                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 font-semibold focus:border-blue-600 outline-none"
                                >
                                  {SHIPPING_PARTNERS.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Outgoing AWB Tracking # */}
                              <div>
                                <label className="block text-[9.5px] uppercase font-bold text-neutral-500 mb-0.5">Outgoing AWB Tracking # *</label>
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder="Enter / paste AWB..."
                                  value={editDispatchForm.outgoingTrackingAwb ?? awb}
                                  onChange={e => setEditDispatchForm({ ...editDispatchForm, outgoingTrackingAwb: e.target.value })}
                                  className="w-full text-xs font-mono font-bold px-2.5 py-1.5 bg-white border border-neutral-300 focus:border-blue-600 rounded-lg text-neutral-900 outline-none placeholder:text-neutral-400"
                                />
                              </div>

                              {/* Shipping Type */}
                              <div>
                                <label className="block text-[9.5px] uppercase font-bold text-neutral-500 mb-0.5">Shipping Type</label>
                                <select
                                  value={editDispatchForm.shippingType || item.shippingType || 'Domestic'}
                                  onChange={e => setEditDispatchForm({ ...editDispatchForm, shippingType: e.target.value as any })}
                                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 font-medium focus:border-blue-600 outline-none"
                                >
                                  <option value="Domestic">Domestic</option>
                                  <option value="International">International</option>
                                </select>
                              </div>

                              {/* Dispatch Date */}
                              <div>
                                <label className="block text-[9.5px] uppercase font-bold text-neutral-500 mb-0.5">Dispatch Date</label>
                                <input
                                  type="date"
                                  value={editDispatchForm.date || item.date || new Date().toISOString().split('T')[0]}
                                  onChange={e => setEditDispatchForm({ ...editDispatchForm, date: e.target.value })}
                                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 font-medium focus:border-blue-600 outline-none"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs pt-1">
                              <div>
                                <label className="block text-[9.5px] uppercase font-bold text-neutral-500 mb-0.5">Trial Pair Status</label>
                                <select
                                  value={editDispatchForm.trialPair || item.trialPair || 'N'}
                                  onChange={e => setEditDispatchForm({ ...editDispatchForm, trialPair: e.target.value as any })}
                                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 font-medium focus:border-blue-600 outline-none"
                                >
                                  <option value="N">No (Final Pair)</option>
                                  <option value="Y">Yes (Trial Sample)</option>
                                </select>
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-[9.5px] uppercase font-bold text-neutral-500 mb-0.5">Shipping Notes / Remarks</label>
                                <input
                                  type="text"
                                  placeholder="e.g. Dispatched by Bluedart Express, customer notified on WhatsApp..."
                                  value={editDispatchForm.notes ?? (item.notes || '')}
                                  onChange={e => setEditDispatchForm({ ...editDispatchForm, notes: e.target.value })}
                                  className="w-full text-xs px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 outline-none focus:border-blue-600 placeholder:text-neutral-400"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-blue-200/60">
                              <button
                                type="button"
                                onClick={handleCancelEditDispatch}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={isSavingDispatch}
                                onClick={() => handleSaveDispatchEdit(item)}
                                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs transition cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                              >
                                <Save className="w-3.5 h-3.5" />
                                <span>{isSavingDispatch ? 'Saving...' : 'Save Changes'}</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ===================================================== */
                          /* NORMAL VIEW: Display details with Quick-Edit action    */
                          /* ===================================================== */
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs text-neutral-700 bg-neutral-50/80 p-2.5 rounded-xl border border-neutral-200/60">
                            <div>
                              <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Courier Partner</span>
                              <span className="font-semibold text-neutral-900">{partner}</span>
                            </div>

                            <div>
                              <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">AWB Tracking #</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {awb ? (
                                  <>
                                    <span className="font-mono font-bold text-neutral-900">{awb}</span>
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(awb, awb)}
                                      className="text-neutral-400 hover:text-neutral-900 cursor-pointer p-0.5"
                                      title="Copy AWB"
                                    >
                                      {copiedTracking === awb ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                    {trackUrl && (
                                      <a
                                        href={trackUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-emerald-700 hover:text-emerald-950 p-0.5"
                                        title="Open courier tracking portal"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditDispatch(item)}
                                    className="inline-flex items-center gap-1 font-mono text-[10.5px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200 transition cursor-pointer"
                                    title="Click to assign AWB"
                                  >
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                    <span>No AWB (Click to Add)</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            <div>
                              <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Fulfillment Type</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[11px] text-neutral-800 font-medium">
                                  {item.shippingType || 'Domestic'}
                                </span>
                                {item.trialPair === 'Y' && (
                                  <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200 font-bold">
                                    Trial Pair
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-start sm:justify-end gap-1.5 flex-wrap">
                              {!awb ? (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditDispatch(item)}
                                  className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-2xs transition cursor-pointer"
                                  title="Add AWB tracking number"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add AWB</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditDispatch(item)}
                                  className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-200 font-semibold shadow-2xs transition cursor-pointer"
                                  title="Edit AWB and shipping details"
                                >
                                  <Edit2 className="w-3 h-3 text-neutral-500" />
                                  <span>Edit AWB</span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: RETURNS (Track and log returns & manage returned inventory)       */}
          {/* ========================================================================= */}
          {activeTab === 'returns' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between px-1">
                <div className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <RotateCcw className="w-4 h-4 text-amber-600" />
                  <span>Customer Returns &amp; Exchanges ({filteredReturns.length} records)</span>
                </div>
                <span className="text-[11px] text-neutral-500 font-mono">
                  Track reverse logistics &amp; returned pairs
                </span>
              </div>

              {filteredReturns.length === 0 ? (
                <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center space-y-2.5 shadow-2xs">
                  <RotateCcw className="w-8 h-8 text-neutral-400 mx-auto" />
                  <h4 className="text-xs font-bold text-neutral-900">No Returns Recorded</h4>
                  <p className="text-[11px] text-neutral-500 max-w-sm mx-auto">
                    Click "Log New Return" to record incoming returns, track return AWBs, and manage returned pairs in inventory.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredReturns.map(item => {
                    const cleanNum = String(item.orderNumber || '').replace(/^#/, '');
                    const isLlc = item.storeTab === 'LLC';
                    const awb = item.incomingTrackingAwb || item.incomingAwb || '';
                    const trackUrl = getTrackingUrl(item.courier, awb);

                    return (
                      <div
                        key={item.id || cleanNum}
                        className="bg-white rounded-2xl p-3.5 sm:p-4 border border-neutral-200/90 shadow-2xs space-y-2.5 hover:border-neutral-300 transition"
                      >
                        {/* Return Card Header */}
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-neutral-100 flex-wrap sm:flex-nowrap">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <User className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                            <span className="font-semibold text-xs text-neutral-900 truncate">
                              {item.customerName || resolveCustomerName(cleanNum)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto flex-wrap justify-end">
                            <span className="font-mono font-bold text-xs text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded-lg border border-neutral-200">
                              #{cleanNum}
                            </span>

                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-bold ${
                              isLlc ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-blue-50 text-blue-900 border border-blue-200'
                            }`}>
                              {isLlc ? 'LLC (USA)' : 'Global'}
                            </span>

                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200">
                              {item.status || 'Received'}
                            </span>
                          </div>
                        </div>

                        {/* Return Info Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs bg-neutral-50/80 p-2.5 rounded-xl border border-neutral-200/60">
                          <div>
                            <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Return Reason</span>
                            <span className="font-semibold text-neutral-900">{item.reason || 'Size Exchange'}</span>
                          </div>

                          <div>
                            <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Inbound AWB</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono font-bold text-neutral-900">{awb || '—'}</span>
                              {awb && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(awb, `ret-${cleanNum}`)}
                                  className="text-neutral-400 hover:text-neutral-900 cursor-pointer p-0.5"
                                  title="Copy Return AWB"
                                >
                                  {copiedTracking === `ret-${cleanNum}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                </button>
                              )}
                              {trackUrl && (
                                <a
                                  href={trackUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-amber-700 hover:text-amber-950 p-0.5"
                                  title="Track return courier"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>

                          <div>
                            <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Courier</span>
                            <span className="font-semibold text-neutral-800">{item.courier || 'Bluedart'}</span>
                          </div>

                          <div>
                            <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Return Date</span>
                            <span className="font-mono text-neutral-700">{item.returnDate || item.date || '—'}</span>
                          </div>
                        </div>

                        {item.notes && (
                          <div className="text-[11px] text-neutral-600 bg-white p-2 rounded-lg border border-neutral-200/70">
                            <span className="font-bold text-neutral-700">Inspection / Inventory Notes:</span> {item.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: TRIAL PAIRS (Track trial pairs in transit & inventory)             */}
          {/* ========================================================================= */}
          {activeTab === 'trials' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between px-1">
                <div className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <Footprints className="w-4 h-4 text-purple-600" />
                  <span>Trial Pairs Inventory &amp; Circulation ({filteredTrials.length} active)</span>
                </div>
                <span className="text-[11px] text-neutral-500 font-mono">
                  Track sizing samples with clients &amp; stock pairs
                </span>
              </div>

              {filteredTrials.length === 0 ? (
                <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center space-y-2.5 shadow-2xs">
                  <Footprints className="w-8 h-8 text-neutral-400 mx-auto" />
                  <h4 className="text-xs font-bold text-neutral-900">No Active Trial Pairs</h4>
                  <p className="text-[11px] text-neutral-500 max-w-sm mx-auto">
                    Click "Add Trial Pair" to register fit samples dispatched to customers or stored in inventory.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredTrials.map(item => {
                    const cleanId = String(item.orderId || '').replace(/^#/, '');
                    const isWithCust = (item.status || '').toLowerCase().includes('customer');

                    return (
                      <div
                        key={item.id || cleanId}
                        className="bg-white rounded-2xl p-3.5 sm:p-4 border border-neutral-200/90 shadow-2xs space-y-2.5 hover:border-neutral-300 transition"
                      >
                        {/* Trial Card Header */}
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-neutral-100 flex-wrap sm:flex-nowrap">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <User className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                            <span className="font-semibold text-xs text-neutral-900 truncate">
                              {item.customerName || resolveCustomerName(cleanId)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto flex-wrap justify-end">
                            <span className="font-mono font-bold text-xs text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded-lg border border-neutral-200">
                              #{cleanId}
                            </span>

                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                              isWithCust
                                ? 'bg-purple-50 text-purple-900 border border-purple-200'
                                : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                            }`}>
                              {item.status || 'Active Trial'}
                            </span>
                          </div>
                        </div>

                        {/* Trial Info Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs bg-neutral-50/80 p-2.5 rounded-xl border border-neutral-200/60">
                          <div>
                            <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Trial Footwear Model</span>
                            <span className="font-semibold text-neutral-900">{item.shoeModel || 'Trial Pair'}</span>
                          </div>

                          <div>
                            <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Outbound AWB / Courier</span>
                            <span className="font-mono font-bold text-neutral-900">{item.outboundAwb || item.courier || '—'}</span>
                          </div>

                          <div className="flex items-center justify-start sm:justify-end gap-2">
                            {isWithCust ? (
                              <button
                                type="button"
                                onClick={() => onUpdateTrial({ ...item, status: 'Returned to Inventory' })}
                                className="px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-[11px] shadow-2xs transition cursor-pointer"
                              >
                                Mark Returned to Stock
                              </button>
                            ) : (
                              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                                In Warehouse Stock
                              </span>
                            )}
                          </div>
                        </div>

                        {item.notes && (
                          <div className="text-[11px] text-neutral-500 italic px-1">
                            Fit Feedback / Notes: {item.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 5: INVENTORY (Warehouse stock, returned pairs, and trial inventory)   */}
          {/* ========================================================================= */}
          {activeTab === 'inventory' && (
            <div className="space-y-4">
              {/* Category Filter Pills & Metrics Strip */}
              <div className="bg-white rounded-2xl border border-neutral-200/90 p-3 sm:p-4 shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-neutral-900 flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-blue-600" />
                      <span>Inventory Pipeline &amp; Stock Management</span>
                    </h3>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Track warehouse stock pairs, returned pairs in QA, and client trial samples in real-time.
                    </p>
                  </div>

                  {/* Sub-category Filter Tabs */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    <button
                      type="button"
                      onClick={() => setInventoryCategory('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                        inventoryCategory === 'all'
                          ? 'bg-neutral-900 text-white shadow-2xs'
                          : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                      }`}
                    >
                      All Tracked ({totalStockCount.totalTracked})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInventoryCategory('stock')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                        inventoryCategory === 'stock'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200/70'
                      }`}
                    >
                      Stock Pairs ({bostonStock.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInventoryCategory('returns')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                        inventoryCategory === 'returns'
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/70'
                      }`}
                    >
                      Returned Pairs ({totalStockCount.returnedPairs})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInventoryCategory('trials')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                        inventoryCategory === 'trials'
                          ? 'bg-purple-600 text-white shadow-2xs'
                          : 'bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200/70'
                      }`}
                    >
                      Trial Pairs ({trialPairs.length})
                    </button>
                  </div>
                </div>

                {/* 4-KPI Overview Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-neutral-100">
                  <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200/60">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block">Total Pipeline</span>
                    <span className="font-mono text-base font-black text-neutral-900">{totalStockCount.totalTracked} Pairs</span>
                  </div>
                  <div className="bg-blue-50/60 p-2.5 rounded-xl border border-blue-100">
                    <span className="text-[10px] uppercase font-bold text-blue-600 block">Warehouse Stock</span>
                    <span className="font-mono text-base font-black text-blue-900">{totalStockCount.warehouseStock} Ready</span>
                  </div>
                  <div className="bg-amber-50/60 p-2.5 rounded-xl border border-amber-100">
                    <span className="text-[10px] uppercase font-bold text-amber-600 block">Returns in QA</span>
                    <span className="font-mono text-base font-black text-amber-900">{totalStockCount.returnedPairs} Units</span>
                  </div>
                  <div className="bg-purple-50/60 p-2.5 rounded-xl border border-purple-100">
                    <span className="text-[10px] uppercase font-bold text-purple-600 block">Trials with Clients</span>
                    <span className="font-mono text-base font-black text-purple-900">{totalStockCount.trialWithCust} Pairs</span>
                  </div>
                </div>
              </div>

              {/* Inventory Cards List */}
              <div className="space-y-3">
                {/* 1. Warehouse Stock Pairs */}
                {(inventoryCategory === 'all' || inventoryCategory === 'stock') && (
                  <div className="space-y-2.5">
                    {inventoryCategory === 'all' && (
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                          <span>Warehouse Stock Pairs ({filteredBostonStock.length})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsAddStockOpen(true)}
                          className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                        >
                          + Add Stock
                        </button>
                      </div>
                    )}

                    {filteredBostonStock.length === 0 ? (
                      <div className="bg-white rounded-2xl border border-neutral-200/90 p-8 text-center space-y-2 shadow-2xs">
                        <Boxes className="w-7 h-7 text-neutral-400 mx-auto" />
                        <h4 className="text-xs font-bold text-neutral-900">No Warehouse Stock Pairs Found</h4>
                        <p className="text-[11px] text-neutral-500">
                          Click "Add Stock Pair" above to record newly manufactured stock or restocked pairs.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {filteredBostonStock.map((item, idx) => {
                          const isAvailable = (item.status || '').toLowerCase().includes('available');
                          const isReserved = (item.status || '').toLowerCase().includes('reserved');

                          return (
                            <div
                              key={item.id || idx}
                              className="bg-white rounded-2xl p-3.5 sm:p-4 border border-neutral-200/90 shadow-2xs space-y-3 hover:border-neutral-300 transition"
                            >
                              {/* Stock Card Top Header */}
                              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-neutral-100 flex-wrap sm:flex-nowrap">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 font-bold text-xs">
                                    <Boxes className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-bold text-xs text-neutral-900 truncate">
                                      {item.shoeModel}
                                    </div>
                                    <div className="text-[10.5px] text-neutral-500 flex items-center gap-1.5 flex-wrap">
                                      <span className="font-semibold text-neutral-700">{item.size}</span>
                                      <span>•</span>
                                      <span>{item.widthOrLast || 'Standard'}</span>
                                      {item.colorLeather && (
                                        <>
                                          <span>•</span>
                                          <span className="text-neutral-600">{item.colorLeather}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0 ml-auto flex-wrap justify-end">
                                  {/* Storage Location Badge */}
                                  <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-bold text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded-lg border border-neutral-200">
                                    <MapPin className="w-3 h-3 text-neutral-500" />
                                    <span>{item.storageLocation || 'Warehouse Hub'}</span>
                                  </span>

                                  {/* Status Pill */}
                                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                                    isAvailable
                                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                                      : isReserved
                                      ? 'bg-amber-50 text-amber-900 border border-amber-200'
                                      : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                                  }`}>
                                    {item.status || 'Available'}
                                  </span>
                                </div>
                              </div>

                              {/* Details Grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-neutral-50/80 p-2.5 rounded-xl border border-neutral-200/60">
                                <div>
                                  <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Condition</span>
                                  <span className="font-semibold text-neutral-900">{item.condition || 'Pristine'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Storage Rack</span>
                                  <span className="font-mono font-bold text-neutral-900">{item.storageLocation || 'Shelf A'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Linked Order / Client</span>
                                  <span className="font-mono text-neutral-700">
                                    {item.originalOrderId ? `#${item.originalOrderId}` : '—'} {item.clientName ? `(${item.clientName})` : ''}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Date Received</span>
                                  <span className="text-neutral-700 font-mono">{item.dateReceived || 'In Stock'}</span>
                                </div>
                              </div>

                              {/* Footer Actions & Remarks */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                                <div className="text-[11px] text-neutral-500 italic">
                                  {item.notes ? `Remarks: ${item.notes}` : 'Safe for fast dispatch or customer exchange.'}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                                  {onUpdateBostonStock && (
                                    <>
                                      {item.status !== 'Available' && (
                                        <button
                                          type="button"
                                          onClick={() => onUpdateBostonStock({ ...item, status: 'Available' })}
                                          className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10.5px] font-semibold transition cursor-pointer"
                                        >
                                          Mark Available
                                        </button>
                                      )}
                                      {item.status !== 'Reserved for Exchange' && (
                                        <button
                                          type="button"
                                          onClick={() => onUpdateBostonStock({ ...item, status: 'Reserved for Exchange' })}
                                          className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10.5px] font-semibold transition cursor-pointer"
                                        >
                                          Mark Reserved
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Returned Pairs in Inventory */}
                {(inventoryCategory === 'all' || inventoryCategory === 'returns') && (
                  <div className="space-y-2.5 pt-2">
                    {inventoryCategory === 'all' && (
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                          <span>Returned Pairs ({filteredReturns.length})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsAddReturnOpen(true)}
                          className="text-[11px] font-semibold text-amber-600 hover:text-amber-800 cursor-pointer"
                        >
                          + Log Return
                        </button>
                      </div>
                    )}

                    {filteredReturns.length === 0 ? (
                      inventoryCategory === 'returns' && (
                        <div className="bg-white rounded-2xl border border-neutral-200/90 p-8 text-center space-y-2 shadow-2xs">
                          <RotateCcw className="w-7 h-7 text-neutral-400 mx-auto" />
                          <h4 className="text-xs font-bold text-neutral-900">No Returned Pairs in Inventory</h4>
                          <p className="text-[11px] text-neutral-500">
                            Customer returns and size exchanges will appear here once logged.
                          </p>
                        </div>
                      )
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {filteredReturns.slice(0, inventoryCategory === 'all' ? 5 : undefined).map((item, idx) => {
                          const isRestocked = (item.status || '').toLowerCase().includes('restock');

                          return (
                            <div
                              key={item.id || idx}
                              className="bg-white rounded-2xl p-3.5 sm:p-4 border border-neutral-200/90 shadow-2xs space-y-2.5 hover:border-neutral-300 transition"
                            >
                              <div className="flex items-center justify-between gap-2 pb-2 border-b border-neutral-100 flex-wrap sm:flex-nowrap">
                                <div className="flex items-center gap-2 min-w-0">
                                  <RotateCcw className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  <span className="font-semibold text-xs text-neutral-900 truncate">
                                    {item.customerName || 'Customer Return'}
                                  </span>
                                  <span className="font-mono font-bold text-xs text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded-lg border border-neutral-200">
                                    #{item.orderNumber}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                                    isRestocked
                                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                                      : 'bg-amber-50 text-amber-900 border border-amber-200'
                                  }`}>
                                    {item.status || 'Received'}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs bg-neutral-50/80 p-2.5 rounded-xl border border-neutral-200/60">
                                <div>
                                  <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Reason</span>
                                  <span className="font-semibold text-neutral-900">{item.reason || 'Size Exchange'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Incoming Courier &amp; AWB</span>
                                  <span className="font-mono text-neutral-800">{item.courier || 'Courier'}: {item.incomingTrackingAwb || 'No AWB'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Inspection Notes</span>
                                  <span className="text-neutral-700 italic truncate block">{item.notes || 'Passed Inspection'}</span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-2 pt-1">
                                <div className="text-[10.5px] text-neutral-500">
                                  Logged: <span className="font-mono">{item.return_date || 'Recent'}</span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setNewStockForm({
                                      shoeModel: `Returned Pair (${item.reason || 'Exchange'})`,
                                      size: 'UK 8',
                                      widthOrLast: 'Standard',
                                      colorLeather: 'Standard Leather',
                                      condition: 'Minor Creasing / Try-on',
                                      storageLocation: 'Warehouse Hub - Rack Returns',
                                      status: 'Available',
                                      notes: `Restocked from return #${item.orderNumber} (${item.customerName || ''})`,
                                      originalOrderId: item.orderNumber,
                                      clientName: item.customerName || ''
                                    });
                                    setIsAddStockOpen(true);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-[11px] font-semibold shadow-2xs transition cursor-pointer"
                                >
                                  Restock to Warehouse Inventory
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Trial Pairs in Inventory */}
                {(inventoryCategory === 'all' || inventoryCategory === 'trials') && (
                  <div className="space-y-2.5 pt-2">
                    {inventoryCategory === 'all' && (
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                          <span>Trial Pairs ({filteredTrials.length})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsAddTrialOpen(true)}
                          className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 cursor-pointer"
                        >
                          + Add Trial
                        </button>
                      </div>
                    )}

                    {filteredTrials.length === 0 ? (
                      inventoryCategory === 'trials' && (
                        <div className="bg-white rounded-2xl border border-neutral-200/90 p-8 text-center space-y-2 shadow-2xs">
                          <Footprints className="w-7 h-7 text-neutral-400 mx-auto" />
                          <h4 className="text-xs font-bold text-neutral-900">No Trial Pairs in Inventory</h4>
                          <p className="text-[11px] text-neutral-500">
                            Trial fit pairs will appear here once registered.
                          </p>
                        </div>
                      )
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {filteredTrials.slice(0, inventoryCategory === 'all' ? 5 : undefined).map(item => {
                          const cleanId = String(item.orderId || '').replace(/^#/, '');
                          const isWithCust = (item.status || '').toLowerCase().includes('customer');

                          return (
                            <div
                              key={item.id || cleanId}
                              className="bg-white rounded-2xl p-3.5 sm:p-4 border border-neutral-200/90 shadow-2xs space-y-2.5 hover:border-neutral-300 transition"
                            >
                              <div className="flex items-center justify-between gap-2 pb-2 border-b border-neutral-100 flex-wrap sm:flex-nowrap">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Footprints className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                  <span className="font-semibold text-xs text-neutral-900 truncate">
                                    {item.customerName || resolveCustomerName(cleanId)}
                                  </span>
                                  <span className="font-mono font-bold text-xs text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded-lg border border-neutral-200">
                                    #{cleanId}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                                    isWithCust
                                      ? 'bg-purple-50 text-purple-900 border border-purple-200'
                                      : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                                  }`}>
                                    {item.status || 'Active Trial'}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs bg-neutral-50/80 p-2.5 rounded-xl border border-neutral-200/60">
                                <div>
                                  <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Model &amp; Size</span>
                                  <span className="font-semibold text-neutral-900">{item.shoeModel || 'Trial Footwear'}</span>
                                </div>
                                <div>
                                  <span className="text-[9.5px] uppercase font-bold text-neutral-400 block">Outbound AWB</span>
                                  <span className="font-mono font-bold text-neutral-900">{item.outboundAwb || '—'}</span>
                                </div>
                                <div className="flex items-center justify-start sm:justify-end gap-2">
                                  {isWithCust ? (
                                    <button
                                      type="button"
                                      onClick={() => onUpdateTrial({ ...item, status: 'Returned to Inventory' })}
                                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-[11px] shadow-2xs transition cursor-pointer"
                                    >
                                      Mark Returned to Stock
                                    </button>
                                  ) : (
                                    <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                                      In Warehouse Stock
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: LOG NEW RETURN                                                     */}
      {/* ========================================================================= */}
      {isAddReturnOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-neutral-200 shadow-2xl bg-white p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-neutral-900">Log Customer Return / Exchange</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddReturnOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-900 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateReturn} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Order Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 10450"
                    value={newReturnForm.orderNumber}
                    onChange={e => setNewReturnForm({ ...newReturnForm, orderNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-mono font-bold text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Customer Name</label>
                  <input
                    type="text"
                    placeholder="Client full name"
                    value={newReturnForm.customerName}
                    onChange={e => setNewReturnForm({ ...newReturnForm, customerName: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Store Channel</label>
                  <select
                    value={newReturnForm.storeTab}
                    onChange={e => setNewReturnForm({ ...newReturnForm, storeTab: e.target.value as any })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                  >
                    <option value="Global">Global Store (INR)</option>
                    <option value="LLC">LLC Store (USA / USD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Return Reason</label>
                  <select
                    value={newReturnForm.reason}
                    onChange={e => setNewReturnForm({ ...newReturnForm, reason: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                  >
                    <option value="Size Exchange">Size Exchange</option>
                    <option value="Fit Adjustment">Fit Adjustment (Heel/Instep)</option>
                    <option value="Style Change">Style Change</option>
                    <option value="Refurbishment / Polish">Refurbishment / Polish</option>
                    <option value="Customer Cancellation">Customer Cancellation</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Return Courier</label>
                  <select
                    value={newReturnForm.courier}
                    onChange={e => setNewReturnForm({ ...newReturnForm, courier: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                  >
                    {SHIPPING_PARTNERS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Incoming Return AWB</label>
                  <input
                    type="text"
                    placeholder="e.g. 784910284"
                    value={newReturnForm.trackingNumber}
                    onChange={e => setNewReturnForm({ ...newReturnForm, trackingNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-mono text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Inspection &amp; Inventory Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Minor creasing, soles unworn; safe to restock into Boston inventory."
                  value={newReturnForm.notes}
                  onChange={e => setNewReturnForm({ ...newReturnForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                />
              </div>

              <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddReturnOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  Save &amp; Log Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD TRIAL PAIR                                                     */}
      {/* ========================================================================= */}
      {isAddTrialOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-neutral-200 shadow-2xl bg-white p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Footprints className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-bold text-neutral-900">Add Trial Pair to Tracking</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddTrialOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-900 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTrial} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Order ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 10320"
                    value={newTrialForm.orderId}
                    onChange={e => setNewTrialForm({ ...newTrialForm, orderId: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-mono font-bold text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Customer Name</label>
                  <input
                    type="text"
                    placeholder="Customer Name"
                    value={newTrialForm.customerName}
                    onChange={e => setNewTrialForm({ ...newTrialForm, customerName: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Trial Shoe Model</label>
                  <input
                    type="text"
                    placeholder="e.g. Dixon Oxford / Henry Derby"
                    value={newTrialForm.shoeModel}
                    onChange={e => setNewTrialForm({ ...newTrialForm, shoeModel: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Trial Size</label>
                  <input
                    type="text"
                    placeholder="e.g. UK 8.5 / US 9.5"
                    value={newTrialForm.size}
                    onChange={e => setNewTrialForm({ ...newTrialForm, size: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Outbound AWB</label>
                  <input
                    type="text"
                    placeholder="AWB Tracking number"
                    value={newTrialForm.outboundAwb}
                    onChange={e => setNewTrialForm({ ...newTrialForm, outboundAwb: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-mono text-neutral-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Status</label>
                  <select
                    value={newTrialForm.status}
                    onChange={e => setNewTrialForm({ ...newTrialForm, status: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                  >
                    <option value="With Customer">With Customer (Fitting)</option>
                    <option value="Dispatched">Dispatched in Transit</option>
                    <option value="Returned to Inventory">Returned to Inventory</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Fit Notes</label>
                <input
                  type="text"
                  placeholder="Special instructions or trial pair feedback..."
                  value={newTrialForm.notes}
                  onChange={e => setNewTrialForm({ ...newTrialForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                />
              </div>

              <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddTrialOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  Save Trial Pair
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD WAREHOUSE STOCK PAIR                                           */}
      {/* ========================================================================= */}
      {isAddStockOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-neutral-200 shadow-2xl bg-white p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-neutral-900">Add Stock Pair to Inventory</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddStockOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-900 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStock} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Shoe Model *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dixon Oxford / Henry Derby"
                    value={newStockForm.shoeModel}
                    onChange={e => setNewStockForm({ ...newStockForm, shoeModel: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-bold text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Size *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. UK 8.5 / US 9.5"
                    value={newStockForm.size}
                    onChange={e => setNewStockForm({ ...newStockForm, size: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none focus:border-neutral-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Width / Last</label>
                  <input
                    type="text"
                    placeholder="e.g. E (Standard) / Last 108"
                    value={newStockForm.widthOrLast}
                    onChange={e => setNewStockForm({ ...newStockForm, widthOrLast: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Color / Leather</label>
                  <input
                    type="text"
                    placeholder="e.g. Black Box Calf / French Espresso"
                    value={newStockForm.colorLeather}
                    onChange={e => setNewStockForm({ ...newStockForm, colorLeather: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Storage Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Warehouse Hub - Rack A1"
                    value={newStockForm.storageLocation}
                    onChange={e => setNewStockForm({ ...newStockForm, storageLocation: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Condition</label>
                  <select
                    value={newStockForm.condition}
                    onChange={e => setNewStockForm({ ...newStockForm, condition: e.target.value as any })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                  >
                    <option value="Pristine / Like New">Pristine / Like New</option>
                    <option value="Minor Creasing / Try-on">Minor Creasing / Try-on</option>
                    <option value="Refurbished">Refurbished</option>
                    <option value="Needs Polish">Needs Polish</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Status</label>
                  <select
                    value={newStockForm.status}
                    onChange={e => setNewStockForm({ ...newStockForm, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                  >
                    <option value="Available">Available for Dispatch</option>
                    <option value="Reserved for Exchange">Reserved for Exchange</option>
                    <option value="Inspection Pending">Inspection Pending</option>
                    <option value="Re-allocated / Used">Re-allocated / Used</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Original Order # (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 10420"
                    value={newStockForm.originalOrderId}
                    onChange={e => setNewStockForm({ ...newStockForm, originalOrderId: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl font-mono text-neutral-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Inventory Notes</label>
                <input
                  type="text"
                  placeholder="Additional stock notes, packaging condition, or client history..."
                  value={newStockForm.notes}
                  onChange={e => setNewStockForm({ ...newStockForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 outline-none"
                />
              </div>

              <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddStockOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  Save to Inventory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
