/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { UserProfile, UserRole, ProductionRemark } from '../types';
import { ShopifyConfig } from '../services/shopifyApi';
import { SectionId, SECTION_THEMES } from '../theme';
import {
  ShieldCheck,
  Hammer,
  Truck,
  Bell,
  User,
  ShoppingBag,
  Menu,
  X,
  LogOut,
  Lock,
  LogIn,
  Database
} from 'lucide-react';

interface NavbarProps {
  currentUser: UserProfile | null;
  onSelectRole: (role: UserRole) => void;
  onOpenLogin: () => void;
  onLogout: () => void;
  onOpenRemarks: () => void;
  onOpenShopifySync: () => void;
  onOpenSchemaCustomizer?: () => void;
  shopifyConfig: ShopifyConfig;
  remarks: ProductionRemark[];
  onRefreshAll?: () => void;
  activeSection?: SectionId;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onSelectRole,
  onOpenLogin,
  onLogout,
  onOpenRemarks,
  onOpenShopifySync,
  onOpenSchemaCustomizer,
  shopifyConfig,
  remarks,
  onRefreshAll,
  activeSection = 'delinquency'
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const unreadRemarks = remarks.filter(r => !r.read).length;
  const currentTheme = SECTION_THEMES[activeSection] || SECTION_THEMES.delinquency;

  const getRoleBadge = (role?: UserRole) => {
    if (!role) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium rounded-full bg-neutral-200/90 text-neutral-700 shadow-2xs">
          <Lock className="w-3 h-3 text-neutral-500 stroke-[2]" />
          <span>Signed Out</span>
        </span>
      );
    }
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium rounded-full bg-neutral-900 text-white shadow-xs">
            <ShieldCheck className="w-3 h-3 text-amber-400 stroke-[2]" />
            <span>Admin (CRM3)</span>
          </span>
        );
      case 'production':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-950 shadow-2xs">
            <Hammer className="w-3 h-3 text-amber-600 stroke-[2]" />
            <span>Production Workshop</span>
          </span>
        );
      case 'logistics':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-950 shadow-2xs">
            <Truck className="w-3 h-3 text-teal-600 stroke-[2]" />
            <span>Logistics Desk</span>
          </span>
        );
    }
  };

  return (
    <header className="sticky top-2 sm:top-3 z-30 px-3 sm:px-6 lg:px-8 xl:px-10 w-full mb-3">
      <div className="glass-panel rounded-3xl px-3.5 sm:px-5 py-2.5 transition-all duration-500 relative overflow-hidden">
        {/* Subtle responsive accent glow at the top edge */}
        <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${currentTheme.navTopGlow} transition-all duration-500`} />

        <div className="flex items-center justify-between gap-2">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-neutral-900 text-white flex items-center justify-center font-serif font-semibold text-sm tracking-widest shadow-xs">
              B
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-semibold text-neutral-900 tracking-tight text-sm sm:text-base">
                  BLKBRD
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-500 font-mono tracking-wider uppercase font-semibold">
                  OPS
                </span>
              </div>
            </div>
            <div className="ml-1 sm:ml-2 pl-2 sm:pl-3 border-l border-neutral-200/80 hidden lg:flex items-center">
              {getRoleBadge(currentUser?.role)}
            </div>
          </div>

          {/* Desktop Controls (hidden on small mobile screens) */}
          <div className="hidden md:flex items-center gap-2">
            {/* Shopify Modal Button (Admin only) */}
            {currentUser?.role === 'admin' && (
              <button
                onClick={onOpenShopifySync}
                className="glass-button inline-flex items-center gap-1.5 text-xs text-neutral-800 hover:text-neutral-950 px-3 py-1.5 rounded-full font-medium transition cursor-pointer"
                title="Shopify Store Configuration & Management"
              >
                <ShoppingBag className="w-3.5 h-3.5 stroke-[1.5] text-neutral-600" />
                <span>Shopify</span>
                <span className={`w-1.5 h-1.5 rounded-full ${shopifyConfig.isConnected ? 'bg-emerald-500' : 'bg-neutral-400'}`}></span>
              </button>
            )}

            {/* Customise Table Elements Button (Admin only) */}
            {currentUser?.role === 'admin' && onOpenSchemaCustomizer && (
              <button
                onClick={onOpenSchemaCustomizer}
                className="glass-button inline-flex items-center gap-1.5 text-xs text-neutral-800 hover:text-neutral-950 px-3 py-1.5 rounded-full font-medium transition cursor-pointer"
                title="Customise Database Tables by Use Case"
              >
                <Database className="w-3.5 h-3.5 stroke-[1.5] text-neutral-600" />
                <span>Table Fields</span>
              </button>
            )}

            {/* Production Remarks Notification for Admin */}
            {currentUser?.role === 'admin' && (
              <button
                onClick={onOpenRemarks}
                className="glass-button relative inline-flex items-center justify-center w-8 h-8 text-neutral-700 hover:text-neutral-900 rounded-full transition cursor-pointer"
                title="Production Remarks"
              >
                <Bell className="w-3.5 h-3.5 stroke-[1.5]" />
                {unreadRemarks > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-neutral-900 text-white font-mono text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                    {unreadRemarks}
                  </span>
                )}
              </button>
            )}

            {/* Auth Button */}
            <button
              onClick={onOpenLogin}
              className="glass-button-dark flex items-center gap-1.5 text-xs text-white px-3.5 py-1.5 rounded-full font-medium transition cursor-pointer hover:bg-black/90 shadow-xs"
            >
              {currentUser ? (
                <>
                  <User className="w-3.5 h-3.5 stroke-[1.5] text-neutral-300" />
                  <span className="truncate max-w-[120px]">
                    {currentUser.email ? currentUser.email.split('@')[0] : currentUser.name}
                  </span>
                </>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5 stroke-[1.5] text-amber-400" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </div>

          {/* Mobile Right Controls: Compact icons + Hamburger */}
          <div className="flex md:hidden items-center gap-1.5">
            {/* Production Remarks Bell */}
            {currentUser?.role === 'admin' && (
              <button
                onClick={onOpenRemarks}
                className="glass-button relative w-9 h-9 rounded-full flex items-center justify-center text-neutral-700"
              >
                <Bell className="w-4 h-4 stroke-[1.5]" />
                {unreadRemarks > 0 && (
                  <span className="absolute 0 top-0.5 right-0.5 bg-neutral-900 text-white font-mono text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                    {unreadRemarks}
                  </span>
                )}
              </button>
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="glass-button-dark w-9 h-9 rounded-full flex items-center justify-center text-white cursor-pointer"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4 stroke-[1.5]" /> : <Menu className="w-4 h-4 stroke-[1.5]" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown / Drawer */}
        {isMobileMenuOpen && (
          <div className="mt-3 pt-3 border-t border-neutral-200/60 space-y-3 block md:hidden animate-in fade-in">
            {/* Active Role display */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-neutral-500">Current Role</span>
              {getRoleBadge(currentUser?.role)}
            </div>

            {/* Integration Action Buttons */}
            <div className="space-y-1.5 pt-1">
              {currentUser?.role === 'admin' && onOpenSchemaCustomizer && (
                <button
                  onClick={() => {
                    onOpenSchemaCustomizer();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full glass-card p-3 rounded-2xl flex items-center justify-between text-xs font-medium text-neutral-800 min-h-[44px]"
                >
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-neutral-700 stroke-[1.5]" />
                    <span>Customise Table Elements</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
                    Supabase Schema
                  </span>
                </button>
              )}

              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => {
                    onOpenShopifySync();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full glass-card p-3 rounded-2xl flex items-center justify-between text-xs font-medium text-neutral-800 min-h-[44px]"
                >
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-neutral-700 stroke-[1.5]" />
                    <span>Shopify Configuration &amp; Management</span>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${shopifyConfig.isConnected ? 'bg-emerald-500/10 text-emerald-900' : 'bg-neutral-200 text-neutral-600'}`}>
                    {shopifyConfig.isConnected ? 'Connected' : 'Config'}
                  </span>
                </button>
              )}

              <button
                onClick={() => {
                  onOpenLogin();
                  setIsMobileMenuOpen(false);
                }}
                className="w-full glass-button-dark p-3 rounded-2xl flex items-center justify-center gap-2 text-xs font-medium text-white min-h-[44px] shadow-xs"
              >
                {currentUser ? (
                  <>
                    <User className="w-4 h-4 stroke-[1.5]" />
                    <span>{currentUser.email ? `Account: ${currentUser.email}` : currentUser.name}</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 stroke-[1.5] text-amber-400" />
                    <span>Sign In to Portal</span>
                  </>
                )}
              </button>

              {currentUser && onLogout && (
                <button
                  onClick={() => {
                    onLogout();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full glass-card p-2.5 rounded-2xl flex items-center justify-center gap-2 text-xs font-medium text-red-600 hover:bg-red-50 min-h-[40px] transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4 stroke-[1.5]" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};