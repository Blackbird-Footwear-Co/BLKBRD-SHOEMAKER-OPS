import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Upload,
  Download,
  Phone,
  Mail,
  ShoppingBag,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Send,
  ExternalLink,
  ChevronRight,
  Filter,
  Tag,
  MapPin,
  Calendar,
  Layers,
  Truck,
  RotateCcw,
  Sparkles,
  UserCheck,
  Edit2,
  Check,
  X,
  UserPlus,
  Database,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';
import {
  CustomerProfile,
  CustomerCrmQuery,
  CustomerSource,
  CustomerUnifiedOrder,
  UserProfile,
  UserRole
} from '../types';
import {
  CUSTOMER_SOURCES,
  CRM_QUERY_TAGS,
  getStoredCustomers,
  saveStoredCustomers,
  addCrmQueryToCustomer,
  updateCrmQueryStatus,
  updateCustomer,
  aggregateCustomerOrders,
  exportCustomersCsv,
  fetchSupabaseCustomers,
  syncAllCustomersToSupabase
} from '../services/customerService';
import { OrderLookupContext } from '../utils/customerResolver';
import { formatBlkbrdOrderId } from '../utils/csvParser';
import { calculateDelayInfo, calculateExpectedDate } from '../utils/delinquencyUtils';
import { CustomerBulkUploadModal } from './CustomerBulkUploadModal';
import { AddCustomerModal } from './AddCustomerModal';
import { supabase } from '../services/supabaseClient';
import { addProductionRemark } from '../services/store';
import { addOrderRemark } from '../services/orderHistoryService';
import { getStoredTableConfig } from '../services/schemaConfigService';

interface CustomerCrmViewProps {
  role: UserRole;
  currentUser?: UserProfile | null;
  lookupContext: OrderLookupContext;
  onViewOrderSummary: (orderId: string) => void;
  onOpenSchemaCustomizer?: (tableKey?: any) => void;
}

export const CustomerCrmView: React.FC<CustomerCrmViewProps> = ({
  role,
  currentUser,
  lookupContext,
  onViewOrderSummary,
  onOpenSchemaCustomizer
}) => {
  const [customers, setCustomers] = useState<CustomerProfile[]>(() => getStoredCustomers());
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(() => {
    const list = getStoredCustomers();
    return list[0]?.id || null;
  });
  const [mobileTab, setMobileTab] = useState<'list' | 'profile'>('list');

  // Supabase sync state
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false);
  const [supabaseSyncNotice, setSupabaseSyncNotice] = useState<string | null>(null);

  // Initial load from Supabase if available
  React.useEffect(() => {
    fetchSupabaseCustomers().then((remote) => {
      if (remote && remote.length > 0) {
        setCustomers(remote);
        if (!selectedCustomerId) {
          setSelectedCustomerId(remote[0].id);
        }
      }
    });
  }, []);

  const handleManualSupabaseSync = async () => {
    setIsSyncingSupabase(true);
    setSupabaseSyncNotice('Syncing customers with Supabase database...');
    try {
      const result = await syncAllCustomersToSupabase();
      if (result.success) {
        setSupabaseSyncNotice(`Successfully synchronized ${result.count} customers to Supabase!`);
      } else {
        setSupabaseSyncNotice(`Supabase sync noticed: ${result.error || 'Check table schema'}`);
      }
    } catch (e: any) {
      setSupabaseSyncNotice(`Supabase sync: ${e.message}`);
    } finally {
      setIsSyncingSupabase(false);
      setTimeout(() => setSupabaseSyncNotice(null), 4000);
    }
  };

  // Modals
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');

  // Customer 360 Detail View Sub-Tabs
  const [detailTab, setDetailTab] = useState<'orders' | 'queries' | 'notes'>('orders');

  // New Query Form State
  const [newQueryOrderId, setNewQueryOrderId] = useState<string>('');
  const [newQueryTag, setNewQueryTag] = useState<string>(CRM_QUERY_TAGS[0]);
  const [newQueryStatus, setNewQueryStatus] = useState<'Open' | 'In Progress' | 'Resolved'>('Open');
  const [newQueryRemarks, setNewQueryRemarks] = useState('');
  const [isSubmittingQuery, setIsSubmittingQuery] = useState(false);
  const [queryFeedback, setQueryFeedback] = useState<string | null>(null);

  // Resolution modal or inline state
  const [resolvingQueryId, setResolvingQueryId] = useState<string | null>(null);
  const [resolutionInput, setResolutionInput] = useState('');

  // Inline notes editing
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesEditValue, setNotesEditValue] = useState('');

  // Inline tag input
  const [newTagInput, setNewTagInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);

  // Refresh customer list from storage
  const refreshCustomers = () => {
    const updated = getStoredCustomers();
    setCustomers(updated);
    if (!selectedCustomerId && updated.length > 0) {
      setSelectedCustomerId(updated[0].id);
    }
  };

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId) || customers[0] || null;
  }, [customers, selectedCustomerId]);

  // Aggregated orders for currently selected customer
  const customerOrders: CustomerUnifiedOrder[] = useMemo(() => {
    if (!selectedCustomer) return [];
    return aggregateCustomerOrders(selectedCustomer, lookupContext);
  }, [selectedCustomer, lookupContext]);

  // Metrics
  const metrics = useMemo(() => {
    const total = customers.length;
    let totalOpenQueries = 0;
    let totalResolvedQueries = 0;
    let repeatClients = 0;

    customers.forEach(c => {
      const openCount = (c.crmQueries || []).filter(q => q.status === 'Open' || q.status === 'In Progress').length;
      const resCount = (c.crmQueries || []).filter(q => q.status === 'Resolved').length;
      totalOpenQueries += openCount;
      totalResolvedQueries += resCount;
      if (c.orderIds.length > 1) {
        repeatClients++;
      }
    });

    return { total, totalOpenQueries, totalResolvedQueries, repeatClients };
  }, [customers]);

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      // Source filter
      if (selectedSourceFilter !== 'all' && c.source !== selectedSourceFilter) {
        return false;
      }

      // Query status filter
      if (selectedStatusFilter === 'open') {
        const hasOpen = (c.crmQueries || []).some(q => q.status === 'Open' || q.status === 'In Progress');
        if (!hasOpen) return false;
      } else if (selectedStatusFilter === 'resolved') {
        const hasResolved = (c.crmQueries || []).some(q => q.status === 'Resolved');
        if (!hasResolved) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesPhone = c.phone.toLowerCase().includes(q);
        const matchesEmail = c.email.toLowerCase().includes(q);
        const matchesOrders = c.orderIds.some(oid => oid.toLowerCase().includes(q));
        const matchesTags = (c.tags || []).some(t => t.toLowerCase().includes(q));
        const matchesCity = (c.city || '').toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesEmail && !matchesOrders && !matchesTags && !matchesCity) {
          return false;
        }
      }

      return true;
    });
  }, [customers, selectedSourceFilter, selectedStatusFilter, searchQuery]);

  // Handle Export CSV
  const handleExportCsv = () => {
    const csvData = exportCustomersCsv(customers);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `blkbrd_customers_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle adding a CRM query/remark
  const handlePostQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !newQueryRemarks.trim()) return;

    setIsSubmittingQuery(true);
    const agentName = currentUser?.name || 'CRM Team';
    const agentRole = currentUser?.role || 'admin';

    try {
      const isLlcCustomer = (selectedCustomer.country || '').toUpperCase().includes('USA') ||
                            (selectedCustomer.country || '').toUpperCase().includes('UNITED STATES') ||
                            newQueryOrderId.trim().toUpperCase().startsWith('US');
      const formattedQueryOrderId = newQueryOrderId.trim()
        ? formatBlkbrdOrderId(newQueryOrderId.trim(), isLlcCustomer ? 'LLC' : 'Global')
        : undefined;

      const createdQuery = addCrmQueryToCustomer(selectedCustomer.id, {
        orderId: formattedQueryOrderId,
        tag: newQueryTag,
        status: newQueryStatus,
        remarks: newQueryRemarks.trim(),
        agentName,
        agentRole
      });

      // Also propagate to production remarks and order audit timeline if an order is attached
      if (formattedQueryOrderId) {
        const remarkContent = `[CRM Inquiry: ${newQueryTag}] ${newQueryRemarks.trim()}`;
        addProductionRemark({
          orderId: formattedQueryOrderId,
          author: `${agentName} (CRM)`,
          previousStatus: '',
          newStatus: `CRM Inquiry (${newQueryTag})`,
          remark: remarkContent
        });

        addOrderRemark(
          formattedQueryOrderId,
          remarkContent,
          { name: `${agentName} (CRM)`, role: agentRole },
          `CRM Inquiry (${newQueryTag})`
        );

        try {
          const config = getStoredTableConfig('production_remarks');
          if (config?.syncToSupabase) {
            await supabase.from('production_remarks').insert([{
              order_id: newQueryOrderId.trim(),
              author: `${agentName} (CRM)`,
              role: agentRole,
              remark: remarkContent,
              content: remarkContent,
              read: false
            }]);
          }
        } catch (subErr) {
          console.warn('Production remarks sync notice:', subErr);
        }
      }

      setNewQueryRemarks('');
      setNewQueryOrderId('');
      setQueryFeedback('CRM Remark and Query logged successfully!');
      setTimeout(() => setQueryFeedback(null), 3000);
      refreshCustomers();
      setIsSubmittingQuery(false);
    } catch (err: any) {
      setIsSubmittingQuery(false);
      alert(`Failed to save CRM query: ${err.message}`);
    }
  };

  // Handle query resolution
  const handleConfirmResolution = (queryId: string) => {
    if (!selectedCustomer) return;
    updateCrmQueryStatus(selectedCustomer.id, queryId, 'Resolved', resolutionInput.trim());
    setResolvingQueryId(null);
    setResolutionInput('');
    refreshCustomers();
  };

  // Handle status toggle
  const handleToggleQueryStatus = (query: CustomerCrmQuery) => {
    if (!selectedCustomer) return;
    const nextStatus =
      query.status === 'Open'
        ? 'In Progress'
        : query.status === 'In Progress'
        ? 'Resolved'
        : 'Open';

    updateCrmQueryStatus(selectedCustomer.id, query.id, nextStatus);
    refreshCustomers();
  };

  // Handle save notes
  const handleSaveNotes = () => {
    if (!selectedCustomer) return;
    updateCustomer(selectedCustomer.id, { notes: notesEditValue });
    setIsEditingNotes(false);
    refreshCustomers();
  };

  // Handle add tag to selected customer
  const handleAddTagToCustomer = () => {
    if (!selectedCustomer || !newTagInput.trim()) return;
    const cleanTag = newTagInput.trim();
    if (!selectedCustomer.tags.includes(cleanTag)) {
      updateCustomer(selectedCustomer.id, { tags: [...selectedCustomer.tags, cleanTag] });
      refreshCustomers();
    }
    setNewTagInput('');
    setIsAddingTag(false);
  };

  // Handle remove tag
  const handleRemoveTag = (tagToRemove: string) => {
    if (!selectedCustomer) return;
    updateCustomer(selectedCustomer.id, {
      tags: selectedCustomer.tags.filter(t => t !== tagToRemove)
    });
    refreshCustomers();
  };

  const getSourceBadge = (source: CustomerSource) => {
    switch (source) {
      case 'Website':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Social Media':
        return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'WhatsApp':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Phone Call':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Referral':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Exhibition':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-neutral-100 text-neutral-800 border-neutral-200';
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & CRM Metric Indicators */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-teal-500/15 text-teal-900 border border-teal-500/30">
              CRM HUB
            </span>
            <span className="text-xs text-neutral-400">•</span>
            <span className="text-xs text-neutral-500 font-medium">Bespoke Customer & Order Management</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
            <span>Customer Directory & Query Resolution</span>
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Search customer records, fetch comprehensive order histories, log CRM remarks, and resolve inquiries with tagged audit trails.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleManualSupabaseSync}
            disabled={isSyncingSupabase}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-neutral-50 text-neutral-700 font-medium rounded-xl border border-neutral-300 text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
            title="Sync all CRM customers to Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-teal-600 ${isSyncingSupabase ? 'animate-spin' : ''}`} />
            <span>{isSyncingSupabase ? 'Syncing...' : 'Sync Supabase'}</span>
          </button>

          {role === 'admin' && onOpenSchemaCustomizer && (
            <button
              onClick={() => onOpenSchemaCustomizer('customers_crm')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-neutral-50 text-neutral-700 font-medium rounded-xl border border-neutral-300 text-xs shadow-xs transition cursor-pointer"
              title="Customize CRM Supabase columns & schema"
            >
              <Database className="w-3.5 h-3.5 text-neutral-600" />
              <span>CRM Schema</span>
            </button>
          )}

          <button
            onClick={() => setIsBulkUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-neutral-50 text-neutral-700 font-medium rounded-xl border border-neutral-300 text-xs shadow-xs transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-teal-600" />
            <span>Upload Customers (CSV)</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-neutral-50 text-neutral-700 font-medium rounded-xl border border-neutral-300 text-xs shadow-xs transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-neutral-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => setIsAddCustomerOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-medium rounded-xl text-xs shadow-md shadow-teal-600/25 transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {supabaseSyncNotice && (
        <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-teal-600 shrink-0" />
            <span>{supabaseSyncNotice}</span>
          </div>
          <button
            onClick={() => setSupabaseSyncNotice(null)}
            className="text-teal-600 hover:text-teal-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-neutral-200/80 shadow-xs bg-white/70">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              Total Customers
            </span>
            <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-neutral-900">{metrics.total}</div>
          <p className="text-[11px] text-neutral-400 mt-0.5">Profiles active in CRM directory</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-amber-200/80 shadow-xs bg-amber-50/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
              Open Queries
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-800 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-900">{metrics.totalOpenQueries}</div>
          <p className="text-[11px] text-amber-700 mt-0.5">Awaiting CRM team resolution</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-emerald-200/80 shadow-xs bg-emerald-50/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
              Resolved Queries
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-800 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-900">{metrics.totalResolvedQueries}</div>
          <p className="text-[11px] text-emerald-700 mt-0.5">Client inquiries concluded</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-purple-200/80 shadow-xs bg-purple-50/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-purple-800 uppercase tracking-wider">
              Repeat Customers
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-800 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-900">{metrics.repeatClients}</div>
          <p className="text-[11px] text-purple-700 mt-0.5">Clients with 2+ shoe orders</p>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="glass-panel p-3 sm:p-3.5 rounded-2xl border border-neutral-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white/80">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search customers by Name, Phone, Email, Order # (e.g. BLKBRD6132), or Tag..."
            className="w-full pl-9 pr-8 py-2 bg-neutral-50/80 border border-neutral-200 rounded-xl text-xs text-neutral-900 focus:outline-hidden focus:border-teal-500 focus:bg-white transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {/* Source Dropdown Filter */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-semibold text-neutral-500 flex items-center gap-1">
              <Filter className="w-3 h-3 text-neutral-400" />
              Source:
            </span>
            <select
              value={selectedSourceFilter}
              onChange={e => setSelectedSourceFilter(e.target.value)}
              className="text-xs bg-white border border-neutral-200 rounded-xl px-2.5 py-1.5 text-neutral-800 font-medium focus:outline-hidden"
            >
              <option value="all">All Sources</option>
              {CUSTOMER_SOURCES.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Query Status Tabs */}
          <div className="flex items-center bg-neutral-100 rounded-xl p-0.5 shrink-0 border border-neutral-200 text-xs">
            <button
              onClick={() => setSelectedStatusFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer text-[11px] ${
                selectedStatusFilter === 'all'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              All ({customers.length})
            </button>
            <button
              onClick={() => setSelectedStatusFilter('open')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer text-[11px] flex items-center gap-1 ${
                selectedStatusFilter === 'open'
                  ? 'bg-amber-100 text-amber-900 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Open Queries
            </button>
            <button
              onClick={() => setSelectedStatusFilter('resolved')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer text-[11px] ${
                selectedStatusFilter === 'resolved'
                  ? 'bg-emerald-100 text-emerald-900 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              Resolved
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Tab Switcher (Directory vs Profile) on small screens */}
      <div className="flex lg:hidden items-center p-1 bg-neutral-100 rounded-xl border border-neutral-200">
        <button
          type="button"
          onClick={() => setMobileTab('list')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
            mobileTab === 'list'
              ? 'bg-white text-neutral-900 shadow-xs'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Directory ({filteredCustomers.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('profile')}
          disabled={!selectedCustomer}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
            mobileTab === 'profile'
              ? 'bg-teal-600 text-white shadow-xs'
              : selectedCustomer
              ? 'text-neutral-600 hover:text-neutral-900'
              : 'text-neutral-300 cursor-not-allowed'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="truncate">{selectedCustomer ? selectedCustomer.name.split(' ')[0] + ' 360°' : 'Profile'}</span>
        </button>
      </div>

      {/* 4. Master-Detail Split Screen Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Customer Directory List (4 cols on lg) */}
        <div className={`lg:col-span-4 space-y-2.5 max-h-[800px] overflow-y-auto pr-1 ${mobileTab === 'profile' ? 'hidden lg:block' : 'block'}`}>
          <div className="flex items-center justify-between text-xs font-semibold text-neutral-500 px-1">
            <span>Customer Profiles ({filteredCustomers.length})</span>
            {selectedCustomer && (
              <span className="text-[11px] text-teal-700 font-normal">
                Active: <strong className="text-neutral-900">{selectedCustomer.name}</strong>
              </span>
            )}
          </div>

          {filteredCustomers.length === 0 ? (
            <div className="glass-panel p-8 rounded-2xl text-center text-neutral-500 border border-neutral-200">
              <Users className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
              <p className="text-sm font-semibold text-neutral-700">No customers found</p>
              <p className="text-xs text-neutral-400 mt-1">Try adjusting search query or source filters</p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedSourceFilter('all');
                  setSelectedStatusFilter('all');
                }}
                className="mt-3 text-xs text-teal-600 font-medium hover:underline cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            filteredCustomers.map((cust, idx) => {
              const isSelected = selectedCustomer?.id === cust.id;
              const openQueries = (cust.crmQueries || []).filter(q => q.status === 'Open' || q.status === 'In Progress');

              return (
                <div
                  key={cust.id ? `${cust.id}-${idx}` : `cust-${idx}`}
                  onClick={() => {
                    setSelectedCustomerId(cust.id);
                    setMobileTab('profile');
                  }}
                  className={`p-3.5 rounded-2xl transition cursor-pointer border text-xs relative ${
                    isSelected
                      ? 'bg-white border-teal-500 ring-2 ring-teal-500/20 shadow-md shadow-teal-500/5'
                      : 'bg-white/70 hover:bg-white border-neutral-200/90 hover:border-neutral-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          isSelected
                            ? 'bg-teal-600 text-white shadow-xs'
                            : 'bg-neutral-100 text-neutral-700'
                        }`}
                      >
                        {getInitials(cust.name)}
                      </div>
                      <div>
                        <h3 className="font-bold text-neutral-900 text-sm leading-tight flex items-center gap-1.5">
                          <span>{cust.name}</span>
                          {cust.orderIds.length > 1 && (
                            <span className="text-[10px] font-mono font-normal text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded-md">
                              Repeat
                            </span>
                          )}
                        </h3>
                        <p className="text-[11px] text-neutral-500 mt-0.5">
                          {cust.city ? `${cust.city}, ` : ''}{cust.country || 'Global Customer'}
                        </p>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border shrink-0 ${getSourceBadge(cust.source)}`}>
                      {cust.source}
                    </span>
                  </div>

                  {/* Contact Snippets */}
                  <div className="space-y-0.5 mb-2.5 text-[11px] text-neutral-600">
                    {cust.phone && (
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <Phone className="w-3 h-3 text-neutral-400 shrink-0" />
                        <span>{cust.phone}</span>
                      </div>
                    )}
                    {cust.email && (
                      <div className="flex items-center gap-1.5 text-neutral-500 truncate">
                        <Mail className="w-3 h-3 text-neutral-400 shrink-0" />
                        <span className="truncate">{cust.email}</span>
                      </div>
                    )}
                  </div>

                  {/* Footer Stats Row */}
                  <div className="flex items-center justify-between pt-2 border-t border-neutral-100 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <ShoppingBag className="w-3 h-3 text-neutral-400" />
                      <span className="font-semibold text-neutral-700">
                        {cust.orderIds.length} {cust.orderIds.length === 1 ? 'Order' : 'Orders'}
                      </span>
                    </div>

                    {openQueries.length > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold text-[10px] border border-amber-200">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>{openQueries.length} Open Query</span>
                      </span>
                    ) : (
                      <span className="text-neutral-400 text-[10px] flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        All Resolved
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Customer 360 & Inquiry Hub (8 cols on lg) */}
        <div className={`lg:col-span-8 space-y-4 ${mobileTab === 'list' ? 'hidden lg:block' : 'block'}`}>
          {/* Mobile Back button */}
          <div className="flex lg:hidden items-center justify-between">
            <button
              type="button"
              onClick={() => setMobileTab('list')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-neutral-200 text-xs font-semibold text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 shadow-2xs transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-neutral-500" />
              <span>Back to Directory</span>
            </button>
          </div>
          {selectedCustomer ? (
            <div className="space-y-4">
              {/* Profile Card Header */}
              <div className="glass-panel p-5 rounded-3xl border border-neutral-200 bg-white/90 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white font-bold text-base flex items-center justify-center shadow-md shadow-teal-600/20 shrink-0">
                      {getInitials(selectedCustomer.name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-neutral-900">
                          {selectedCustomer.name}
                        </h2>
                        <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold border ${getSourceBadge(selectedCustomer.source)}`}>
                          Lead: {selectedCustomer.source}
                        </span>
                        {selectedCustomer.orderIds.length > 1 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-purple-100 text-purple-900 border border-purple-200 font-semibold">
                            {selectedCustomer.orderIds.length} Lifetime Orders
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 mt-1">
                        {selectedCustomer.city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                            {selectedCustomer.city}, {selectedCustomer.country}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                          Profile since {selectedCustomer.createdAt.split('T')[0]}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Direct Contact Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedCustomer.phone && (
                      <>
                        <a
                          href={`tel:${selectedCustomer.phone}`}
                          title="Call Customer"
                          className="p-2 rounded-xl bg-neutral-100 hover:bg-teal-50 text-neutral-700 hover:text-teal-700 border border-neutral-200 transition"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                        <a
                          href={`https://wa.me/${selectedCustomer.phone.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Message on WhatsApp"
                          className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </a>
                      </>
                    )}
                    {selectedCustomer.email && (
                      <a
                        href={`mailto:${selectedCustomer.email}`}
                        title="Send Email"
                        className="p-2 rounded-xl bg-neutral-100 hover:bg-blue-50 text-neutral-700 hover:text-blue-700 border border-neutral-200 transition"
                      >
                        <Mail className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Tags Row */}
                <div className="py-3 flex flex-wrap items-center gap-1.5 border-b border-neutral-100">
                  <span className="text-[11px] font-semibold text-neutral-500 flex items-center gap-1 mr-1">
                    <Tag className="w-3 h-3 text-neutral-400" />
                    Tags:
                  </span>
                  {(selectedCustomer.tags || []).map(t => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] bg-teal-50 text-teal-800 border border-teal-200/80 font-medium"
                    >
                      <span>{t}</span>
                      <button
                        onClick={() => handleRemoveTag(t)}
                        className="hover:text-red-600 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}

                  {isAddingTag ? (
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={newTagInput}
                        onChange={e => setNewTagInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddTagToCustomer()}
                        placeholder="Tag name..."
                        className="text-xs px-2 py-0.5 rounded-lg border border-teal-400 focus:outline-hidden bg-white w-28"
                      />
                      <button
                        onClick={handleAddTagToCustomer}
                        className="p-1 bg-teal-600 text-white rounded-md hover:bg-teal-700"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setIsAddingTag(false)}
                        className="p-1 bg-neutral-200 text-neutral-700 rounded-md hover:bg-neutral-300"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setIsAddingTag(true);
                        setNewTagInput('');
                      }}
                      className="text-[11px] text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 px-2 py-0.5 rounded-lg border border-dashed border-teal-300 transition cursor-pointer"
                    >
                      + Add Tag
                    </button>
                  )}
                </div>

                {/* Profile Notes */}
                <div className="pt-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-neutral-600">Client Profile Notes & Bespoke Preferences:</span>
                    {!isEditingNotes && (
                      <button
                        onClick={() => {
                          setNotesEditValue(selectedCustomer.notes || '');
                          setIsEditingNotes(true);
                        }}
                        className="text-[11px] text-teal-700 hover:text-teal-900 font-medium flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        Edit Notes
                      </button>
                    )}
                  </div>

                  {isEditingNotes ? (
                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        value={notesEditValue}
                        onChange={e => setNotesEditValue(e.target.value)}
                        className="w-full text-xs bg-white border border-teal-300 rounded-xl p-2.5 text-neutral-900 focus:outline-hidden"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setIsEditingNotes(false)}
                          className="px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 rounded-lg"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveNotes}
                          className="px-3 py-1 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium"
                        >
                          Save Notes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-neutral-700 text-xs bg-neutral-50/80 p-2.5 rounded-xl border border-neutral-200/70 italic">
                      {selectedCustomer.notes || 'No bespoke sizing or personal notes recorded yet.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Sub-Tabs: Orders History vs CRM Queries */}
              <div className="flex items-center gap-1.5 border-b border-neutral-200 pb-1">
                <button
                  onClick={() => setDetailTab('orders')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    detailTab === 'orders'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Order History ({customerOrders.length})</span>
                </button>

                <button
                  onClick={() => setDetailTab('queries')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    detailTab === 'queries'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>CRM Queries & Remarks ({(selectedCustomer.crmQueries || []).length})</span>
                </button>
              </div>

              {/* TAB 1: ORDER HISTORY FETCH ENGINE */}
              {detailTab === 'orders' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-neutral-500 px-1">
                    <span>
                      Correlated across Workshop Delinquencies, Daily Dispatches, Returns, Trials, and Shopify
                    </span>
                    <span className="font-medium text-neutral-700">
                      {customerOrders.length} {customerOrders.length === 1 ? 'Order' : 'Orders'} Located
                    </span>
                  </div>

                  {customerOrders.length === 0 ? (
                    <div className="glass-panel p-8 rounded-2xl text-center border border-neutral-200 bg-white/70">
                      <ShoppingBag className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                      <p className="font-semibold text-neutral-700 text-sm">No linked orders detected</p>
                      <p className="text-xs text-neutral-400 mt-1">
                        Add an order number to this customer profile to track workshop status and dispatch.
                      </p>
                    </div>
                  ) : (
                    customerOrders.map(order => {
                      const orderExp = order.expectedDate || (order.orderDate ? calculateExpectedDate(order.orderDate) : '');
                      const delayInfo = calculateDelayInfo(order.orderDate || '', orderExp);
                      const isCompleted = order.stage === 'Shipped' || order.status === 'Shipped' || order.stage === 'RTD' || order.status === 'Ready to Ship';
                      const delayDays = isCompleted ? 0 : (order.daysDelayed !== undefined ? order.daysDelayed : delayInfo.delayedDays);

                      return (
                        <div
                          key={order.normalizedId}
                          className="glass-panel p-4 rounded-2xl border border-neutral-200 bg-white/90 shadow-xs hover:border-teal-300 transition"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="font-mono font-bold text-sm text-neutral-900">
                                {order.orderId}
                              </span>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase bg-neutral-100 text-neutral-700 border border-neutral-200">
                                {order.sourceType}
                              </span>
                              {order.storeTab && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200">
                                  {order.storeTab} Store
                                </span>
                              )}
                              {delayDays > 0 && !isCompleted && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 font-mono">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  +{delayDays}d delayed
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Open 360 Order Summary Modal */}
                              <button
                                onClick={() => onViewOrderSummary(order.orderId)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-semibold border border-teal-200 transition cursor-pointer shadow-xs"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-teal-600" />
                                <span>View Order 360 Summary</span>
                              </button>
                            </div>
                          </div>

                          {/* Order Details Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-xs">
                            <div>
                              <span className="text-[10px] font-semibold uppercase text-neutral-400 block mb-0.5">
                                Model / Product
                              </span>
                              <span className="font-medium text-neutral-800 truncate block">
                                {order.product || 'Artisan Shoe Build'}
                              </span>
                            </div>

                            <div>
                              <span className="text-[10px] font-semibold uppercase text-neutral-400 block mb-0.5">
                                Current Stage
                              </span>
                              <span className="inline-block px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-800 font-medium text-xs">
                                {order.stage || order.status}
                              </span>
                            </div>

                            <div>
                              <span className="text-[10px] font-semibold uppercase text-neutral-400 block mb-0.5">
                                Delay Status
                              </span>
                              {delayDays > 0 && !isCompleted ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-200 font-bold text-[11px] font-mono">
                                  +{delayDays} {delayDays === 1 ? 'day' : 'days'} late
                                </span>
                              ) : order.delayReason ? (
                                <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200 font-semibold text-[11px]">
                                  {order.delayReason}
                                </span>
                              ) : (
                                <span className="text-emerald-700 font-medium flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  On Schedule
                                </span>
                              )}
                            </div>

                            <div>
                              <span className="text-[10px] font-semibold uppercase text-neutral-400 block mb-0.5">
                                Delivery Target
                              </span>
                              <span className="font-mono text-neutral-700 font-medium">
                                {order.expectedDate || order.orderDate || '—'}
                              </span>
                            </div>
                          </div>

                          {/* Tracking details if available */}
                          {(order.trackingNo || order.courier) && (
                            <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-between text-xs bg-neutral-50/60 p-2 rounded-xl">
                              <span className="flex items-center gap-1.5 text-neutral-600">
                                <Truck className="w-3.5 h-3.5 text-blue-600" />
                                Courier: <strong>{order.courier || 'Express'}</strong>
                              </span>
                              <span className="font-mono text-neutral-800">
                                AWB: <strong>{order.trackingNo || 'Pending'}</strong>
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 2: CRM QUERIES & REMARK TIMELINE */}
              {detailTab === 'queries' && (
                <div className="space-y-4">
                  {/* Log New CRM Query Form */}
                  <form
                    onSubmit={handlePostQuery}
                    className="glass-panel p-4 sm:p-5 rounded-3xl border border-teal-200/80 bg-teal-50/30 space-y-3.5 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-teal-950 uppercase tracking-wide flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-teal-700" />
                        <span>Log CRM Query / Customer Remark</span>
                      </h3>
                      <span className="text-[10px] text-neutral-500 font-mono">
                        Author: <strong>{currentUser?.name || 'CRM Team'}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Target Order */}
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                          Linked Order (Optional)
                        </label>
                        <select
                          value={newQueryOrderId}
                          onChange={e => setNewQueryOrderId(e.target.value)}
                          className="w-full text-xs bg-white border border-neutral-200 rounded-xl px-2.5 py-1.5 text-neutral-800 font-mono focus:outline-hidden"
                        >
                          <option value="">General (No specific order)</option>
                          {selectedCustomer.orderIds.map(oid => (
                            <option key={oid} value={oid}>
                              {oid}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Tag Dropdown */}
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                          Query Tag / Classification
                        </label>
                        <select
                          value={newQueryTag}
                          onChange={e => setNewQueryTag(e.target.value)}
                          className="w-full text-xs bg-white border border-neutral-200 rounded-xl px-2.5 py-1.5 text-neutral-800 font-medium focus:outline-hidden"
                        >
                          {CRM_QUERY_TAGS.map(tag => (
                            <option key={tag} value={tag}>
                              {tag}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Status Dropdown */}
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                          Initial Status
                        </label>
                        <select
                          value={newQueryStatus}
                          onChange={e => setNewQueryStatus(e.target.value as any)}
                          className="w-full text-xs bg-white border border-neutral-200 rounded-xl px-2.5 py-1.5 text-neutral-800 font-medium focus:outline-hidden"
                        >
                          <option value="Open">Open (Pending Follow-up)</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Resolved">Resolved Immediately</option>
                        </select>
                      </div>
                    </div>

                    {/* Remarks Textarea */}
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                        Inquiry Remarks & Resolution Discussion
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={newQueryRemarks}
                        onChange={e => setNewQueryRemarks(e.target.value)}
                        placeholder="Detail customer query, fit feedback, delay explanation, or address change instructions..."
                        className="w-full text-xs bg-white border border-neutral-200 rounded-xl p-3 text-neutral-900 focus:outline-hidden focus:border-teal-500 transition"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      {queryFeedback ? (
                        <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          {queryFeedback}
                        </span>
                      ) : (
                        <span className="text-[11px] text-neutral-500">
                          Automatically logs with permanent timestamp and agent attribution.
                        </span>
                      )}

                      <button
                        type="submit"
                        disabled={!newQueryRemarks.trim() || isSubmittingQuery}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-medium rounded-xl text-xs transition cursor-pointer disabled:opacity-40 shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{isSubmittingQuery ? 'Logging...' : 'Post CRM Remark'}</span>
                      </button>
                    </div>
                  </form>

                  {/* Query Timeline List */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-bold text-neutral-700 uppercase tracking-wider px-1">
                      Logged Customer Queries ({(selectedCustomer.crmQueries || []).length})
                    </h3>

                    {(selectedCustomer.crmQueries || []).length === 0 ? (
                      <div className="glass-panel p-8 rounded-2xl text-center border border-neutral-200 bg-white/70">
                        <MessageSquare className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                        <p className="font-semibold text-neutral-700 text-sm">No CRM queries recorded</p>
                        <p className="text-xs text-neutral-400 mt-1">
                          Use the form above to log customer queries, sizing tickets, or delay follow-ups.
                        </p>
                      </div>
                    ) : (
                      (selectedCustomer.crmQueries || []).map(q => {
                        const isOpen = q.status === 'Open';
                        const isInProgress = q.status === 'In Progress';
                        const isResolved = q.status === 'Resolved';

                        return (
                          <div
                            key={q.id}
                            className={`p-4 rounded-2xl border transition text-xs relative ${
                              isOpen
                                ? 'bg-amber-50/40 border-amber-200'
                                : isInProgress
                                ? 'bg-blue-50/30 border-blue-200'
                                : 'bg-white border-neutral-200'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-neutral-100">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-neutral-900 text-white">
                                  {q.tag}
                                </span>

                                {q.orderId && (
                                  <button
                                    onClick={() => onViewOrderSummary(q.orderId!)}
                                    className="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-neutral-100 text-neutral-800 hover:bg-neutral-200 border border-neutral-200 flex items-center gap-1"
                                  >
                                    <span>#{q.orderId}</span>
                                    <ExternalLink className="w-3 h-3 text-neutral-500" />
                                  </button>
                                )}

                                <span className="text-[11px] text-neutral-400">
                                  {new Date(q.createdAt).toLocaleString()}
                                </span>
                              </div>

                              {/* Status Badge with Click-to-Cycle */}
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleToggleQueryStatus(q)}
                                  title="Click to cycle status: Open -> In Progress -> Resolved"
                                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer border flex items-center gap-1 ${
                                    isOpen
                                      ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                      : isInProgress
                                      ? 'bg-blue-100 text-blue-900 border-blue-300 hover:bg-blue-200'
                                      : 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                                  }`}
                                >
                                  {isOpen && <Clock className="w-3 h-3 text-amber-700" />}
                                  {isInProgress && <Layers className="w-3 h-3 text-blue-700" />}
                                  {isResolved && <CheckCircle2 className="w-3 h-3 text-emerald-700" />}
                                  <span>{q.status}</span>
                                </button>
                              </div>
                            </div>

                            {/* Remarks Text */}
                            <p className="text-neutral-800 text-xs leading-relaxed mb-2 font-medium">
                              {q.remarks}
                            </p>

                            {/* Resolution Note if resolved */}
                            {q.resolution && (
                              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs mb-2">
                                <span className="font-semibold block mb-0.5 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  Resolution Note:
                                </span>
                                <span>{q.resolution}</span>
                              </div>
                            )}

                            {/* Inline mark as resolved button if open */}
                            {!isResolved && resolvingQueryId !== q.id && (
                              <button
                                onClick={() => {
                                  setResolvingQueryId(q.id);
                                  setResolutionInput('');
                                }}
                                className="text-[11px] text-emerald-700 hover:text-emerald-900 font-medium flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Mark as Resolved with Note
                              </button>
                            )}

                            {resolvingQueryId === q.id && (
                              <div className="mt-2 p-3 bg-white rounded-xl border border-emerald-300 space-y-2">
                                <label className="block text-[11px] font-semibold text-emerald-900">
                                  Resolution Summary (e.g. Dispatched replacement pair / Refund completed):
                                </label>
                                <input
                                  type="text"
                                  autoFocus
                                  value={resolutionInput}
                                  onChange={e => setResolutionInput(e.target.value)}
                                  placeholder="Enter how this inquiry was resolved..."
                                  className="w-full text-xs p-2 border border-neutral-200 rounded-lg focus:outline-hidden"
                                />
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => setResolvingQueryId(null)}
                                    className="px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 rounded-md"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleConfirmResolution(q.id)}
                                    className="px-3 py-1 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700 font-semibold"
                                  >
                                    Confirm Resolved
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Footer attribution */}
                            <div className="pt-2 mt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-400">
                              <span>
                                Handled by: <strong className="text-neutral-700">{q.agentName}</strong> ({q.agentRole})
                              </span>
                              {q.updatedAt && q.updatedAt !== q.createdAt && (
                                <span>Updated: {new Date(q.updatedAt).toLocaleTimeString()}</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-panel p-12 rounded-3xl text-center border border-neutral-200 bg-white/80">
              <Users className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-neutral-800">Select a Customer Profile</h3>
              <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                Choose a customer from the left directory to fetch complete order histories, view tracking, and resolve live CRM queries.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Upload Modal */}
      <CustomerBulkUploadModal
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        onImportComplete={count => {
          refreshCustomers();
        }}
      />

      {/* Add Single Customer Modal */}
      <AddCustomerModal
        isOpen={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
        currentUser={currentUser}
        onCustomerAdded={newCust => {
          refreshCustomers();
          setSelectedCustomerId(newCust.id);
        }}
      />
    </div>
  );
};
