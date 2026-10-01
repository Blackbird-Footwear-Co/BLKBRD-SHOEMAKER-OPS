import React, { useState, useRef, useMemo } from 'react';
import {
  Upload,
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  ArrowRight,
  Truck,
  Layers,
  HelpCircle
} from 'lucide-react';
import { DelinquencyItem, DelinquencyStage, DELINQUENCY_STAGES, STANDARD_DELAY_REASONS } from '../types';
import { parseDelinquencyCsv, normalizeOrderId, formatBlkbrdOrderId } from '../utils/csvParser';
import { resolveCustomerName, OrderLookupContext } from '../utils/customerResolver';
import { calculateExpectedDate, calculateDelayDays, parseFlexibleDate } from '../utils/delinquencyUtils';

interface DelinquencyBulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBulkImport: (items: DelinquencyItem[]) => Promise<{ count: number; message: string }> | void;
  existingItems?: DelinquencyItem[];
  lookupContext?: OrderLookupContext;
}

export const DelinquencyBulkUploadModal: React.FC<DelinquencyBulkUploadModalProps> = ({
  isOpen,
  onClose,
  onBulkImport,
  existingItems = [],
  lookupContext
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawParsedItems, setRawParsedItems] = useState<DelinquencyItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Configuration options for the order journey
  const [stageMode, setStageMode] = useState<'csv' | 'custom' | 'rtd'>('csv');
  const [customStage, setCustomStage] = useState<DelinquencyStage>('CUTTING');
  const [storeAllocation, setStoreAllocation] = useState<'auto' | 'global' | 'llc'>('auto');
  const [defaultDelayReason, setDefaultDelayReason] = useState<string>(STANDARD_DELAY_REASONS[0]);

  const handleDownloadTemplate = () => {
    const templateContent =
      `S.N.,Store,Order ID,Customer Name,Order Date,Expected Date,Days Delayed,Current Stage,Delay Reason,Action Required,Escalation Status\n` +
      `1,Global,BLKBRD30420,Alexander Wright,2026-08-15,2026-09-05,14,CLOSING,Upper Material Shortage,Prioritize upper closing,Normal\n` +
      `2,LLC,USBLKBRD1042,David Miller,2026-08-10,2026-08-31,19,RTD,Sole Shortage,Ready to dispatch via international courier,Normal\n` +
      `3,Global,BLKBRD30455,,2026-08-20,2026-09-10,9,CUTTING,Custom Last Delay,Expedite lasting,Normal\n`;

    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'BLKBRD_Orders_Delinquency_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const processCsvFile = (file: File) => {
    setParseError(null);
    setSuccessMessage(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text || !text.trim()) {
          setParseError('The selected file is empty. Please upload a CSV with order data.');
          setRawParsedItems([]);
          return;
        }

        const parsed = parseDelinquencyCsv(text);
        if (parsed.length === 0) {
          setParseError('No valid order rows could be parsed. Please verify the CSV column headers.');
          setRawParsedItems([]);
          return;
        }

        // Filter out empty rows and clean up order IDs
        const validOrders = parsed.filter(item => {
          const cleanId = normalizeOrderId(item.orderId);
          return (
            cleanId &&
            cleanId !== 'ORDERID' &&
            cleanId !== 'STORE' &&
            cleanId !== 'GLOBAL' &&
            cleanId !== 'LLC'
          );
        });

        if (validOrders.length === 0) {
          setParseError('No valid Order IDs found in the file. Ensure an "Order ID" column exists.');
          setRawParsedItems([]);
          return;
        }

        setRawParsedItems(validOrders);
      } catch (err: any) {
        setParseError(`Failed to process CSV file: ${err.message}`);
        setRawParsedItems([]);
      }
    };
    reader.onerror = () => {
      setParseError('Error reading file. Please check file permissions and try again.');
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processCsvFile(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      processCsvFile(file);
    }
  };

  // Final processed items considering journey configuration & customer resolution
  const finalItemsToImport: DelinquencyItem[] = useMemo(() => {
    return rawParsedItems.map((item, idx) => {
      const cleanOrderId = item.orderId.replace(/^#/, '').trim();
      const normId = normalizeOrderId(cleanOrderId);

      // 1. Resolve Store Tab
      let finalStore: 'Global' | 'LLC';
      if (storeAllocation === 'global') {
        finalStore = 'Global';
      } else if (storeAllocation === 'llc') {
        finalStore = 'LLC';
      } else {
        const isLlc = item.storeTab === 'LLC' || normId.startsWith('US');
        finalStore = isLlc ? 'LLC' : 'Global';
      }

      // 2. Resolve Customer Name from context / database
      const formattedOrderId = formatBlkbrdOrderId(cleanOrderId, finalStore);
      const resolvedCustomer = resolveCustomerName(
        formattedOrderId,
        item.customerName || item.clientName,
        lookupContext
      );

      // 3. Resolve Stage & Order Status
      // 4. Resolve Dates
      const orderDate = item.orderDate || parseFlexibleDate(item.orderDate) || new Date().toISOString().split('T')[0];
      let expectedDate = item.expectedDate || parseFlexibleDate(item.expectedDate);
      if (!expectedDate && orderDate) {
        expectedDate = calculateExpectedDate(orderDate);
      }

      // Delay Days
      const delayDays =
        item.daysDelayed > 0
          ? item.daysDelayed
          : calculateDelayDays(orderDate, expectedDate);

      let finalStage: string;
      let finalStatus: 'Delayed' | 'Ready to Ship' | 'Shipped' | 'In Production';

      if (stageMode === 'rtd') {
        finalStage = 'RTD';
        finalStatus = 'Ready to Ship';
      } else if (stageMode === 'custom') {
        finalStage = customStage;
        finalStatus = customStage === 'RTD' ? 'Ready to Ship' : customStage === 'Shipped' ? 'Shipped' : (delayDays >= 1 ? 'Delayed' : 'In Production');
      } else {
        finalStage = item.currentStage || 'Preparation';
        const normStage = (finalStage || '').toUpperCase();
        if (normStage === 'RTD' || normStage.includes('READY TO SHIP')) {
          finalStatus = 'Ready to Ship';
        } else if (normStage === 'SHIPPED') {
          finalStatus = 'Shipped';
        } else if (delayDays >= 1) {
          finalStatus = 'Delayed';
        } else {
          finalStatus = 'In Production';
        }
      }

      return {
        ...item,
        id: `delinq-bulk-${Date.now()}-${idx}-${formattedOrderId}`,
        sNo: item.sNo || idx + 1,
        orderId: formattedOrderId,
        customerName: resolvedCustomer,
        clientName: resolvedCustomer,
        storeTab: finalStore,
        currentStage: finalStage,
        orderStatus: finalStatus,
        orderDate,
        expectedDate: expectedDate || orderDate,
        daysDelayed: delayDays,
        delayReason: item.delayReason || defaultDelayReason,
        actionRequired:
          item.actionRequired ||
          (finalStatus === 'Ready to Ship'
            ? 'Move to Dispatch & RTD Queue for courier assignment'
            : 'Workshop processing underway'),
        escalationStatus:
          item.escalationStatus || (delayDays > 14 ? 'Escalated to Production Lead' : 'Normal')
      };
    });
  }, [rawParsedItems, stageMode, customStage, storeAllocation, defaultDelayReason, lookupContext]);

  const stats = useMemo(() => {
    const total = finalItemsToImport.length;
    const globalCount = finalItemsToImport.filter(i => i.storeTab === 'Global').length;
    const llcCount = finalItemsToImport.filter(i => i.storeTab === 'LLC').length;
    const rtdCount = finalItemsToImport.filter(i => i.orderStatus === 'Ready to Ship' || i.currentStage === 'RTD').length;
    return { total, globalCount, llcCount, rtdCount };
  }, [finalItemsToImport]);

  const handleConfirmImport = async () => {
    if (finalItemsToImport.length === 0) return;

    setIsSubmitting(true);
    try {
      await onBulkImport(finalItemsToImport);
      setSuccessMessage(
        `Successfully imported ${finalItemsToImport.length} orders into the Delinquency Tracker. ${
          stats.rtdCount > 0
            ? `${stats.rtdCount} orders marked as RTD will now appear directly in the Dispatch & RTD Queue.`
            : ''
        }`
      );
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setParseError(`Import failed: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="delinquency-bulk-upload-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-neutral-900/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-neutral-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-neutral-900 text-white flex items-center justify-center shadow-xs">
              <UploadCloud className="w-5 h-5 stroke-[1.75]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-900">
                  Bulk CSV Upload & Order Journey
                </h2>
                <span className="text-[10px] font-mono uppercase bg-neutral-200/80 text-neutral-700 px-2 py-0.5 rounded-full font-medium">
                  Delinquency Tracker
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Import bulk orders to track workshop progress or immediately advance them to the Dispatch & RTD Queue.
              </p>
            </div>
          </div>
          <button
            id="close-bulk-upload-modal-btn"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 p-2 rounded-full hover:bg-neutral-100 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(92vh-150px)]">
          {/* File Upload Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-200 ${
              isDragging
                ? 'border-neutral-900 bg-neutral-50 scale-[0.99]'
                : rawParsedItems.length > 0
                ? 'border-neutral-300 bg-neutral-50/50'
                : 'border-neutral-200 hover:border-neutral-400 bg-white'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.tsv"
              onChange={handleFileInputChange}
              className="hidden"
              id="bulk-csv-file-input"
            />

            <div className="max-w-md mx-auto space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-neutral-100 text-neutral-700 mx-auto flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6 stroke-[1.5]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-800">
                  {fileName ? (
                    <span className="text-neutral-900 font-mono">{fileName}</span>
                  ) : (
                    'Drag & drop your Delinquency CSV file here'
                  )}
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Supports .csv and text exports from Google Sheets, Excel, or ERP systems
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  id="browse-files-btn"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs px-4 py-2 rounded-full font-medium transition cursor-pointer shadow-2xs"
                >
                  {fileName ? 'Choose Different File' : 'Browse CSV File'}
                </button>

                <button
                  type="button"
                  id="download-sample-template-btn"
                  onClick={handleDownloadTemplate}
                  className="bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 text-xs px-4 py-2 rounded-full font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Sample Template</span>
                </button>
              </div>
            </div>
          </div>

          {/* Feedback & Error Notices */}
          {parseError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <div>
                <span className="font-semibold">Error parsing file: </span>
                <span>{parseError}</span>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <div>
                <span className="font-semibold">Import Complete: </span>
                <span>{successMessage}</span>
              </div>
            </div>
          )}

          {/* Configuration for Order Journey */}
          {rawParsedItems.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Order Journey & Stage Configuration</span>
                </h4>
                <span className="text-[11px] text-neutral-500">
                  {rawParsedItems.length} orders parsed
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Stage Mode Card: Keep from CSV */}
                <button
                  type="button"
                  onClick={() => setStageMode('csv')}
                  className={`p-3.5 rounded-2xl border text-left transition cursor-pointer relative ${
                    stageMode === 'csv'
                      ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                      : 'border-neutral-200 hover:border-neutral-300 bg-white text-neutral-800'
                  }`}
                >
                  <div className="text-xs font-semibold">1. Use CSV Stages</div>
                  <div
                    className={`text-[11px] mt-1 line-clamp-2 ${
                      stageMode === 'csv' ? 'text-neutral-300' : 'text-neutral-500'
                    }`}
                  >
                    Keep individual stages from the CSV (e.g. Cutting, Closing, Preparation, QC).
                  </div>
                </button>

                {/* Stage Mode Card: Set Specific Stage */}
                <button
                  type="button"
                  onClick={() => setStageMode('custom')}
                  className={`p-3.5 rounded-2xl border text-left transition cursor-pointer relative ${
                    stageMode === 'custom'
                      ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                      : 'border-neutral-200 hover:border-neutral-300 bg-white text-neutral-800'
                  }`}
                >
                  <div className="text-xs font-semibold">2. Set Common Stage</div>
                  <div
                    className={`text-[11px] mt-1 line-clamp-2 ${
                      stageMode === 'custom' ? 'text-neutral-300' : 'text-neutral-500'
                    }`}
                  >
                    Assign all imported orders to a designated production milestone.
                  </div>
                </button>

                {/* Stage Mode Card: Fast-track to RTD */}
                <button
                  type="button"
                  onClick={() => setStageMode('rtd')}
                  className={`p-3.5 rounded-2xl border text-left transition cursor-pointer relative ${
                    stageMode === 'rtd'
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                      : 'border-emerald-200 hover:border-emerald-300 bg-emerald-50/50 text-emerald-950'
                  }`}
                >
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" />
                    <span>3. Mark RTD (Ready to Dispatch)</span>
                  </div>
                  <div
                    className={`text-[11px] mt-1 line-clamp-2 ${
                      stageMode === 'rtd' ? 'text-emerald-100' : 'text-emerald-800'
                    }`}
                  >
                    Directly populates into the Dispatch & RTD Queue for courier assignment.
                  </div>
                </button>
              </div>

              {/* Sub-selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200/80">
                {stageMode === 'custom' && (
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-700 mb-1">
                      Choose Starting Stage
                    </label>
                    <select
                      value={customStage}
                      onChange={(e) => setCustomStage(e.target.value as DelinquencyStage)}
                      className="w-full text-xs font-bold uppercase tracking-wide bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden"
                    >
                      {DELINQUENCY_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-neutral-700 mb-1">
                    Store Routing
                  </label>
                  <select
                    value={storeAllocation}
                    onChange={(e) => setStoreAllocation(e.target.value as any)}
                    className="w-full text-xs bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden"
                  >
                    <option value="auto">Auto-detect (US... = LLC, others = Global)</option>
                    <option value="global">Force All to Global Store</option>
                    <option value="llc">Force All to LLC Store (US)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-neutral-700 mb-1">
                    Default Delay Reason (Dropdown)
                  </label>
                  <select
                    value={defaultDelayReason}
                    onChange={(e) => setDefaultDelayReason(e.target.value)}
                    className="w-full text-xs bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden text-neutral-800 font-medium"
                  >
                    {STANDARD_DELAY_REASONS.map(reason => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                <div className="bg-neutral-100/70 p-2.5 rounded-xl border border-neutral-200/50">
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium">
                    Total Valid
                  </div>
                  <div className="text-lg font-bold text-neutral-900 font-mono">
                    {stats.total}
                  </div>
                </div>

                <div className="bg-neutral-100/70 p-2.5 rounded-xl border border-neutral-200/50">
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium">
                    Global Store
                  </div>
                  <div className="text-lg font-bold text-neutral-900 font-mono">
                    {stats.globalCount}
                  </div>
                </div>

                <div className="bg-neutral-100/70 p-2.5 rounded-xl border border-neutral-200/50">
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium">
                    LLC Store (US)
                  </div>
                  <div className="text-lg font-bold text-neutral-900 font-mono">
                    {stats.llcCount}
                  </div>
                </div>

                <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                  <div className="text-[10px] text-emerald-700 uppercase tracking-wider font-medium">
                    Ready to Ship (RTD)
                  </div>
                  <div className="text-lg font-bold text-emerald-800 font-mono">
                    {stats.rtdCount}
                  </div>
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs text-neutral-600">
                  <span className="font-medium">
                    Data Preview (Showing first {Math.min(finalItemsToImport.length, 6)} of {finalItemsToImport.length} rows):
                  </span>
                  <span className="text-[11px] text-neutral-500 font-mono">
                    Customer names cross-resolved from source orders
                  </span>
                </div>

                <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto max-h-56">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-neutral-100/80 text-neutral-600 font-medium border-b border-neutral-200 sticky top-0 z-10">
                        <tr>
                          <th className="py-2 px-3">Order ID</th>
                          <th className="py-2 px-3">Customer Name</th>
                          <th className="py-2 px-3">Store</th>
                          <th className="py-2 px-3">Order Date</th>
                          <th className="py-2 px-3">Days Delayed</th>
                          <th className="py-2 px-3">Assigned Stage</th>
                          <th className="py-2 px-3">Action Required</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 bg-white">
                        {finalItemsToImport.slice(0, 6).map((row, idx) => (
                          <tr key={idx} className="hover:bg-neutral-50/50">
                            <td className="py-2 px-3 font-mono font-semibold text-neutral-900">
                              {row.orderId}
                            </td>
                            <td className="py-2 px-3 font-medium text-neutral-800">
                              <div className="flex items-center gap-1.5">
                                <span>{row.customerName || 'Customer'}</span>
                                {row.customerName && row.customerName !== 'Customer' && (
                                  <span className="text-[9px] text-neutral-400 font-mono">From Order</span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-2 py-0.5 text-[10px] rounded-md font-mono font-medium ${
                                  row.storeTab === 'LLC'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {row.storeTab}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-neutral-600 font-mono text-[11px]">
                              {row.orderDate || '-'}
                            </td>
                            <td className="py-2 px-3 font-mono font-semibold text-red-600">
                              +{row.daysDelayed}d
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  row.currentStage === 'RTD'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-neutral-100 text-neutral-800'
                                }`}
                              >
                                {row.currentStage}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-neutral-500 text-[11px] max-w-[200px] truncate">
                              {row.actionRequired || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-100 bg-neutral-50/80">
          <div className="text-xs text-neutral-500">
            {finalItemsToImport.length > 0 ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Ready to import <strong>{finalItemsToImport.length}</strong> orders</span>
              </span>
            ) : (
              <span>Select or drop a CSV file to preview and import</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              id="cancel-bulk-upload-btn"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 rounded-full transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              id="confirm-bulk-import-btn"
              onClick={handleConfirmImport}
              disabled={finalItemsToImport.length === 0 || isSubmitting}
              className={`px-5 py-2 text-xs font-medium rounded-full text-white flex items-center gap-2 transition cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${
                stageMode === 'rtd'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-neutral-900 hover:bg-neutral-800'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Importing Orders...</span>
                </>
              ) : (
                <>
                  <span>
                    {stageMode === 'rtd'
                      ? `Import & Move ${finalItemsToImport.length} Orders to RTD Queue`
                      : `Import ${finalItemsToImport.length} Orders to Tracker`}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
