/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { TrialPairItem, UserRole } from '../types';
import {
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Plus,
  Edit2,
  Save,
  X,
  Footprints,
  Phone,
  Calendar,
  Truck,
  Download,
  Search,
  LayoutGrid,
  List
} from 'lucide-react';
import { exportToCsv, formatBlkbrdOrderId } from '../utils/csvParser';

interface TrialPairsViewProps {
  items: TrialPairItem[];
  role: UserRole;
  onUpdateItem: (item: TrialPairItem) => void;
  onAddItem: (item: any) => void;
  onRefreshAll?: () => void;
  onViewOrderSummary?: (orderId: string) => void;
}

export const TrialPairsView: React.FC<TrialPairsViewProps> = ({
  items,
  role,
  onUpdateItem,
  onAddItem,
  onRefreshAll,
  onViewOrderSummary
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<TrialPairItem>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [copiedAwb, setCopiedAwb] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const [newForm, setNewForm] = useState({
    orderId: 'TP-' + Math.floor(40100 + Math.random() * 900),
    customerName: '',
    shoeModel: 'Dixon Chelsea',
    sourceType: 'Direct' as 'Global Returns' | 'LLC Returns' | 'Daily Dispatches' | 'Direct',
    outboundAwb: '',
    status: 'Active Trial' as TrialPairItem['status'],
    notes: ''
  });

  const canEdit = role === 'admin' || role === 'logistics';

  const filteredItems = items.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const oId = (item.orderId || '').toLowerCase();
    const cName = (item.customerName || '').toLowerCase();
    const sModel = (item.shoeModel || '').toLowerCase();
    const sType = (item.sourceType || '').toLowerCase();
    const awb = (item.outboundAwb || '').toLowerCase();
    const st = (item.status || '').toLowerCase();
    const n = (item.notes || '').toLowerCase();
    return oId.includes(q) || cName.includes(q) || sModel.includes(q) || sType.includes(q) || awb.includes(q) || st.includes(q) || n.includes(q);
  });

  const handleExportTrialPairs = () => {
    const listToExport = filteredItems.length > 0 ? filteredItems : items;
    if (listToExport.length === 0) {
      alert('No trial pairs records available to export.');
      return;
    }

    const exportRows = listToExport.map((item, idx) => ({
      'S.No': item.sNo || idx + 1,
      'Order ID': item.orderId ? `#${String(item.orderId).replace(/^#/, '')}` : '',
      'Customer Name': item.customerName || '',
      'Shoe Model': item.shoeModel || '',
      'Source Type': item.sourceType || 'Direct',
      'Outbound AWB': item.outboundAwb || '',
      'Status': item.status || 'Active Trial',
      'Notes': item.notes || ''
    }));

    const dateStr = new Date().toISOString().split('T')[0];
    exportToCsv(exportRows, `BLKBRD_Trial_Pairs_${dateStr}.csv`);
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAwb(text);
    setTimeout(() => setCopiedAwb(null), 1500);
  };

  const startEdit = (item: TrialPairItem) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = (item: TrialPairItem) => {
    onUpdateItem({ ...item, ...editForm });
    setEditingId(null);
    setEditForm({});
    if (onRefreshAll) onRefreshAll();
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.customerName || !newForm.orderId) return;
    const isLlc = newForm.sourceType === 'LLC Returns' || newForm.orderId.toUpperCase().startsWith('US');
    const formattedId = formatBlkbrdOrderId(newForm.orderId, isLlc ? 'LLC' : 'Global');
    onAddItem({
      sNo: items.length + 1,
      ...newForm,
      orderId: formattedId
    });
    setIsAdding(false);
    setNewForm({
      orderId: 'BLKBRD' + Math.floor(40100 + Math.random() * 900),
      customerName: '',
      shoeModel: 'Dixon Chelsea',
      sourceType: 'Direct',
      outboundAwb: '',
      status: 'Active Trial',
      notes: ''
    });
    if (onRefreshAll) onRefreshAll();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'In Transit':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            In Transit
          </span>
        );
      case 'Sent':
      case 'Active Trial':
      case 'Dispatched / In Transit':
      case 'With Customer Testing':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-900 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            {status || 'Sent'}
          </span>
        );
      case 'Returned':
      case 'Return Received':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-900 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Returned
          </span>
        );
      case 'Converted':
      case 'Converted to Purchase':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-900 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
            Converted
          </span>
        );
      case 'Closed':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-600 bg-neutral-100 border border-neutral-200 px-2.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-400"></span>
            {status || 'Closed'}
          </span>
        );
    }
  };

  return (
    <div className="glass-panel rounded-3xl overflow-hidden transition-all">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-neutral-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/40">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
            <span>Trial Pairs &amp; Fit Testing Program</span>
            <span className="text-[11px] font-mono text-neutral-500 glass-pill px-2.5 py-0.5 rounded-full">
              {items.length} pairs
            </span>
          </h3>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportTrialPairs}
            disabled={items.length === 0}
            className="px-3.5 py-1.5 text-xs font-semibold text-neutral-800 bg-white hover:bg-neutral-50 border border-neutral-200/80 rounded-full flex items-center gap-1.5 cursor-pointer shadow-2xs transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[34px]"
            title="Download trial pairs records as CSV"
          >
            <Download className="w-3.5 h-3.5 stroke-[1.5]" />
            <span>Export CSV</span>
            <span className="text-[10px] font-mono text-neutral-500">({filteredItems.length})</span>
          </button>

          {canEdit && (
            <button
              onClick={() => setIsAdding(!isAdding)}
              className="glass-button-dark inline-flex items-center gap-1.5 text-xs text-white px-3.5 py-1.5 rounded-full font-medium transition cursor-pointer hover:bg-black/90 min-h-[34px]"
            >
              {isAdding ? <X className="w-3.5 h-3.5 stroke-[1.5]" /> : <Plus className="w-3.5 h-3.5 stroke-[1.5]" />}
              <span>{isAdding ? 'Close' : 'Log Trial Pair'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="px-4 py-2.5 bg-neutral-50/60 border-b border-neutral-200/60 flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by Order ID, customer, shoe model, AWB, status..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8.5 pr-3 py-1.5 glass-input rounded-xl text-xs focus:outline-hidden"
          />
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle (Cards vs Table) */}
          <div className="flex items-center p-0.5 bg-neutral-200/80 rounded-lg border border-neutral-300/80 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white text-neutral-900 shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
              title="Switch to Card Grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-neutral-900 shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
              title="Switch to Spreadsheet Table view"
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>
          <span className="text-xs text-neutral-500 whitespace-nowrap">
            Showing <strong className="text-neutral-800 font-semibold">{filteredItems.length}</strong> of {items.length} records
          </span>
        </div>
      </div>

      {/* Add New Trial Form */}
      {isAdding && canEdit && (
        <form
          onSubmit={handleCreate}
          className="m-3 sm:m-4 p-4 glass-card rounded-2xl border border-neutral-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 animate-in fade-in"
        >
          <div>
            <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Order ID *</label>
            <input
              type="text"
              required
              placeholder="e.g. TP-40102"
              value={newForm.orderId}
              onChange={e => setNewForm({ ...newForm, orderId: e.target.value })}
              className="w-full glass-input rounded-xl px-3 py-2 text-xs font-mono font-semibold focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Customer Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Vikram Seth"
              value={newForm.customerName}
              onChange={e => setNewForm({ ...newForm, customerName: e.target.value })}
              className="w-full glass-input rounded-xl px-3 py-2 text-xs focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Shoe Model *</label>
            <input
              type="text"
              required
              placeholder="e.g. Dixon Chelsea"
              value={newForm.shoeModel}
              onChange={e => setNewForm({ ...newForm, shoeModel: e.target.value })}
              className="w-full glass-input rounded-xl px-3 py-2 text-xs focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Source Type</label>
            <select
              value={newForm.sourceType}
              onChange={e => setNewForm({ ...newForm, sourceType: e.target.value as any })}
              className="w-full glass-input rounded-xl px-3 py-2 text-xs font-medium focus:outline-hidden"
            >
              <option value="Direct">Direct</option>
              <option value="Global Returns">Global Returns</option>
              <option value="LLC Returns">LLC Returns</option>
              <option value="Daily Dispatches">Daily Dispatches</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Outbound AWB</label>
            <input
              type="text"
              placeholder="e.g. BD-8839201"
              value={newForm.outboundAwb}
              onChange={e => setNewForm({ ...newForm, outboundAwb: e.target.value })}
              className="w-full glass-input rounded-xl px-3 py-2 text-xs font-mono focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1">Status</label>
            <div className="flex gap-2">
              <select
                value={newForm.status}
                onChange={e => setNewForm({ ...newForm, status: e.target.value as any })}
                className="w-full glass-input rounded-xl px-3 py-2 text-xs font-medium focus:outline-hidden"
              >
                <option value="Active Trial">Active Trial</option>
                <option value="Sent">Sent</option>
                <option value="In Transit">In Transit</option>
                <option value="Returned">Returned</option>
                <option value="Converted">Converted</option>
                <option value="Closed">Closed</option>
              </select>
              <button
                type="submit"
                className="bg-neutral-900 hover:bg-neutral-800 text-white font-medium py-2 px-3 rounded-full text-xs transition cursor-pointer shadow-xs min-h-[38px] shrink-0"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Content: Cards vs Table */}
      {viewMode === 'cards' ? (
        <div className="p-3.5 sm:p-5 bg-neutral-50/60">
          {filteredItems.length === 0 ? (
            <div className="py-14 text-center text-neutral-400 bg-white rounded-2xl border border-neutral-200/80 p-6">
              <Footprints className="w-8 h-8 mx-auto mb-2 opacity-30 stroke-[1.5]" />
              <p className="text-xs font-semibold text-neutral-700">
                {searchQuery ? `No trial pairs matching "${searchQuery}"` : 'No trial pairs logged yet.'}
              </p>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                {searchQuery ? 'Try clearing your search query.' : 'Click "Log Trial Pair" to create a new trial testing record.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredItems.map((item, idx) => {
                const serialNo = item.sNo || idx + 1;
                const source = item.sourceType || 'Direct';

                return (
                  <div
                    key={item.id ? `${item.id}-${idx}` : `trial-${idx}`}
                    className="p-4 rounded-2xl bg-white border border-neutral-200/80 shadow-2xs hover:shadow-md transition duration-150 space-y-3.5 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      {/* Card Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-neutral-800 bg-neutral-100 px-2 py-0.5 rounded-md border border-neutral-200">
                            #{serialNo}
                          </span>
                          {onViewOrderSummary ? (
                            <button
                              type="button"
                              onClick={() => onViewOrderSummary(item.orderId)}
                              className="font-mono font-bold text-xs text-neutral-900 hover:text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                              title="Click to view full order summary and journey"
                            >
                              <span>#{item.orderId.replace(/^#/, '')}</span>
                              <ExternalLink className="w-3 h-3 text-blue-600" />
                            </button>
                          ) : (
                            <span className="font-mono font-bold text-xs text-neutral-900">
                              #{item.orderId.replace(/^#/, '')}
                            </span>
                          )}
                        </div>
                        {getStatusBadge(item.status)}
                      </div>

                      {/* Customer & Shoe Model */}
                      <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-100 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[10px] font-semibold uppercase text-neutral-400 block">Customer</span>
                            <div className="font-semibold text-xs text-neutral-900 truncate">{item.customerName}</div>
                          </div>
                          <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-neutral-200/70 text-neutral-700 border border-neutral-300/50 shrink-0">
                            {source}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] font-semibold uppercase text-neutral-400 block">Shoe Model</span>
                          <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-800 mt-0.5">
                            <Footprints className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                            <span className="truncate">{item.shoeModel}</span>
                          </div>
                        </div>
                      </div>

                      {/* Outbound AWB */}
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/60 border border-blue-100 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="text-neutral-500 text-[11px]">AWB:</span>
                          <span className="font-mono font-bold text-neutral-900">{item.outboundAwb || 'Pending'}</span>
                        </div>
                        {item.outboundAwb && (
                          <button
                            type="button"
                            onClick={() => copy(item.outboundAwb)}
                            className="p-1 rounded-md hover:bg-blue-100 text-blue-700 transition cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                            title="Copy AWB number"
                          >
                            {copiedAwb === item.outboundAwb ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span className="text-emerald-700">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Notes / Timeline */}
                      {item.notes && (
                        <p className="text-[11px] text-neutral-500 bg-white p-2 rounded-lg border border-neutral-100 line-clamp-2">
                          {item.notes}
                        </p>
                      )}
                    </div>

                    {/* Card Actions */}
                    <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-2">
                      {onViewOrderSummary && (
                        <button
                          type="button"
                          onClick={() => onViewOrderSummary(item.orderId)}
                          className="text-xs text-neutral-600 hover:text-neutral-900 font-medium py-1 px-2 rounded-lg hover:bg-neutral-100 cursor-pointer flex items-center gap-1 transition"
                        >
                          <ExternalLink className="w-3 h-3 text-neutral-400" />
                          <span>Order Details</span>
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="glass-button text-xs px-3 py-1 rounded-full flex items-center gap-1.5 font-medium cursor-pointer ml-auto hover:bg-neutral-100 transition"
                        >
                          <Edit2 className="w-3 h-3 stroke-[1.5]" />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Desktop Table */
        <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-neutral-200/60 bg-white/30 text-neutral-500 uppercase font-medium text-[10px] tracking-wider">
              <th className="py-3 px-3">S.No</th>
              <th className="py-3 px-4">Order ID</th>
              <th className="py-3 px-4">Customer Name</th>
              <th className="py-3 px-4">Shoe Model</th>
              <th className="py-3 px-4">Source Type</th>
              <th className="py-3 px-4">Outbound AWB</th>
              <th className="py-3 px-4">Status</th>
              {canEdit && <th className="py-3 px-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200/50">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className="py-12 text-center text-neutral-400">
                  <Footprints className="w-8 h-8 mx-auto mb-2 opacity-30 stroke-[1.5]" />
                  <p className="text-xs font-medium text-neutral-600">
                    {searchQuery ? `No trial pairs matching "${searchQuery}"` : 'No trial pairs logged yet.'}
                  </p>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    {searchQuery ? 'Try clearing your search query.' : 'Click "Log Trial Pair" to create a new trial testing record.'}
                  </p>
                </td>
              </tr>
            ) : (
              filteredItems.map((item, idx) => {
                const isEditing = editingId === item.id;
                const serialNo = item.sNo || idx + 1;
                const source = item.sourceType || 'Direct';

                return (
                  <tr key={item.id ? `${item.id}-${idx}` : `trial-${idx}`} className="hover:bg-white/50 transition duration-150">
                    {/* Serial Number */}
                    <td className="py-3.5 px-3 font-mono font-semibold text-neutral-500 whitespace-nowrap">
                      #{serialNo}
                    </td>

                    {/* Order ID */}
                    <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.orderId || item.orderId}
                          onChange={e => setEditForm({ ...editForm, orderId: e.target.value })}
                          className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono font-semibold"
                        />
                      ) : onViewOrderSummary ? (
                        <button
                          type="button"
                          onClick={() => onViewOrderSummary(item.orderId)}
                          className="hover:text-blue-600 hover:underline flex items-center gap-1 group text-left cursor-pointer transition font-mono font-semibold text-neutral-900"
                          title="View Order Summary & History"
                        >
                          <span>#{item.orderId.replace(/^#/, '')}</span>
                          <ExternalLink className="w-3 h-3 text-neutral-400 group-hover:text-blue-600 transition" />
                        </button>
                      ) : (
                        <span className="font-semibold text-neutral-900">#{item.orderId.replace(/^#/, '')}</span>
                      )}
                    </td>

                  {/* Customer Name */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.customerName || item.customerName}
                        onChange={e => setEditForm({ ...editForm, customerName: e.target.value })}
                        className="glass-input rounded-lg px-2 py-0.5 text-xs"
                      />
                    ) : (
                      <span className="font-semibold text-neutral-900">{item.customerName}</span>
                    )}
                  </td>

                  {/* Shoe Model */}
                  <td className="py-3.5 px-4 min-w-[140px]">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.shoeModel || item.shoeModel}
                        onChange={e => setEditForm({ ...editForm, shoeModel: e.target.value })}
                        className="glass-input rounded-lg px-2 py-0.5 text-xs"
                      />
                    ) : (
                      <span className="text-neutral-800 font-medium">{item.shoeModel}</span>
                    )}
                  </td>

                  {/* Source Type: Global Returns / LLC Returns / Daily Dispatches / Direct */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isEditing ? (
                      <select
                        value={editForm.sourceType || source}
                        onChange={e => setEditForm({ ...editForm, sourceType: e.target.value })}
                        className="glass-input rounded-lg px-2 py-0.5 text-xs font-medium"
                      >
                        <option value="Direct">Direct</option>
                        <option value="Global Returns">Global Returns</option>
                        <option value="LLC Returns">LLC Returns</option>
                        <option value="Daily Dispatches">Daily Dispatches</option>
                      </select>
                    ) : (
                      <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
                        {source}
                      </span>
                    )}
                  </td>

                  {/* Outbound AWB */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.outboundAwb || item.outboundAwb}
                        onChange={e => setEditForm({ ...editForm, outboundAwb: e.target.value })}
                        placeholder="Outbound AWB"
                        className="glass-input rounded-lg px-2 py-0.5 text-xs font-mono"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-neutral-800 font-semibold">{item.outboundAwb || '—'}</span>
                        {item.outboundAwb && (
                          <button
                            onClick={() => copy(item.outboundAwb)}
                            className="glass-button p-0.5 rounded-full text-neutral-400 hover:text-neutral-800 cursor-pointer"
                            title="Copy AWB"
                          >
                            {copiedAwb === item.outboundAwb ? (
                              <Check className="w-2.5 h-2.5 text-emerald-600 stroke-[1.5]" />
                            ) : (
                              <Copy className="w-2.5 h-2.5 stroke-[1.5]" />
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isEditing ? (
                      <select
                        value={editForm.status || item.status}
                        onChange={e => setEditForm({ ...editForm, status: e.target.value as any })}
                        className="glass-input rounded-xl px-2.5 py-1 text-xs font-medium focus:outline-hidden"
                      >
                        <option value="Active Trial">Active Trial</option>
                        <option value="Sent">Sent</option>
                        <option value="In Transit">In Transit</option>
                        <option value="Returned">Returned</option>
                        <option value="Converted">Converted</option>
                        <option value="Closed">Closed</option>
                      </select>
                    ) : (
                      getStatusBadge(item.status)
                    )}
                  </td>

                  {/* Actions */}
                  {canEdit && (
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleSave(item)}
                            className="inline-flex items-center gap-1 bg-neutral-900 hover:bg-neutral-800 text-white px-3 py-1 rounded-full text-xs font-medium cursor-pointer shadow-xs"
                          >
                            <Save className="w-3 h-3 stroke-[1.5]" /> Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1 text-neutral-500 hover:text-neutral-900 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5 stroke-[1.5]" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(item)}
                          className="glass-button text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-medium cursor-pointer ml-auto"
                        >
                          <Edit2 className="w-3 h-3 stroke-[1.5]" />
                          <span>Edit</span>
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
};