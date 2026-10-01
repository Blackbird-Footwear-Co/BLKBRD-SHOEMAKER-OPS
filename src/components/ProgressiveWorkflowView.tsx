import React, { useState, useMemo } from 'react';
import {
  ShopifyOrder,
  UserProfile,
  UserRole,
  DelinquencyItem,
  DispatchItem,
  ReturnItem,
  TrialPairItem,
  DELINQUENCY_STAGES,
  STANDARD_DELAY_REASONS
} from '../types';
import {
  Sparkles,
  CheckCircle,
  Clock,
  AlertTriangle,
  Package,
  Truck,
  RotateCcw,
  Search,
  Filter,
  ArrowRight,
  RefreshCw,
  LayoutGrid,
  Send,
  Building2,
  Globe,
  Tag,
  MessageSquare,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  Phone,
  Mail,
  MessageCircle,
  Eye,
  Copy,
  Check,
  Info,
  Wrench,
  UserCheck,
  Plus,
  X
} from 'lucide-react';
import { formatBlkbrdOrderId, orderIdsMatch, normalizeOrderId } from '../utils/csvParser';
import { normalizeStage, calculateDelayDays, calculateDelayInfo, calculateExpectedDate } from '../utils/delinquencyUtils';
import { addProductionRemark } from '../services/store';
import { addOrderRemark } from '../services/orderHistoryService';
import { getStoredCustomers, addCrmQueryToCustomer } from '../services/customerService';

interface ProgressiveWorkflowViewProps {
  currentUser: UserProfile | null;
  orders: ShopifyOrder[];
  onUpdateStatus: (
    orderId: string,
    newStatus: 'Ready to Ship' | 'Shipped' | 'Delayed',
    notesAddition?: string
  ) => Promise<void>;
  onRefresh: () => Promise<void>;
  onToggleView?: () => void;
  delinquencies?: DelinquencyItem[];
  dispatches?: DispatchItem[];
  returns?: ReturnItem[];
  trialPairs?: TrialPairItem[];
  onUpdateDelinquency?: (updated: DelinquencyItem, remark?: string) => Promise<void>;
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
  ) => Promise<void>;
}

type WorkflowQueue = 'needs_attention' | 'in_production' | 'ready_to_ship' | 'shipped_recent';

const CRM_QUERY_TAGS = [
  'Delay Follow-up',
  'Sizing & Fit Advice',
  'Address & Shipping Update',
  'Return & Exchange',
  'Bespoke MTO Customization',
  'VIP Client Request'
];

const LOGISTICS_HOLD_REASONS = [
  'Address Verification Required',
  'Courier Remote Area / Serviceability Check',
  'Awaiting Outbound Airway Bill (AWB)',
  'Customs Paperwork / Commercial Invoice Prep',
  'Customer Scheduled Delivery Hold'
];

export const ProgressiveWorkflowView: React.FC<ProgressiveWorkflowViewProps> = ({
  currentUser,
  orders = [],
  onUpdateStatus,
  onRefresh,
  onToggleView,
  delinquencies = [],
  dispatches = [],
  returns = [],
  trialPairs = [],
  onUpdateDelinquency,
  onProcessDispatch
}) => {
  const actualRole: UserRole = currentUser?.role || 'admin';
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null);
  const role: UserRole = previewRole || actualRole;

  // Active step/queue
  const [activeQueue, setActiveQueue] = useState<WorkflowQueue>(() => {
    if (role === 'logistics') return 'ready_to_ship';
    if (role === 'production') return 'in_production';
    return 'needs_attention';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState<'ALL' | 'Global' | 'LLC'>('ALL');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Role permissions
  const canDispatch = role === 'admin' || role === 'logistics';
  const canWorkshopQC = role === 'admin' || role === 'production';
  const canWorkshopDelay = role === 'admin' || role === 'production';
  const canLogisticsHold = role === 'admin' || role === 'logistics';
  const canCrm = role === 'admin' || role === 'crm';

  // Form states for Logistics
  const [trackingNumber, setTrackingNumber] = useState('');
  const [courierName, setCourierName] = useState('BlueDart');
  const [logisticsHoldReason, setLogisticsHoldReason] = useState(LOGISTICS_HOLD_REASONS[0]);

  // Form states for Production
  const [craftingStage, setCraftingStage] = useState<string>('CUTTING');
  const [craftingRemark, setCraftingRemark] = useState('');
  const [delayReason, setDelayReason] = useState<string>(STANDARD_DELAY_REASONS[0]);
  const [actionRemark, setActionRemark] = useState('');

  // Form states for CRM
  const [crmTag, setCrmTag] = useState(CRM_QUERY_TAGS[0]);
  const [crmStatus, setCrmStatus] = useState<'Open' | 'In Progress' | 'Resolved'>('In Progress');
  const [crmRemarks, setCrmRemarks] = useState('');
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Simplified UI states
  const [adminActionTab, setAdminActionTab] = useState<'production' | 'logistics' | 'crm'>('production');
  const [showDelayForm, setShowDelayForm] = useState(false);
  const [showHoldForm, setShowHoldForm] = useState(false);

  // Sync action tab for admin based on queue or preview role
  React.useEffect(() => {
    if (role === 'production') {
      setAdminActionTab('production');
    } else if (role === 'logistics') {
      setAdminActionTab('logistics');
    } else if (role === 'crm') {
      setAdminActionTab('crm');
    } else if (role === 'admin') {
      if (activeQueue === 'ready_to_ship' || activeQueue === 'shipped_recent') {
        setAdminActionTab('logistics');
      } else {
        setAdminActionTab('production');
      }
    }
  }, [role, activeQueue]);

  // UNIFIED MASTER ORDERS LIST: Combines Delinquency workshop ledger + Shopify Store orders
  const unifiedOrders = useMemo(() => {
    const map = new Map<string, ShopifyOrder>();

    // 1. First populate Shopify orders
    (orders || []).forEach(o => {
      const norm = normalizeOrderId(o.orderNumber);
      if (norm) {
        map.set(norm, { ...o });
      }
    });

    // 2. Unify with Delinquency Items (Craftsman bench orders)
    (delinquencies || []).forEach(d => {
      const norm = normalizeOrderId(d.orderId);
      if (!norm) return;

      const isLlc = d.storeTab === 'LLC' || d.orderId.toUpperCase().startsWith('US');
      const storeAccount: 'LLC' | 'Global' = isLlc ? 'LLC' : 'Global';
      const formattedId = formatBlkbrdOrderId(d.orderId, storeAccount);

      let operationalStatus: 'Ready to Ship' | 'Shipped' | 'Delayed' | 'In Production' = 'In Production';
      const stageNorm = normalizeStage(d.currentStage || '');
      const delay = (d.orderDate && d.expectedDate)
        ? calculateDelayDays(d.orderDate, d.expectedDate)
        : (d.daysDelayed || 0);

      if (d.orderStatus === 'Ready to Ship' || stageNorm === 'RTD') {
        operationalStatus = 'Ready to Ship';
      } else if (d.orderStatus === 'Shipped' || stageNorm === 'Shipped') {
        operationalStatus = 'Shipped';
      } else if (delay >= 1) {
        operationalStatus = 'Delayed';
      } else {
        operationalStatus = 'In Production';
      }

      const existing = map.get(norm);
      if (existing) {
        map.set(norm, {
          ...existing,
          customerName: d.customerName || d.clientName || existing.customerName,
          lineItems: d.product || d.shoeStyle || existing.lineItems,
          operationalStatus: existing.operationalStatus || operationalStatus,
          notes: existing.notes || d.remarks || d.delayReason || '',
          storeAccount,
          storeTab: storeAccount
        });
      } else {
        map.set(norm, {
          id: `delinq-${d.id || formattedId}`,
          orderNumber: formattedId,
          customerName: d.customerName || d.clientName || 'Valued Client',
          email: d.email || d.clientEmail || '',
          totalPrice: isLlc ? '$345.00' : '₹16,999',
          currency: isLlc ? 'USD' : 'INR',
          financialStatus: 'paid',
          fulfillmentStatus: operationalStatus === 'Shipped' ? 'fulfilled' : 'unfulfilled',
          operationalStatus,
          createdAt: d.orderDate ? `${d.orderDate}T10:00:00Z` : new Date().toISOString(),
          lineItems: d.product || d.shoeStyle || 'Bespoke Goodyear Welted Pair',
          notes: d.remarks || d.delayReason || (d.daysDelayed > 0 ? `Delayed by ${d.daysDelayed} days (${d.delayReason || 'Workshop Bench'})` : ''),
          storeAccount,
          storeTab: storeAccount
        });
      }
    });

    return Array.from(map.values());
  }, [orders, delinquencies]);

  // Partition unified orders by operational stage
  const categorizedOrders = useMemo(() => {
    let list = unifiedOrders;
    if (storeFilter !== 'ALL') {
      list = list.filter(o => {
        const isLlc = o.storeAccount === 'LLC' || o.currency === 'USD';
        return storeFilter === 'LLC' ? isLlc : !isLlc;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        o =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          (o.lineItems && o.lineItems.toLowerCase().includes(q))
      );
    }

    const delinqMap = new Map<string, DelinquencyItem>();
    (delinquencies || []).forEach(d => {
      const norm = normalizeOrderId(d.orderId);
      if (norm) delinqMap.set(norm, d);
    });

    const dispatchSet = new Set<string>();
    (dispatches || []).forEach(dp => {
      const norm = normalizeOrderId(dp.orderNumber);
      if (norm) dispatchSet.add(norm);
    });

    return {
      needs_attention: list.filter(o => {
        const norm = normalizeOrderId(o.orderNumber);
        const d = delinqMap.get(norm);
        if (!d) return o.operationalStatus === 'Delayed';
        const delay = (d.orderDate && d.expectedDate)
          ? calculateDelayDays(d.orderDate, d.expectedDate)
          : (d.daysDelayed || 0);
        const isRtd = d.orderStatus === 'Ready to Ship' || normalizeStage(d.currentStage || '') === 'RTD';
        const isShipped = d.orderStatus === 'Shipped' || normalizeStage(d.currentStage || '') === 'Shipped';
        return !isRtd && !isShipped && delay >= 1;
      }),
      in_production: list.filter(o => {
        const norm = normalizeOrderId(o.orderNumber);
        const d = delinqMap.get(norm);
        if (dispatchSet.has(norm)) return false;
        if (o.operationalStatus === 'In Production') return true;
        if (d && !['RTD', 'Shipped'].includes(normalizeStage(d.currentStage || ''))) {
          const delay = (d.orderDate && d.expectedDate)
            ? calculateDelayDays(d.orderDate, d.expectedDate)
            : (d.daysDelayed || 0);
          return delay < 1;
        }
        return false;
      }),
      ready_to_ship: list.filter(o => {
        const norm = normalizeOrderId(o.orderNumber);
        const d = delinqMap.get(norm);
        if (dispatchSet.has(norm)) return false;
        return (
          o.operationalStatus === 'Ready to Ship' ||
          (d && (d.orderStatus === 'Ready to Ship' || normalizeStage(d.currentStage || '') === 'RTD'))
        );
      }),
      shipped_recent: list.filter(o => {
        const norm = normalizeOrderId(o.orderNumber);
        const d = delinqMap.get(norm);
        return (
          dispatchSet.has(norm) ||
          o.operationalStatus === 'Shipped' ||
          (d && (d.orderStatus === 'Shipped' || normalizeStage(d.currentStage || '') === 'Shipped'))
        );
      })
    };
  }, [unifiedOrders, storeFilter, searchQuery, delinquencies, dispatches]);

  const currentList = categorizedOrders[activeQueue] || [];

  // Default selection
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId && currentList.length > 0) {
      return currentList[0];
    }
    return currentList.find(o => o.id === selectedOrderId || o.orderNumber === selectedOrderId) || currentList[0] || null;
  }, [selectedOrderId, currentList]);

  // Correlate selected order with delinquency, dispatch, customer profile
  const matchedDelinquency = useMemo(() => {
    if (!selectedOrder) return null;
    return delinquencies.find(d => orderIdsMatch(d.orderId, selectedOrder.orderNumber));
  }, [selectedOrder, delinquencies]);

  const matchedDispatch = useMemo(() => {
    if (!selectedOrder) return null;
    return dispatches.find(dp => orderIdsMatch(dp.orderNumber, selectedOrder.orderNumber));
  }, [selectedOrder, dispatches]);

  const matchedCustomer = useMemo(() => {
    if (!selectedOrder) return null;
    const customers = getStoredCustomers();
    if (selectedOrder.email) {
      const byEmail = customers.find(c => c.email && c.email.toLowerCase() === selectedOrder.email.toLowerCase());
      if (byEmail) return byEmail;
    }
    return customers.find(c =>
      c.orderIds.some(oid => orderIdsMatch(oid, selectedOrder.orderNumber))
    ) || null;
  }, [selectedOrder]);

  // Keep crafting stage synced with current order's stage
  React.useEffect(() => {
    if (matchedDelinquency?.currentStage) {
      setCraftingStage(matchedDelinquency.currentStage);
    }
  }, [selectedOrder?.orderNumber, matchedDelinquency?.currentStage]);

  const customerPhone = matchedCustomer?.phone || (matchedDelinquency as any)?.phone || (matchedDelinquency as any)?.clientPhone || '';

  const cleanPhone = customerPhone.replace(/[^0-9]/g, '');
  const isLlcStore = selectedOrder ? (selectedOrder.storeAccount === 'LLC' || selectedOrder.currency === 'USD') : false;
  const currentFormattedId = selectedOrder ? formatBlkbrdOrderId(selectedOrder.orderNumber, isLlcStore ? 'LLC' : 'Global') : '';

  const currentStageName = normalizeStage((matchedDelinquency?.currentStage || craftingStage || 'CUTTING') as string);
  const currentStageIndex = DELINQUENCY_STAGES.indexOf(currentStageName as any);
  const nextStage = currentStageIndex >= 0 && currentStageIndex < DELINQUENCY_STAGES.length - 1
    ? DELINQUENCY_STAGES[currentStageIndex + 1]
    : null;

  const whatsappUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
        `Hello ${selectedOrder?.customerName || 'Valued Client'}, this is the BLKBRD Shoemaker artisan team regarding your order ${currentFormattedId} (${selectedOrder?.lineItems || 'Goodyear Welted Pair'}). Your pair is currently in the ${currentStageName} crafting stage. Please let us know if you have any questions!`
      )}`
    : null;

  const emailUrl = selectedOrder?.email
    ? `mailto:${selectedOrder.email}?subject=${encodeURIComponent(
        `Crafting Update: Your BLKBRD Order ${currentFormattedId}`
      )}&body=${encodeURIComponent(
        `Dear ${selectedOrder?.customerName || 'Client'},\n\nWe are pleased to provide an update on your order ${currentFormattedId} (${selectedOrder?.lineItems || 'Handcrafted Footwear'}).\n\nYour pair is currently at our workshop milestone: ${currentStageName}.\n\nThank you for your patronage,\nBLKBRD Shoemaker Artisan Team`
      )}`
    : null;

  const handleCopyPhone = () => {
    if (!customerPhone) return;
    navigator.clipboard?.writeText(customerPhone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handleAdvanceStatus = async (
    targetOrder: ShopifyOrder,
    newStatus: 'Ready to Ship' | 'Shipped' | 'Delayed',
    notes?: string
  ) => {
    try {
      setIsProcessing(true);
      await onUpdateStatus(targetOrder.orderNumber, newStatus, notes);
      const displayId = formatBlkbrdOrderId(targetOrder.orderNumber, isLlcStore ? 'LLC' : 'Global');
      setFeedbackMsg(`Order ${displayId} successfully moved to ${newStatus}`);
      setTimeout(() => setFeedbackMsg(null), 3500);
      setTrackingNumber('');
      setActionRemark('');
    } catch (err: any) {
      alert(`Error updating order: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 1. One-Tap Production Stage & Crafting update
  const handleUpdateCraftingStage = async (stageOverride?: string, remarkOverride?: string) => {
    if (!selectedOrder) return;
    setIsProcessing(true);
    try {
      const targetStage = stageOverride || craftingStage;
      const targetRemark = (remarkOverride !== undefined ? remarkOverride : craftingRemark).trim();
      const authorName = currentUser?.name || (role === 'production' ? 'Workshop Lead' : 'Admin');
      const displayId = formatBlkbrdOrderId(selectedOrder.orderNumber, isLlcStore ? 'LLC' : 'Global');

      addProductionRemark({
        orderId: displayId,
        author: `${authorName} (Workshop)`,
        previousStatus: selectedOrder.operationalStatus || '',
        newStatus: `Crafting Stage: ${targetStage}`,
        remark: targetRemark || `Crafting milestone updated to ${targetStage} on workshop bench.`
      });

      addOrderRemark(
        displayId,
        targetRemark || `Crafting milestone updated to ${targetStage}.`,
        { name: authorName, role: 'production' },
        targetStage
      );

      if (matchedDelinquency && onUpdateDelinquency) {
        const updatedDelinq: DelinquencyItem = {
          ...matchedDelinquency,
          currentStage: targetStage,
          orderStatus: targetStage === 'RTD' ? 'Ready to Ship' : (matchedDelinquency.daysDelayed > 0 ? 'Delayed' : 'In Production'),
          actionRequired: targetStage === 'RTD' ? 'Ready to Dispatch (RTD)' : `Workshop Crafting (${targetStage})`,
          remarks: targetRemark || `Crafting stage: ${targetStage}`
        };
        await onUpdateDelinquency(updatedDelinq, targetRemark);
      }

      if (targetStage === 'RTD') {
        await onUpdateStatus(selectedOrder.orderNumber, 'Ready to Ship', targetRemark || 'QC Inspection Cleared - RTD');
      }

      setFeedbackMsg(`Milestone for ${displayId} advanced to ${targetStage}`);
      setTimeout(() => setFeedbackMsg(null), 3500);
      setCraftingRemark('');
    } catch (err: any) {
      alert(`Error updating crafting stage: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. One-Tap Quick Production Delay Flagging
  const handleQuickLogDelay = async (reason: string, customRemark?: string) => {
    if (!selectedOrder) return;
    setIsProcessing(true);
    try {
      const authorName = currentUser?.name || (role === 'production' ? 'Workshop Lead' : 'Admin');
      const displayId = formatBlkbrdOrderId(selectedOrder.orderNumber, isLlcStore ? 'LLC' : 'Global');
      const userRemark = (customRemark !== undefined ? customRemark : actionRemark).trim();
      const note = userRemark ? `Production Delay: ${reason} (${userRemark})` : `Production Delay: ${reason}`;

      addProductionRemark({
        orderId: displayId,
        author: `${authorName} (Workshop)`,
        previousStatus: selectedOrder.operationalStatus || '',
        newStatus: 'Delayed',
        remark: note
      });

      addOrderRemark(
        displayId,
        note,
        { name: authorName, role: 'production' },
        'Delayed'
      );

      if (matchedDelinquency && onUpdateDelinquency) {
        const updatedDelinq: DelinquencyItem = {
          ...matchedDelinquency,
          orderStatus: 'Delayed',
          delayReason: reason,
          daysDelayed: matchedDelinquency.daysDelayed > 0 ? matchedDelinquency.daysDelayed : 3,
          actionRequired: `Delay Follow-up: ${reason}`,
          remarks: note
        };
        await onUpdateDelinquency(updatedDelinq, note);
      }

      await onUpdateStatus(selectedOrder.orderNumber, 'Delayed', note);

      setFeedbackMsg(`Delay flagged for ${displayId}: ${reason}`);
      setTimeout(() => setFeedbackMsg(null), 3500);
      setActionRemark('');
    } catch (err: any) {
      alert(`Error logging delay: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. One-Tap Logistics Dispatch
  const handleDispatchOrder = async () => {
    if (!selectedOrder) return;
    setIsProcessing(true);
    try {
      const activeAwb = trackingNumber.trim() || `${courierName.slice(0, 3).toUpperCase()}-${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      const displayId = formatBlkbrdOrderId(selectedOrder.orderNumber, isLlcStore ? 'LLC' : 'Global');
      const note = `Shipped via ${courierName} [AWB: ${activeAwb}]`;

      if (matchedDelinquency && onProcessDispatch) {
        await onProcessDispatch(matchedDelinquency, {
          orderNumber: selectedOrder.orderNumber,
          customerName: selectedOrder.customerName,
          shippingPartner: courierName,
          outgoingTrackingAwb: activeAwb,
          shippingType: isLlcStore ? 'International' : 'Domestic',
          trialPair: 'N',
          notes: note,
          date: new Date().toISOString().split('T')[0]
        });
      }

      await handleAdvanceStatus(selectedOrder, 'Shipped', note);

      addProductionRemark({
        orderId: displayId,
        author: `${currentUser?.name || 'Logistics Lead'} (Logistics)`,
        previousStatus: selectedOrder.operationalStatus || 'Ready to Ship',
        newStatus: 'Shipped',
        remark: note
      });

      addOrderRemark(
        displayId,
        note,
        { name: currentUser?.name || 'Logistics Lead', role: 'logistics' },
        'Shipped'
      );

      setFeedbackMsg(`Order ${displayId} marked as Shipped via ${courierName} (AWB: ${activeAwb})`);
      setTimeout(() => setFeedbackMsg(null), 3500);
      setTrackingNumber('');
    } catch (err: any) {
      alert(`Error dispatching order: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. One-Tap Logistics Hold
  const handleLogisticsHold = async (reasonOverride?: string) => {
    if (!selectedOrder) return;
    setIsProcessing(true);
    try {
      const activeReason = reasonOverride || logisticsHoldReason;
      const displayId = formatBlkbrdOrderId(selectedOrder.orderNumber, isLlcStore ? 'LLC' : 'Global');
      const note = `Logistics Hold: ${activeReason}${actionRemark ? ` - ${actionRemark}` : ''}`;
      await handleAdvanceStatus(selectedOrder, 'Delayed', note);

      addProductionRemark({
        orderId: displayId,
        author: `${currentUser?.name || 'Logistics Lead'} (Logistics)`,
        previousStatus: selectedOrder.operationalStatus || '',
        newStatus: 'Logistics Hold',
        remark: note
      });

      addOrderRemark(
        displayId,
        note,
        { name: currentUser?.name || 'Logistics Lead', role: 'logistics' },
        'Logistics Hold'
      );

      setFeedbackMsg(`Logistics hold logged for ${displayId}: ${activeReason}`);
      setTimeout(() => setFeedbackMsg(null), 3500);
      setActionRemark('');
    } catch (err: any) {
      alert(`Error logging logistics hold: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 5. One-Tap CRM Client Interaction Logging
  const handleQuickCrmLog = async (tag: string, remark: string) => {
    if (!selectedOrder) return;
    setIsProcessing(true);
    try {
      const authorName = currentUser?.name || (role === 'crm' ? 'CRM Specialist' : 'Admin');
      const displayId = formatBlkbrdOrderId(selectedOrder.orderNumber, isLlcStore ? 'LLC' : 'Global');

      if (matchedCustomer) {
        addCrmQueryToCustomer(matchedCustomer.id, {
          orderId: displayId,
          tag,
          status: 'In Progress',
          remarks: remark,
          agentName: authorName,
          agentRole: role
        });
      }

      addProductionRemark({
        orderId: displayId,
        author: `${authorName} (CRM)`,
        previousStatus: '',
        newStatus: `CRM (${tag})`,
        remark: `[${tag}] ${remark}`
      });

      addOrderRemark(
        displayId,
        `[CRM: ${tag}] ${remark}`,
        { name: authorName, role: 'crm' },
        `CRM (${tag})`
      );

      setFeedbackMsg(`CRM activity logged: ${tag}`);
      setTimeout(() => setFeedbackMsg(null), 3500);
    } catch (err: any) {
      alert(`Error logging CRM inquiry: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Form CRM interaction
  const handleLogCrmInteraction = async () => {
    if (!selectedOrder || !crmRemarks.trim()) return;
    await handleQuickCrmLog(crmTag, crmRemarks.trim());
    setCrmRemarks('');
  };

  // Dynamic role presentation
  const roleMeta = useMemo(() => {
    switch (role) {
      case 'production':
        return {
          title: 'Production Workshop Wizard',
          badgeText: 'Workshop Craftsman',
          badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
          subtitle: 'Bench crafting progress, Quality Check clearance, and delay reporting (Dispatch restricted)'
        };
      case 'logistics':
        return {
          title: 'Logistics Fulfillment & Dispatch Wizard',
          badgeText: 'Logistics Officer',
          badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          subtitle: 'Packaging inspection, courier partner assignment, and outbound shipment dispatch'
        };
      case 'crm':
        return {
          title: 'Customer Advisory & Resolution Wizard',
          badgeText: 'CRM Specialist',
          badgeColor: 'bg-teal-100 text-teal-900 border-teal-300',
          subtitle: 'Direct client WhatsApp/Email outreach, sizing consultations, and communication logging'
        };
      case 'admin':
      default:
        return {
          title: 'Executive Staff Command Wizard',
          badgeText: 'Full Access Admin',
          badgeColor: 'bg-purple-100 text-purple-900 border-purple-300',
          subtitle: 'Comprehensive operational authority across workshop benches, dispatch desk, and client CRM'
        };
    }
  }, [role]);

  return (
    <div className="w-full px-3 sm:px-6 lg:px-8 py-4 space-y-4 max-w-7xl mx-auto">
      {/* Wizard Header Bar */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold">
            👞
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-neutral-900">{roleMeta.title}</h2>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${roleMeta.badgeColor}`}>
                {roleMeta.badgeText}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              {role === 'production' && '1-click stage advancement & QC clearance'}
              {role === 'logistics' && '1-click courier dispatch & tracking'}
              {role === 'crm' && '1-click WhatsApp & client communication'}
              {role === 'admin' && 'Simplified single-click task workflow'}
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Admin Role Preview Switcher */}
          {actualRole === 'admin' && (
            <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl border border-neutral-200 text-xs">
              <span className="text-[10px] font-bold text-neutral-500 px-1.5">View As:</span>
              <button
                onClick={() => setPreviewRole(null)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  previewRole === null
                    ? 'bg-white text-purple-900 shadow-xs border border-neutral-200'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                All (Admin)
              </button>
              <button
                onClick={() => setPreviewRole('production')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  previewRole === 'production'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Workshop
              </button>
              <button
                onClick={() => setPreviewRole('logistics')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  previewRole === 'logistics'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Logistics
              </button>
              <button
                onClick={() => setPreviewRole('crm')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  previewRole === 'crm'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                CRM
              </button>
            </div>
          )}

          {onToggleView && (
            <button
              onClick={onToggleView}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-200 transition cursor-pointer"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Full Table</span>
            </button>
          )}

          <button
            onClick={() => onRefresh()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-white transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs">
          <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* 4 Clean Large Queue Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          onClick={() => {
            setActiveQueue('needs_attention');
            setSelectedOrderId(null);
          }}
          className={`p-3 rounded-xl border text-left transition cursor-pointer ${
            activeQueue === 'needs_attention'
              ? 'bg-rose-50 border-rose-400 text-rose-950 ring-2 ring-rose-300/50'
              : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700">⚠️ Action Needed</span>
            <span className="text-base font-extrabold text-rose-800">{categorizedOrders.needs_attention.length}</span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-0.5">Delayed or stalled orders</p>
        </button>

        <button
          onClick={() => {
            setActiveQueue('in_production');
            setSelectedOrderId(null);
          }}
          className={`p-3 rounded-xl border text-left transition cursor-pointer ${
            activeQueue === 'in_production'
              ? 'bg-amber-50 border-amber-400 text-amber-950 ring-2 ring-amber-300/50'
              : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700">🔨 In Workshop</span>
            <span className="text-base font-extrabold text-amber-800">{categorizedOrders.in_production.length}</span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-0.5">Bench crafting in progress</p>
        </button>

        <button
          onClick={() => {
            setActiveQueue('ready_to_ship');
            setSelectedOrderId(null);
          }}
          className={`p-3 rounded-xl border text-left transition cursor-pointer ${
            activeQueue === 'ready_to_ship'
              ? 'bg-indigo-50 border-indigo-400 text-indigo-950 ring-2 ring-indigo-300/50'
              : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-700">📦 Ready to Ship</span>
            <span className="text-base font-extrabold text-indigo-800">{categorizedOrders.ready_to_ship.length}</span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-0.5">QC passed, awaiting courier</p>
        </button>

        <button
          onClick={() => {
            setActiveQueue('shipped_recent');
            setSelectedOrderId(null);
          }}
          className={`p-3 rounded-xl border text-left transition cursor-pointer ${
            activeQueue === 'shipped_recent'
              ? 'bg-emerald-50 border-emerald-400 text-emerald-950 ring-2 ring-emerald-300/50'
              : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700">🚚 Dispatched</span>
            <span className="text-base font-extrabold text-emerald-800">{categorizedOrders.shipped_recent.length}</span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-0.5">Shipped out to customer</p>
        </button>
      </div>

      {/* Main Split Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Orders List (5 cols) */}
        <div className="lg:col-span-5 space-y-2">
          <div className="bg-white border border-neutral-200 rounded-2xl p-3 shadow-xs">
            {/* Search and Store Filter */}
            <div className="flex items-center gap-2 mb-2.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search order or client..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-neutral-50 text-neutral-900 text-xs pl-8 pr-3 py-1.5 rounded-xl border border-neutral-200 focus:outline-none focus:border-neutral-400"
                />
              </div>
              <div className="flex items-center rounded-xl bg-neutral-100 p-0.5 border border-neutral-200">
                {(['ALL', 'Global', 'LLC'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setStoreFilter(tab)}
                    className={`px-2 py-1 text-[10px] font-bold rounded-lg transition cursor-pointer ${
                      storeFilter === tab
                        ? 'bg-white text-neutral-900 shadow-xs'
                        : 'text-neutral-500 hover:text-neutral-800'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Order Cards */}
            <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
              {currentList.length === 0 ? (
                <div className="text-center py-10 px-3 bg-neutral-50 rounded-2xl border border-dashed border-neutral-200 space-y-2">
                  <p className="text-neutral-500 font-medium text-xs">No orders in this queue.</p>
                </div>
              ) : (
                currentList.map(order => {
                  const isSelected = selectedOrder?.orderNumber === order.orderNumber;
                  const isLlc = order.storeAccount === 'LLC' || order.currency === 'USD';
                  const displayOrderId = formatBlkbrdOrderId(order.orderNumber, isLlc ? 'LLC' : 'Global');
                  const orderDateStr = order.createdAt ? order.createdAt.split('T')[0] : '';
                  const expDate = orderDateStr ? calculateExpectedDate(orderDateStr) : '';
                  const delayInfo = calculateDelayInfo(orderDateStr, expDate);
                  const isCompleted = order.operationalStatus === 'Shipped' || order.operationalStatus === 'Ready to Ship' || order.fulfillmentStatus === 'fulfilled';
                  const delayDays = isCompleted ? 0 : delayInfo.delayedDays;

                  return (
                    <div
                      key={order.id || order.orderNumber}
                      onClick={() => {
                        setSelectedOrderId(order.orderNumber);
                        setShowDelayForm(false);
                        setShowHoldForm(false);
                      }}
                      className={`p-3 rounded-xl border transition cursor-pointer ${
                        isSelected
                          ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                          : 'bg-white border-neutral-200 hover:border-neutral-300 text-neutral-800'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-xs">{displayOrderId}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                                isSelected
                                  ? 'bg-neutral-800 text-neutral-300'
                                  : isLlc
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {isLlc ? 'USA' : 'Global'}
                            </span>
                          </div>
                          <p className={`text-xs font-bold mt-0.5 ${isSelected ? 'text-white' : 'text-neutral-900'}`}>
                            {order.customerName || 'Valued Client'}
                          </p>
                        </div>
                        <span className={`text-[10px] font-mono ${isSelected ? 'text-neutral-300' : 'text-neutral-500'}`}>
                          {order.totalPrice || ''}
                        </span>
                      </div>
                      <p className={`text-[11px] truncate mt-1 ${isSelected ? 'text-neutral-300' : 'text-neutral-600'}`}>
                        {order.lineItems || 'Goodyear Welted Pair'}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between text-[10px]">
                        <span className={`font-semibold ${isSelected ? 'text-amber-300' : 'text-neutral-600'}`}>
                          {order.operationalStatus}
                        </span>
                        {delayDays > 0 && !isCompleted && (
                          <span className={`font-bold font-mono px-1.5 py-0.2 rounded text-[10px] ${
                            isSelected ? 'bg-rose-900 text-rose-200 border border-rose-700' : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}>
                            +{delayDays}d delayed
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right: Extremely Simple Order Action Box (7 cols) */}
        <div className="lg:col-span-7">
          {selectedOrder ? (
            <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs space-y-4">
              {/* Order Overview Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3.5 border-b border-neutral-100 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-mono font-extrabold text-neutral-900">
                      {currentFormattedId}
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                        selectedOrder.operationalStatus === 'Ready to Ship'
                          ? 'bg-indigo-100 text-indigo-800'
                          : selectedOrder.operationalStatus === 'Shipped'
                          ? 'bg-emerald-100 text-emerald-800'
                          : selectedOrder.operationalStatus === 'Delayed'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {selectedOrder.operationalStatus || 'In Production'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 font-medium mt-1">
                    Client: <span className="font-bold text-neutral-900">{selectedOrder.customerName}</span>
                    {customerPhone && (
                      <span className="ml-2 font-mono text-neutral-500">({customerPhone})</span>
                    )}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-sm font-bold text-neutral-900">{selectedOrder.totalPrice}</div>
                  <div className="text-[10px] text-neutral-500">
                    {isLlcStore ? 'USA Store (LLC)' : 'Global Store (INR)'}
                  </div>
                </div>
              </div>

              {/* Shoe Spec */}
              <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200/60">
                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Shoe Model</span>
                <p className="text-xs font-bold text-neutral-900 mt-0.5">
                  {selectedOrder.lineItems || 'Handcrafted Goodyear Welted Footwear'}
                </p>
                {selectedOrder.notes && (
                  <p className="text-[11px] text-neutral-600 mt-1 italic">
                    Note: {selectedOrder.notes}
                  </p>
                )}
              </div>

              {/* Delayed Days Banner */}
              {(() => {
                const sOrderDate = selectedOrder.createdAt ? selectedOrder.createdAt.split('T')[0] : '';
                const sExpDate = sOrderDate ? calculateExpectedDate(sOrderDate) : '';
                const sDelayInfo = calculateDelayInfo(sOrderDate, sExpDate);
                const sIsCompleted = selectedOrder.operationalStatus === 'Shipped' || selectedOrder.operationalStatus === 'Ready to Ship' || selectedOrder.fulfillmentStatus === 'fulfilled';
                const sDelayDays = sIsCompleted ? 0 : sDelayInfo.delayedDays;

                if (sDelayDays > 0) {
                  return (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 text-xs shadow-2xs">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <div>
                          <span className="font-bold">Overdue by {sDelayDays} {sDelayDays === 1 ? 'day' : 'days'}</span>
                          <span className="text-neutral-500 text-[11px] block">Order Date: {sOrderDate || '—'} · Target was: {sExpDate || '—'}</span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-xs bg-rose-200/80 text-rose-900 px-2.5 py-1 rounded-lg">
                        +{sDelayDays}d late
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Admin Mode Switcher: ONLY if Admin */}
              {role === 'admin' && (
                <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-xl border border-neutral-200">
                  <button
                    onClick={() => setAdminActionTab('production')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      adminActionTab === 'production'
                        ? 'bg-white text-amber-900 shadow-xs border border-neutral-200'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    🔨 Workshop Bench
                  </button>
                  <button
                    onClick={() => setAdminActionTab('logistics')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      adminActionTab === 'logistics'
                        ? 'bg-white text-emerald-900 shadow-xs border border-neutral-200'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    🚚 Dispatch & Ship
                  </button>
                  <button
                    onClick={() => setAdminActionTab('crm')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      adminActionTab === 'crm'
                        ? 'bg-white text-teal-900 shadow-xs border border-neutral-200'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    💬 Customer Outreach
                  </button>
                </div>
              )}

              {/* ========================================================= */}
              {/* ACTION VIEW 1: PRODUCTION CRAFTSMAN                      */}
              {/* ========================================================= */}
              {((role === 'admin' && adminActionTab === 'production') || role === 'production') && (
                <div className="space-y-4 pt-1">
                  {/* Current Stage Indicator */}
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">
                        Current Crafting Stage
                      </span>
                      <div className="text-base font-extrabold text-amber-950 mt-0.5">
                        {currentStageName}
                      </div>
                    </div>
                    {matchedDelinquency?.daysDelayed ? (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800">
                        {matchedDelinquency.daysDelayed}d delayed
                      </span>
                    ) : null}
                  </div>

                  {/* 1-CLICK ADVANCE BUTTON */}
                  {nextStage && (
                    <button
                      disabled={isProcessing}
                      onClick={() => handleUpdateCraftingStage(nextStage)}
                      className="w-full py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-xs transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <span>Advance to Next Stage: "{nextStage}"</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}

                  {/* 1-CLICK QC APPROVAL (MARK RTD) */}
                  <button
                    disabled={isProcessing || selectedOrder.operationalStatus === 'Ready to Ship'}
                    onClick={() => handleAdvanceStatus(selectedOrder, 'Ready to Ship', 'QC Inspection Cleared')}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {selectedOrder.operationalStatus === 'Ready to Ship'
                        ? '✓ Already Cleared (Ready to Ship)'
                        : 'Approve QC & Mark Ready to Ship (RTD)'}
                    </span>
                  </button>

                  {/* Manual Stage Change Dropdown (Simple & Compact) */}
                  <div className="pt-2 border-t border-neutral-100 flex items-center gap-2">
                    <span className="text-[11px] text-neutral-500 whitespace-nowrap">Or jump to:</span>
                    <select
                      value={normalizeStage(craftingStage)}
                      onChange={e => {
                        setCraftingStage(e.target.value);
                        handleUpdateCraftingStage(e.target.value);
                      }}
                      className="flex-1 bg-white border border-neutral-200 rounded-lg p-1.5 text-xs font-bold uppercase tracking-wide focus:outline-none"
                    >
                      {DELINQUENCY_STAGES.map(s => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Workshop Delay & Bottleneck Reporting: Visible dropdown & remark field */}
                  <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200/90 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-rose-950">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>Report Workshop Delay / Bottleneck</span>
                      </div>
                      {matchedDelinquency?.delayReason && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-200/80 text-rose-900 border border-rose-300/60">
                          Current: {matchedDelinquency.delayReason}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] font-bold text-neutral-700 uppercase tracking-wider">
                          Delay Reason
                        </label>
                        <select
                          value={delayReason}
                          onChange={e => setDelayReason(e.target.value)}
                          className="w-full mt-1 bg-white border border-neutral-300 rounded-lg p-2 text-xs focus:outline-none font-medium text-neutral-800"
                        >
                          {STANDARD_DELAY_REASONS.map(r => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-neutral-700 uppercase tracking-wider">
                          Remark / Notes
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Leather stock delayed, waiting on tannery..."
                          value={actionRemark}
                          onChange={e => setActionRemark(e.target.value)}
                          className="w-full mt-1 bg-white border border-neutral-300 rounded-lg p-2 text-xs focus:outline-none text-neutral-800"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-0.5">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleQuickLogDelay(delayReason, actionRemark)}
                        className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Log Production Delay</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* ACTION VIEW 2: LOGISTICS & DISPATCH                      */}
              {/* ========================================================= */}
              {((role === 'admin' && adminActionTab === 'logistics') || role === 'logistics') && (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider">
                        Shipping Partner
                      </label>
                      <select
                        value={courierName}
                        onChange={e => setCourierName(e.target.value)}
                        className="w-full mt-1 bg-white border border-neutral-200 rounded-lg p-2 text-xs focus:outline-none font-medium"
                      >
                        <option value="BlueDart">BlueDart</option>
                        <option value="Delhivery">Delhivery</option>
                        <option value="DHL Express">DHL Express</option>
                        <option value="FedEx International">FedEx International</option>
                        <option value="UPS Worldwide">UPS Worldwide</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider">
                          Tracking AWB #
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const prefix = courierName.slice(0, 3).toUpperCase();
                            const num = Math.floor(1000000000 + Math.random() * 9000000000);
                            setTrackingNumber(`${prefix}-${num}`);
                          }}
                          className="text-[10px] text-emerald-700 hover:underline font-bold cursor-pointer"
                        >
                          ⚡ Auto Generate
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. BD-892019482"
                        value={trackingNumber}
                        onChange={e => setTrackingNumber(e.target.value)}
                        className="w-full mt-1 bg-white border border-neutral-200 rounded-lg p-2 text-xs focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* 1-CLICK DISPATCH BUTTON */}
                  <button
                    disabled={isProcessing}
                    onClick={handleDispatchOrder}
                    className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-xs transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Truck className="w-4 h-4" />
                    <span>Confirm Dispatch & Mark Shipped</span>
                  </button>

                  {/* Collapsible Shipping Hold */}
                  <div className="pt-1">
                    {!showHoldForm ? (
                      <button
                        type="button"
                        onClick={() => setShowHoldForm(true)}
                        className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>🛑 Need to put order on delivery hold?</span>
                      </button>
                    ) : (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-rose-900">Log Logistics Hold</span>
                          <button
                            type="button"
                            onClick={() => setShowHoldForm(false)}
                            className="text-[10px] text-neutral-500 hover:underline cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                        <select
                          value={logisticsHoldReason}
                          onChange={e => setLogisticsHoldReason(e.target.value)}
                          className="w-full bg-white border border-neutral-200 rounded-lg p-2 text-xs focus:outline-none"
                        >
                          {LOGISTICS_HOLD_REASONS.map(r => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <button
                          disabled={isProcessing}
                          onClick={() => {
                            handleLogisticsHold();
                            setShowHoldForm(false);
                          }}
                          className="w-full py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition cursor-pointer"
                        >
                          Confirm Hold
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* ACTION VIEW 3: CRM & CLIENT CARE                         */}
              {/* ========================================================= */}
              {((role === 'admin' && adminActionTab === 'crm') || role === 'crm') && (
                <div className="space-y-3 pt-1">
                  {/* 1-Tap Direct Outreach */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {whatsappUrl ? (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs text-center"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>Open WhatsApp with Client</span>
                      </a>
                    ) : (
                      <button
                        disabled
                        className="w-full py-3 px-3 rounded-xl bg-neutral-100 text-neutral-400 font-bold text-xs cursor-not-allowed"
                      >
                        No Phone on Profile
                      </button>
                    )}

                    {emailUrl ? (
                      <a
                        href={emailUrl}
                        className="w-full py-3 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs text-center"
                      >
                        <Mail className="w-4 h-4" />
                        <span>Send Email to Client</span>
                      </a>
                    ) : (
                      <button
                        disabled
                        className="w-full py-3 px-3 rounded-xl bg-neutral-100 text-neutral-400 font-bold text-xs cursor-not-allowed"
                      >
                        No Email on Profile
                      </button>
                    )}
                  </div>

                  {/* Quick CRM Log Input */}
                  <div className="pt-2 border-t border-neutral-100 space-y-2">
                    <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider">
                      Log Client Interaction Note
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. Client confirmed sizing and agreed to timeline..."
                        value={crmRemarks}
                        onChange={e => setCrmRemarks(e.target.value)}
                        className="flex-1 bg-white border border-neutral-200 rounded-lg p-2 text-xs focus:outline-none"
                      />
                      <button
                        disabled={isProcessing || !crmRemarks.trim()}
                        onClick={handleLogCrmInteraction}
                        className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
                      >
                        Save Note
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-neutral-200 rounded-2xl p-10 text-center shadow-xs space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-700">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-neutral-800">
                  {unifiedOrders.length === 0 ? 'No Orders in System' : 'Select an order from the queue'}
                </p>
                <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                  {unifiedOrders.length === 0
                    ? 'Orders sync automatically in real-time from your Shopify stores (Global & LLC). Once a customer places an order on Shopify, it appears here automatically for workshop crafting, stage advancement, and dispatch.'
                    : 'Choose any order from the left list to review bench status and execute one-tap actions.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
