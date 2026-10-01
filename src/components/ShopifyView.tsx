/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ShopifyOrder, UserRole } from '../types';
import {
  ShopifyConfig,
  ShopifyDualConfig,
  getStoredShopifyDualConfig
} from '../services/shopifyApi';
import {
  RefreshCw,
  ShoppingBag,
  ExternalLink,
  Store,
  Check,
  Search,
  Filter,
  ArrowUpDown,
  Plus,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  Truck,
  Globe,
  Building2,
  X,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Package,
  Layers,
  LayoutGrid,
  List,
  Calendar,
  Eye
} from 'lucide-react';
import { formatBlkbrdOrderId } from '../utils/csvParser';
import { calculateDelayInfo, calculateExpectedDate } from '../utils/delinquencyUtils';
import { AddShopifyOrderModal } from './AddShopifyOrderModal';
import { ProductThumbnail } from './ProductThumbnail';
import { getShopifyAdminOrderUrl } from '../utils/customerResolver';
import { resolveProductImage } from '../services/productImageService';

interface ShopifyViewProps {
  orders: ShopifyOrder[];
  role: UserRole;
  config: ShopifyConfig;
  dualConfig?: ShopifyDualConfig;
  onRefreshShopify: () => void;
  onAddShopifyOrder?: (order: ShopifyOrder) => Promise<void> | void;
  onUpdateOrderStatus: (orderId: string, status: 'Ready to Ship' | 'Shipped' | 'Delayed') => void;
  onOpenConnectModal: () => void;
  isSyncing: boolean;
  onViewOrderSummary?: (orderId: string) => void;
}

type TabKey = 'all' | 'unfulfilled' | 'rtd' | 'delayed' | 'shipped' | 'global' | 'llc';
type SortKey = 'date-desc' | 'date-asc' | 'order-desc' | 'order-asc' | 'total-desc' | 'total-asc';

export const ShopifyView: React.FC<ShopifyViewProps> = ({
  orders,
  role,
  config,
  dualConfig: propDualConfig,
  onRefreshShopify,
  onAddShopifyOrder,
  onUpdateOrderStatus,
  onOpenConnectModal,
  isSyncing,
  onViewOrderSummary
}) => {
  // Navigation tabs in Polaris style
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState<'ALL' | 'Global' | 'LLC'>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'paid' | 'pending' | 'refunded'>('ALL');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<'ALL' | 'unfulfilled' | 'fulfilled'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('date-desc');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // View Mode: Cards vs Table (Card-based default)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Bulk selection
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSizeOption, setPageSizeOption] = useState<string>('50');

  // Add order modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const dualConfig = propDualConfig || getStoredShopifyDualConfig();

  // Store segregation
  const globalOrders = useMemo(() => {
    return orders.filter(
      o => o.storeAccount === 'Global' || (!o.storeAccount && o.currency !== 'USD' && !o.orderNumber?.startsWith('US'))
    );
  }, [orders]);

  const llcOrders = useMemo(() => {
    return orders.filter(
      o => o.storeAccount === 'LLC' || o.currency === 'USD' || o.orderNumber?.startsWith('US')
    );
  }, [orders]);

  // Tab counts
  const unfulfilledCount = useMemo(() => orders.filter(o => o.fulfillmentStatus === 'unfulfilled').length, [orders]);
  const rtdCount = useMemo(() => orders.filter(o => o.operationalStatus === 'Ready to Ship').length, [orders]);
  const delayedCount = useMemo(() => orders.filter(o => o.operationalStatus === 'Delayed').length, [orders]);
  const shippedCount = useMemo(() => orders.filter(o => o.operationalStatus === 'Shipped').length, [orders]);

  // Filtered orders pipeline
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const isLLC = order.storeAccount === 'LLC' || order.currency === 'USD' || order.orderNumber?.startsWith('US');
      const isGlobal = !isLLC;

      // 1. Tab filtering
      if (activeTab === 'unfulfilled' && order.fulfillmentStatus !== 'unfulfilled') return false;
      if (activeTab === 'rtd' && order.operationalStatus !== 'Ready to Ship') return false;
      if (activeTab === 'delayed' && order.operationalStatus !== 'Delayed') return false;
      if (activeTab === 'shipped' && order.operationalStatus !== 'Shipped') return false;
      if (activeTab === 'global' && !isGlobal) return false;
      if (activeTab === 'llc' && !isLLC) return false;

      // 2. Secondary Dropdown filters
      if (storeFilter === 'Global' && !isGlobal) return false;
      if (storeFilter === 'LLC' && !isLLC) return false;
      if (paymentFilter !== 'ALL' && order.financialStatus !== paymentFilter) return false;
      if (fulfillmentFilter !== 'ALL' && order.fulfillmentStatus !== fulfillmentFilter) return false;

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const num = (order.orderNumber || '').toLowerCase();
        const cust = (order.customerName || '').toLowerCase();
        const email = (order.email || '').toLowerCase();
        const items = (order.lineItems || '').toLowerCase();
        const notes = (order.notes || '').toLowerCase();
        const phone = (order.phone || '').toLowerCase();
        if (!num.includes(q) && !cust.includes(q) && !email.includes(q) && !items.includes(q) && !notes.includes(q) && !phone.includes(q)) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortKey === 'date-desc') {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        if (timeB !== timeA) return timeB - timeA;
        const numA = parseInt(a.orderNumber.replace(/\D/g, '') || '0', 10);
        const numB = parseInt(b.orderNumber.replace(/\D/g, '') || '0', 10);
        return numB - numA;
      }
      if (sortKey === 'date-asc') {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        const numA = parseInt(a.orderNumber.replace(/\D/g, '') || '0', 10);
        const numB = parseInt(b.orderNumber.replace(/\D/g, '') || '0', 10);
        return numA - numB;
      }
      if (sortKey === 'order-desc') {
        return parseInt(b.orderNumber.replace(/\D/g, '') || '0', 10) - parseInt(a.orderNumber.replace(/\D/g, '') || '0', 10);
      }
      if (sortKey === 'order-asc') {
        return parseInt(a.orderNumber.replace(/\D/g, '') || '0', 10) - parseInt(b.orderNumber.replace(/\D/g, '') || '0', 10);
      }
      if (sortKey === 'total-desc') {
        const pA = parseFloat(a.totalPrice?.replace(/[^\d.]/g, '') || '0');
        const pB = parseFloat(b.totalPrice?.replace(/[^\d.]/g, '') || '0');
        return pB - pA;
      }
      if (sortKey === 'total-asc') {
        const pA = parseFloat(a.totalPrice?.replace(/[^\d.]/g, '') || '0');
        const pB = parseFloat(b.totalPrice?.replace(/[^\d.]/g, '') || '0');
        return pA - pB;
      }
      return 0;
    });
  }, [orders, activeTab, storeFilter, paymentFilter, fulfillmentFilter, searchQuery, sortKey]);

  // Paginated slice
  const pageSize = pageSizeOption === 'all' ? Math.max(1, filteredOrders.length || 1) : parseInt(pageSizeOption, 10);
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  // Selection handlers
  const handleSelectAllOnPage = () => {
    const next = new Set(selectedOrderIds);
    const allSelected = paginatedOrders.every(o => next.has(o.id));
    if (allSelected) {
      paginatedOrders.forEach(o => next.delete(o.id));
    } else {
      paginatedOrders.forEach(o => next.add(o.id));
    }
    setSelectedOrderIds(next);
  };

  const handleToggleSelectOrder = (id: string) => {
    const next = new Set(selectedOrderIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedOrderIds(next);
  };

  const handleBulkUpdateStatus = (status: 'Ready to Ship' | 'Delayed' | 'Shipped') => {
    selectedOrderIds.forEach(id => {
      onUpdateOrderStatus(id, status);
    });
    setSelectedOrderIds(new Set());
  };

  // CSV Export handler
  const handleExportCsv = () => {
    if (filteredOrders.length === 0) return;
    const headers = ['Order Number', 'Date', 'Customer Name', 'Email', 'Phone', 'Store Account', 'Total Price', 'Currency', 'Payment Status', 'Fulfillment Status', 'Operational Status', 'Line Items', 'Notes'];
    const rows = filteredOrders.map(o => [
      `"${o.orderNumber || ''}"`,
      `"${o.createdAt || ''}"`,
      `"${(o.customerName || '').replace(/"/g, '""')}"`,
      `"${o.email || ''}"`,
      `"${o.phone || ''}"`,
      `"${o.storeAccount || 'Global'}"`,
      `"${o.totalPrice || ''}"`,
      `"${o.currency || 'INR'}"`,
      `"${o.financialStatus || ''}"`,
      `"${o.fulfillmentStatus || ''}"`,
      `"${o.operationalStatus || ''}"`,
      `"${(o.lineItems || '').replace(/"/g, '""')}"`,
      `"${(o.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `shopify_orders_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper date formatter
  const formatPolarisDate = (isoStr?: string) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  const isAllPageSelected = paginatedOrders.length > 0 && paginatedOrders.every(o => selectedOrderIds.has(o.id));
  const isSomePageSelected = paginatedOrders.some(o => selectedOrderIds.has(o.id)) && !isAllPageSelected;

  return (
    <div className="space-y-4 font-sans text-[#202223]">
      {/* 1. Authentic Shopify Polaris Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#202223] tracking-tight">Orders</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f1f2f3] text-[#4a4a4a] border border-[#e1e3e5]">
              {orders.length}
            </span>
          </div>
          <span className="text-xs text-[#6d7175] hidden md:inline">
            Shopify Dual-Store Multi-Channel Sync
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Export Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredOrders.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#f7f7f8] active:bg-[#ebebeb] text-[#202223] border border-[#c9cccf] rounded-lg text-xs font-medium shadow-xs transition cursor-pointer disabled:opacity-50"
            title="Export filtered orders to CSV"
          >
            <Download className="w-3.5 h-3.5 text-[#5c5f62]" />
            <span>Export</span>
          </button>

          {/* Sync Stores Button */}
          <button
            type="button"
            onClick={onRefreshShopify}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#f7f7f8] active:bg-[#ebebeb] text-[#202223] border border-[#c9cccf] rounded-lg text-xs font-medium shadow-xs transition cursor-pointer disabled:opacity-50"
            title="Refresh orders live from Shopify API"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#5c5f62] ${isSyncing ? 'animate-spin text-[#008060]' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Both Stores'}</span>
          </button>

          {/* Manage Store Accounts */}
          {role === 'admin' && (
            <button
              type="button"
              onClick={onOpenConnectModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#f7f7f8] text-[#202223] border border-[#c9cccf] rounded-lg text-xs font-medium shadow-xs transition cursor-pointer"
            >
              <Store className="w-3.5 h-3.5 text-[#5c5f62]" />
              <span className="hidden sm:inline">Store Connections</span>
            </button>
          )}

          {/* Create Order (Primary Polaris Charcoal/Black Button) */}
          {role === 'admin' && onAddShopifyOrder && (
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1a1a1a] hover:bg-[#303030] text-white rounded-lg text-xs font-medium shadow-xs transition cursor-pointer active:scale-[0.98]"
              title="Add manual bespoke / phone / direct Shopify order"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Create order</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Connected Sales Channels / Store Switcher Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Global Channel Card */}
        <div 
          onClick={() => setActiveTab('global')}
          className={`p-3.5 rounded-xl border transition cursor-pointer ${
            activeTab === 'global'
              ? 'bg-[#f0f9ff] border-[#0284c7] shadow-xs'
              : 'bg-white hover:bg-[#fafafa] border-[#e1e3e5]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#e0f2fe] text-[#0369a1] flex items-center justify-center font-bold text-xs shrink-0">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#202223]">BLKBRD Global</span>
                  {dualConfig.global.isConnected ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0e5828] bg-[#cbf4c9] px-2 py-0.2 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#108043]"></span>
                      Live
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#6d7175] bg-[#f1f2f3] px-2 py-0.2 rounded-full">
                      Offline
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#6d7175] font-mono">
                  blackbirdshoes.myshopify.com · INR/Intl
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-[#202223] font-mono">{globalOrders.length}</span>
              <span className="text-[11px] text-[#6d7175] block">orders</span>
            </div>
          </div>
        </div>

        {/* LLC Channel Card */}
        <div 
          onClick={() => setActiveTab('llc')}
          className={`p-3.5 rounded-xl border transition cursor-pointer ${
            activeTab === 'llc'
              ? 'bg-[#faf5ff] border-[#7c3aed] shadow-xs'
              : 'bg-white hover:bg-[#fafafa] border-[#e1e3e5]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#f3e8ff] text-[#7e22ce] flex items-center justify-center font-bold text-xs shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#202223]">BLKBRD USA (LLC)</span>
                  {dualConfig.llc.isConnected ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0e5828] bg-[#cbf4c9] px-2 py-0.2 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#108043]"></span>
                      Live
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#6d7175] bg-[#f1f2f3] px-2 py-0.2 rounded-full">
                      Offline
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#6d7175] font-mono">
                  blkbrdusa.myshopify.com · USD/USA
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-[#202223] font-mono">{llcOrders.length}</span>
              <span className="text-[11px] text-[#6d7175] block">orders</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. The Iconic Polaris Index Table Card Container */}
      <div className="bg-white rounded-xl border border-[#e1e3e5] shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_3px_0_rgba(0,0,0,0.05)] overflow-hidden">
        
        {/* A. Polaris Tab Navigation Bar */}
        <div className="flex items-center gap-1 border-b border-[#e1e3e5] px-3 overflow-x-auto scrollbar-none bg-[#ffffff]">
          <button
            type="button"
            onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
            className={`py-3 px-3 text-xs font-medium whitespace-nowrap transition cursor-pointer relative ${
              activeTab === 'all'
                ? 'text-[#202223] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#1a1a1a]'
                : 'text-[#6d7175] hover:text-[#202223]'
            }`}
          >
            <span>All</span>
            <span className="ml-1.5 text-[11px] text-[#8c9196] font-normal">({orders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('unfulfilled'); setCurrentPage(1); }}
            className={`py-3 px-3 text-xs font-medium whitespace-nowrap transition cursor-pointer relative ${
              activeTab === 'unfulfilled'
                ? 'text-[#202223] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#1a1a1a]'
                : 'text-[#6d7175] hover:text-[#202223]'
            }`}
          >
            <span>Unfulfilled</span>
            <span className="ml-1.5 text-[11px] text-[#8c9196] font-normal">({unfulfilledCount})</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('rtd'); setCurrentPage(1); }}
            className={`py-3 px-3 text-xs font-medium whitespace-nowrap transition cursor-pointer relative ${
              activeTab === 'rtd'
                ? 'text-[#202223] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#1a1a1a]'
                : 'text-[#6d7175] hover:text-[#202223]'
            }`}
          >
            <span>Ready to Dispatch (RTD)</span>
            <span className="ml-1.5 text-[11px] text-[#8c9196] font-normal">({rtdCount})</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('delayed'); setCurrentPage(1); }}
            className={`py-3 px-3 text-xs font-medium whitespace-nowrap transition cursor-pointer relative ${
              activeTab === 'delayed'
                ? 'text-[#202223] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#1a1a1a]'
                : 'text-[#6d7175] hover:text-[#202223]'
            }`}
          >
            <span>Delayed / Workshop Review</span>
            <span className="ml-1.5 text-[11px] text-[#8c9196] font-normal">({delayedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('shipped'); setCurrentPage(1); }}
            className={`py-3 px-3 text-xs font-medium whitespace-nowrap transition cursor-pointer relative ${
              activeTab === 'shipped'
                ? 'text-[#202223] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#1a1a1a]'
                : 'text-[#6d7175] hover:text-[#202223]'
            }`}
          >
            <span>Fulfilled / Shipped</span>
            <span className="ml-1.5 text-[11px] text-[#8c9196] font-normal">({shippedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('global'); setCurrentPage(1); }}
            className={`py-3 px-3 text-xs font-medium whitespace-nowrap transition cursor-pointer relative ${
              activeTab === 'global'
                ? 'text-[#202223] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#1a1a1a]'
                : 'text-[#6d7175] hover:text-[#202223]'
            }`}
          >
            <span>Global Store</span>
            <span className="ml-1.5 text-[11px] text-[#8c9196] font-normal">({globalOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('llc'); setCurrentPage(1); }}
            className={`py-3 px-3 text-xs font-medium whitespace-nowrap transition cursor-pointer relative ${
              activeTab === 'llc'
                ? 'text-[#202223] font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#1a1a1a]'
                : 'text-[#6d7175] hover:text-[#202223]'
            }`}
          >
            <span>LLC (USA)</span>
            <span className="ml-1.5 text-[11px] text-[#8c9196] font-normal">({llcOrders.length})</span>
          </button>
        </div>

        {/* B. Polaris Search & Quick Filters Bar */}
        <div className="p-3 border-b border-[#e1e3e5] bg-[#fafafa] flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-1">
            {/* Search Input */}
            <div className="relative flex-1 max-w-lg">
              <Search className="w-3.5 h-3.5 text-[#8c9196] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Search and filter orders by customer, #, product, email..."
                className="w-full text-xs pl-8 pr-7 py-2 bg-white border border-[#c9cccf] hover:border-[#8c9196] focus:border-[#005bd3] focus:ring-1 focus:ring-[#005bd3] rounded-lg text-[#202223] placeholder-[#8c9196] transition outline-hidden"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8c9196] hover:text-[#202223] p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filter Toggle */}
            <button
              type="button"
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-medium transition cursor-pointer ${
                showFilterDropdown || storeFilter !== 'ALL' || paymentFilter !== 'ALL' || fulfillmentFilter !== 'ALL'
                  ? 'bg-[#f1f2f3] border-[#8c9196] text-[#202223]'
                  : 'bg-white hover:bg-[#f7f7f8] border-[#c9cccf] text-[#202223]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#5c5f62]" />
              <span>Filters</span>
              {(storeFilter !== 'ALL' || paymentFilter !== 'ALL' || fulfillmentFilter !== 'ALL') && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#005bd3]"></span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 justify-between md:justify-end">
            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 text-xs text-[#6d7175]">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#8c9196]" />
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                className="text-xs bg-white border border-[#c9cccf] hover:border-[#8c9196] rounded-lg px-2.5 py-1.5 text-[#202223] font-medium outline-hidden cursor-pointer"
              >
                <option value="date-desc">Date (newest first)</option>
                <option value="date-asc">Date (oldest first)</option>
                <option value="order-desc">Order number (high to low)</option>
                <option value="order-asc">Order number (low to high)</option>
                <option value="total-desc">Total amount (high to low)</option>
                <option value="total-asc">Total amount (low to high)</option>
              </select>
            </div>

            {/* View Mode Toggle (Cards vs Table) */}
            <div className="flex items-center p-0.5 bg-neutral-200/80 rounded-lg border border-neutral-300/80 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
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
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
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

            <span className="text-xs text-[#6d7175] font-mono whitespace-nowrap">
              {filteredOrders.length} orders
            </span>
          </div>
        </div>

        {/* Secondary Filters Tray (Collapsible) */}
        {showFilterDropdown && (
          <div className="p-3 bg-[#f6f6f7] border-b border-[#e1e3e5] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-[#6d7175] uppercase tracking-wider mb-1">
                Store Account
              </label>
              <select
                value={storeFilter}
                onChange={e => { setStoreFilter(e.target.value as any); setCurrentPage(1); }}
                className="w-full text-xs bg-white border border-[#c9cccf] rounded-lg px-2.5 py-1.5 text-[#202223]"
              >
                <option value="ALL">All Stores (Global &amp; LLC)</option>
                <option value="Global">Global Store (blackbirdshoes)</option>
                <option value="LLC">LLC Store (blkbrdusa)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#6d7175] uppercase tracking-wider mb-1">
                Payment Status
              </label>
              <select
                value={paymentFilter}
                onChange={e => { setPaymentFilter(e.target.value as any); setCurrentPage(1); }}
                className="w-full text-xs bg-white border border-[#c9cccf] rounded-lg px-2.5 py-1.5 text-[#202223]"
              >
                <option value="ALL">All Payment Statuses</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#6d7175] uppercase tracking-wider mb-1">
                Fulfillment Status
              </label>
              <select
                value={fulfillmentFilter}
                onChange={e => { setFulfillmentFilter(e.target.value as any); setCurrentPage(1); }}
                className="w-full text-xs bg-white border border-[#c9cccf] rounded-lg px-2.5 py-1.5 text-[#202223]"
              >
                <option value="ALL">All Fulfillment Statuses</option>
                <option value="unfulfilled">Unfulfilled</option>
                <option value="fulfilled">Fulfilled</option>
              </select>
            </div>
          </div>
        )}

        {/* C. Bulk Selection Action Bar (when rows are checked) */}
        {selectedOrderIds.size > 0 && (
          <div className="bg-[#f0f9ff] border-b border-[#bae6fd] px-4 py-2 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#0369a1]">{selectedOrderIds.size} selected</span>
              <button
                type="button"
                onClick={() => setSelectedOrderIds(new Set())}
                className="text-[#6d7175] hover:text-[#202223] underline cursor-pointer"
              >
                Deselect all
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-[#0369a1] font-medium hidden sm:inline">Set Workshop Status:</span>
              <button
                type="button"
                onClick={() => handleBulkUpdateStatus('Ready to Ship')}
                className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-md font-medium text-xs shadow-2xs transition cursor-pointer"
              >
                Ready to Ship
              </button>
              <button
                type="button"
                onClick={() => handleBulkUpdateStatus('Delayed')}
                className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 rounded-md font-medium text-xs shadow-2xs transition cursor-pointer"
              >
                Mark Delayed
              </button>
              <button
                type="button"
                onClick={() => handleBulkUpdateStatus('Shipped')}
                className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-800 border border-blue-300 rounded-md font-medium text-xs shadow-2xs transition cursor-pointer"
              >
                Mark Shipped
              </button>
            </div>
          </div>
        )}

        {/* D. Polaris Index Body (Cards vs Table) */}
        {viewMode === 'cards' ? (
          <div className="p-3.5 sm:p-5 bg-neutral-50/60">
            {paginatedOrders.length === 0 ? (
              <div className="py-14 text-center text-xs">
                <div className="max-w-md mx-auto space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#f1f2f3] text-[#5c5f62] flex items-center justify-center mx-auto">
                    <ShoppingBag className="w-6 h-6 stroke-[1.5]" />
                  </div>
                  <div className="text-sm font-semibold text-[#202223]">No orders found</div>
                  <p className="text-xs text-[#6d7175]">
                    {searchQuery || activeTab !== 'all' || storeFilter !== 'ALL'
                      ? 'Try changing the filters, search terms, or view tabs to find what you are looking for.'
                      : 'Orders placed on your Shopify stores will automatically sync here.'}
                  </p>
                  {(searchQuery || activeTab !== 'all' || storeFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setActiveTab('all');
                        setStoreFilter('ALL');
                        setPaymentFilter('ALL');
                        setFulfillmentFilter('ALL');
                      }}
                      className="px-3 py-1.5 bg-white border border-[#c9cccf] hover:bg-[#f7f7f8] rounded-lg text-xs font-medium text-[#202223] transition cursor-pointer"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {paginatedOrders.map((order, idx) => {
                  const isLLC = order.storeAccount === 'LLC' || order.currency === 'USD' || order.orderNumber?.startsWith('US');
                  const displayOrderId = formatBlkbrdOrderId(order.orderNumber, isLLC ? 'LLC' : 'Global');
                  const isSelected = selectedOrderIds.has(order.id);
                  const isPaid = order.financialStatus === 'paid';
                  const isPending = order.financialStatus === 'pending';
                  const isFulfilled = order.fulfillmentStatus === 'fulfilled';
                  const orderDateStr = order.createdAt ? order.createdAt.split('T')[0] : '';
                  const expDate = orderDateStr ? calculateExpectedDate(orderDateStr) : '';
                  const delayInfo = calculateDelayInfo(orderDateStr, expDate);
                  const isCompleted = isFulfilled || order.operationalStatus === 'Shipped' || order.operationalStatus === 'Ready to Ship';
                  const effectiveDelayDays = isCompleted ? 0 : delayInfo.delayedDays;
                  const isDelayedOrder = !isCompleted && (order.operationalStatus === 'Delayed' || effectiveDelayDays >= 1);
                  const itemImg = resolveProductImage(order.orderNumber, order.lineItems, orders, order.imageUrl);

                  return (
                    <div
                      key={order.id ? `${order.id}-${idx}` : `shopify-card-${order.orderNumber || idx}`}
                      className={`bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-2xs hover:shadow-md ${
                        isSelected
                          ? 'border-neutral-900 ring-2 ring-neutral-900/10'
                          : 'border-neutral-200/90 hover:border-neutral-300'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="p-3.5 border-b border-neutral-100 bg-neutral-50/50 flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectOrder(order.id)}
                            className="w-4 h-4 rounded-sm border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer shrink-0"
                          />
                          <ProductThumbnail
                            src={itemImg}
                            alt={order.lineItems}
                            size="sm"
                            className="rounded-xl shadow-2xs border border-neutral-200 bg-white shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {onViewOrderSummary ? (
                                <button
                                  type="button"
                                  onClick={() => onViewOrderSummary(order.orderNumber)}
                                  className="font-bold text-neutral-900 text-xs hover:text-amber-700 hover:underline transition truncate"
                                  title="Open 360° Order Summary"
                                >
                                  {displayOrderId}
                                </button>
                              ) : (
                                <span className="font-bold text-neutral-900 text-xs truncate">{displayOrderId}</span>
                              )}
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                                  isLLC
                                    ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                    : 'bg-sky-50 text-sky-800 border border-sky-200'
                                }`}
                              >
                                {isLLC ? <Building2 className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
                                <span>{isLLC ? 'LLC' : 'Global'}</span>
                              </span>
                            </div>
                            <div className="text-[11px] text-neutral-500 font-mono flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3 text-neutral-400" />
                              <span>{orderDateStr ? new Date(orderDateStr).toLocaleDateString('en-GB') : 'Recently'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Delay / Completion Status Pill */}
                        <div className="shrink-0 text-right">
                          {isDelayedOrder ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3 text-rose-600" />
                              <span>+{effectiveDelayDays}d Delay</span>
                            </span>
                          ) : isCompleted ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>{order.operationalStatus || 'Shipped'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3 text-blue-600" />
                              <span>On Track</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-3.5 space-y-3 flex-1">
                        {/* Customer */}
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
                            Customer
                          </div>
                          <div className="font-semibold text-neutral-900 text-xs truncate">
                            {order.customerName || `Customer #${order.orderNumber}`}
                          </div>
                          {order.email && (
                            <div className="text-[11px] text-neutral-500 font-mono truncate">
                              {order.email}
                            </div>
                          )}
                        </div>

                        {/* Footwear Products & Specifications */}
                        <div className="bg-neutral-50/80 rounded-xl p-2.5 border border-neutral-100 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
                              {order.lineItemDetails && order.lineItemDetails.length > 1
                                ? `Ordered Products (${order.lineItemDetails.length})`
                                : 'Ordered Product'}
                            </span>
                            {order.lineItemDetails && order.lineItemDetails.length > 1 && (
                              <span className="text-[10px] font-mono bg-neutral-200/70 text-neutral-800 px-1.5 py-0.2 rounded font-semibold">
                                {order.lineItemDetails.length} Items
                              </span>
                            )}
                          </div>

                          {order.lineItemDetails && order.lineItemDetails.length > 0 ? (
                            <div className="space-y-1.5">
                              {order.lineItemDetails.map((item, itemIdx) => {
                                const itemImgUrl = item.imageUrl && item.imageUrl.startsWith('http') ? item.imageUrl : undefined;
                                return (
                                  <div key={item.id || itemIdx} className="flex items-start gap-2 pt-1 border-t first:border-t-0 border-neutral-200/40">
                                    {itemImgUrl && (
                                      <ProductThumbnail
                                        src={itemImgUrl}
                                        alt={item.title}
                                        size="xs"
                                        className="rounded-lg shadow-2xs border border-neutral-200 bg-white shrink-0 mt-0.5"
                                      />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-semibold text-neutral-900 leading-snug">
                                        {item.title}
                                        {item.variantTitle && item.variantTitle !== 'Default Title' && (
                                          <span className="text-[11px] font-normal text-neutral-600 ml-1">
                                            ({item.variantTitle})
                                          </span>
                                        )}
                                        {item.quantity && item.quantity > 1 && (
                                          <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-1 rounded ml-1.5">
                                            x{item.quantity}
                                          </span>
                                        )}
                                      </div>
                                      {item.craftsmanNotes && (
                                        <div className="text-[10px] text-amber-800 font-mono mt-0.5">
                                          Craftsman: {item.craftsmanNotes}
                                        </div>
                                      )}
                                      {item.customSpecifications && Object.keys(item.customSpecifications).length > 0 && (
                                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                          {Object.entries(item.customSpecifications).slice(0, 3).map(([k, v]) => (
                                            <span key={k} className="text-[9px] font-mono bg-neutral-100 text-neutral-700 px-1 rounded border border-neutral-200/60">
                                              {k}: {v}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    {item.price && (
                                      <span className="text-[11px] font-mono text-neutral-600 shrink-0 font-medium">
                                        {item.price}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs font-semibold text-neutral-900 line-clamp-2" title={order.lineItems}>
                              {order.lineItems || 'BLKBRD Goodyear Welted Footwear'}
                            </div>
                          )}

                          {order.notes && (
                            <div className="text-[10px] text-neutral-500 italic pt-1 border-t border-neutral-200/40 line-clamp-1" title={order.notes}>
                              Order Note: {order.notes}
                            </div>
                          )}
                        </div>

                        {/* Financial, Fulfillment & Total Amount */}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Payment Badge */}
                            {isPaid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Paid
                              </span>
                            ) : isPending ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                Pending
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-700">
                                {order.financialStatus || 'Authorized'}
                              </span>
                            )}

                            {/* Fulfillment Badge */}
                            {isFulfilled ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Fulfilled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                Unfulfilled
                              </span>
                            )}
                          </div>

                          <div className="text-right">
                            <span className="font-mono font-bold text-xs sm:text-sm text-neutral-900">
                              {order.totalPrice || '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card Footer / Quick Action Toolbar */}
                      <div className="p-3 border-t border-neutral-100 bg-neutral-50/70 space-y-2">
                        {/* Workshop Status Segmented Controls */}
                        <div className="flex items-center justify-between gap-1 bg-white p-1 rounded-xl border border-neutral-200/80 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => onUpdateOrderStatus(order.id, 'Ready to Ship')}
                            className={`flex-1 py-1 px-1 rounded-lg text-[10px] font-semibold transition cursor-pointer text-center ${
                              order.operationalStatus === 'Ready to Ship'
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'text-neutral-600 hover:text-emerald-700 hover:bg-emerald-50'
                            }`}
                            title="Mark Ready to Ship"
                          >
                            RTD
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateOrderStatus(order.id, 'Delayed')}
                            className={`flex-1 py-1 px-1 rounded-lg text-[10px] font-semibold transition cursor-pointer text-center ${
                              order.operationalStatus === 'Delayed'
                                ? 'bg-amber-600 text-white shadow-2xs'
                                : 'text-neutral-600 hover:text-amber-700 hover:bg-amber-50'
                            }`}
                            title="Mark Delayed"
                          >
                            Delay
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateOrderStatus(order.id, 'Shipped')}
                            className={`flex-1 py-1 px-1 rounded-lg text-[10px] font-semibold transition cursor-pointer text-center ${
                              order.operationalStatus === 'Shipped'
                                ? 'bg-neutral-900 text-white shadow-2xs'
                                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                            }`}
                            title="Mark Shipped"
                          >
                            Shipped
                          </button>
                        </div>

                        {/* Direct Action Links */}
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          {onViewOrderSummary && (
                            <button
                              type="button"
                              onClick={() => onViewOrderSummary(order.orderNumber)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-700 hover:text-neutral-950 hover:underline cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-neutral-500" />
                              <span>Summary</span>
                            </button>
                          )}
                          <a
                            href={getShopifyAdminOrderUrl(order.orderNumber, isLLC ? 'LLC' : 'Global')}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline ml-auto"
                          >
                            <span>Shopify Admin</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
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
              <tr className="border-b border-[#e1e3e5] bg-[#f7f7f8] text-[#4a4a4a] font-semibold text-[11px] tracking-wide select-none">
                {/* Select All Checkbox */}
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllPageSelected}
                    ref={input => {
                      if (input) input.indeterminate = isSomePageSelected;
                    }}
                    onChange={handleSelectAllOnPage}
                    className="w-4 h-4 rounded-sm border-[#8c9196] text-[#005bd3] focus:ring-[#005bd3] cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3 font-semibold">Order</th>
                <th className="py-3 px-3 font-semibold">Date</th>
                <th className="py-3 px-3 font-semibold">Customer</th>
                <th className="py-3 px-3 font-semibold">Channel</th>
                <th className="py-3 px-3 font-semibold text-right">Total</th>
                <th className="py-3 px-3 font-semibold">Payment</th>
                <th className="py-3 px-3 font-semibold">Fulfillment</th>
                <th className="py-3 px-3 font-semibold">Workshop Status</th>
                <th className="py-3 px-3 font-semibold">Items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e1e3e5]">
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center text-xs">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-full bg-[#f1f2f3] text-[#5c5f62] flex items-center justify-center mx-auto">
                        <ShoppingBag className="w-6 h-6 stroke-[1.5]" />
                      </div>
                      <div className="text-sm font-semibold text-[#202223]">No orders found</div>
                      <p className="text-xs text-[#6d7175]">
                        {searchQuery || activeTab !== 'all' || storeFilter !== 'ALL'
                          ? 'Try changing the filters, search terms, or view tabs to find what you are looking for.'
                          : 'Orders placed on your Shopify stores will automatically sync here.'}
                      </p>
                      {(searchQuery || activeTab !== 'all' || storeFilter !== 'ALL') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setActiveTab('all');
                            setStoreFilter('ALL');
                            setPaymentFilter('ALL');
                            setFulfillmentFilter('ALL');
                          }}
                          className="px-3 py-1.5 bg-white border border-[#c9cccf] hover:bg-[#f7f7f8] rounded-lg text-xs font-medium text-[#202223] transition cursor-pointer"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order, idx) => {
                  const isLLC = order.storeAccount === 'LLC' || order.currency === 'USD' || order.orderNumber?.startsWith('US');
                  const displayOrderId = formatBlkbrdOrderId(order.orderNumber, isLLC ? 'LLC' : 'Global');
                  const isSelected = selectedOrderIds.has(order.id);

                  // Payment Badge classes
                  const isPaid = order.financialStatus === 'paid';
                  const isPending = order.financialStatus === 'pending';

                  // Fulfillment Badge classes
                  const isFulfilled = order.fulfillmentStatus === 'fulfilled';

                  // Delay computation (+21d from creation)
                  const orderDateStr = order.createdAt ? order.createdAt.split('T')[0] : '';
                  const expDate = orderDateStr ? calculateExpectedDate(orderDateStr) : '';
                  const delayInfo = calculateDelayInfo(orderDateStr, expDate);
                  const isCompleted = isFulfilled || order.operationalStatus === 'Shipped' || order.operationalStatus === 'Ready to Ship';
                  const effectiveDelayDays = isCompleted ? 0 : delayInfo.delayedDays;
                  const isDelayedOrder = !isCompleted && (order.operationalStatus === 'Delayed' || effectiveDelayDays >= 1);

                  return (
                    <tr
                      key={order.id ? `${order.id}-${idx}` : `shopify-${order.orderNumber || idx}`}
                      className={`hover:bg-[#f7f7f8] transition-colors duration-100 ${
                        isSelected ? 'bg-[#f0f9ff]/70' : isDelayedOrder ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOrder(order.id)}
                          className="w-4 h-4 rounded-sm border-[#8c9196] text-[#005bd3] focus:ring-[#005bd3] cursor-pointer"
                        />
                      </td>

                      {/* Order Number */}
                      <td className="py-3 px-3 font-semibold text-[#202223] whitespace-nowrap">
                        {onViewOrderSummary ? (
                          <button
                            type="button"
                            onClick={() => onViewOrderSummary(order.orderNumber)}
                            className="font-bold text-[#202223] hover:text-[#005bd3] hover:underline flex items-center gap-1 group text-left cursor-pointer transition"
                            title="Open order journey, workshop history, and details"
                          >
                            <span>#{order.orderNumber.replace(/^#/, '')}</span>
                            <ExternalLink className="w-3 h-3 text-[#8c9196] group-hover:text-[#005bd3] transition" />
                          </button>
                        ) : (
                          <span className="font-bold">#{order.orderNumber.replace(/^#/, '')}</span>
                        )}
                        <span className="text-[10px] text-[#8c9196] font-mono block mt-0.5">
                          {displayOrderId}
                        </span>
                        <a
                          href={getShopifyAdminOrderUrl(order.orderNumber, order.id, isLLC ? 'LLC' : 'Global')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200/80 mt-1 transition"
                          title={`Open order #${order.orderNumber.replace(/^#/, '')} on Shopify Admin`}
                        >
                          <ShoppingBag className="w-2.5 h-2.5 text-emerald-600" />
                          <span>Shopify Admin</span>
                          <ExternalLink className="w-2.5 h-2.5 text-emerald-600" />
                        </a>
                      </td>

                      {/* Date & Delay Days */}
                      <td className="py-3 px-3 whitespace-nowrap text-[11px]">
                        <div className="text-[#202223] font-medium font-mono">
                          {formatPolarisDate(order.createdAt)}
                        </div>
                        {effectiveDelayDays > 0 ? (
                          <div className="mt-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-800 bg-rose-100/90 border border-rose-200 px-1.5 py-0.2 rounded font-mono">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              +{effectiveDelayDays} {effectiveDelayDays === 1 ? 'day' : 'days'} delayed
                            </span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-[#8c9196]">
                            Target: {expDate || '21d'}
                          </div>
                        )}
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-3 min-w-[170px]">
                        <div className="font-medium text-[#202223]">
                          {order.customerName || 'Valued Customer'}
                        </div>
                        {order.email && (
                          <div className="text-[11px] text-[#6d7175] truncate max-w-[190px]">
                            {order.email}
                          </div>
                        )}
                        {order.phone && (
                          <div className="text-[10px] text-[#8c9196] font-mono">
                            {order.phone}
                          </div>
                        )}
                      </td>

                      {/* Channel / Store */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${
                            isLLC
                              ? 'bg-[#f3e8ff] text-[#6b21a8] border-[#e9d5ff]'
                              : 'bg-[#e0f2fe] text-[#0369a1] border-[#bae6fd]'
                          }`}
                        >
                          {isLLC ? <Building2 className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                          <span>{isLLC ? 'LLC (USA)' : 'Global'}</span>
                        </span>
                      </td>

                      {/* Total */}
                      <td className="py-3 px-3 text-right font-medium text-[#202223] font-mono whitespace-nowrap">
                        {order.totalPrice ? (
                          <span>{order.totalPrice}</span>
                        ) : (
                          <span className="text-[#8c9196]">—</span>
                        )}
                      </td>

                      {/* Payment Status (Polaris Badge) */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#cbf4c9] text-[#0e5828]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#108043]"></span>
                            Paid
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#fed888] text-[#8a6116]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#b98900]"></span>
                            Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f1f2f3] text-[#4a4a4a]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#8c9196]"></span>
                            {order.financialStatus || 'Authorized'}
                          </span>
                        )}
                      </td>

                      {/* Fulfillment Status (Polaris Badge) */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isFulfilled ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#cbf4c9] text-[#0e5828]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#108043]"></span>
                            Fulfilled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#fed888] text-[#8a6116]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#b98900]"></span>
                            Unfulfilled
                          </span>
                        )}
                      </td>

                      {/* Workshop Status Dropdown & Delay Alert */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <select
                          value={order.operationalStatus || 'In Production'}
                          onChange={e => onUpdateOrderStatus(order.id, e.target.value as any)}
                          className={`text-xs px-2.5 py-1 rounded-md font-medium border transition cursor-pointer outline-hidden ${
                            order.operationalStatus === 'Ready to Ship'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : order.operationalStatus === 'Delayed'
                              ? 'bg-rose-50 text-rose-800 border-rose-300 font-bold'
                              : order.operationalStatus === 'Shipped'
                              ? 'bg-neutral-100 text-neutral-800 border-neutral-300'
                              : 'bg-blue-50 text-blue-800 border-blue-300'
                          }`}
                        >
                          <option value="In Production">In Production</option>
                          <option value="Ready to Ship">Ready to Ship</option>
                          <option value="Delayed">Delayed (+1d+)</option>
                          <option value="Shipped">Shipped / Dispatched</option>
                        </select>
                        {effectiveDelayDays > 0 && order.operationalStatus !== 'Shipped' && order.operationalStatus !== 'Ready to Ship' && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              +{effectiveDelayDays}d late
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Items */}
                      <td className="py-3 px-3 min-w-[220px] max-w-sm">
                        {order.lineItemDetails && order.lineItemDetails.length > 0 ? (
                          <div className="space-y-1.5">
                            {order.lineItemDetails.map((li, lIdx) => {
                              const itemImgUrl = li.imageUrl && li.imageUrl.startsWith('http') ? li.imageUrl : undefined;
                              return (
                                <div key={li.id || lIdx} className="flex items-center gap-2">
                                  {itemImgUrl && (
                                    <ProductThumbnail
                                      src={itemImgUrl}
                                      alt={li.title}
                                      size="xs"
                                      className="rounded-lg shadow-2xs border border-[#c9cccf] bg-white shrink-0"
                                    />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium text-[#202223] truncate leading-tight" title={li.title}>
                                      {li.title}
                                      {li.variantTitle && li.variantTitle !== 'Default Title' && (
                                        <span className="text-[11px] text-[#6d7175] ml-1">
                                          ({li.variantTitle})
                                        </span>
                                      )}
                                      {li.quantity && li.quantity > 1 && (
                                        <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-1 rounded ml-1">
                                          x{li.quantity}
                                        </span>
                                      )}
                                    </div>
                                    {li.craftsmanNotes && (
                                      <div className="text-[10px] text-amber-800 font-mono truncate" title={li.craftsmanNotes}>
                                        Note: {li.craftsmanNotes}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            {(() => {
                              const itemImg = resolveProductImage(order.orderNumber, order.lineItems, orders, order.imageUrl);
                              return (
                                <>
                                  {itemImg && (
                                    <ProductThumbnail
                                      src={itemImg}
                                      alt={order.lineItems}
                                      size="xs"
                                      className="rounded-lg shadow-2xs border border-[#c9cccf] bg-white shrink-0"
                                    />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-[#202223] truncate" title={order.lineItems}>
                                      {order.lineItems || 'BLKBRD Goodyear Welted'}
                                    </div>
                                    {order.notes && (
                                      <div className="text-[10px] text-[#8c9196] truncate max-w-[200px]" title={order.notes}>
                                        Note: {order.notes}
                                      </div>
                                    )}
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

        {/* E. Polaris Index Table Pagination Footer */}
        <div className="p-3 border-t border-[#e1e3e5] bg-[#ffffff] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#6d7175]">
          <div className="flex items-center gap-3">
            <span>
              Showing {filteredOrders.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredOrders.length)} of {filteredOrders.length} orders
            </span>
            <div className="flex items-center gap-1.5 pl-3 border-l border-[#e1e3e5]">
              <span className="text-[11px] text-[#8c9196]">Rows:</span>
              <select
                value={pageSizeOption}
                onChange={e => {
                  setPageSizeOption(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-white border border-[#c9cccf] rounded-md px-1.5 py-0.5 text-xs text-[#202223] font-medium cursor-pointer"
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="250">250</option>
                <option value="all">All ({filteredOrders.length})</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8c9196]">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-lg border border-[#c9cccf] bg-white hover:bg-[#f7f7f8] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                title="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-[#5c5f62]" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg border border-[#c9cccf] bg-white hover:bg-[#f7f7f8] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                title="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5 text-[#5c5f62]" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Order Creation Modal */}
      {isAddModalOpen && onAddShopifyOrder && (
        <AddShopifyOrderModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAddOrder={onAddShopifyOrder}
          existingOrders={orders}
        />
      )}
    </div>
  );
};
