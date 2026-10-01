export interface ReturnItem {
  id: string;
  sNo: number | string;
  clientName: string; // Customer Name
  type: string; // Return Type: Exchange/Return/Refund
  reason: string; // Reason: Size/Wrong Item/Trial
  oldOrderId: string; // Old Order ID
  newOrderId?: string; // New Order ID
  oldSize?: string; // Old Size
  newSize?: string; // New Size
  returnReceived: string; // Return Received: Y/N
  status: string; // Status: Open/Closed
  replacementDone: string; // Replacement Done: Y/N
  initiatedDate: string; // Return Initiated: Date
  newTargetDate: string; // Targeted Date
  incomingCourier: string; // Incoming Courier Name
  incomingTrackingNo: string; // Incoming Tracking: AWB
  exchangeTracking?: string; // Exchange Tracking: AWB
  region: string; // Region
  country: string; // Country
  createdBy: string; // Created By: Agent Names from Dropdown
  notes: string; // Remarks
  picture?: string;
  storeTab?: 'Global' | 'LLC';
  // Footwear specifications fetched from order database
  product?: string;
  leather?: string;
  last?: string;
  sole?: string;
  width?: ShoeWidth | string;
  receivingWarehouse?: 'IN' | 'US';
}

export type ShoeWidth = 'E' | 'EE' | 'EEE' | '4E' | 'More than 4E';
export const SHOE_WIDTHS: ShoeWidth[] = ['E', 'EE', 'EEE', '4E', 'More than 4E'];

export interface ReturnStockItem {
  id: string;
  sNo: number | string;
  receivingDate: string; // Receiving Date
  orderId: string; // Order ID
  itemName: string; // Product / Item Name
  product?: string; // Product alias
  leather?: string; // Leather (Pre-filled from details)
  last?: string; // Last (Pre-filled from details)
  sole?: string; // Sole (Pre-filled from details)
  size: string; // Size (Pre-filled from details)
  width?: ShoeWidth | string; // Width: E, EE, EEE, 4E, More than 4E
  notes?: string; // Notes
  customization: 'Y' | 'N' | string; // Customization (if Any): Y/N
  customizationRemark?: string; // Customization Remark
  returnTrackingAwb: string; // Return Tracking AWB
  warehouse: 'IN' | 'US';
}

export interface BostonStockItem {
  id: string;
  sNo: number | string;
  shoeModel: string;
  size: string;
  widthOrLast?: string;
  colorLeather: string;
  condition: 'Pristine / Like New' | 'Minor Creasing / Try-on' | 'Refurbished' | 'Needs Polish';
  originalOrderId: string;
  clientName: string;
  dateReceived: string;
  storageLocation: string; // e.g. "Boston Hub Rack B2"
  status: 'Available' | 'Reserved for Exchange' | 'Re-allocated / Used' | 'Inspection Pending';
  reallocatedToOrderId?: string;
  notes?: string;
}

export interface DispatchItem {
  id: string;
  sNo: number | string;
  date: string; // Date (dispatch_date)
  orderNumber: string; // Order ID
  customerName?: string;
  clientName?: string;
  shoeModel?: string;
  shippingType?: 'International' | 'Domestic' | string; // Shipping Type: International/Domestic
  shippingPartner?: string; // Shipping Partner
  outgoingTrackingAwb?: string; // Outgoing Tracking: AWB
  trialPair?: 'Y' | 'N' | string; // Trail Pair: Y/N
  // Backwards-compatible aliases
  region?: string;
  trackingDetails?: string;
  courier?: string;
  trackingFulfilled?: string;
  notes?: string;
}

export type DelinquencyStage =
  | 'CUTTING'
  | 'CLOSING'
  | 'PREPARATION'
  | 'UPPER'
  | 'BOTTOM'
  | 'FINISH'
  | 'QC'
  | 'RTD'
  | 'SHIPPED'
  | 'ON HOLD'
  | 'OTHER'
  | 'Cutting'
  | 'Closing'
  | 'Preparation'
  | 'Upper'
  | 'Bottom'
  | 'Finish'
  | 'QC'
  | 'RTD'
  | 'Shipped'
  | 'On Hold'
  | 'Other';

export const DELINQUENCY_STAGES = [
  'CUTTING',
  'CLOSING',
  'PREPARATION',
  'UPPER',
  'BOTTOM',
  'FINISH',
  'QC',
  'RTD',
  'SHIPPED',
  'ON HOLD'
] as const;

export interface DelinquencyItem {
  id: string;
  sNo: number | string; // Serial Number
  orderId: string; // Order ID
  customerName: string; // Customer Name
  product?: string; // Product
  orderDate: string; // Order Date
  expectedDate: string; // Expected Date (+21 days from Order Date)
  daysDelayed: number;
  currentStage: DelinquencyStage | string; // Current Stage: Cutting/Closing/Preparation/Bottom/Finish/QC/RTD/Shipped/On Hold
  delayReason: string; // Delay Reason
  remarks?: string; // Remarks
  actionRequired?: string;
  escalationStatus?: string;
  storeTab?: 'Global' | 'LLC';
  orderStatus?: 'Delayed' | 'Ready to Ship' | 'Shipped' | 'In Production' | string;
  syncedToSheet?: boolean;
  sheetSyncError?: string;
  phone?: string;
  address?: string;
  trackingLink?: string;
  trackingAwb?: string;
  shippingCarrier?: string;
  imageUrl?: string;
  imageUrls?: string[];
  // Shopify Rich Order & Custom Specifications
  lineItemDetails?: ShopifyLineItemDetail[];
  craftsmanNotes?: string;
  customSpecifications?: Record<string, string>;
  shippingMethod?: string;
  customerEmail?: string;
  shopifyNotes?: string;
  // Compatibility aliases
  clientName?: string;
  shoeStyle?: string;
  notes?: string;
}

export interface ShopifyLineItemProperty {
  name: string;
  value: any;
}

export interface ShopifyLineItemDetail {
  id?: string | number;
  title: string;
  variantTitle?: string;
  quantity: number;
  price?: string;
  sku?: string;
  imageUrl?: string;
  properties?: ShopifyLineItemProperty[];
  craftsmanNotes?: string;
  customSpecifications?: Record<string, string>;
}

export interface ShopifyOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  email: string;
  totalPrice: string;
  currency: string;
  financialStatus: 'paid' | 'pending' | 'refunded';
  fulfillmentStatus: 'unfulfilled' | 'fulfilled' | 'partial';
  operationalStatus: 'Ready to Ship' | 'Shipped' | 'Delayed' | 'In Production';
  createdAt: string;
  lineItems: string;
  notes?: string;
  storeAccount?: 'Global' | 'LLC';
  storeTab?: 'Global' | 'LLC';
  phone?: string;
  address?: string;
  trackingLink?: string;
  trackingAwb?: string;
  shippingCarrier?: string;
  imageUrl?: string;
  imageUrls?: string[];
  isManual?: boolean;
  // Rich Shopify Line Items & Craftsman Specifications
  lineItemDetails?: ShopifyLineItemDetail[];
  craftsmanNotes?: string;
  customSpecifications?: Record<string, string>;
  customerEmail?: string;
  shippingMethod?: string;
  tags?: string[];
}

export interface TrialPairItem {
  id: string;
  sNo?: number | string; // Serial Number
  orderId: string; // Order ID
  customerName: string; // Customer Name
  shoeModel: string; // Shoe Model
  sourceType?: 'Global Returns' | 'LLC Returns' | 'Daily Dispatches' | 'Direct' | string; // Source Type
  outboundAwb: string; // Outbound AWB
  status: 'Sent' | 'Received' | 'Active Trial' | 'Returned' | 'Converted' | 'Closed' | 'Dispatched / In Transit' | 'With Customer Testing' | 'Return Received' | 'Converted to Purchase' | string;
  phoneOrEmail?: string;
  sizesSent?: string;
  dispatchedDate?: string;
  courier?: string;
  returnAwb?: string;
  notes?: string;
}

export interface ProductionRemark {
  id: string;
  orderId: string;
  author: string;
  timestamp: string;
  previousStatus: string;
  newStatus: string;
  remark: string;
  read: boolean;
  imageUrl?: string;
  stage?: string;
}

export type UserRole = 'admin' | 'production' | 'logistics' | 'crm';

export interface UserProfile {
  id?: string;
  uid?: string;
  email: string;
  name: string;
  displayName?: string;
  role: UserRole;
  department?: string;
  status?: 'active' | 'disabled';
  photoUrl?: string;
  isGoogleAuth?: boolean;
}

export interface ClubbedOrderItem {
  orderKey: string;
  matchedCustomer: string;
  returnDetails?: ReturnItem;
  dispatchDetails?: DispatchItem;
  delinquencyDetails?: DelinquencyItem;
  shopifyDetails?: ShopifyOrder;
  trialDetails?: TrialPairItem;
  sourceCount: number;
  sources: ('Returns' | 'Dispatch' | 'Delinquency' | 'Shopify' | 'Trial Pairs')[];
  riskLevel: 'critical' | 'high' | 'moderate' | 'normal';
  insights: string[];
}

export interface SheetSourceMeta {
  name: string;
  rowCount: number;
  lastUpdated: string;
  url?: string;
  status: 'active' | 'syncing' | 'error';
}

export type ActiveTab = 'overview' | 'delinquency' | 'dispatch' | 'returns' | 'trials' | 'shopify' | 'sheets_sync' | 'remarks' | 'clubbed' | 'customers';

export type AuditEventType =
  | 'created'
  | 'stage_change'
  | 'status_change'
  | 'delay_reason'
  | 'remark'
  | 'dispatch'
  | 'return_logged'
  | 'return_received'
  | 'exchange_shipped'
  | 'rescheduled'
  | 'customer_updated'
  | 'general_update';

export interface OrderAuditEvent {
  id: string;
  orderId: string;
  type: AuditEventType;
  title: string;
  description?: string;
  authorName: string;
  authorRole: UserRole | string;
  timestamp: string; // ISO string or human-formatted e.g. "20 Sep 2026, 04:15 PM"
  previousValue?: string;
  newValue?: string;
  remarkText?: string;
  imageUrl?: string;
  metadata?: Record<string, any>;
}

export interface OrderRemarkHistoryItem {
  id: string;
  orderId: string;
  author: string;
  role?: string;
  timestamp: string;
  remark: string;
  stageTransition?: string;
  imageUrl?: string;
}

export interface OrderSummaryData {
  orderId: string;
  cleanOrderId: string;
  customerName: string;
  product: string;
  storeTab: 'Global' | 'LLC';
  orderDate: string;
  expectedDate: string;
  daysDelayed: number;
  currentStage: string;
  orderStatus: 'Delayed' | 'Ready to Ship' | 'Shipped' | string;
  delayReason: string;
  latestRemarks?: string;
  updateCount: number;
  firstRecordedAt: string;
  lastUpdatedAt: string;
  timeline: OrderAuditEvent[];
  remarksHistory: OrderRemarkHistoryItem[];
  delinquencyDetails?: DelinquencyItem;
  dispatchDetails?: DispatchItem;
  returnDetails?: ReturnItem;
  trialDetails?: TrialPairItem;
  shopifyDetails?: ShopifyOrder;
}

export const STANDARD_DELAY_REASONS = [
  'Upper Material Shortage',
  'Sole Shortage',
  'Custom Last Delay',
  'Custom Pattern Delay',
  'Return Awaited'
] as const;

export type StandardDelayReason = typeof STANDARD_DELAY_REASONS[number];

export type SchemaColumnType = 'text' | 'varchar' | 'integer' | 'boolean' | 'timestamp' | 'jsonb';

export interface SchemaField {
  id: string;
  name: string; // column_name in PostgreSQL
  label: string; // Display Label
  type: SchemaColumnType;
  required: boolean;
  enabled: boolean;
  description: string;
  useCases: string[]; // e.g. ['workshop', 'qc', 'logistics', 'crm', 'all']
  defaultValue?: any;
  isCustom?: boolean;
  options?: string[]; // Predefined choices for dropdown selection
}

export interface TableSchemaConfig {
  tableKey: 'order_audit_events' | 'production_remarks' | 'customers_crm' | 'delinquency_global' | 'delinquency_llc' | string;
  tableName: string;
  displayName: string;
  description: string;
  activeUseCase: 'standard' | 'bespoke_qc' | 'logistics_escalation' | 'custom' | string;
  fields: SchemaField[];
  syncToSupabase: boolean;
}

export type CustomerSource = 'Website' | 'Social Media' | 'WhatsApp' | 'Phone Call' | 'Exhibition' | 'Referral' | 'Other';

export interface CustomerCrmQuery {
  id: string;
  orderId?: string;
  queryDate: string;
  tag: 'Delay Follow-up' | 'Sizing & Fit Advice' | 'Address & Shipping Update' | 'Return & Exchange' | 'Order Status' | 'Bespoke / Customization' | 'Payment & Refund' | 'General Query' | string;
  status: 'Open' | 'In Progress' | 'Resolved';
  remarks: string;
  resolution?: string;
  agentName: string;
  agentRole: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: CustomerSource;
  orderIds: string[];
  tags: string[];
  notes?: string;
  totalSpent?: string;
  crmQueries: CustomerCrmQuery[];
  city?: string;
  country?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerUnifiedOrder {
  orderId: string;
  normalizedId: string;
  product?: string;
  orderDate?: string;
  expectedDate?: string;
  daysDelayed?: number;
  stage?: string;
  status: string;
  delayReason?: string;
  storeTab?: 'Global' | 'LLC';
  sourceType: 'delinquency' | 'dispatch' | 'return' | 'trial' | 'shopify' | 'uploaded';
  courier?: string;
  trackingNo?: string;
  totalAmount?: string;
}

