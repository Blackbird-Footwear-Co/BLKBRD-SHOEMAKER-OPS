/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../types';
import { defaultUsers } from '../services/store';
import {
  X,
  Lock,
  Mail,
  Key,
  ShieldCheck,
  Wrench,
  Truck,
  Users,
  ArrowRight
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onLoginSuccess: (user: UserProfile) => void;
  onLogout?: () => void;
}

type AuthMode = 'roles' | 'login' | 'signup' | 'forgot';

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  onLogout
}) => {
  const [mode, setMode] = useState<AuthMode>('roles');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleSelection, setRoleSelection] = useState<UserRole>('admin');
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (isOpen) {
      setMode('roles');
      setMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleQuickLogin = (role: UserRole) => {
    const user = defaultUsers[role];
    if (user) {
      onLoginSuccess(user);
      onClose();
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    setTimeout(() => {
      setIsSubmitting(false);
      if (mode === 'signup') {
        const newUser: UserProfile = {
          name: email.split('@')[0] || 'Team User',
          email,
          role: roleSelection
        };
        onLoginSuccess(newUser);
        onClose();
      } else if (mode === 'login') {
        const matchedUser = Object.values(defaultUsers).find(u => u.email.toLowerCase() === email.toLowerCase()) || {
          name: email.split('@')[0] || 'Operator',
          email,
          role: roleSelection
        };
        onLoginSuccess(matchedUser);
        onClose();
      } else if (mode === 'forgot') {
        setMessage(`Password reset instructions have been sent to ${email}`);
      }
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Lock className="w-4 h-4 stroke-[1.5]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight">
                BLKBRD Operations Hub
              </h3>
              <p className="text-[11px] text-neutral-400">
                {currentUser ? `Signed in as ${currentUser.name}` : 'Secure access control portal'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[1.5]" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {message && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs text-left">
              {message}
            </div>
          )}

          {currentUser && (
            <div className="p-3.5 bg-neutral-800/80 border border-neutral-700 rounded-2xl flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-white">Active Session</div>
                <div className="text-[11px] text-neutral-400 truncate">{currentUser.email} ({currentUser.role.toUpperCase()})</div>
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    setMessage('Signed out successfully.');
                  }}
                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-medium transition cursor-pointer"
                >
                  Sign Out
                </button>
              )}
            </div>
          )}

          {/* NON-ADMIN RESTRICTION: Non-admin users ONLY see Active Session & Sign Out above */}
          {(!currentUser || isAdmin) && (
            <>
              {/* MODE 1: Role Quick Select Cards */}
              {mode === 'roles' && (
                <div className="space-y-2.5 animate-in fade-in">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    Quick Role Selection:
                  </div>
                  
                  <button
                    onClick={() => handleQuickLogin('admin')}
                    className="w-full flex items-center justify-between p-3 rounded-2xl bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700/60 hover:border-amber-500/50 transition cursor-pointer group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                        <ShieldCheck className="w-4 h-4 stroke-[1.5]" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-white">Admin</div>
                        <div className="text-[10px] text-neutral-400">Full access across all stores</div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-amber-400">&rarr;</span>
                  </button>

                  <button
                    onClick={() => handleQuickLogin('production')}
                    className="w-full flex items-center justify-between p-3 rounded-2xl bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700/60 hover:border-amber-500/50 transition cursor-pointer group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                        <Wrench className="w-4 h-4 stroke-[1.5]" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-white">Production</div>
                        <div className="text-[10px] text-neutral-400">Workshop floor remarks & delays</div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-amber-400">&rarr;</span>
                  </button>

                  <button
                    onClick={() => handleQuickLogin('crm')}
                    className="w-full flex items-center justify-between p-3 rounded-2xl bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700/60 hover:border-teal-500/50 transition cursor-pointer group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400">
                        <Users className="w-4 h-4 stroke-[1.5]" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-white">CRM & Client Experience</div>
                        <div className="text-[10px] text-neutral-400">Customer directory, order history & queries</div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-teal-400">&rarr;</span>
                  </button>

                  <button
                    onClick={() => handleQuickLogin('logistics')}
                    className="w-full flex items-center justify-between p-3 rounded-2xl bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700/60 hover:border-amber-500/50 transition cursor-pointer group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                        <Truck className="w-4 h-4 stroke-[1.5]" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-white">Logistics</div>
                        <div className="text-[10px] text-neutral-400">RTD queue, dispatches & returns</div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-amber-400">&rarr;</span>
                  </button>

                  <div className="pt-3 border-t border-neutral-800 flex items-center justify-between text-xs">
                    <button
                      onClick={() => setMode('login')}
                      className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
                    >
                      Sign in with Email &rarr;
                    </button>
                    <button
                      onClick={() => setMode('signup')}
                      className="text-neutral-400 hover:text-white font-medium cursor-pointer"
                    >
                      Create Account
                    </button>
                  </div>
                </div>
              )}

              {/* MODES 2, 3, 4: Login, Sign Up & Forgot Password Forms */}
              {mode !== 'roles' && (
                <form onSubmit={handleFormSubmit} className="space-y-3.5 text-left animate-in fade-in">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-300 mb-1">Operator Email</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="name@blkbrdshoemaker.com"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-neutral-600 focus:outline-hidden focus:border-amber-500"
                      />
                    </div>
                  </div>

                  {mode !== 'forgot' && (
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-300 mb-1">Password</label>
                      <div className="relative">
                        <Key className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                        <input
                          type="password"
                          required
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-neutral-600 focus:outline-hidden focus:border-amber-500"
                        />
                      </div>
                    </div>
                  )}

                  {mode === 'signup' && (
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-300 mb-1">Assign Operational Role</label>
                      <select
                        value={roleSelection}
                        onChange={e => setRoleSelection(e.target.value as UserRole)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-amber-500"
                      >
                        <option value="admin">Admin (Full Operational Rights)</option>
                        <option value="production">Production Workshop</option>
                        <option value="crm">CRM & Client Experience</option>
                        <option value="logistics">Logistics & Dispatches</option>
                      </select>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full mt-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold py-2.5 px-4 rounded-xl transition cursor-pointer text-xs flex items-center justify-center gap-2 shadow-lg"
                  >
                    <span>
                      {mode === 'login' && 'Sign In to Hub'}
                      {mode === 'signup' && 'Register Account'}
                      {mode === 'forgot' && 'Send Reset Instructions'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <div className="pt-3 border-t border-neutral-800 flex items-center justify-between text-[11px]">
                    {mode === 'login' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setMode('forgot')}
                          className="text-neutral-400 hover:text-white cursor-pointer"
                        >
                          Forgot password?
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode('signup')}
                          className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
                        >
                          Create account
                        </button>
                      </>
                    )}

                    {mode === 'signup' && (
                      <button
                        type="button"
                        onClick={() => setMode('login')}
                        className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer w-full text-center"
                      >
                        Already have an account? Sign In
                      </button>
                    )}

                    {mode === 'forgot' && (
                      <button
                        type="button"
                        onClick={() => setMode('login')}
                        className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer w-full text-center"
                      >
                        Back to Sign In
                      </button>
                    )}
                  </div>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => setMode('roles')}
                      className="text-[10px] text-neutral-500 hover:text-neutral-300 underline cursor-pointer"
                    >
                      &larr; Return to Role Selection Cards
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-neutral-800 bg-neutral-900/80 flex items-center justify-between text-[11px] text-neutral-400">
          <span>Role: <strong className="text-white uppercase font-medium">{currentUser ? currentUser.role : 'Guest'}</strong></span>
          <button
            onClick={onClose}
            className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
          >
            Close Modal
          </button>
        </div>
      </div>
    </div>
  );
};