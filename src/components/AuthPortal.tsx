/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { UserProfile, UserRole } from '../types';
import { authenticateStaffUser } from '../services/staffUserService';
import {
  ShieldCheck,
  Hammer,
  Truck,
  Lock,
  Users,
  Mail,
  Key,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  Check
} from 'lucide-react';

interface AuthPortalProps {
  onLoginSuccess: (user: UserProfile) => void;
  syncFeedback?: string | null;
}

const PRESET_ACCOUNTS = [
  {
    role: 'admin' as UserRole,
    label: 'Administrator (CRM3)',
    email: 'crm3.blkbrdshoemaker@gmail.com',
    icon: ShieldCheck,
    badge: 'Full Operations Control'
  },
  {
    role: 'crm' as UserRole,
    label: 'CRM Customer Desk',
    email: 'crm@blkbrdshoemaker.com',
    icon: Users,
    badge: 'Customer 360° & Inquiries'
  },
  {
    role: 'production' as UserRole,
    label: 'Production Workshop',
    email: 'workshop@blkbrdshoemaker.com',
    icon: Hammer,
    badge: 'Delinquency & Stages'
  },
  {
    role: 'logistics' as UserRole,
    label: 'Logistics Desk',
    email: 'logistics@blkbrdshoemaker.com',
    icon: Truck,
    badge: 'Fulfillment & RTD'
  }
];

export const AuthPortal: React.FC<AuthPortalProps> = ({ onLoginSuccess, syncFeedback }) => {
  const [email, setEmail] = useState('crm3.blkbrdshoemaker@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectPreset = (presetEmail: string) => {
    setEmail(presetEmail);
    setPassword('');
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email address and access password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await authenticateStaffUser(email, password);
    setIsSubmitting(false);

    if (res.success && res.user) {
      onLoginSuccess(res.user);
    } else {
      setErrorMessage(res.error || 'Authentication failed. Please check your password.');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4 selection:bg-amber-500 selection:text-black">
      <div className="w-full max-w-md bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center">
        
        {/* Brand Monogram */}
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-amber-600 to-amber-900 border border-amber-500/30 flex items-center justify-center mb-4 text-white font-serif font-bold text-xl shadow-lg shadow-amber-950/40">
          B
        </div>

        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white mb-1">
          BLKBRD Operations Hub
        </h1>
        <p className="text-xs text-neutral-400 mb-5">
          Enter your authorized staff credentials to unlock portal access.
        </p>

        {syncFeedback && (
          <div className="w-full mb-4 p-3 bg-neutral-800 border border-neutral-700 rounded-xl text-neutral-300 text-xs text-left flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncFeedback}</span>
          </div>
        )}

        {errorMessage && (
          <div className="w-full mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs text-left flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Quick Account Preset Selector */}
        <div className="w-full mb-5 text-left">
          <label className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400 mb-2 block font-mono">
            Select Staff Account
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_ACCOUNTS.map(preset => {
              const Icon = preset.icon;
              const isSelected = email.toLowerCase() === preset.email.toLowerCase();
              return (
                <button
                  key={preset.role}
                  type="button"
                  onClick={() => handleSelectPreset(preset.email)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-xs'
                      : 'bg-neutral-800/60 hover:bg-neutral-800 border-neutral-700/60 text-neutral-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-400' : 'text-neutral-400'}`} />
                    <span className="text-xs font-semibold capitalize">{preset.role}</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 truncate">{preset.email.split('@')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Password Login Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-3.5 text-left">
          <div>
            <label className="block text-[11px] font-semibold text-neutral-300 mb-1 font-mono">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@blkbrdshoemaker.com"
                className="w-full pl-10 pr-3 py-2.5 bg-neutral-800/80 border border-neutral-700 rounded-xl text-xs text-white placeholder:text-neutral-500 focus:outline-hidden focus:border-amber-500 transition"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-neutral-300 font-mono">
                Access Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[10px] text-neutral-400 hover:text-neutral-200 flex items-center gap-1 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showPassword ? 'Hide' : 'Show'}</span>
              </button>
            </div>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter access password"
                className="w-full pl-10 pr-3 py-2.5 bg-neutral-800/80 border border-neutral-700 rounded-xl text-xs text-white placeholder:text-neutral-500 focus:outline-hidden focus:border-amber-500 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-semibold text-xs tracking-wide shadow-lg shadow-amber-950/50 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
          >
            <span>{isSubmitting ? 'Authenticating...' : 'Sign In to Operations Hub'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-neutral-800/80 w-full flex items-center justify-between text-[10px] text-neutral-500">
          <div className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-amber-500/70" />
            <span>Encrypted Session</span>
          </div>
          <span className="font-mono">BLKBRD Shoemaker v3.0</span>
        </div>
      </div>
    </div>
  );
};
