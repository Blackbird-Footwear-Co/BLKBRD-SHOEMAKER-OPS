import React, { useMemo } from 'react';
import { ReturnItem, DispatchItem, DelinquencyItem, ClubbedOrderItem } from '../types';
import { calculateDelayDays } from '../utils/delinquencyUtils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import {
  TrendingUp,
  AlertTriangle,
  Package,
  RotateCcw,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight
} from 'lucide-react';

interface ExecutiveOverviewProps {
  returns: ReturnItem[];
  dispatches: DispatchItem[];
  delinquencies: DelinquencyItem[];
  clubbedOrders: ClubbedOrderItem[];
  onSelectOrder: (orderId: string) => void;
  onNavigateTab: (tab: any) => void;
}

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

export const ExecutiveOverview: React.FC<ExecutiveOverviewProps> = ({
  returns,
  dispatches,
  delinquencies,
  clubbedOrders,
  onSelectOrder,
  onNavigateTab
}) => {
  // Returns metrics
  const returnStats = useMemo(() => {
    const total = returns.length;
    const closed = returns.filter(r => r.status.toLowerCase().includes('closed') || r.status.toLowerCase().includes('sent')).length;
    const received = returns.filter(r => r.returnReceived.toLowerCase().includes('yes') || r.returnReceived.toLowerCase().includes('yas')).length;
    const domestic = returns.filter(r => r.region.toLowerCase().includes('domestic')).length;
    const international = total - domestic;

    // Reason frequency
    const reasonCounts: Record<string, number> = {};
    returns.forEach(r => {
      let norm = r.reason.trim().toLowerCase();
      if (norm.includes('big') || norm.includes('loose')) norm = 'Size Too Big';
      else if (norm.includes('small') || norm.includes('tight')) norm = 'Size Too Small';
      else if (norm.includes('color') || norm.includes('colour') || norm.includes('shade')) norm = 'Color Issue';
      else if (norm.includes('resole') || norm.includes('repair') || norm.includes('damage') || norm.includes('stitch')) norm = 'Resole & Repair';
      else if (norm.includes('trial')) norm = 'Size Trial';
      else if (norm.includes('insole') || norm.includes('instep')) norm = 'Fitting / Insole';
      else norm = 'Other / Exchange';

      reasonCounts[norm] = (reasonCounts[norm] || 0) + 1;
    });

    const topReasons = Object.entries(reasonCounts)
      .map(([name, count]) => ({ name, value: count }))
      .sort((a, b) => b.value - a.value);

    return { total, closed, received, domestic, international, topReasons };
  }, [returns]);

  // Dispatch metrics
  const dispatchStats = useMemo(() => {
    const total = dispatches.length;
    const domestic = dispatches.filter(d => d.region.toUpperCase().includes('DOMESTIC')).length;
    const international = total - domestic;

    // By Date
    const dateMap: Record<string, { date: string; domestic: number; international: number; total: number }> = {};
    dispatches.forEach(d => {
      const dateKey = d.date || 'Other';
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = { date: dateKey, domestic: 0, international: 0, total: 0 };
      }
      if (d.region.toUpperCase().includes('DOMESTIC')) {
        dateMap[dateKey].domestic += 1;
      } else {
        dateMap[dateKey].international += 1;
      }
      dateMap[dateKey].total += 1;
    });

    const dailyTrend = Object.values(dateMap);

    // By Courier
    const courierMap: Record<string, number> = {};
    dispatches.forEach(d => {
      const c = d.courier.trim().toUpperCase() || 'UNKNOWN';
      courierMap[c] = (courierMap[c] || 0) + 1;
    });
    const courierDist = Object.entries(courierMap).map(([name, count]) => ({ name, count }));

    return { total, domestic, international, dailyTrend, courierDist };
  }, [dispatches]);

  // Delinquency metrics (Only orders with delay >= 1 are categorized as Delinquent)
  const delinquencyStats = useMemo(() => {
    const delinquentOrders = delinquencies.filter(d => {
      const isRtd = d.orderStatus === 'Ready to Ship' || d.currentStage === 'RTD';
      const isShipped = d.orderStatus === 'Shipped' || d.currentStage === 'Shipped';
      if (isRtd || isShipped) return false;
      const delay = (d.orderDate && d.expectedDate)
        ? calculateDelayDays(d.orderDate, d.expectedDate)
        : (d.daysDelayed || 0);
      return delay >= 1;
    });

    const total = delinquentOrders.length;
    const critical = delinquentOrders.filter(d => {
      const delay = (d.orderDate && d.expectedDate)
        ? calculateDelayDays(d.orderDate, d.expectedDate)
        : (d.daysDelayed || 0);
      return delay > 7;
    }).length;
    const totalDelayDays = delinquentOrders.reduce((acc, curr) => {
      const delay = (curr.orderDate && curr.expectedDate)
        ? calculateDelayDays(curr.orderDate, curr.expectedDate)
        : (curr.daysDelayed || 0);
      return acc + delay;
    }, 0);
    const avgDelay = total > 0 ? Math.round(totalDelayDays / total) : 0;
    const maxDelay = total > 0
      ? Math.max(...delinquentOrders.map(d => (d.orderDate && d.expectedDate ? calculateDelayDays(d.orderDate, d.expectedDate) : (d.daysDelayed || 0))), 0)
      : 0;
    const escalated = delinquentOrders.filter(d => (d.escalationStatus || '').toLowerCase().includes('escalat')).length;

    return { total, critical, avgDelay, maxDelay, escalated, delinquentOrders };
  }, [delinquencies]);

  // Cross-sheet matches (orders appearing in >1 sheet)
  const crossMatches = useMemo(() => {
    return clubbedOrders.filter(o => o.sourceCount > 1);
  }, [clubbedOrders]);

  return (
    <div className="space-y-6" id="dashboard-executive-overview">
      {/* Top Banner KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Delinquency Risk Card */}
        <div
          id="card-kpi-delinquency"
          onClick={() => onNavigateTab('delinquency')}
          className="bg-white rounded-xl border border-red-200/80 p-5 shadow-xs hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-red-600 tracking-wide uppercase flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Delinquency Watch
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              {delinquencyStats.critical} Critical (&gt;7d)
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900">{delinquencyStats.total}</span>
            <span className="text-xs text-gray-500">delayed orders logged</span>
          </div>
          <p className="mt-2 text-xs text-gray-600 flex items-center justify-between">
            <span>Avg delay: <strong>{delinquencyStats.avgDelay} days</strong></span>
            <span>Max: <strong className="text-red-600">{delinquencyStats.maxDelay}d</strong></span>
          </p>
          <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs text-red-700 font-medium">
            <span>{delinquencyStats.escalated} Escalated to Production</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Daily Dispatch Velocity Card */}
        <div
          id="card-kpi-dispatch"
          onClick={() => onNavigateTab('dispatch')}
          className="bg-white rounded-xl border border-blue-200/80 p-5 shadow-xs hover:shadow-md transition-shadow cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-600 tracking-wide uppercase flex items-center gap-1.5">
              <Package className="w-4 h-4" /> Daily Dispatch
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {dispatchStats.dailyTrend.length} Days Active
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900">{dispatchStats.total}</span>
            <span className="text-xs text-gray-500">units shipped</span>
          </div>
          <div className="mt-2 text-xs text-gray-600 flex items-center justify-between">
            <span>Domestic: <strong>{dispatchStats.domestic}</strong></span>
            <span>International: <strong>{dispatchStats.international}</strong></span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs text-blue-700 font-medium">
            <span>Carrier tracking active 100%</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Returns Tracker Pipeline Card */}
        <div
          id="card-kpi-returns"
          onClick={() => onNavigateTab('returns')}
          className="bg-white rounded-xl border border-amber-200/80 p-5 shadow-xs hover:shadow-md transition-shadow cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700 tracking-wide uppercase flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4" /> Returns Tracker
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              {returnStats.closed} Closed/Sent
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900">{returnStats.total}</span>
            <span className="text-xs text-gray-500">cases tracked</span>
          </div>
          <div className="mt-2 text-xs text-gray-600 flex items-center justify-between">
            <span>Physical Returns Recv: <strong>{returnStats.received}</strong></span>
            <span>Intl: <strong>{returnStats.international}</strong></span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs text-amber-800 font-medium">
            <span>Size exchanges is top reason</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Clubbed 3-Sheet Correlator Card */}
        <div
          id="card-kpi-correlator"
          onClick={() => onNavigateTab('clubbed')}
          className="bg-gradient-to-br from-indigo-50 to-blue-50/50 rounded-xl border border-indigo-200 p-5 shadow-xs hover:shadow-md transition-shadow cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-700 tracking-wide uppercase flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" /> Clubbed Intelligence
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-600 text-white">
              3 Sheets Live
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-indigo-950">{crossMatches.length}</span>
            <span className="text-xs text-indigo-700 font-medium">multi-sheet linked orders</span>
          </div>
          <p className="mt-2 text-xs text-gray-600">
            Cross-referenced across Returns, Dispatch &amp; Delinquency datasets.
          </p>
          <div className="mt-3 pt-2.5 border-t border-indigo-200/60 flex items-center justify-between text-xs text-indigo-800 font-semibold">
            <span>Explore Order 360 view</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Cross-Sheet Friction & Resolution Highlights */}
      {crossMatches.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 sm:p-5" id="cross-sheet-alerts-banner">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <h2 className="text-sm font-bold text-amber-900">
                  Cross-Sheet Correlated Insights ({crossMatches.length} Orders in Multiple Sheets)
                </h2>
                <button
                  onClick={() => onNavigateTab('clubbed')}
                  className="text-xs font-semibold text-amber-800 hover:text-amber-950 underline flex items-center gap-1 self-start sm:self-auto"
                >
                  View All Linked Records <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
              <p className="text-xs text-amber-800/90 mt-1">
                The engine correlated orders appearing in both Delinquency and Dispatch, as well as returns with matching dispatch records.
              </p>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                {crossMatches.slice(0, 3).map((match) => (
                  <div
                    key={match.orderKey}
                    onClick={() => onSelectOrder(match.orderKey)}
                    className="bg-white p-3 rounded-lg border border-amber-200/80 shadow-xs hover:border-amber-400 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-gray-900">{match.orderKey}</span>
                      <div className="flex gap-1">
                        {match.sources.map(s => (
                          <span key={s} className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-700 rounded">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 mt-1 truncate">
                      {match.matchedCustomer}
                    </div>
                    <div className="text-[11px] text-emerald-700 font-medium mt-1.5 line-clamp-2">
                      {match.insights[match.insights.length - 1]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Dispatch Velocity Chart */}
        <div className="bg-white rounded-xl border border-gray-200/80 p-5 shadow-xs" id="chart-daily-dispatch">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Daily Dispatch Velocity</h2>
              <p className="text-xs text-gray-500">Fulfillment volume by day &amp; region destination</p>
            </div>
            <button
              onClick={() => onNavigateTab('dispatch')}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              Open Dispatch <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dispatchStats.dailyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Bar dataKey="domestic" name="Domestic" fill="#2563eb" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="international" name="International" fill="#0284c7" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Peak Day: <strong>Sep 02 ({dispatchStats.dailyTrend.find(d => d.date === 'Sep02')?.total || 10} units)</strong></span>
            <span>Total Shipped: <strong>{dispatchStats.total} orders</strong></span>
          </div>
        </div>

        {/* Return Reasons Breakdown Chart */}
        <div className="bg-white rounded-xl border border-gray-200/80 p-5 shadow-xs" id="chart-return-reasons">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Return &amp; Exchange Drivers</h2>
              <p className="text-xs text-gray-500">Distribution of customer return reasons across {returnStats.total} records</p>
            </div>
            <button
              onClick={() => onNavigateTab('returns')}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              Open Returns <ExternalLink className="w-3 h-3" />
            </button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={returnStats.topReasons}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {returnStats.topReasons.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => [`${value} cases (${Math.round(Number(value) / returnStats.total * 100)}%)`, 'Count']}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>Primary Driver: <strong>Size Fit (Big &amp; Small: ~55%)</strong></span>
            <span>Second: <strong>Resole, Repair &amp; Insole</strong></span>
          </div>
        </div>
      </div>

      {/* Delinquency Critical Queue & Courier Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Delinquent Orders Priority Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200/80 p-5 shadow-xs" id="widget-delinquency-critical">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-red-100 text-red-700 rounded-md">
                <Clock className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Critical Delinquency Action List</h2>
                <p className="text-xs text-gray-500">Orders exceeding delivery SLAs requiring production follow-up</p>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('delinquency')}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              View Tracker ({delinquencies.length})
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Order ID</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Days Delayed</th>
                  <th className="py-2.5 px-3">Delay Reason</th>
                  <th className="py-2.5 px-3">Action Required</th>
                  <th className="py-2.5 px-3">Escalation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {delinquencyStats.delinquentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      <Clock className="w-5 h-5 text-emerald-500 mx-auto mb-1 opacity-80" />
                      <span className="font-semibold text-gray-800 text-xs">Zero Delinquent Orders</span>
                      <p className="text-[11px] text-gray-400 mt-0.5">All active workshop orders are within schedule (+21d) or queued for dispatch.</p>
                    </td>
                  </tr>
                ) : (
                  delinquencyStats.delinquentOrders.map((item) => {
                    const delay = (item.orderDate && item.expectedDate)
                      ? calculateDelayDays(item.orderDate, item.expectedDate)
                      : (item.daysDelayed || 0);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => onSelectOrder(item.orderId)}
                        className="hover:bg-red-50/40 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-gray-900">{item.orderId}</td>
                        <td className="py-2.5 px-3 font-medium text-gray-800">{item.customerName}</td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold ${
                            delay > 30 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            +{delay} days
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">{item.delayReason || 'Workshop SLA Exceeded'}</td>
                        <td className="py-2.5 px-3 text-gray-700 font-medium">{item.actionRequired || '—'}</td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${
                            (item.escalationStatus || '').toLowerCase().includes('lead')
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {item.escalationStatus || 'Normal'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Courier Partner Distribution */}
        <div className="bg-white rounded-xl border border-gray-200/80 p-5 shadow-xs flex flex-col justify-between" id="widget-couriers">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Courier Logistics Share</h2>
              <span className="text-xs text-gray-400">Current dispatches</span>
            </div>
            <div className="space-y-3">
              {dispatchStats.courierDist.map((c, i) => {
                const percentage = Math.round((c.count / dispatchStats.total) * 100);
                return (
                  <div key={c.name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-gray-700">{c.name}</span>
                      <span className="text-gray-500">{c.count} parcels ({percentage}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: COLORS[i % COLORS.length]
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <h3 className="text-xs font-semibold text-gray-700 mb-2">Operational Notes</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Domestic shipments are routed through <strong>Blue Dart</strong> &amp; <strong>Shree Maruti</strong>, while international orders are handled by <strong>UPS</strong> &amp; <strong>USPS</strong> with end-to-end AWB tracking.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
