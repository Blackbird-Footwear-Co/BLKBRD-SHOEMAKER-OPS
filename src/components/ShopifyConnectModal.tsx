import React, { useState, useEffect } from 'react';
import {
  ShopifyConfig,
  ShopifyStoreConfig,
  ShopifyDualConfig,
  ShopifyStoreAccount,
  getStoredShopifyDualConfig,
  saveStoredShopifyDualConfig,
  loginWithShopifyToken,
  disconnectShopifyAccount,
  getShopifyOAuthUrl,
  verifyShopifyCredentials,
  getServerShopifyStatus,
  fetchShopifyOrdersFromBothStores
} from '../services/shopifyApi';
import { ShopifyOrder } from '../types';
import {
  X,
  ShoppingBag,
  CheckCircle2,
  RefreshCw,
  Store,
  Key,
  ShieldCheck,
  AlertCircle,
  Lock,
  Globe,
  Check,
  Building2,
  Layers,
  ArrowRight,
  ExternalLink
} from 'lucide-react';

interface ShopifyConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ShopifyConfig;
  dualConfig?: ShopifyDualConfig;
  onConfigChange: (config: ShopifyConfig) => void;
  onDualConfigChange?: (dual: ShopifyDualConfig) => void;
  onOrdersFetched: (orders: ShopifyOrder[]) => void;
  ordersCount: number;
}

export const ShopifyConnectModal: React.FC<ShopifyConnectModalProps> = ({
  isOpen,
  onClose,
  config,
  dualConfig: propDualConfig,
  onConfigChange,
  onDualConfigChange,
  onOrdersFetched,
  ordersCount
}) => {
  // Store account tab: 'Global' vs 'LLC'
  const [selectedAccount, setSelectedAccount] = useState<ShopifyStoreAccount>('Global');
  const [activeTab, setActiveTab] = useState<'token' | 'oauth'>('token');

  // Dual config state
  const [dualConfig, setDualConfig] = useState<ShopifyDualConfig>(() => {
    return propDualConfig || getStoredShopifyDualConfig();
  });

  // Account specific form inputs
  const currentAccountConfig: ShopifyStoreConfig = selectedAccount === 'LLC' ? dualConfig.llc : dualConfig.global;
  const [shopDomain, setShopDomain] = useState(currentAccountConfig.shopDomain);
  const [accessToken, setAccessToken] = useState(currentAccountConfig.accessToken);
  const [storeName, setStoreName] = useState(currentAccountConfig.storeName);
  const [oauthClientId, setOauthClientId] = useState('1d6db35a54fea551861eb4c44fd16ae5');

  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSyncingBoth, setIsSyncingBoth] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showTokenGuide, setShowTokenGuide] = useState(false);
  const [directOAuthUrl, setDirectOAuthUrl] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<{
    configured: boolean;
    hasClientId: boolean;
    hasAccessToken: boolean;
    callbackUrl: string;
    global?: { shopDomain: string; hasAccessToken: boolean };
    llc?: { shopDomain: string; hasAccessToken: boolean };
  } | null>(null);

  // Sync inputs when switching store account tab
  useEffect(() => {
    const target = selectedAccount === 'LLC' ? dualConfig.llc : dualConfig.global;
    setShopDomain(target.shopDomain);
    const tokenVal = (target.accessToken || '').startsWith('shpss_') ? '' : (target.accessToken || '');
    setAccessToken(tokenVal);
    setStoreName(target.storeName);
    setErrorMessage(null);
    setStatusMessage(null);
  }, [selectedAccount, dualConfig]);

  // Check server configuration
  useEffect(() => {
    if (isOpen) {
      getServerShopifyStatus().then(status => {
        setServerStatus(status);
      });
      const freshDual = getStoredShopifyDualConfig();
      setDualConfig(freshDual);
    }
  }, [isOpen]);

  // Listen for OAuth popup completion
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === 'SHOPIFY_AUTH_SUCCESS') {
        const { shop, accessToken: token, error } = event.data;
        if (error) {
          setErrorMessage(error);
          setIsLoading(false);
          return;
        }

        if (token) {
          setIsLoading(true);
          const result = await loginWithShopifyToken(shop, token, undefined, selectedAccount);
          if (result.success) {
            setDualConfig(result.dualConfig);
            if (onDualConfigChange) onDualConfigChange(result.dualConfig);
            onOrdersFetched(result.orders);
            setStatusMessage(`Successfully authenticated ${selectedAccount} store (${shop})! Synced ${result.orders.length} total orders across stores.`);
            setTimeout(() => onClose(), 1500);
          } else {
            setErrorMessage(result.error || 'Failed to complete authentication');
          }
          setIsLoading(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [selectedAccount, onDualConfigChange, onOrdersFetched, onClose]);

  if (!isOpen) return null;

  // Real Shopify Admin API Token Connect for selected account
  const handleTokenConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopDomain.trim()) {
      setErrorMessage(`Please enter the ${selectedAccount} store domain (.myshopify.com)`);
      return;
    }

    if (!accessToken.trim()) {
      setErrorMessage('Please provide the Shopify Admin API access token (starts with shpat_...)');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const result = await loginWithShopifyToken(shopDomain, accessToken, storeName, selectedAccount);
      if (result.success) {
        setDualConfig(result.dualConfig);
        if (onDualConfigChange) onDualConfigChange(result.dualConfig);
        onOrdersFetched(result.orders);
        setStatusMessage(`Connected to live ${selectedAccount} Shopify store! Synced ${result.orders.length} orders across both stores.`);
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setErrorMessage(result.error || `Shopify store (${selectedAccount}) rejected credentials. Please check store domain and token.`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to authenticate ${selectedAccount} store`);
    } finally {
      setIsLoading(false);
    }
  };

  // Test Real Credentials for selected account without saving
  const handleTestVerify = async () => {
    if (!shopDomain.trim() || !accessToken.trim()) {
      setErrorMessage('Enter both store domain and access token to test');
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await verifyShopifyCredentials(shopDomain, accessToken, selectedAccount);
      if (res.success && res.shop) {
        setStatusMessage(`Live handshake verified with ${res.shop.name || selectedAccount} (${res.shop.email || 'Admin'})! Currency: ${res.shop.currency}`);
      } else {
        setErrorMessage(res.error || `Verification failed for ${selectedAccount}. Shopify API rejected the credentials.`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification network error');
    } finally {
      setIsVerifying(false);
    }
  };

  // Real Shopify OAuth Login via Popup for selected account
  const handleOAuthConnect = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const { url } = await getShopifyOAuthUrl(shopDomain, oauthClientId || undefined);
      setDirectOAuthUrl(url);
      const popup = window.open(url, 'shopify_oauth', 'width=650,height=750,left=150,top=100');
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        setStatusMessage(`Popup was blocked by your browser. Please click "Open Shopify Authorization in New Tab" below.`);
        setIsLoading(false);
        return;
      }
      setStatusMessage(`Shopify login window opened for ${selectedAccount} store. Please approve access in the popup.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not initiate Shopify OAuth login.');
      setIsLoading(false);
    }
  };

  // Disconnect selected account
  const handleDisconnectSelected = () => {
    const updated = disconnectShopifyAccount(selectedAccount);
    setDualConfig(updated);
    if (onDualConfigChange) onDualConfigChange(updated);
    setStatusMessage(`${selectedAccount} account disconnected.`);
  };

  // Quick action: Synchronize both accounts
  const handleSyncBothStores = async () => {
    setIsSyncingBoth(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetchShopifyOrdersFromBothStores(dualConfig);
      onOrdersFetched(res.orders);
      setDualConfig(getStoredShopifyDualConfig());
      setStatusMessage(`Dual Sync complete! Synchronized ${res.globalOrders.length} Global orders and ${res.llcOrders.length} LLC orders (${res.orders.length} total).`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to sync both Shopify stores');
    } finally {
      setIsSyncingBoth(false);
    }
  };

  const isCurrentConnected = currentAccountConfig.isConnected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="glass-panel rounded-3xl border border-white/80 shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-200/60 flex items-center justify-between bg-white/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 stroke-[1.5]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5">
                <span>Shopify Multi-Store Integration</span>
                <span className="text-[10px] font-semibold bg-neutral-900 text-white px-2 py-0.5 rounded-full">
                  Global &amp; LLC
                </span>
              </h3>
              <p className="text-xs text-neutral-500">
                Synchronize orders and fulfillments across both your Global and LLC Shopify merchant accounts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="glass-button w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-900 cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[1.5]" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Dual Store Selector Switcher */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              Select Shopify Account To Configure:
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* Global Tab */}
              <button
                type="button"
                onClick={() => setSelectedAccount('Global')}
                className={`p-3 rounded-2xl border text-left cursor-pointer transition relative ${
                  selectedAccount === 'Global'
                    ? 'border-blue-500/80 bg-blue-500/5 shadow-xs ring-2 ring-blue-500/20'
                    : 'border-neutral-200/70 bg-white/40 hover:bg-white/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="text-xs font-semibold text-neutral-900">Global Account</span>
                  </div>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      dualConfig.global.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-300'
                    }`}
                  ></span>
                </div>
                <div className="text-[11px] text-neutral-500 font-mono truncate mt-1">
                  {dualConfig.global.shopDomain || 'blackbirdshoes.myshopify.com'}
                </div>
                <div className="mt-1.5 flex items-center gap-1 text-[10px]">
                  <span
                    className={`px-1.5 py-0.5 rounded-full font-medium ${
                      dualConfig.global.isConnected
                        ? 'bg-emerald-500/10 text-emerald-900'
                        : 'bg-neutral-200/70 text-neutral-600'
                    }`}
                  >
                    {dualConfig.global.isConnected ? 'Connected' : 'Offline'}
                  </span>
                  <span className="text-neutral-400">Domestic &amp; Intl</span>
                </div>
              </button>

              {/* LLC Tab */}
              <button
                type="button"
                onClick={() => setSelectedAccount('LLC')}
                className={`p-3 rounded-2xl border text-left cursor-pointer transition relative ${
                  selectedAccount === 'LLC'
                    ? 'border-purple-500/80 bg-purple-500/5 shadow-xs ring-2 ring-purple-500/20'
                    : 'border-neutral-200/70 bg-white/40 hover:bg-white/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-purple-600 shrink-0" />
                    <span className="text-xs font-semibold text-neutral-900">LLC Account</span>
                  </div>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      dualConfig.llc.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-300'
                    }`}
                  ></span>
                </div>
                <div className="text-[11px] text-neutral-500 font-mono truncate mt-1">
                  {dualConfig.llc.shopDomain || 'blkbrdusa.myshopify.com'}
                </div>
                <div className="mt-1.5 flex items-center gap-1 text-[10px]">
                  <span
                    className={`px-1.5 py-0.5 rounded-full font-medium ${
                      dualConfig.llc.isConnected
                        ? 'bg-emerald-500/10 text-emerald-900'
                        : 'bg-neutral-200/70 text-neutral-600'
                    }`}
                  >
                    {dualConfig.llc.isConnected ? 'Connected' : 'Offline'}
                  </span>
                  <span className="text-neutral-400">United States (USD)</span>
                </div>
              </button>
            </div>
          </div>

          {/* Active Store Connection Header */}
          <div className="p-3.5 glass-card rounded-2xl border border-white/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isCurrentConnected
                    ? currentAccountConfig.isLiveVerified
                      ? 'bg-emerald-500 animate-pulse'
                      : 'bg-amber-500'
                    : 'bg-neutral-300'
                }`}
              ></span>
              <div>
                <div className="text-xs font-semibold text-neutral-900 flex items-center gap-1.5">
                  <span>{currentAccountConfig.storeName || `${selectedAccount} Store`}</span>
                  <span className="text-[10px] text-neutral-500 font-normal">
                    ({selectedAccount === 'LLC' ? 'US Store / USD' : 'Global / INR'})
                  </span>
                </div>
                <div className="text-[11px] text-neutral-500 font-mono">
                  {currentAccountConfig.shopDomain}
                </div>
              </div>
            </div>

            {isCurrentConnected && (
              <button
                type="button"
                onClick={handleDisconnectSelected}
                className="text-[11px] text-neutral-500 hover:text-neutral-900 glass-pill px-2.5 py-1 rounded-full cursor-pointer hover:bg-white/80"
              >
                Disconnect {selectedAccount}
              </button>
            )}
          </div>

          {statusMessage && (
            <div className="p-3 glass-card rounded-2xl border border-emerald-300 text-emerald-950 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 glass-card rounded-2xl border border-amber-300 text-amber-950 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold">Authentication Notice:</div>
                <div className="text-[11px] mt-0.5">{errorMessage}</div>
              </div>
            </div>
          )}

          {/* Authentication Method Tabs */}
          <div className="glass-pill p-1 rounded-full flex items-center gap-1">
            <button
              onClick={() => setActiveTab('token')}
              className={`flex-1 py-1.5 px-3 text-center text-xs font-medium rounded-full cursor-pointer transition ${
                activeTab === 'token'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Admin API Token ({selectedAccount})
            </button>
            <button
              onClick={() => setActiveTab('oauth')}
              className={`flex-1 py-1.5 px-3 text-center text-xs font-medium rounded-full cursor-pointer transition ${
                activeTab === 'oauth'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Shopify OAuth Login ({selectedAccount})
            </button>
          </div>

          {/* TAB 1: Live Admin API Access Token */}
          {activeTab === 'token' && (
            <form onSubmit={handleTokenConnect} className="space-y-3.5 animate-in fade-in">
              <div className="p-3 glass-card rounded-2xl text-xs text-neutral-600 leading-relaxed space-y-1">
                <div className="font-semibold text-neutral-900 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-neutral-700" />
                  <span>Configure {selectedAccount} Account Credentials:</span>
                </div>
                <div>
                  Enter the store domain and Admin API Access Token for your <strong>{selectedAccount}</strong> Shopify account.
                  Orders will be automatically stamped as <span className="font-semibold text-neutral-800">{selectedAccount}</span> and synched into the unified dashboard.
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  {selectedAccount} Shopify Store Domain (.myshopify.com)
                </label>
                <div className="relative">
                  <Store className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-3 stroke-[1.5]" />
                  <input
                    type="text"
                    required
                    value={shopDomain}
                    onChange={e => setShopDomain(e.target.value)}
                    placeholder={selectedAccount === 'LLC' ? 'blkbrdusa.myshopify.com' : 'blackbirdshoes.myshopify.com'}
                    className="w-full glass-input rounded-xl pl-9 pr-3 py-2 text-xs font-mono focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  {selectedAccount} Admin API Access Token (Starts with <span className="font-mono text-neutral-900 font-bold">shpat_</span>)
                </label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-3 stroke-[1.5]" />
                  <input
                    type="password"
                    required
                    value={accessToken}
                    onChange={e => setAccessToken(e.target.value)}
                    placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full glass-input rounded-xl pl-9 pr-3 py-2 text-xs font-mono focus:outline-hidden"
                  />
                </div>
                {accessToken.startsWith('shpss_') && (
                  <div className="mt-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Why this token is rejected:</strong> <code className="font-mono font-bold">shpss_...</code> is an <strong>API Secret Key</strong> (Client Secret), not an <strong>Admin API Access Token</strong>.
                      </div>
                    </div>
                    <div className="pl-6 text-[11px] space-y-1.5">
                      <div>
                        Shopify's direct REST API requires an access token starting with <code className="font-mono font-bold text-neutral-900 bg-white/80 px-1 py-0.5 rounded border border-amber-200">shpat_...</code>.
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setActiveTab('oauth')}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium text-[11px] transition cursor-pointer"
                        >
                          Switch to 1-Click OAuth Tab
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowTokenGuide(prev => !prev)}
                          className="px-2.5 py-1 bg-white hover:bg-neutral-100 text-amber-900 border border-amber-300 rounded-lg font-medium text-[11px] transition cursor-pointer"
                        >
                          {showTokenGuide ? 'Hide Token Guide' : 'How to get shpat_ token'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowTokenGuide(prev => !prev)}
                    className="text-[11px] text-blue-700 hover:text-blue-800 font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <span>{showTokenGuide ? '▼ Hide instructions' : '▶ Step-by-Step: How to find or regenerate your shpat_ token in Shopify'}</span>
                  </button>

                  {showTokenGuide && (
                    <div className="mt-2 p-3 rounded-2xl bg-blue-50/70 border border-blue-200/80 text-[11px] text-blue-950 space-y-2 leading-relaxed animate-in fade-in">
                      <div className="font-semibold text-neutral-900">Follow these 5 steps in your Shopify Admin:</div>
                      <ol className="list-decimal list-inside space-y-1 text-neutral-700">
                        <li>Open <a href={`https://${shopDomain || 'blackbirdshoes.myshopify.com'}/admin/settings/apps/development`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">Shopify Admin &gt; Settings &gt; Apps &gt; Develop apps</a></li>
                        <li>Click on your custom app (e.g. <em>BLKBRD Sync</em>)</li>
                        <li>Under <strong>Configuration</strong> &gt; <strong>Admin API integration</strong>, make sure <code className="font-mono bg-white px-1 py-0.5 rounded border border-neutral-200">read_orders</code> is checked & saved</li>
                        <li>Go to the <strong>API credentials</strong> tab</li>
                        <li>Under <strong>Admin API access token</strong>, click <strong>Install app</strong> (or <strong>Reveal token once</strong>) and copy the token starting with <code className="font-mono font-bold text-neutral-900 bg-white px-1 py-0.5 rounded border border-neutral-200">shpat_...</code></li>
                      </ol>
                      <div className="p-2 bg-white/80 rounded-xl border border-blue-200 text-neutral-600 text-[10.5px]">
                        <strong>Already installed & token is hidden?</strong> Just click <strong>Uninstall app</strong>, then immediately click <strong>Install app</strong> again right on that same screen. Shopify will generate and reveal a brand new <code className="font-mono font-bold text-neutral-800">shpat_...</code> token for you to copy!
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Store Display Name
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={e => setStoreName(e.target.value)}
                  placeholder={selectedAccount === 'LLC' ? 'BLKBRD LLC Store' : 'BLKBRD SHOEMAKER | HANDCRAFTED IN INDIA'}
                  className="w-full glass-input rounded-xl px-3 py-2 text-xs focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleTestVerify}
                  disabled={isVerifying || isLoading}
                  className="flex-1 glass-button text-xs text-neutral-800 font-medium py-2.5 px-3 rounded-full min-h-[42px] flex items-center justify-center gap-1.5 cursor-pointer hover:bg-white/90"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
                  <span>{isVerifying ? 'Testing...' : `Test ${selectedAccount} Handshake`}</span>
                </button>

                <button
                  type="submit"
                  disabled={isLoading || isVerifying}
                  className="flex-1 bg-neutral-900 hover:bg-neutral-800 text-white font-medium py-2.5 px-4 rounded-full shadow-xs transition cursor-pointer text-xs min-h-[42px] flex items-center justify-center gap-2"
                >
                  <ShieldCheck className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'Connecting...' : `Save & Connect ${selectedAccount}`}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Real Shopify OAuth Login */}
          {activeTab === 'oauth' && (
            <div className="space-y-3.5 animate-in fade-in">
              <div className="p-3 glass-card rounded-2xl text-xs text-neutral-600 leading-relaxed space-y-1">
                <div className="font-semibold text-neutral-900 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-neutral-700" />
                  <span>{selectedAccount} Shopify OAuth Merchant Login:</span>
                </div>
                <div>
                  Log into your {selectedAccount} Shopify store via Shopify's official merchant authorization screen.
                </div>
              </div>

              {/* Matching host notice for OAuth */}
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Seeing "redirect_uri and application url must have matching hosts"?</span>
                    <span className="text-[11px] text-amber-900 mt-0.5 block leading-normal">
                      Shopify requires the <strong>App URL</strong> and <strong>Allowed redirection URL</strong> in your Shopify Partner/App settings to match this app's exact domain.
                    </span>
                  </div>
                </div>

                <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/80 space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 font-sans text-[10px] font-semibold uppercase">1. App URL in Shopify:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const url = serverStatus?.appUrl || window.location.origin;
                        navigator.clipboard.writeText(url);
                        setStatusMessage('Copied App URL to clipboard');
                        setTimeout(() => setStatusMessage(null), 2000);
                      }}
                      className="text-neutral-600 hover:text-neutral-900 font-sans text-[10px] bg-neutral-200/70 hover:bg-neutral-300/70 px-2 py-0.5 rounded cursor-pointer"
                    >
                      Copy URL
                    </button>
                  </div>
                  <div className="text-neutral-900 truncate">{serverStatus?.appUrl || window.location.origin}</div>

                  <div className="flex items-center justify-between pt-1 border-t border-amber-100">
                    <span className="text-neutral-500 font-sans text-[10px] font-semibold uppercase">2. Allowed Redirection URL:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const cb = serverStatus?.callbackUrl || `${window.location.origin}/api/shopify/callback`;
                        navigator.clipboard.writeText(cb);
                        setStatusMessage('Copied Callback URL to clipboard');
                        setTimeout(() => setStatusMessage(null), 2000);
                      }}
                      className="text-neutral-600 hover:text-neutral-900 font-sans text-[10px] bg-neutral-200/70 hover:bg-neutral-300/70 px-2 py-0.5 rounded cursor-pointer"
                    >
                      Copy Callback
                    </button>
                  </div>
                  <div className="text-neutral-900 truncate">{serverStatus?.callbackUrl || `${window.location.origin}/api/shopify/callback`}</div>
                </div>

                <div className="text-[11px] text-amber-900 font-medium">
                  👉 <strong>Recommended alternative:</strong> Switch to the <strong>Admin API Token</strong> tab above! Custom Apps created in Shopify Admin under <em>Develop apps</em> don't require any OAuth URLs and connect instantly using your <code className="font-mono font-bold bg-amber-100 px-1 py-0.5 rounded">shpat_...</code> token.
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Shopify Store Domain
                </label>
                <div className="relative">
                  <Store className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-3 stroke-[1.5]" />
                  <input
                    type="text"
                    value={shopDomain}
                    onChange={e => setShopDomain(e.target.value)}
                    placeholder={selectedAccount === 'LLC' ? 'blkbrdusa.myshopify.com' : 'blackbirdshoes.myshopify.com'}
                    className="w-full glass-input rounded-xl pl-9 pr-3 py-2 text-xs font-mono focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Shopify App Client ID (Optional)
                </label>
                <input
                  type="text"
                  value={oauthClientId}
                  onChange={e => setOauthClientId(e.target.value)}
                  placeholder="Enter your Shopify App Client ID (e.g. from App settings)"
                  className="w-full glass-input rounded-xl px-3 py-2 text-xs font-mono focus:outline-hidden"
                />
              </div>

              <button
                type="button"
                onClick={handleOAuthConnect}
                disabled={isLoading}
                className="w-full min-h-[44px] bg-neutral-900 hover:bg-neutral-800 text-white font-medium py-2.5 px-4 rounded-full shadow-xs transition cursor-pointer text-xs flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4 stroke-[1.5]" />
                <span>{isLoading ? 'Opening Shopify Login...' : `Log into ${selectedAccount} Store (OAuth)`}</span>
              </button>

              {directOAuthUrl && (
                <a
                  href={directOAuthUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[42px] bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-full shadow-xs transition cursor-pointer text-xs flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Shopify Authorization in New Tab</span>
                </a>
              )}
            </div>
          )}

          {/* Quick Dual Sync All Button */}
          <div className="pt-2 border-t border-neutral-200/60">
            <button
              type="button"
              onClick={handleSyncBothStores}
              disabled={isSyncingBoth}
              className="w-full bg-blue-50 hover:bg-blue-100/80 text-blue-900 border border-blue-200 font-medium py-2.5 px-4 rounded-2xl transition cursor-pointer text-xs flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingBoth ? 'animate-spin' : ''}`} />
              <span>{isSyncingBoth ? 'Fetching both stores in parallel...' : 'Fetch & Sync Both Stores (Global & LLC) Now'}</span>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-neutral-200/60 bg-white/30 flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${dualConfig.global.isConnected ? 'bg-emerald-500' : 'bg-neutral-400'}`}></span>
              <span>Global: {dualConfig.global.isConnected ? 'Live' : 'Offline'}</span>
            </span>
            <span className="text-neutral-300">•</span>
            <span className="inline-flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${dualConfig.llc.isConnected ? 'bg-emerald-500' : 'bg-neutral-400'}`}></span>
              <span>LLC: {dualConfig.llc.isConnected ? 'Live' : 'Offline'}</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-600 hover:text-neutral-950 font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
