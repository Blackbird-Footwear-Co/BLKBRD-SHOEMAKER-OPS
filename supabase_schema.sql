-- =============================================================================
-- BLKBRD WORKSHOP & CRM PORTAL - UNIFIED SUPABASE POSTGRESQL SCHEMA
-- Version: 2.4.0 (Synchronized with Dashboard Schema & Customer CRM HUB)
-- Description: Creates all operational tables with dedicated columns,
--              safe column additions for existing tables, performance indexes,
--              Row Level Security (RLS) policies, and dropdown documentation.
--
-- Instructions: Run this entire script in your Supabase Project:
--               Dashboard -> SQL Editor -> New Query -> Paste & Run
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. TABLE: delinquency_global (Workshop & Shopify Global Orders)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.delinquency_global (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    serial_number INTEGER,
    order_id TEXT NOT NULL,
    customer_name TEXT,
    client_name TEXT,
    product TEXT DEFAULT 'BLKBRD Goodyear Welted',
    order_date TEXT,
    expected_date TEXT,
    current_stage VARCHAR(100) DEFAULT 'Cutting',
    delay_reason VARCHAR(255),
    remarks TEXT,
    store_account VARCHAR(20) DEFAULT 'Global',
    order_status VARCHAR(50) DEFAULT 'Delayed',
    action_required TEXT,
    escalation_status VARCHAR(100) DEFAULT 'Normal',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe dedicated column migrations for delinquency_global
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS serial_number INTEGER;
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS product TEXT DEFAULT 'BLKBRD Goodyear Welted';
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS order_date TEXT;
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS expected_date TEXT;
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS current_stage VARCHAR(100) DEFAULT 'Cutting';
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS delay_reason VARCHAR(255);
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS store_account VARCHAR(20) DEFAULT 'Global';
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS order_status VARCHAR(50) DEFAULT 'Delayed';
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS action_required TEXT;
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS escalation_status VARCHAR(100) DEFAULT 'Normal';
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.delinquency_global ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_delinquency_global_order_id ON public.delinquency_global (order_id);
CREATE INDEX IF NOT EXISTS idx_delinquency_global_stage ON public.delinquency_global (current_stage);
CREATE INDEX IF NOT EXISTS idx_delinquency_global_created ON public.delinquency_global (created_at DESC);

-- =============================================================================
-- 2. TABLE: delinquency_llc (Workshop & Shopify LLC US Orders)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.delinquency_llc (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    serial_number INTEGER,
    order_id TEXT NOT NULL,
    customer_name TEXT,
    client_name TEXT,
    product TEXT DEFAULT 'BLKBRD Goodyear Welted',
    order_date TEXT,
    expected_date TEXT,
    current_stage VARCHAR(100) DEFAULT 'Cutting',
    delay_reason VARCHAR(255),
    remarks TEXT,
    store_account VARCHAR(20) DEFAULT 'LLC',
    order_status VARCHAR(50) DEFAULT 'Delayed',
    action_required TEXT,
    escalation_status VARCHAR(100) DEFAULT 'Normal',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe dedicated column migrations for delinquency_llc
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS serial_number INTEGER;
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS product TEXT DEFAULT 'BLKBRD Goodyear Welted';
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS order_date TEXT;
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS expected_date TEXT;
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS current_stage VARCHAR(100) DEFAULT 'Cutting';
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS delay_reason VARCHAR(255);
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS store_account VARCHAR(20) DEFAULT 'LLC';
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS order_status VARCHAR(50) DEFAULT 'Delayed';
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS action_required TEXT;
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS escalation_status VARCHAR(100) DEFAULT 'Normal';
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.delinquency_llc ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_delinquency_llc_order_id ON public.delinquency_llc (order_id);
CREATE INDEX IF NOT EXISTS idx_delinquency_llc_stage ON public.delinquency_llc (current_stage);
CREATE INDEX IF NOT EXISTS idx_delinquency_llc_created ON public.delinquency_llc (created_at DESC);

-- =============================================================================
-- 3. TABLE: customers_crm (Dedicated Customer Page & CRM HUB Sync)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.customers_crm (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    source VARCHAR(50) DEFAULT 'Website',
    order_ids TEXT[] DEFAULT '{}'::text[],
    tags TEXT[] DEFAULT '{}'::text[],
    city TEXT,
    country TEXT,
    notes TEXT,
    total_spent VARCHAR(50) DEFAULT '₹0',
    crm_queries JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe dedicated column migrations for customers_crm
ALTER TABLE public.customers_crm ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Client';
ALTER TABLE public.customers_crm ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.customers_crm ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.customers_crm ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'Website';
ALTER TABLE public.customers_crm ADD COLUMN IF NOT EXISTS order_ids TEXT[] DEFAULT '{}'::text[];
ALTER TABLE public.customers_crm ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'::text[];
ALTER TABLE public.customers_crm ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.customers_crm ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.customers_crm ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.customers_crm ADD COLUMN IF NOT EXISTS total_spent VARCHAR(50) DEFAULT '₹0';
ALTER TABLE public.customers_crm ADD COLUMN IF NOT EXISTS crm_queries JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.customers_crm ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.customers_crm ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_customers_crm_email ON public.customers_crm (email);
CREATE INDEX IF NOT EXISTS idx_customers_crm_phone ON public.customers_crm (phone);
CREATE INDEX IF NOT EXISTS idx_customers_crm_name ON public.customers_crm (name);
CREATE INDEX IF NOT EXISTS idx_customers_crm_source ON public.customers_crm (source);
CREATE INDEX IF NOT EXISTS idx_customers_crm_created ON public.customers_crm (created_at DESC);

-- =============================================================================
-- 4. TABLE: order_audit_events (Order Journey & Stage Audit Logs)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.order_audit_events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_id TEXT NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    title TEXT NOT NULL,
    stage VARCHAR(100),
    previous_stage VARCHAR(100),
    status VARCHAR(100),
    author_name TEXT,
    author_role VARCHAR(100),
    delay_reason VARCHAR(255),
    expected_date VARCHAR(100),
    priority VARCHAR(50) DEFAULT 'Normal',
    artisan_bench TEXT,
    remarks_text TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe dedicated column migrations for order_audit_events
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS order_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(100) NOT NULL DEFAULT 'stage_change';
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Audit Event';
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS stage VARCHAR(100);
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS previous_stage VARCHAR(100);
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS status VARCHAR(100);
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS author_name TEXT;
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS author_role VARCHAR(100);
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS delay_reason VARCHAR(255);
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS expected_date VARCHAR(100);
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'Normal';
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS artisan_bench TEXT;
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS remarks_text TEXT;
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.order_audit_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_order_audit_events_order_id ON public.order_audit_events (order_id);
CREATE INDEX IF NOT EXISTS idx_order_audit_events_type ON public.order_audit_events (event_type);
CREATE INDEX IF NOT EXISTS idx_order_audit_events_created ON public.order_audit_events (created_at DESC);

-- =============================================================================
-- 5. TABLE: production_remarks (Workshop Remarks & Production Logs)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.production_remarks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_id TEXT NOT NULL,
    remark TEXT NOT NULL,
    author TEXT NOT NULL,
    role VARCHAR(100),
    stage_transition VARCHAR(100),
    previous_status VARCHAR(100),
    new_status VARCHAR(100),
    is_read BOOLEAN DEFAULT FALSE,
    is_urgent BOOLEAN DEFAULT FALSE,
    customer_notified BOOLEAN DEFAULT FALSE,
    category VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe dedicated column migrations for production_remarks
ALTER TABLE public.production_remarks ADD COLUMN IF NOT EXISTS order_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.production_remarks ADD COLUMN IF NOT EXISTS remark TEXT NOT NULL DEFAULT '';
ALTER TABLE public.production_remarks ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT 'Workshop Supervisor';
ALTER TABLE public.production_remarks ADD COLUMN IF NOT EXISTS role VARCHAR(100);
ALTER TABLE public.production_remarks ADD COLUMN IF NOT EXISTS stage_transition VARCHAR(100);
ALTER TABLE public.production_remarks ADD COLUMN IF NOT EXISTS previous_status VARCHAR(100);
ALTER TABLE public.production_remarks ADD COLUMN IF NOT EXISTS new_status VARCHAR(100);
ALTER TABLE public.production_remarks ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
ALTER TABLE public.production_remarks ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT FALSE;
ALTER TABLE public.production_remarks ADD COLUMN IF NOT EXISTS customer_notified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.production_remarks ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE public.production_remarks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_production_remarks_order_id ON public.production_remarks (order_id);
CREATE INDEX IF NOT EXISTS idx_production_remarks_is_read ON public.production_remarks (is_read);
CREATE INDEX IF NOT EXISTS idx_production_remarks_created ON public.production_remarks (created_at DESC);

-- =============================================================================
-- 6. TABLE: returns_global (Domestic & Global Returns / Exchanges)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.returns_global (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    serial_number INTEGER,
    customer_name TEXT,
    return_type VARCHAR(50) DEFAULT 'Exchange',
    reason VARCHAR(100) DEFAULT 'Size',
    old_order_id TEXT NOT NULL,
    new_order_id TEXT,
    old_size VARCHAR(50),
    new_size VARCHAR(50),
    return_received VARCHAR(10) DEFAULT 'N',
    status VARCHAR(50) DEFAULT 'Open',
    replacement_done VARCHAR(10) DEFAULT 'N',
    return_initiated DATE DEFAULT CURRENT_DATE,
    targeted_date DATE,
    incoming_courier_name VARCHAR(100),
    incoming_tracking_awb TEXT,
    exchange_tracking_awb TEXT,
    region VARCHAR(50) DEFAULT 'Domestic',
    country VARCHAR(100) DEFAULT 'India',
    created_by VARCHAR(100) DEFAULT 'Logistics Desk',
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe dedicated column migrations for returns_global
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS serial_number INTEGER;
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS return_type VARCHAR(50) DEFAULT 'Exchange';
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS reason VARCHAR(100) DEFAULT 'Size';
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS old_order_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS new_order_id TEXT;
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS old_size VARCHAR(50);
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS new_size VARCHAR(50);
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS return_received VARCHAR(10) DEFAULT 'N';
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Open';
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS replacement_done VARCHAR(10) DEFAULT 'N';
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS return_initiated DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS targeted_date DATE;
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS incoming_courier_name VARCHAR(100);
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS incoming_tracking_awb TEXT;
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS exchange_tracking_awb TEXT;
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS region VARCHAR(50) DEFAULT 'Domestic';
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India';
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) DEFAULT 'Logistics Desk';
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.returns_global ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_returns_global_old_order ON public.returns_global (old_order_id);
CREATE INDEX IF NOT EXISTS idx_returns_global_status ON public.returns_global (status);

-- =============================================================================
-- 7. TABLE: returns_llc (US & International Returns / Exchanges)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.returns_llc (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    serial_number INTEGER,
    customer_name TEXT,
    return_type VARCHAR(50) DEFAULT 'Exchange',
    reason VARCHAR(100) DEFAULT 'Size',
    old_order_id TEXT NOT NULL,
    new_order_id TEXT,
    old_size VARCHAR(50),
    new_size VARCHAR(50),
    return_received VARCHAR(10) DEFAULT 'N',
    status VARCHAR(50) DEFAULT 'Open',
    replacement_done VARCHAR(10) DEFAULT 'N',
    return_initiated DATE DEFAULT CURRENT_DATE,
    targeted_date DATE,
    incoming_courier_name VARCHAR(100),
    incoming_tracking_awb TEXT,
    exchange_tracking_awb TEXT,
    region VARCHAR(50) DEFAULT 'USA',
    country VARCHAR(100) DEFAULT 'United States',
    created_by VARCHAR(100) DEFAULT 'Logistics Desk',
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe dedicated column migrations for returns_llc
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS serial_number INTEGER;
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS return_type VARCHAR(50) DEFAULT 'Exchange';
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS reason VARCHAR(100) DEFAULT 'Size';
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS old_order_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS new_order_id TEXT;
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS old_size VARCHAR(50);
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS new_size VARCHAR(50);
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS return_received VARCHAR(10) DEFAULT 'N';
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Open';
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS replacement_done VARCHAR(10) DEFAULT 'N';
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS return_initiated DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS targeted_date DATE;
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS incoming_courier_name VARCHAR(100);
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS incoming_tracking_awb TEXT;
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS exchange_tracking_awb TEXT;
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS region VARCHAR(50) DEFAULT 'USA';
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'United States';
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) DEFAULT 'Logistics Desk';
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.returns_llc ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_returns_llc_old_order ON public.returns_llc (old_order_id);
CREATE INDEX IF NOT EXISTS idx_returns_llc_status ON public.returns_llc (status);

-- =============================================================================
-- 8. TABLE: return_stock_in (Domestic / India Warehouse Return Footwear)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.return_stock_in (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    serial_number INTEGER,
    receiving_date DATE DEFAULT CURRENT_DATE,
    order_id TEXT NOT NULL,
    item_name TEXT DEFAULT 'BLKBRD Footwear',
    customization VARCHAR(10) DEFAULT 'N',
    customization_remark TEXT,
    size VARCHAR(50),
    return_tracking_awb TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe dedicated column migrations for return_stock_in
ALTER TABLE public.return_stock_in ADD COLUMN IF NOT EXISTS serial_number INTEGER;
ALTER TABLE public.return_stock_in ADD COLUMN IF NOT EXISTS receiving_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.return_stock_in ADD COLUMN IF NOT EXISTS order_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.return_stock_in ADD COLUMN IF NOT EXISTS item_name TEXT DEFAULT 'BLKBRD Footwear';
ALTER TABLE public.return_stock_in ADD COLUMN IF NOT EXISTS customization VARCHAR(10) DEFAULT 'N';
ALTER TABLE public.return_stock_in ADD COLUMN IF NOT EXISTS customization_remark TEXT;
ALTER TABLE public.return_stock_in ADD COLUMN IF NOT EXISTS size VARCHAR(50);
ALTER TABLE public.return_stock_in ADD COLUMN IF NOT EXISTS return_tracking_awb TEXT;
ALTER TABLE public.return_stock_in ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_return_stock_in_order ON public.return_stock_in (order_id);

-- =============================================================================
-- 9. TABLE: return_stock_us (Boston / US Warehouse Return Footwear)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.return_stock_us (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    serial_number INTEGER,
    receiving_date DATE DEFAULT CURRENT_DATE,
    order_id TEXT NOT NULL,
    item_name TEXT DEFAULT 'BLKBRD Footwear',
    customization VARCHAR(10) DEFAULT 'N',
    customization_remark TEXT,
    size VARCHAR(50),
    return_tracking_awb TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe dedicated column migrations for return_stock_us
ALTER TABLE public.return_stock_us ADD COLUMN IF NOT EXISTS serial_number INTEGER;
ALTER TABLE public.return_stock_us ADD COLUMN IF NOT EXISTS receiving_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.return_stock_us ADD COLUMN IF NOT EXISTS order_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.return_stock_us ADD COLUMN IF NOT EXISTS item_name TEXT DEFAULT 'BLKBRD Footwear';
ALTER TABLE public.return_stock_us ADD COLUMN IF NOT EXISTS customization VARCHAR(10) DEFAULT 'N';
ALTER TABLE public.return_stock_us ADD COLUMN IF NOT EXISTS customization_remark TEXT;
ALTER TABLE public.return_stock_us ADD COLUMN IF NOT EXISTS size VARCHAR(50);
ALTER TABLE public.return_stock_us ADD COLUMN IF NOT EXISTS return_tracking_awb TEXT;
ALTER TABLE public.return_stock_us ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_return_stock_us_order ON public.return_stock_us (order_id);

-- =============================================================================
-- 10. TABLE: daily_dispatches (Workshop Dispatches & Outgoing AWBs)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.daily_dispatches (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    serial_number INTEGER,
    dispatch_date DATE DEFAULT CURRENT_DATE,
    order_id TEXT NOT NULL,
    shipping_type VARCHAR(50) DEFAULT 'Domestic',
    shipping_partner VARCHAR(100) DEFAULT 'Bluedart Express',
    outgoing_tracking_awb TEXT,
    trial_pair VARCHAR(10) DEFAULT 'N',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe dedicated column migrations for daily_dispatches
ALTER TABLE public.daily_dispatches ADD COLUMN IF NOT EXISTS serial_number INTEGER;
ALTER TABLE public.daily_dispatches ADD COLUMN IF NOT EXISTS dispatch_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.daily_dispatches ADD COLUMN IF NOT EXISTS order_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.daily_dispatches ADD COLUMN IF NOT EXISTS shipping_type VARCHAR(50) DEFAULT 'Domestic';
ALTER TABLE public.daily_dispatches ADD COLUMN IF NOT EXISTS shipping_partner VARCHAR(100) DEFAULT 'Bluedart Express';
ALTER TABLE public.daily_dispatches ADD COLUMN IF NOT EXISTS outgoing_tracking_awb TEXT;
ALTER TABLE public.daily_dispatches ADD COLUMN IF NOT EXISTS trial_pair VARCHAR(10) DEFAULT 'N';
ALTER TABLE public.daily_dispatches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_daily_dispatches_order ON public.daily_dispatches (order_id);
CREATE INDEX IF NOT EXISTS idx_daily_dispatches_date ON public.daily_dispatches (dispatch_date DESC);

-- =============================================================================
-- 11. TABLE: trial_pairs (Dedicated Trial Pairs Lifecycle)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.trial_pairs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    serial_number INTEGER,
    date DATE DEFAULT CURRENT_DATE,
    order_id TEXT NOT NULL,
    customer_name TEXT,
    shoe_model TEXT,
    size VARCHAR(50),
    source_type VARCHAR(100) DEFAULT 'Workshop Trial',
    status VARCHAR(50) DEFAULT 'Sent',
    dispatched_date DATE,
    outbound_awb TEXT,
    return_tracking_awb TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe dedicated column migrations for trial_pairs
ALTER TABLE public.trial_pairs ADD COLUMN IF NOT EXISTS serial_number INTEGER;
ALTER TABLE public.trial_pairs ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.trial_pairs ADD COLUMN IF NOT EXISTS order_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.trial_pairs ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.trial_pairs ADD COLUMN IF NOT EXISTS shoe_model TEXT;
ALTER TABLE public.trial_pairs ADD COLUMN IF NOT EXISTS size VARCHAR(50);
ALTER TABLE public.trial_pairs ADD COLUMN IF NOT EXISTS source_type VARCHAR(100) DEFAULT 'Workshop Trial';
ALTER TABLE public.trial_pairs ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Sent';
ALTER TABLE public.trial_pairs ADD COLUMN IF NOT EXISTS dispatched_date DATE;
ALTER TABLE public.trial_pairs ADD COLUMN IF NOT EXISTS outbound_awb TEXT;
ALTER TABLE public.trial_pairs ADD COLUMN IF NOT EXISTS return_tracking_awb TEXT;
ALTER TABLE public.trial_pairs ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.trial_pairs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_trial_pairs_order ON public.trial_pairs (order_id);
CREATE INDEX IF NOT EXISTS idx_trial_pairs_status ON public.trial_pairs (status);

-- =============================================================================
-- 12. TABLE: shopify_orders (Multi-Store Live Sync Cache: Global & LLC)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.shopify_orders (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL,
    customer_name TEXT,
    email TEXT,
    total_price VARCHAR(50),
    currency VARCHAR(10) DEFAULT 'INR',
    financial_status VARCHAR(50) DEFAULT 'paid',
    fulfillment_status VARCHAR(50) DEFAULT 'unfulfilled',
    operational_status VARCHAR(50) DEFAULT 'Ready to Ship',
    line_items TEXT,
    notes TEXT,
    store_account VARCHAR(20) DEFAULT 'Global',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe dedicated column migrations for shopify_orders
ALTER TABLE public.shopify_orders ADD COLUMN IF NOT EXISTS order_number TEXT NOT NULL DEFAULT '';
ALTER TABLE public.shopify_orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.shopify_orders ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.shopify_orders ADD COLUMN IF NOT EXISTS total_price VARCHAR(50);
ALTER TABLE public.shopify_orders ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR';
ALTER TABLE public.shopify_orders ADD COLUMN IF NOT EXISTS financial_status VARCHAR(50) DEFAULT 'paid';
ALTER TABLE public.shopify_orders ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(50) DEFAULT 'unfulfilled';
ALTER TABLE public.shopify_orders ADD COLUMN IF NOT EXISTS operational_status VARCHAR(50) DEFAULT 'Ready to Ship';
ALTER TABLE public.shopify_orders ADD COLUMN IF NOT EXISTS line_items TEXT;
ALTER TABLE public.shopify_orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.shopify_orders ADD COLUMN IF NOT EXISTS store_account VARCHAR(20) DEFAULT 'Global';
ALTER TABLE public.shopify_orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.shopify_orders ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_shopify_orders_num ON public.shopify_orders (order_number);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_account ON public.shopify_orders (store_account);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR ALL TABLES
-- Permits authenticated backend proxy service and dashboard frontend access
-- =============================================================================
DO $$ 
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'delinquency_global',
        'delinquency_llc',
        'customers_crm',
        'order_audit_events',
        'production_remarks',
        'returns_global',
        'returns_llc',
        'return_stock_in',
        'return_stock_us',
        'daily_dispatches',
        'trial_pairs',
        'shopify_orders'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        
        -- Policy for full operational access via backend proxy / client
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
              AND tablename = tbl 
              AND policyname = 'Allow public and service role access for workshop app'
        ) THEN
            EXECUTE format(
                'CREATE POLICY "Allow public and service role access for workshop app" ON public.%I FOR ALL USING (true) WITH CHECK (true);',
                tbl
            );
        END IF;
    END LOOP;
END $$;

-- =============================================================================
-- SCHEMA DOCUMENTATION & COLUMN CHOICE COMMENTS
-- =============================================================================
COMMENT ON TABLE public.delinquency_global IS 'Active delinquent workshop and online orders for BLKBRD Global store (INR/International)';
COMMENT ON TABLE public.delinquency_llc IS 'Active delinquent workshop and online orders for BLKBRD LLC store (USD/USA)';
COMMENT ON TABLE public.customers_crm IS 'Dedicated Customer CRM HUB: profiles, phone, email, source, order history, tags, notes, and query resolution logs';
COMMENT ON TABLE public.order_audit_events IS 'Comprehensive chronological audit trail of all order stage progressions, delay explanations, and diff history';
COMMENT ON TABLE public.production_remarks IS 'Floor craftsmen and supervisor remarks, urgent flags, and delay resolutions';
COMMENT ON TABLE public.returns_global IS 'Global store returns, size exchanges, replacement tracking, and incoming courier AWBs';
COMMENT ON TABLE public.returns_llc IS 'LLC US store returns, exchanges, and US warehouse tracking';
COMMENT ON TABLE public.return_stock_in IS 'Domestic return inventory physically stored at India warehouse';
COMMENT ON TABLE public.return_stock_us IS 'International return inventory physically stored at Boston, US facility';
COMMENT ON TABLE public.daily_dispatches IS 'Daily outgoing courier manifests and tracking numbers';
COMMENT ON TABLE public.trial_pairs IS 'Trial pair lifecycle and fit consultation tracking';
COMMENT ON TABLE public.shopify_orders IS 'Real-time cache of orders synced from Shopify Global & LLC stores';

COMMENT ON COLUMN public.order_audit_events.delay_reason IS 'Standard Choices: Upper Material Shortage, Sole Shortage, Custom Last Delay, Custom Pattern Delay, Return Awaited';
COMMENT ON COLUMN public.customers_crm.source IS 'Standard Choices: Website, Social Media, WhatsApp, Phone Call, Exhibition, Referral, Other';
