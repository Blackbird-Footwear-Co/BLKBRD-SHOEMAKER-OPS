import React, { useState, useMemo } from 'react';
import { ClubbedOrderItem } from '../types';
import { calculateDelayDays } from '../utils/delinquencyUtils';
import {
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Package,
  Clock,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface ClubbedOrderExplorerProps {
  orders: ClubbedOrderItem[];
  onSelectOrder: (orderId: string) => void;
  selectedOrderId?: string | null;
}

export const ClubbedOrderExplorer: React.FC<ClubbedOrderExplorerProps> = ({
  orders,
  onSelectOrder,
  selectedOrderId
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'multi_source' | 'delinquent' | 'dispatched' | 'returns'>('multi_source');
  const [expandedId, setExpandedId] = useState<string | null>(selectedOrderId || null);
  const [copiedTracking, setCopiedTracking] = useState<string | null>(null);

  // Sync expanded with selectedOrderId prop if changed
  React.useEffect(() => {
    if (selectedOrderId) {
      setExpandedId(selectedOrderId);
    }
  }, [selectedOrderId]);

  const handleCopy = (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedTracking(text);
    setTimeout(() => setCopiedTracking(null), 2000);
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Filter mode
      if (filterMode === 'multi_source' && order.sourceCount < 2) return false;
      if (filterMode === 'delinquent') {
        if (!order.delinquencyDetails) return false;
        const d = order.delinquencyDetails;
        const isRtd = d.orderStatus === 'Ready to Ship' || d.currentStage === 'RTD';
        const isShipped = d.orderStatus === 'Shipped' || d.currentStage === 'Shipped' || Boolean(order.dispatchDetails);
        if (isRtd || isShipped) return false;
        const delay = (d.orderDate && d.expectedDate)
          ? calculateDelayDays(d.orderDate, d.expectedDate)
          : (d.daysDelayed || 0);
        if (delay < 1) return false;
      }
      if (filterMode === 'dispatched' && !order.dispatchDetails) return false;
      if (filterMode === 'returns' && !order.returnDetails) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesKey = order.orderKey.toLowerCase().includes(q);
        const matchesCust = order.matchedCustomer.toLowerCase().includes(q);
        const matchesTracking = order.dispatchDetails?.trackingDetails.toLowerCase().includes(q) ||
          order.returnDetails?.incomingTrackingNo.toLowerCase().includes(q) ||
          order.returnDetails?.exchangeTracking.toLowerCase().includes(q);
        const matchesReason = order.delinquencyDetails?.delayReason.toLowerCase().includes(q) ||
          order.returnDetails?.reason.toLowerCase().includes(q) ||
          order.returnDetails?.notes.toLowerCase().includes(q);

        return matchesKey || matchesCust || matchesTracking || matchesReason;
      }

      return true;
    });
  }, [orders, filterMode, searchQuery]);

  const multiSourceCount = useMemo(() => orders.filter(o => o.sourceCount > 1).length, [orders]);

  return (
    <div className="space-y-5" id="clubbed-order-explorer">
      {/* Header Info Box */}
      <div className="bg-white rounded-xl border border-gray-200/80 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-md">
                <Layers className="w-4 h-4" />
              </span>
              <h2 className="text-base font-semibold text-gray-900">Unified Order 360 Matrix</h2>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Cross-referencing orders across <strong>Returns Tracker</strong>, <strong>Daily Dispatch</strong>, and <strong>Delinquency</strong> databases.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 bg-gray-50 p-1 rounded-lg border border-gray-200 text-xs">
            <button
              onClick={() => setFilterMode('multi_source')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                filterMode === 'multi_source'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Multi-Source Linked ({multiSourceCount})
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                filterMode === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Unique Orders ({orders.length})
            </button>
            <button
              onClick={() => setFilterMode('delinquent')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                filterMode === 'delinquent'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Delinquencies
            </button>
            <button
              onClick={() => setFilterMode('dispatched')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                filterMode === 'dispatched'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Dispatched
            </button>
            <button
              onClick={() => setFilterMode('returns')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                filterMode === 'returns'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Returns
            </button>
          </div>
        </div>

        {/* Search and summary bar */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Order ID (e.g. BLKBRD9490), Customer name, Courier tracking, Reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-colors"
            />
          </div>
          <div className="text-xs text-gray-500 whitespace-nowrap">
            Showing <strong>{filteredOrders.length}</strong> matching records
          </div>
        </div>
      </div>

      {/* Cross-Sheet Orders List */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Filter className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">No orders match the current filter</p>
            <p className="text-xs text-gray-500 mt-1">Try switching tabs or clearing your search term.</p>
          </div>
        ) : (
          filteredOrders.map((item) => {
            const isExpanded = expandedId === item.orderKey;

            return (
              <div
                key={item.orderKey}
                className={`bg-white rounded-xl border transition-all duration-150 overflow-hidden ${
                  isExpanded
                    ? 'border-indigo-300 ring-2 ring-indigo-100 shadow-sm'
                    : 'border-gray-200/90 hover:border-gray-300 hover:shadow-xs'
                }`}
              >
                {/* Header Row */}
                <div
                  onClick={() => {
                    const next = isExpanded ? null : item.orderKey;
                    setExpandedId(next);
                    onSelectOrder(item.orderKey);
                  }}
                  className="p-4 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/40 hover:bg-gray-50/80 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="font-mono text-sm font-bold text-gray-900 flex items-center gap-2">
                      <span>{item.orderKey}</span>
                      {item.sourceCount > 1 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                          <Sparkles className="w-3 h-3" /> {item.sourceCount} Sheets Linked
                        </span>
                      )}
                    </div>
                    <span className="text-gray-300">|</span>
                    <span className="text-xs font-semibold text-gray-800 truncate max-w-[200px]">
                      {item.matchedCustomer}
                    </span>
                  </div>

                  {/* Sources badges */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      {item.delinquencyDetails && (
                        (item.delinquencyDetails.daysDelayed >= 1 && !item.dispatchDetails && item.delinquencyDetails.currentStage !== 'RTD' && item.delinquencyDetails.orderStatus !== 'Ready to Ship') ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">
                            <Clock className="w-3 h-3" /> Delinquent (+{item.delinquencyDetails.daysDelayed}d)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            <Layers className="w-3 h-3" /> Workshop: {item.delinquencyDetails.currentStage}
                          </span>
                        )
                      )}
                      {item.dispatchDetails && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          <Package className="w-3 h-3" /> Shipped ({item.dispatchDetails.courier})
                        </span>
                      )}
                      {item.returnDetails && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          <RotateCcw className="w-3 h-3" /> Return: {item.returnDetails.type}
                        </span>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Key Quick Insight snippet */}
                {item.insights.length > 0 && (
                  <div className="px-4 py-2 bg-indigo-50/40 border-t border-b border-indigo-100/60 flex items-center gap-2 text-xs text-indigo-900 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0"></span>
                    <span>{item.insights[0]}</span>
                    {item.insights.length > 1 && (
                      <span className="text-indigo-600 text-[11px] font-normal">
                        (+{item.insights.length - 1} more insights)
                      </span>
                    )}
                  </div>
                )}

                {/* Expanded 3-Sheet Detail Panel */}
                {isExpanded && (
                  <div className="p-5 border-t border-gray-200 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* 1. Delinquency Column */}
                      <div className={`rounded-xl p-4 border text-xs ${
                        item.delinquencyDetails
                          ? 'bg-red-50/40 border-red-200'
                          : 'bg-gray-50 border-gray-200 text-gray-400'
                      }`}>
                        <div className="flex items-center justify-between pb-2 mb-3 border-b border-gray-200">
                          <span className="font-bold flex items-center gap-1 text-red-900">
                            <Clock className="w-3.5 h-3.5 text-red-600" /> Delinquency Tracker
                          </span>
                          {item.delinquencyDetails ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                              Active Delay
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400">Not Present</span>
                          )}
                        </div>

                        {item.delinquencyDetails ? (
                          <div className="space-y-2 text-gray-700">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Days Delayed:</span>
                              <span className="font-bold text-red-700">+{item.delinquencyDetails.daysDelayed} Days</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Order Date:</span>
                              <span>{item.delinquencyDetails.orderDate}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Expected SLA:</span>
                              <span>{item.delinquencyDetails.expectedDate}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Stage:</span>
                              <span className="font-medium text-gray-900">{item.delinquencyDetails.currentStage}</span>
                            </div>
                            <div className="pt-2 border-t border-red-100">
                              <span className="text-gray-500 block">Delay Reason:</span>
                              <span className="font-medium text-red-900">{item.delinquencyDetails.delayReason}</span>
                            </div>
                            {item.delinquencyDetails.actionRequired && (
                              <div className="p-2 bg-white/80 rounded border border-red-200 mt-2">
                                <span className="text-[10px] font-semibold text-red-700 uppercase tracking-wide block">Action Required</span>
                                <span className="font-medium text-gray-900">{item.delinquencyDetails.actionRequired}</span>
                              </div>
                            )}
                            <div className="flex justify-between pt-1">
                              <span className="text-gray-500">Escalation:</span>
                              <span className="font-medium text-purple-700">{item.delinquencyDetails.escalationStatus || 'Normal'}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="italic text-gray-400 py-4 text-center">
                            No delay records for this order ID in the Delinquency Tracker sheet.
                          </p>
                        )}
                      </div>

                      {/* 2. Daily Dispatch Column */}
                      <div className={`rounded-xl p-4 border text-xs ${
                        item.dispatchDetails
                          ? 'bg-blue-50/40 border-blue-200'
                          : 'bg-gray-50 border-gray-200 text-gray-400'
                      }`}>
                        <div className="flex items-center justify-between pb-2 mb-3 border-b border-gray-200">
                          <span className="font-bold flex items-center gap-1 text-blue-900">
                            <Package className="w-3.5 h-3.5 text-blue-600" /> Daily Dispatch
                          </span>
                          {item.dispatchDetails ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                              Dispatched
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400">Not Dispatched</span>
                          )}
                        </div>

                        {item.dispatchDetails ? (
                          <div className="space-y-2 text-gray-700">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Ship Date:</span>
                              <span className="font-bold text-gray-900">{item.dispatchDetails.date}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Destination:</span>
                              <span className="font-semibold text-blue-800">{item.dispatchDetails.region}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Carrier:</span>
                              <span className="font-bold text-gray-900">{item.dispatchDetails.courier}</span>
                            </div>
                            <div className="pt-2 border-t border-blue-100">
                              <span className="text-gray-500 block mb-1">Tracking Number / AWB:</span>
                              <div className="flex items-center justify-between bg-white p-2 rounded border border-blue-200 font-mono text-xs">
                                <span className="truncate">{item.dispatchDetails.trackingDetails}</span>
                                <button
                                  onClick={(e) => handleCopy(item.dispatchDetails!.trackingDetails, e)}
                                  className="ml-2 text-blue-600 hover:text-blue-800 shrink-0"
                                  title="Copy tracking number"
                                >
                                  {copiedTracking === item.dispatchDetails.trackingDetails ? (
                                    <Check className="w-3.5 h-3.5 text-green-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                            <div className="flex justify-between pt-1">
                              <span className="text-gray-500">Website Fulfilled:</span>
                              <span className="font-medium text-emerald-700">{item.dispatchDetails.trackingFulfilled || 'YES'}</span>
                            </div>
                            {item.dispatchDetails.notes && (
                              <div className="text-gray-500 mt-1">
                                Notes: <span className="text-gray-800">{item.dispatchDetails.notes}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="italic text-gray-400 py-4 text-center">
                            Order not found in Daily Dispatch log yet.
                          </p>
                        )}
                      </div>

                      {/* 3. Returns Tracker Column */}
                      <div className={`rounded-xl p-4 border text-xs ${
                        item.returnDetails
                          ? 'bg-amber-50/40 border-amber-200'
                          : 'bg-gray-50 border-gray-200 text-gray-400'
                      }`}>
                        <div className="flex items-center justify-between pb-2 mb-3 border-b border-gray-200">
                          <span className="font-bold flex items-center gap-1 text-amber-900">
                            <RotateCcw className="w-3.5 h-3.5 text-amber-600" /> Returns Tracker
                          </span>
                          {item.returnDetails ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                              Return Logged
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400">No Return</span>
                          )}
                        </div>

                        {item.returnDetails ? (
                          <div className="space-y-2 text-gray-700">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Status:</span>
                              <span className="font-bold text-amber-900">{item.returnDetails.status}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Type:</span>
                              <span className="font-semibold text-gray-800">{item.returnDetails.type}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Reason:</span>
                              <span className="font-medium text-gray-900">{item.returnDetails.reason}</span>
                            </div>
                            {item.returnDetails.newOrderId && (
                              <div className="p-2 bg-white/80 rounded border border-amber-200 flex items-center justify-between">
                                <span className="text-gray-500">Replacement Order:</span>
                                <span className="font-mono font-bold text-amber-900">{item.returnDetails.newOrderId}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-gray-500">Physical Return Received:</span>
                              <span className="font-bold text-gray-900">{item.returnDetails.returnReceived}</span>
                            </div>
                            {item.returnDetails.incomingTrackingNo && (
                              <div className="pt-1">
                                <span className="text-gray-500 block">Incoming Tracking:</span>
                                <span className="font-mono text-gray-800">{item.returnDetails.incomingCourier} - {item.returnDetails.incomingTrackingNo}</span>
                              </div>
                            )}
                            {item.returnDetails.notes && (
                              <div className="pt-1 text-gray-600 italic">
                                "{item.returnDetails.notes}"
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="italic text-gray-400 py-4 text-center">
                            No return or exchange case opened for this order.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Operational Recommendations Box */}
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs">
                      <div className="font-semibold text-gray-800 mb-1 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Operational Correlation Insights
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-gray-600">
                        {item.insights.map((insight, idx) => (
                          <li key={idx}>{insight}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
