import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const delinquencyGlobal = pgTable('delinquency_global', {
  id: text('id').primaryKey(),
  serialNumber: integer('serial_number'),
  orderId: text('order_id').notNull(),
  customerName: text('customer_name'),
  clientName: text('client_name'),
  product: text('product').default('BLKBRD Goodyear Welted'),
  orderDate: text('order_date'),
  expectedDate: text('expected_date'),
  currentStage: text('current_stage').default('Cutting'),
  delayReason: text('delay_reason'),
  remarks: text('remarks'),
  storeAccount: text('store_account').default('Global'),
  orderStatus: text('order_status').default('Delayed'),
  actionRequired: text('action_required'),
  escalationStatus: text('escalation_status').default('Normal'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const delinquencyLlc = pgTable('delinquency_llc', {
  id: text('id').primaryKey(),
  serialNumber: integer('serial_number'),
  orderId: text('order_id').notNull(),
  customerName: text('customer_name'),
  clientName: text('client_name'),
  product: text('product').default('BLKBRD Goodyear Welted'),
  orderDate: text('order_date'),
  expectedDate: text('expected_date'),
  currentStage: text('current_stage').default('Cutting'),
  delayReason: text('delay_reason'),
  remarks: text('remarks'),
  storeAccount: text('store_account').default('LLC'),
  orderStatus: text('order_status').default('Delayed'),
  actionRequired: text('action_required'),
  escalationStatus: text('escalation_status').default('Normal'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const shopifyOrdersTable = pgTable('shopify_orders', {
  id: text('id').primaryKey(),
  orderNumber: text('order_number').notNull(),
  customerName: text('customer_name'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  totalPrice: text('total_price'),
  currency: text('currency').default('INR'),
  financialStatus: text('financial_status').default('paid'),
  fulfillmentStatus: text('fulfillment_status').default('unfulfilled'),
  operationalStatus: text('operational_status').default('Ready to Ship'),
  lineItems: text('line_items'),
  notes: text('notes'),
  storeAccount: text('store_account').default('Global'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
