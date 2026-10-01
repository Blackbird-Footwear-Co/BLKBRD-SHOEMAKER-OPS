import React, { useState } from 'react';
import {
  X,
  UserPlus,
  Phone,
  Mail,
  ShoppingBag,
  Tag,
  MapPin,
  FileText,
  MessageSquare,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { CustomerSource, CustomerProfile, UserProfile } from '../types';
import {
  CUSTOMER_SOURCES,
  CRM_QUERY_TAGS,
  addCustomer
} from '../services/customerService';
import { normalizeOrderId, formatBlkbrdOrderId } from '../utils/csvParser';

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserProfile | null;
  onCustomerAdded: (customer: CustomerProfile) => void;
}

const PREDEFINED_TAG_SUGGESTIONS = [
  'VIP Client',
  'Bespoke Customer',
  'Repeat Buyer',
  'High Priority',
  'Sizing Advice Needed',
  'Exchange Active',
  'WhatsApp Preferred',
  'Sole Customization'
];

export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onCustomerAdded
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState<CustomerSource>('Website');
  const [orderInput, setOrderInput] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [notes, setNotes] = useState('');

  // Optional initial CRM query
  const [includeInitialQuery, setIncludeInitialQuery] = useState(false);
  const [queryTag, setQueryTag] = useState<string>(CRM_QUERY_TAGS[0]);
  const [queryStatus, setQueryStatus] = useState<'Open' | 'In Progress' | 'Resolved'>('Open');
  const [queryOrderId, setQueryOrderId] = useState('');
  const [queryRemarks, setQueryRemarks] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleAddCustomTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    const clean = customTagInput.trim();
    if (clean && !selectedTags.includes(clean)) {
      setSelectedTags([...selectedTags, clean]);
      setCustomTagInput('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Customer Name is required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      // Parse order IDs with standard BLKBRD/USBLKBRD format
      const isUsStore = country.trim().toUpperCase().includes('USA') || country.trim().toUpperCase().includes('UNITED STATES');
      const rawOrders = orderInput
        .split(/[,;\s]+/)
        .map(o => formatBlkbrdOrderId(o, isUsStore ? 'LLC' : undefined))
        .filter(Boolean);

      const formattedQueryOrderId = queryOrderId.trim()
        ? formatBlkbrdOrderId(queryOrderId.trim(), isUsStore ? 'LLC' : undefined)
        : undefined;

      const newCustomer = addCustomer({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        source,
        orderIds: rawOrders,
        tags: selectedTags,
        city: city.trim(),
        country: country.trim(),
        notes: notes.trim(),
        initialQuery: includeInitialQuery && queryRemarks.trim() ? {
          orderId: formattedQueryOrderId,
          tag: queryTag,
          status: queryStatus,
          remarks: queryRemarks.trim(),
          agentName: currentUser?.name || 'CRM Team',
          agentRole: currentUser?.role || 'admin'
        } : undefined
      });

      setIsSubmitting(false);
      onCustomerAdded(newCustomer);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setFormError(`Failed to save customer: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-neutral-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-700 flex items-center justify-center border border-teal-500/20">
              <UserPlus className="w-5 h-5 stroke-[1.75]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900">Add Customer Profile</h2>
              <p className="text-xs text-neutral-500">
                Register a new client, link order history, and log live CRM remarks.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Row 1: Name and Source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-neutral-700 font-semibold mb-1">
                Customer Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Stephen Maloney"
                className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 focus:outline-hidden focus:border-teal-500 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-neutral-700 font-semibold mb-1">
                Lead / Acquisition Source
              </label>
              <select
                value={source}
                onChange={e => setSource(e.target.value as CustomerSource)}
                className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 focus:outline-hidden focus:border-teal-500 focus:bg-white transition font-medium"
              >
                {CUSTOMER_SOURCES.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Phone & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-neutral-700 font-semibold mb-1 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-neutral-400" />
                <span>Phone / WhatsApp Number</span>
              </label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="e.g. +1 555-234-8901 or +91 98201 44552"
                className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 focus:outline-hidden focus:border-teal-500 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-neutral-700 font-semibold mb-1 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-neutral-400" />
                <span>Email Address</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="e.g. customer@example.com"
                className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 focus:outline-hidden focus:border-teal-500 focus:bg-white transition"
              />
            </div>
          </div>

          {/* Row 3: Orders History */}
          <div>
            <label className="block text-neutral-700 font-semibold mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <ShoppingBag className="w-3.5 h-3.5 text-neutral-400" />
                <span>Associated Order Numbers (History)</span>
              </span>
              <span className="text-[10px] text-neutral-400 font-normal">Separate with commas or spaces</span>
            </label>
            <input
              type="text"
              value={orderInput}
              onChange={e => setOrderInput(e.target.value)}
              placeholder="e.g. BLKBRD6132, BLKBRD6774, USBLKBRD1042"
              className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 font-mono focus:outline-hidden focus:border-teal-500 focus:bg-white transition"
            />
            <p className="text-[11px] text-neutral-400 mt-1">
              CRM team will instantly fetch full production timelines, delay stages, and tracking details for these orders.
            </p>
          </div>

          {/* Row 4: Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-neutral-700 font-semibold mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                <span>City</span>
              </label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="e.g. Boston or Mumbai"
                className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 focus:outline-hidden focus:border-teal-500 focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-neutral-700 font-semibold mb-1">
                Country
              </label>
              <input
                type="text"
                value={country}
                onChange={e => setCountry(e.target.value)}
                placeholder="e.g. USA, UK, India, Australia"
                className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 focus:outline-hidden focus:border-teal-500 focus:bg-white transition"
              />
            </div>
          </div>

          {/* Row 5: Tags */}
          <div>
            <label className="block text-neutral-700 font-semibold mb-1.5 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-neutral-400" />
              <span>CRM Tags & Customer Classification</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PREDEFINED_TAG_SUGGESTIONS.map(tag => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer border ${
                      isSelected
                        ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                        : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border-neutral-200'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {tag}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customTagInput}
                onChange={e => setCustomTagInput(e.target.value)}
                onKeyDown={handleAddCustomTag}
                placeholder="Type custom tag and press Enter..."
                className="flex-1 text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-1.5 text-neutral-900 focus:outline-hidden focus:border-teal-500 focus:bg-white transition"
              />
              <button
                type="button"
                onClick={handleAddCustomTag}
                disabled={!customTagInput.trim()}
                className="px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-xl text-xs font-medium cursor-pointer disabled:opacity-40"
              >
                Add Tag
              </button>
            </div>
          </div>

          {/* Row 6: General Profile Notes */}
          <div>
            <label className="block text-neutral-700 font-semibold mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-neutral-400" />
              <span>General Notes / Profile Insights</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Client prefers Goodyear welt with Dainite rubber sole, instep width UK E..."
              className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-900 focus:outline-hidden focus:border-teal-500 focus:bg-white transition"
            />
          </div>

          {/* Collapsible: Log Initial CRM Query */}
          <div className="border border-teal-200 bg-teal-50/40 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-teal-950 text-xs select-none">
                <input
                  type="checkbox"
                  checked={includeInitialQuery}
                  onChange={e => setIncludeInitialQuery(e.target.checked)}
                  className="rounded-md text-teal-600 focus:ring-teal-500 h-4 w-4"
                />
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-teal-700" />
                  Log an active CRM Inquiry / Query right now
                </span>
              </label>
              {includeInitialQuery && (
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-teal-200 text-teal-800 font-bold">
                  Active
                </span>
              )}
            </div>

            {includeInitialQuery && (
              <div className="space-y-3 pt-2 border-t border-teal-200/60 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      Query Tag
                    </label>
                    <select
                      value={queryTag}
                      onChange={e => setQueryTag(e.target.value)}
                      className="w-full text-xs bg-white border border-teal-200 rounded-xl px-2.5 py-1.5 text-neutral-900 font-medium focus:outline-hidden"
                    >
                      {CRM_QUERY_TAGS.map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      Status
                    </label>
                    <select
                      value={queryStatus}
                      onChange={e => setQueryStatus(e.target.value as any)}
                      className="w-full text-xs bg-white border border-teal-200 rounded-xl px-2.5 py-1.5 text-neutral-900 font-medium focus:outline-hidden"
                    >
                      <option value="Open">Open (Pending)</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                      Target Order (Optional)
                    </label>
                    <input
                      type="text"
                      value={queryOrderId}
                      onChange={e => setQueryOrderId(e.target.value)}
                      placeholder="e.g. BLKBRD6132"
                      className="w-full text-xs bg-white border border-teal-200 rounded-xl px-2.5 py-1.5 text-neutral-900 font-mono focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                    Inquiry Remarks & Discussion Notes
                  </label>
                  <textarea
                    rows={2}
                    value={queryRemarks}
                    onChange={e => setQueryRemarks(e.target.value)}
                    placeholder="Describe client request, sizing query, or resolution steps..."
                    className="w-full text-xs bg-white border border-teal-200 rounded-xl px-3 py-2 text-neutral-900 focus:outline-hidden"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-neutral-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-neutral-600 hover:text-neutral-900 font-medium hover:bg-neutral-100 transition cursor-pointer text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-xl transition cursor-pointer text-xs shadow-md shadow-teal-600/25 disabled:opacity-40"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving Profile...' : 'Create Customer Profile'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
