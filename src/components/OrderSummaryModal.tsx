import React, { useState, useEffect, useMemo } from 'react';
import {
  OrderSummaryData,
  UserProfile,
  UserRole,
  STANDARD_DELAY_REASONS
} from '../types';
import {
  buildOrderSummary,
  addOrderRemark,
  OrderSummaryContext
} from '../services/orderHistoryService';
import { ProductThumbnail } from './ProductThumbnail';
import { resolveProductImage } from '../services/productImageService';
import { getStoredShopifyOrders } from '../services/shopifyApi';
import {
  X,
  Copy,
  Check,
  Clock,
  MessageSquare,
  Package,
  Truck,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Send,
  Calendar,
  Layers,
  History,
  Tag,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Database
} from 'lucide-react';

interface OrderSummaryModalProps {
  orderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  context: OrderSummaryContext;
  currentUser?: UserProfile | null;
  onRemarkAdded?: () => void;
  onNavigateToTab?: (tab: string) => void;
  onOpenSchemaCustomizer?: (tableKey: 'order_audit_events' | 'production_remarks') => void;
}

export const OrderSummaryModal: React.FC<OrderSummaryModalProps> = ({
  orderId,
  isOpen,
  onClose,
  context,
  currentUser,
  onRemarkAdded,
  onNavigateToTab,
  onOpenSchemaCustomizer
}) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'remarks' | 'details'>('timeline');
  const [copiedId, setCopiedId] = useState(false);
  const [newRemarkText, setNewRemarkText] = useState('');
  const [selectedDelayReason, setSelectedDelayReason] = useState<string>('');
  const [isSubmittingRemark, setIsSubmittingRemark] = useState(false);
  const [remarkSuccess, setRemarkSuccess] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Build the order summary
  const summary: OrderSummaryData | null = useMemo(() => {
    if (!orderId) return null;
    return buildOrderSummary(orderId, context);
  }, [orderId, context, refreshTrigger]);

  if (!isOpen || !orderId || !summary) return null;

  const handleCopyOrderId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(summary.orderId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handlePostRemark = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRemarkText.trim()) return;

    const finalRemark = selectedDelayReason 
      ? `[${selectedDelayReason}] ${newRemarkText.trim()}`
      : newRemarkText.trim();

    setIsSubmittingRemark(true);
    try {
      const author = {
        name: currentUser?.name || 'BLKBRD Staff',
        role: currentUser?.role || 'admin'
      };

      addOrderRemark(summary.orderId, finalRemark, author, `${summary.currentStage} (Active)`);
      setNewRemarkText('');
      setSelectedDelayReason('');
      setRemarkSuccess(true);
      setRefreshTrigger(prev => prev + 1);
      setTimeout(() => setRemarkSuccess(false), 3000);

      if (onRemarkAdded) {
        onRemarkAdded();
      }
    } catch (err) {
      console.error('Failed adding remark:', err);
    } finally {
      setIsSubmittingRemark(false);
    }
  };

  // Status badge styling
  const isShipped = summary.orderStatus === 'Shipped' || summary.currentStage === 'Shipped';
  const isReady = summary.orderStatus === 'Ready to Ship' || summary.currentStage === 'RTD';

  const statusBadge = isShipped ? (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
      Shipped
    </span>
  ) : isReady ? (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
      <Package className="w-3.5 h-3.5 text-blue-600" />
      Ready to Ship (RTD)
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
      <Clock className="w-3.5 h-3.5 text-amber-700" />
      Delayed in Production
    </span>
  );

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'created':
        return <Package className="w-4 h-4 text-indigo-600" />;
      case 'stage_change':
        return <Layers className="w-4 h-4 text-purple-600" />;
      case 'status_change':
        return <Sparkles className="w-4 h-4 text-blue-600" />;
      case 'delay_reason':
      case 'rescheduled':
        return <AlertTriangle className="w-4 h-4 text-amber-600" />;
      case 'dispatch':
        return <Truck className="w-4 h-4 text-emerald-600" />;
      case 'return_logged':
      case 'return_received':
        return <RotateCcw className="w-4 h-4 text-rose-600" />;
      case 'remark':
      default:
        return <MessageSquare className="w-4 h-4 text-neutral-600" />;
    }
  };

  const getEventBgColor = (type: string) => {
    switch (type) {
      case 'created':
        return 'bg-indigo-50 border-indigo-200';
      case 'stage_change':
        return 'bg-purple-50 border-purple-200';
      case 'status_change':
        return 'bg-blue-50 border-blue-200';
      case 'delay_reason':
      case 'rescheduled':
        return 'bg-amber-50 border-amber-200';
      case 'dispatch':
        return 'bg-emerald-50 border-emerald-200';
      case 'return_logged':
      case 'return_received':
        return 'bg-rose-50 border-rose-200';
      case 'remark':
      default:
        return 'bg-neutral-50 border-neutral-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/40 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div
        className="bg-white rounded-3xl border border-neutral-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-neutral-800 my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header - Shopify Admin Style */}
        <div className="p-5 sm:p-6 border-b border-neutral-200 bg-neutral-50/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {(() => {
              const shopifyOrders = getStoredShopifyOrders();
              const resolvedImage = resolveProductImage(summary.orderId, summary.product, shopifyOrders);

              return (
                <div className="flex items-start gap-3.5">
                  <ProductThumbnail
                    src={resolvedImage}
                    alt={summary.product || 'Footwear Model'}
                    size="md"
                    className="rounded-2xl shadow-xs border border-neutral-200 bg-white shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-xl font-bold font-mono tracking-tight text-neutral-900">
                        {summary.orderId}
                      </span>

                      <button
                        type="button"
                        onClick={handleCopyOrderId}
                        title="Copy Order ID"
                        className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/70 transition cursor-pointer"
                      >
                        {copiedId ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      {statusBadge}

                      <span
                        className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full font-medium border ${
                          summary.storeTab === 'LLC'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-neutral-100 text-neutral-700 border-neutral-200'
                        }`}
                      >
                        {summary.storeTab === 'LLC' ? 'USA LLC Store' : 'Global Store'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 text-xs text-neutral-600 flex-wrap">
                      <span className="font-semibold text-neutral-900">{summary.customerName}</span>
                      <span>•</span>
                      <span className="font-medium text-neutral-800">{summary.product}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-neutral-500">
                        <Calendar className="w-3.5 h-3.5" />
                        Ordered: {summary.orderDate}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white hover:bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-neutral-900 transition cursor-pointer shadow-2xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Metric Bar: Revisions, Remarks Count, Milestone, Days Delayed */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-neutral-200/70">
            {/* Updates Count Metric */}
            <div className="bg-white p-3 rounded-2xl border border-neutral-200/80 shadow-2xs flex flex-col">
              <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                Revisions &amp; Updates
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base sm:text-lg font-bold font-mono text-neutral-900">
                  {summary.updateCount}
                </span>
                <span className="text-[11px] text-neutral-500 font-medium">
                  {summary.updateCount === 1 ? 'update' : 'updates'}
                </span>
              </div>
              <span className="text-[10px] text-neutral-400 mt-0.5 truncate">
                Last {summary.lastUpdatedAt.split(',')[0]}
              </span>
            </div>

            {/* Remarks Count Metric */}
            <div className="bg-white p-3 rounded-2xl border border-neutral-200/80 shadow-2xs flex flex-col">
              <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                Staff Remarks
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base sm:text-lg font-bold font-mono text-neutral-900">
                  {summary.remarksHistory.length}
                </span>
                <span className="text-[11px] text-neutral-500 font-medium">on record</span>
              </div>
              <span className="text-[10px] text-neutral-400 mt-0.5 truncate">
                Full audit preserved
              </span>
            </div>

            {/* Current Stage */}
            <div className="bg-white p-3 rounded-2xl border border-neutral-200/80 shadow-2xs flex flex-col">
              <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                Factory Stage
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm sm:text-base font-bold text-neutral-900 truncate">
                  {summary.currentStage}
                </span>
              </div>
              <span className="text-[10px] text-neutral-400 mt-0.5 truncate">
                Target: {summary.expectedDate}
              </span>
            </div>

            {/* Delay or Delivery Days */}
            <div className="bg-white p-3 rounded-2xl border border-neutral-200/80 shadow-2xs flex flex-col">
              <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                Schedule Status
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                {isShipped ? (
                  <span className="text-sm sm:text-base font-bold text-emerald-700">Fulfilled</span>
                ) : summary.daysDelayed > 0 ? (
                  <>
                    <span className="text-base sm:text-lg font-bold font-mono text-amber-700">
                      +{summary.daysDelayed}
                    </span>
                    <span className="text-[11px] text-amber-700 font-medium">days late</span>
                  </>
                ) : (
                  <span className="text-sm sm:text-base font-bold text-neutral-700">On Track</span>
                )}
              </div>
              <span className="text-[10px] text-neutral-400 mt-0.5 truncate">
                {summary.delayReason || 'Factory workflow'}
              </span>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('timeline')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'timeline'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'bg-neutral-200/60 text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Order Journey &amp; Timeline</span>
                <span className="text-[10px] opacity-75 font-mono">({summary.timeline.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('remarks')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'remarks'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'bg-neutral-200/60 text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Remarks History</span>
                <span className="text-[10px] opacity-75 font-mono">
                  ({summary.remarksHistory.length})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'details'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'bg-neutral-200/60 text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>360 Order Specs</span>
              </button>
            </div>

            {currentUser?.role === 'admin' && onOpenSchemaCustomizer && (
              <button
                type="button"
                onClick={() => onOpenSchemaCustomizer(activeTab === 'remarks' ? 'production_remarks' : 'order_audit_events')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-neutral-800 bg-white hover:bg-neutral-100 border border-neutral-300/80 transition cursor-pointer shadow-2xs"
                title="Choose and customize table elements by use case"
              >
                <Database className="w-3.5 h-3.5 text-neutral-700" />
                <span>Customise Table Elements</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5 bg-white">
          {/* TAB 1: ORDER JOURNEY & TIMELINE (Shopify Style) */}
          {activeTab === 'timeline' && (
            <div className="space-y-6">
              {/* Shopify-Style New Remark Composer */}
              <div className="bg-neutral-50 rounded-2xl border border-neutral-200/90 p-4 shadow-2xs">
                <form onSubmit={handlePostRemark} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-800 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-neutral-600" />
                      <span>Leave a remark / note on this order</span>
                    </label>
                    <span className="text-[11px] text-neutral-500">
                      Posting as: <strong className="text-neutral-800">{currentUser?.name || 'Staff Member'}</strong>
                    </span>
                  </div>

                  <div className="relative">
                    <textarea
                      value={newRemarkText}
                      onChange={e => setNewRemarkText(e.target.value)}
                      placeholder="Add an update on production, customer communication, sole dyeing, or dispatch status..."
                      rows={2}
                      className="w-full text-xs p-3 rounded-xl border border-neutral-300 focus:outline-hidden focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 bg-white placeholder-neutral-400 transition"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-neutral-600">
                        Tag Delay Reason:
                      </span>
                      <select
                        value={selectedDelayReason}
                        onChange={e => setSelectedDelayReason(e.target.value)}
                        className="text-[11px] bg-white border border-neutral-300 rounded-lg px-2 py-1 text-neutral-800 font-medium focus:outline-hidden focus:border-neutral-900"
                      >
                        <option value="">None (General Note)</option>
                        {STANDARD_DELAY_REASONS.map(reason => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {remarkSuccess && (
                        <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Saved!
                        </span>
                      )}

                      <button
                        type="submit"
                        disabled={!newRemarkText.trim() || isSubmittingRemark}
                        className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs px-4 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Post Remark</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Visual Chronological Timeline (Vertical) */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Order Timeline &amp; Journey History
                  </h4>
                  <span className="text-[11px] text-neutral-500 font-mono">
                    {summary.timeline.length} {summary.timeline.length === 1 ? 'event' : 'events'} logged
                  </span>
                </div>

                <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-200">
                  {summary.timeline.map((event, idx) => (
                    <div key={event.id || idx} className="relative group">
                      {/* Node circle */}
                      <div className="absolute -left-6 top-0.5 w-6 h-6 rounded-full bg-white border-2 border-neutral-300 flex items-center justify-center group-hover:border-neutral-800 transition">
                        <div className="w-2 h-2 rounded-full bg-neutral-700" />
                      </div>

                      {/* Event Card */}
                      <div className={`rounded-2xl p-4 border transition ${getEventBgColor(event.type)}`}>
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="p-1 rounded-md bg-white border border-neutral-200/80 shadow-2xs">
                              {getEventIcon(event.type)}
                            </span>
                            <h5 className="text-xs font-bold text-neutral-900">{event.title}</h5>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto text-[11px] text-neutral-500">
                            <Clock className="w-3 h-3 text-neutral-400" />
                            <span>{event.timestamp}</span>
                          </div>
                        </div>

                        {/* Author stamp */}
                        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-neutral-600">
                          <span>Logged by:</span>
                          <span className="font-semibold text-neutral-800 bg-white/80 px-2 py-0.5 rounded-md border border-neutral-200/60">
                            {event.authorName}
                          </span>
                          {event.authorRole && (
                            <span className="text-[10px] uppercase font-mono text-neutral-500">
                              ({event.authorRole})
                            </span>
                          )}
                        </div>

                        {/* Description / Remark text */}
                        {event.description && (
                          <div className="mt-2 text-xs text-neutral-700 font-sans leading-relaxed bg-white/80 p-2.5 rounded-xl border border-neutral-200/60">
                            {event.description}
                          </div>
                        )}

                        {/* Stamped Workshop Photo if attached */}
                        {(event.imageUrl || event.metadata?.photo_url) && (
                          <div className="mt-2 flex items-center gap-2">
                            <ProductThumbnail
                              src={event.imageUrl || event.metadata?.photo_url}
                              alt={`Workshop Photo - ${event.title}`}
                              size="md"
                              className="rounded-xl border border-neutral-200 bg-white shadow-2xs"
                            />
                            <span className="text-[10px] text-neutral-500 font-mono">
                              Click photo to expand (Workshop Floor Upload)
                            </span>
                          </div>
                        )}

                        {/* Metadata badges if available */}
                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap text-[10px] font-mono">
                            {event.metadata.courier && (
                              <span className="bg-white px-2 py-0.5 rounded-md border border-neutral-200 text-neutral-700">
                                Courier: {event.metadata.courier}
                              </span>
                            )}
                            {event.metadata.awb && (
                              <span className="bg-white px-2 py-0.5 rounded-md border border-neutral-200 text-neutral-700">
                                AWB: {event.metadata.awb}
                              </span>
                            )}
                            {event.metadata.stageTransition && (
                              <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md font-semibold">
                                {event.metadata.stageTransition}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: REMARKS HISTORY */}
          {activeTab === 'remarks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-neutral-900">
                    Chronological Remarks &amp; Feedback Stream
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    All remarks recorded by CRM, Workshop Leads, and Logistics agents for {summary.orderId}
                  </p>
                </div>
                <span className="text-xs font-mono font-medium text-neutral-600 bg-neutral-100 px-2.5 py-1 rounded-lg">
                  {summary.remarksHistory.length} Remarks
                </span>
              </div>

              {summary.remarksHistory.length === 0 ? (
                <div className="p-8 text-center bg-neutral-50 rounded-2xl border border-neutral-200">
                  <MessageSquare className="w-8 h-8 mx-auto text-neutral-300 mb-2" />
                  <p className="text-xs text-neutral-500">No remarks on record for this order yet.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('timeline')}
                    className="mt-3 text-xs text-neutral-900 font-semibold underline cursor-pointer"
                  >
                    Add the first remark in the Timeline tab
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {summary.remarksHistory.map(rem => (
                    <div
                      key={rem.id}
                      className="p-4 rounded-2xl border border-neutral-200/90 bg-neutral-50/50 space-y-2 hover:border-neutral-300 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-neutral-900">
                            {rem.author}
                          </span>
                          {rem.role && (
                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-white border border-neutral-200 text-neutral-600">
                              {rem.role}
                            </span>
                          )}
                          {rem.stageTransition && (
                            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-purple-100 text-purple-800">
                              {rem.stageTransition}
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] text-neutral-500 flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-neutral-400" />
                          {rem.timestamp}
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-xl border border-neutral-200/80 text-xs text-neutral-800 leading-relaxed font-sans space-y-2">
                        <div>"{rem.remark}"</div>
                        {rem.imageUrl && (
                          <div className="pt-1 flex items-center gap-2">
                            <ProductThumbnail
                              src={rem.imageUrl}
                              alt={`Workshop Remark Photo by ${rem.author}`}
                              size="md"
                              className="rounded-xl border border-neutral-200 bg-white shadow-2xs"
                            />
                            <span className="text-[10px] text-neutral-500 font-mono">
                              Photo captured during stage: {rem.stageTransition || 'Crafting'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: 360 ORDER SPECS & BREAKDOWN */}
          {activeTab === 'details' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Customer Profile Card */}
              <div className="bg-neutral-50/80 p-4 rounded-2xl border border-neutral-200/80 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
                  <ShieldCheck className="w-4 h-4 text-neutral-700" />
                  <span>Customer Information</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-neutral-200/60 pb-1.5">
                    <span className="text-neutral-500">Name:</span>
                    <span className="font-semibold text-neutral-900">{summary.customerName}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-neutral-200/60 pb-1.5">
                    <span className="text-neutral-500">Store Channel:</span>
                    <span className="font-mono text-neutral-800">
                      {summary.storeTab === 'LLC' ? 'US LLC Store' : 'Global International'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-neutral-200/60 pb-1.5">
                    <span className="text-neutral-500">First Recorded:</span>
                    <span className="font-mono text-neutral-800">{summary.firstRecordedAt}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Order Updates:</span>
                    <span className="font-mono font-bold text-neutral-900">{summary.updateCount} revisions</span>
                  </div>
                </div>
              </div>

              {/* Manufacturing & Crafting Card */}
              <div className="bg-neutral-50/80 p-4 rounded-2xl border border-neutral-200/80 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
                  <Package className="w-4 h-4 text-neutral-700" />
                  <span>Manufacturing &amp; Workshop Specs</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-neutral-200/60 pb-1.5">
                    <span className="text-neutral-500">Product:</span>
                    <span className="font-semibold text-neutral-900 text-right truncate max-w-[200px]">
                      {summary.product}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-neutral-200/60 pb-1.5">
                    <span className="text-neutral-500">Current Milestone:</span>
                    <span className="font-bold text-purple-700">{summary.currentStage}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-neutral-200/60 pb-1.5">
                    <span className="text-neutral-500">Target Delivery:</span>
                    <span className="font-mono text-neutral-900">{summary.expectedDate}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Delay Reason:</span>
                    {summary.delayReason ? (
                      <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold truncate max-w-[220px]">
                        {summary.delayReason}
                      </span>
                    ) : (
                      <span className="text-neutral-400 font-medium">Standard Factory Workflow</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Logistics & Dispatch Card */}
              <div className="bg-neutral-50/80 p-4 rounded-2xl border border-neutral-200/80 space-y-3 md:col-span-2">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
                  <Truck className="w-4 h-4 text-neutral-700" />
                  <span>Fulfillment &amp; Dispatch Details</span>
                </div>

                {summary.dispatchDetails ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-white p-3 rounded-xl border border-neutral-200">
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase">Shipping Partner</span>
                      <span className="font-semibold text-neutral-900">
                        {summary.dispatchDetails.shippingPartner || summary.dispatchDetails.courier || 'Bluedart Express'}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase">Tracking AWB</span>
                      <span className="font-mono font-bold text-neutral-900">
                        {summary.dispatchDetails.outgoingTrackingAwb || summary.dispatchDetails.trackingDetails || 'Pending'}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[10px] uppercase">Dispatch Date</span>
                      <span className="font-mono text-neutral-900">
                        {summary.dispatchDetails.date || summary.expectedDate}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-neutral-600 bg-white p-3 rounded-xl border border-neutral-200 flex items-center justify-between">
                    <span>This order has not been dispatched yet. When marked as RTD, dispatch can be processed from the Dispatches view.</span>
                    {onNavigateToTab && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onNavigateToTab('dispatch');
                        }}
                        className="text-xs font-semibold text-neutral-900 underline flex items-center gap-1 cursor-pointer shrink-0 ml-2"
                      >
                        <span>Dispatch Queue</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <ShieldCheck className="w-4 h-4 text-neutral-600" />
            <span>Audit log and remarks are securely preserved in the BLKBRD system.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
          >
            Close Summary
          </button>
        </div>
      </div>
    </div>
  );
};
