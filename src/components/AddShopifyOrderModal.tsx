/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  ShoppingBag,
  Store,
  Globe,
  Building2,
  DollarSign,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Link,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { ShopifyOrder, ShoeWidth, SHOE_WIDTHS } from '../types';
import {
  getStoreMasterProducts,
  MasterProduct
} from '../data/blkbrdMasterProducts';
import { formatBlkbrdOrderId } from '../utils/csvParser';

interface AddShopifyOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddOrder: (order: ShopifyOrder) => Promise<void> | void;
  existingOrders?: ShopifyOrder[];
}

export const AddShopifyOrderModal: React.FC<AddShopifyOrderModalProps> = ({
  isOpen,
  onClose,
  onAddOrder,
  existingOrders = []
}) => {
  const [storeAccount, setStoreAccount] = useState<'Global' | 'LLC'>('Global');
  const [orderRawNumber, setOrderRawNumber] = useState('');
  
  // Customer Details
  const [customerName, setCustomerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('India');

  // Shipment Tracking Link
  const [trackingLink, setTrackingLink] = useState('');
  const [trackingAwb, setTrackingAwb] = useState('');
  const [shippingCarrier, setShippingCarrier] = useState('Bluedart Express');

  // Product Selection from Authentic Catalogs
  const currentCatalog = useMemo(() => getStoreMasterProducts(storeAccount), [storeAccount]);
  const [selectedProductId, setSelectedProductId] = useState<number>(currentCatalog[0]?.id || 0);

  const selectedProduct: MasterProduct = useMemo(() => {
    return currentCatalog.find(p => p.id === selectedProductId) || currentCatalog[0];
  }, [currentCatalog, selectedProductId]);

  // Footwear Specs (driven by authentic product)
  const [selectedVariant, setSelectedVariant] = useState<string>(selectedProduct?.variants[3] || '');
  const [width, setWidth] = useState<ShoeWidth>('E');

  // Pricing & Status
  const [totalPrice, setTotalPrice] = useState(selectedProduct?.price || '₹28,200');
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [financialStatus, setFinancialStatus] = useState<'paid' | 'pending' | 'refunded'>('paid');
  const [fulfillmentStatus, setFulfillmentStatus] = useState<'unfulfilled' | 'fulfilled' | 'partial'>('unfulfilled');
  const [operationalStatus, setOperationalStatus] = useState<'Ready to Ship' | 'In Production' | 'Delayed'>('In Production');
  const [initialStage, setInitialStage] = useState<string>('CUTTING');

  // Dates & Notes
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  // The store-specific prefix
  const storePrefix = storeAccount === 'LLC' ? 'USBLKBRD' : 'BLKBRD';

  // Handle switching store account
  const handleStoreChange = (newAccount: 'Global' | 'LLC') => {
    setStoreAccount(newAccount);
    const newCat = getStoreMasterProducts(newAccount);
    const firstProd = newCat[0];
    if (firstProd) {
      setSelectedProductId(firstProd.id);
      setSelectedVariant(firstProd.variants[3] || firstProd.variants[0] || '');
      setTotalPrice(firstProd.price);
    }
    if (newAccount === 'LLC') {
      setCurrency('USD');
      setCountry('United States');
      setShippingCarrier('FedEx / DHL Express');
    } else {
      setCurrency('INR');
      setCountry('India');
      setShippingCarrier('Bluedart Express');
    }
  };

  // Handle product selection change
  const handleProductChange = (prodId: number) => {
    setSelectedProductId(prodId);
    const prod = currentCatalog.find(p => p.id === prodId);
    if (prod) {
      setSelectedVariant(prod.variants[3] || prod.variants[0] || '');
      setTotalPrice(prod.price);
    }
  };

  // Auto-suggest next order number
  const handleSuggestNextOrderNumber = () => {
    const isLlc = storeAccount === 'LLC';
    const numbers: number[] = [];

    existingOrders.forEach(o => {
      const match = String(o.orderNumber || '').match(/\d+/);
      if (match) {
        numbers.push(parseInt(match[0], 10));
      }
    });

    const maxNum = numbers.length > 0 ? Math.max(...numbers) : (isLlc ? 1050 : 6840);
    const nextNum = maxNum + 1;
    setOrderRawNumber(String(nextNum));
  };

  const computedOrderNumber = `${storePrefix}${orderRawNumber.trim().replace(/^(USBLKBRD|BLKBRD|US)[-_#\s]*/i, '')}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const pureNum = orderRawNumber.trim().replace(/^(USBLKBRD|BLKBRD|US)[-_#\s]*/i, '');
    if (!pureNum) {
      setFormError(`Please enter an order number. It will be prefixed with ${storePrefix}.`);
      return;
    }
    if (!customerName.trim()) {
      setFormError('Customer Full Name is required.');
      return;
    }
    if (!selectedProduct) {
      setFormError('Please select a product from the catalog.');
      return;
    }

    const finalOrderNumber = computedOrderNumber;

    // Check duplicate
    const isDuplicate = existingOrders.some(
      o => String(o.orderNumber || '').replace(/^#/, '').toLowerCase() === finalOrderNumber.toLowerCase()
    );
    if (isDuplicate) {
      const proceed = window.confirm(`An order with ID #${finalOrderNumber} already exists. Do you want to proceed?`);
      if (!proceed) return;
    }

    setIsSubmitting(true);
    try {
      // Build formatted product description strictly from authentic specifications
      const fullLineItem = `${selectedProduct.title} | ${selectedVariant || 'Standard Size'} | Width: ${width} | Last: ${selectedProduct.last} | Leather: ${selectedProduct.leather} | Sole: ${selectedProduct.outsole} | Stage: ${initialStage}`;

      // Build complete notes
      const notesParts: string[] = [];
      if (notes.trim()) notesParts.push(notes.trim());
      if (phone.trim()) {
        notesParts.push(`Phone: ${phone.trim()}`);
      }
      if (address.trim() || city.trim()) {
        notesParts.push(`Shipping Address: ${[address.trim(), city.trim(), country.trim()].filter(Boolean).join(', ')}`);
      }
      if (trackingLink.trim()) {
        notesParts.push(`Tracking Link: ${trackingLink.trim()}`);
      }
      if (trackingAwb.trim()) {
        notesParts.push(`AWB: ${trackingAwb.trim()}`);
      }
      if (shippingCarrier.trim()) {
        notesParts.push(`Carrier: ${shippingCarrier.trim()}`);
      }
      notesParts.push(`Store: ${storeAccount} Store (${storePrefix})`);

      const newOrder: ShopifyOrder = {
        id: `manual-shp-${finalOrderNumber}-${Date.now()}`,
        orderNumber: finalOrderNumber,
        customerName: customerName.trim(),
        email: email.trim() || `${customerName.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'client'}@customer.blkbrdshoemaker.com`,
        phone: phone.trim(),
        address: [address.trim(), city.trim(), country.trim()].filter(Boolean).join(', '),
        trackingLink: trackingLink.trim(),
        trackingAwb: trackingAwb.trim(),
        shippingCarrier: shippingCarrier.trim(),
        totalPrice: totalPrice.trim() || selectedProduct.price,
        currency,
        financialStatus,
        fulfillmentStatus,
        operationalStatus,
        createdAt: new Date(orderDate).toISOString(),
        lineItems: fullLineItem,
        notes: notesParts.join(' | '),
        storeAccount,
        storeTab: storeAccount,
        isManual: true
      };

      await onAddOrder(newOrder);
      onClose();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save manual Shopify order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-neutral-950/60 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-neutral-200/80 overflow-hidden my-6">
        {/* Header */}
        <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-neutral-100 flex items-center justify-between bg-gradient-to-r from-neutral-900 to-neutral-800 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-white border border-white/15">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">Add Shopify Order Manually</h3>
                <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                  Admin Authority
                </span>
              </div>
              <p className="text-xs text-neutral-300 mt-0.5">
                Orders are prefixed with <strong className="text-white font-mono">{storePrefix}</strong> and pre-filled with authentic footwear specifications.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
          {formError && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Section 1: Store Account Selector & Prefix Preview */}
          <div>
            <label className="block text-neutral-700 font-semibold mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-neutral-500" />
                <span>Store Account &amp; Order Prefix</span>
              </span>
              <span className="text-[11px] font-mono text-neutral-500">
                Prefix: <strong className="text-neutral-900">{storePrefix}</strong>
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleStoreChange('Global')}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center gap-3 ${
                  storeAccount === 'Global'
                    ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20 shadow-xs'
                    : 'border-neutral-200 hover:border-neutral-300 bg-neutral-50/50'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${storeAccount === 'Global' ? 'bg-blue-600 text-white' : 'bg-neutral-200 text-neutral-600'}`}>
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-neutral-900 flex items-center gap-1.5">
                    <span>Global Store</span>
                    <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">BLKBRD</span>
                  </div>
                  <div className="text-[11px] text-neutral-500">INR (₹) • Domestic &amp; Intl</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleStoreChange('LLC')}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center gap-3 ${
                  storeAccount === 'LLC'
                    ? 'border-purple-500 bg-purple-50/60 ring-2 ring-purple-500/20 shadow-xs'
                    : 'border-neutral-200 hover:border-neutral-300 bg-neutral-50/50'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${storeAccount === 'LLC' ? 'bg-purple-600 text-white' : 'bg-neutral-200 text-neutral-600'}`}>
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-neutral-900 flex items-center gap-1.5">
                    <span>US / LLC Store</span>
                    <span className="text-[10px] font-mono font-bold bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">USBLKBRD</span>
                  </div>
                  <div className="text-[11px] text-neutral-500">USD ($) • North America</div>
                </div>
              </button>
            </div>
          </div>

          {/* Section 2: Order Number with Store Initials */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-neutral-700 font-semibold flex items-center gap-1">
                  <span>Order Number</span>
                  <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleSuggestNextOrderNumber}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                >
                  Auto-suggest Next ID
                </button>
              </div>
              <div className="flex rounded-xl overflow-hidden border border-neutral-200 focus-within:border-neutral-900 bg-neutral-50">
                <span className="px-3 py-2 bg-neutral-200/80 font-mono font-bold text-neutral-800 text-xs border-r border-neutral-200 shrink-0">
                  {storePrefix}
                </span>
                <input
                  type="text"
                  required
                  value={orderRawNumber}
                  onChange={e => setOrderRawNumber(e.target.value)}
                  placeholder={storeAccount === 'LLC' ? '1048' : '6842'}
                  className="w-full text-xs px-3 py-2 bg-white text-neutral-900 font-mono focus:outline-hidden"
                />
              </div>
              <span className="text-[10px] text-neutral-400 mt-1 block">
                Final Order ID: <code className="font-mono font-bold text-neutral-800">#{orderRawNumber.trim() ? computedOrderNumber : `${storePrefix}...`}</code>
              </span>
            </div>

            <div>
              <label className="block text-neutral-700 font-semibold mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                <span>Order Placement Date</span>
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={e => setOrderDate(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 focus:bg-white transition"
              />
            </div>
          </div>

          {/* Section 3: Customer Details (Name, Phone, Email, Address) */}
          <div className="p-3.5 rounded-2xl bg-neutral-50/80 border border-neutral-200/80 space-y-3">
            <div className="text-[11px] font-semibold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-neutral-500" />
              <span>Customer Details: Name, Phone, Email, Address</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="e.g. Stephen Maloney"
                  className="w-full text-xs px-3 py-2 bg-white border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-neutral-400" />
                  <span>Customer Phone / WhatsApp</span>
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="e.g. +91 98201 55442 or +1 555-0192"
                  className="w-full text-xs px-3 py-2 bg-white border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1 flex items-center gap-1">
                  <Mail className="w-3 h-3 text-neutral-400" />
                  <span>Customer Email</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="e.g. customer@example.com"
                  className="w-full text-xs px-3 py-2 bg-white border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  City &amp; Country
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="City (e.g. Mumbai / Boston)"
                    className="w-full text-xs px-3 py-2 bg-white border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition"
                  />
                  <input
                    type="text"
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    placeholder="Country"
                    className="w-full text-xs px-3 py-2 bg-white border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-neutral-700 font-medium mb-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-neutral-400" />
                  <span>Shipping Address (Street, House/Apt, Landmark, PIN/Zip)</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="e.g. 742 Evergreen Terrace, Apt 4B, Springfield, 97477"
                  className="w-full text-xs px-3 py-2 bg-white border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Shipment Tracking Link & Carrier */}
          <div className="p-3.5 rounded-2xl bg-neutral-50/80 border border-neutral-200/80 space-y-3">
            <div className="text-[11px] font-semibold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5 text-neutral-500" />
              <span>Shipment Tracking Details</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-neutral-700 font-medium mb-1 flex items-center gap-1">
                  <span>Shipment Tracking Link (URL)</span>
                </label>
                <input
                  type="url"
                  value={trackingLink}
                  onChange={e => setTrackingLink(e.target.value)}
                  placeholder="https://track.delhivery.com/track/order/12345 or https://www.fedex.com/fedextrack/?trknbr=123"
                  className="w-full text-xs px-3 py-2 bg-white border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition font-mono"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Carrier / Partner
                </label>
                <input
                  type="text"
                  value={shippingCarrier}
                  onChange={e => setShippingCarrier(e.target.value)}
                  placeholder="Bluedart / FedEx / DHL"
                  className="w-full text-xs px-3 py-2 bg-white border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Tracking AWB Number
                </label>
                <input
                  type="text"
                  value={trackingAwb}
                  onChange={e => setTrackingAwb(e.target.value)}
                  placeholder="AWB123891482"
                  className="w-full text-xs px-3 py-2 bg-white border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 5: Footwear Product Selection from Authentic Catalogs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-neutral-700 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Authentic Store Product ({storeAccount === 'LLC' ? 'USBLKBRD PRDCTS' : 'BLKBRD PRDCTS'})</span>
                <span className="text-red-500">*</span>
              </label>
              <span className="text-[10px] text-neutral-400 font-mono">
                {currentCatalog.length} models available
              </span>
            </div>

            <div>
              <label className="block text-neutral-600 font-medium mb-1">Select Footwear Model</label>
              <select
                value={selectedProductId}
                onChange={e => handleProductChange(Number(e.target.value))}
                className="w-full text-xs px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 font-semibold focus:outline-hidden focus:border-neutral-900 focus:bg-white transition"
              >
                {currentCatalog.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.title} — {p.price} ({p.leather} • {p.last} • {p.outsole})
                  </option>
                ))}
              </select>
            </div>

            {/* Display authentic specifications badge card */}
            {selectedProduct && (
              <div className="p-3 rounded-2xl bg-amber-50/50 border border-amber-200/70 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Last</span>
                  <span className="font-semibold text-neutral-800">{selectedProduct.last}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Leather</span>
                  <span className="font-semibold text-neutral-800">{selectedProduct.leather}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Construction</span>
                  <span className="font-semibold text-neutral-800">{selectedProduct.construction}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Outsole</span>
                  <span className="font-semibold text-neutral-800">{selectedProduct.outsole}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-600 font-medium mb-1">
                  Product Variant (Size)
                </label>
                <select
                  value={selectedVariant}
                  onChange={e => setSelectedVariant(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 focus:bg-white transition font-medium"
                >
                  {selectedProduct?.variants.map(v => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-600 font-medium mb-1">Shoe Width</label>
                <select
                  value={width}
                  onChange={e => setWidth(e.target.value as ShoeWidth)}
                  className="w-full text-xs px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 focus:bg-white transition font-medium"
                >
                  {SHOE_WIDTHS.map(w => (
                    <option key={w} value={w}>
                      {w} {w === 'E' ? '(Standard Fitting)' : w === 'EE' ? '(Wide)' : w === 'EEE' ? '(Extra Wide)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 6: Pricing, Operational Status & Workshop Stage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-700 font-semibold mb-1">Total Price</label>
              <input
                type="text"
                value={totalPrice}
                onChange={e => setTotalPrice(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 font-semibold focus:outline-hidden focus:border-neutral-900 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-neutral-700 font-semibold mb-1">Payment Status</label>
              <select
                value={financialStatus}
                onChange={e => setFinancialStatus(e.target.value as any)}
                className="w-full text-xs px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 focus:bg-white transition font-medium"
              >
                <option value="paid">Paid (Confirmed)</option>
                <option value="pending">Pending</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>

            <div>
              <label className="block text-neutral-700 font-semibold mb-1">Fulfillment Status</label>
              <select
                value={fulfillmentStatus}
                onChange={e => setFulfillmentStatus(e.target.value as any)}
                className="w-full text-xs px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 focus:bg-white transition font-medium"
              >
                <option value="unfulfilled">Unfulfilled</option>
                <option value="partial">Partially Fulfilled</option>
                <option value="fulfilled">Fulfilled</option>
              </select>
            </div>

            <div>
              <label className="block text-neutral-700 font-semibold mb-1">Workshop Status</label>
              <select
                value={operationalStatus}
                onChange={e => setOperationalStatus(e.target.value as any)}
                className="w-full text-xs px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 focus:bg-white transition font-medium"
              >
                <option value="In Production">In Production</option>
                <option value="Ready to Ship">Ready to Ship (RTD)</option>
                <option value="Delayed">Delayed / Crafting Review</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-neutral-700 font-semibold mb-1 flex items-center gap-1 text-blue-800">
                <Layers className="w-3.5 h-3.5" />
                <span>Initial Production Stage (Workshop Journey)</span>
              </label>
              <select
                value={initialStage}
                onChange={e => setInitialStage(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-blue-50/50 border border-blue-200 rounded-xl text-neutral-900 font-bold uppercase tracking-wide focus:outline-hidden focus:border-blue-500 focus:bg-white transition"
              >
                <option value="CUTTING">CUTTING (Leather Selection &amp; Clicking)</option>
                <option value="CLOSING">CLOSING (Stitching &amp; Uppers)</option>
                <option value="PREPARATION">PREPARATION (Last &amp; Insole Setup)</option>
                <option value="UPPER">UPPER (Upper Fitting &amp; Assembly)</option>
                <option value="BOTTOM">BOTTOM (Lasting, Welt &amp; Sole Assembly)</option>
                <option value="FINISH">FINISH (Edge Trimming &amp; Burnishing)</option>
                <option value="QC">QC (Quality Control &amp; Inspection)</option>
                <option value="RTD">RTD (Ready to Dispatch)</option>
                <option value="SHIPPED">SHIPPED (Fulfilled &amp; In Transit)</option>
                <option value="ON HOLD">ON HOLD (Material Shortage / Custom Hold)</option>
              </select>
              <span className="text-[10px] text-neutral-500 mt-1 block">
                This sets the exact production stage where this manual order enters the workflow tracker.
              </span>
            </div>
          </div>

          {/* Section 7: Notes */}
          <div>
            <label className="block text-neutral-700 font-semibold mb-1">
              Bespoke Customization / Workshop Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Customer requested initials on sole waist, wedding delivery date..."
              className="w-full text-xs px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-900 focus:outline-hidden focus:border-neutral-900 focus:bg-white transition"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-neutral-200 flex items-center justify-between gap-3">
            <div className="text-[11px] text-neutral-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Will auto-seed into Supabase &amp; Workshop Queue with #{computedOrderNumber}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-full border border-neutral-200 text-neutral-700 hover:bg-neutral-100 font-medium transition cursor-pointer text-xs"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-neutral-900 hover:bg-neutral-800 text-white font-medium py-2 px-5 rounded-full text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{isSubmitting ? 'Creating & Syncing...' : 'Create & Sync Order'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};