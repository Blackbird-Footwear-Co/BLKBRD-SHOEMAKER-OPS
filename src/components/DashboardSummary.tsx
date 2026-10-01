import React from 'react';
import { UserRole } from '../types';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Footprints,
  ShoppingBag,
  Bell,
  Store,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import { SectionId, SECTION_THEMES } from '../theme';

interface SummaryProps {
  role: UserRole;
  readyToShipCount: number;
  shippedCount: number;
  delayedCount: number;
  returnsCount: number;
  trialPairsCount: number;
  shopifyOrdersCount: number;
  unreadRemarksCount: number;
  shopifyConnected?: boolean;
  shopifyDomain?: string;
  activeSection?: SectionId;
  onOpenShopifyConnect?: () => void;
  onFilterClick?: (filter: string) => void;
}

export const DashboardSummary: React.FC<SummaryProps> = ({
  role,
  readyToShipCount,
  shippedCount,
  delayedCount,
  returnsCount,
  trialPairsCount,
  shopifyOrdersCount,
  unreadRemarksCount,
  shopifyConnected = true,
  shopifyDomain = 'blackbirdshoes.myshopify.com',
  activeSection = 'delinquency',
  onOpenShopifyConnect,
  onFilterClick
}) => {
  const currentTheme = SECTION_THEMES[activeSection] || SECTION_THEMES.delinquency;

  return (
    <div className="glass-panel rounded-3xl p-3.5 sm:p-5 mb-4 sm:mb-5 transition-all duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3.5 border-b border-neutral-200/60 gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-neutral-800 uppercase tracking-widest">
              BLKBRD DASHBOARD
            </h2>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-medium font-mono px-2 py-0.5 rounded-full border transition-all duration-300 ${currentTheme.contextBadge}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${currentTheme.cardIndicatorDot} animate-pulse`}></span>
              <span>{currentTheme.shortLabel} View Active</span>
            </span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Unified live operations powered by Supabase, Shopify store feed, and Workshop Logs
          </p>
        </div>

        {/* Shopify & Supabase live badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {shopifyConnected ? (
            role === 'admin' ? (
              <button
                onClick={onOpenShopifyConnect}
                className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-900 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full cursor-pointer hover:bg-emerald-500/15 transition"
                title="Click to manage Shopify login"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="hidden sm:inline">Shopify:</span>
                <span className="truncate max-w-[130px] sm:max-w-none">{shopifyDomain}</span>
              </button>
            ) : (
              <div
                className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-900 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full"
                title="Shopify feed connected"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="hidden sm:inline">Shopify:</span>
                <span className="truncate max-w-[130px] sm:max-w-none">{shopifyDomain}</span>
              </div>
            )
          ) : (
            role === 'admin' ? (
              <button
                onClick={onOpenShopifyConnect}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-700 glass-pill px-3 py-1 rounded-full cursor-pointer hover:bg-white/80 transition"
              >
                <Store className="w-3 h-3 stroke-[1.5]" />
                <span>Configure Shopify</span>
              </button>
            ) : null
          )}

          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-900 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Supabase Connected</span>
          </div>

          {role === 'admin' && (
            <button
              onClick={() => onFilterClick?.('analytics')}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-950 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200/90 px-3 py-1 rounded-full cursor-pointer transition shadow-2xs"
              title="View Delayed Orders, Order Stages & Returns Trends"
            >
              <TrendingUp className="w-3.5 h-3.5 text-indigo-600 stroke-[2]" />
              <span className="font-semibold">Operations Trends</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row - Responsive Grid for Mobile & Desktop */}
      <div className={`grid gap-2.5 sm:gap-3 ${
        role === 'admin'
          ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-7'
          : role === 'logistics'
          ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
          : 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-4'
      }`}>
        {/* Ready to Ship / RTD: visible to Admin, Production, and Logistics */}
        {(role === 'admin' || role === 'production' || role === 'logistics') && (
          <div
            onClick={() => onFilterClick?.(role === 'logistics' ? 'rtd' : 'ready')}
            className={`glass-card rounded-2xl p-3 sm:p-3.5 hover:bg-white/90 hover:scale-[1.01] transition-all duration-300 cursor-pointer group relative overflow-hidden ${
              (role === 'logistics' ? activeSection === 'dispatch' : activeSection === 'delinquency')
                ? 'border-emerald-400/80 ring-2 ring-emerald-400/25 bg-emerald-50/40 shadow-xs'
                : ''
            }`}
          >
            {(role === 'logistics' ? activeSection === 'dispatch' : activeSection === 'delinquency') && (
              <div className="absolute top-0 right-0 w-2 h-2 rounded-bl-lg bg-emerald-500" />
            )}
            <div className="flex items-center justify-between text-neutral-500 mb-1.5 sm:mb-2">
              <span className={`text-xs font-medium transition ${
                (role === 'logistics' ? activeSection === 'dispatch' : activeSection === 'delinquency')
                  ? 'text-emerald-900 font-semibold'
                  : 'group-hover:text-neutral-900'
              }`}>
                {role === 'logistics' ? 'Ready to Dispatch (RTD)' : 'Ready to Ship (RTD)'}
              </span>
              <CheckCircle2 className="w-4 h-4 stroke-[1.5] transition text-emerald-600" />
            </div>
            <div className="text-xl sm:text-2xl font-semibold font-mono text-neutral-900 tracking-tight flex items-center justify-between">
              <span>{readyToShipCount}</span>
              {role === 'logistics' && readyToShipCount > 0 && (
                <span className="text-[10px] font-sans font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
                  Action
                </span>
              )}
            </div>
            <div className="text-[10px] sm:text-[11px] text-neutral-400 mt-1 truncate">
              {role === 'logistics' ? 'Workshop boxed • Awaiting AWB' : 'QC passed & boxed'}
            </div>
          </div>
        )}

        {/* Shipped: visible to all roles */}
        <div
          onClick={() => onFilterClick?.('dispatch')}
          className={`glass-card rounded-2xl p-3 sm:p-3.5 hover:bg-white/90 hover:scale-[1.01] transition-all duration-300 cursor-pointer group relative overflow-hidden ${
            activeSection === 'dispatch'
              ? 'border-blue-400/80 ring-2 ring-blue-400/25 bg-blue-50/40 shadow-xs'
              : ''
          }`}
        >
          {activeSection === 'dispatch' && (
            <div className="absolute top-0 right-0 w-2 h-2 rounded-bl-lg bg-blue-500" />
          )}
          <div className="flex items-center justify-between text-neutral-500 mb-1.5 sm:mb-2">
            <span className={`text-xs font-medium transition ${activeSection === 'dispatch' ? 'text-blue-900 font-semibold' : 'group-hover:text-neutral-900'}`}>
              Shipped
            </span>
            <Clock className={`w-4 h-4 stroke-[1.5] transition ${activeSection === 'dispatch' ? 'text-blue-600' : 'text-neutral-600'}`} />
          </div>
          <div className="text-xl sm:text-2xl font-semibold font-mono text-neutral-900 tracking-tight">
            {shippedCount}
          </div>
          <div className="text-[10px] sm:text-[11px] text-neutral-400 mt-1 truncate">Dispatched with AWB</div>
        </div>

        {/* Delayed: visible to Admin & Production */}
        {(role === 'admin' || role === 'production') && (
          <div
            onClick={() => onFilterClick?.('delinquency')}
            className={`glass-card rounded-2xl p-3 sm:p-3.5 hover:bg-white/90 hover:scale-[1.01] transition-all duration-300 cursor-pointer group relative overflow-hidden ${
              activeSection === 'delinquency'
                ? 'border-amber-400/80 ring-2 ring-amber-400/25 bg-amber-50/40 shadow-xs'
                : ''
            }`}
          >
            {activeSection === 'delinquency' && (
              <div className="absolute top-0 right-0 w-2 h-2 rounded-bl-lg bg-amber-500" />
            )}
            <div className="flex items-center justify-between text-neutral-500 mb-1.5 sm:mb-2">
              <span className={`text-xs font-medium transition ${activeSection === 'delinquency' ? 'text-amber-900 font-semibold' : 'group-hover:text-neutral-900'}`}>
                Delayed
              </span>
              <AlertTriangle className={`w-4 h-4 stroke-[1.5] transition ${activeSection === 'delinquency' ? 'text-amber-600' : 'text-amber-600/80'}`} />
            </div>
            <div className="text-xl sm:text-2xl font-semibold font-mono text-neutral-900 tracking-tight">
              {delayedCount}
            </div>
            <div className="text-[10px] sm:text-[11px] text-neutral-400 mt-1 truncate">In workshop action</div>
          </div>
        )}

        {/* Returns Received: visible to Admin & Logistics */}
        {(role === 'admin' || role === 'logistics') && (
          <div
            onClick={() => onFilterClick?.('returns')}
            className={`glass-card rounded-2xl p-3 sm:p-3.5 hover:bg-white/90 hover:scale-[1.01] transition-all duration-300 cursor-pointer group relative overflow-hidden ${
              activeSection === 'returns'
                ? 'border-teal-400/80 ring-2 ring-teal-400/25 bg-teal-50/40 shadow-xs'
                : ''
            }`}
          >
            {activeSection === 'returns' && (
              <div className="absolute top-0 right-0 w-2 h-2 rounded-bl-lg bg-teal-500" />
            )}
            <div className="flex items-center justify-between text-neutral-500 mb-1.5 sm:mb-2">
              <span className={`text-xs font-medium transition truncate ${activeSection === 'returns' ? 'text-teal-900 font-semibold' : 'group-hover:text-neutral-900'}`}>
                Returns
              </span>
              <RotateCcw className={`w-4 h-4 stroke-[1.5] shrink-0 transition ${activeSection === 'returns' ? 'text-teal-600' : 'text-neutral-600'}`} />
            </div>
            <div className="text-xl sm:text-2xl font-semibold font-mono text-neutral-900 tracking-tight">
              {returnsCount}
            </div>
            <div className="text-[10px] sm:text-[11px] text-neutral-400 mt-1 truncate">Exchanges &amp; adjustments</div>
          </div>
        )}

        {/* Trial Pairs: visible to Admin & Logistics */}
        {(role === 'admin' || role === 'logistics') && (
          <div
            onClick={() => onFilterClick?.('trials')}
            className={`glass-card rounded-2xl p-3 sm:p-3.5 hover:bg-white/90 hover:scale-[1.01] transition-all duration-300 cursor-pointer group relative overflow-hidden ${
              activeSection === 'trials'
                ? 'border-violet-400/80 ring-2 ring-violet-400/25 bg-violet-50/40 shadow-xs'
                : ''
            }`}
          >
            {activeSection === 'trials' && (
              <div className="absolute top-0 right-0 w-2 h-2 rounded-bl-lg bg-violet-500" />
            )}
            <div className="flex items-center justify-between text-neutral-500 mb-1.5 sm:mb-2">
              <span className={`text-xs font-medium transition truncate ${activeSection === 'trials' ? 'text-violet-900 font-semibold' : 'group-hover:text-neutral-900'}`}>
                Trial Pairs
              </span>
              <Footprints className={`w-4 h-4 stroke-[1.5] shrink-0 transition ${activeSection === 'trials' ? 'text-violet-600' : 'text-neutral-600'}`} />
            </div>
            <div className="text-xl sm:text-2xl font-semibold font-mono text-neutral-900 tracking-tight">
              {trialPairsCount}
            </div>
            <div className="text-[10px] sm:text-[11px] text-neutral-400 mt-1 truncate">Fit testing kits</div>
          </div>
        )}

        {/* Shopify Live Feed */}
        <div
          onClick={() => onFilterClick?.('shopify')}
          className={`glass-card rounded-2xl p-3 sm:p-3.5 hover:bg-white/90 hover:scale-[1.01] transition-all duration-300 cursor-pointer group relative overflow-hidden ${
            activeSection === 'shopify'
              ? 'border-emerald-400/80 ring-2 ring-emerald-400/25 bg-emerald-50/40 shadow-xs'
              : ''
          }`}
        >
          {activeSection === 'shopify' && (
            <div className="absolute top-0 right-0 w-2 h-2 rounded-bl-lg bg-emerald-500" />
          )}
          <div className="flex items-center justify-between text-neutral-500 mb-1.5 sm:mb-2">
            <span className={`text-xs font-medium transition truncate ${activeSection === 'shopify' ? 'text-emerald-900 font-semibold' : 'group-hover:text-neutral-900'}`}>
              Shopify Orders
            </span>
            <ShoppingBag className={`w-4 h-4 stroke-[1.5] shrink-0 transition ${activeSection === 'shopify' ? 'text-emerald-600' : 'text-neutral-600'}`} />
          </div>
          <div className="text-xl sm:text-2xl font-semibold font-mono text-neutral-900 tracking-tight">
            {shopifyOrdersCount}
          </div>
          <div className="text-[10px] sm:text-[11px] text-neutral-400 mt-1 truncate">Live store feed</div>
        </div>

        {/* Production Remarks for Admin */}
        {role === 'admin' && (
          <div
            onClick={() => onFilterClick?.('remarks')}
            className="glass-card rounded-2xl p-3 sm:p-3.5 hover:bg-white/90 hover:scale-[1.01] transition-all duration-200 cursor-pointer group col-span-2 sm:col-span-1"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1.5 sm:mb-2">
              <span className="text-xs font-medium group-hover:text-neutral-900 transition truncate">Remarks</span>
              <Bell className="w-4 h-4 stroke-[1.5] text-neutral-600 shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-semibold font-mono text-neutral-900 tracking-tight">
              {unreadRemarksCount}
            </div>
            <div className="text-[10px] sm:text-[11px] text-neutral-400 mt-1 truncate">Workshop log notes</div>
          </div>
        )}
      </div>
    </div>
  );
};
