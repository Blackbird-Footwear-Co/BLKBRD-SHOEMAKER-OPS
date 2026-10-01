import React from 'react';
import { UserProfile, UserRole, ProductionRemark } from '../types';
import { ShopifyConfig, ShopifyDualConfig } from '../services/shopifyApi';
import {
  ShoppingBag,
  AlertTriangle,
  Package,
  RotateCcw,
  Boxes,
  Users,
  Layers,
  Sparkles,
  ShieldCheck,
  Bell,
  RefreshCw,
  LogOut,
  ChevronRight,
  User,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Sliders,
  Store,
  TrendingUp
} from 'lucide-react';

export type AdminViewSegment =
  | 'shopify'
  | 'delinquency'
  | 'dispatch'
  | 'returns'
  | 'inventory'
  | 'customers'
  | 'clubbed'
  | 'analytics';

interface AdminSidebarProps {
  currentSegment: string;
  onSelectSegment: (segment: string) => void;
  currentUser: UserProfile | null;
  onSelectRole: (role: UserRole) => void;
  onLogout: () => void;
  onOpenShopifyConnect: () => void;
  onOpenRemarks: () => void;
  onOpenUserManagement?: () => void;
  onOpenSchemaCustomizer?: () => void;
  onRefreshAll?: () => void;
  isRefreshing?: boolean;
  remarks: ProductionRemark[];
  shopifyConfig: ShopifyConfig;
  shopifyDualConfig: ShopifyDualConfig;
  counts: {
    shopifyOrders: number;
    delinquencies: number;
    dispatchAndRtd: number;
    returns: number;
    inventory: number;
    crossMatched: number;
  };
  isProgressiveMode: boolean;
  onToggleProgressiveMode: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentSegment,
  onSelectSegment,
  currentUser,
  onSelectRole,
  onLogout,
  onOpenShopifyConnect,
  onOpenRemarks,
  onOpenUserManagement,
  onOpenSchemaCustomizer,
  onRefreshAll,
  isRefreshing = false,
  remarks,
  counts,
  isProgressiveMode,
  onToggleProgressiveMode,
  isMobileOpen,
  onCloseMobile,
  isCollapsed,
  onToggleCollapse
}) => {
  const unreadRemarks = remarks.filter(r => !r.read).length;

  const navItems = [
    {
      id: 'shopify',
      label: 'Shopify Orders',
      icon: ShoppingBag,
      count: counts.shopifyOrders
    },
    {
      id: 'delinquency',
      label: 'Delinquency Tracker',
      icon: AlertTriangle,
      count: counts.delinquencies
    },
    {
      id: 'dispatch',
      label: 'Shipping: Dispatch & RTD',
      icon: Package,
      count: counts.dispatchAndRtd
    },
    {
      id: 'returns',
      label: 'Returns',
      icon: RotateCcw,
      count: counts.returns
    },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: Boxes,
      count: counts.inventory
    },
    {
      id: 'customers',
      label: 'CRM HUB',
      icon: Users,
      count: '360°'
    },
    {
      id: 'analytics',
      label: 'Trends & Analytics',
      icon: TrendingUp,
      count: 'Live'
    }
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-neutral-900/40 backdrop-blur-xs z-40 md:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container (Light Sleek Theme - Docked on Tablets & Desktops, Drawer on Mobile) */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 bg-white/95 backdrop-blur-md text-neutral-800 flex flex-col border-r border-neutral-200/90 shadow-sm transition-all duration-300 ease-in-out md:translate-x-0 ${
          isMobileOpen
            ? 'translate-x-0 w-72'
            : isCollapsed
            ? 'md:w-20 -translate-x-full'
            : 'md:w-72 -translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className={`p-3.5 border-b border-neutral-100 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between gap-2'}`}>
          {isCollapsed ? (
            /* Collapsed Single Interactive Monogram */
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Expand Sidebar"
              className="group relative w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center font-serif font-bold text-base shadow-xs transition hover:ring-2 hover:ring-amber-500/50 hover:bg-neutral-800 cursor-pointer shrink-0"
            >
              <span className="group-hover:hidden transition tracking-wider">B</span>
              <PanelLeftOpen className="w-4.5 h-4.5 hidden group-hover:block text-amber-300 transition" />
            </button>
          ) : (
            /* Expanded Brand & Collapse Toggle */
            <>
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8.5 h-8.5 rounded-xl bg-neutral-900 text-white flex items-center justify-center font-serif font-bold text-sm shadow-xs shrink-0 tracking-wider">
                  B
                </div>
                <div className="min-w-0 flex-1 truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="font-serif font-bold tracking-wider text-sm text-neutral-900 truncate">BLKBRD</span>
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-900 font-semibold border border-amber-200/60 shrink-0">
                      HUB
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-400 font-sans truncate">Operations & Workshop</p>
                </div>
              </div>

              {/* Desktop & Tablet Collapse Toggle Button */}
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Collapse Sidebar"
                className="hidden md:flex p-1.5 rounded-lg text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition cursor-pointer shrink-0"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>

              {/* Mobile Close Button */}
              <button
                type="button"
                onClick={onCloseMobile}
                title="Close Menu"
                className="md:hidden p-1.5 rounded-lg text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {/* Store Connection Status Banner */}
        {!isCollapsed && (
          <div className="px-4 py-2 bg-neutral-50/80 border-b border-neutral-100 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-neutral-700 font-medium font-mono text-[10px]">Global: Live</span>
              <span className="text-neutral-300">·</span>
              <span className="text-neutral-500 font-mono text-[10px]">LLC: Ready</span>
            </div>

            <button
              type="button"
              onClick={onOpenShopifyConnect}
              title="Shopify Store Connections"
              className="text-[10px] text-neutral-500 hover:text-neutral-900 font-medium flex items-center gap-0.5 cursor-pointer hover:underline"
            >
              <span>Sync</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 scrollbar-thin scrollbar-thumb-neutral-200">
          {!isCollapsed && (
            <div className="px-3 pt-1 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
              Segments
            </div>
          )}

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentSegment === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectSegment(item.id);
                  onCloseMobile();
                }}
                title={isCollapsed ? `${item.label} (${item.count})` : undefined}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2'} rounded-xl transition-all cursor-pointer group text-left ${
                  isActive
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/80'
                }`}
              >
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} min-w-0`}>
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isActive ? 'bg-white/15 text-white' : 'text-neutral-500 group-hover:text-neutral-900'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  {!isCollapsed && (
                    <span className={`text-xs font-semibold leading-tight truncate ${isActive ? 'text-white' : 'text-neutral-800 group-hover:text-neutral-950'}`}>
                      {item.label}
                    </span>
                  )}
                </div>

                {!isCollapsed && item.count !== undefined && (
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 font-medium ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-neutral-100 text-neutral-600 group-hover:bg-neutral-200/80 group-hover:text-neutral-900'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}

          {!isCollapsed && (
            <div className="pt-3 px-3 pb-1 text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
              Tools
            </div>
          )}

          {/* Cross-Matched Orders */}
          <button
            type="button"
            onClick={() => {
              onSelectSegment('clubbed');
              onCloseMobile();
            }}
            title={isCollapsed ? `Cross-Matched Orders (${counts.crossMatched})` : undefined}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2'} rounded-xl transition-all cursor-pointer group text-left ${
              currentSegment === 'clubbed'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/80'
            }`}
          >
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${currentSegment === 'clubbed' ? 'bg-white/15 text-white' : 'text-neutral-500 group-hover:text-neutral-900'}`}>
                <Layers className="w-4 h-4" />
              </div>
              {!isCollapsed && (
                <span className="text-xs font-semibold text-neutral-800 group-hover:text-neutral-950">Cross-Matched</span>
              )}
            </div>
            {!isCollapsed && (
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-medium ${
                currentSegment === 'clubbed' ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'
              }`}>
                {counts.crossMatched}
              </span>
            )}
          </button>

          {/* Progressive Wizard Mode Toggle */}
          <button
            type="button"
            onClick={onToggleProgressiveMode}
            title={isCollapsed ? 'Progressive Staff Wizard' : undefined}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2'} rounded-xl transition-all cursor-pointer group text-left ${
              isProgressiveMode
                ? 'bg-amber-500/15 text-amber-950 border border-amber-300 font-semibold'
                : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/80'
            }`}
          >
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-600">
                <Sparkles className="w-4 h-4" />
              </div>
              {!isCollapsed && (
                <span className="text-xs font-semibold text-neutral-800 group-hover:text-neutral-950">
                  {isProgressiveMode ? 'Exit Wizard' : 'Staff Wizard'}
                </span>
              )}
            </div>
            {!isCollapsed && (
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-medium">
                {isProgressiveMode ? 'Active' : 'Guide'}
              </span>
            )}
          </button>

          {/* User Management (Admin Authority) */}
          {currentUser?.role === 'admin' && onOpenUserManagement && (
            <button
              type="button"
              onClick={() => {
                onOpenUserManagement();
                onCloseMobile();
              }}
              title={isCollapsed ? 'Team & Access Management' : undefined}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2.5'} rounded-xl transition-all cursor-pointer group text-left text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/80 min-h-[40px]`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-500 group-hover:text-neutral-900">
                  <Users className="w-4 h-4" />
                </div>
                {!isCollapsed && (
                  <span className="text-xs font-semibold text-neutral-800 group-hover:text-neutral-950">Team & Access</span>
                )}
              </div>
              {!isCollapsed && (
                <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 font-medium">
                  Staff
                </span>
              )}
            </button>
          )}

          {/* Custom Fields & Database Schema */}
          {currentUser?.role === 'admin' && onOpenSchemaCustomizer && (
            <button
              type="button"
              onClick={() => {
                onOpenSchemaCustomizer();
                onCloseMobile();
              }}
              title={isCollapsed ? 'Custom Table Fields & Schema' : undefined}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2.5'} rounded-xl transition-all cursor-pointer group text-left text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/80 min-h-[40px]`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-500 group-hover:text-neutral-900">
                  <Sliders className="w-4 h-4" />
                </div>
                {!isCollapsed && (
                  <span className="text-xs font-semibold text-neutral-800 group-hover:text-neutral-950">Custom Fields</span>
                )}
              </div>
              {!isCollapsed && (
                <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 font-medium">
                  Schema
                </span>
              )}
            </button>
          )}

          {/* Store Channels & Credentials */}
          {currentUser?.role === 'admin' && (
            <button
              type="button"
              onClick={() => {
                onOpenShopifyConnect();
                onCloseMobile();
              }}
              title={isCollapsed ? 'Shopify Store Channels' : undefined}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2.5'} rounded-xl transition-all cursor-pointer group text-left text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100/80 min-h-[40px]`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-500 group-hover:text-neutral-900">
                  <Store className="w-4 h-4" />
                </div>
                {!isCollapsed && (
                  <span className="text-xs font-semibold text-neutral-800 group-hover:text-neutral-950">Store Channels</span>
                )}
              </div>
              {!isCollapsed && (
                <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 font-medium">
                  Dual
                </span>
              )}
            </button>
          )}
        </div>

        {/* Bottom Sidebar Action Center */}
        <div className="p-3 border-t border-neutral-100 bg-neutral-50/50 space-y-2">
          {/* Quick Utility Row */}
          <div className={`grid ${isCollapsed ? 'grid-cols-1 gap-1.5' : 'grid-cols-2 gap-2'}`}>
            <button
              type="button"
              onClick={() => {
                onOpenRemarks();
                onCloseMobile();
              }}
              title={isCollapsed ? `Remarks (${unreadRemarks} unread)` : undefined}
              className="relative flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-medium bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200/80 shadow-2xs transition cursor-pointer min-h-[38px]"
            >
              <Bell className="w-3.5 h-3.5 text-neutral-500" />
              {!isCollapsed && <span>Remarks</span>}
              {unreadRemarks > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </button>

            {onRefreshAll && (
              <button
                type="button"
                onClick={onRefreshAll}
                disabled={isRefreshing}
                title={isCollapsed ? 'Sync Supabase' : undefined}
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-medium bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200/80 shadow-2xs transition cursor-pointer min-h-[38px]"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-neutral-500 ${isRefreshing ? 'animate-spin' : ''}`} />
                {!isCollapsed && <span>Sync DB</span>}
              </button>
            )}
          </div>

          {/* Quick Department Role Switcher for Mobile & Tablet */}
          {!isCollapsed && onSelectRole && (
            <div className="bg-white p-1.5 rounded-xl border border-neutral-200/80 flex items-center justify-between gap-1 shadow-2xs">
              {(['admin', 'production', 'logistics', 'crm'] as UserRole[]).map((r) => {
                const isSelected = (currentUser?.role || 'admin') === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onSelectRole(r)}
                    className={`flex-1 py-1 px-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition cursor-pointer text-center ${
                      isSelected
                        ? 'bg-neutral-900 text-white shadow-2xs'
                        : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
                    }`}
                  >
                    {r === 'production' ? 'Prod' : r === 'logistics' ? 'Log' : r}
                  </button>
                );
              })}
            </div>
          )}

          {/* User Profile Card */}
          <div className={`p-2 rounded-xl bg-white border border-neutral-200/80 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} shadow-2xs`}>
            <div className="flex items-center gap-2.5 min-w-0">
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'User'}
                  className="w-7 h-7 rounded-lg object-cover border border-neutral-200 shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
              {!isCollapsed && (
                <div className="truncate">
                  <div className="text-xs font-semibold text-neutral-900 truncate leading-tight">
                    {currentUser?.displayName || 'BLKBRD Lead'}
                  </div>
                  <div className="text-[10px] text-amber-700 font-mono font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span className="uppercase">{currentUser?.role || 'Admin'}</span>
                  </div>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <button
                type="button"
                onClick={onLogout}
                title="Sign Out"
                className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
