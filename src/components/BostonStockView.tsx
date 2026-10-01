import React, { useState } from 'react';
import { BostonStockItem, UserRole } from '../types';
import {
  Package,
  Search,
  Plus,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  Warehouse,
  Tag,
  Download,
  Filter,
  Save,
  X,
  Sparkles,
  LayoutGrid,
  List
} from 'lucide-react';
import { exportToCsv } from '../utils/csvParser';

interface BostonStockViewProps {
  items: BostonStockItem[];
  role: UserRole;
  onUpdateItem: (item: BostonStockItem) => void;
  onAddItem: (item: Omit<BostonStockItem, 'id' | 'sNo'>) => void;
}

export const BostonStockView: React.FC<BostonStockViewProps> = ({
  items,
  role,
  onUpdateItem,
  onAddItem
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Available' | 'Reserved for Exchange' | 'Inspection Pending'>('ALL');
  const [conditionFilter, setConditionFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [isAdding, setIsAdding] = useState(false);
  const [reallocatingItem, setReallocatingItem] = useState<BostonStockItem | null>(null);
  const [reallocateOrderId, setReallocateOrderId] = useState('');

  // Add Item form state
  const [form, setForm] = useState({
    shoeModel: '',
    size: 'US 9.5 D',
    widthOrLast: 'Standard D',
    colorLeather: 'French Box Calf Black',
    condition: 'Pristine / Like New' as BostonStockItem['condition'],
    originalOrderId: '',
    clientName: '',
    dateReceived: new Date().toISOString().split('T')[0],
    storageLocation: 'Boston Hub - Rack B1',
    status: 'Available' as BostonStockItem['status'],
    notes: ''
  });

  const canEdit = role === 'admin' || role === 'logistics';

  // Stats calculation
  const totalPairs = items.length;
  const availablePairs = items.filter(i => i.status === 'Available').length;
  const reservedPairs = items.filter(i => i.status === 'Reserved for Exchange').length;
  const inspectionPairs = items.filter(i => i.status === 'Inspection Pending').length;

  const filteredItems = items.filter(item => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    if (conditionFilter !== 'ALL' && item.condition !== conditionFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchModel = (item.shoeModel || '').toLowerCase().includes(q);
      const matchSize = (item.size || '').toLowerCase().includes(q);
      const matchOrder = (item.originalOrderId || '').toLowerCase().includes(q);
      const matchClient = (item.clientName || '').toLowerCase().includes(q);
      const matchLeather = (item.colorLeather || '').toLowerCase().includes(q);
      return matchModel || matchSize || matchOrder || matchClient || matchLeather;
    }
    return true;
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.shoeModel || !form.size) return;
    onAddItem(form);
    setIsAdding(false);
    setForm({
      shoeModel: '',
      size: 'US 9.5 D',
      widthOrLast: 'Standard D',
      colorLeather: 'French Box Calf Black',
      condition: 'Pristine / Like New',
      originalOrderId: '',
      clientName: '',
      dateReceived: new Date().toISOString().split('T')[0],
      storageLocation: 'Boston Hub - Rack B1',
      status: 'Available',
      notes: ''
    });
  };

  const handleConfirmReallocation = () => {
    if (!reallocatingItem || !reallocateOrderId) return;
    const updated: BostonStockItem = {
      ...reallocatingItem,
      status: 'Reserved for Exchange',
      reallocatedToOrderId: reallocateOrderId.trim().toUpperCase(),
      notes: `${reallocatingItem.notes ? reallocatingItem.notes + ' | ' : ''}Reallocated to exchange order ${reallocateOrderId.trim().toUpperCase()} on ${new Date().toLocaleDateString('en-GB')}`
    };
    onUpdateItem(updated);
    setReallocatingItem(null);
    setReallocateOrderId('');
  };

  const handleMarkAvailable = (item: BostonStockItem) => {
    onUpdateItem({
      ...item,
      status: 'Available',
      reallocatedToOrderId: undefined
    });
  };

  return (
    <div className="space-y-4">
      {/* Boston Inventory Highlights Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white/80 border border-neutral-200/80 rounded-2xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-500 mb-1">
            <span className="text-xs font-medium">Boston Inventory</span>
            <Warehouse className="w-4 h-4 text-neutral-600" />
          </div>
          <div className="text-xl font-bold text-neutral-900">{totalPairs}</div>
          <p className="text-[11px] text-neutral-400 mt-0.5">Total logged pairs</p>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-2xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-xs font-medium">Available to Re-use</span>
            <Sparkles className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold text-emerald-900">{availablePairs}</div>
          <p className="text-[11px] text-emerald-600 mt-0.5">Ready for immediate exchange</p>
        </div>

        <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-xs font-medium">Reserved for Orders</span>
            <ArrowRightLeft className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-bold text-amber-900">{reservedPairs}</div>
          <p className="text-[11px] text-amber-600 mt-0.5">Allocated to US exchanges</p>
        </div>

        <div className="bg-blue-50/70 border border-blue-200/60 rounded-2xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-blue-700 mb-1">
            <span className="text-xs font-medium">Under Inspection</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-blue-900">{inspectionPairs}</div>
          <p className="text-[11px] text-blue-600 mt-0.5">Condition check &amp; polishing</p>
        </div>
      </div>

      {/* Control bar: Search, filters, Add */}
      <div className="bg-white/60 border border-neutral-200/70 rounded-2xl p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search model, size, leather, original order or client..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
                statusFilter === 'ALL'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              All ({totalPairs})
            </button>
            <button
              onClick={() => setStatusFilter('Available')}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
                statusFilter === 'Available'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Available ({availablePairs})
            </button>
            <button
              onClick={() => setStatusFilter('Reserved for Exchange')}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
                statusFilter === 'Reserved for Exchange'
                  ? 'bg-amber-700 text-white'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              Reserved ({reservedPairs})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
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

          <button
            onClick={() => exportToCsv(items, `BLKBRD_Boston_Stock_Inventory_${new Date().toISOString().split('T')[0]}.csv`)}
            className="px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Export Boston Stock to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>

          {canEdit && (
            <button
              onClick={() => setIsAdding(true)}
              className="px-3 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Log Returned Pair
            </button>
          )}
        </div>
      </div>

      {/* Add pair modal / panel */}
      {isAdding && (
        <div className="bg-white border border-neutral-300 rounded-2xl p-4 shadow-md">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-3">
            <h4 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-neutral-700" />
              Log Returned Pair Received at Boston Location
            </h4>
            <button
              onClick={() => setIsAdding(false)}
              className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleAddSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">Shoe Model / Style *</label>
              <input
                type="text"
                required
                placeholder="e.g. Dixon Chelsea, Henrik Loafer"
                value={form.shoeModel}
                onChange={e => setForm({ ...form, shoeModel: e.target.value })}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">Size &amp; Width *</label>
              <input
                type="text"
                required
                placeholder="e.g. US 9.5 D or UK 8.5"
                value={form.size}
                onChange={e => setForm({ ...form, size: e.target.value })}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">Leather / Color</label>
              <input
                type="text"
                placeholder="e.g. Cognac Badalassi, Black Calf"
                value={form.colorLeather}
                onChange={e => setForm({ ...form, colorLeather: e.target.value })}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">Condition</label>
              <select
                value={form.condition}
                onChange={e => setForm({ ...form, condition: e.target.value as any })}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                <option value="Pristine / Like New">Pristine / Like New</option>
                <option value="Minor Creasing / Try-on">Minor Creasing / Try-on</option>
                <option value="Refurbished">Refurbished</option>
                <option value="Needs Polish">Needs Polish</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">Original Order ID</label>
              <input
                type="text"
                placeholder="e.g. USBLKBRD6900"
                value={form.originalOrderId}
                onChange={e => setForm({ ...form, originalOrderId: e.target.value })}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg uppercase"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">Customer / Returner</label>
              <input
                type="text"
                placeholder="Customer full name"
                value={form.clientName}
                onChange={e => setForm({ ...form, clientName: e.target.value })}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">Storage Location in Boston</label>
              <input
                type="text"
                placeholder="e.g. Boston Hub - Rack B1"
                value={form.storageLocation}
                onChange={e => setForm({ ...form, storageLocation: e.target.value })}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">Date Received</label>
              <input
                type="date"
                value={form.dateReceived}
                onChange={e => setForm({ ...form, dateReceived: e.target.value })}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">Initial Status</label>
              <select
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value as any })}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                <option value="Available">Available (Can be re-allocated)</option>
                <option value="Inspection Pending">Inspection Pending</option>
                <option value="Reserved for Exchange">Reserved for Exchange</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] font-medium text-neutral-600 mb-1">Inspection Notes / Remarks</label>
              <input
                type="text"
                placeholder="e.g. Sole protector in place, spare laces inside box."
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg cursor-pointer flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                Save to Boston Stock
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reallocation Dialog */}
      {reallocatingItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl max-w-md w-full p-5 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900">Re-allocate Pair for Exchange</h4>
                  <p className="text-[11px] text-neutral-500">Dispatch directly from Boston Hub</p>
                </div>
              </div>
              <button
                onClick={() => setReallocatingItem(null)}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100 text-xs space-y-1">
                <div className="font-semibold text-neutral-900">{reallocatingItem.shoeModel}</div>
                <div className="text-neutral-600">
                  Size: <span className="font-medium text-neutral-800">{reallocatingItem.size}</span> ({reallocatingItem.widthOrLast || 'Standard'}) • {reallocatingItem.colorLeather}
                </div>
                <div className="text-neutral-500 text-[11px]">
                  Condition: {reallocatingItem.condition} • Located: {reallocatingItem.storageLocation}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Target Customer Exchange Order ID *
                </label>
                <input
                  type="text"
                  placeholder="e.g. USBLKBRD7151 or BLKBRD9480"
                  value={reallocateOrderId}
                  onChange={e => setReallocateOrderId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg uppercase font-mono focus:ring-1 focus:ring-neutral-900 focus:outline-none"
                  autoFocus
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  This pair will be reserved in Boston and marked ready for rapid US customer fulfillment.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                onClick={() => setReallocatingItem(null)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReallocation}
                disabled={!reallocateOrderId.trim()}
                className="px-4 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Confirm Re-allocation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content: Cards vs Table */}
      {viewMode === 'cards' ? (
        <div className="p-3.5 sm:p-5 bg-neutral-50/60 rounded-2xl border border-neutral-200/80">
          {filteredItems.length === 0 ? (
            <div className="py-14 text-center text-neutral-500 text-xs bg-white rounded-2xl border border-neutral-200/80 p-6">
              <Warehouse className="w-8 h-8 mx-auto mb-2 text-neutral-300 stroke-[1.5]" />
              <p className="font-semibold text-neutral-700">No shoes found in Boston Stock inventory matching criteria.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredItems.map(item => {
                const isAvailable = item.status === 'Available';
                const isReserved = item.status === 'Reserved for Exchange';
                const isInspection = item.status === 'Inspection Pending';

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-white border border-neutral-200/80 shadow-2xs hover:shadow-md transition duration-150 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-sm text-neutral-900">{item.shoeModel}</h4>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="inline-block font-mono font-bold text-xs px-2 py-0.5 bg-neutral-100 rounded-md text-neutral-800 border border-neutral-200">
                              {item.size}
                            </span>
                            {item.widthOrLast && (
                              <span className="text-[11px] font-medium text-neutral-500">
                                ({item.widthOrLast})
                              </span>
                            )}
                          </div>
                        </div>

                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          item.condition.includes('Pristine')
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.condition.includes('Creasing')
                            ? 'bg-blue-100 text-blue-800'
                            : item.condition.includes('Refurbished')
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {item.condition}
                        </span>
                      </div>

                      {/* Spec & Leather */}
                      <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-100 text-xs space-y-1.5">
                        <div>
                          <span className="text-[10px] font-semibold uppercase text-neutral-400 block">Leather &amp; Color</span>
                          <span className="font-medium text-neutral-800">{item.colorLeather}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-200/60">
                          <div>
                            <span className="text-[10px] font-semibold uppercase text-neutral-400 block">Original Order</span>
                            <span className="font-mono text-[11px] font-bold text-neutral-700">{item.originalOrderId}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-semibold uppercase text-neutral-400 block">Customer</span>
                            <span className="text-[11px] font-medium text-neutral-700 truncate block">{item.clientName || '—'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Location & Status Banner */}
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-100/70 border border-neutral-200/60 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Warehouse className="w-3.5 h-3.5 text-neutral-500" />
                          <span className="text-[11px] font-medium text-neutral-700">{item.storageLocation}</span>
                        </div>
                        <div>
                          {isAvailable && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Available
                            </span>
                          )}
                          {isReserved && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              Reserved
                            </span>
                          )}
                          {isInspection && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                              <Clock className="w-2.5 h-2.5" />
                              Inspection
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Notes */}
                      {item.notes && (
                        <p className="text-[11px] text-neutral-500 bg-white p-2 rounded-lg border border-neutral-100 line-clamp-2">
                          {item.notes}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    {canEdit && (
                      <div className="pt-2 border-t border-neutral-100 flex items-center justify-end gap-2">
                        {isAvailable ? (
                          <button
                            type="button"
                            onClick={() => setReallocatingItem(item)}
                            className="w-full py-1.5 px-3 text-xs font-semibold text-amber-900 bg-amber-100/80 hover:bg-amber-200 border border-amber-300/80 rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5 text-amber-700" />
                            <span>Re-allocate for Exchange</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleMarkAvailable(item)}
                            className="w-full py-1.5 px-3 text-xs font-semibold text-emerald-900 bg-emerald-100/80 hover:bg-emerald-200 border border-emerald-300/80 rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Mark Available</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Inventory Table */
        <div className="bg-white/80 border border-neutral-200/80 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200/80 bg-neutral-50/70 text-[11px] font-semibold text-neutral-600 uppercase tracking-wider">
                <th className="py-3 px-3.5">Shoe Model &amp; Style</th>
                <th className="py-3 px-3.5">Size &amp; Width</th>
                <th className="py-3 px-3.5">Leather / Spec</th>
                <th className="py-3 px-3.5">Condition</th>
                <th className="py-3 px-3.5">Original Order / Client</th>
                <th className="py-3 px-3.5">Location &amp; Received</th>
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-neutral-500 text-xs">
                    No shoes found in Boston Stock inventory matching criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                  const isAvailable = item.status === 'Available';
                  const isReserved = item.status === 'Reserved for Exchange';
                  const isInspection = item.status === 'Inspection Pending';

                  return (
                    <tr key={item.id} className="hover:bg-neutral-50/60 transition-colors">
                      <td className="py-3 px-3.5 font-medium text-neutral-900">
                        <div>{item.shoeModel}</div>
                        {item.notes && (
                          <div className="text-[11px] text-neutral-400 mt-0.5 line-clamp-1">{item.notes}</div>
                        )}
                      </td>
                      <td className="py-3 px-3.5">
                        <span className="inline-block font-mono font-semibold px-2 py-0.5 bg-neutral-100 rounded-md text-neutral-800">
                          {item.size}
                        </span>
                        {item.widthOrLast && (
                          <div className="text-[10px] text-neutral-500 mt-0.5">{item.widthOrLast}</div>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-neutral-600">
                        {item.colorLeather}
                      </td>
                      <td className="py-3 px-3.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          item.condition.includes('Pristine')
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.condition.includes('Creasing')
                            ? 'bg-blue-100 text-blue-800'
                            : item.condition.includes('Refurbished')
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {item.condition}
                        </span>
                      </td>
                      <td className="py-3 px-3.5">
                        <div className="font-mono text-[11px] text-neutral-700">{item.originalOrderId}</div>
                        <div className="text-[11px] text-neutral-500">{item.clientName}</div>
                      </td>
                      <td className="py-3 px-3.5 text-neutral-600">
                        <div className="text-[11px] font-medium text-neutral-800">{item.storageLocation}</div>
                        <div className="text-[10px] text-neutral-400">{item.dateReceived}</div>
                      </td>
                      <td className="py-3 px-3.5">
                        {isAvailable && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Available
                          </span>
                        )}
                        {isReserved && (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              Reserved
                            </span>
                            {item.reallocatedToOrderId && (
                              <div className="text-[10px] font-mono text-amber-700 mt-0.5">
                                For: {item.reallocatedToOrderId}
                              </div>
                            )}
                          </div>
                        )}
                        {isInspection && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                            <Clock className="w-2.5 h-2.5" />
                            Inspection
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        {canEdit && (
                          <div className="flex items-center justify-end gap-1.5">
                            {isAvailable ? (
                              <button
                                onClick={() => setReallocatingItem(item)}
                                className="px-2.5 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg cursor-pointer flex items-center gap-1"
                                title="Re-allocate this pair for an exchange order"
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                                Re-allocate Pair
                              </button>
                            ) : (
                              <button
                                onClick={() => handleMarkAvailable(item)}
                                className="px-2.5 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer flex items-center gap-1"
                                title="Mark this pair back to Available"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Mark Available
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
};
