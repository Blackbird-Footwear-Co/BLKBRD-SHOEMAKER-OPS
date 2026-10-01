import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Users,
  Layers,
  HelpCircle,
  Tag
} from 'lucide-react';
import { CustomerProfile, CustomerSource } from '../types';
import { parseCustomerCsv, saveStoredCustomers, getStoredCustomers } from '../services/customerService';

interface CustomerBulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (count: number) => void;
}

export const CustomerBulkUploadModal: React.FC<CustomerBulkUploadModalProps> = ({
  isOpen,
  onClose,
  onImportComplete
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [parsedCustomers, setParsedCustomers] = useState<Array<Omit<CustomerProfile, 'id' | 'createdAt' | 'updatedAt' | 'crmQueries'>>>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [skippedCount, setSkippedCount] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    const templateContent =
      `Customer Name,Phone,Email,Source,Orders,Tags,City,Country,Notes\n` +
      `"Stephen Maloney","+1 555-234-8901","stephen.maloney@example.com","Website","BLKBRD6132, BLKBRD6774","VIP Bespoke; Exchange Active","Boston","USA","Prefers dark cognac calf"\n` +
      `"Akam Sihota","+1 415-890-1234","akam.sihota@example.com","Social Media","BLKBRD6521, BLKBRD6852","Instagram Lead","San Francisco","USA","Dainite rubber sole request"\n` +
      `"Alexander Wright","+44 20 7946 0912","alex.wright@mayfair-bespoke.co.uk","Referral","BLKBRD30420","Savile Row; Museum Calf","London","UK","Wholecut oxford bespoke"\n` +
      `"David Miller","+1 212-555-0198","dmiller@manhattanlaw.com","Website","USBLKBRD1042","LLC Store; RTD","New York","USA","Expedited delivery requested"\n` +
      `"Sunil Varma","+91 98201 44552","sunil.varma@mumbai.co.in","WhatsApp","BLKBRD5711","Domestic; WhatsApp VIP","Mumbai","India","6mm memory foam insole kit"\n`;

    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'blkbrd_customer_crm_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const processFileContent = (content: string, name: string) => {
    setFileName(name);
    setRawText(content);
    setImportSuccess(null);

    const { customers, errors, skippedCount: skipped } = parseCustomerCsv(content);
    setParsedCustomers(customers);
    setParseErrors(errors);
    setSkippedCount(skipped);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = event => {
        const text = event.target?.result as string;
        processFileContent(text, file.name);
      };
      reader.readAsText(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = event => {
        const text = event.target?.result as string;
        processFileContent(text, file.name);
      };
      reader.readAsText(file);
    }
  };

  const handleCommitImport = () => {
    if (parsedCustomers.length === 0) return;
    setIsProcessing(true);

    try {
      const existing = getStoredCustomers();
      const existingEmailMap = new Map<string, CustomerProfile>();
      const existingPhoneMap = new Map<string, CustomerProfile>();
      const existingNameMap = new Map<string, CustomerProfile>();

      existing.forEach(c => {
        if (c.email) existingEmailMap.set(c.email.toLowerCase(), c);
        if (c.phone) existingPhoneMap.set(c.phone.replace(/[^0-9]/g, ''), c);
        if (c.name) existingNameMap.set(c.name.toLowerCase().trim(), c);
      });

      const now = new Date().toISOString();
      let importedCount = 0;
      let updatedCount = 0;

      const updatedList = [...existing];

      parsedCustomers.forEach(p => {
        const emailKey = p.email ? p.email.toLowerCase() : '';
        const phoneKey = p.phone ? p.phone.replace(/[^0-9]/g, '') : '';
        const nameKey = p.name ? p.name.toLowerCase().trim() : '';

        // Match existing customer to update or merge orders
        let matched: CustomerProfile | undefined =
          (emailKey && existingEmailMap.get(emailKey)) ||
          (phoneKey && phoneKey.length >= 7 && existingPhoneMap.get(phoneKey)) ||
          (nameKey && nameKey !== 'customer' && existingNameMap.get(nameKey));

        if (matched) {
          // Merge order IDs and tags
          const mergedOrders = Array.from(new Set([...matched.orderIds, ...p.orderIds]));
          const mergedTags = Array.from(new Set([...matched.tags, ...p.tags]));
          matched.orderIds = mergedOrders;
          matched.tags = mergedTags;
          if (p.notes && !matched.notes?.includes(p.notes)) {
            matched.notes = matched.notes ? `${matched.notes}\n${p.notes}` : p.notes;
          }
          if (p.source && matched.source === 'Other') {
            matched.source = p.source;
          }
          matched.updatedAt = now;
          updatedCount++;
        } else {
          // Create new
          const newCust: CustomerProfile = {
            id: `cust-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            name: p.name,
            phone: p.phone,
            email: p.email,
            source: p.source,
            orderIds: p.orderIds,
            tags: p.tags,
            city: p.city,
            country: p.country,
            notes: p.notes,
            crmQueries: [],
            createdAt: now,
            updatedAt: now
          };
          updatedList.unshift(newCust);
          importedCount++;
        }
      });

      saveStoredCustomers(updatedList);
      setIsProcessing(false);
      setImportSuccess(`Successfully processed: ${importedCount} new customers added, ${updatedCount} existing merged.`);
      setTimeout(() => {
        onImportComplete(importedCount + updatedCount);
        onClose();
      }, 1400);
    } catch (err: any) {
      setIsProcessing(false);
      setParseErrors([`Import failed: ${err.message}`]);
    }
  };

  const getSourceBadge = (source: CustomerSource) => {
    switch (source) {
      case 'Website':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Social Media':
        return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'WhatsApp':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Phone Call':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Referral':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-neutral-100 text-neutral-800 border-neutral-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-neutral-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-700 flex items-center justify-center border border-teal-500/20">
              <Users className="w-5 h-5 stroke-[1.75]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900 flex items-center gap-2">
                <span>Upload Customer Data</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-semibold">
                  CRM Direct
                </span>
              </h2>
              <p className="text-xs text-neutral-500">
                Bulk import customer names, phone numbers, emails, lead sources, and order histories.
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Action Row: Download Template */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-teal-50/50 border border-teal-200/70 rounded-2xl">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-teal-700 shrink-0" />
              <div>
                <span className="font-semibold text-teal-950 block">Standard Customer CRM Template</span>
                <span className="text-[11px] text-teal-800/80">
                  Includes headers: Customer Name, Phone, Email, Source, Orders, Tags, City, Country, Notes.
                </span>
              </div>
            </div>
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-white text-teal-800 font-medium rounded-xl border border-teal-300 hover:bg-teal-50 transition cursor-pointer shadow-xs shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV Template</span>
            </button>
          </div>

          {/* Drag and Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer flex flex-col items-center justify-center gap-3 ${
              dragActive
                ? 'border-teal-500 bg-teal-50/60'
                : fileName
                ? 'border-teal-300 bg-teal-50/20'
                : 'border-neutral-200 hover:border-neutral-300 bg-neutral-50/40 hover:bg-neutral-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-white shadow-xs border border-neutral-200 flex items-center justify-center text-teal-600">
              <Upload className="w-6 h-6 stroke-[1.5]" />
            </div>
            <div>
              <p className="font-semibold text-neutral-800 text-sm">
                {fileName ? fileName : 'Click or Drag & Drop customer CSV file here'}
              </p>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Supports standard comma-separated files (.csv) exported from Shopify, Excel, or Google Sheets
              </p>
            </div>
          </div>

          {/* Feedback & Validation Messages */}
          {parseErrors.length > 0 && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span>Format Notice</span>
              </div>
              {parseErrors.map((err, idx) => (
                <p key={idx} className="text-[11px] text-red-700">
                  {err}
                </p>
              ))}
            </div>
          )}

          {importSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium text-xs">{importSuccess}</span>
            </div>
          )}

          {/* Parsed Rows Preview */}
          {parsedCustomers.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-neutral-900 text-sm">Preview Records</span>
                  <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-mono text-[10px] font-semibold">
                    {parsedCustomers.length} Ready to Import
                  </span>
                  {skippedCount > 0 && (
                    <span className="text-[11px] text-neutral-400">
                      ({skippedCount} blank rows skipped)
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-neutral-500">
                  Existing profiles with matching email/phone will merge order history automatically
                </span>
              </div>

              <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-neutral-100/80 sticky top-0 text-[11px] text-neutral-600 font-semibold border-b border-neutral-200">
                    <tr>
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Customer Name</th>
                      <th className="py-2 px-3">Contact</th>
                      <th className="py-2 px-3">Source</th>
                      <th className="py-2 px-3">Linked Orders</th>
                      <th className="py-2 px-3">Tags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-[11px]">
                    {parsedCustomers.slice(0, 50).map((c, idx) => (
                      <tr key={idx} className="hover:bg-neutral-50/80 transition">
                        <td className="py-2 px-3 text-neutral-400 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold text-neutral-900">{c.name}</td>
                        <td className="py-2 px-3 text-neutral-600">
                          <div>{c.email || '—'}</div>
                          <div className="text-[10px] text-neutral-400 font-mono">{c.phone || '—'}</div>
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-medium border ${getSourceBadge(c.source)}`}>
                            {c.source}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {c.orderIds.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {c.orderIds.map(oid => (
                                <span key={oid} className="px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-800 font-mono text-[10px] border border-neutral-200">
                                  {oid}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-neutral-400 italic">No orders specified</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {c.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {c.tags.map(t => (
                                <span key={t} className="px-1.5 py-0.5 rounded-md bg-teal-50 text-teal-700 text-[10px] border border-teal-200">
                                  {t}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedCustomers.length > 50 && (
                <p className="text-[11px] text-neutral-400 text-right">
                  Showing first 50 of {parsedCustomers.length} records.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between bg-neutral-50/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-neutral-600 hover:text-neutral-900 font-medium hover:bg-neutral-200/60 transition cursor-pointer text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={parsedCustomers.length === 0 || isProcessing}
            onClick={handleCommitImport}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-medium rounded-xl transition cursor-pointer text-xs shadow-md shadow-teal-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {isProcessing
                ? 'Importing Customer Data...'
                : `Commit & Import ${parsedCustomers.length} Customers`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
