import React, { useState, useEffect } from 'react';
import { TableSchemaConfig, SchemaField, SchemaColumnType } from '../types';
import {
  getDefaultTableConfig,
  getStoredTableConfig,
  saveStoredTableConfig,
  applyUseCasePreset,
  generateSupabaseTableSql,
  generateFullSupabaseSchemaSql,
  generatePendingSupabaseSchemaSql,
  checkSupabaseTableStatus,
  checkAllSupabaseTablesStatus,
  USE_CASE_PRESETS
} from '../services/schemaConfigService';
import {
  X,
  Database,
  Check,
  Copy,
  Plus,
  Trash2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Lock,
  Code,
  Sliders,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Layers,
  ArrowRight,
  FileCode,
  Activity,
  Users,
  AlertTriangle
} from 'lucide-react';

export type CustomizableTableKey = 
  | 'order_audit_events'
  | 'production_remarks'
  | 'customers_crm'
  | 'delinquency_global'
  | 'delinquency_llc';

interface TableSchemaCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTableKey?: CustomizableTableKey;
  onSchemaUpdated?: (config: TableSchemaConfig) => void;
}

export const TableSchemaCustomizerModal: React.FC<TableSchemaCustomizerModalProps> = ({
  isOpen,
  onClose,
  initialTableKey = 'order_audit_events',
  onSchemaUpdated
}) => {
  const [activeTableKey, setActiveTableKey] = useState<CustomizableTableKey>(initialTableKey);
  const [config, setConfig] = useState<TableSchemaConfig>(() => getStoredTableConfig(initialTableKey));
  const [activeTab, setActiveTab] = useState<'elements' | 'sql' | 'pending_schema' | 'full_schema' | 'all_tables'>('elements');
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedPendingSql, setCopiedPendingSql] = useState(false);
  const [copiedFullSql, setCopiedFullSql] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Custom Field Form State
  const [isAddingField, setIsAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<SchemaColumnType>('text');
  const [newFieldDescription, setNewFieldDescription] = useState('');

  // Supabase Verification State
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<{
    exists?: boolean;
    message?: string;
    sampleCount?: number;
  } | null>(null);

  // All Tables Health State
  const [checkingAllTables, setCheckingAllTables] = useState(false);
  const [allTablesStatus, setAllTablesStatus] = useState<Record<string, { exists: boolean; message: string; sampleCount?: number }> | null>(null);

  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const currentKey = activeTableKey || initialTableKey || 'order_audit_events';
      const loaded = getStoredTableConfig(currentKey);
      setConfig(loaded);
      verifyTable(loaded.tableName);
      if (activeTab === 'all_tables') {
        verifyAllTables();
      }
    }
  }, [isOpen, activeTableKey]);

  const verifyTable = async (tableName: string) => {
    setCheckingStatus(true);
    try {
      const res = await checkSupabaseTableStatus(tableName);
      setSupabaseStatus(res);
    } catch (err: any) {
      setSupabaseStatus({ exists: false, message: err.message });
    } finally {
      setCheckingStatus(false);
    }
  };

  const verifyAllTables = async () => {
    setCheckingAllTables(true);
    try {
      const results = await checkAllSupabaseTablesStatus();
      setAllTablesStatus(results);
    } catch (err: any) {
      console.warn('Failed checking all tables:', err);
    } finally {
      setCheckingAllTables(false);
    }
  };

  if (!isOpen) return null;

  const handleSelectTable = (key: CustomizableTableKey) => {
    setActiveTableKey(key);
    const loaded = getStoredTableConfig(key);
    setConfig(loaded);
    verifyTable(loaded.tableName);
  };

  const handleSelectPreset = (presetId: 'standard' | 'bespoke_qc' | 'logistics_escalation' | 'custom') => {
    const updated = applyUseCasePreset(config, presetId);
    setConfig(updated);
  };

  const handleToggleField = (fieldId: string) => {
    const updatedFields = config.fields.map(f => {
      if (f.id === fieldId) {
        if (f.required) return f;
        return { ...f, enabled: !f.enabled };
      }
      return f;
    });

    setConfig({
      ...config,
      activeUseCase: 'custom',
      fields: updatedFields
    });
  };

  const handleAddField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim()) return;

    const sanitizedName = newFieldName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');

    const newField: SchemaField = {
      id: `custom_${Date.now()}`,
      name: sanitizedName,
      label: newFieldLabel.trim() || sanitizedName,
      type: newFieldType,
      required: false,
      enabled: true,
      description: newFieldDescription.trim() || 'Custom user-defined operational element',
      useCases: ['custom'],
      isCustom: true
    };

    setConfig({
      ...config,
      activeUseCase: 'custom',
      fields: [...config.fields, newField]
    });

    setNewFieldName('');
    setNewFieldLabel('');
    setNewFieldDescription('');
    setIsAddingField(false);
  };

  const handleDeleteCustomField = (fieldId: string) => {
    setConfig({
      ...config,
      fields: config.fields.filter(f => f.id !== fieldId)
    });
  };

  const handleSave = () => {
    saveStoredTableConfig(config);
    if (onSchemaUpdated) {
      onSchemaUpdated(config);
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleReset = () => {
    if (window.confirm('Reset this table schema to standard default elements?')) {
      const def = getDefaultTableConfig(activeTableKey);
      setConfig(def);
      saveStoredTableConfig(def);
      if (onSchemaUpdated) onSchemaUpdated(def);
    }
  };

  const sqlCode = generateSupabaseTableSql(config);
  const pendingSqlCode = generatePendingSupabaseSchemaSql();
  const fullSqlCode = generateFullSupabaseSchemaSql();

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlCode);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleCopyPendingSql = () => {
    navigator.clipboard.writeText(pendingSqlCode);
    setCopiedPendingSql(true);
    setTimeout(() => setCopiedPendingSql(false), 2000);
  };

  const handleCopyFullSql = () => {
    navigator.clipboard.writeText(fullSqlCode);
    setCopiedFullSql(true);
    setTimeout(() => setCopiedFullSql(false), 2000);
  };

  const filteredFields = config.fields.filter(f => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return f.name.toLowerCase().includes(q) || f.label.toLowerCase().includes(q) || f.description.toLowerCase().includes(q);
  });

  const enabledCount = config.fields.filter(f => f.enabled).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-2.5 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div className="glass-panel rounded-3xl border border-white/80 shadow-2xl max-w-4xl w-full flex flex-col max-h-[92vh] overflow-hidden bg-white/95 my-auto">
        {/* Header */}
        <div className="p-3.5 sm:p-5 border-b border-neutral-200/70 bg-gradient-to-r from-neutral-50 to-neutral-100/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-neutral-900 text-white flex items-center justify-center shrink-0 shadow-md">
              <Database className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base md:text-lg font-bold text-neutral-900 truncate">Customise Database Tables</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200 shrink-0">
                  Supabase Live
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-neutral-500 mt-0.5 line-clamp-1 sm:line-clamp-none">
                Choose, toggle, or add custom elements for audit journey logs and workshop remarks by use case.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {savedSuccess && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium animate-in fade-in duration-150">
                <Check className="w-3.5 h-3.5" /> Saved!
              </span>
            )}
            <button
              onClick={handleSave}
              className="bg-neutral-900 hover:bg-neutral-800 text-white px-3.5 sm:px-4 py-2 rounded-full text-xs font-semibold transition cursor-pointer shadow-xs min-h-[38px] active:scale-95"
            >
              Save Schema
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/50 transition cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Table Selector & Sub-Tabs with Smooth Horizontal Scrolling */}
        <div className="bg-neutral-100/70 px-3 sm:px-6 pt-2.5 pb-2 border-b border-neutral-200/60 space-y-2">
          {/* Row 1: Tables */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <button
              type="button"
              onClick={() => handleSelectTable('order_audit_events')}
              className={`pb-2 px-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTableKey === 'order_audit_events'
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>Order Journey</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-700">
                order_audit_events
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTable('production_remarks')}
              className={`pb-2 px-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTableKey === 'production_remarks'
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 shrink-0" />
              <span>Remarks</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-700">
                production_remarks
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTable('customers_crm')}
              className={`pb-2 px-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTableKey === 'customers_crm'
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Customers CRM</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-teal-100 text-teal-800">
                customers_crm
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTable('delinquency_global')}
              className={`pb-2 px-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTableKey === 'delinquency_global'
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Global Orders</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-700">
                delinquency_global
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTable('delinquency_llc')}
              className={`pb-2 px-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTableKey === 'delinquency_llc'
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>LLC Orders</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-700">
                delinquency_llc
              </span>
            </button>
          </div>

          {/* Row 2: Sub-Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <button
              type="button"
              onClick={() => setActiveTab('elements')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'elements' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Elements ({enabledCount}/{config.fields.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sql')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                activeTab === 'sql' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Code className="w-3 h-3 shrink-0" />
              <span>Table SQL</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pending_schema')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeTab === 'pending_schema'
                  ? 'bg-amber-400 text-neutral-950 shadow-xs'
                  : 'text-amber-800 hover:text-amber-950 bg-amber-100/90 border border-amber-300/80'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
              <span>Pending Tables (4) SQL</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('full_schema')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                activeTab === 'full_schema' ? 'bg-neutral-900 text-white shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900 bg-neutral-200/60'
              }`}
            >
              <FileCode className="w-3 h-3 text-amber-300 shrink-0" />
              <span>Full 12-Table Schema</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('all_tables');
                verifyAllTables();
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                activeTab === 'all_tables' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Activity className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>Supabase Health</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Use Case Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Select Use Case Preset
              </label>
              <span className="text-[11px] text-neutral-500">
                Click any preset to automatically configure recommended elements
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {USE_CASE_PRESETS.map(preset => {
                const isSelected = config.activeUseCase === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`p-3 rounded-2xl text-left transition border cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-neutral-900 bg-neutral-900 text-white shadow-md'
                        : 'border-neutral-200/80 bg-white/70 hover:border-neutral-400 text-neutral-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'
                        }`}>
                          {preset.badge}
                        </span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      <div className={`text-xs font-bold mt-1 ${isSelected ? 'text-white' : 'text-neutral-900'}`}>
                        {preset.title}
                      </div>
                      <p className={`text-[11px] mt-1 leading-relaxed line-clamp-3 ${isSelected ? 'text-neutral-300' : 'text-neutral-500'}`}>
                        {preset.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab 1: Elements Customizer */}
          {activeTab === 'elements' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2">
                <div>
                  <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                    Customise Table Elements ({enabledCount} Enabled)
                  </h3>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Toggle columns on or off, add custom columns, and define data types for your shoemaking workflow.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Filter elements..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="glass-input rounded-xl px-3 py-1.5 text-xs focus:outline-hidden w-40 sm:w-48"
                  />
                  <button
                    type="button"
                    onClick={() => setIsAddingField(!isAddingField)}
                    className="inline-flex items-center gap-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer border border-neutral-300/80"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Custom Column</span>
                  </button>
                </div>
              </div>

              {/* Add Custom Field Form */}
              {isAddingField && (
                <form
                  onSubmit={handleAddField}
                  className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-3 animate-in fade-in duration-150"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900">Define New Custom Column</span>
                    <button
                      type="button"
                      onClick={() => setIsAddingField(false)}
                      className="text-neutral-400 hover:text-neutral-700 text-xs"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">
                        Column Name (Postgres) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. artisan_bench_no"
                        value={newFieldName}
                        onChange={e => setNewFieldName(e.target.value)}
                        className="w-full glass-input rounded-xl px-3 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">
                        Display Label *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Artisan Bench #"
                        value={newFieldLabel}
                        onChange={e => setNewFieldLabel(e.target.value)}
                        className="w-full glass-input rounded-xl px-3 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">
                        Data Type
                      </label>
                      <select
                        value={newFieldType}
                        onChange={e => setNewFieldType(e.target.value as SchemaColumnType)}
                        className="w-full glass-input rounded-xl px-3 py-1.5 text-xs font-mono"
                      >
                        <option value="text">TEXT (String / Remarks)</option>
                        <option value="varchar">VARCHAR(255) (Short Code)</option>
                        <option value="boolean">BOOLEAN (Yes / No Flag)</option>
                        <option value="integer">INTEGER (Counter / Number)</option>
                        <option value="timestamp">TIMESTAMP WITH TIME ZONE</option>
                        <option value="jsonb">JSONB (Nested Object / Tags)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">
                      Use Case / Column Purpose
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Tracks specific workbench or machine responsible for lasting step"
                      value={newFieldDescription}
                      onChange={e => setNewFieldDescription(e.target.value)}
                      className="w-full glass-input rounded-xl px-3 py-1.5 text-xs"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="submit"
                      className="bg-neutral-900 text-white px-4 py-1.5 rounded-full text-xs font-medium hover:bg-neutral-800 transition cursor-pointer"
                    >
                      Append Column to Schema
                    </button>
                  </div>
                </form>
              )}

              {/* Elements Table */}
              <div className="border border-neutral-200/80 rounded-2xl overflow-hidden bg-white/60">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-neutral-100/70 border-b border-neutral-200 text-neutral-500 font-semibold text-[10px] uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-12 text-center">Enable</th>
                      <th className="py-2.5 px-3">Column Name</th>
                      <th className="py-2.5 px-3">Display Label</th>
                      <th className="py-2.5 px-3">Postgres Type</th>
                      <th className="py-2.5 px-3">Description / Use Case</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 font-sans">
                    {filteredFields.map(field => {
                      return (
                        <tr
                          key={field.id}
                          className={`transition ${field.enabled ? 'hover:bg-neutral-50/80' : 'bg-neutral-50/40 opacity-60'}`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            {field.required ? (
                              <span title="Required primary column" className="inline-flex items-center justify-center text-neutral-400">
                                <Lock className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={field.enabled}
                                onChange={() => handleToggleField(field.id)}
                                className="w-4 h-4 rounded text-neutral-900 focus:ring-neutral-900 border-neutral-300 cursor-pointer"
                              />
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-neutral-900 whitespace-nowrap">
                            {field.name}
                            {field.required && (
                              <span className="text-amber-600 ml-1 text-[11px]" title="Required">*</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-neutral-800 whitespace-nowrap">
                            {field.label}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
                              {field.type.toUpperCase()}
                            </span>
                            {field.options && field.options.length > 0 && (
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200 ml-1">
                                DROPDOWN ({field.options.length})
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-neutral-600 text-[11px] max-w-sm">
                            <div>{field.description}</div>
                            {field.options && field.options.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                                <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Dropdown Choices:</span>
                                {field.options.map(opt => (
                                  <span key={opt} className="inline-block px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-medium">
                                    {opt}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            {field.isCustom ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomField(field.id)}
                                className="text-red-500 hover:text-red-700 p-1 rounded-lg transition"
                                title="Delete custom field"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="text-[10px] text-neutral-400 font-mono">System</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 2: SQL DDL Script */}
          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                    PostgreSQL Schema for Supabase
                  </h3>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    This SQL creates or adapts <code className="font-mono font-bold text-neutral-800">public.{config.tableName}</code> with your selected elements, indexes, and Row-Level Security policies.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCopySql}
                  className="inline-flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 text-white px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer shadow-xs"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy SQL Script</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950 text-neutral-200 p-4 font-mono text-xs leading-relaxed max-h-[380px] overflow-y-auto">
                <pre>{sqlCode}</pre>
              </div>

              <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200/80 text-xs text-blue-900 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">How to apply this in your Supabase Project:</div>
                  <ol className="list-decimal list-inside mt-1 space-y-0.5 text-[11px] text-blue-800">
                    <li>Click <strong>"Copy SQL Script"</strong> above.</li>
                    <li>Open your Supabase dashboard at <strong>https://supabase.com/dashboard</strong>.</li>
                    <li>Click the <strong>SQL Editor</strong> tab on the left sidebar.</li>
                    <li>Paste this code and click <strong>"Run"</strong>.</li>
                    <li>Return here and click <strong>"Verify Supabase Connection"</strong> below!</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Pending Tables Only Supabase Schema */}
          {activeTab === 'pending_schema' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 p-4 rounded-2xl shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold tracking-tight text-neutral-950 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-neutral-950" />
                      <span>Pending Supabase Tables DDL (4 Tables)</span>
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-950/10 text-neutral-950 border border-neutral-950/20 font-bold">
                      Ready to Run
                    </span>
                  </div>
                  <p className="text-xs text-neutral-900 mt-1 max-w-xl font-medium">
                    This script creates only the 4 pending tables: <code className="font-mono font-bold">customers_crm</code>, <code className="font-mono font-bold">order_audit_events</code>, <code className="font-mono font-bold">production_remarks</code>, and <code className="font-mono font-bold">shopify_orders</code> with dedicated indexes and RLS policies.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyPendingSql}
                    className="inline-flex items-center justify-center gap-2 bg-neutral-950 hover:bg-neutral-900 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer shadow-md"
                  >
                    {copiedPendingSql ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Copied Pending SQL!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Pending SQL</span>
                      </>
                    )}
                  </button>

                  <a
                    href="https://supabase.com/dashboard/project/sdkqxjqemomwgveydbfv/sql/new"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 bg-white/90 hover:bg-white text-neutral-900 font-bold px-3.5 py-2.5 rounded-xl text-xs transition cursor-pointer shadow-sm"
                  >
                    <span>Open Supabase SQL Editor</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950 text-neutral-200 p-4 font-mono text-xs leading-relaxed max-h-[380px] overflow-y-auto">
                <pre>{pendingSqlCode}</pre>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 text-xs">
                  <div className="font-bold text-neutral-900 flex items-center gap-1.5 mb-1">
                    <span className="w-4 h-4 rounded-full bg-amber-600 text-white inline-flex items-center justify-center text-[10px] font-bold">1</span>
                    Copy Pending SQL
                  </div>
                  <p className="text-[11px] text-neutral-600">
                    Click <strong>"Copy Pending SQL"</strong> above to grab the focused DDL script.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 text-xs">
                  <div className="font-bold text-neutral-900 flex items-center gap-1.5 mb-1">
                    <span className="w-4 h-4 rounded-full bg-amber-600 text-white inline-flex items-center justify-center text-[10px] font-bold">2</span>
                    Run in Supabase
                  </div>
                  <p className="text-[11px] text-neutral-600">
                    Click <strong>"Open Supabase SQL Editor"</strong>, paste the script into the query box, and click <strong>"Run"</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 text-xs">
                  <div className="font-bold text-neutral-900 flex items-center gap-1.5 mb-1">
                    <span className="w-4 h-4 rounded-full bg-amber-600 text-white inline-flex items-center justify-center text-[10px] font-bold">3</span>
                    Verify Health
                  </div>
                  <p className="text-[11px] text-neutral-600">
                    Switch to the <strong>"Supabase Health"</strong> tab and click <strong>"Re-verify All Tables"</strong> to see all 12 operational tables turn green!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Complete Unified Supabase Schema (12 Tables) */}
          {activeTab === 'full_schema' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-900 text-white p-4 rounded-2xl">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-amber-400" />
                      <span>Unified Supabase Schema (All 12 Tables)</span>
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                      Production Ready DDL
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1 max-w-xl">
                    Run this single idempotent script in your Supabase SQL Editor to provision all missing tables, add dedicated columns with safe <code className="text-amber-200">ALTER TABLE ... ADD COLUMN IF NOT EXISTS</code> migrations, set up indexes, and enable RLS policies.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCopyFullSql}
                  className="inline-flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer shadow-md shrink-0"
                >
                  {copiedFullSql ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-950" />
                      <span>Copied 12-Table Schema!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-neutral-950" />
                      <span>Copy Full 12-Table Schema</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950 text-neutral-200 p-4 font-mono text-xs leading-relaxed max-h-[380px] overflow-y-auto">
                <pre>{fullSqlCode}</pre>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs">
                  <div className="font-bold text-neutral-900 flex items-center gap-1.5 mb-1">
                    <span className="w-4 h-4 rounded-full bg-neutral-900 text-white inline-flex items-center justify-center text-[10px]">1</span>
                    Copy Script
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Click <strong>"Copy Full 12-Table Schema"</strong> to grab the complete idempotent PostgreSQL code.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs">
                  <div className="font-bold text-neutral-900 flex items-center gap-1.5 mb-1">
                    <span className="w-4 h-4 rounded-full bg-neutral-900 text-white inline-flex items-center justify-center text-[10px]">2</span>
                    Paste in Supabase
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Go to <strong>Supabase Dashboard → SQL Editor → New Query</strong>, paste the script, and press <strong>"Run"</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs">
                  <div className="font-bold text-neutral-900 flex items-center gap-1.5 mb-1">
                    <span className="w-4 h-4 rounded-full bg-neutral-900 text-white inline-flex items-center justify-center text-[10px]">3</span>
                    Instant Verification
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Switch to the <strong>"Supabase Health"</strong> tab right here to verify all 12 operational tables turn green!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: All Tables Supabase Health Inspector */}
          {activeTab === 'all_tables' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-600" />
                    <span>Supabase Live Table Health (12 Operational Tables)</span>
                  </h3>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Real-time connectivity status across all store, CRM, production, logistics, and dispatch tables.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={verifyAllTables}
                  disabled={checkingAllTables}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-white transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingAllTables ? 'animate-spin' : ''}`} />
                  <span>{checkingAllTables ? 'Checking Live Database...' : 'Re-verify All Tables'}</span>
                </button>
              </div>

              {/* Alert banner for pending tables or all green status */}
              {allTablesStatus && Object.values(allTablesStatus).every((s: { exists: boolean }) => s?.exists) ? (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-bold text-emerald-950 block">
                        All 12 Database Tables Verified & Active in Supabase
                      </span>
                      <p className="text-[11px] text-emerald-800 mt-0.5">
                        Live PostgreSQL tables including <code className="font-mono font-bold">customers_crm</code>, <code className="font-mono font-bold">order_audit_events</code>, <code className="font-mono font-bold">production_remarks</code>, and <code className="font-mono font-bold">shopify_orders</code> are connected and actively syncing.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                      100% Operational
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-bold text-neutral-900 block">
                        {allTablesStatus
                          ? `${Object.entries(allTablesStatus).filter(([_, s]: [string, any]) => !s?.exists).length} Pending Table(s) Incomplete in Supabase`
                          : 'Checking Supabase Schema Tables'}
                      </span>
                      <p className="text-[11px] text-neutral-600 mt-0.5">
                        {allTablesStatus
                          ? Object.entries(allTablesStatus)
                              .filter(([_, s]: [string, any]) => !s?.exists)
                              .map(([t]) => t)
                              .join(', ') + ' have not been verified in Supabase yet.'
                          : 'Checking table connectivity with live database...'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab('pending_schema')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-neutral-950 transition cursor-pointer shadow-xs"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>View & Copy Pending SQL</span>
                    </button>
                    <a
                      href="https://supabase.com/dashboard/project/sdkqxjqemomwgveydbfv/sql/new"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 transition cursor-pointer"
                    >
                      <span>Supabase SQL Editor</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { table: 'delinquency_global', label: 'Delinquency Global (INR)', category: 'Orders' },
                  { table: 'delinquency_llc', label: 'Delinquency LLC (USD)', category: 'Orders' },
                  { table: 'customers_crm', label: 'Customers CRM Hub', category: 'CRM' },
                  { table: 'order_audit_events', label: 'Order Journey & Stages', category: 'Audit' },
                  { table: 'production_remarks', label: 'Workshop Remarks', category: 'Production' },
                  { table: 'returns_global', label: 'Returns Global Tracker', category: 'Returns' },
                  { table: 'returns_llc', label: 'Returns LLC (US) Tracker', category: 'Returns' },
                  { table: 'return_stock_in', label: 'Return Stock India', category: 'Warehouse' },
                  { table: 'return_stock_us', label: 'Return Stock Boston/US', category: 'Warehouse' },
                  { table: 'daily_dispatches', label: 'Daily Dispatches & AWBs', category: 'Logistics' },
                  { table: 'trial_pairs', label: 'Trial Pairs Lifecycle', category: 'Trials' },
                  { table: 'shopify_orders', label: 'Shopify Store Cache', category: 'Stores' }
                ].map(({ table, label, category }) => {
                  const status = allTablesStatus ? allTablesStatus[table] : null;
                  const isReady = status?.exists;

                  return (
                    <div
                      key={table}
                      className={`p-3 rounded-2xl border transition ${
                        isReady
                          ? 'border-emerald-200 bg-emerald-50/50'
                          : status
                          ? 'border-amber-200 bg-amber-50/40'
                          : 'border-neutral-200 bg-neutral-50/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block">
                            {category}
                          </span>
                          <span className="text-xs font-bold text-neutral-900 block truncate">
                            {label}
                          </span>
                        </div>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                          isReady
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}>
                          {checkingAllTables ? 'Checking...' : isReady ? 'Connected' : 'Pending DDL'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500 mt-2 pt-2 border-t border-neutral-200/50">
                        <span className="truncate">public.{table}</span>
                        {isReady && status?.sampleCount !== undefined && (
                          <span className="text-neutral-700">{status.sampleCount} rows</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Live Supabase Connection Banner */}
          <div className="p-4 rounded-2xl border border-neutral-200/80 bg-neutral-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full shrink-0 ${
                supabaseStatus?.exists ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              }`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-neutral-900">
                    Supabase Live Status: <code className="font-mono">{config.tableName}</code>
                  </span>
                  {supabaseStatus?.exists && (
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold">
                      Connected & Ready
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  {checkingStatus
                    ? 'Pinging Supabase database...'
                    : supabaseStatus?.message || 'Ready to check table in Supabase.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => verifyTable(config.tableName)}
                disabled={checkingStatus}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300/80 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${checkingStatus ? 'animate-spin' : ''}`} />
                <span>Verify Table</span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-neutral-400 hover:text-neutral-600 px-2 py-1 transition cursor-pointer"
                title="Reset to default elements"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200/70 bg-white/90 flex items-center justify-between">
          <span className="text-xs text-neutral-500">
            Active schema has <strong className="text-neutral-900">{enabledCount}</strong> columns configured for <strong>{config.displayName}</strong>.
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="bg-neutral-900 hover:bg-neutral-800 text-white px-5 py-2 rounded-full text-xs font-semibold transition cursor-pointer shadow-xs"
            >
              Apply & Save Schema
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
