import React, { useState, useMemo } from 'react';
import { ReturnItem, ShoeWidth, SHOE_WIDTHS } from '../types';
import {
  Search,
  Filter,
  Download,
  Plus,
  RotateCcw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Globe,
  MapPin,
  CheckCircle,
  Clock,
  X,
  Sparkles,
  Edit2,
  Save,
  Undo2,
  RefreshCw,
  Sliders,
  Check
} from 'lucide-react';
import { exportToCsv } from '../utils/csvParser';
import { insertReturnStock, updateReturn, fetchReturnStock, updateReturnStock } from '../services/supabaseReturnsService';
import {
  lookupAndExtractShoeDetails,
  lookupOrderProductDetailsAsync,
  COMMON_LEATHERS,
  COMMON_LASTS,
  COMMON_SOLES,
  PRODUCT_DATABASE_RECORDS
} from '../utils/shoeDetailsExtractor';
import { getDelinquencies, getShopifyOrders, getDispatches, getBostonStock } from '../services/store';

interface ReturnsTrackerViewProps {
  returns: ReturnItem[];
  onAddReturn: (item: any) => Promise<void> | void;
  onSelectOrder: (orderId: string) => void;
  onUpdateReturn?: (item: any) => Promise<void> | void;
}

export const ReturnsTrackerView: React.FC<ReturnsTrackerViewProps> = ({
  returns,
  onAddReturn,
  onSelectOrder,
  onUpdateReturn
}) => {
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedReason, setSelectedReason] = useState<string>('all');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [selectedReceived, setSelectedReceived] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // Selected item modal for complete details
  const [detailItem, setDetailItem] = useState<ReturnItem | null>(null);

  // New return form state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newReturn, setNewReturn] = useState({
    clientName: '',
    type: 'Exchange',
    reason: 'Size Small',
    oldOrderId: '',
    newOrderId: '',
    returnReceived: 'N',
    receivingWarehouse: 'IN' as 'IN' | 'US',
    stockProduct: '',
    stockLeather: '',
    stockLast: '',
    stockSole: '',
    stockSize: '',
    stockWidth: 'E' as ShoeWidth,
    stockNotes: '',
    stockCustomization: 'N' as 'N' | 'Y',
    stockCustomizationRemark: '',
    status: 'Open',
    region: 'Domestic',
    country: 'India',
    incomingCourier: 'Blue Dart',
    incomingTrackingNo: '',
    notes: '',
    storeTab: 'Global' as 'Global' | 'LLC'
  });

  // Track original fetched values for new return to enable editing & resetting
  const [fetchedBaseline, setFetchedBaseline] = useState<{
    product: string;
    leather: string;
    last: string;
    sole: string;
    size: string;
    width: ShoeWidth;
    customerName?: string;
    trackingNo?: string;
  } | null>(null);

  // Edit Existing Return State
  const [editingReturnItem, setEditingReturnItem] = useState<ReturnItem | null>(null);
  const [editReturnForm, setEditReturnForm] = useState<any>({});
  const [editFetchedBaseline, setEditFetchedBaseline] = useState<{
    product: string;
    leather: string;
    last: string;
    sole: string;
    size: string;
    width: ShoeWidth;
    customerName?: string;
    trackingNo?: string;
  } | null>(null);
  const [isFetchingEditOrderDetails, setIsFetchingEditOrderDetails] = useState(false);
  const [editOrderFetchFeedback, setEditOrderFetchFeedback] = useState<string | null>(null);

  // Auto-fetch feedback & progress state
  const [isFetchingOrderDetails, setIsFetchingOrderDetails] = useState(false);
  const [orderFetchFeedback, setOrderFetchFeedback] = useState<string | null>(null);

  // Available database orders for auto-selection in return creation flow
  const availableOrdersForSelection = useMemo(() => {
    const map = new Map<string, { orderId: string; customerName: string; product: string; source: string }>();

    (getShopifyOrders() || []).forEach(s => {
      const clean = String(s.orderNumber || s.id || '').replace(/^#/, '').trim();
      if (clean && !map.has(clean)) {
        map.set(clean, {
          orderId: clean,
          customerName: s.customerName || '',
          product: s.lineItems || 'Footwear',
          source: 'Shopify Store'
        });
      }
    });

    (getDelinquencies() || []).forEach(d => {
      const clean = String(d.orderId || '').replace(/^#/, '').trim();
      if (clean && !map.has(clean)) {
        map.set(clean, {
          orderId: clean,
          customerName: d.customerName || d.clientName || '',
          product: d.product || d.shoeStyle || 'Footwear',
          source: d.storeTab === 'LLC' ? 'LLC Orders' : 'Global Orders'
        });
      }
    });

    (getDispatches() || []).forEach(dp => {
      const clean = String(dp.orderNumber || '').replace(/^#/, '').trim();
      if (clean && !map.has(clean)) {
        map.set(clean, {
          orderId: clean,
          customerName: '',
          product: dp.notes?.replace(/^Product:\s*/i, '') || 'Footwear',
          source: 'Dispatches'
        });
      }
    });

    (returns || []).forEach(r => {
      const clean = String(r.oldOrderId || '').replace(/^#/, '').trim();
      if (clean && !map.has(clean)) {
        map.set(clean, {
          orderId: clean,
          customerName: r.clientName || '',
          product: r.notes || 'Footwear',
          source: 'Returns'
        });
      }
    });

    (getBostonStock() || []).forEach(b => {
      const clean = String(b.originalOrderId || '').replace(/^#/, '').trim();
      if (clean && !map.has(clean)) {
        map.set(clean, {
          orderId: clean,
          customerName: b.clientName || '',
          product: b.shoeModel || 'Footwear',
          source: 'Boston Stock'
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.orderId.localeCompare(b.orderId));
  }, [returns]);

  const handleAutoFetchOrderDetails = async (orderIdToFetch?: string) => {
    const rawTarget = orderIdToFetch !== undefined ? orderIdToFetch : newReturn.oldOrderId;
    const targetId = String(rawTarget || '').replace(/^#/, '').trim();
    if (!targetId) return;

    setIsFetchingOrderDetails(true);
    try {
      const details = await lookupOrderProductDetailsAsync(targetId, {
        delinquencies: getDelinquencies(),
        shopifyOrders: getShopifyOrders(),
        returns: returns,
        dispatches: getDispatches(),
        bostonStock: getBostonStock()
      });

      setFetchedBaseline({
        product: details.product,
        leather: details.leather,
        last: details.last,
        sole: details.sole,
        size: details.size || '',
        width: details.width || 'E',
        customerName: details.customerName,
        trackingNo: details.trackingAwb
      });

      setNewReturn(prev => ({
        ...prev,
        oldOrderId: targetId,
        clientName: details.customerName || prev.clientName || '',
        incomingTrackingNo: details.trackingAwb || prev.incomingTrackingNo || '',
        receivingWarehouse: details.warehouse,
        stockProduct: details.product,
        stockLeather: details.leather,
        stockLast: details.last,
        stockSole: details.sole,
        stockSize: details.size || '',
        stockWidth: details.width || 'E',
        stockNotes: details.notes || prev.notes || ''
      }));

      setOrderFetchFeedback(`Auto-filled: ${details.product} (${details.leather} • ${details.last} • ${details.sole} • ${details.size})`);
      setTimeout(() => setOrderFetchFeedback(null), 5000);
    } catch (err) {
      console.warn('Auto-fetch return details notice:', err);
    } finally {
      setIsFetchingOrderDetails(false);
    }
  };

  const handleResetFieldToFetched = (field: 'product' | 'leather' | 'last' | 'sole' | 'size' | 'width') => {
    if (!fetchedBaseline) return;
    if (field === 'product') setNewReturn(p => ({ ...p, stockProduct: fetchedBaseline.product }));
    if (field === 'leather') setNewReturn(p => ({ ...p, stockLeather: fetchedBaseline.leather }));
    if (field === 'last') setNewReturn(p => ({ ...p, stockLast: fetchedBaseline.last }));
    if (field === 'sole') setNewReturn(p => ({ ...p, stockSole: fetchedBaseline.sole }));
    if (field === 'size') setNewReturn(p => ({ ...p, stockSize: fetchedBaseline.size }));
    if (field === 'width') setNewReturn(p => ({ ...p, stockWidth: fetchedBaseline.width }));
  };

  const handleResetAllToFetched = () => {
    if (!fetchedBaseline) return;
    setNewReturn(p => ({
      ...p,
      stockProduct: fetchedBaseline.product,
      stockLeather: fetchedBaseline.leather,
      stockLast: fetchedBaseline.last,
      stockSole: fetchedBaseline.sole,
      stockSize: fetchedBaseline.size,
      stockWidth: fetchedBaseline.width,
      clientName: fetchedBaseline.customerName || p.clientName,
      incomingTrackingNo: fetchedBaseline.trackingNo || p.incomingTrackingNo
    }));
  };

  // Open Edit Modal for an existing Return case
  const openEditReturnModal = (item: ReturnItem) => {
    const cleanId = String(item.oldOrderId || '').replace(/^#/, '').trim();
    const extracted = lookupAndExtractShoeDetails(cleanId, {
      delinquencies: getDelinquencies(),
      shopifyOrders: getShopifyOrders(),
      returns: returns,
      dispatches: getDispatches(),
      bostonStock: getBostonStock()
    });

    const productVal = item.product || extracted.product || 'Henrik Penny Loafer';
    const leatherVal = item.leather || extracted.leather || 'Snuff Suede';
    const lastVal = item.last || extracted.last || 'Rui Last';
    const soleVal = item.sole || extracted.sole || 'Single Leather Sole';
    const sizeVal = item.oldSize || extracted.size || 'UK 9 / US 9.5';
    const widthVal = (item.width as ShoeWidth) || extracted.width || 'E';

    setEditFetchedBaseline({
      product: extracted.product,
      leather: extracted.leather,
      last: extracted.last,
      sole: extracted.sole,
      size: extracted.size,
      width: extracted.width,
      customerName: item.clientName,
      trackingNo: item.incomingTrackingNo
    });

    setEditReturnForm({
      id: item.id,
      sNo: item.sNo,
      clientName: item.clientName,
      type: item.type || 'Exchange',
      reason: item.reason || 'Size',
      oldOrderId: cleanId,
      newOrderId: String(item.newOrderId || '').replace(/^#/, '').trim(),
      returnReceived: item.returnReceived || 'N',
      status: item.status || 'Open',
      replacementDone: item.replacementDone || 'N',
      region: item.region || 'Domestic',
      country: item.country || (item.storeTab === 'LLC' ? 'United States' : 'India'),
      incomingCourier: item.incomingCourier || 'Blue Dart',
      incomingTrackingNo: item.incomingTrackingNo || '',
      notes: item.notes || '',
      storeTab: item.storeTab || 'Global',
      receivingWarehouse: item.receivingWarehouse || (item.storeTab === 'LLC' ? 'US' : 'IN'),
      stockProduct: productVal,
      stockLeather: leatherVal,
      stockLast: lastVal,
      stockSole: soleVal,
      stockSize: sizeVal,
      stockWidth: widthVal,
      stockNotes: item.notes || extracted.notes || '',
      stockCustomization: 'N',
      stockCustomizationRemark: ''
    });

    setEditingReturnItem(item);
  };

  const handleAutoFetchEditOrderDetails = async (orderIdToFetch?: string) => {
    const targetId = String(orderIdToFetch !== undefined ? orderIdToFetch : editReturnForm.oldOrderId || '').replace(/^#/, '').trim();
    if (!targetId) return;

    setIsFetchingEditOrderDetails(true);
    try {
      const details = await lookupOrderProductDetailsAsync(targetId, {
        delinquencies: getDelinquencies(),
        shopifyOrders: getShopifyOrders(),
        returns: returns,
        dispatches: getDispatches(),
        bostonStock: getBostonStock()
      });

      setEditFetchedBaseline({
        product: details.product,
        leather: details.leather,
        last: details.last,
        sole: details.sole,
        size: details.size || '',
        width: details.width || 'E',
        customerName: details.customerName,
        trackingNo: details.trackingAwb
      });

      setEditReturnForm((prev: any) => ({
        ...prev,
        oldOrderId: targetId,
        clientName: details.customerName || prev.clientName,
        incomingTrackingNo: details.trackingAwb || prev.incomingTrackingNo,
        receivingWarehouse: details.warehouse,
        stockProduct: details.product,
        stockLeather: details.leather,
        stockLast: details.last,
        stockSole: details.sole,
        stockSize: details.size || prev.stockSize || '',
        stockWidth: details.width || prev.stockWidth || 'E',
        stockNotes: details.notes || prev.stockNotes || ''
      }));

      setEditOrderFetchFeedback(`Re-fetched: ${details.product} (${details.leather} • ${details.last} • ${details.sole} • ${details.size})`);
      setTimeout(() => setEditOrderFetchFeedback(null), 5000);
    } catch (err) {
      console.warn('Edit auto-fetch error:', err);
    } finally {
      setIsFetchingEditOrderDetails(false);
    }
  };

  const handleResetEditFieldToFetched = (field: 'product' | 'leather' | 'last' | 'sole' | 'size' | 'width') => {
    if (!editFetchedBaseline) return;
    if (field === 'product') setEditReturnForm((p: any) => ({ ...p, stockProduct: editFetchedBaseline.product }));
    if (field === 'leather') setEditReturnForm((p: any) => ({ ...p, stockLeather: editFetchedBaseline.leather }));
    if (field === 'last') setEditReturnForm((p: any) => ({ ...p, stockLast: editFetchedBaseline.last }));
    if (field === 'sole') setEditReturnForm((p: any) => ({ ...p, stockSole: editFetchedBaseline.sole }));
    if (field === 'size') setEditReturnForm((p: any) => ({ ...p, stockSize: editFetchedBaseline.size }));
    if (field === 'width') setEditReturnForm((p: any) => ({ ...p, stockWidth: editFetchedBaseline.width }));
  };

  const handleResetAllEditToFetched = () => {
    if (!editFetchedBaseline) return;
    setEditReturnForm((p: any) => ({
      ...p,
      stockProduct: editFetchedBaseline.product,
      stockLeather: editFetchedBaseline.leather,
      stockLast: editFetchedBaseline.last,
      stockSole: editFetchedBaseline.sole,
      stockSize: editFetchedBaseline.size,
      stockWidth: editFetchedBaseline.width,
      clientName: editFetchedBaseline.customerName || p.clientName,
      incomingTrackingNo: editFetchedBaseline.trackingNo || p.incomingTrackingNo
    }));
  };

  const handleSubmitEditReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editReturnForm.clientName || !editReturnForm.oldOrderId) {
      alert('Customer Name and Original Order ID are required');
      return;
    }

    const cleanOld = String(editReturnForm.oldOrderId).replace(/^#/, '').trim();
    const cleanNew = String(editReturnForm.newOrderId || '').replace(/^#/, '').trim();
    const isUs = editReturnForm.storeTab === 'LLC' || editReturnForm.receivingWarehouse === 'US' || cleanOld.toUpperCase().startsWith('US');
    const targetTable = editReturnForm.storeTab === 'LLC' ? 'returns_llc' : 'returns_global';

    const payload: any = {
      id: editReturnForm.id,
      serial_number: editReturnForm.sNo,
      customer_name: editReturnForm.clientName,
      clientName: editReturnForm.clientName,
      return_type: editReturnForm.type,
      type: editReturnForm.type,
      reason: editReturnForm.reason,
      old_order_id: cleanOld,
      oldOrderId: cleanOld,
      new_order_id: cleanNew,
      newOrderId: cleanNew,
      old_size: editReturnForm.stockSize,
      oldSize: editReturnForm.stockSize,
      product: editReturnForm.stockProduct,
      leather: editReturnForm.stockLeather,
      last: editReturnForm.stockLast,
      sole: editReturnForm.stockSole,
      width: editReturnForm.stockWidth,
      return_received: editReturnForm.returnReceived,
      returnReceived: editReturnForm.returnReceived,
      status: editReturnForm.status,
      replacement_done: editReturnForm.replacementDone,
      replacementDone: editReturnForm.replacementDone,
      incoming_courier_name: editReturnForm.incomingCourier,
      incomingCourier: editReturnForm.incomingCourier,
      incoming_tracking_awb: editReturnForm.incomingTrackingNo,
      incomingTrackingNo: editReturnForm.incomingTrackingNo,
      region: editReturnForm.region,
      country: editReturnForm.country,
      remarks: editReturnForm.stockNotes || editReturnForm.notes || '',
      notes: editReturnForm.stockNotes || editReturnForm.notes || '',
      storeTab: editReturnForm.storeTab
    };

    try {
      if (onUpdateReturn) {
        await onUpdateReturn(payload);
      } else {
        await updateReturn(targetTable, editReturnForm.id, payload);
      }

      // If marked received, sync to return stock inventory
      if ((editReturnForm.returnReceived || '').toUpperCase() === 'Y') {
        try {
          const stockTable = isUs ? 'return_stock_us' : 'return_stock_in';
          const existingStock = await fetchReturnStock(stockTable);
          const match = existingStock.find((s: any) => String(s.order_id).replace(/^#/, '').trim() === cleanOld);
          const stockPayload = {
            order_id: cleanOld,
            item_name: editReturnForm.stockProduct,
            product: editReturnForm.stockProduct,
            leather: editReturnForm.stockLeather,
            last: editReturnForm.stockLast,
            sole: editReturnForm.stockSole,
            size: editReturnForm.stockSize || 'Standard Size',
            width: editReturnForm.stockWidth || 'E',
            notes: editReturnForm.stockNotes || editReturnForm.notes || '',
            customization: editReturnForm.stockCustomization || 'N',
            customization_remark: editReturnForm.stockCustomizationRemark || '',
            return_tracking_awb: editReturnForm.incomingTrackingNo || '',
            warehouse: isUs ? 'US' : 'IN'
          };
          if (match) {
            await updateReturnStock(stockTable, match.id, stockPayload);
          } else {
            await insertReturnStock(stockTable, {
              ...stockPayload,
              serial_number: existingStock.length + 1,
              receiving_date: new Date().toISOString().split('T')[0]
            });
          }
        } catch (stockErr) {
          console.warn('Sync to return stock in edit warning:', stockErr);
        }
      }

      setEditingReturnItem(null);
    } catch (err: any) {
      alert(`Failed to update return: ${err.message}`);
    }
  };

  // Unique filter lists
  const statuses = useMemo(() => {
    const set = new Set<string>();
    returns.forEach(r => { if (r.status) set.add(r.status.trim()); });
    return Array.from(set).slice(0, 10);
  }, [returns]);

  const types = useMemo(() => {
    const set = new Set<string>();
    returns.forEach(r => { if (r.type) set.add(r.type.trim()); });
    return Array.from(set).filter(t => t.length > 0).slice(0, 8);
  }, [returns]);

  const filtered = useMemo(() => {
    return returns.filter(r => {
      if (selectedStatus !== 'all' && !r.status.toLowerCase().includes(selectedStatus.toLowerCase())) return false;
      if (selectedType !== 'all' && !r.type.toLowerCase().includes(selectedType.toLowerCase())) return false;
      if (selectedReason !== 'all' && !r.reason.toLowerCase().includes(selectedReason.toLowerCase())) return false;
      if (selectedRegion !== 'all' && !r.region.toLowerCase().includes(selectedRegion.toLowerCase())) return false;
      if (selectedReceived !== 'all') {
        const isYes = r.returnReceived.toLowerCase().includes('yes') || r.returnReceived.toLowerCase().includes('yas') || r.returnReceived.toLowerCase() === 'y';
        if (selectedReceived === 'yes' && !isYes) return false;
        if (selectedReceived === 'no' && isYes) return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          r.clientName.toLowerCase().includes(q) ||
          r.oldOrderId.toLowerCase().includes(q) ||
          r.newOrderId.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q) ||
          r.country.toLowerCase().includes(q) ||
          r.notes.toLowerCase().includes(q) ||
          r.incomingTrackingNo.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [returns, selectedStatus, selectedType, selectedReason, selectedRegion, selectedReceived, search]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  const handleExport = () => {
    exportToCsv(filtered, `returns-tracker-export-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleSubmitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReturn.clientName || !newReturn.oldOrderId) {
      alert('Client Name and Order ID are required');
      return;
    }

    // Cross-store mismatch validation check
    const cleanOrderId = newReturn.oldOrderId.toUpperCase().trim();
    const isLlcOrder = cleanOrderId.startsWith('US') || cleanOrderId.includes('USBLKBRD');

    if (newReturn.storeTab === 'Global' && isLlcOrder) {
      const proceed = window.confirm(
        `Warning: Order ID "${newReturn.oldOrderId}" appears to be an LLC (USBLKBRD) order, but you are logging it under the Global Store tab.\n\nDo you want to proceed anyway?`
      );
      if (!proceed) return;
    } else if (newReturn.storeTab === 'LLC' && !isLlcOrder) {
      const proceed = window.confirm(
        `Warning: Order ID "${newReturn.oldOrderId}" appears to be a Global (BLKBRD) order, but you are logging it under the LLC Store tab.\n\nDo you want to proceed anyway?`
      );
      if (!proceed) return;
    }

    const shoeSpecs: string[] = [];
    if (newReturn.stockProduct) shoeSpecs.push(`Product: ${newReturn.stockProduct}`);
    if (newReturn.stockLeather) shoeSpecs.push(`Leather: ${newReturn.stockLeather}`);
    if (newReturn.stockLast) shoeSpecs.push(`Last: ${newReturn.stockLast}`);
    if (newReturn.stockSole) shoeSpecs.push(`Sole: ${newReturn.stockSole}`);
    if (newReturn.stockWidth) shoeSpecs.push(`Width: ${newReturn.stockWidth}`);

    let combinedRemarks = newReturn.notes || '';
    if (shoeSpecs.length > 0) {
      const specsStr = shoeSpecs.join(' • ');
      combinedRemarks = combinedRemarks ? `${combinedRemarks} [${specsStr}]` : `[${specsStr}]`;
    }

    const payload = {
      serial_number: returns.length + 1,
      customer_name: newReturn.clientName,
      return_type: newReturn.type || 'Exchange',
      reason: newReturn.reason || 'Size Issue',
      old_order_id: newReturn.oldOrderId.replace(/^#/, '').trim(),
      new_order_id: newReturn.newOrderId ? newReturn.newOrderId.replace(/^#/, '').trim() : '',
      old_size: newReturn.stockSize || '',
      new_size: '',
      return_received: newReturn.returnReceived || 'N',
      status: newReturn.status || 'Open',
      replacement_done: 'N',
      return_initiated: new Date().toISOString().slice(0, 10),
      targeted_date: null,
      incoming_courier_name: newReturn.incomingCourier || '',
      incoming_tracking_awb: newReturn.incomingTrackingNo || '',
      exchange_tracking_awb: '',
      region: newReturn.region || 'Domestic',
      country: newReturn.country || 'India',
      created_by: 'Dashboard User',
      remarks: combinedRemarks,
      stockProduct: newReturn.stockProduct,
      stockLeather: newReturn.stockLeather,
      stockLast: newReturn.stockLast,
      stockSole: newReturn.stockSole,
      stockWidth: newReturn.stockWidth,
      storeTab: newReturn.storeTab || 'Global'
    };

    try {
      await onAddReturn(payload);

      // Automatically sync to return stock if marked as Received (Y) with explicit warehouse routing
      if (newReturn.returnReceived === 'Y') {
        try {
          const isUsWarehouse = newReturn.receivingWarehouse === 'US';
          const stockTable = isUsWarehouse ? 'return_stock_us' : 'return_stock_in';

          await insertReturnStock(stockTable, {
            serial_number: returns.length + 1,
            receiving_date: new Date().toISOString().split('T')[0],
            order_id: payload.old_order_id,
            item_name: newReturn.stockProduct || `Return Item (${payload.return_type})`,
            product: newReturn.stockProduct || `Return Item (${payload.return_type})`,
            leather: newReturn.stockLeather || '',
            last: newReturn.stockLast || '',
            sole: newReturn.stockSole || '',
            size: newReturn.stockSize || 'Standard Size',
            width: newReturn.stockWidth || 'E',
            notes: newReturn.stockNotes || payload.remarks || '',
            customization: newReturn.stockCustomization,
            customization_remark: newReturn.stockCustomizationRemark || payload.remarks || 'Auto-logged from Returns Tracker',
            return_tracking_awb: payload.incoming_tracking_awb,
            warehouse: isUsWarehouse ? 'US' : 'IN'
          });
        } catch (stockErr) {
          console.warn('Auto-sync return to stock inventory warning:', stockErr);
        }
      }

      setIsAddOpen(false);
      setNewReturn({
        clientName: '',
        type: 'Exchange',
        reason: 'Size Small',
        oldOrderId: '',
        newOrderId: '',
        returnReceived: 'N',
        receivingWarehouse: 'IN',
        stockProduct: '',
        stockLeather: '',
        stockLast: '',
        stockSole: '',
        stockSize: '',
        stockWidth: 'E',
        stockNotes: '',
        stockCustomization: 'N',
        stockCustomizationRemark: '',
        status: 'Open',
        region: 'Domestic',
        country: 'India',
        incomingCourier: 'Blue Dart',
        incomingTrackingNo: '',
        notes: '',
        storeTab: 'Global'
      });
    } catch (err: any) {
      alert(`Failed to log return: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4" id="returns-tracker-view">
      {/* Header Bar */}
      <div className="bg-white rounded-xl border border-gray-200/80 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-100 text-amber-800 rounded-md">
                <RotateCcw className="w-4 h-4" />
              </span>
              <h2 className="text-base font-semibold text-gray-900">Returns &amp; Exchanges Tracker</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                {returns.length} Records
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Complete returns pipeline, replacement tracking, size exchanges, and incoming courier parcels.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-medium text-gray-700 flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export ({filtered.length})
            </button>
            <button
              onClick={() => setIsAddOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Log Return
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search client, order, reason, country, notes..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Region */}
          <select
            value={selectedRegion}
            onChange={(e) => {
              setSelectedRegion(e.target.value);
              setCurrentPage(1);
            }}
            className="py-1.5 px-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500"
          >
            <option value="all">All Regions</option>
            <option value="domestic">Domestic</option>
            <option value="international">International</option>
          </select>

          {/* Type */}
          <select
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setCurrentPage(1);
            }}
            className="py-1.5 px-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500"
          >
            <option value="all">All Return Types</option>
            {types.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Physical Return Received */}
          <select
            value={selectedReceived}
            onChange={(e) => {
              setSelectedReceived(e.target.value);
              setCurrentPage(1);
            }}
            className="py-1.5 px-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500"
          >
            <option value="all">All Received States</option>
            <option value="yes">Physical Received (Yes)</option>
            <option value="no">Pending Received (No)</option>
          </select>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-3">#</th>
                <th className="py-3 px-3">Client</th>
                <th className="py-3 px-3">Original Order</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Reason</th>
                <th className="py-3 px-3">Physical Recv?</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Replacement Order</th>
                <th className="py-3 px-3">Region / Country</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-gray-500">
                    No returns found matching your query
                  </td>
                </tr>
              ) : (
                paginated.map((item) => {
                  const isRecv = item.returnReceived.toLowerCase().includes('yes') || item.returnReceived.toLowerCase().includes('yas') || item.returnReceived.toLowerCase() === 'y';
                  const isClosed = item.status.toLowerCase().includes('closed') || item.status.toLowerCase().includes('sent');

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setDetailItem(item)}
                      className="hover:bg-amber-50/30 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 text-gray-400 font-mono">{item.sNo}</td>
                      <td className="py-2.5 px-3 font-medium text-gray-900 truncate max-w-[150px]">
                        {item.clientName}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-gray-800">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (item.oldOrderId) onSelectOrder(item.oldOrderId);
                          }}
                          className="hover:underline text-indigo-700 font-mono cursor-pointer"
                        >
                          {item.oldOrderId || '—'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-800">
                          {item.type || 'Exchange'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-700 truncate max-w-[160px]" title={item.reason}>
                        {item.reason}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          isRecv ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {isRecv ? 'Yes' : 'No / Pending'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                          isClosed
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-50 text-amber-900 border border-amber-200'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {item.newOrderId ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectOrder(item.newOrderId);
                            }}
                            className="font-bold text-amber-900 hover:underline cursor-pointer"
                          >
                            {item.newOrderId}
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">
                        <span className="inline-flex items-center gap-1">
                          {item.region.toLowerCase().includes('domestic') ? (
                            <MapPin className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Globe className="w-3 h-3 text-blue-600" />
                          )}
                          {item.country || item.region}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditReturnModal(item);
                            }}
                            className="text-xs text-indigo-700 hover:text-indigo-900 font-semibold cursor-pointer flex items-center gap-1 hover:underline"
                            title="Edit return case & footwear details"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailItem(item);
                            }}
                            className="text-xs text-amber-700 hover:text-amber-900 font-semibold cursor-pointer"
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="py-3 px-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600">
          <div>
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} entries
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-white cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 py-0.5 font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-white cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Row Detail Modal */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 relative">
            <button
              onClick={() => setDetailItem(null)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-amber-800 mb-4">
              <RotateCcw className="w-5 h-5" />
              <h3 className="text-base font-bold text-gray-900">Return Case #{detailItem.sNo} Details</h3>
            </div>

            <div className="space-y-3 text-xs text-gray-700">
              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="text-gray-500 block">Customer Name</span>
                  <span className="font-bold text-gray-900 text-sm">{detailItem.clientName}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Original Order ID</span>
                  <span className="font-mono font-bold text-indigo-700 text-sm">{detailItem.oldOrderId}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Replacement Order</span>
                  <span className="font-mono font-bold text-amber-800">{detailItem.newOrderId || 'None'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Type &amp; Status</span>
                  <span className="font-semibold text-gray-900">{detailItem.type} — {detailItem.status}</span>
                </div>
              </div>

              <div>
                <span className="text-gray-500 block font-medium">Return Reason</span>
                <p className="mt-0.5 p-2 bg-amber-50/50 rounded border border-amber-200 text-gray-800">
                  {detailItem.reason}
                </p>
              </div>

              {detailItem.notes && (
                <div>
                  <span className="text-gray-500 block font-medium">Internal Notes</span>
                  <p className="mt-0.5 p-2 bg-gray-50 rounded border border-gray-200 text-gray-800 italic">
                    "{detailItem.notes}"
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                <div>
                  <span className="text-gray-500 block">Physical Return Received:</span>
                  <span className="font-bold">{detailItem.returnReceived}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Region:</span>
                  <span>{detailItem.region} ({detailItem.country})</span>
                </div>
                {detailItem.incomingCourier && (
                  <div>
                    <span className="text-gray-500 block">Courier:</span>
                    <span>{detailItem.incomingCourier}</span>
                  </div>
                )}
                {detailItem.incomingTrackingNo && (
                  <div>
                    <span className="text-gray-500 block">Tracking No:</span>
                    <span className="font-mono">{detailItem.incomingTrackingNo}</span>
                  </div>
                )}
                {detailItem.createdBy && (
                  <div className="col-span-2 text-gray-400 text-[11px] pt-1">
                    Logged by: {detailItem.createdBy}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  const target = detailItem;
                  setDetailItem(null);
                  openEditReturnModal(target);
                }}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Case &amp; Footwear Specs</span>
              </button>
              <button
                onClick={() => {
                  onSelectOrder(detailItem.oldOrderId || detailItem.newOrderId);
                  setDetailItem(null);
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs cursor-pointer"
              >
                Inspect in Order 360
              </button>
              <button
                onClick={() => setDetailItem(null)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Return Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setIsAddOpen(false)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-gray-900 mb-4">Log New Return / Exchange</h3>

            <form onSubmit={handleSubmitNew} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-gray-700 mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={newReturn.clientName}
                  onChange={(e) => setNewReturn({ ...newReturn, clientName: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Store Destination *</label>
                  <select
                    value={newReturn.storeTab}
                    onChange={(e) => setNewReturn({ ...newReturn, storeTab: e.target.value as any })}
                    className="w-full p-2 border border-gray-300 rounded-md font-medium"
                  >
                    <option value="Global">Global Tab (BLKBRD)</option>
                    <option value="LLC">LLC Tab (USBLKBRD)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Region</label>
                  <select
                    value={newReturn.region}
                    onChange={(e) => setNewReturn({ ...newReturn, region: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  >
                    <option value="Domestic">Domestic</option>
                    <option value="International">International</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-medium text-gray-700">Original Order ID *</label>
                    <button
                      type="button"
                      onClick={() => handleAutoFetchOrderDetails()}
                      disabled={isFetchingOrderDetails}
                      className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Fetch product, leather, last, sole, size and width from order details"
                    >
                      <Sparkles className={`w-3 h-3 ${isFetchingOrderDetails ? 'animate-spin' : ''}`} />
                      <span>{isFetchingOrderDetails ? 'Fetching...' : 'Auto-fetch'}</span>
                    </button>
                  </div>

                  {/* Quick Order Selection Dropdown */}
                  <select
                    value={availableOrdersForSelection.some(o => o.orderId.toLowerCase() === newReturn.oldOrderId.replace(/^#/, '').trim().toLowerCase()) ? newReturn.oldOrderId.replace(/^#/, '').trim() : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        setNewReturn(prev => ({ ...prev, oldOrderId: val }));
                        handleAutoFetchOrderDetails(val);
                      }
                    }}
                    className="w-full p-1.5 mb-1.5 border border-amber-300 bg-amber-50/70 rounded-md text-xs font-semibold text-amber-950"
                  >
                    <option value="">-- Quick Select from Orders ({availableOrdersForSelection.length}) --</option>
                    {availableOrdersForSelection.map(o => (
                      <option key={o.orderId} value={o.orderId}>
                        #{o.orderId} {o.customerName ? `• ${o.customerName}` : ''} ({o.product.slice(0, 24)})
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    required
                    list="returns-tracker-orders-list"
                    value={newReturn.oldOrderId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewReturn(prev => ({ ...prev, oldOrderId: val }));
                      const clean = val.replace(/^#/, '').trim();
                      if (clean.length >= 3 && availableOrdersForSelection.some(o => o.orderId.toLowerCase() === clean.toLowerCase())) {
                        handleAutoFetchOrderDetails(clean);
                      }
                    }}
                    onBlur={(e) => handleAutoFetchOrderDetails(e.target.value)}
                    placeholder="e.g. BLKBRD9999 or 39420"
                    className="w-full p-2 border border-gray-300 rounded-md font-mono"
                  />
                  <datalist id="returns-tracker-orders-list">
                    {availableOrdersForSelection.map(o => (
                      <option key={o.orderId} value={o.orderId}>
                        {o.customerName ? `${o.customerName} — ` : ''}{o.product}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Replacement Order ID</label>
                  <input
                    type="text"
                    value={newReturn.newOrderId}
                    onChange={(e) => setNewReturn({ ...newReturn, newOrderId: e.target.value })}
                    placeholder="e.g. BLKBRD10050"
                    className="w-full p-2 border border-gray-300 rounded-md font-mono"
                  />
                </div>
              </div>

              {/* Feedback badge when order details are auto-filled */}
              {orderFetchFeedback && (
                <div className="py-1.5 px-3 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-[11px] font-medium flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{orderFetchFeedback}</span>
                </div>
              )}

              {/* Footwear & Product Parameters (Auto-Filled from Product Database Record with Full Edit Capabilities) */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-300/80 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide flex items-center gap-1.5">
                    <span>📦 Footwear Parameters (Fetched Details)</span>
                    {fetchedBaseline && (
                      <span className="text-[9px] font-medium bg-emerald-200/70 text-emerald-900 px-1.5 py-0.5 rounded-full">
                        Editable
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {fetchedBaseline && (
                      <button
                        type="button"
                        onClick={handleResetAllToFetched}
                        className="text-[10px] font-semibold text-emerald-800 hover:text-emerald-950 bg-emerald-100/90 hover:bg-emerald-200 px-2 py-0.5 rounded-md border border-emerald-300 flex items-center gap-1 cursor-pointer transition"
                        title="Revert all footwear parameters back to fetched order specifications"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Reset All to Fetched</span>
                      </button>
                    )}
                    <span className="text-[10px] text-emerald-800 font-medium bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                      {newReturn.oldOrderId ? `Order #${newReturn.oldOrderId.replace(/^#/, '')}` : 'Auto-fetches on selection'}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Product */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-emerald-900">Product *</label>
                      {fetchedBaseline && newReturn.stockProduct !== fetchedBaseline.product && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                          <button
                            type="button"
                            onClick={() => handleResetFieldToFetched('product')}
                            title="Reset product to fetched value"
                            className="text-gray-400 hover:text-amber-800 cursor-pointer"
                          >
                            <Undo2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      list="tracker-products-list"
                      placeholder="e.g. Henrik Penny Loafer"
                      value={newReturn.stockProduct}
                      onChange={(e) => setNewReturn({ ...newReturn, stockProduct: e.target.value })}
                      className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs font-medium"
                    />
                    <datalist id="tracker-products-list">
                      {Object.values(PRODUCT_DATABASE_RECORDS).map(r => (
                        <option key={r.modelName} value={r.modelName} />
                      ))}
                    </datalist>
                  </div>

                  {/* Leather */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-emerald-900">Leather *</label>
                      {fetchedBaseline && newReturn.stockLeather !== fetchedBaseline.leather && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                          <button
                            type="button"
                            onClick={() => handleResetFieldToFetched('leather')}
                            title="Reset leather to fetched value"
                            className="text-gray-400 hover:text-amber-800 cursor-pointer"
                          >
                            <Undo2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      list="tracker-leathers-list"
                      placeholder="e.g. Snuff Suede / French Boxcalf"
                      value={newReturn.stockLeather}
                      onChange={(e) => setNewReturn({ ...newReturn, stockLeather: e.target.value })}
                      className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs"
                    />
                    <datalist id="tracker-leathers-list">
                      {COMMON_LEATHERS.map(l => (
                        <option key={l} value={l} />
                      ))}
                    </datalist>
                    {/* Quick suggestion chips */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {['Snuff Suede', 'French Boxcalf Black', 'Museum Calf Espresso', 'Dark Oak Crust'].map(l => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setNewReturn(p => ({ ...p, stockLeather: l }))}
                          className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition ${newReturn.stockLeather === l ? 'bg-emerald-600 text-white font-semibold' : 'bg-white/80 hover:bg-white text-emerald-900 border border-emerald-200'}`}
                        >
                          {l.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Last */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-emerald-900">Last *</label>
                      {fetchedBaseline && newReturn.stockLast !== fetchedBaseline.last && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                          <button
                            type="button"
                            onClick={() => handleResetFieldToFetched('last')}
                            title="Reset last to fetched value"
                            className="text-gray-400 hover:text-amber-800 cursor-pointer"
                          >
                            <Undo2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      list="tracker-lasts-list"
                      placeholder="e.g. Rui Last / Oscar Last"
                      value={newReturn.stockLast}
                      onChange={(e) => setNewReturn({ ...newReturn, stockLast: e.target.value })}
                      className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs"
                    />
                    <datalist id="tracker-lasts-list">
                      {COMMON_LASTS.map(lt => (
                        <option key={lt} value={lt} />
                      ))}
                    </datalist>
                    {/* Quick suggestion chips */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {['Rui Last', 'Oscar Last', 'Ben Last', 'Classic Last'].map(lt => (
                        <button
                          key={lt}
                          type="button"
                          onClick={() => setNewReturn(p => ({ ...p, stockLast: lt }))}
                          className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition ${newReturn.stockLast === lt ? 'bg-emerald-600 text-white font-semibold' : 'bg-white/80 hover:bg-white text-emerald-900 border border-emerald-200'}`}
                        >
                          {lt.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sole */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-emerald-900">Sole *</label>
                      {fetchedBaseline && newReturn.stockSole !== fetchedBaseline.sole && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                          <button
                            type="button"
                            onClick={() => handleResetFieldToFetched('sole')}
                            title="Reset sole to fetched value"
                            className="text-gray-400 hover:text-amber-800 cursor-pointer"
                          >
                            <Undo2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      list="tracker-soles-list"
                      placeholder="e.g. Dainite Sole / Vibram Commando"
                      value={newReturn.stockSole}
                      onChange={(e) => setNewReturn({ ...newReturn, stockSole: e.target.value })}
                      className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs"
                    />
                    <datalist id="tracker-soles-list">
                      {COMMON_SOLES.map(s => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                    {/* Quick suggestion chips */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {['Single Leather Sole', 'Dainite Sole', 'Vibram Commando'].map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setNewReturn(p => ({ ...p, stockSole: s }))}
                          className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition ${newReturn.stockSole === s ? 'bg-emerald-600 text-white font-semibold' : 'bg-white/80 hover:bg-white text-emerald-900 border border-emerald-200'}`}
                        >
                          {s.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Size */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-emerald-900">Size *</label>
                      {fetchedBaseline && newReturn.stockSize !== fetchedBaseline.size && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                          <button
                            type="button"
                            onClick={() => handleResetFieldToFetched('size')}
                            title="Reset size to fetched value"
                            className="text-gray-400 hover:text-amber-800 cursor-pointer"
                          >
                            <Undo2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. UK 9 / US 9.5"
                      value={newReturn.stockSize}
                      onChange={(e) => setNewReturn({ ...newReturn, stockSize: e.target.value })}
                      className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs font-mono font-semibold"
                    />
                    {/* Quick size presets */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {['UK 8', 'UK 8.5', 'UK 9', 'UK 9.5', 'UK 10', 'US 9.5'].map(sz => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setNewReturn(p => ({ ...p, stockSize: sz }))}
                          className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition ${newReturn.stockSize === sz ? 'bg-emerald-600 text-white font-semibold' : 'bg-white/80 hover:bg-white text-emerald-900 border border-emerald-200'}`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Width */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-emerald-900">Width *</label>
                      {fetchedBaseline && newReturn.stockWidth !== fetchedBaseline.width && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                          <button
                            type="button"
                            onClick={() => handleResetFieldToFetched('width')}
                            title="Reset width to fetched value"
                            className="text-gray-400 hover:text-amber-800 cursor-pointer"
                          >
                            <Undo2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <select
                      value={newReturn.stockWidth}
                      onChange={(e) => setNewReturn({ ...newReturn, stockWidth: e.target.value as ShoeWidth })}
                      className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs font-semibold"
                    >
                      {SHOE_WIDTHS.map(w => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-emerald-900 mb-1">Stock Notes</label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Return inspection notes, fit remarks, defect tags..."
                      value={newReturn.stockNotes}
                      onChange={(e) => setNewReturn({ ...newReturn, stockNotes: e.target.value, notes: e.target.value })}
                      className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs resize-none"
                    />
                  </div>

                  {newReturn.returnReceived === 'Y' && (
                    <>
                      <div>
                        <label className="block text-[11px] font-semibold text-emerald-900 mb-1">Customization *</label>
                        <select
                          value={newReturn.stockCustomization}
                          onChange={(e) => setNewReturn({ ...newReturn, stockCustomization: e.target.value as any })}
                          className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs font-semibold"
                        >
                          <option value="N">No (N)</option>
                          <option value="Y">Yes (Y)</option>
                        </select>
                      </div>

                      {newReturn.stockCustomization === 'Y' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-emerald-900 mb-1">Customization Remark</label>
                          <input
                            type="text"
                            placeholder="e.g. Brass initials on sole"
                            value={newReturn.stockCustomizationRemark}
                            onChange={(e) => setNewReturn({ ...newReturn, stockCustomizationRemark: e.target.value })}
                            className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Return Type</label>
                  <select
                    value={newReturn.type}
                    onChange={(e) => setNewReturn({ ...newReturn, type: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  >
                    <option value="Exchange">Exchange</option>
                    <option value="Extra Insole">Extra Insole</option>
                    <option value="Replacement">Replacement</option>
                    <option value="Resole">Resole</option>
                    <option value="Repair">Repair</option>
                    <option value="Trial">Trial</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={newReturn.status}
                    onChange={(e) => setNewReturn({ ...newReturn, status: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  >
                    <option value="Open">Open</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Return Received?</label>
                  <select
                    value={newReturn.returnReceived}
                    onChange={(e) => setNewReturn({ ...newReturn, returnReceived: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md font-medium"
                  >
                    <option value="N">No (Pending)</option>
                    <option value="Y">Yes (Received)</option>
                  </select>
                </div>
                {newReturn.returnReceived === 'Y' && (
                  <div>
                    <label className="block font-medium text-emerald-700 mb-1">Received Location *</label>
                    <select
                      value={newReturn.receivingWarehouse}
                      onChange={(e) => setNewReturn({ ...newReturn, receivingWarehouse: e.target.value as any })}
                      className="w-full p-2 border border-emerald-300 bg-emerald-50 rounded-md font-semibold text-emerald-900"
                    >
                      <option value="IN">India Workshop (IN)</option>
                      <option value="US">US Boston Stock (US)</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-medium text-gray-700 mb-1">Reason</label>
                <input
                  type="text"
                  value={newReturn.reason}
                  onChange={(e) => setNewReturn({ ...newReturn, reason: e.target.value })}
                  placeholder="e.g. Size Small, Heel Slip, Color shade"
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={newReturn.notes}
                  onChange={(e) => setNewReturn({ ...newReturn, notes: e.target.value })}
                  placeholder="Additional customer comments, requested size, etc."
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md font-medium text-gray-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-md shadow-xs cursor-pointer"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Return Case & Footwear Details Modal */}
      {editingReturnItem && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setEditingReturnItem(null)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 bg-indigo-100 text-indigo-800 rounded-lg">
                <Edit2 className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Edit Return Case #{editReturnForm.sNo}
                </h3>
                <p className="text-[11px] text-gray-500">
                  Modify case parameters and edit or re-fetch footwear specifications from the order database.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitEditReturn} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-gray-700 mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={editReturnForm.clientName || ''}
                  onChange={(e) => setEditReturnForm({ ...editReturnForm, clientName: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Store Destination *</label>
                  <select
                    value={editReturnForm.storeTab || 'Global'}
                    onChange={(e) => setEditReturnForm({ ...editReturnForm, storeTab: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md font-medium"
                  >
                    <option value="Global">Global Tab (BLKBRD)</option>
                    <option value="LLC">LLC Tab (USBLKBRD)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Region</label>
                  <select
                    value={editReturnForm.region || 'Domestic'}
                    onChange={(e) => setEditReturnForm({ ...editReturnForm, region: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  >
                    <option value="Domestic">Domestic</option>
                    <option value="International">International</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-medium text-gray-700">Original Order ID *</label>
                    <button
                      type="button"
                      onClick={() => handleAutoFetchEditOrderDetails()}
                      disabled={isFetchingEditOrderDetails}
                      className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Re-fetch footwear details from this order"
                    >
                      <Sparkles className={`w-3 h-3 ${isFetchingEditOrderDetails ? 'animate-spin' : ''}`} />
                      <span>{isFetchingEditOrderDetails ? 'Fetching...' : 'Re-fetch'}</span>
                    </button>
                  </div>

                  {/* Quick Order Selection */}
                  <select
                    value={availableOrdersForSelection.some(o => o.orderId.toLowerCase() === String(editReturnForm.oldOrderId || '').replace(/^#/, '').trim().toLowerCase()) ? String(editReturnForm.oldOrderId || '').replace(/^#/, '').trim() : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        setEditReturnForm((prev: any) => ({ ...prev, oldOrderId: val }));
                        handleAutoFetchEditOrderDetails(val);
                      }
                    }}
                    className="w-full p-1.5 mb-1.5 border border-indigo-200 bg-indigo-50/60 rounded-md text-xs font-semibold text-indigo-950"
                  >
                    <option value="">-- Pick from Orders ({availableOrdersForSelection.length}) --</option>
                    {availableOrdersForSelection.map(o => (
                      <option key={o.orderId} value={o.orderId}>
                        #{o.orderId} {o.customerName ? `• ${o.customerName}` : ''} ({o.product.slice(0, 24)})
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    required
                    value={editReturnForm.oldOrderId || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditReturnForm({ ...editReturnForm, oldOrderId: val });
                      const clean = val.replace(/^#/, '').trim();
                      if (clean.length >= 3 && availableOrdersForSelection.some(o => o.orderId.toLowerCase() === clean.toLowerCase())) {
                        handleAutoFetchEditOrderDetails(clean);
                      }
                    }}
                    placeholder="e.g. 10050 or BLKBRD9999"
                    className="w-full p-2 border border-gray-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Replacement Order ID</label>
                  <input
                    type="text"
                    value={editReturnForm.newOrderId || ''}
                    onChange={(e) => setEditReturnForm({ ...editReturnForm, newOrderId: e.target.value })}
                    placeholder="e.g. BLKBRD10120"
                    className="w-full p-2 border border-gray-300 rounded-md font-mono"
                  />
                </div>
              </div>

              {/* Feedback badge when order details are auto-filled */}
              {editOrderFetchFeedback && (
                <div className="py-1.5 px-3 bg-indigo-50 border border-indigo-300 rounded-lg text-indigo-900 text-[11px] font-medium flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>{editOrderFetchFeedback}</span>
                </div>
              )}

              {/* Footwear Parameters Section with Edit Capabilities */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-300/80 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide flex items-center gap-1.5">
                    <span>📦 Footwear Parameters (Fetched Details)</span>
                    <span className="text-[9px] font-medium bg-emerald-200/70 text-emerald-900 px-1.5 py-0.5 rounded-full">
                      Editable
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {editFetchedBaseline && (
                      <button
                        type="button"
                        onClick={handleResetAllEditToFetched}
                        className="text-[10px] font-semibold text-emerald-800 hover:text-emerald-950 bg-emerald-100/90 hover:bg-emerald-200 px-2 py-0.5 rounded-md border border-emerald-300 flex items-center gap-1 cursor-pointer transition"
                        title="Revert all parameters back to fetched order baseline"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Reset to Fetched</span>
                      </button>
                    )}
                    <span className="text-[10px] text-emerald-800 font-medium bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                      #{editReturnForm.oldOrderId ? String(editReturnForm.oldOrderId).replace(/^#/, '') : 'Order'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Product */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-emerald-900">Product *</label>
                      {editFetchedBaseline && editReturnForm.stockProduct !== editFetchedBaseline.product && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                          <button
                            type="button"
                            onClick={() => handleResetEditFieldToFetched('product')}
                            title="Reset to fetched"
                            className="text-gray-400 hover:text-amber-800 cursor-pointer"
                          >
                            <Undo2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      list="edit-products-list"
                      placeholder="e.g. Henrik Penny Loafer"
                      value={editReturnForm.stockProduct || ''}
                      onChange={(e) => setEditReturnForm({ ...editReturnForm, stockProduct: e.target.value })}
                      className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs font-medium"
                    />
                    <datalist id="edit-products-list">
                      {Object.values(PRODUCT_DATABASE_RECORDS).map(r => (
                        <option key={r.modelName} value={r.modelName} />
                      ))}
                    </datalist>
                  </div>

                  {/* Leather */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-emerald-900">Leather *</label>
                      {editFetchedBaseline && editReturnForm.stockLeather !== editFetchedBaseline.leather && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                          <button
                            type="button"
                            onClick={() => handleResetEditFieldToFetched('leather')}
                            title="Reset to fetched"
                            className="text-gray-400 hover:text-amber-800 cursor-pointer"
                          >
                            <Undo2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      list="edit-leathers-list"
                      placeholder="e.g. Snuff Suede / French Boxcalf"
                      value={editReturnForm.stockLeather || ''}
                      onChange={(e) => setEditReturnForm({ ...editReturnForm, stockLeather: e.target.value })}
                      className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs"
                    />
                    <datalist id="edit-leathers-list">
                      {COMMON_LEATHERS.map(l => (
                        <option key={l} value={l} />
                      ))}
                    </datalist>
                    {/* Quick suggestion chips */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {['Snuff Suede', 'French Boxcalf Black', 'Museum Calf Espresso', 'Dark Oak Crust'].map(l => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setEditReturnForm((p: any) => ({ ...p, stockLeather: l }))}
                          className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition ${editReturnForm.stockLeather === l ? 'bg-emerald-600 text-white font-semibold' : 'bg-white/80 hover:bg-white text-emerald-900 border border-emerald-200'}`}
                        >
                          {l.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Last */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-emerald-900">Last *</label>
                      {editFetchedBaseline && editReturnForm.stockLast !== editFetchedBaseline.last && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                          <button
                            type="button"
                            onClick={() => handleResetEditFieldToFetched('last')}
                            title="Reset to fetched"
                            className="text-gray-400 hover:text-amber-800 cursor-pointer"
                          >
                            <Undo2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      list="edit-lasts-list"
                      placeholder="e.g. Rui Last / Oscar Last"
                      value={editReturnForm.stockLast || ''}
                      onChange={(e) => setEditReturnForm({ ...editReturnForm, stockLast: e.target.value })}
                      className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs"
                    />
                    <datalist id="edit-lasts-list">
                      {COMMON_LASTS.map(lt => (
                        <option key={lt} value={lt} />
                      ))}
                    </datalist>
                    {/* Quick suggestion chips */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {['Rui Last', 'Oscar Last', 'Ben Last', 'Classic Last'].map(lt => (
                        <button
                          key={lt}
                          type="button"
                          onClick={() => setEditReturnForm((p: any) => ({ ...p, stockLast: lt }))}
                          className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition ${editReturnForm.stockLast === lt ? 'bg-emerald-600 text-white font-semibold' : 'bg-white/80 hover:bg-white text-emerald-900 border border-emerald-200'}`}
                        >
                          {lt.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sole */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-emerald-900">Sole *</label>
                      {editFetchedBaseline && editReturnForm.stockSole !== editFetchedBaseline.sole && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                          <button
                            type="button"
                            onClick={() => handleResetEditFieldToFetched('sole')}
                            title="Reset to fetched"
                            className="text-gray-400 hover:text-amber-800 cursor-pointer"
                          >
                            <Undo2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      list="edit-soles-list"
                      placeholder="e.g. Dainite Sole / Vibram Commando"
                      value={editReturnForm.stockSole || ''}
                      onChange={(e) => setEditReturnForm({ ...editReturnForm, stockSole: e.target.value })}
                      className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs"
                    />
                    <datalist id="edit-soles-list">
                      {COMMON_SOLES.map(s => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                    {/* Quick suggestion chips */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {['Single Leather Sole', 'Dainite Sole', 'Vibram Commando'].map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setEditReturnForm((p: any) => ({ ...p, stockSole: s }))}
                          className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition ${editReturnForm.stockSole === s ? 'bg-emerald-600 text-white font-semibold' : 'bg-white/80 hover:bg-white text-emerald-900 border border-emerald-200'}`}
                        >
                          {s.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Size */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-emerald-900">Size *</label>
                      {editFetchedBaseline && editReturnForm.stockSize !== editFetchedBaseline.size && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                          <button
                            type="button"
                            onClick={() => handleResetEditFieldToFetched('size')}
                            title="Reset to fetched"
                            className="text-gray-400 hover:text-amber-800 cursor-pointer"
                          >
                            <Undo2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. UK 9 / US 9.5"
                      value={editReturnForm.stockSize || ''}
                      onChange={(e) => setEditReturnForm({ ...editReturnForm, stockSize: e.target.value })}
                      className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs font-mono font-semibold"
                    />
                    {/* Quick size presets */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {['UK 8', 'UK 8.5', 'UK 9', 'UK 9.5', 'UK 10', 'US 9.5'].map(sz => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setEditReturnForm((p: any) => ({ ...p, stockSize: sz }))}
                          className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition ${editReturnForm.stockSize === sz ? 'bg-emerald-600 text-white font-semibold' : 'bg-white/80 hover:bg-white text-emerald-900 border border-emerald-200'}`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Width */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-emerald-900">Width *</label>
                      {editFetchedBaseline && editReturnForm.stockWidth !== editFetchedBaseline.width && (
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 rounded border border-amber-300">Edited</span>
                          <button
                            type="button"
                            onClick={() => handleResetEditFieldToFetched('width')}
                            title="Reset to fetched"
                            className="text-gray-400 hover:text-amber-800 cursor-pointer"
                          >
                            <Undo2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <select
                      value={editReturnForm.stockWidth || 'E'}
                      onChange={(e) => setEditReturnForm({ ...editReturnForm, stockWidth: e.target.value as ShoeWidth })}
                      className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs font-semibold"
                    >
                      {SHOE_WIDTHS.map(w => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>

                  {/* Stock Notes */}
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-emerald-900 mb-1">Stock / Inspection Notes</label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Return inspection notes, fit remarks, defect tags..."
                      value={editReturnForm.stockNotes || ''}
                      onChange={(e) => setEditReturnForm({ ...editReturnForm, stockNotes: e.target.value, notes: e.target.value })}
                      className="w-full p-2 border border-emerald-300 bg-white rounded-md text-xs resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Status and Logistics Section */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Return Type</label>
                  <select
                    value={editReturnForm.type || 'Exchange'}
                    onChange={(e) => setEditReturnForm({ ...editReturnForm, type: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  >
                    <option value="Exchange">Exchange</option>
                    <option value="Extra Insole">Extra Insole</option>
                    <option value="Replacement">Replacement</option>
                    <option value="Resole">Resole</option>
                    <option value="Repair">Repair</option>
                    <option value="Trial">Trial</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={editReturnForm.status || 'Open'}
                    onChange={(e) => setEditReturnForm({ ...editReturnForm, status: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  >
                    <option value="Open">Open</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Return Received?</label>
                  <select
                    value={editReturnForm.returnReceived || 'N'}
                    onChange={(e) => setEditReturnForm({ ...editReturnForm, returnReceived: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md font-medium"
                  >
                    <option value="N">No (Pending)</option>
                    <option value="Y">Yes (Received)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Receiving Warehouse</label>
                  <select
                    value={editReturnForm.receivingWarehouse || 'IN'}
                    onChange={(e) => setEditReturnForm({ ...editReturnForm, receivingWarehouse: e.target.value as any })}
                    className="w-full p-2 border border-gray-300 rounded-md font-medium"
                  >
                    <option value="IN">India Workshop (IN)</option>
                    <option value="US">US Boston Stock (US)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Incoming Courier</label>
                  <input
                    type="text"
                    value={editReturnForm.incomingCourier || ''}
                    onChange={(e) => setEditReturnForm({ ...editReturnForm, incomingCourier: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Incoming Tracking No</label>
                  <input
                    type="text"
                    value={editReturnForm.incomingTrackingNo || ''}
                    onChange={(e) => setEditReturnForm({ ...editReturnForm, incomingTrackingNo: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-md font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-gray-700 mb-1">Reason</label>
                <input
                  type="text"
                  value={editReturnForm.reason || ''}
                  onChange={(e) => setEditReturnForm({ ...editReturnForm, reason: e.target.value })}
                  placeholder="e.g. Size Small, Heel Slip, Color shade"
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingReturnItem(null)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md font-medium text-gray-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Update Return &amp; Footwear Specs</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};