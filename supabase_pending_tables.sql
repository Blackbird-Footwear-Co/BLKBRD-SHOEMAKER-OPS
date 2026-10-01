-- =============================================================================
-- BLKBRD WORKSHOP OS - SUPABASE PENDING TABLES CREATION SCRIPT
-- Tables: customers_crm, order_audit_events, production_remarks, shopify_orders
--
-- How to apply:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/sdkqxjqemomwgveydbfv/sql/new
-- 2. Paste this entire script into the SQL Editor.
-- 3. Click "RUN" (green button).
-- 4. In the app, click "Re-verify All Tables" in the Schema Customizer / Supabase Health tab!
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. TABLE: customers_crm (Dedicated Customer Page & CRM HUB Sync)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.customers_crm (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL DEFAULT 'Client',
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

-- Safe column additions in case table already existed
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
-- 2. TABLE: order_audit_events (Order Journey & Stage Audit Logs)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.order_audit_events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_id TEXT NOT NULL DEFAULT '',
    event_type VARCHAR(100) NOT NULL DEFAULT 'stage_change',
    title TEXT NOT NULL DEFAULT 'Audit Event',
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

-- Safe column additions
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
-- 3. TABLE: production_remarks (Workshop Remarks & Production Logs)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.production_remarks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_id TEXT NOT NULL DEFAULT '',
    remark TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT 'Workshop Supervisor',
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

-- Safe column additions
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
-- 4. TABLE: shopify_orders (Multi-Store Live Sync Cache: Global & LLC)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.shopify_orders (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL DEFAULT '',
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

-- Safe column additions
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
-- ROW LEVEL SECURITY (RLS) POLICIES FOR PENDING TABLES
-- =============================================================================
DO $$ 
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'customers_crm',
        'order_audit_events',
        'production_remarks',
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

-- Table Comments
COMMENT ON TABLE public.customers_crm IS 'Dedicated Customer CRM HUB: profiles, phone, email, source, order history, tags, notes, and query resolution logs';
COMMENT ON TABLE public.order_audit_events IS 'Comprehensive chronological audit trail of all order stage progressions, delay explanations, and diff history';
COMMENT ON TABLE public.production_remarks IS 'Floor craftsmen and supervisor remarks, urgent flags, and delay resolutions';
COMMENT ON TABLE public.shopify_orders IS 'Real-time cache of orders synced from Shopify Global & LLC stores';
