/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ReturnItem,
  DispatchItem,
  DelinquencyItem,
  ShopifyOrder,
  TrialPairItem,
  ProductionRemark,
  UserProfile,
  UserRole,
  BostonStockItem
} from './types';
import {
  getCurrentUser,
  setCurrentUser,
  getDelinquencies,
  saveDelinquencies,
  getBostonStock,
  saveBostonStock,
  getShopifyOrders,
  saveShopifyOrders,
  getProductionRemarks,
  addProductionRemark,
  markRemarkAsRead,
  markAllRemarksAsRead,
  defaultUsers,
  bulkAppendDelinquencies,
  resetToSampleDummyData,
  purgeAllDummyDataFromLocalStorage
} from './services/store';
import {
  ShopifyConfig,
  ShopifyDualConfig,
  getStoredShopifyConfig,
  saveStoredShopifyConfig,
  getStoredShopifyDualConfig,
  saveStoredShopifyDualConfig,
  fetchShopifyOrdersFromBothStores,
  fetchSupabaseShopifyOrders,
  updateShopifyOrderStatus
} from './services/shopifyApi';
import {
  fetchLiveDatabaseOrders,
  createOrderAdmin,
  bulkCreateOrdersAdmin,
  updateProductionStatus,
  updateDelinquencyOrder
} from './services/supabaseOrdersService';
import {
  fetchReturns,
  insertReturn,
  updateReturn,
  fetchDailyDispatches,
  insertDailyDispatch,
  updateDailyDispatch,
  fetchTrialPairs,
  insertTrialPair,
  updateTrialPair
} from './services/supabaseReturnsService';
import { normalizeOrderId, orderIdsMatch } from './utils/csvParser';
import { normalizeStage, calculateDelayDays } from './utils/delinquencyUtils';
import { resolveCustomerName, getShopifyAdminOrderUrl } from './utils/customerResolver';
import { supabase } from './services/supabaseClient';
import { addOrderRemark } from './services/orderHistoryService';
import {
  mergeShopifyOrdersIntoDelinquencies,
  convertShopifyOrderToDelinquencyItem,
  convertDelinquencyToShopifyOrder,
  syncShopifyOrdersToSupabase
} from './services/shopifyDashboardBridge';
import { Navbar } from './components/Navbar';
import { DashboardSummary } from './components/DashboardSummary';
import { AdminHomeAnalytics } from './components/AdminHomeAnalytics';
import { DelinquencyView } from './components/DelinquencyView';
import { DispatchView } from './components/DispatchView';
import { LogisticsDashboardView } from './components/LogisticsDashboardView';
import { ReturnsView } from './components/ReturnsView';
import { TrialPairsView } from './components/TrialPairsView';
import { InventoryView } from './components/InventoryView';
import { AdminSidebar } from './components/AdminSidebar';
import { ShopifyView } from './components/ShopifyView';
import { ShopifyConnectModal } from './components/ShopifyConnectModal';
import { ProductionRemarksModal } from './components/ProductionRemarksModal';
import { OrderSummaryModal } from './components/OrderSummaryModal';
import { CustomerCrmView } from './components/CustomerCrmView';
import { ClubbedOrderExplorer } from './components/ClubbedOrderExplorer';
import { TableSchemaCustomizerModal, CustomizableTableKey } from './components/TableSchemaCustomizerModal';
import { LoginModal } from './components/LoginModal';
import { UserManagementModal } from './components/UserManagementModal';
import { AuthPortal } from './components/AuthPortal';
import { ProgressiveWorkflowView } from './components/ProgressiveWorkflowView';
import { initAuthListener, logoutUser } from './services/firebaseAuth';
import { SectionId, SECTION_THEMES, getSectionTheme } from './theme';
import { realtimeSync } from './services/realtimeSync';
import { OrderLookupContext } from './utils/customerResolver';
import { ProductThumbnail } from './components/ProductThumbnail';
import { resolveProductImage, fetchStoreProductImages } from './services/productImageService';
import { uploadWorkshopImage, getAllRemarksHistory } from './services/orderHistoryService';
import {
  Search,
  AlertTriangle,
  Package,
  RotateCcw,
  Footprints,
  ShoppingBag,
  Layers,
  TrendingUp,
  Check,
  Users,
  Sparkles,
  Menu,
  Bell,
  ChevronDown,
  ChevronUp,
  Sliders,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  FolderKanban,
  Scissors,
  Compass,
  ShieldCheck,
  PackageCheck,
  Truck,
  PauseCircle,
  Tag,
  ArrowUpDown,
  Filter,
  X,
  User,
  Camera,
  ImagePlus,
  UploadCloud,
  Loader2,
  Eye,
  Trash2,
  ExternalLink,
  RefreshCw,
  Store,
  MoreHorizontal,
  Image as ImageIcon,
  Boxes,
  LogOut
} from 'lucide-react';

async function compressImageFile(file: File, maxWidth = 1200, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const PRODUCTION_STAGES = [
  'CUTTING',
  'CLOSING',
  'PREPARATION',
  'UPPER',
  'BOTTOM',
  'FINISH',
  'QC',
  'RTD',
  'SHIPPED',
  'ON HOLD'
];

interface StageMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  dotColor: string;
  activeBg: string;
  badgeActiveBg: string;
  iconBg: string;
}

const STAGE_CONFIG_MAP: Record<string, StageMeta> = {
  'CUTTING': {
    label: 'CUTTING',
    icon: Scissors,
    accentColor: 'text-sky-600',
    dotColor: 'bg-sky-500',
    activeBg: 'bg-sky-50 text-sky-950 border-sky-200 font-semibold shadow-2xs',
    badgeActiveBg: 'bg-sky-200/90 text-sky-900 font-bold',
    iconBg: 'bg-sky-100/70 text-sky-700'
  },
  'CLOSING': {
    label: 'CLOSING',
    icon: Layers,
    accentColor: 'text-indigo-600',
    dotColor: 'bg-indigo-500',
    activeBg: 'bg-indigo-50 text-indigo-950 border-indigo-200 font-semibold shadow-2xs',
    badgeActiveBg: 'bg-indigo-200/90 text-indigo-900 font-bold',
    iconBg: 'bg-indigo-100/70 text-indigo-700'
  },
  'PREPARATION': {
    label: 'PREPARATION',
    icon: Compass,
    accentColor: 'text-blue-600',
    dotColor: 'bg-blue-500',
    activeBg: 'bg-blue-50 text-blue-950 border-blue-200 font-semibold shadow-2xs',
    badgeActiveBg: 'bg-blue-200/90 text-blue-900 font-bold',
    iconBg: 'bg-blue-100/70 text-blue-700'
  },
  'UPPER': {
    label: 'UPPER',
    icon: Layers,
    accentColor: 'text-violet-600',
    dotColor: 'bg-violet-500',
    activeBg: 'bg-violet-50 text-violet-950 border-violet-200 font-semibold shadow-2xs',
    badgeActiveBg: 'bg-violet-200/90 text-violet-900 font-bold',
    iconBg: 'bg-violet-100/70 text-violet-700'
  },
  'BOTTOM': {
    label: 'BOTTOM',
    icon: Footprints,
    accentColor: 'text-amber-700',
    dotColor: 'bg-amber-600',
    activeBg: 'bg-amber-50 text-amber-950 border-amber-200 font-semibold shadow-2xs',
    badgeActiveBg: 'bg-amber-200/90 text-amber-900 font-bold',
    iconBg: 'bg-amber-100/70 text-amber-800'
  },
  'FINISH': {
    label: 'FINISH',
    icon: Sparkles,
    accentColor: 'text-teal-600',
    dotColor: 'bg-teal-500',
    activeBg: 'bg-teal-50 text-teal-950 border-teal-200 font-semibold shadow-2xs',
    badgeActiveBg: 'bg-teal-200/90 text-teal-900 font-bold',
    iconBg: 'bg-teal-100/70 text-teal-700'
  },
  'QC': {
    label: 'QC',
    icon: ShieldCheck,
    accentColor: 'text-purple-600',
    dotColor: 'bg-purple-500',
    activeBg: 'bg-purple-50 text-purple-950 border-purple-200 font-semibold shadow-2xs',
    badgeActiveBg: 'bg-purple-200/90 text-purple-900 font-bold',
    iconBg: 'bg-purple-100/70 text-purple-700'
  },
  'RTD': {
    label: 'RTD',
    icon: PackageCheck,
    accentColor: 'text-emerald-600',
    dotColor: 'bg-emerald-500',
    activeBg: 'bg-emerald-50 text-emerald-950 border-emerald-300 font-semibold shadow-2xs',
    badgeActiveBg: 'bg-emerald-200/90 text-emerald-900 font-bold',
    iconBg: 'bg-emerald-100/70 text-emerald-700'
  },
  'SHIPPED': {
    label: 'SHIPPED',
    icon: Truck,
    accentColor: 'text-emerald-700',
    dotColor: 'bg-emerald-600',
    activeBg: 'bg-emerald-50 text-emerald-950 border-emerald-300 font-semibold shadow-2xs',
    badgeActiveBg: 'bg-emerald-200/90 text-emerald-900 font-bold',
    iconBg: 'bg-emerald-100/70 text-emerald-800'
  },
  'ON HOLD': {
    label: 'ON HOLD',
    icon: PauseCircle,
    accentColor: 'text-rose-600',
    dotColor: 'bg-rose-500',
    activeBg: 'bg-rose-50 text-rose-950 border-rose-200 font-semibold shadow-2xs',
    badgeActiveBg: 'bg-rose-200/90 text-rose-900 font-bold',
    iconBg: 'bg-rose-100/70 text-rose-700'
  }
};

const DELAY_REASON_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Upper Material Short': Tag,
  'Sole Short': Footprints,
  'Custom Last': Sliders,
  'Custom Pattern': Scissors,
  'Return Awaited': RotateCcw
};

const DELAY_REASONS = [
  'Upper Material Short',
  'Sole Short',
  'Custom Last',
  'Custom Pattern',
  'Return Awaited'
];

interface ProductionDashboardViewProps {
  currentUser: UserProfile;
  delinquencies: DelinquencyItem[];
  shopifyOrders: ShopifyOrder[];
  onRefresh: () => void;
  onViewOrderSummary?: (orderId: string) => void;
  onUpdateDelinquency?: (item: DelinquencyItem) => Promise<void> | void;
}

const ProductionDashboardView: React.FC<ProductionDashboardViewProps> = ({
  currentUser,
  delinquencies,
  shopifyOrders,
  onRefresh,
  onViewOrderSummary,
  onUpdateDelinquency
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<{ type: 'stage' | 'reason' | 'all'; value: string }>({ type: 'all', value: '' });
  const [cardStates, setCardStates] = useState<Record<string, {
    stage: string;
    reason: string;
    remark: string;
    attachedImage?: string;
    attachedFileName?: string;
    isProcessingImage?: boolean;
  }>>({});
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Search, Sort, and Filter Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'delay-desc' | 'delay-asc' | 'date-desc' | 'date-asc' | 'id-desc' | 'id-asc' | 'stage-seq'>('delay-desc');
  const [filterStore, setFilterStore] = useState<'ALL' | 'Global' | 'LLC'>('ALL');
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | 'critical' | 'moderate' | 'minor'>('ALL');
  const [filterStage, setFilterStage] = useState<string>('ALL');
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  const [, setCatalogVersion] = useState(0);

  useEffect(() => {
    fetchStoreProductImages();
    const handleImagesUpdated = () => setCatalogVersion(v => v + 1);
    window.addEventListener('blkbrd_product_images_updated', handleImagesUpdated);
    return () => window.removeEventListener('blkbrd_product_images_updated', handleImagesUpdated);
  }, []);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterStore !== 'ALL') count++;
    if (filterSeverity !== 'ALL') count++;
    if (filterStage !== 'ALL') count++;
    return count;
  }, [filterStore, filterSeverity, filterStage]);

  const resetAllControls = () => {
    setSearchQuery('');
    setSortBy('delay-desc');
    setFilterStore('ALL');
    setFilterSeverity('ALL');
    setFilterStage('ALL');
  };

  const delayedQueueOrders = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return delinquencies.filter(item => {
      const activeStage = (cardStates[item.orderId]?.stage || item.currentStage || '').toLowerCase();
      const isRtdOrShipped = activeStage === 'rtd' || activeStage === 'shipped';
      const isPastExpected = item.expectedDate && item.expectedDate < today;
      const isExplicitlyDelayed = (item.orderStatus || '').toLowerCase() === 'delayed' || (item.daysDelayed || 0) > 0;
      
      return !isRtdOrShipped && (isPastExpected || isExplicitlyDelayed);
    });
  }, [delinquencies, cardStates]);

  const displayedOrders = useMemo(() => {
    let list: DelinquencyItem[];

    // 1. Sidebar Stage Filter vs Reason vs All Delayed Queue
    if (selectedFilter.type === 'stage') {
      const targetStage = selectedFilter.value.trim().toUpperCase();
      // Directly pull from all workshop delinquencies so selected stage immediately shows all its active orders
      list = delinquencies.filter(o => {
        const itemStage = (cardStates[o.orderId]?.stage || o.currentStage || '').trim().toUpperCase();
        return itemStage === targetStage;
      });
    } else if (selectedFilter.type === 'reason') {
      list = delinquencies.filter(o => {
        const rem = (o.remarks || o.delayReason || '').toLowerCase();
        return rem.includes(selectedFilter.value.toLowerCase());
      });
    } else {
      // 'all': Show active delayed queue or all production orders if none delayed
      list = delayedQueueOrders.length > 0 ? delayedQueueOrders : delinquencies;
    }

    // 2. Search Query (Order #, Customer Name, Model/Article, Leather, Delay Reason, Remarks)
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(item => {
        const orderIdMatch = (item.orderId || '').toLowerCase().includes(q) || ('#' + (item.orderId || '')).toLowerCase().includes(q);
        const customerMatch = (item.customerName || '').toLowerCase().includes(q);
        const resolvedCustomer = resolveCustomerName(item.orderId, item.customerName, { shopifyOrders }).toLowerCase().includes(q);
        const modelMatch = (item.product || (item as any).shoeModel || '').toLowerCase().includes(q);
        const leatherMatch = ((item as any).leather || '').toLowerCase().includes(q);
        const remarksMatch = (item.remarks || '').toLowerCase().includes(q);
        const reasonMatch = (item.delayReason || '').toLowerCase().includes(q);
        const storeMatch = (item.storeTab || '').toLowerCase().includes(q);

        return orderIdMatch || customerMatch || resolvedCustomer || modelMatch || leatherMatch || remarksMatch || reasonMatch || storeMatch;
      });
    }

    // 3. Store Filter
    if (filterStore !== 'ALL') {
      list = list.filter(item => {
        const isLlc = item.storeTab === 'LLC' || String(item.orderId || '').toUpperCase().startsWith('US');
        if (filterStore === 'LLC') return isLlc;
        if (filterStore === 'Global') return !isLlc;
        return (item.storeTab || '').toLowerCase() === filterStore.toLowerCase();
      });
    }

    // 4. Stage Filter (from top dropdown if used)
    if (filterStage !== 'ALL') {
      list = list.filter(item => {
        const activeStage = (cardStates[item.orderId]?.stage || item.currentStage || '').trim().toUpperCase();
        return activeStage === filterStage;
      });
    }

    // 5. Delay Severity Filter
    if (filterSeverity !== 'ALL') {
      list = list.filter(item => {
        const computedDelay = item.orderDate
          ? calculateDelayDays(item.orderDate, item.expectedDate)
          : (item.daysDelayed || 1);
        const days = Math.max(1, computedDelay || item.daysDelayed || 1);

        if (filterSeverity === 'critical') return days >= 14;
        if (filterSeverity === 'moderate') return days >= 7 && days < 14;
        if (filterSeverity === 'minor') return days < 7;
        return true;
      });
    }

    // 6. Sorting
    const sorted = [...list].sort((a, b) => {
      const delayA = Math.max(1, (a.orderDate ? calculateDelayDays(a.orderDate, a.expectedDate) : a.daysDelayed) || 1);
      const delayB = Math.max(1, (b.orderDate ? calculateDelayDays(b.orderDate, b.expectedDate) : b.daysDelayed) || 1);

      if (sortBy === 'delay-desc') return delayB - delayA;
      if (sortBy === 'delay-asc') return delayA - delayB;

      if (sortBy === 'date-desc') {
        const dateA = a.orderDate || a.expectedDate || '';
        const dateB = b.orderDate || b.expectedDate || '';
        return dateB.localeCompare(dateA);
      }
      if (sortBy === 'date-asc') {
        const dateA = a.orderDate || a.expectedDate || '';
        const dateB = b.orderDate || b.expectedDate || '';
        return dateA.localeCompare(dateB);
      }

      if (sortBy === 'id-desc') {
        const numA = parseInt(a.orderId.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.orderId.replace(/\D/g, ''), 10) || 0;
        return numB - numA;
      }
      if (sortBy === 'id-asc') {
        const numA = parseInt(a.orderId.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.orderId.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      }

      if (sortBy === 'stage-seq') {
        const stageAVal = (cardStates[a.orderId]?.stage || a.currentStage || '').toUpperCase();
        const stageBVal = (cardStates[b.orderId]?.stage || b.currentStage || '').toUpperCase();
        const stageA = PRODUCTION_STAGES.indexOf(stageAVal);
        const stageB = PRODUCTION_STAGES.indexOf(stageBVal);
        return (stageA >= 0 ? stageA : 99) - (stageB >= 0 ? stageB : 99);
      }

      return 0;
    });

    return sorted;
  }, [delinquencies, delayedQueueOrders, cardStates, selectedFilter, searchQuery, filterStore, filterStage, filterSeverity, sortBy]);

  const counts = useMemo(() => {
    const stageMap: Record<string, number> = {};
    const reasonMap: Record<string, number> = {};

    PRODUCTION_STAGES.forEach(s => { stageMap[s] = 0; });
    DELAY_REASONS.forEach(r => { reasonMap[r] = 0; });

    delinquencies.forEach(item => {
      const activeStage = (cardStates[item.orderId]?.stage || item.currentStage || '').trim().toUpperCase();
      const st = PRODUCTION_STAGES.includes(activeStage) ? activeStage : 'CUTTING';
      if (stageMap[st] !== undefined) stageMap[st]++;
      else stageMap['CUTTING'] = (stageMap['CUTTING'] || 0) + 1;

      const rem = item.remarks || item.delayReason || '';
      DELAY_REASONS.forEach(r => {
        if (rem.toLowerCase().includes(r.toLowerCase())) {
          reasonMap[r]++;
        }
      });
    });

    return { stages: stageMap, reasons: reasonMap };
  }, [delinquencies, cardStates]);

  const toggleExpand = (orderId: string) => {
    setExpandedOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const getStateForOrder = (orderId: string, currentStage: string, remarks: string) => {
    const rawUpper = (currentStage || '').trim().toUpperCase();
    const matchedStage = PRODUCTION_STAGES.includes(rawUpper) ? rawUpper : 'CUTTING';
    if (!cardStates[orderId]) {
      return {
        stage: matchedStage,
        reason: DELAY_REASONS[0],
        remark: '',
        attachedImage: undefined,
        attachedFileName: undefined,
        isProcessingImage: false
      };
    }
    return {
      ...cardStates[orderId],
      stage: matchedStage // Strictly track live currentStage from authoritative database
    };
  };

  const updateCardState = (
    orderId: string,
    field: string,
    value: any,
    currentStage: string,
    remarks: string
  ) => {
    const current = getStateForOrder(orderId, currentStage, remarks);
    setCardStates(prev => ({
      ...prev,
      [orderId]: { ...current, [field]: value }
    }));
  };

  const handleStageChange = async (item: DelinquencyItem, newStage: string) => {
    setSavingId(item.orderId);
    try {
      const isRtd = newStage === 'RTD' || newStage === 'Ready to Ship';
      const isShipped = newStage === 'Shipped';
      const isHold = newStage.toUpperCase() === 'ON HOLD';

      const orderStatus: 'Ready to Ship' | 'Shipped' | 'Delayed' | 'In Production' =
        isShipped ? 'Shipped' : isRtd ? 'Ready to Ship' : isHold ? 'Delayed' : 'In Production';

      const actionRequired = isRtd
        ? 'Ready to Dispatch (RTD)'
        : isShipped
        ? 'Dispatched'
        : isHold
        ? 'On Hold: Workshop Review'
        : `Production Workshop (${newStage})`;

      const updatedItem: DelinquencyItem = {
        ...item,
        currentStage: newStage,
        orderStatus,
        actionRequired
      };

      // 1. Authoritative Backend / Database update first
      if (onUpdateDelinquency) {
        await onUpdateDelinquency(updatedItem);
      }

      setFeedback(`Order #${item.orderId.replace(/^#/, '')} transitioned to ${newStage} — live across all users.`);
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      alert(`Failed to update stage in database: ${err?.message || err}`);
    } finally {
      setSavingId(null);
    }
  };

  const handleImageSelected = async (orderId: string, file: File, currentStage: string, remarks: string) => {
    try {
      updateCardState(orderId, 'isProcessingImage', true, currentStage, remarks);
      const compressedDataUrl = await compressImageFile(file, 1200, 0.85);
      setCardStates(prev => {
        const current = getStateForOrder(orderId, currentStage, remarks);
        return {
          ...prev,
          [orderId]: {
            ...current,
            attachedImage: compressedDataUrl,
            attachedFileName: file.name,
            isProcessingImage: false
          }
        };
      });
    } catch (err: any) {
      alert(`Could not process image: ${err.message}`);
      updateCardState(orderId, 'isProcessingImage', false, currentStage, remarks);
    }
  };

  const handleRemoveAttachedImage = (orderId: string, currentStage: string, remarks: string) => {
    setCardStates(prev => {
      const current = getStateForOrder(orderId, currentStage, remarks);
      return {
        ...prev,
        [orderId]: {
          ...current,
          attachedImage: undefined,
          attachedFileName: undefined,
          isProcessingImage: false
        }
      };
    });
  };

  const handleSaveOrder = async (item: DelinquencyItem) => {
    const state = getStateForOrder(item.orderId, item.currentStage, item.remarks);
    setSavingId(item.orderId);

    try {
      const timestamp = new Date().toLocaleString();
      const isHold = (state.stage || '').toUpperCase() === 'ON HOLD';
      const baseNote = isHold 
        ? `Stage: ON HOLD (${state.reason}). Note: ${state.remark}`.trim()
        : `Stage: ${state.stage}. Note: ${state.remark}`.trim();
      const finalRemark = `[${timestamp}] ${baseNote}`.trim();

      // If production artisan attached a live camera capture / product photo
      if (state.attachedImage) {
        try {
          await uploadWorkshopImage({
            orderId: item.orderId,
            stage: state.stage,
            remark: state.remark,
            imageBase64: state.attachedImage,
            fileName: state.attachedFileName,
            authorName: currentUser.name,
            authorRole: currentUser.role,
            storeTab: item.storeTab || 'Global'
          });
        } catch (imgErr) {
          console.warn('Workshop image upload notice:', imgErr);
        }
      }

      await updateProductionStatus(
        item.orderId,
        state.stage,
        finalRemark,
        { name: currentUser.name, role: currentUser.role },
        item.storeTab || 'Global'
      );

      try {
        await addOrderRemark(
          item.orderId,
          finalRemark,
          currentUser.name,
          state.stage,
          state.attachedImage
        );
      } catch (histErr) {
        console.warn('Timeline remark log notice:', histErr);
      }

      // Optimistically update local storage so store immediately reflects new stage
      const currentList = getDelinquencies();
      const isRtd = state.stage === 'RTD' || state.stage === 'Ready to Ship';
      const isShipped = state.stage === 'Shipped';
      const isOrderOnHold = (state.stage || '').toUpperCase() === 'ON HOLD';

      const orderStatus: 'Ready to Ship' | 'Shipped' | 'Delayed' | 'In Production' =
        isShipped ? 'Shipped' : isRtd ? 'Ready to Ship' : isOrderOnHold ? 'Delayed' : 'In Production';

      const actionRequired = isRtd
        ? 'Ready to Dispatch (RTD)'
        : isShipped
        ? 'Dispatched'
        : isOrderOnHold
        ? 'On Hold: Workshop Review'
        : `Production Workshop (${state.stage})`;

      const updatedItem: DelinquencyItem = {
        ...item,
        currentStage: state.stage,
        remarks: finalRemark,
        orderStatus,
        actionRequired
      };

      let foundInLocal = false;
      const updatedList = currentList.map(d => {
        if (orderIdsMatch(d.orderId, item.orderId)) {
          foundInLocal = true;
          return {
            ...d,
            ...updatedItem,
            id: d.id || updatedItem.id,
            orderId: d.orderId
          };
        }
        return d;
      });
      if (!foundInLocal) {
        updatedList.unshift(updatedItem);
      }
      saveDelinquencies(updatedList);

      // Immediately propagate to parent React state, database, and all views
      if (onUpdateDelinquency) {
        await onUpdateDelinquency(updatedItem);
      }

      // Clear the attached image from card state on successful save
      setCardStates(prev => ({
        ...prev,
        [item.orderId]: {
          ...state,
          remark: '',
          attachedImage: undefined,
          attachedFileName: undefined,
          isProcessingImage: false
        }
      }));

      setFeedback(`Order #${item.orderId.replace(/^#/, '')} updated to ${state.stage}${state.attachedImage ? ' with real workshop photo' : ''} & synced across all views.`);
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      alert(`Failed to save progress: ${err.message}`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="relative flex flex-col lg:flex-row min-h-[calc(100vh-140px)] bg-neutral-100/70 font-sans">
      {/* Mobile & Tablet Slide-over Backdrop */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-neutral-950/60 backdrop-blur-xs lg:hidden transition-opacity duration-300"
          onClick={() => setMobileDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: Desktop Sticky Panel + Mobile/Tablet Slide-over Drawer */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:sticky lg:top-16 lg:self-start lg:h-[calc(100vh-4.5rem)] lg:z-20 lg:shadow-none lg:border-r border-neutral-200 flex flex-col shrink-0
          ${mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${sidebarOpen ? 'lg:w-64' : 'lg:w-16'}
        `}
      >
        <div className="p-3.5 border-b border-neutral-200/80 bg-neutral-50/50 flex items-center justify-between gap-2">
          {sidebarOpen ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-neutral-900 text-amber-400 flex items-center justify-center shrink-0 shadow-2xs">
                <FolderKanban className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-neutral-900 uppercase tracking-wider block truncate">Workshop Hub</span>
                <span className="text-[9px] text-neutral-500 tracking-tight block truncate">Workflow & Stages</span>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-7 h-7 rounded-lg bg-neutral-900 text-amber-400 flex items-center justify-center shrink-0 shadow-2xs" title="Workshop Hub">
              <FolderKanban className="w-3.5 h-3.5" />
            </div>
          )}

          {/* Close button on Mobile/Tablet */}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-neutral-200/70 text-neutral-500 hover:text-neutral-800 transition cursor-pointer"
            title="Close Drawer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Desktop Collapse/Expand Toggle */}
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:block p-1.5 rounded-lg hover:bg-neutral-200/70 text-neutral-500 hover:text-neutral-800 transition cursor-pointer shrink-0 ml-auto"
            title={sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
            aria-label={sidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-4 text-xs">
          {/* Main Delayed Queue Filter */}
          <button
            type="button"
            onClick={() => {
              setSelectedFilter({ type: 'all', value: '' });
              setMobileDrawerOpen(false);
            }}
            title={!sidebarOpen ? `Delayed Queue (${delayedQueueOrders.length})` : undefined}
            className={`w-full flex items-center ${sidebarOpen ? 'justify-between px-3 py-2.5' : 'justify-center p-2.5'} rounded-xl font-medium transition cursor-pointer group ${
              selectedFilter.type === 'all'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'bg-white hover:bg-neutral-100/90 text-neutral-700 border border-neutral-200/70'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`p-1 rounded-lg ${selectedFilter.type === 'all' ? 'bg-amber-400/20 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              </div>
              {sidebarOpen && <span className="font-semibold text-xs tracking-tight truncate">Delayed Queue</span>}
            </div>
            {sidebarOpen ? (
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ${
                selectedFilter.type === 'all' ? 'bg-neutral-800 text-amber-300 border border-neutral-700' : 'bg-neutral-100 text-neutral-700 border border-neutral-200/60'
              }`}>
                {delayedQueueOrders.length}
              </span>
            ) : (
              delayedQueueOrders.length > 0 && (
                <span className="sr-only">{delayedQueueOrders.length}</span>
              )
            )}
          </button>

          {/* Workflow Stages */}
          <div className="space-y-1">
            {sidebarOpen && (
              <div className="px-2 py-1 flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Stages</span>
                <span className="text-[9px] font-mono text-neutral-400">9 Stages</span>
              </div>
            )}
            <div className="space-y-1">
              {PRODUCTION_STAGES.map(stage => {
                const count = counts.stages[stage] || 0;
                const isSelected = selectedFilter.type === 'stage' && selectedFilter.value === stage;
                const meta = STAGE_CONFIG_MAP[stage] || {
                  label: stage,
                  icon: Layers,
                  accentColor: 'text-neutral-600',
                  dotColor: 'bg-neutral-400',
                  activeBg: 'bg-neutral-100 text-neutral-900 border-neutral-200 font-semibold',
                  badgeActiveBg: 'bg-neutral-200 text-neutral-900 font-bold',
                  iconBg: 'bg-neutral-100 text-neutral-600'
                };
                const IconComponent = meta.icon;

                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => {
                      setSelectedFilter({ type: 'stage', value: stage });
                      setMobileDrawerOpen(false);
                    }}
                    title={!sidebarOpen ? `${stage} (${count})` : undefined}
                    className={`w-full flex items-center ${sidebarOpen ? 'justify-between px-2.5 py-1.5' : 'justify-center p-2'} rounded-xl transition cursor-pointer text-left border ${
                      isSelected
                        ? meta.activeBg
                        : 'border-transparent text-neutral-600 hover:bg-neutral-100/80 hover:text-neutral-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1 rounded-lg shrink-0 transition ${
                        isSelected ? meta.iconBg : 'bg-neutral-100/70 text-neutral-500'
                      }`}>
                        <IconComponent className={`w-3.5 h-3.5 ${isSelected ? meta.accentColor : ''}`} />
                      </div>
                      {sidebarOpen && (
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotColor}`} />
                          <span className="text-[11px] font-bold tracking-tight uppercase truncate">{stage}</span>
                        </div>
                      )}
                    </div>
                    {sidebarOpen && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md shrink-0 transition ${
                        isSelected
                          ? meta.badgeActiveBg
                          : count > 0
                            ? 'bg-neutral-100 text-neutral-800 font-medium'
                            : 'text-neutral-400 font-normal'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exception / Delay Filters */}
          <div className="space-y-1 pt-2.5 border-t border-neutral-200/70">
            {sidebarOpen && (
              <div className="px-2 py-1">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Delay Reasons</span>
              </div>
            )}
            <div className="space-y-1">
              {DELAY_REASONS.map(reason => {
                const count = counts.reasons[reason] || 0;
                const isSelected = selectedFilter.type === 'reason' && selectedFilter.value === reason;
                const ReasonIcon = DELAY_REASON_ICONS[reason] || Tag;

                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => {
                      setSelectedFilter({ type: 'reason', value: reason });
                      setMobileDrawerOpen(false);
                    }}
                    title={!sidebarOpen ? `${reason} (${count})` : undefined}
                    className={`w-full flex items-center ${sidebarOpen ? 'justify-between px-2.5 py-1.5' : 'justify-center p-2'} rounded-xl transition cursor-pointer text-left border ${
                      isSelected
                        ? 'bg-amber-50 text-amber-950 font-semibold border-amber-200 shadow-2xs'
                        : 'border-transparent text-neutral-600 hover:bg-neutral-100/80 hover:text-neutral-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1 rounded-lg shrink-0 transition ${
                        isSelected ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100/70 text-neutral-500'
                      }`}>
                        <ReasonIcon className="w-3.5 h-3.5" />
                      </div>
                      {sidebarOpen && (
                        <span className="text-[11px] font-medium tracking-tight truncate" title={reason}>
                          {reason}
                        </span>
                      )}
                    </div>
                    {sidebarOpen && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md shrink-0 ${
                        isSelected
                          ? 'bg-amber-200/90 text-amber-950 font-bold'
                          : count > 0
                            ? 'bg-neutral-100 text-neutral-800 font-medium'
                            : 'text-neutral-400 font-normal'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6 space-y-3.5 sm:space-y-4 max-w-4xl mx-auto w-full">
        {/* Top Header Banner */}
        <div className="px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl bg-neutral-900 text-white flex items-center justify-between shadow-xs gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden p-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-amber-400 cursor-pointer shrink-0 transition flex items-center gap-1.5 text-xs font-semibold"
              title="Open Stages Hub"
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Stages</span>
            </button>
            <div className="flex items-center gap-2 min-w-0 truncate">
              <Layers className="w-4 h-4 text-amber-400 shrink-0 hidden sm:inline" />
              <h2 className="text-xs sm:text-sm font-bold tracking-wider uppercase text-white truncate">
                {selectedFilter.type === 'all' ? 'Active Delayed Queue' : `Filter: ${selectedFilter.value}`}
              </h2>
            </div>
          </div>
          <span className="text-[10px] sm:text-[11px] font-mono px-2.5 py-1 rounded-full bg-neutral-800 text-amber-300 border border-neutral-700 font-semibold shrink-0">
            {displayedOrders.length} {displayedOrders.length === 1 ? 'Order' : 'Orders'}
          </span>
        </div>

        {/* Quick Horizontal Stage Scroller for Mobile & Tablet */}
        <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none touch-pan-x">
          <button
            type="button"
            onClick={() => setSelectedFilter({ type: 'all', value: '' })}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition cursor-pointer border shrink-0 ${
              selectedFilter.type === 'all'
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
            }`}
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${selectedFilter.type === 'all' ? 'text-amber-400' : 'text-amber-600'}`} />
            <span>ALL</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${selectedFilter.type === 'all' ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700'}`}>
              {delayedQueueOrders.length}
            </span>
          </button>
          {PRODUCTION_STAGES.map(stage => {
            const count = counts.stages[stage] || 0;
            const isSelected = selectedFilter.type === 'stage' && selectedFilter.value === stage;
            const meta = STAGE_CONFIG_MAP[stage];
            const Icon = meta?.icon || Layers;
            return (
              <button
                key={stage}
                type="button"
                onClick={() => setSelectedFilter({ type: 'stage', value: stage })}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition cursor-pointer border shrink-0 ${
                  isSelected
                    ? meta?.activeBg || 'bg-blue-50 text-blue-900 border-blue-200 shadow-xs'
                    : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? meta?.accentColor : 'text-neutral-400'}`} />
                <span>{stage}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  isSelected ? meta?.badgeActiveBg || 'bg-blue-200 text-blue-950 font-bold' : 'bg-neutral-100 text-neutral-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {feedback && (
          <div className="bg-emerald-950 text-emerald-200 border border-emerald-800 text-xs font-medium py-2.5 px-3.5 rounded-xl flex items-center gap-2 shadow-2xs">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Search, Sort, and Filter Controls Bar */}
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-neutral-200 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5">
            {/* 1. Search Box */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by Order #, customer, model, leather..."
                className="w-full pl-9 pr-8 py-2.5 sm:py-2 text-xs bg-neutral-50/80 hover:bg-neutral-50 focus:bg-white border border-neutral-200 focus:border-neutral-900 rounded-xl transition placeholder:text-neutral-400 outline-none text-neutral-900 min-h-[40px] sm:min-h-0"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-neutral-200 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 2. Sort & Filter row */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Sort Dropdown */}
              <div className="relative flex-1 sm:flex-initial flex items-center">
                <div className="absolute left-2.5 pointer-events-none flex items-center gap-1 text-neutral-500">
                  <ArrowUpDown className="w-3.5 h-3.5 text-neutral-600" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 hidden md:inline">Sort</span>
                </div>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="w-full sm:w-auto pl-8 md:pl-16 pr-8 py-2.5 sm:py-2 text-xs font-semibold bg-neutral-50/80 hover:bg-neutral-50 focus:bg-white border border-neutral-200 focus:border-neutral-900 rounded-xl text-neutral-800 transition outline-none cursor-pointer appearance-none min-h-[40px] sm:min-h-0"
                  title="Sort orders"
                >
                  <option value="delay-desc">Most Delayed (Days ↓)</option>
                  <option value="delay-asc">Least Delayed (Days ↑)</option>
                  <option value="date-desc">Newest Order Date</option>
                  <option value="date-asc">Oldest Order Date</option>
                  <option value="id-desc">Order # (High to Low)</option>
                  <option value="id-asc">Order # (Low to High)</option>
                  <option value="stage-seq">Stage Sequence (CUTTING → ON HOLD)</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 pointer-events-none" />
              </div>

              {/* Filter Toggle Button */}
              <button
                type="button"
                onClick={() => setIsFilterExpanded(!isFilterExpanded)}
                className={`flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 text-xs font-bold rounded-xl border transition cursor-pointer min-h-[40px] sm:min-h-0 shrink-0 ${
                  isFilterExpanded || activeFiltersCount > 0
                    ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                    : 'bg-neutral-50/80 hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                }`}
                title="Toggle filter parameters"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Filter</span>
                {activeFiltersCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-400 text-neutral-950 font-bold text-[10px] flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
                {isFilterExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Expanded Filter Panel */}
          {isFilterExpanded && (
            <div className="pt-3 border-t border-neutral-100 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 animate-in fade-in">
              {/* Store Filter */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-500 tracking-wider mb-1">
                  Store Channel
                </label>
                <select
                  value={filterStore}
                  onChange={e => setFilterStore(e.target.value as any)}
                  className="w-full text-xs px-2.5 py-2 sm:py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-800 font-medium focus:border-neutral-900 outline-none cursor-pointer min-h-[38px] sm:min-h-0"
                >
                  <option value="ALL">All Stores (Global & LLC)</option>
                  <option value="Global">Global</option>
                  <option value="LLC">LLC (USA)</option>
                </select>
              </div>

              {/* Delay Severity Filter */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-500 tracking-wider mb-1">
                  Delay Severity
                </label>
                <select
                  value={filterSeverity}
                  onChange={e => setFilterSeverity(e.target.value as any)}
                  className="w-full text-xs px-2.5 py-2 sm:py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-800 font-medium focus:border-neutral-900 outline-none cursor-pointer min-h-[38px] sm:min-h-0"
                >
                  <option value="ALL">All Delay Levels</option>
                  <option value="critical">Critical (≥14 Days)</option>
                  <option value="moderate">Moderate (7-13 Days)</option>
                  <option value="minor">Minor (&lt;7 Days)</option>
                </select>
              </div>

              {/* Stage Filter */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-500 tracking-wider mb-1">
                  STAGE
                </label>
                <select
                  value={filterStage}
                  onChange={e => setFilterStage(e.target.value)}
                  className="w-full text-xs px-2.5 py-2 sm:py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-800 font-semibold uppercase focus:border-neutral-900 outline-none cursor-pointer min-h-[38px] sm:min-h-0"
                >
                  <option value="ALL">ALL STAGES</option>
                  {PRODUCTION_STAGES.map(st => (
                    <option key={st} value={st} className="font-semibold uppercase">
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Active Filter Chips & Reset Bar */}
          {(searchQuery || activeFiltersCount > 0 || sortBy !== 'delay-desc') && (
            <div className="pt-2 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mr-1">Active:</span>
                {searchQuery && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-semibold">
                    Search: &ldquo;{searchQuery}&rdquo;
                    <button type="button" onClick={() => setSearchQuery('')} className="hover:text-blue-950 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filterStore !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-800 border border-neutral-200 text-[11px] font-medium">
                    Store: {filterStore === 'LLC' ? 'LLC (USA)' : 'Global'}
                    <button type="button" onClick={() => setFilterStore('ALL')} className="hover:text-neutral-950 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filterSeverity !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-medium">
                    Severity: {filterSeverity}
                    <button type="button" onClick={() => setFilterSeverity('ALL')} className="hover:text-amber-950 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filterStage !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-900 border border-indigo-200 text-[11px] font-bold uppercase">
                    Stage: {filterStage}
                    <button type="button" onClick={() => setFilterStage('ALL')} className="hover:text-indigo-950 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {sortBy !== 'delay-desc' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200 text-[11px] font-medium">
                    Sorted
                    <button type="button" onClick={() => setSortBy('delay-desc')} className="hover:text-neutral-950 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={resetAllControls}
                className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-900 underline underline-offset-2 cursor-pointer ml-auto"
              >
                Reset all
              </button>
            </div>
          )}
        </div>

        {displayedOrders.length === 0 ? (
          <div className="p-10 sm:p-14 text-center rounded-2xl space-y-3 bg-white border border-neutral-200 shadow-2xs">
            <Sparkles className="w-6 h-6 text-amber-500 mx-auto" />
            <h3 className="text-xs sm:text-sm font-bold text-neutral-800">No Orders Match Current Criteria</h3>
            <p className="text-[11px] sm:text-xs text-neutral-500 max-w-sm mx-auto">
              {searchQuery || activeFiltersCount > 0 
                ? 'Try clearing your search query or adjusting active filters to see more orders.' 
                : 'All orders matching this view have reached RTD or are on schedule.'}
            </p>
            {(searchQuery || activeFiltersCount > 0 || selectedFilter.type !== 'all') && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    resetAllControls();
                    setSelectedFilter({ type: 'all', value: '' });
                  }}
                  className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition cursor-pointer min-h-[38px]"
                >
                  Clear All Filters & Show Delayed Queue
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-3.5">
            {displayedOrders.map(item => {
              const currentState = getStateForOrder(item.orderId, item.currentStage, item.remarks);
              const isSaving = savingId === item.orderId;
              const isOnHold = (currentState.stage || '').toUpperCase() === 'ON HOLD';
              const isExpanded = !!expandedOrders[item.orderId];
              const matchingShopify = shopifyOrders.find(s => orderIdsMatch(s.orderNumber, item.orderId));

              const cleanId = (item.orderId || '').replace(/^#/, '').trim();
              const isLlc = item.storeTab === 'LLC' || matchingShopify?.storeAccount === 'LLC' || cleanId.toUpperCase().startsWith('US');
              const shopifyAdminUrl = getShopifyAdminOrderUrl(item.orderId, matchingShopify?.id, isLlc ? 'LLC' : 'Global');

              const computedDelay = item.orderDate 
                ? calculateDelayDays(item.orderDate, item.expectedDate) 
                : (item.daysDelayed || 1);
              const displayDelayDays = Math.max(1, computedDelay || item.daysDelayed || 1);
              const resolvedCustomer = resolveCustomerName(
                item.orderId,
                item.customerName || item.clientName,
                { shopifyOrders, delinquencies }
              );

              return (
                <div 
                  key={item.id || item.orderId} 
                  className="relative bg-white rounded-2xl p-3.5 sm:p-4 border border-neutral-200 shadow-2xs space-y-3 transition hover:border-neutral-300"
                >
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-neutral-100 flex-wrap sm:flex-nowrap">
                    {/* Top Left: Customer icon with customer name */}
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 max-w-[55%]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <User className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                        <span 
                          className="font-bold text-xs text-neutral-950 truncate tracking-tight hover:text-neutral-700 transition" 
                          title={resolvedCustomer || 'Customer'}
                        >
                          {resolvedCustomer || 'Valued Client'}
                        </span>
                      </div>
                    </div>

                    {/* Top Right: Order number dropdown, shopify link, delay days badge at extreme right corner */}
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.orderId)}
                        className="font-mono font-bold text-xs text-neutral-900 bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 rounded-lg border border-neutral-200 flex items-center gap-1 cursor-pointer transition shrink-0"
                        title="Tap to expand full details"
                      >
                        <span>#{item.orderId}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3 text-neutral-500" /> : <ChevronDown className="w-3 h-3 text-neutral-500" />}
                      </button>

                      <a
                        href={shopifyAdminUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100/90 active:bg-emerald-200/80 border border-emerald-300/80 shadow-2xs hover:shadow-xs transition-all duration-150 shrink-0 cursor-pointer"
                        title={`Open standalone order view for #${item.orderId} on Shopify Admin`}
                      >
                        <ShoppingBag className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span className="font-medium">Shopify</span>
                        <ExternalLink className="w-2.5 h-2.5 text-emerald-600 opacity-80 group-hover:opacity-100 shrink-0" />
                      </a>

                      {/* App notification-style round red delay badge with pulse blink animation */}
                      <span 
                        className="absolute -top-2.5 -right-2 text-[10px] sm:text-[10.5px] font-mono font-black px-2 py-0.5 rounded-full bg-red-600 text-white border-2 border-white shadow-md flex items-center justify-center gap-1 shrink-0 z-10 animate-pulse"
                        title={`Delayed by ${displayDelayDays} ${displayDelayDays === 1 ? 'day' : 'days'}`}
                      >
                        <AlertTriangle className="w-2.5 h-2.5 text-white stroke-[2.5]" />
                        <span>+{displayDelayDays}d</span>
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-3.5 sm:p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80 space-y-3 text-[11px] animate-fade-in shadow-2xs">
                      {/* Sleek Inline Ordered & Expected Dates Bar */}
                      <div className="flex items-center flex-wrap gap-x-3.5 gap-y-1 bg-white px-3 py-1.5 rounded-xl border border-neutral-200/70 text-xs">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="text-[10px] uppercase font-bold text-neutral-400">Ordered Date:</span>
                          <span className="font-mono font-semibold text-neutral-900">{item.orderDate || '—'}</span>
                        </div>
                        <span className="text-neutral-300 hidden xs:inline">•</span>
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="text-[10px] uppercase font-bold text-neutral-400">Expected Date:</span>
                          <span className="font-mono font-semibold text-neutral-900">{item.expectedDate || '—'}</span>
                        </div>
                      </div>

                      {/* Customer Contact & Shipping Details */}
                      {(matchingShopify?.phone || matchingShopify?.customerEmail || item.shippingMethod || matchingShopify?.shippingMethod || matchingShopify?.address) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-neutral-700 bg-white/70 p-2.5 rounded-xl border border-neutral-200/60">
                          {matchingShopify?.phone && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-neutral-400 text-[9px] uppercase font-bold">Phone:</span>
                              <span className="font-mono text-neutral-900 font-medium">{matchingShopify.phone}</span>
                            </div>
                          )}
                          {matchingShopify?.customerEmail && (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-neutral-400 text-[9px] uppercase font-bold">Email:</span>
                              <span className="font-mono text-neutral-900 truncate">{matchingShopify.customerEmail}</span>
                            </div>
                          )}
                          {(item.shippingMethod || matchingShopify?.shippingMethod) && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-neutral-400 text-[9px] uppercase font-bold">Shipping:</span>
                              <span className="font-semibold text-neutral-900 flex items-center gap-1">
                                <Truck className="w-3 h-3 text-neutral-500" />
                                {item.shippingMethod || matchingShopify?.shippingMethod}
                              </span>
                            </div>
                          )}
                          {matchingShopify?.address && (
                            <div className="sm:col-span-2 flex items-start gap-1.5">
                              <span className="text-neutral-400 text-[9px] uppercase font-bold shrink-0 mt-0.5">Address:</span>
                              <span className="text-neutral-800 text-[10.5px] leading-tight">{matchingShopify.address}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Line Items & Custom Craftsman Specifications */}
                      {(() => {
                        const lineItems = item.lineItemDetails || matchingShopify?.lineItemDetails || [];
                        const customSpecs = item.customSpecifications || matchingShopify?.customSpecifications || {};
                        const craftsmanNote = item.craftsmanNotes || matchingShopify?.craftsmanNotes || '';
                        const shopifyNote = item.shopifyNotes || matchingShopify?.notes || '';

                        return (
                          <div className="space-y-2.5 pt-2 border-t border-neutral-200/70">
                            {/* Craftsman Notes Banner */}
                            {craftsmanNote && (
                              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 shadow-2xs space-y-1">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                                  <span className="uppercase font-mono tracking-wider">Craftsman Notes (Artisan Instructions)</span>
                                </div>
                                <div className="text-xs font-medium text-amber-950 bg-white/70 p-2 rounded-lg border border-amber-200">
                                  {craftsmanNote}
                                </div>
                              </div>
                            )}

                            {/* Shopify Admin Notes */}
                            {shopifyNote && (
                              <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-blue-950 space-y-1">
                                <div className="flex items-center gap-1 text-[10px] font-bold uppercase font-mono tracking-wider text-blue-800">
                                  <MessageSquare className="w-3 h-3 text-blue-600" />
                                  <span>Shopify Order Notes:</span>
                                </div>
                                <div className="text-[11px] font-mono text-neutral-800 whitespace-pre-line bg-white/80 p-2 rounded-lg border border-blue-100">
                                  {shopifyNote}
                                </div>
                              </div>
                            )}

                            {/* Detailed Line Items List */}
                            {lineItems.length > 0 ? (
                              <div className="space-y-2">
                                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider block">
                                  Ordered Footwear &amp; Custom Options ({lineItems.length})
                                </span>
                                {lineItems.map((li, idx) => (
                                  <div
                                    key={li.id || idx}
                                    className="p-3 rounded-xl bg-white border border-neutral-200 shadow-2xs space-y-2"
                                  >
                                    <div className="flex items-start gap-3">
                                      {li.imageUrl && (
                                        <ProductThumbnail
                                          src={li.imageUrl}
                                          alt={li.title}
                                          size="sm"
                                          className="rounded-lg border border-neutral-200 shrink-0"
                                        />
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <div className="font-bold text-neutral-900 text-xs leading-snug">
                                          {li.title}
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-mono flex-wrap mt-0.5">
                                          {li.variantTitle && (
                                            <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-800 font-semibold border border-neutral-200">
                                              Size: {li.variantTitle}
                                            </span>
                                          )}
                                          <span>Qty: {li.quantity || 1}</span>
                                          {li.price && <span>• {li.price}</span>}
                                          {li.sku && <span>• SKU: {li.sku}</span>}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Line Item Custom Properties (width, Sole, SoleFinish, CraftsmanNotes) */}
                                    {li.properties && li.properties.length > 0 && (
                                      <div className="pt-2 border-t border-neutral-100 grid grid-cols-1 xs:grid-cols-2 gap-1.5 text-[10px]">
                                        {li.properties
                                          .filter(p => !p.name.startsWith('_'))
                                          .map(p => (
                                            <div key={p.name} className="flex items-baseline gap-1 text-neutral-700 bg-neutral-50 p-1.5 rounded-md border border-neutral-200/60">
                                              <span className="font-semibold text-neutral-500 uppercase">{p.name}:</span>
                                              <span className="font-mono text-neutral-900 font-medium break-all">{p.value}</span>
                                            </div>
                                          ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : Object.keys(customSpecs).length > 0 ? (
                              <div className="p-3 rounded-xl bg-white border border-neutral-200 shadow-2xs space-y-1.5">
                                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider block">
                                  Custom Workshop Specifications
                                </span>
                                <div className="grid grid-cols-1 xs:grid-cols-2 gap-1.5 text-[10px]">
                                  {Object.entries(customSpecs)
                                    .filter(([k]) => !k.startsWith('_'))
                                    .map(([k, v]) => (
                                      <div key={k} className="flex items-baseline gap-1 text-neutral-700 bg-neutral-50 p-1.5 rounded-md border border-neutral-200/60">
                                        <span className="font-semibold text-neutral-500 uppercase">{k}:</span>
                                        <span className="font-mono text-neutral-900 font-medium break-all">{v}</span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}

                      {/* Internal Timeline Remarks History */}
                      <div className="pt-2 border-t border-neutral-200/60">
                        <span className="text-neutral-400 text-[9px] uppercase font-bold block">Internal Timeline Remarks History</span>
                        <span className="text-neutral-800 italic block mt-0.5">{item.remarks || 'No internal remarks recorded yet.'}</span>
                      </div>

                      {/* Shopify Admin Direct Access & Metadata Bar */}
                      {(() => {
                        const cleanId = (item.orderId || '').replace(/^#/, '').trim();
                        const isLlc = item.storeTab === 'LLC' || matchingShopify?.storeAccount === 'LLC' || cleanId.toUpperCase().startsWith('US');
                        const shopifyAdminUrl = getShopifyAdminOrderUrl(item.orderId, matchingShopify?.id, isLlc ? 'LLC' : 'Global');

                        return (
                          <div className="pt-2.5 border-t border-neutral-200/80 flex flex-wrap items-center justify-between gap-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">Shopify Channel:</span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold flex items-center gap-1">
                                <ShoppingBag className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>{isLlc ? 'BLKBRD USA Store (USD)' : 'BLKBRD Global Store (INR)'}</span>
                              </span>
                              {matchingShopify?.financialStatus && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 border border-neutral-200/80 font-mono capitalize">
                                  Payment: {matchingShopify.financialStatus}
                                </span>
                              )}
                              {matchingShopify?.fulfillmentStatus && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 border border-neutral-200/80 font-mono capitalize">
                                  Fulfillment: {matchingShopify.fulfillmentStatus}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              <a
                                href={shopifyAdminUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] transition shadow-xs group cursor-pointer"
                                title={`Open original order #${item.orderId} directly on Shopify Admin`}
                              >
                                <ShoppingBag className="w-3.5 h-3.5" />
                                <span>View on Shopify Admin</span>
                                <ExternalLink className="w-3 h-3 text-emerald-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                              </a>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Product Details & Shopify Image Thumbnail */}
                  {(() => {
                    const resolvedImgUrl = resolveProductImage(
                      item.orderId,
                      item.product || item.shoeModel,
                      shopifyOrders,
                      item.imageUrl || matchingShopify?.imageUrl
                    );

                    return (
                      <div className="flex items-start gap-3 bg-neutral-50/90 p-2.5 sm:p-3 rounded-2xl border border-neutral-200/70">
                        <ProductThumbnail
                          src={resolvedImgUrl}
                          alt={item.product || item.shoeModel || 'Footwear Model'}
                          size="md"
                          className="rounded-xl shadow-2xs border border-neutral-200 bg-white shrink-0"
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="text-xs font-bold text-neutral-900 leading-snug">
                            {item.product || item.shoeModel || 'BLKBRD Goodyear Welted Footwear'}
                          </div>
                          {resolvedImgUrl && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9.5px] font-sans font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Shopify Media Linked
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Stage selector */}
                    <div className="relative flex items-center">
                      <Sliders className="w-3.5 h-3.5 absolute left-3 text-neutral-400 pointer-events-none" />
                      <select
                        value={item.currentStage || currentState.stage}
                        disabled={savingId === item.orderId}
                        onChange={e => handleStageChange(item, e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 sm:py-2 text-xs font-bold uppercase tracking-wide bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 focus:border-neutral-900 rounded-xl text-neutral-900 outline-none cursor-pointer min-h-[40px] sm:min-h-0 transition disabled:opacity-50"
                      >
                        {PRODUCTION_STAGES.map(stage => (
                          <option key={stage} value={stage}>{stage}</option>
                        ))}
                      </select>
                    </div>

                    {/* Quick Remark Bar with Image Upload Button */}
                    {isOnHold ? (
                      <div className="relative flex items-center animate-fade-in">
                        <AlertTriangle className="w-3.5 h-3.5 absolute left-3 text-amber-600 pointer-events-none" />
                        <select
                          value={currentState.reason}
                          onChange={e => updateCardState(item.orderId, 'reason', e.target.value, item.currentStage, item.remarks)}
                          className="w-full pl-9 pr-3 py-2.5 sm:py-2 text-xs font-semibold bg-amber-50 border border-amber-300 focus:border-amber-500 rounded-xl text-amber-950 outline-none cursor-pointer min-h-[40px] sm:min-h-0"
                        >
                          {DELAY_REASONS.map(reason => (
                            <option key={reason} value={reason}>{reason}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1 flex items-center">
                          <MessageSquare className="w-3.5 h-3.5 absolute left-3 text-neutral-400 pointer-events-none" />
                          <input
                            type="text"
                            placeholder="Add quick stage remark..."
                            value={currentState.remark}
                            onChange={e => updateCardState(item.orderId, 'remark', e.target.value, item.currentStage, item.remarks)}
                            className="w-full pl-9 pr-3 py-2.5 sm:py-2 text-xs bg-neutral-50 hover:bg-neutral-50 focus:bg-white border border-neutral-200 focus:border-neutral-900 rounded-xl text-neutral-900 placeholder:text-neutral-400 outline-none min-h-[40px] sm:min-h-0"
                          />
                        </div>

                        {/* File Upload Image Button (Photo Gallery / Files) */}
                        <label
                          htmlFor={`file-snap-${item.orderId}`}
                          className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-200 flex items-center justify-center cursor-pointer transition shrink-0 shadow-2xs group"
                          title="Upload Stage Photo"
                        >
                          <input
                            id={`file-snap-${item.orderId}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                              if (e.target.files?.[0]) {
                                handleImageSelected(item.orderId, e.target.files[0], item.currentStage, item.remarks);
                              }
                            }}
                          />
                          <ImagePlus className="w-4 h-4 text-neutral-600 group-hover:scale-110 transition-transform" />
                        </label>
                      </div>
                    )}
                  </div>

                  {isOnHold && (
                    <div className="flex items-center gap-1.5 animate-fade-in">
                      <div className="relative flex-1 flex items-center">
                        <MessageSquare className="w-3.5 h-3.5 absolute left-3 text-neutral-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Add hold remark..."
                          value={currentState.remark}
                          onChange={e => updateCardState(item.orderId, 'remark', e.target.value, item.currentStage, item.remarks)}
                          className="w-full pl-9 pr-3 py-2.5 sm:py-2 text-xs bg-neutral-50 hover:bg-neutral-50 focus:bg-white border border-neutral-200 focus:border-neutral-900 rounded-xl text-neutral-900 placeholder:text-neutral-400 outline-none min-h-[40px] sm:min-h-0"
                        />
                      </div>

                      {/* Upload Photo Button on Hold */}
                      <label
                        htmlFor={`file-snap-hold-${item.orderId}`}
                        className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-200 flex items-center justify-center cursor-pointer transition shrink-0 shadow-2xs group"
                        title="Upload Stage Photo"
                      >
                        <input
                          id={`file-snap-hold-${item.orderId}`}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            if (e.target.files?.[0]) {
                              handleImageSelected(item.orderId, e.target.files[0], item.currentStage, item.remarks);
                            }
                          }}
                        />
                        <ImagePlus className="w-4 h-4 text-neutral-600 group-hover:scale-110 transition-transform" />
                      </label>
                    </div>
                  )}

                  {/* Attached Photo Preview Banner (Ready to Stamp) */}
                  {currentState.isProcessingImage && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 animate-pulse">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-700" />
                      <span>Optimising workshop photo for upload...</span>
                    </div>
                  )}

                  {currentState.attachedImage && !currentState.isProcessingImage && (
                    <div className="p-2.5 rounded-xl bg-emerald-50/90 border border-emerald-300 flex items-center justify-between gap-3 animate-fade-in shadow-2xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ProductThumbnail
                          src={currentState.attachedImage}
                          alt="Attached Workshop Stage Photo"
                          size="sm"
                          className="rounded-lg border border-emerald-300 shadow-xs shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-200/80 text-emerald-900 font-mono">
                              Photo Ready [{currentState.stage}]
                            </span>
                            <span className="text-[11px] font-semibold text-emerald-950 truncate max-w-[140px] sm:max-w-xs">
                              {currentState.attachedFileName || 'Workshop_Capture.jpg'}
                            </span>
                          </div>
                          <span className="text-[10px] text-emerald-700 block mt-0.5">
                            Will be stamped on Order #{item.orderId} and synced to Supabase.
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveAttachedImage(item.orderId, item.currentStage, item.remarks)}
                        className="p-1.5 rounded-lg bg-white/90 hover:bg-white text-rose-600 hover:text-rose-800 border border-rose-200 hover:border-rose-300 transition cursor-pointer shrink-0 shadow-2xs"
                        title="Remove attached photo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Workshop Photo History Stream for this order */}
                  {(() => {
                    const allRemarks = getAllRemarksHistory();
                    const photos = allRemarks.filter(
                      r => normalizeOrderId(r.orderId) === normalizeOrderId(item.orderId) && r.imageUrl
                    );

                    if (photos.length === 0) return null;

                    return (
                      <div className="pt-2 border-t border-neutral-100 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                          <span className="flex items-center gap-1">
                            <Camera className="w-3 h-3 text-neutral-400" />
                            <span>Stamped Workshop Photos ({photos.length})</span>
                          </span>
                          <span className="text-[9px] font-mono text-neutral-400">Live Supabase Record</span>
                        </div>

                        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                          {photos.map((p, idx) => (
                            <div
                              key={p.id || idx}
                              className="group relative flex items-center gap-2 bg-neutral-50 hover:bg-white p-1.5 rounded-xl border border-neutral-200/80 shrink-0 transition"
                            >
                              <ProductThumbnail
                                src={p.imageUrl}
                                alt={`Order #${item.orderId} - ${p.stageTransition || 'Crafting'}`}
                                size="xs"
                                className="rounded-md border border-neutral-200 bg-white"
                              />
                              <div className="text-[10px] leading-tight pr-1">
                                <span className="font-bold text-neutral-800 block uppercase font-mono">
                                  {p.stageTransition || 'Stage Photo'}
                                </span>
                                <span className="text-neutral-500 text-[9px]">
                                  {p.author} • {p.timestamp.split(',')[0]}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      disabled={isSaving || currentState.isProcessingImage}
                      onClick={() => handleSaveOrder(item)}
                      className="w-full sm:w-auto bg-neutral-900 hover:bg-neutral-800 text-white font-semibold py-2.5 sm:py-2 px-5 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 min-h-[40px] sm:min-h-0 shadow-xs"
                    >
                      {currentState.attachedImage ? (
                        <UploadCloud className="w-3.5 h-3.5 stroke-[2.5] text-emerald-400" />
                      ) : (
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      )}
                      <span>
                        {isSaving
                          ? 'Uploading & Saving...'
                          : currentState.attachedImage
                          ? 'Upload Photo & Stamp Stage'
                          : 'Save & Log Remarks'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default function App() {
  const [currentUser, setCurrentUserState] = useState<UserProfile | null>(() => getCurrentUser() || defaultUsers.admin);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isRemarksModalOpen, setIsRemarksModalOpen] = useState(false);
  const [isShopifyModalOpen, setIsShopifyModalOpen] = useState(false);
  const [isSchemaCustomizerOpen, setIsSchemaCustomizerOpen] = useState(false);
  const [schemaCustomizerInitialTable, setSchemaCustomizerInitialTable] = useState<CustomizableTableKey>('order_audit_events');
  const [isProgressiveMode, setIsProgressiveMode] = useState(false);
  const [logisticsViewMode, setLogisticsViewMode] = useState<'cards' | 'table'>('cards');

  const handleOpenSchemaCustomizer = (tableKey: CustomizableTableKey = 'order_audit_events') => {
    setSchemaCustomizerInitialTable(tableKey);
    setIsSchemaCustomizerOpen(true);
  };

  const [delinquencies, setDelinquencies] = useState<DelinquencyItem[]>([]);
  const [dispatches, setDispatches] = useState<DispatchItem[]>([]);
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [trialPairs, setTrialPairs] = useState<TrialPairItem[]>([]);
  const [bostonStock, setBostonStock] = useState<BostonStockItem[]>(() => getBostonStock());
  const [shopifyOrders, setShopifyOrders] = useState<ShopifyOrder[]>(() => getShopifyOrders());
  const [remarks, setRemarks] = useState<ProductionRemark[]>(() => getProductionRemarks());
  const [shopifyConfig, setShopifyConfig] = useState<ShopifyConfig>(() => getStoredShopifyConfig());
  const [shopifyDualConfig, setShopifyDualConfig] = useState<ShopifyDualConfig>(() => getStoredShopifyDualConfig());
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('shopify');
  const [dispatchSubTab, setDispatchSubTab] = useState<'rtd' | 'dispatched'>('rtd');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileAdminHubOpen, setIsMobileAdminHubOpen] = useState(false);
  const [isUserManagementModalOpen, setIsUserManagementModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('blkbrd_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('blkbrd_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };
  const [isShopifySyncing, setIsShopifySyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [selectedOrderSummaryId, setSelectedOrderSummaryId] = useState<string | null>(null);

  const handleOpenOrderSummary = (orderId: string) => {
    if (!orderId) return;
    setSelectedOrderSummaryId(orderId.trim());
  };

  const areDelinquenciesEqual = (a: DelinquencyItem[], b: DelinquencyItem[]): boolean => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const itemA = a[i];
      const itemB = b[i];
      if (
        itemA.id !== itemB.id ||
        itemA.orderId !== itemB.orderId ||
        itemA.currentStage !== itemB.currentStage ||
        itemA.orderStatus !== itemB.orderStatus ||
        itemA.delayReason !== itemB.delayReason ||
        itemA.remarks !== itemB.remarks ||
        itemA.daysDelayed !== itemB.daysDelayed ||
        itemA.customerName !== itemB.customerName ||
        itemA.product !== itemB.product
      ) {
        return false;
      }
    }
    return true;
  };

  const areShopifyOrdersEqual = (a: ShopifyOrder[], b: ShopifyOrder[]): boolean => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const oA = a[i];
      const oB = b[i];
      if (
        oA.id !== oB.id ||
        oA.orderNumber !== oB.orderNumber ||
        oA.financialStatus !== oB.financialStatus ||
        oA.fulfillmentStatus !== oB.fulfillmentStatus ||
        oA.operationalStatus !== oB.operationalStatus ||
        oA.totalPrice !== oB.totalPrice ||
        oA.customerName !== oB.customerName ||
        oA.lineItems !== oB.lineItems ||
        oA.notes !== oB.notes
      ) {
        return false;
      }
    }
    return true;
  };

  const areDispatchesEqual = (a: DispatchItem[], b: DispatchItem[]): boolean => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (
        a[i].id !== b[i].id ||
        a[i].outgoingTrackingAwb !== b[i].outgoingTrackingAwb ||
        a[i].date !== b[i].date ||
        a[i].orderNumber !== b[i].orderNumber
      ) {
        return false;
      }
    }
    return true;
  };

  const areReturnsEqual = (a: ReturnItem[], b: ReturnItem[]): boolean => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (
        a[i].id !== b[i].id ||
        a[i].status !== b[i].status ||
        a[i].returnReceived !== b[i].returnReceived ||
        a[i].replacementDone !== b[i].replacementDone
      ) {
        return false;
      }
    }
    return true;
  };

  const areTrialsEqual = (a: TrialPairItem[], b: TrialPairItem[]): boolean => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (
        a[i].id !== b[i].id ||
        a[i].status !== b[i].status ||
        a[i].outboundAwb !== b[i].outboundAwb
      ) {
        return false;
      }
    }
    return true;
  };

  const isSyncInProgressRef = useRef(false);

  useEffect(() => {
    loadSupabaseData(false);
    const freshDual = getStoredShopifyDualConfig();
    setShopifyDualConfig(freshDual);
    setShopifyConfig(getStoredShopifyConfig());

    // 1. Initialize Authoritative Multi-User Real-Time Sync (SSE + Fast Status Polling)
    realtimeSync.init();

    const unsubStage = realtimeSync.onStageUpdated((evt) => {
      setDelinquencies(prev => {
        let matched = false;
        const next = prev.map(d => {
          if (orderIdsMatch(d.orderId, evt.orderId)) {
            matched = true;
            return {
              ...d,
              currentStage: evt.stage,
              orderStatus: (evt.orderStatus as any) || d.orderStatus,
              delayReason: evt.delayReason !== undefined ? evt.delayReason : d.delayReason,
              remarks: evt.remarks || d.remarks,
              actionRequired: evt.actionRequired || (evt.stage === 'RTD' ? 'Ready to Dispatch (RTD)' : evt.stage === 'Shipped' ? 'Dispatched' : `Production Workshop (${evt.stage})`)
            };
          }
          return d;
        });
        if (matched) {
          saveDelinquencies(next);
        }
        return next;
      });

      setShopifyOrders(prev => prev.map(o => {
        if (orderIdsMatch(o.orderNumber || o.id, evt.orderId)) {
          const isRtd = evt.stage === 'RTD' || evt.orderStatus === 'Ready to Ship';
          const isShipped = evt.stage === 'Shipped' || evt.orderStatus === 'Shipped';
          return {
            ...o,
            operationalStatus: isRtd ? 'Ready to Ship' : isShipped ? 'Shipped' : o.operationalStatus,
            fulfillmentStatus: isShipped ? 'fulfilled' : o.fulfillmentStatus
          };
        }
        return o;
      }));
    });

    const unsubTable = realtimeSync.onTableUpdated(() => {
      loadSupabaseData(false);
    });

    // 2. Cross-tab storage event sync
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'blkbrd_delinquencies_cache' || e.key === 'blkbrd_order_stage_broadcast') {
        const cached = getDelinquencies();
        if (cached && cached.length > 0) {
          setDelinquencies(prev => {
            const merged = mergeShopifyOrdersIntoDelinquencies(cached, getShopifyOrders());
            return areDelinquenciesEqual(prev, merged) ? prev : merged;
          });
        }
        loadSupabaseData(false);
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    // 3. Multi-user background fallback sync (every 6s when active)
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadSupabaseData(false);
      }
    }, 6000);

    // 4. Focus sync when user switches back to tab
    const handleWindowFocus = () => {
      loadSupabaseData(false);
    };
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      unsubStage();
      unsubTable();
      realtimeSync.destroy();
      window.removeEventListener('storage', handleStorageEvent);
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  const loadSupabaseData = async (isManual: boolean = false) => {
    if (isSyncInProgressRef.current) return;
    isSyncInProgressRef.current = true;
    try {
      const [ordersData, rawDispatches, supabaseShopify] = await Promise.all([
        fetchLiveDatabaseOrders(),
        fetchDailyDispatches(),
        fetchSupabaseShopifyOrders().catch(() => [] as ShopifyOrder[])
      ]);
      const currentShopify = getShopifyOrders();
      
      const shopifyMap = new Map<string, ShopifyOrder>();
      [...currentShopify, ...(supabaseShopify || [])].forEach(o => {
        if (o.orderNumber) {
          shopifyMap.set(o.orderNumber.replace(/^#/, ''), o);
        }
      });
      const combinedShopify = Array.from(shopifyMap.values());
      
      if (combinedShopify.length > 0) {
        setShopifyOrders(prev => areShopifyOrdersEqual(prev, combinedShopify) ? prev : combinedShopify);
        saveShopifyOrders(combinedShopify);
      }
      
      const mergedDelinquencies = mergeShopifyOrdersIntoDelinquencies(
        ordersData.delinquencies || [], 
        combinedShopify.length > 0 ? combinedShopify : currentShopify
      );
      setDelinquencies(prev => areDelinquenciesEqual(prev, mergedDelinquencies) ? prev : mergedDelinquencies);
      saveDelinquencies(mergedDelinquencies);

      const mappedDispatches: DispatchItem[] = (rawDispatches || []).map((d: any, idx: number) => ({
        id: d.id,
        sNo: d.serial_number || idx + 1,
        date: d.dispatch_date || new Date().toISOString().split('T')[0],
        orderNumber: d.order_id || '',
        shippingType: d.shipping_type || 'Domestic',
        shippingPartner: d.shipping_partner || 'Bluedart Express',
        outgoingTrackingAwb: d.outgoing_tracking_awb || '',
        trialPair: d.trial_pair || 'N',
        region: d.shipping_type || 'Domestic',
        courier: d.shipping_partner || 'Bluedart Express',
        trackingDetails: d.outgoing_tracking_awb || '',
        trackingFulfilled: d.outgoing_tracking_awb ? 'YES' : 'NO',
        notes: d.trial_pair === 'Y' ? 'Trial Pair Order' : ''
      }));
      setDispatches(prev => areDispatchesEqual(prev, mappedDispatches) ? prev : mappedDispatches);

      const globalRet = await fetchReturns('returns_global');
      const llcRet = await fetchReturns('returns_llc');
      const combinedReturns: ReturnItem[] = [
        ...globalRet.map((r: any, idx: number) => ({
          id: r.id,
          sNo: r.serial_number || idx + 1,
          clientName: r.customer_name || 'Customer',
          type: r.return_type || 'Exchange',
          reason: r.reason || 'Size',
          oldOrderId: r.old_order_id || '',
          newOrderId: r.new_order_id || '',
          oldSize: r.old_size || '',
          newSize: r.new_size || '',
          returnReceived: r.return_received || 'N',
          status: r.status || 'Open',
          replacementDone: r.replacement_done || 'N',
          region: r.region || 'Domestic',
          storeTab: 'Global' as const,
          initiatedDate: r.return_initiated || '',
          newTargetDate: r.targeted_date || '',
          incomingCourier: r.incoming_courier_name || '',
          incomingTrackingNo: r.incoming_tracking_awb || '',
          exchangeTracking: r.exchange_tracking_awb || '',
          country: r.country || 'India',
          createdBy: r.created_by || '',
          notes: r.remarks || ''
        })),
        ...llcRet.map((r: any, idx: number) => ({
          id: r.id,
          sNo: r.serial_number || idx + 1,
          clientName: r.customer_name || 'Customer',
          type: r.return_type || 'Exchange',
          reason: r.reason || 'Size',
          oldOrderId: r.old_order_id || '',
          newOrderId: r.new_order_id || '',
          oldSize: r.old_size || '',
          newSize: r.new_size || '',
          returnReceived: r.return_received || 'N',
          status: r.status || 'Open',
          replacementDone: r.replacement_done || 'N',
          region: r.region || 'USA',
          storeTab: 'LLC' as const,
          initiatedDate: r.return_initiated || '',
          newTargetDate: r.targeted_date || '',
          incomingCourier: r.incoming_courier_name || '',
          incomingTrackingNo: r.incoming_tracking_awb || '',
          exchangeTracking: r.exchange_tracking_awb || '',
          country: r.country || 'United States',
          createdBy: r.created_by || '',
          notes: r.remarks || ''
        }))
      ];
      setReturns(prev => areReturnsEqual(prev, combinedReturns) ? prev : combinedReturns);

      const trialsData = await fetchTrialPairs();
      const mappedTrials: TrialPairItem[] = trialsData.map((t: any, idx: number) => ({
        id: t.id,
        orderId: t.order_id || '',
        customerName: t.customer_name || 'Customer',
        phoneOrEmail: '',
        shoeModel: t.shoe_model || 'BLKBRD Trial Pair',
        sizesSent: t.shoe_model?.includes('Size') ? t.shoe_model : 'Sample Fit',
        dispatchedDate: t.created_at ? t.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
        courier: t.source_type || 'Daily Dispatch',
        outboundAwb: t.outbound_awb || '',
        status: (t.status || 'Active Trial') as any,
        notes: t.source_type || 'Trial Entry'
      }));
      setTrialPairs(prev => areTrialsEqual(prev, mappedTrials) ? prev : mappedTrials);

      await handleRefreshShopifyWithFallback(isManual);
    } catch (err) {
      console.error('Error loading Supabase data:', err);
    } finally {
      isSyncInProgressRef.current = false;
    }
  };

  const handleRefreshShopifyWithFallback = async (isManual: boolean = false) => {
    if (isManual) {
      setIsShopifySyncing(true);
    }
    try {
      const currentDual = getStoredShopifyDualConfig();
      const { orders, error } = await fetchShopifyOrdersFromBothStores(currentDual);
      
      const supabaseCached = await fetchSupabaseShopifyOrders().catch(() => [] as ShopifyOrder[]);
      const localStored = getShopifyOrders();

      const masterOrderMap = new Map<string, ShopifyOrder>();
      
      [...localStored, ...(supabaseCached || [])].forEach(o => {
        if (o.orderNumber) masterOrderMap.set(o.orderNumber.replace(/^#/, ''), o);
      });

      // Ensure any orders loaded into delinquencies state or database are represented in Shopify feed
      delinquencies.forEach(d => {
        const o = convertDelinquencyToShopifyOrder(d);
        const cleanNum = o.orderNumber?.replace(/^#/, '');
        if (cleanNum && !masterOrderMap.has(cleanNum)) {
          masterOrderMap.set(cleanNum, o);
        }
      });

      if (orders && orders.length > 0) {
        orders.forEach(o => {
          if (o.orderNumber) masterOrderMap.set(o.orderNumber.replace(/^#/, ''), o);
        });
      }

      const finalMergedOrders = Array.from(masterOrderMap.values()).sort((a, b) => {
        const numA = parseInt(a.orderNumber.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.orderNumber.replace(/\D/g, ''), 10) || 0;
        if (numB !== numA) return numB - numA;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

      if (finalMergedOrders.length > 0) {
        setShopifyOrders(prev => areShopifyOrdersEqual(prev, finalMergedOrders) ? prev : finalMergedOrders);
        saveShopifyOrders(finalMergedOrders);
        setShopifyDualConfig(currentDual);
        setShopifyConfig(getStoredShopifyConfig());
        
        if (orders && orders.length > 0) {
          syncShopifyOrdersToSupabase(orders).catch(err => console.warn('Background Shopify sync to db:', err));
        }
        
        setDelinquencies(prev => {
          const next = mergeShopifyOrdersIntoDelinquencies(prev, finalMergedOrders);
          return areDelinquenciesEqual(prev, next) ? prev : next;
        });
        
        if (isManual) {
          setSyncFeedback(`Successfully synchronized ${finalMergedOrders.length} unique orders across stores and workshop.`);
          setTimeout(() => setSyncFeedback(null), 4000);
        }
        return;
      }

      if (isManual && error) {
        setSyncFeedback(`Shopify Sync Notice: ${error}`);
        setTimeout(() => setSyncFeedback(null), 6000);
      }
    } catch (err: any) {
      console.warn('Live Shopify sync error:', err);
      if (isManual) {
        setSyncFeedback(err.message || 'Live Shopify sync encountered an issue');
        setTimeout(() => setSyncFeedback(null), 6000);
      }
      
      const stored = getShopifyOrders();
      if (stored && stored.length > 0) {
        setShopifyOrders(prev => areShopifyOrdersEqual(prev, stored) ? prev : stored);
        setDelinquencies(prev => {
          const next = mergeShopifyOrdersIntoDelinquencies(prev, stored);
          return areDelinquenciesEqual(prev, next) ? prev : next;
        });
      }
    } finally {
      if (isManual) {
        setIsShopifySyncing(false);
      }
    }
  };

  useEffect(() => {
    const unsubscribeAuth = initAuthListener(
      () => {},
      () => {
        if (localStorage.getItem('blkbrd_signed_out') === 'true') {
          setCurrentUserState(null);
        }
      }
    );

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerDebouncedSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadSupabaseData(false);
      }, 2000);
    };

    const realtimeChannel = supabase
      .channel('live-orders-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delinquency_global' },
        triggerDebouncedSync
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delinquency_llc' },
        triggerDebouncedSync
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopify_orders' },
        triggerDebouncedSync
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_dispatches' },
        triggerDebouncedSync
      )
      .subscribe();

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('blkbrd_ops_sync');
        bc.onmessage = (event) => {
          if (event.data?.type === 'ORDER_STAGE_UPDATED') {
            loadSupabaseData(false);
          }
        };
      } catch (_e) {}
    }

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'blkbrd_order_stage_broadcast' || e.key === 'blkbrd_delinquencies') {
        loadSupabaseData(false);
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (bc) bc.close();
      window.removeEventListener('storage', handleStorageEvent);
      unsubscribeAuth();
      supabase.removeChannel(realtimeChannel);
    };
  }, []);

  const handleSelectRole = (role: UserRole) => {
    setIsLoginModalOpen(false);
    localStorage.removeItem('blkbrd_signed_out');
    const updated = defaultUsers[role];
    setCurrentUserState(updated);
    setCurrentUser(updated);

    // Immediately reload from cache to ensure latest stage changes reflect across views
    const localDel = getDelinquencies();
    if (localDel && localDel.length > 0) {
      setDelinquencies(prev => {
        const merged = mergeShopifyOrdersIntoDelinquencies(localDel, getShopifyOrders());
        return areDelinquenciesEqual(prev, merged) ? prev : merged;
      });
    }
    loadSupabaseData(false);
  };

  const handleLoginSuccess = (user: UserProfile) => {
    setIsLoginModalOpen(false);
    localStorage.removeItem('blkbrd_signed_out');
    setCurrentUserState(user);
    setCurrentUser(user);
    setSyncFeedback(`Authenticated as ${user.name} (${user.role.toUpperCase()})`);
    setTimeout(() => setSyncFeedback(null), 3500);
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (e) {
      console.warn('Logout warning:', e);
    }
    localStorage.setItem('blkbrd_signed_out', 'true');
    setCurrentUserState(null);
    setCurrentUser(null);
    setSyncFeedback('Signed out securely. Operational portal locked.');
    setTimeout(() => setSyncFeedback(null), 3000);
  };

  const handleRefreshShopify = async () => {
    await handleRefreshShopifyWithFallback(true);
  };

  const handleUpdateShopifyOrderStatus = async (
    orderId: string,
    newStatus: 'Ready to Ship' | 'Shipped' | 'Delayed',
    notesAddition?: string
  ) => {
    const updated = await updateShopifyOrderStatus(orderId, newStatus, notesAddition);
    setShopifyOrders(updated);
    const norm = normalizeOrderId(orderId);
    const isRtd = newStatus === 'Ready to Ship';
    const isShipped = newStatus === 'Shipped';

    setDelinquencies(prev => {
      let found = false;
      const mapped = prev.map(item => {
        if (normalizeOrderId(item.orderId) === norm) {
          found = true;
          return {
            ...item,
            orderStatus: newStatus,
            currentStage: isRtd ? 'RTD' : isShipped ? 'Shipped' : (item.currentStage === 'RTD' || item.currentStage === 'Shipped' ? 'Preparation' : item.currentStage),
            actionRequired: isRtd ? 'Ready to Dispatch (RTD)' : isShipped ? 'Dispatched' : 'Production Workshop',
            daysDelayed: (isRtd || isShipped) ? 0 : item.daysDelayed,
            remarks: `Status updated to ${newStatus} from Shopify`
          };
        }
        return item;
      });

      if (!found) {
        const matchingShopify = updated.find(o => normalizeOrderId(o.orderNumber) === norm);
        if (matchingShopify) {
          const newItem = convertShopifyOrderToDelinquencyItem(matchingShopify, prev.length + 1);
          return [newItem, ...mapped];
        }
      }
      return mapped;
    });

    if (isShipped) {
      const matchingShopify = updated.find(o => normalizeOrderId(o.orderNumber) === norm);
      const alreadyDispatched = dispatches.some(d => normalizeOrderId(d.orderNumber) === norm);
      if (!alreadyDispatched && matchingShopify) {
        const todayStr = new Date().toISOString().split('T')[0];
        const newDisp: DispatchItem = {
          id: `disp-shopify-${matchingShopify.orderNumber}`,
          sNo: dispatches.length + 1,
          date: todayStr,
          orderNumber: matchingShopify.orderNumber,
          shippingType: matchingShopify.storeAccount === 'LLC' ? 'International' : 'Domestic',
          shippingPartner: 'Bluedart Express',
          outgoingTrackingAwb: notesAddition || 'SHOP-AUTO-DISPATCH',
          trialPair: 'N',
          region: matchingShopify.storeAccount === 'LLC' ? 'International' : 'Domestic',
          courier: 'Bluedart Express',
          trackingDetails: 'Dispatched from Shopify Feed',
          trackingFulfilled: 'YES',
          notes: `Shopify Order #${matchingShopify.orderNumber}`
        };
        setDispatches(prev => [newDisp, ...prev]);
        try {
          await insertDailyDispatch({
            serial_number: dispatches.length + 1,
            dispatch_date: todayStr,
            order_id: matchingShopify.orderNumber,
            customer_name: matchingShopify.customerName,
            customerName: matchingShopify.customerName,
            shoe_model: matchingShopify.lineItems,
            shipping_type: matchingShopify.storeAccount === 'LLC' ? 'International' : 'Domestic',
            shipping_partner: 'Bluedart Express',
            outgoing_tracking_awb: notesAddition || 'SHOP-AUTO-DISPATCH',
            trial_pair: 'N',
            notes: notesAddition || 'Dispatched from Shopify Feed'
          });
        } catch (dispErr) {
          console.warn('Dispatch auto-log notice:', dispErr);
        }
      }
    }

    try {
      const matchingShopify = updated.find(o => normalizeOrderId(o.orderNumber) === norm);
      const isLlc = matchingShopify?.storeAccount === 'LLC';
      const targetTable = isLlc ? 'delinquency_llc' : 'delinquency_global';
      await supabase
        .from(targetTable)
        .update({
          current_stage: isRtd ? 'RTD' : isShipped ? 'Shipped' : 'Preparation',
          remarks: `Status updated to ${newStatus} from Shopify`
        })
        .eq('order_id', orderId.replace(/^#/, ''));
    } catch (dbErr) {
      console.warn('Supabase status sync notice:', dbErr);
    }

    setSyncFeedback(`Order #${orderId} marked as ${newStatus} — directly reflected on Main Dashboard`);
    setTimeout(() => setSyncFeedback(null), 3500);
  };

  const handleUpdateDelinquency = async (updated: DelinquencyItem) => {
    try {
      const resolvedCustomer = resolveCustomerName(
        updated.orderId,
        updated.customerName || updated.clientName,
        { delinquencies, shopifyOrders, returns, trialPairs, bostonStock }
      );

      const isRtd = updated.currentStage === 'RTD' || updated.orderStatus === 'Ready to Ship';
      const isShipped = updated.currentStage === 'Shipped' || updated.orderStatus === 'Shipped';
      const isHold = (updated.currentStage || '').toUpperCase() === 'ON HOLD';

      const orderStatus: 'Ready to Ship' | 'Shipped' | 'Delayed' | 'In Production' =
        isShipped ? 'Shipped' : isRtd ? 'Ready to Ship' : isHold ? 'Delayed' : ((updated.orderStatus as any) || 'In Production');

      const actionRequired = isRtd
        ? 'Ready to Dispatch (RTD)'
        : isShipped
        ? 'Dispatched'
        : isHold
        ? 'On Hold: Workshop Review'
        : `Production Workshop (${updated.currentStage || 'Preparation'})`;

      const itemToSave: DelinquencyItem = {
        ...updated,
        customerName: resolvedCustomer,
        clientName: resolvedCustomer,
        orderStatus,
        actionRequired
      };

      // 1. Optimistically update local React state immediately so other views and roles reflect it without delay
      setDelinquencies(prev => {
        let found = false;
        const mapped = prev.map(d => {
          if (orderIdsMatch(d.orderId, updated.orderId)) {
            found = true;
            return {
              ...d,
              ...itemToSave,
              id: d.id || itemToSave.id,
              orderId: d.orderId
            };
          }
          return d;
        });
        return found ? mapped : [itemToSave, ...mapped];
      });

      // 2. Also update shopifyOrders if present
      setShopifyOrders(prev => prev.map(o => {
        if (orderIdsMatch(o.orderNumber || o.id, updated.orderId)) {
          return {
            ...o,
            operationalStatus: isRtd ? 'Ready to Ship' : isShipped ? 'Shipped' : o.operationalStatus,
            fulfillmentStatus: isShipped ? 'fulfilled' : o.fulfillmentStatus
          };
        }
        return o;
      }));

      // 3. Update localStorage
      const curList = getDelinquencies();
      let foundInLocal = false;
      const updatedLocal = curList.map(d => {
        if (orderIdsMatch(d.orderId, updated.orderId)) {
          foundInLocal = true;
          return {
            ...d,
            ...itemToSave,
            id: d.id || itemToSave.id,
            orderId: d.orderId
          };
        }
        return d;
      });
      if (!foundInLocal) {
        updatedLocal.unshift(itemToSave);
      }
      saveDelinquencies(updatedLocal);

      // Broadcast to other open browser tabs / users immediately
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('blkbrd_ops_sync');
          bc.postMessage({ type: 'ORDER_STAGE_UPDATED', item: itemToSave });
          bc.close();
        }
        localStorage.setItem('blkbrd_order_stage_broadcast', JSON.stringify({
          orderId: itemToSave.orderId,
          stage: itemToSave.currentStage,
          status: itemToSave.orderStatus,
          ts: Date.now()
        }));
      } catch (_bcErr) {}

      // 4. Persist to Supabase database (table rows + audit remarks)
      try {
        await Promise.allSettled([
          updateDelinquencyOrder(itemToSave),
          updateProductionStatus(
            itemToSave.orderId,
            itemToSave.currentStage,
            itemToSave.remarks || `Stage transitioned to ${itemToSave.currentStage} by ${currentUser?.name || 'Artisan'}`,
            { name: currentUser?.name || 'CRM3 Staff', role: currentUser?.role || 'admin' },
            itemToSave.storeTab || 'Global'
          )
        ]);
      } catch (prodErr) {
        console.warn('Supabase updateDelinquency notice:', prodErr);
      }

      // If marked as Shipped, also automatically record in daily_dispatches so Logistics team sees it in Shipped section
      if (isShipped) {
        try {
          const cleanNum = updated.orderId.replace(/^#/, '');
          const isLlc = itemToSave.storeTab === 'LLC' || cleanNum.toUpperCase().startsWith('US');
          await insertDailyDispatch({
            serial_number: dispatches.length + 1,
            dispatch_date: new Date().toISOString().split('T')[0],
            order_id: cleanNum,
            customer_name: resolvedCustomer,
            customerName: resolvedCustomer,
            shoe_model: itemToSave.product || 'Goodyear Welted Footwear',
            shipping_type: isLlc ? 'International' : 'Domestic',
            shipping_partner: isLlc ? 'DHL Express' : 'Bluedart Express',
            outgoing_tracking_awb: (itemToSave as any).outgoingTrackingAwb || '',
            trial_pair: 'N',
            notes: itemToSave.remarks || `Marked as Shipped by Workshop`
          });
        } catch (dispErr) {
          console.warn('Auto insertDailyDispatch notice:', dispErr);
        }
      }

      await updateDelinquencyOrder(itemToSave, {
        name: currentUser?.name || 'CRM3 Staff',
        role: currentUser?.role || 'admin'
      });
      await loadSupabaseData();
      setSyncFeedback(`Order #${updated.orderId.replace(/^#/, '')} moved to stage ${itemToSave.currentStage} — synced across all users and views`);
      setTimeout(() => setSyncFeedback(null), 3000);
    } catch (err: any) {
      console.warn('Update failed:', err);
    }
  };

  const handleAddDelinquency = async (newItem: DelinquencyItem): Promise<{ success: boolean; message: string }> => {
    try {
      await createOrderAdmin(newItem, {
        name: currentUser?.name || 'CRM3 Staff',
        role: currentUser?.role || 'admin'
      });
      await loadSupabaseData();
      setSyncFeedback(`Order #${newItem.orderId.replace(/^#/, '')} added to ${newItem.storeTab || 'Global'} Delinquency Tracker`);
      setTimeout(() => setSyncFeedback(null), 4000);
      return { success: true, message: 'Added to Supabase database successfully' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  const handleBulkAddDelinquency = async (newItems: DelinquencyItem[]): Promise<{ count: number; message: string }> => {
    try {
      const itemsWithCustomerResolved = newItems.map((item) => {
        const resolvedCustomer = resolveCustomerName(
          item.orderId,
          item.customerName || item.clientName,
          { delinquencies, shopifyOrders, returns, trialPairs, bostonStock }
        );
        return {
          ...item,
          customerName: resolvedCustomer,
          clientName: resolvedCustomer
        };
      });
      await bulkCreateOrdersAdmin(itemsWithCustomerResolved, {
        name: currentUser?.name || 'CRM3 Staff',
        role: currentUser?.role || 'admin'
      });
      bulkAppendDelinquencies(itemsWithCustomerResolved);
      await loadSupabaseData();
             
      setSyncFeedback(`Successfully imported ${itemsWithCustomerResolved.length} orders into Tracker!`);
      setTimeout(() => setSyncFeedback(null), 4500);
      return {
        count: itemsWithCustomerResolved.length,
        message: `Imported ${itemsWithCustomerResolved.length} orders into the Delinquency Tracker.`
      };
    } catch (err: any) {
      console.warn('Supabase bulk insert notice, persisting locally:', err);
      bulkAppendDelinquencies(newItems);
      await loadSupabaseData();
      setSyncFeedback(`Imported ${newItems.length} orders successfully!`);
      setTimeout(() => setSyncFeedback(null), 3500);
      return { count: newItems.length, message: `Imported ${newItems.length} orders.` };
    }
  };

  const handleUpdateReturn = async (updated: ReturnItem) => {
    const targetTable = updated.storeTab === 'LLC' ? 'returns_llc' : 'returns_global';
    try {
      await updateReturn(targetTable, updated.id, updated);
      await loadSupabaseData();
      setSyncFeedback(`Return order updated`);
      setTimeout(() => setSyncFeedback(null), 3000);
    } catch (err: any) {
      alert(`Return update failed: ${err.message}`);
    }
  };

  const handleAddReturn = async (newItem: any) => {
    const targetTable = newItem.storeTab === 'LLC' ? 'returns_llc' : 'returns_global';
    try {
      await insertReturn(targetTable, newItem);
      await loadSupabaseData();
      setSyncFeedback(`Return logged`);
      setTimeout(() => setSyncFeedback(null), 3000);
    } catch (err: any) {
      alert(`Return insert failed: ${err.message}`);
    }
  };

  const handleAddDispatch = async (payload: any) => {
    try {
      await insertDailyDispatch(payload);
      await loadSupabaseData();
      setSyncFeedback(`Dispatch logged for Order #${payload.order_id || payload.orderNumber}`);
      setTimeout(() => setSyncFeedback(null), 3000);
    } catch (err: any) {
      alert(`Dispatch insert failed: ${err.message}`);
    }
  };

  const handleProcessDispatch = async (
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
  ) => {
    try {
      const exactCustomerName = dispatchPayload.customerName || rtdItem.customerName || rtdItem.clientName || 'Customer';
      const exactShoeModel = rtdItem.product || rtdItem.shoeStyle || 'Handcrafted Footwear';
      await insertDailyDispatch({
        serial_number: dispatches.length + 1,
        dispatch_date: dispatchPayload.date,
        order_id: dispatchPayload.orderNumber,
        customer_name: exactCustomerName,
        customerName: exactCustomerName,
        shoe_model: exactShoeModel,
        shipping_type: dispatchPayload.shippingType,
        shipping_partner: dispatchPayload.shippingPartner,
        outgoing_tracking_awb: dispatchPayload.outgoingTrackingAwb,
        trial_pair: dispatchPayload.trialPair,
        notes: dispatchPayload.notes || `Dispatched from Workshop RTD`
      });
      const updatedDelinquency: DelinquencyItem = {
        ...rtdItem,
        orderStatus: 'Shipped',
        currentStage: 'Shipped',
        notes: `Dispatched via ${dispatchPayload.shippingPartner} (AWB: ${dispatchPayload.outgoingTrackingAwb})`
      };
      await updateDelinquencyOrder(updatedDelinquency, {
        name: currentUser?.name || 'Logistics Team',
        role: currentUser?.role || 'logistics'
      });
      await loadSupabaseData();
      setSyncFeedback(`Order #${dispatchPayload.orderNumber} successfully dispatched`);
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch (err: any) {
      alert(`Dispatch processing error: ${err.message}`);
    }
  };

  const handleUpdateDispatch = async (updated: DispatchItem) => {
    try {
      const cleanNum = String(updated.orderNumber || '').replace(/^#/, '').trim();
      const isLlc = updated.shippingType === 'International' || cleanNum.toUpperCase().startsWith('US');
      const partner = updated.shippingPartner || updated.courier || 'Bluedart';
      const awb = (updated.outgoingTrackingAwb || updated.trackingDetails || '').trim();

      // 1. Update or Insert into daily_dispatches in Supabase safely
      let existingRows: any[] | null = null;
      try {
        const res = await supabase
          .from('daily_dispatches')
          .select('id, order_id')
          .eq('order_id', cleanNum);
        existingRows = res.data;
      } catch (qErr) {
        console.warn('daily_dispatches lookup notice:', qErr);
      }

      if (existingRows && existingRows.length > 0) {
        await updateDailyDispatch(existingRows[0].id, {
          order_id: cleanNum,
          customer_name: updated.customerName,
          shipping_partner: partner,
          outgoing_tracking_awb: awb,
          shipping_type: updated.shippingType,
          trial_pair: updated.trialPair || 'N',
          dispatch_date: updated.date,
          notes: updated.notes
        });
      } else {
        await insertDailyDispatch({
          serial_number: dispatches.length + 1,
          dispatch_date: updated.date || new Date().toISOString().split('T')[0],
          order_id: cleanNum,
          customer_name: updated.customerName,
          customerName: updated.customerName,
          shoe_model: updated.shoeModel || 'Handcrafted Footwear',
          shipping_type: updated.shippingType || (isLlc ? 'International' : 'Domestic'),
          shipping_partner: partner,
          outgoing_tracking_awb: awb,
          trial_pair: updated.trialPair || 'N',
          notes: updated.notes || 'Dispatched'
        });
      }

      // 2. Also synchronize the AWB and Courier into delinquency order
      const matchingDel = delinquencies.find(d => orderIdsMatch(d.orderId, cleanNum));
      if (matchingDel) {
        const updatedDel: DelinquencyItem = {
          ...matchingDel,
          orderStatus: 'Shipped',
          currentStage: 'Shipped',
          remarks: updated.notes || `Shipped via ${partner} [AWB: ${awb || 'N/A'}]`
        };
        (updatedDel as any).outgoingTrackingAwb = awb;
        (updatedDel as any).trackingNumber = awb;
        (updatedDel as any).courier = partner;

        await updateDelinquencyOrder(updatedDel, {
          name: currentUser?.name || 'Logistics Team',
          role: currentUser?.role || 'logistics'
        });
      }

      // 3. Mirror into shopify_orders if present
      try {
        await supabase.from('shopify_orders').update({
          operational_status: 'Shipped',
          fulfillment_status: 'fulfilled',
          synced_at: new Date().toISOString()
        }).eq('order_number', cleanNum);
      } catch (_sErr) {}

      // 4. Update local React states optimistically
      setDispatches(prev => {
        let found = false;
        const mapped = prev.map(d => {
          if (orderIdsMatch(d.orderNumber, cleanNum) || d.id === updated.id) {
            found = true;
            return {
              ...d,
              ...updated,
              shippingPartner: partner,
              courier: partner,
              outgoingTrackingAwb: awb,
              trackingDetails: awb,
              trackingFulfilled: awb ? 'YES' : 'NO'
            };
          }
          return d;
        });
        return found ? mapped : [{ ...updated, shippingPartner: partner, courier: partner, outgoingTrackingAwb: awb }, ...mapped];
      });

      // Broadcast update
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const bc = new BroadcastChannel('blkbrd_ops_sync');
          bc.postMessage({ type: 'ORDER_STAGE_UPDATED', orderId: cleanNum });
          bc.close();
        }
      } catch (_bcErr) {}

      await loadSupabaseData();
      setSyncFeedback(`Order #${cleanNum} shipping details & AWB updated successfully`);
      setTimeout(() => setSyncFeedback(null), 3500);
    } catch (err: any) {
      console.warn('Dispatch update error:', err);
      alert(`Could not update dispatch: ${err.message || err}`);
    }
  };

  const handleUpdateBostonStock = (updated: BostonStockItem) => {
    const updatedList = bostonStock.map(b => (b.id === updated.id ? updated : b));
    setBostonStock(updatedList);
    saveBostonStock(updatedList);
  };

  const handleAddBostonStock = (item: Omit<BostonStockItem, 'id'>) => {
    const created: BostonStockItem = { ...item, id: `bs-${Date.now()}` };
    const updatedList = [created, ...bostonStock];
    setBostonStock(updatedList);
    saveBostonStock(updatedList);
  };

  const handleUpdateTrial = async (updated: TrialPairItem) => {
    try {
      if (updated.id && !updated.id.startsWith('derived-')) {
        await updateTrialPair(updated.id, {
          customer_name: updated.customerName,
          shoe_model: updated.shoeModel,
          source_type: updated.notes || updated.courier,
          outbound_awb: updated.outboundAwb,
          status: updated.status
        });
      }
      await loadSupabaseData();
      setSyncFeedback(`Trial pair updated`);
      setTimeout(() => setSyncFeedback(null), 2500);
    } catch (e: any) {
      console.warn('Update trial pair error:', e);
    }
  };

  const handleAddTrial = async (newItem: Partial<TrialPairItem>) => {
    try {
      await insertTrialPair({
        order_id: newItem.orderId || '',
        customer_name: newItem.customerName || 'Customer',
        shoe_model: newItem.shoeModel || 'Trial Pair',
        source_type: newItem.notes || 'Direct Entry',
        outbound_awb: newItem.outboundAwb || '',
        status: newItem.status || 'Active Trial'
      });
      await loadSupabaseData();
      setSyncFeedback(`Trial pair added for Order #${newItem.orderId}`);
      setTimeout(() => setSyncFeedback(null), 3000);
    } catch (e: any) {
      alert(`Failed to add trial pair: ${e.message}`);
    }
  };

  const handleAddShopifyOrder = async (order: ShopifyOrder) => {
    try {
      const updated = [order, ...shopifyOrders.filter(o => o.orderNumber !== order.orderNumber)];
      setShopifyOrders(updated);
      saveShopifyOrders(updated);
      setDelinquencies(prev => mergeShopifyOrdersIntoDelinquencies(prev, [order]));
      await syncShopifyOrdersToSupabase([order]);
      await loadSupabaseData();
      setSyncFeedback(`Shopify Order #${order.orderNumber} added manually and synced to Supabase`);
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch (err: any) {
      console.warn('Manual Shopify order sync warning:', err);
      setSyncFeedback(`Order #${order.orderNumber} saved locally (Supabase notice: ${err.message || 'offline'})`);
      setTimeout(() => setSyncFeedback(null), 5000);
    }
  };

  const handlePurgeDummyData = () => {
    purgeAllDummyDataFromLocalStorage();
    setDelinquencies([]);
    setDispatches([]);
    setReturns([]);
    setBostonStock([]);
    setShopifyOrders([]);
    setTrialPairs([]);
    setRemarks([]);
    loadSupabaseData();
    setSyncFeedback('All dummy data cleared! Connected strictly to live Supabase database.');
    setTimeout(() => setSyncFeedback(null), 4000);
  };

  const dispatchMap = useMemo(() => {
    const map = new Map<string, DispatchItem>();
    dispatches.forEach(d => map.set(normalizeOrderId(d.orderNumber), d));
    return map;
  }, [dispatches]);

  const returnMap = useMemo(() => {
    const map = new Map<string, ReturnItem>();
    returns.forEach(r => {
      if (r.oldOrderId) map.set(normalizeOrderId(r.oldOrderId), r);
      if (r.newOrderId) map.set(normalizeOrderId(r.newOrderId), r);
    });
    return map;
  }, [returns]);

  const crossMatchedOrders = useMemo(() => {
    const list: any[] = [];
    delinquencies.forEach(d => {
      const norm = normalizeOrderId(d.orderId);
      const disp = dispatchMap.get(norm);
      const ret = returnMap.get(norm);
      const shop = shopifyOrders.find(s => normalizeOrderId(s.orderNumber) === norm);
      if (disp || ret || shop) {
        list.push({ orderId: d.orderId, customer: d.customerName, inDelinquency: d, inDispatch: disp, inReturns: ret, inShopify: shop });
      }
    });
    return list;
  }, [delinquencies, dispatchMap, returnMap, shopifyOrders]);

  const filteredDelinquencies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return delinquencies;
    return delinquencies.filter(d => d.orderId.toLowerCase().includes(q) || d.customerName.toLowerCase().includes(q));
  }, [delinquencies, search]);

  const filteredBostonStock = useMemo(() => bostonStock, [bostonStock]);
  const filteredTrialPairs = useMemo(() => trialPairs, [trialPairs]);

  const allShippedOrders = useMemo(() => {
    const map = new Map<string, DispatchItem>();

    // 1. Add explicit dispatches from database
    dispatches.forEach(d => {
      const key = String(d.orderNumber || d.id || '').replace(/^#/, '').toLowerCase();
      if (key) map.set(key, d);
    });

    // 2. Add all orders in delinquencies marked as Shipped so they immediately show in Shipped section
    delinquencies.forEach((item, idx) => {
      const stage = normalizeStage(item.currentStage as string);
      const isShipped = item.orderStatus === 'Shipped' || stage === 'Shipped';
      if (isShipped) {
        const cleanNum = String(item.orderId || '').replace(/^#/, '').trim();
        const key = cleanNum.toLowerCase();
        if (!map.has(key)) {
          const resolvedCustomer = resolveCustomerName(
            item.orderId,
            item.customerName || item.clientName,
            { delinquencies, shopifyOrders, returns, trialPairs, bostonStock }
          );
          const isLlc = item.storeTab === 'LLC' || cleanNum.toUpperCase().startsWith('US');
          map.set(key, {
            id: item.id || `shipped-${cleanNum}`,
            sNo: dispatches.length + idx + 1,
            date: item.expectedDate || item.orderDate || new Date().toISOString().split('T')[0],
            orderNumber: cleanNum,
            customerName: resolvedCustomer,
            shippingType: isLlc ? 'International' : 'Domestic',
            shippingPartner: (item as any).courier || (isLlc ? 'DHL Express' : 'Bluedart Express'),
            outgoingTrackingAwb: (item as any).trackingNumber || (item as any).outgoingTrackingAwb || '',
            trialPair: 'N',
            region: isLlc ? 'International' : 'Domestic',
            courier: (item as any).courier || (isLlc ? 'DHL Express' : 'Bluedart Express'),
            trackingDetails: (item as any).trackingNumber || (item as any).outgoingTrackingAwb || '',
            trackingFulfilled: ((item as any).trackingNumber || (item as any).outgoingTrackingAwb) ? 'YES' : 'NO',
            notes: item.remarks || 'Dispatched from Production Workshop'
          });
        }
      }
    });

    return Array.from(map.values());
  }, [dispatches, delinquencies, shopifyOrders, returns, trialPairs, bostonStock]);

  const rtdOrders = useMemo(() => {
    return delinquencies.filter(item => {
      const alreadyDispatched = allShippedOrders.some(d => orderIdsMatch(d.orderNumber, item.orderId));
      if (alreadyDispatched) return false;
      const stage = normalizeStage(item.currentStage as string);
      const isRtd = item.orderStatus === 'Ready to Ship' || stage === 'RTD';
      const isShipped = item.orderStatus === 'Shipped' || stage === 'Shipped';
      return isRtd && !isShipped;
    });
  }, [delinquencies, allShippedOrders]);

  const readyToShipCount = useMemo(() => rtdOrders.length, [rtdOrders]);
  const delayedCount = useMemo(() => {
    return delinquencies.filter(d => {
      const isRtd = d.orderStatus === 'Ready to Ship' || d.currentStage === 'RTD';
      const isShipped = d.orderStatus === 'Shipped' || d.currentStage === 'Shipped';
      if (isRtd || isShipped) return false;
      const delay = (d.orderDate && d.expectedDate)
        ? calculateDelayDays(d.orderDate, d.expectedDate)
        : (d.daysDelayed || 0);
      return delay >= 1;
    }).length;
  }, [delinquencies]);
  const returnsReceivedCount = useMemo(() => returns.filter(r => (r.returnReceived || '').trim().toUpperCase() === 'Y').length, [returns]);
  const unreadRemarksCount = useMemo(() => remarks.filter(r => !r.read).length, [remarks]);
  const effectiveRole: UserRole = currentUser?.role || 'admin';

  const lookupContext: OrderLookupContext = useMemo(() => ({
    delinquencies, dispatches: allShippedOrders, shopifyOrders, returns, trialPairs, bostonStock
  }), [delinquencies, allShippedOrders, shopifyOrders, returns, trialPairs, bostonStock]);

  const visibleTabs = useMemo(() => {
    if (currentUser?.role === 'crm') {
      return [
        { id: 'customers', label: 'CRM HUB', icon: Users, count: undefined },
        { id: 'delinquency', label: 'Orders & Delays', icon: AlertTriangle, count: delinquencies.length },
        { id: 'dispatch', label: 'Dispatches', icon: Package, count: allShippedOrders.length },
        { id: 'returns', label: 'Returns Tracker', icon: RotateCcw, count: returns.length },
        { id: 'shopify', label: 'Shopify Store', icon: ShoppingBag, count: shopifyOrders.length }
      ];
    }
    if (currentUser?.role === 'production') {
      return [
        { id: 'delinquency', label: 'Orders Insights', icon: AlertTriangle, count: delinquencies.length },
        { id: 'dispatch', label: 'Shipped Orders', icon: Package, count: allShippedOrders.length },
        { id: 'shopify', label: 'Shopify Store Feed', icon: ShoppingBag, count: shopifyOrders.length }
      ];
    }
    if (currentUser?.role === 'logistics') {
      return [
        { id: 'dispatch', label: 'Dispatch & RTD Queue', icon: Package, count: allShippedOrders.length + rtdOrders.length },
        { id: 'returns', label: 'Returns Received', icon: RotateCcw, count: returns.length },
        { id: 'inventory', label: 'Inventory', icon: Boxes, count: trialPairs.length + bostonStock.length },
        { id: 'trials', label: 'Trial Pairs', icon: Footprints, count: trialPairs.length },
        { id: 'shopify', label: 'Shopify Feed', icon: ShoppingBag, count: shopifyOrders.length }
      ];
    }
    return [
      { id: 'customers', label: 'CRM HUB', icon: Users, count: undefined },
      { id: 'delinquency', label: 'Delinquency Tracker', icon: AlertTriangle, count: delinquencies.length },
      { id: 'dispatch', label: 'Dispatch & RTD Queue', icon: Package, count: allShippedOrders.length + rtdOrders.length },
      { id: 'returns', label: 'Returns Tracker', icon: RotateCcw, count: returns.length },
      { id: 'inventory', label: 'Inventory', icon: Boxes, count: trialPairs.length + bostonStock.length },
      { id: 'trials', label: 'Trial Pairs', icon: Footprints, count: trialPairs.length },
      { id: 'shopify', label: 'Shopify Live', icon: ShoppingBag, count: shopifyOrders.length },
      { id: 'clubbed', label: 'Cross-Matched Orders', icon: Layers, count: crossMatchedOrders.length },
      { id: 'analytics', label: 'Analytics & Trends', icon: TrendingUp, count: undefined }
    ];
  }, [currentUser?.role, delinquencies.length, allShippedOrders.length, rtdOrders.length, returns.length, trialPairs.length, bostonStock.length, shopifyOrders.length, crossMatchedOrders.length]);

  useEffect(() => {
    const allowedTabIds = visibleTabs.map(t => t.id);
    if (!allowedTabIds.includes(activeTab)) {
      setActiveTab(allowedTabIds[0] || 'delinquency');
    }
  }, [currentUser?.role, visibleTabs, activeTab]);

  const currentTheme = getSectionTheme(activeTab);

  if (!currentUser) {
    return <AuthPortal onLoginSuccess={handleLoginSuccess} syncFeedback={syncFeedback} />;
  }

  if (effectiveRole === 'production') {
    return (
      <div className="relative w-full min-h-screen bg-neutral-100/70 text-neutral-900 font-sans pb-10">
        <Navbar
          currentUser={currentUser}
          onSelectRole={handleSelectRole}
          onOpenLogin={() => setIsLoginModalOpen(true)}
          onLogout={handleLogout}
          onOpenRemarks={() => setIsRemarksModalOpen(true)}
          onOpenShopifySync={() => {}}
          shopifyConfig={shopifyConfig}
          remarks={remarks}
          onRefreshAll={loadSupabaseData}
          activeSection={'delinquency'}
        />
        {syncFeedback && (
          <div className="bg-neutral-900 text-white text-xs font-medium py-1.5 px-4 text-center flex items-center justify-center gap-1.5 shadow-xs">
            <Check className="w-3.5 h-3.5" />
            <span>{syncFeedback}</span>
          </div>
        )}
        <main className="w-full pt-4">
          <ProductionDashboardView
            currentUser={currentUser}
            delinquencies={delinquencies}
            shopifyOrders={shopifyOrders}
            onRefresh={loadSupabaseData}
            onViewOrderSummary={handleOpenOrderSummary}
            onUpdateDelinquency={handleUpdateDelinquency}
          />
        </main>
        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          currentUser={currentUser}
          onLoginSuccess={handleLoginSuccess}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  if (effectiveRole === 'logistics') {
    return (
      <div className="relative w-full min-h-screen bg-neutral-100/70 text-neutral-900 font-sans pb-10">
        <Navbar
          currentUser={currentUser}
          onSelectRole={handleSelectRole}
          onOpenLogin={() => setIsLoginModalOpen(true)}
          onLogout={handleLogout}
          onOpenRemarks={() => setIsRemarksModalOpen(true)}
          onOpenShopifySync={() => {}}
          shopifyConfig={shopifyConfig}
          remarks={remarks}
          onRefreshAll={loadSupabaseData}
          activeSection={'dispatch'}
        />
        {syncFeedback && (
          <div className="bg-neutral-900 text-white text-xs font-medium py-1.5 px-4 text-center flex items-center justify-center gap-1.5 shadow-xs">
            <Check className="w-3.5 h-3.5" />
            <span>{syncFeedback}</span>
          </div>
        )}
        <main className="w-full pt-3">
          <LogisticsDashboardView
            currentUser={currentUser}
            rtdOrders={rtdOrders}
            dispatches={allShippedOrders}
            returns={returns}
            trialPairs={trialPairs}
            bostonStock={bostonStock}
            shopifyOrders={shopifyOrders}
            onProcessDispatch={handleProcessDispatch}
            onAddDispatch={handleAddDispatch}
            onUpdateDispatch={handleUpdateDispatch}
            onAddReturn={handleAddReturn}
            onUpdateReturn={handleUpdateReturn}
            onAddTrial={handleAddTrial}
            onUpdateTrial={handleUpdateTrial}
            onAddBostonStock={handleAddBostonStock}
            onUpdateBostonStock={handleUpdateBostonStock}
            onViewOrderSummary={handleOpenOrderSummary}
            onRefresh={loadSupabaseData}
          />
        </main>
        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          currentUser={currentUser}
          onLoginSuccess={handleLoginSuccess}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  const getSegmentTitle = (tab: string) => {
    switch (tab) {
      case 'shopify':
        return { title: 'Shopify Orders Feed', subtitle: 'Live customer orders, channel synchronization & dispatch queue' };
      case 'delinquency':
        return { title: 'Delinquency & Production Tracker', subtitle: 'Workshop stages, lead-time delays & artisan milestone progress' };
      case 'dispatch':
        return { title: 'Shipping: Dispatch & RTD Queue', subtitle: 'Ready to ship pairs, courier assignment & AWB tracking' };
      case 'returns':
        return { title: 'Returns & Reverse Logistics', subtitle: 'Customer returns, size alterations, exchanges & warranty resolution' };
      case 'inventory':
        return { title: 'Warehouse Inventory & Stock Hub', subtitle: 'Domestic (IN) & Boston (US) physical stock, rework tracking & available pairs' };
      case 'trials':
        return { title: 'Trial Pairs Fitting Hub', subtitle: 'In-field trial testing pairs, fitting feedback & turnaround tracker' };
      case 'customers':
        return { title: 'CRM 360° Client Hub', subtitle: 'Customer history, inquiry management & direct client communications' };
      case 'clubbed':
        return { title: 'Cross-Matched Orders', subtitle: 'Correlated orders across Shopify stores and Supabase workshop database' };
      case 'analytics':
        return { title: 'Executive Operations Analytics', subtitle: 'Live trend intelligence across Delayed Orders, Order Stages & Customer Returns' };
      default:
        return { title: 'Operations Dashboard', subtitle: 'BLKBRD Shoemaker artisan workshop suite' };
    }
  };

  const segmentInfo = getSegmentTitle(activeTab);

  return (
    <div className="relative w-full min-h-screen bg-neutral-100/80 text-neutral-900 font-sans transition-colors duration-700">
      <div className="fixed inset-0 pointer-events-none transition-all duration-700 ease-in-out z-0" style={{ background: currentTheme.ambientBackground }} />

      {/* 1. Dedicated Admin Sidebar */}
      <AdminSidebar
        currentSegment={activeTab === 'trials' ? 'inventory' : activeTab}
        onSelectSegment={(seg) => setActiveTab(seg === 'inventory' ? 'inventory' : seg)}
        currentUser={currentUser}
        onSelectRole={handleSelectRole}
        onLogout={handleLogout}
        onOpenShopifyConnect={() => setIsShopifyModalOpen(true)}
        onOpenRemarks={() => setIsRemarksModalOpen(true)}
        onOpenUserManagement={effectiveRole === 'admin' ? () => setIsUserManagementModalOpen(true) : undefined}
        onOpenSchemaCustomizer={effectiveRole === 'admin' ? () => handleOpenSchemaCustomizer('order_audit_events') : undefined}
        onRefreshAll={loadSupabaseData}
        isRefreshing={isShopifySyncing}
        remarks={remarks}
        shopifyConfig={shopifyConfig}
        shopifyDualConfig={shopifyDualConfig}
        counts={{
          shopifyOrders: shopifyOrders.length,
          delinquencies: delinquencies.length,
          dispatchAndRtd: allShippedOrders.length + rtdOrders.length,
          returns: returns.length,
          inventory: trialPairs.length + bostonStock.length,
          crossMatched: crossMatchedOrders.length
        }}
        isProgressiveMode={isProgressiveMode}
        onToggleProgressiveMode={() => setIsProgressiveMode(!isProgressiveMode)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
      />

      {/* 2. Main Content Area with Sidebar Offset on Desktop & Tablet */}
      <div className={`relative z-10 ${isSidebarCollapsed ? 'md:pl-20' : 'md:pl-72'} flex-1 min-h-screen flex flex-col transition-all duration-300`}>
        {/* Top Header Bar (Fully Adaptive for Mobile, Tablet & Desktop) */}
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-neutral-200/90 px-3 sm:px-6 py-2 sm:py-3 transition-all">
          <div className="flex flex-col gap-2">
            {/* Row 1: Brand/Segment Title + Fast Quick-Action Cluster */}
            <div className="flex items-center justify-between gap-2 min-w-0">
              {/* Left: Mobile Drawer Trigger, Desktop/Tablet Collapse Toggle & Segment Title */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="md:hidden p-2 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 transition cursor-pointer shadow-xs shrink-0"
                  title="Open Navigation Menu"
                  aria-label="Open Navigation Drawer"
                >
                  <Menu className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleSidebarCollapse}
                  className="hidden md:flex p-2 rounded-xl text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 border border-neutral-200/80 transition cursor-pointer shrink-0"
                  title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                >
                  <PanelLeftClose className={`w-4 h-4 transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
                </button>

                <div className="min-w-0 truncate">
                  <div className="flex items-center gap-1.5 truncate">
                    <h1 className="text-sm sm:text-base md:text-lg font-bold text-neutral-900 leading-tight truncate">
                      {segmentInfo.title}
                    </h1>
                    <span className="text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold shrink-0">
                      Live
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 hidden md:block truncate">
                    {segmentInfo.subtitle}
                  </p>
                </div>
              </div>

              {/* Right: Quick Operational Utilities Cluster */}
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                {/* Fast Sync DB Button */}
                <button
                  type="button"
                  onClick={() => loadSupabaseData(true)}
                  disabled={isShopifySyncing}
                  title="Synchronize Live Orders with Supabase Database"
                  className="p-1.5 sm:p-2 rounded-xl text-neutral-700 hover:text-neutral-950 bg-white hover:bg-neutral-100 border border-neutral-200/90 shadow-2xs transition cursor-pointer flex items-center gap-1 min-h-[36px]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-neutral-600 ${isShopifySyncing ? 'animate-spin text-amber-600' : ''}`} />
                  <span className="hidden sm:inline text-xs font-medium">{isShopifySyncing ? 'Syncing...' : 'Sync'}</span>
                </button>

                {/* Mobile Admin Quick Hub Button (< md) */}
                <button
                  type="button"
                  onClick={() => setIsMobileAdminHubOpen(true)}
                  title="Open Admin & Operations Quick Hub"
                  className="md:hidden p-1.5 rounded-xl bg-amber-500/10 text-amber-950 border border-amber-300/80 hover:bg-amber-500/20 transition cursor-pointer flex items-center gap-1 shrink-0 min-h-[36px]"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                  <span className="text-xs font-semibold">Admin</span>
                </button>

                {/* Shopify Store Channels Modal Button */}
                {effectiveRole === 'admin' && (
                  <button
                    type="button"
                    onClick={() => setIsShopifyModalOpen(true)}
                    title="Shopify Store Channels & Sync Settings"
                    className="p-1.5 sm:p-2 rounded-xl text-neutral-700 hover:text-neutral-950 bg-white hover:bg-neutral-100 border border-neutral-200/90 shadow-2xs transition cursor-pointer hidden sm:flex items-center min-h-[36px]"
                  >
                    <Store className="w-3.5 h-3.5 text-neutral-600" />
                  </button>
                )}

                {/* Workshop Remarks Stream */}
                <button
                  type="button"
                  onClick={() => setIsRemarksModalOpen(true)}
                  className="relative p-1.5 sm:p-2 rounded-xl text-neutral-700 hover:text-neutral-950 bg-white hover:bg-neutral-100 border border-neutral-200/90 shadow-2xs transition cursor-pointer min-h-[36px]"
                  title="Workshop Remarks Stream"
                >
                  <Bell className="w-3.5 h-3.5 text-neutral-600" />
                  {unreadRemarksCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white font-mono text-[9px] font-bold flex items-center justify-center">
                      {unreadRemarksCount}
                    </span>
                  )}
                </button>

                {/* Staff Wizard / Table Mode Toggle */}
                <button
                  type="button"
                  onClick={() => setIsProgressiveMode(!isProgressiveMode)}
                  title={isProgressiveMode ? 'Switch to Standard Tabular Dashboard' : 'Switch to Progressive Staff Wizard'}
                  className="hidden sm:inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-900 border border-amber-300 hover:bg-amber-500/20 transition cursor-pointer shadow-2xs shrink-0 min-h-[36px]"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>{isProgressiveMode ? 'Table View' : 'Wizard'}</span>
                </button>

                {/* Purge Local Test Data */}
                <button
                  type="button"
                  onClick={handlePurgeDummyData}
                  title="Clear local test data and reload fresh live database records"
                  className="p-1.5 sm:p-2 rounded-xl text-neutral-500 hover:text-rose-700 hover:bg-rose-50 border border-neutral-200/90 transition cursor-pointer hidden sm:flex items-center min-h-[36px]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Row 2: Universal Adaptive Search Bar */}
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search orders, customer names, shoe models, AWB tracking..."
                className="w-full pl-8 pr-8 py-1.5 bg-neutral-100/80 hover:bg-neutral-100 focus:bg-white rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden border border-neutral-200/90 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-300 transition"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {syncFeedback && (
            <div className="mt-2 bg-neutral-900 text-white text-xs font-medium py-1 px-3 rounded-lg flex items-center gap-1.5 shadow-xs animate-in fade-in">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>{syncFeedback}</span>
            </div>
          )}
        </header>

        {/* Main Body */}
        {isProgressiveMode ? (
          <main className="p-3.5 sm:p-6 lg:p-8 pb-24 sm:pb-28 lg:pb-8">
            <ProgressiveWorkflowView
              currentUser={currentUser}
              orders={shopifyOrders}
              onUpdateStatus={handleUpdateShopifyOrderStatus}
              onRefresh={loadSupabaseData}
              onToggleView={() => setIsProgressiveMode(false)}
              delinquencies={delinquencies}
              dispatches={allShippedOrders}
              returns={returns}
              trialPairs={trialPairs}
              onUpdateDelinquency={handleUpdateDelinquency}
              onProcessDispatch={handleProcessDispatch}
            />
          </main>
        ) : (
          <main className="p-4 sm:p-6 lg:p-8 space-y-5">
            {/* Top Metric Cards */}
            <DashboardSummary
              role={effectiveRole}
              readyToShipCount={readyToShipCount}
              shippedCount={allShippedOrders.length}
              delayedCount={delayedCount}
              returnsCount={returnsReceivedCount}
              trialPairsCount={trialPairs.length}
              shopifyOrdersCount={shopifyOrders.length}
              unreadRemarksCount={unreadRemarksCount}
              shopifyConnected={shopifyConfig.isConnected}
              shopifyDomain={shopifyConfig.shopDomain}
              activeSection={activeTab as SectionId}
              onOpenShopifyConnect={() => setIsShopifyModalOpen(true)}
              onFilterClick={(filter) => {
                if (filter === 'analytics') setActiveTab('analytics');
                else if (filter === 'ready' || filter === 'rtd') {
                  setActiveTab('delinquency');
                } else if (filter === 'dispatch') {
                  setActiveTab('dispatch');
                  setDispatchSubTab('dispatched');
                } else if (filter === 'delinquency') setActiveTab('delinquency');
                else if (filter === 'returns') setActiveTab('returns');
                else if (filter === 'trials') setActiveTab('inventory');
                else if (filter === 'shopify') setActiveTab('shopify');
                else if (filter === 'remarks') setIsRemarksModalOpen(true);
              }}
            />

            {/* Operations Trends & Analytics for Admin on Home Page */}
            {effectiveRole === 'admin' && activeTab !== 'analytics' && (
              <AdminHomeAnalytics
                delinquencies={delinquencies}
                shopifyOrders={shopifyOrders}
                dispatches={allShippedOrders}
                returns={returns}
                trialPairs={trialPairs}
                rtdCount={readyToShipCount}
                onNavigate={(tabId) => setActiveTab(tabId)}
              />
            )}

            {/* 1. Shopify Orders Segment */}
            {activeTab === 'shopify' && (
              <ShopifyView
                orders={shopifyOrders}
                role={effectiveRole}
                config={shopifyConfig}
                dualConfig={shopifyDualConfig}
                onRefreshShopify={handleRefreshShopify}
                onAddShopifyOrder={handleAddShopifyOrder}
                onUpdateOrderStatus={handleUpdateShopifyOrderStatus}
                onOpenConnectModal={effectiveRole === 'admin' ? () => setIsShopifyModalOpen(true) : () => {}}
                isSyncing={isShopifySyncing}
                onViewOrderSummary={handleOpenOrderSummary}
              />
            )}

            {/* 2. Delinquency Tracker Segment */}
            {activeTab === 'delinquency' && (
              <DelinquencyView
                items={filteredDelinquencies}
                role={effectiveRole}
                onUpdateItem={handleUpdateDelinquency}
                onAddItem={handleAddDelinquency}
                onBulkAddItems={handleBulkAddDelinquency}
                lookupContext={lookupContext}
                onDispatchQuick={() => { setActiveTab('dispatch'); setDispatchSubTab('rtd'); }}
                onRefresh={loadSupabaseData}
                onOpenLogin={() => setIsLoginModalOpen(true)}
                onViewOrderSummary={handleOpenOrderSummary}
                onOpenSchemaCustomizer={effectiveRole === 'admin' ? handleOpenSchemaCustomizer : undefined}
              />
            )}

            {/* 3. Shipping: Dispatch & RTD Segment */}
            {activeTab === 'dispatch' && (
              <div className="space-y-3">
                <div className="flex items-center justify-end px-1">
                  <button
                    type="button"
                    onClick={() => setLogisticsViewMode(prev => prev === 'cards' ? 'table' : 'cards')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-200/80 shadow-2xs transition cursor-pointer"
                  >
                    <PackageCheck className="w-3.5 h-3.5 text-neutral-600" />
                    <span>{logisticsViewMode === 'cards' ? 'Switch to Spreadsheet Table' : 'Switch to Order Cards View'}</span>
                  </button>
                </div>
                {logisticsViewMode === 'cards' ? (
                  <LogisticsDashboardView
                    currentUser={currentUser}
                    rtdOrders={rtdOrders}
                    dispatches={allShippedOrders}
                    returns={returns}
                    trialPairs={trialPairs}
                    bostonStock={bostonStock}
                    shopifyOrders={shopifyOrders}
                    onProcessDispatch={handleProcessDispatch}
                    onAddDispatch={handleAddDispatch}
                    onUpdateDispatch={handleUpdateDispatch}
                    onAddReturn={handleAddReturn}
                    onUpdateReturn={handleUpdateReturn}
                    onAddTrial={handleAddTrial}
                    onUpdateTrial={handleUpdateTrial}
                    onAddBostonStock={handleAddBostonStock}
                    onUpdateBostonStock={handleUpdateBostonStock}
                    onViewOrderSummary={handleOpenOrderSummary}
                    onRefresh={loadSupabaseData}
                  />
                ) : (
                  <DispatchView
                    role={effectiveRole}
                    rtdOrders={rtdOrders}
                    onAddDispatch={handleAddDispatch}
                    onUpdateDispatch={handleUpdateDispatch}
                    onProcessDispatch={handleProcessDispatch}
                    onRefreshAll={loadSupabaseData}
                    initialSubTab={dispatchSubTab}
                    onViewOrderSummary={handleOpenOrderSummary}
                  />
                )}
              </div>
            )}

            {/* 4. Returns Segment */}
            {activeTab === 'returns' && (
              <ReturnsView
                role={effectiveRole}
                bostonStock={filteredBostonStock}
                delinquencies={delinquencies}
                shopifyOrders={shopifyOrders}
                dispatches={allShippedOrders}
                returns={returns}
                onUpdateBostonStock={handleUpdateBostonStock}
                onAddBostonStock={handleAddBostonStock}
                onAddReturn={handleAddReturn}
                onUpdateReturn={handleUpdateReturn}
                onRefreshAll={loadSupabaseData}
                onViewOrderSummary={handleOpenOrderSummary}
              />
            )}

            {/* 5. Inventory Segment */}
            {activeTab === 'inventory' && (
              <InventoryView
                role={effectiveRole}
                trialPairs={filteredTrialPairs}
                bostonStock={filteredBostonStock}
                onUpdateTrial={handleUpdateTrial}
                onAddTrial={handleAddTrial}
                onUpdateBostonStock={handleUpdateBostonStock}
                onAddBostonStock={handleAddBostonStock}
                onRefreshAll={loadSupabaseData}
                onViewOrderSummary={handleOpenOrderSummary}
                lookupContext={lookupContext}
              />
            )}

            {/* Trial Pairs Standalone View */}
            {activeTab === 'trials' && (
              <TrialPairsView
                trialPairs={filteredTrialPairs}
                role={effectiveRole}
                onUpdateTrial={handleUpdateTrial}
                onAddTrial={handleAddTrial}
                onViewOrderSummary={handleOpenOrderSummary}
              />
            )}

            {/* 6. CRM HUB Segment */}
            {activeTab === 'customers' && (
              <CustomerCrmView
                role={effectiveRole}
                currentUser={currentUser}
                lookupContext={lookupContext}
                onViewOrderSummary={handleOpenOrderSummary}
                onOpenSchemaCustomizer={effectiveRole === 'admin' ? handleOpenSchemaCustomizer : undefined}
              />
            )}

            {/* 7. Specialized: Cross-Matched Orders Segment */}
            {activeTab === 'clubbed' && (
              <div className="space-y-4">
                <ClubbedOrderExplorer
                  orders={crossMatchedOrders.map(c => {
                    const shopifyMatch = shopifyOrders.find(s => orderIdsMatch(s.orderNumber, c.orderId));
                    const delinquencyMatch = delinquencies.find(d => orderIdsMatch(d.orderId, c.orderId));
                    return {
                      orderNumber: c.orderId,
                      customerName: c.customer,
                      storeAccount: delinquencyMatch?.storeAccount || 'Global',
                      shopifyDetails: shopifyMatch,
                      delinquencyDetails: delinquencyMatch
                    };
                  })}
                  onViewOrderSummary={handleOpenOrderSummary}
                />
              </div>
            )}

            {/* 8. Dedicated Operations Trends & Analytics View */}
            {activeTab === 'analytics' && (
              <AdminHomeAnalytics
                delinquencies={delinquencies}
                shopifyOrders={shopifyOrders}
                dispatches={allShippedOrders}
                returns={returns}
                trialPairs={trialPairs}
                rtdCount={readyToShipCount}
                onNavigate={(tabId) => setActiveTab(tabId)}
                isStandaloneTab={true}
              />
            )}
          </main>
        )}

        {/* Mobile Fixed Bottom Navigation Bar (< md) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-200/90 px-2 py-1.5 shadow-lg flex items-center justify-around">
          <button
            type="button"
            onClick={() => setActiveTab('shopify')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition cursor-pointer min-w-[54px] relative ${
              activeTab === 'shopify' ? 'text-neutral-950 font-bold' : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${activeTab === 'shopify' ? 'bg-neutral-900 text-white' : ''}`}>
              <ShoppingBag className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5">Shopify</span>
            {shopifyOrders.length > 0 && (
              <span className="absolute top-0 right-1 px-1 min-w-[14px] h-3.5 rounded-full bg-neutral-100 text-neutral-800 text-[9px] font-mono font-bold flex items-center justify-center border border-neutral-300">
                {shopifyOrders.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('delinquency')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition cursor-pointer min-w-[54px] relative ${
              activeTab === 'delinquency' ? 'text-neutral-950 font-bold' : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${activeTab === 'delinquency' ? 'bg-amber-600 text-white' : ''}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5">Delays</span>
            {delayedCount > 0 && (
              <span className="absolute top-0 right-1 px-1 min-w-[14px] h-3.5 rounded-full bg-amber-500 text-white text-[9px] font-mono font-bold flex items-center justify-center">
                {delayedCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dispatch')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition cursor-pointer min-w-[54px] relative ${
              activeTab === 'dispatch' ? 'text-neutral-950 font-bold' : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${activeTab === 'dispatch' ? 'bg-emerald-600 text-white' : ''}`}>
              <Package className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5">Dispatch</span>
            {rtdOrders.length > 0 && (
              <span className="absolute top-0 right-1 px-1 min-w-[14px] h-3.5 rounded-full bg-emerald-500 text-white text-[9px] font-mono font-bold flex items-center justify-center">
                {rtdOrders.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('returns')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition cursor-pointer min-w-[54px] relative ${
              activeTab === 'returns' ? 'text-neutral-950 font-bold' : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <div className={`p-1 rounded-lg ${activeTab === 'returns' ? 'bg-indigo-600 text-white' : ''}`}>
              <RotateCcw className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5">Returns</span>
            {returns.length > 0 && (
              <span className="absolute top-0 right-1 px-1 min-w-[14px] h-3.5 rounded-full bg-neutral-200 text-neutral-800 text-[9px] font-mono font-semibold flex items-center justify-center">
                {returns.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsMobileAdminHubOpen(true)}
            className="flex flex-col items-center justify-center py-1 px-2 rounded-xl transition cursor-pointer min-w-[54px] relative text-neutral-600 hover:text-neutral-950"
            title="Open Operations & Admin Quick Hub"
          >
            <div className="p-1 rounded-lg bg-amber-500/15 text-amber-900 border border-amber-300/80">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold tracking-tight mt-0.5">Admin Hub</span>
            {unreadRemarksCount > 0 && (
              <span className="absolute top-0 right-1 w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse border border-white" />
            )}
          </button>
        </nav>

        {/* Mobile & Tablet Operations & Admin Hub Bottom Sheet */}
        {isMobileAdminHubOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end bg-neutral-950/60 backdrop-blur-xs animate-in fade-in">
            <div
              className="absolute inset-0"
              onClick={() => setIsMobileAdminHubOpen(false)}
            />
            <div className="relative bg-white rounded-t-3xl border-t border-neutral-200 shadow-2xl max-h-[85vh] overflow-y-auto flex flex-col animate-in slide-in-from-bottom duration-200 pb-8">
              {/* Drag Handle */}
              <div className="w-10 h-1.5 bg-neutral-300 rounded-full mx-auto my-3 shrink-0" />

              {/* Header */}
              <div className="px-5 pb-3 border-b border-neutral-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-neutral-900 text-sm">Operations &amp; Admin Hub</h3>
                  <p className="text-[11px] text-neutral-500">Quick access to all workshop tools and admin controls</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileAdminHubOpen(false)}
                  className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-4 space-y-4">
                {/* Role Switcher */}
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold mb-1.5 px-1">
                    Active Department Role
                  </div>
                  <div className="bg-neutral-100 p-1.5 rounded-xl border border-neutral-200/80 grid grid-cols-4 gap-1">
                    {(['admin', 'production', 'logistics', 'crm'] as UserRole[]).map((r) => {
                      const isSelected = effectiveRole === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => handleSelectRole(r)}
                          className={`py-1.5 px-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition cursor-pointer text-center ${
                            isSelected
                              ? 'bg-neutral-900 text-white shadow-2xs'
                              : 'text-neutral-500 hover:text-neutral-900 hover:bg-white/80'
                          }`}
                        >
                          {r === 'production' ? 'Prod' : r === 'logistics' ? 'Log' : r}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Additional Segments */}
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold mb-1.5 px-1">
                    Hub Segments
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('analytics');
                        setIsMobileAdminHubOpen(false);
                      }}
                      className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                        activeTab === 'analytics' ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-bold' : 'bg-neutral-50 border-neutral-200 text-neutral-700'
                      }`}
                    >
                      <TrendingUp className="w-5 h-5 text-indigo-600 mb-1" />
                      <div>
                        <div className="text-xs font-semibold">Trends &amp; Analytics</div>
                        <div className="text-[10px] text-neutral-500">Delays, Stages &amp; Returns</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('customers');
                        setIsMobileAdminHubOpen(false);
                      }}
                      className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                        activeTab === 'customers' ? 'bg-teal-50 border-teal-300 text-teal-950 font-bold' : 'bg-neutral-50 border-neutral-200 text-neutral-700'
                      }`}
                    >
                      <Users className="w-5 h-5 text-teal-600 mb-1" />
                      <div>
                        <div className="text-xs font-semibold">CRM Hub</div>
                        <div className="text-[10px] text-neutral-500">360° Inquiries</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('inventory');
                        setIsMobileAdminHubOpen(false);
                      }}
                      className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                        activeTab === 'inventory' || activeTab === 'trials' ? 'bg-amber-50 border-amber-300 text-amber-950 font-bold' : 'bg-neutral-50 border-neutral-200 text-neutral-700'
                      }`}
                    >
                      <Boxes className="w-5 h-5 text-amber-600 mb-1" />
                      <div>
                        <div className="text-xs font-semibold">Inventory</div>
                        <div className="text-[10px] text-neutral-500">{trialPairs.length + bostonStock.length} Pairs</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('clubbed');
                        setIsMobileAdminHubOpen(false);
                      }}
                      className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                        activeTab === 'clubbed' ? 'bg-purple-50 border-purple-300 text-purple-950 font-bold' : 'bg-neutral-50 border-neutral-200 text-neutral-700'
                      }`}
                    >
                      <Layers className="w-5 h-5 text-purple-600 mb-1" />
                      <div>
                        <div className="text-xs font-semibold">Cross-Matched</div>
                        <div className="text-[10px] text-neutral-500">{crossMatchedOrders.length} Linked</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Admin Management Tools */}
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold mb-1.5 px-1">
                    Admin Management Tools
                  </div>
                  <div className="space-y-1.5">
                    {effectiveRole === 'admin' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setIsUserManagementModalOpen(true);
                            setIsMobileAdminHubOpen(false);
                          }}
                          className="w-full p-3 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 flex items-center justify-between text-xs font-medium text-neutral-800 cursor-pointer min-h-[44px]"
                        >
                          <div className="flex items-center gap-2.5">
                            <ShieldCheck className="w-4 h-4 text-neutral-700" />
                            <span>Team &amp; Staff Access Management</span>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-200 text-neutral-700">
                            Staff Roster
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            handleOpenSchemaCustomizer('order_audit_events');
                            setIsMobileAdminHubOpen(false);
                          }}
                          className="w-full p-3 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 flex items-center justify-between text-xs font-medium text-neutral-800 cursor-pointer min-h-[44px]"
                        >
                          <div className="flex items-center gap-2.5">
                            <Sliders className="w-4 h-4 text-neutral-700" />
                            <span>Custom Table Schema &amp; Elements</span>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-200 text-neutral-700">
                            Supabase Fields
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setIsShopifyModalOpen(true);
                            setIsMobileAdminHubOpen(false);
                          }}
                          className="w-full p-3 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 flex items-center justify-between text-xs font-medium text-neutral-800 cursor-pointer min-h-[44px]"
                        >
                          <div className="flex items-center gap-2.5">
                            <Store className="w-4 h-4 text-neutral-700" />
                            <span>Shopify Store Channels (Global &amp; LLC)</span>
                          </div>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                            shopifyConfig.isConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-600'
                          }`}>
                            Dual Sync
                          </span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setIsRemarksModalOpen(true);
                        setIsMobileAdminHubOpen(false);
                      }}
                      className="w-full p-3 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 flex items-center justify-between text-xs font-medium text-neutral-800 cursor-pointer min-h-[44px]"
                    >
                      <div className="flex items-center gap-2.5">
                        <Bell className="w-4 h-4 text-neutral-700" />
                        <span>Workshop Remarks Stream</span>
                      </div>
                      {unreadRemarksCount > 0 ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500 text-white font-bold">
                          {unreadRemarksCount} new
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-200 text-neutral-600">
                          Stream
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsProgressiveMode(!isProgressiveMode);
                        setIsMobileAdminHubOpen(false);
                      }}
                      className="w-full p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-300 flex items-center justify-between text-xs font-semibold text-amber-950 cursor-pointer min-h-[44px]"
                    >
                      <div className="flex items-center gap-2.5">
                        <Sparkles className="w-4 h-4 text-amber-600" />
                        <span>Staff Progressive Wizard Mode</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                        {isProgressiveMode ? 'Active (Table View)' : 'Inactive (Enable)'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        loadSupabaseData(true);
                        setIsMobileAdminHubOpen(false);
                      }}
                      disabled={isShopifySyncing}
                      className="w-full p-3 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 flex items-center justify-between text-xs font-medium text-neutral-800 cursor-pointer min-h-[44px]"
                    >
                      <div className="flex items-center gap-2.5">
                        <RefreshCw className={`w-4 h-4 text-neutral-700 ${isShopifySyncing ? 'animate-spin' : ''}`} />
                        <span>Synchronize Database Live</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-200 text-neutral-700">
                        {isShopifySyncing ? 'Syncing...' : 'Fetch All'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handlePurgeDummyData();
                        setIsMobileAdminHubOpen(false);
                      }}
                      className="w-full p-3 rounded-xl bg-rose-50/70 hover:bg-rose-100/70 border border-rose-200 flex items-center justify-between text-xs font-medium text-rose-800 cursor-pointer min-h-[44px]"
                    >
                      <div className="flex items-center gap-2.5">
                        <RotateCcw className="w-4 h-4 text-rose-600" />
                        <span>Reset &amp; Purge Local Test Data</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-100 text-rose-700">
                        Live Reset
                      </span>
                    </button>
                  </div>
                </div>

                {/* Profile & Sign Out */}
                <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-neutral-900 text-white flex items-center justify-center font-bold text-xs">
                      {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'B'}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-semibold text-neutral-900 truncate">
                        {currentUser?.displayName || currentUser?.name || 'Administrator'}
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono truncate">
                        {currentUser?.email || 'crm3.blkbrdshoemaker@gmail.com'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      handleLogout();
                      setIsMobileAdminHubOpen(false);
                    }}
                    className="p-2 rounded-xl text-neutral-500 hover:text-rose-600 hover:bg-rose-50 border border-neutral-200 flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Global Modals */}
        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          currentUser={currentUser}
          onLoginSuccess={handleLoginSuccess}
          onLogout={handleLogout}
        />
        <ShopifyConnectModal
          isOpen={isShopifyModalOpen}
          onClose={() => setIsShopifyModalOpen(false)}
          config={shopifyConfig}
          dualConfig={shopifyDualConfig}
          onConfigChange={(cfg) => {
            setShopifyConfig(cfg);
            saveStoredShopifyConfig(cfg);
          }}
          onDualConfigChange={(dual) => {
            setShopifyDualConfig(dual);
            saveStoredShopifyDualConfig(dual);
            setShopifyConfig(getStoredShopifyConfig());
          }}
          onOrdersFetched={(orders) => {
            setShopifyOrders(orders);
            setSyncFeedback(`Synced ${orders.length} orders across Shopify stores`);
            setTimeout(() => setSyncFeedback(null), 3000);
          }}
          ordersCount={shopifyOrders.length}
        />
        <ProductionRemarksModal
          isOpen={isRemarksModalOpen}
          onClose={() => setIsRemarksModalOpen(false)}
          remarks={remarks}
          onMarkAsRead={(id) => { markRemarkAsRead(id); setRemarks(getProductionRemarks()); }}
          onMarkAllAsRead={() => { markAllRemarksAsRead(); setRemarks(getProductionRemarks()); }}
          onNavigateToOrder={(orderId) => { setIsRemarksModalOpen(false); handleOpenOrderSummary(orderId); }}
          onOpenSchemaCustomizer={() => handleOpenSchemaCustomizer('production_remarks')}
        />
        <OrderSummaryModal
          isOpen={!!selectedOrderSummaryId}
          orderId={selectedOrderSummaryId}
          onClose={() => setSelectedOrderSummaryId(null)}
          context={{ delinquencies, dispatches, returns, trialPairs, shopifyOrders, productionRemarks: remarks }}
          currentUser={currentUser}
          onRemarkAdded={async () => { setRemarks(getProductionRemarks()); await loadSupabaseData(); }}
          onNavigateToTab={(tab) => { setActiveTab(tab as any); }}
          onOpenSchemaCustomizer={effectiveRole === 'admin' ? handleOpenSchemaCustomizer : undefined}
        />
        {effectiveRole === 'admin' && (
          <TableSchemaCustomizerModal
            isOpen={isSchemaCustomizerOpen}
            onClose={() => setIsSchemaCustomizerOpen(false)}
            initialTableKey={schemaCustomizerInitialTable}
            onSchemaUpdated={() => {
              setSyncFeedback('Table schema customization updated & applied');
              setTimeout(() => setSyncFeedback(null), 3000);
            }}
          />
        )}
        {effectiveRole === 'admin' && (
          <UserManagementModal
            isOpen={isUserManagementModalOpen}
            onClose={() => setIsUserManagementModalOpen(false)}
            currentUserEmail={currentUser?.email}
          />
        )}
      </div>
    </div>
  );
}