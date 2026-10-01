import { TableSchemaConfig, SchemaField, SchemaColumnType, STANDARD_DELAY_REASONS } from '../types';

const SCHEMA_STORAGE_PREFIX = 'blkbrd_table_schema_v1_';

export const DEFAULT_AUDIT_FIELDS: SchemaField[] = [
  {
    id: 'f_id',
    name: 'id',
    label: 'Record ID (UUID)',
    type: 'text',
    required: true,
    enabled: true,
    description: 'Unique identifier for each journey/audit record',
    useCases: ['all', 'standard', 'bespoke_qc', 'logistics_escalation']
  },
  {
    id: 'f_order_id',
    name: 'order_id',
    label: 'Order ID',
    type: 'text',
    required: true,
    enabled: true,
    description: 'Unique Shopify or Workshop order number (e.g. 40102)',
    useCases: ['all', 'standard', 'bespoke_qc', 'logistics_escalation']
  },
  {
    id: 'f_event_type',
    name: 'event_type',
    label: 'Event Type',
    type: 'varchar',
    required: true,
    enabled: true,
    description: 'Classification: stage_change, delay_reason, dispatch, return, etc.',
    useCases: ['all', 'standard', 'bespoke_qc', 'logistics_escalation']
  },
  {
    id: 'f_title',
    name: 'title',
    label: 'Event Title',
    type: 'text',
    required: true,
    enabled: true,
    description: 'Human-readable summary of the journey event',
    useCases: ['all', 'standard', 'bespoke_qc', 'logistics_escalation']
  },
  {
    id: 'f_stage',
    name: 'stage',
    label: 'Production Stage',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Current workshop stage (Clicking, Closing, Lasting, Finishing, etc.)',
    useCases: ['standard', 'bespoke_qc']
  },
  {
    id: 'f_previous_stage',
    name: 'previous_stage',
    label: 'Previous Stage',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'The stage the shoe was transitioned from',
    useCases: ['bespoke_qc', 'standard']
  },
  {
    id: 'f_status',
    name: 'status',
    label: 'Order Status',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Operational state: In Progress, Delayed, Ready to Ship, Shipped',
    useCases: ['all', 'standard', 'logistics_escalation']
  },
  {
    id: 'f_author_name',
    name: 'author_name',
    label: 'Updated By (Name)',
    type: 'text',
    required: false,
    enabled: true,
    description: 'Full name of the team member or craftsman who made the change',
    useCases: ['all', 'standard', 'bespoke_qc']
  },
  {
    id: 'f_author_role',
    name: 'author_role',
    label: 'Author Role / Department',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Department role: admin, production, logistics, qc',
    useCases: ['standard', 'bespoke_qc']
  },
  {
    id: 'f_delay_reason',
    name: 'delay_reason',
    label: 'Delay Reason',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Root cause for delinquent delays selected from standardized dropdown: Upper Material Shortage, Sole Shortage, Custom Last Delay, Custom Pattern Delay, Return Awaited',
    useCases: ['logistics_escalation', 'standard', 'all'],
    options: [...STANDARD_DELAY_REASONS],
    defaultValue: 'Upper Material Shortage'
  },
  {
    id: 'f_expected_date',
    name: 'expected_date',
    label: 'Target Delivery Date',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Expected promised fulfillment date for customer',
    useCases: ['logistics_escalation', 'standard']
  },
  {
    id: 'f_priority',
    name: 'priority',
    label: 'Priority / Urgency',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Normal, High, Urgent, or VIP Bespoke order',
    useCases: ['bespoke_qc', 'logistics_escalation'],
    defaultValue: 'Normal'
  },
  {
    id: 'f_artisan_bench',
    name: 'artisan_bench',
    label: 'Artisan Station / Bench',
    type: 'text',
    required: false,
    enabled: false,
    description: 'Specific master craftsman bench or workshop machine ID',
    useCases: ['bespoke_qc']
  },
  {
    id: 'f_remarks_text',
    name: 'remarks_text',
    label: 'Notes / Remarks',
    type: 'text',
    required: false,
    enabled: true,
    description: 'Additional operational comments or instructions',
    useCases: ['all', 'standard', 'bespoke_qc', 'logistics_escalation']
  },
  {
    id: 'f_metadata',
    name: 'metadata',
    label: 'Flexible Metadata (JSONB)',
    type: 'jsonb',
    required: false,
    enabled: true,
    description: 'Key-value JSON blob for future custom fields and shopify tags',
    useCases: ['all', 'standard', 'bespoke_qc', 'logistics_escalation']
  },
  {
    id: 'f_created_at',
    name: 'created_at',
    label: 'Created At (Timestamp)',
    type: 'timestamp',
    required: true,
    enabled: true,
    description: 'Exact UTC timestamp with time zone of record creation',
    useCases: ['all', 'standard', 'bespoke_qc', 'logistics_escalation']
  }
];

export const DEFAULT_REMARKS_FIELDS: SchemaField[] = [
  {
    id: 'rf_id',
    name: 'id',
    label: 'Remark ID (UUID)',
    type: 'text',
    required: true,
    enabled: true,
    description: 'Unique primary identifier for this remark entry',
    useCases: ['all', 'standard', 'bespoke_qc', 'logistics_escalation']
  },
  {
    id: 'rf_order_id',
    name: 'order_id',
    label: 'Order ID',
    type: 'text',
    required: true,
    enabled: true,
    description: 'The target order number this workshop log belongs to',
    useCases: ['all', 'standard', 'bespoke_qc', 'logistics_escalation']
  },
  {
    id: 'rf_remark',
    name: 'remark',
    label: 'Remark Message / Note',
    type: 'text',
    required: true,
    enabled: true,
    description: 'Full textual feedback, status explanation, or production log note',
    useCases: ['all', 'standard', 'bespoke_qc', 'logistics_escalation']
  },
  {
    id: 'rf_author',
    name: 'author',
    label: 'Author Name',
    type: 'text',
    required: true,
    enabled: true,
    description: 'Who entered this note (e.g. Workshop Supervisor, Craftsman)',
    useCases: ['all', 'standard', 'bespoke_qc', 'logistics_escalation']
  },
  {
    id: 'rf_role',
    name: 'role',
    label: 'Author Department / Role',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Role of author: production, admin, logistics, quality_control',
    useCases: ['all', 'standard', 'bespoke_qc']
  },
  {
    id: 'rf_stage_transition',
    name: 'stage_transition',
    label: 'Stage Transition',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Stage movement context, e.g. "Lasting -> Finishing"',
    useCases: ['standard', 'bespoke_qc']
  },
  {
    id: 'rf_previous_status',
    name: 'previous_status',
    label: 'Previous Status',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Status prior to this update (e.g. Delayed)',
    useCases: ['standard', 'logistics_escalation']
  },
  {
    id: 'rf_new_status',
    name: 'new_status',
    label: 'New Status',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Updated status after remark (e.g. Ready to Ship)',
    useCases: ['standard', 'logistics_escalation']
  },
  {
    id: 'rf_is_read',
    name: 'is_read',
    label: 'Read Status',
    type: 'boolean',
    required: false,
    enabled: true,
    description: 'Whether workshop floor or admin has acknowledged the note',
    useCases: ['all', 'standard'],
    defaultValue: false
  },
  {
    id: 'rf_is_urgent',
    name: 'is_urgent',
    label: 'Urgent / Escalation Flag',
    type: 'boolean',
    required: false,
    enabled: true,
    description: 'Flag for high-priority blocker requiring manager intervention',
    useCases: ['logistics_escalation', 'bespoke_qc'],
    defaultValue: false
  },
  {
    id: 'rf_customer_notified',
    name: 'customer_notified',
    label: 'Customer Notified',
    type: 'boolean',
    required: false,
    enabled: false,
    description: 'Whether client care has emailed or phoned the buyer about this update',
    useCases: ['logistics_escalation']
  },
  {
    id: 'rf_category',
    name: 'category',
    label: 'Category / Tag',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Classification: Material Shortage, Quality Check, Fit Change, Delay, Dispatch',
    useCases: ['bespoke_qc', 'standard']
  },
  {
    id: 'rf_timestamp',
    name: 'created_at',
    label: 'Created Timestamp',
    type: 'timestamp',
    required: true,
    enabled: true,
    description: 'Timestamp when this workshop note was posted',
    useCases: ['all', 'standard', 'bespoke_qc', 'logistics_escalation']
  }
];

export const DEFAULT_CUSTOMERS_CRM_FIELDS: SchemaField[] = [
  {
    id: 'cf_id',
    name: 'id',
    label: 'Customer ID (UUID)',
    type: 'text',
    required: true,
    enabled: true,
    description: 'Unique identifier for each customer record',
    useCases: ['all', 'standard']
  },
  {
    id: 'cf_name',
    name: 'name',
    label: 'Customer Full Name',
    type: 'text',
    required: true,
    enabled: true,
    description: 'Full name of client or bespoke customer',
    useCases: ['all', 'standard']
  },
  {
    id: 'cf_phone',
    name: 'phone',
    label: 'Phone Number',
    type: 'text',
    required: false,
    enabled: true,
    description: 'Direct contact number with country code for delivery & WhatsApp follow-ups',
    useCases: ['all', 'standard']
  },
  {
    id: 'cf_email',
    name: 'email',
    label: 'Email Address',
    type: 'text',
    required: false,
    enabled: true,
    description: 'Client email for order updates, invoices, and tracking links',
    useCases: ['all', 'standard']
  },
  {
    id: 'cf_source',
    name: 'source',
    label: 'Customer Lead Source',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Acquisition channel: Website, Social Media, WhatsApp, Phone Call, Exhibition, Referral, Other',
    useCases: ['all', 'standard'],
    options: ['Website', 'Social Media', 'WhatsApp', 'Phone Call', 'Exhibition', 'Referral', 'Other'],
    defaultValue: 'Website'
  },
  {
    id: 'cf_order_ids',
    name: 'order_ids',
    label: 'Order Numbers (All History)',
    type: 'text',
    required: false,
    enabled: true,
    description: 'Array of all past order IDs across Global, LLC, and Workshop',
    useCases: ['all', 'standard']
  },
  {
    id: 'cf_tags',
    name: 'tags',
    label: 'Customer Segment Tags',
    type: 'text',
    required: false,
    enabled: true,
    description: 'VIP Bespoke, High Value, Sizing Query, Return Awaited, etc.',
    useCases: ['all', 'standard']
  },
  {
    id: 'cf_city',
    name: 'city',
    label: 'City / Metro Area',
    type: 'text',
    required: false,
    enabled: true,
    description: 'City of residence for shipping routing and regional categorization',
    useCases: ['all', 'standard']
  },
  {
    id: 'cf_country',
    name: 'country',
    label: 'Country / Region',
    type: 'text',
    required: false,
    enabled: true,
    description: 'Country for customs, international vs domestic classification',
    useCases: ['all', 'standard']
  },
  {
    id: 'cf_notes',
    name: 'notes',
    label: 'Customer Remarks & Notes',
    type: 'text',
    required: false,
    enabled: true,
    description: 'Specific fit preferences, leather finishes, or special instructions',
    useCases: ['all', 'standard']
  },
  {
    id: 'cf_total_spent',
    name: 'total_spent',
    label: 'Total Lifetime Value',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Cumulative spend across stores (e.g. ₹45,000 or $590.00)',
    useCases: ['all', 'standard']
  },
  {
    id: 'cf_crm_queries',
    name: 'crm_queries',
    label: 'CRM Inquiries & Remarks (JSONB)',
    type: 'jsonb',
    required: false,
    enabled: true,
    description: 'Structured ticket history, remarks, status resolutions, and agent attributions',
    useCases: ['all', 'standard']
  },
  {
    id: 'cf_created_at',
    name: 'created_at',
    label: 'Created Timestamp',
    type: 'timestamp',
    required: true,
    enabled: true,
    description: 'Record creation date and time',
    useCases: ['all', 'standard']
  },
  {
    id: 'cf_updated_at',
    name: 'updated_at',
    label: 'Last Updated Timestamp',
    type: 'timestamp',
    required: true,
    enabled: true,
    description: 'Last modification date and time',
    useCases: ['all', 'standard']
  }
];

export const DEFAULT_DELINQUENCY_FIELDS: SchemaField[] = [
  {
    id: 'df_id',
    name: 'id',
    label: 'Record ID (UUID)',
    type: 'text',
    required: true,
    enabled: true,
    description: 'Primary identifier',
    useCases: ['all', 'standard']
  },
  {
    id: 'df_serial_number',
    name: 'serial_number',
    label: 'Serial Number (S.No)',
    type: 'integer',
    required: false,
    enabled: true,
    description: 'Numerical sequence index',
    useCases: ['all', 'standard']
  },
  {
    id: 'df_order_id',
    name: 'order_id',
    label: 'Order ID',
    type: 'text',
    required: true,
    enabled: true,
    description: 'Unique Shopify or Workshop order number',
    useCases: ['all', 'standard']
  },
  {
    id: 'df_customer_name',
    name: 'customer_name',
    label: 'Customer Name',
    type: 'text',
    required: true,
    enabled: true,
    description: 'Name of customer',
    useCases: ['all', 'standard']
  },
  {
    id: 'df_product',
    name: 'product',
    label: 'Shoe Model & Style',
    type: 'text',
    required: false,
    enabled: true,
    description: 'Product name, model, and leather specification',
    useCases: ['all', 'standard']
  },
  {
    id: 'df_order_date',
    name: 'order_date',
    label: 'Order Date',
    type: 'text',
    required: false,
    enabled: true,
    description: 'Original placement date',
    useCases: ['all', 'standard']
  },
  {
    id: 'df_expected_date',
    name: 'expected_date',
    label: 'Expected Delivery Date',
    type: 'text',
    required: false,
    enabled: true,
    description: 'Promised fulfillment date (+21 days)',
    useCases: ['all', 'standard']
  },
  {
    id: 'df_current_stage',
    name: 'current_stage',
    label: 'Workshop Stage',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'CUTTING, CLOSING, PREPARATION, UPPER, BOTTOM, FINISH, QC, RTD, SHIPPED, ON HOLD',
    useCases: ['all', 'standard'],
    options: ['CUTTING', 'CLOSING', 'PREPARATION', 'UPPER', 'BOTTOM', 'FINISH', 'QC', 'RTD', 'SHIPPED', 'ON HOLD']
  },
  {
    id: 'df_delay_reason',
    name: 'delay_reason',
    label: 'Standardized Delay Reason',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Standardized cause from workshop options',
    useCases: ['all', 'standard'],
    options: [...STANDARD_DELAY_REASONS]
  },
  {
    id: 'df_remarks',
    name: 'remarks',
    label: 'Workshop Remarks',
    type: 'text',
    required: false,
    enabled: true,
    description: 'Detailed floor notes, material arrivals, or courier AWBs',
    useCases: ['all', 'standard']
  },
  {
    id: 'df_store_account',
    name: 'store_account',
    label: 'Shopify Store Account',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Global (INR) or LLC (USD)',
    useCases: ['all', 'standard'],
    options: ['Global', 'LLC']
  },
  {
    id: 'df_order_status',
    name: 'order_status',
    label: 'Operational Order Status',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Delayed, Ready to Ship, Shipped',
    useCases: ['all', 'standard'],
    options: ['Delayed', 'Ready to Ship', 'Shipped']
  },
  {
    id: 'df_action_required',
    name: 'action_required',
    label: 'Action Required',
    type: 'text',
    required: false,
    enabled: true,
    description: 'Next immediate step for floor team or logistics lead',
    useCases: ['all', 'standard']
  },
  {
    id: 'df_escalation_status',
    name: 'escalation_status',
    label: 'Escalation Status',
    type: 'varchar',
    required: false,
    enabled: true,
    description: 'Normal, High Priority, Escalated to Production Lead',
    useCases: ['all', 'standard'],
    options: ['Normal', 'High Priority', 'Escalated to Production Lead']
  }
];

export interface UseCasePresetItem {
  id: 'standard' | 'bespoke_qc' | 'logistics_escalation' | 'custom';
  title: string;
  badge: string;
  description: string;
}

export const USE_CASE_PRESETS: UseCasePresetItem[] = [
  {
    id: 'standard',
    title: 'Standard Workshop & Order Journey',
    badge: 'Recommended',
    description: 'Balanced for shoemaking workshops: tracks order stages, delay reasons, author attribution, and status transitions.'
  },
  {
    id: 'bespoke_qc',
    title: 'Bespoke Quality & Artisan Craft',
    badge: 'Artisan QC',
    description: 'High-detail craft tracking: includes craftsman bench, priority flags, QC notes, and stage-by-stage transitions.'
  },
  {
    id: 'logistics_escalation',
    title: 'Logistics & Delay Escalation',
    badge: 'Delivery Focus',
    description: 'Optimized for customer care and dispatch: emphasizes delay reasons, target dates, urgent escalation, and customer notifications.'
  },
  {
    id: 'custom',
    title: 'Custom Schema (User Tailored)',
    badge: 'Custom',
    description: 'Fully customized field configuration with your own custom columns and toggles.'
  }
];

export function getDefaultTableConfig(tableKey: 'order_audit_events' | 'production_remarks' | 'customers_crm' | 'delinquency_global' | 'delinquency_llc' | string): TableSchemaConfig {
  if (tableKey === 'customers_crm') {
    return {
      tableKey: 'customers_crm',
      tableName: 'customers_crm',
      displayName: 'Customer CRM HUB (Dedicated Customer Profiles & Queries)',
      description: 'Centralized CRM customer profiles, contact info, lead source, order history, tags, and query remarks.',
      activeUseCase: 'standard',
      fields: JSON.parse(JSON.stringify(DEFAULT_CUSTOMERS_CRM_FIELDS)),
      syncToSupabase: true
    };
  }

  if (tableKey === 'delinquency_global') {
    return {
      tableKey: 'delinquency_global',
      tableName: 'delinquency_global',
      displayName: 'Delinquency Orders - Global Store (INR)',
      description: 'Active delinquent workshop and online orders for Global store, stages, and delay reasons.',
      activeUseCase: 'standard',
      fields: JSON.parse(JSON.stringify(DEFAULT_DELINQUENCY_FIELDS)).map((f: SchemaField) => {
        if (f.name === 'store_account') return { ...f, defaultValue: 'Global' };
        return f;
      }),
      syncToSupabase: true
    };
  }

  if (tableKey === 'delinquency_llc') {
    return {
      tableKey: 'delinquency_llc',
      tableName: 'delinquency_llc',
      displayName: 'Delinquency Orders - LLC Store (USD)',
      description: 'Active delinquent workshop and online orders for LLC store, stages, and delay reasons.',
      activeUseCase: 'standard',
      fields: JSON.parse(JSON.stringify(DEFAULT_DELINQUENCY_FIELDS)).map((f: SchemaField) => {
        if (f.name === 'store_account') return { ...f, defaultValue: 'LLC' };
        return f;
      }),
      syncToSupabase: true
    };
  }

  if (tableKey === 'order_audit_events') {
    return {
      tableKey: 'order_audit_events',
      tableName: 'order_audit_events',
      displayName: 'Order Journey & Stage Audit Logs',
      description: 'Tracks every stage progression, delay update, dispatch milestone, and audit diff per Order ID.',
      activeUseCase: 'standard',
      fields: JSON.parse(JSON.stringify(DEFAULT_AUDIT_FIELDS)),
      syncToSupabase: true
    };
  }

  return {
    tableKey: 'production_remarks',
    tableName: 'production_remarks',
    displayName: 'Workshop Remarks & Production Notes',
    description: 'Tracks all workshop logs, craftsman observations, resolution notes, and order communication history.',
    activeUseCase: 'standard',
    fields: JSON.parse(JSON.stringify(DEFAULT_REMARKS_FIELDS)),
    syncToSupabase: true
  };
}

export function getStoredTableConfig(tableKey: 'order_audit_events' | 'production_remarks' | 'customers_crm' | 'delinquency_global' | 'delinquency_llc' | string): TableSchemaConfig {
  try {
    const raw = localStorage.getItem(`${SCHEMA_STORAGE_PREFIX}${tableKey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.fields)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[SchemaConfig] Failed to load stored schema config:', err);
  }
  return getDefaultTableConfig(tableKey);
}

export function saveStoredTableConfig(config: TableSchemaConfig): void {
  try {
    localStorage.setItem(`${SCHEMA_STORAGE_PREFIX}${config.tableKey}`, JSON.stringify(config));
  } catch (err) {
    console.warn('[SchemaConfig] Failed to save stored schema config:', err);
  }
}

export function applyUseCasePreset(
  config: TableSchemaConfig,
  useCaseId: 'standard' | 'bespoke_qc' | 'logistics_escalation' | 'custom'
): TableSchemaConfig {
  if (useCaseId === 'custom') {
    return { ...config, activeUseCase: 'custom' };
  }

  const updatedFields = config.fields.map(f => {
    if (f.required) return { ...f, enabled: true };
    const matches = f.useCases.includes('all') || f.useCases.includes(useCaseId);
    return { ...f, enabled: matches };
  });

  return {
    ...config,
    activeUseCase: useCaseId,
    fields: updatedFields
  };
}

/**
 * Generates production-ready, idempotent PostgreSQL DDL for Supabase SQL Editor
 */
export function generateSupabaseTableSql(config: TableSchemaConfig): string {
  const enabledFields = config.fields.filter(f => f.enabled);

  const columnLines = enabledFields.map(f => {
    let pgType = 'TEXT';
    switch (f.type) {
      case 'varchar':
        pgType = 'VARCHAR(255)';
        break;
      case 'integer':
        pgType = 'INTEGER';
        break;
      case 'boolean':
        pgType = 'BOOLEAN DEFAULT FALSE';
        break;
      case 'timestamp':
        pgType = 'TIMESTAMPTZ DEFAULT NOW()';
        break;
      case 'jsonb':
        pgType = 'JSONB DEFAULT \'{}\'::jsonb';
        break;
      default:
        pgType = 'TEXT';
    }

    if (f.name === 'id') {
      return `  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text`;
    }

    const nullability = f.required ? ' NOT NULL' : '';
    const defaultClause = f.defaultValue !== undefined && f.type !== 'boolean' && f.type !== 'timestamp'
      ? ` DEFAULT '${f.defaultValue}'`
      : '';

    const optionComment = f.options && f.options.length > 0 
      ? ` -- Dropdown: ${f.options.join(' | ')}` 
      : '';

    return `  ${f.name} ${pgType}${nullability}${defaultClause}${optionComment}`;
  });

  // Generate safe ALTER TABLE ADD COLUMN statements for existing tables
  const alterStatements = enabledFields
    .filter(f => f.name !== 'id')
    .map(f => {
      let pgType = 'TEXT';
      if (f.type === 'varchar') pgType = 'VARCHAR(255)';
      else if (f.type === 'integer') pgType = 'INTEGER';
      else if (f.type === 'boolean') pgType = 'BOOLEAN DEFAULT FALSE';
      else if (f.type === 'timestamp') pgType = 'TIMESTAMPTZ DEFAULT NOW()';
      else if (f.type === 'jsonb') pgType = 'JSONB DEFAULT \'{}\'::jsonb';

      const defaultClause = f.defaultValue !== undefined
        ? ` DEFAULT ${typeof f.defaultValue === 'string' ? `'${f.defaultValue}'` : f.defaultValue}`
        : '';

      return `ALTER TABLE public.${config.tableName} ADD COLUMN IF NOT EXISTS ${f.name} ${pgType}${defaultClause};`;
    })
    .join('\n');

  const columnComments = enabledFields
    .filter(f => f.options && f.options.length > 0)
    .map(f => `COMMENT ON COLUMN public.${config.tableName}.${f.name} IS 'Standard Dropdown Choices: ${f.options?.join(', ')}';`)
    .join('\n');

  const sql = `-- ==========================================================
-- BLKBRD Workshop Management - Custom Table Schema
-- Table: ${config.tableName} (${config.displayName})
-- Use Case Preset: ${config.activeUseCase.toUpperCase()}
-- Generated at: ${new Date().toISOString()}
-- ==========================================================

-- 1. Create table with customized column elements (if not existing)
CREATE TABLE IF NOT EXISTS public.${config.tableName} (
${columnLines.join(',\n')}
);

-- 2. Safe migration: Add dedicated columns to existing table if missing
${alterStatements}

-- 3. Create index for performance
${enabledFields.some(f => f.name === 'order_id') ? `CREATE INDEX IF NOT EXISTS idx_${config.tableName}_order_id ON public.${config.tableName} (order_id);` : ''}
${enabledFields.some(f => f.name === 'created_at') ? `CREATE INDEX IF NOT EXISTS idx_${config.tableName}_created_at ON public.${config.tableName} (created_at DESC);` : ''}

-- 4. Enable Row Level Security (RLS) and permit authenticated / service role access
ALTER TABLE public.${config.tableName} ENABLE ROW LEVEL SECURITY;

DO $ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = '${config.tableName}' AND policyname = 'Allow public read and write for workshop app'
  ) THEN
    CREATE POLICY "Allow public read and write for workshop app" 
    ON public.${config.tableName}
    FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;
END $;

COMMENT ON TABLE public.${config.tableName} IS 'Stores ${config.displayName} customized for ${config.activeUseCase} workflow';
${columnComments ? `\n-- Standard Dropdown Values Documentation\n${columnComments}\n` : ''}`;

  return sql;
}

/**
 * Generates the clean, focused SQL script specifically for the 4 pending tables:
 * customers_crm, order_audit_events, production_remarks, and shopify_orders.
 */
export function generatePendingSupabaseSchemaSql(): string {
  const auditSql = generateSupabaseTableSql(getStoredTableConfig('order_audit_events'));
  const remarksSql = generateSupabaseTableSql(getStoredTableConfig('production_remarks'));
  const customerSql = generateSupabaseTableSql(getStoredTableConfig('customers_crm'));

  return `-- =============================================================================
-- BLKBRD WORKSHOP OS - SUPABASE PENDING TABLES CREATION SCRIPT
-- Tables: customers_crm, order_audit_events, production_remarks, shopify_orders
-- Direct Project Link: https://supabase.com/dashboard/project/sdkqxjqemomwgveydbfv/sql/new
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ORDER AUDIT EVENTS (Journey History & Stage Audit Logs)
${auditSql}

-- 2. PRODUCTION REMARKS (Workshop Floor Notes & Delay Reasons)
${remarksSql}

-- 3. CUSTOMERS CRM (Dedicated Customer Profiles, Notes & Queries)
${customerSql}

-- 4. SHOPIFY ORDERS (Multi-Store Live Sync Cache: Global & LLC)
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
`;
}

/**
 * Generates the complete, production-ready, idempotent Supabase PostgreSQL schema
 * covering all 12 operational tables with their dedicated columns, safe migrations,
 * indexes, and RLS policies.
 */
export function generateFullSupabaseSchemaSql(): string {
  const auditSql = generateSupabaseTableSql(getStoredTableConfig('order_audit_events'));
  const remarksSql = generateSupabaseTableSql(getStoredTableConfig('production_remarks'));
  const customerSql = generateSupabaseTableSql(getStoredTableConfig('customers_crm'));
  const globalDelinquencySql = generateSupabaseTableSql(getStoredTableConfig('delinquency_global'));
  const llcDelinquencySql = generateSupabaseTableSql(getStoredTableConfig('delinquency_llc'));

  return `-- =============================================================================
-- BLKBRD WORKSHOP & CRM HUB - COMPLETE UNIFIED SUPABASE POSTGRESQL SCHEMA
-- Generated live from Dashboard Configuration: ${new Date().toISOString()}
--
-- How to apply:
-- 1. Open your Supabase Project Dashboard
-- 2. Navigate to "SQL Editor"
-- 3. Click "New Query", paste this entire script, and click "Run"
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. ORDER AUDIT EVENTS (Journey History & Stage Audit Logs)
-- =============================================================================
${auditSql}

-- =============================================================================
-- 2. PRODUCTION REMARKS (Workshop Floor Notes & Urgency)
-- =============================================================================
${remarksSql}

-- =============================================================================
-- 3. CUSTOMERS CRM (Dedicated Customer Page & Profile History)
-- =============================================================================
${customerSql}

-- =============================================================================
-- 4. DELINQUENCY GLOBAL (Shopify & Workshop Global Orders - INR)
-- =============================================================================
${globalDelinquencySql}

-- =============================================================================
-- 5. DELINQUENCY LLC (Shopify & Workshop LLC Orders - USD)
-- =============================================================================
${llcDelinquencySql}

-- =============================================================================
-- 6. RETURNS GLOBAL (Global Returns & Exchanges)
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

-- =============================================================================
-- 7. RETURNS LLC (US Returns & Exchanges)
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

-- =============================================================================
-- 8. RETURN STOCK IN (Domestic Warehouse Return Footwear)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.return_stock_in (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    serial_number INTEGER,
    receiving_date DATE DEFAULT CURRENT_DATE,
    order_id TEXT NOT NULL,
    item_name TEXT DEFAULT 'BLKBRD Footwear',
    leather TEXT,
    last TEXT,
    sole TEXT,
    size VARCHAR(50),
    width VARCHAR(50) DEFAULT 'E',
    notes TEXT,
    customization VARCHAR(10) DEFAULT 'N',
    customization_remark TEXT,
    return_tracking_awb TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 9. RETURN STOCK US (Boston / US Warehouse Return Footwear)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.return_stock_us (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    serial_number INTEGER,
    receiving_date DATE DEFAULT CURRENT_DATE,
    order_id TEXT NOT NULL,
    item_name TEXT DEFAULT 'BLKBRD Footwear',
    leather TEXT,
    last TEXT,
    sole TEXT,
    size VARCHAR(50),
    width VARCHAR(50) DEFAULT 'E',
    notes TEXT,
    customization VARCHAR(10) DEFAULT 'N',
    customization_remark TEXT,
    return_tracking_awb TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 10. DAILY DISPATCHES (Workshop Dispatches & Outgoing AWBs)
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

-- =============================================================================
-- 11. TRIAL PAIRS (Dedicated Trial Pairs Lifecycle)
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

-- =============================================================================
-- 12. SHOPIFY ORDERS (Live Sync Cache for Global & LLC Stores)
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

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR ALL TABLES
-- =============================================================================
DO $ 
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
END $;
`;
}

/**
 * Checks if table exists in live Supabase database
 */
export async function checkSupabaseTableStatus(tableName: string): Promise<{ exists: boolean; message: string; sampleCount?: number }> {
  try {
    const res = await fetch(`/api/supabase/table-status?table=${encodeURIComponent(tableName)}`, {
      headers: { Accept: 'application/json' }
    });
    
    // Check if response is valid JSON
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        exists: false,
        message: `Endpoint returned non-JSON response (HTTP ${res.status}). Ensure server backend is running.`
      };
    }

    if (res.ok) {
      const data = await res.json();
      if (data.exists) {
        const countMsg = typeof data.sampleCount === 'number'
          ? ` (Verified with ${data.sampleCount.toLocaleString()} records)`
          : '';
        return {
          exists: true,
          message: data.message || `Table "${tableName}" is active and connected in Supabase${countMsg}.`,
          sampleCount: data.sampleCount
        };
      } else {
        return {
          exists: false,
          message: data.error || `Table "${tableName}" has not been created in Supabase yet.`
        };
      }
    }

    const errData = await res.json().catch(() => null);
    return {
      exists: false,
      message: errData?.error || `Server check returned HTTP error ${res.status}`
    };
  } catch (err: any) {
    return { exists: false, message: err.message || 'Failed to check Supabase table status' };
  }
}

/**
 * Validates all operational tables in Supabase
 */
export async function checkAllSupabaseTablesStatus(): Promise<Record<string, { exists: boolean; message: string; sampleCount?: number }>> {
  const tables = [
    'delinquency_global',
    'delinquency_llc',
    'customers_crm',
    'order_audit_events',
    'production_remarks',
    'shopify_orders',
    'returns_global',
    'returns_llc',
    'return_stock_in',
    'return_stock_us',
    'daily_dispatches',
    'trial_pairs'
  ];

  try {
    const bulkRes = await fetch('/api/supabase/all-tables-status', {
      headers: { Accept: 'application/json' }
    });
    const contentType = bulkRes.headers.get('content-type') || '';
    if (bulkRes.ok && contentType.includes('application/json')) {
      const data = await bulkRes.json();
      if (data && data.tables) {
        const mapped: Record<string, { exists: boolean; message: string; sampleCount?: number }> = {};
        for (const tbl of tables) {
          const item = data.tables[tbl];
          if (item) {
            mapped[tbl] = {
              exists: !!item.exists,
              message: item.message || item.error || (item.exists ? `Table "${tbl}" is active in Supabase.` : `Table "${tbl}" not found.`),
              sampleCount: item.sampleCount
            };
          } else {
            mapped[tbl] = { exists: false, message: `Table "${tbl}" not found in Supabase.` };
          }
        }
        return mapped;
      }
    }
  } catch (_bulkErr) {
    // Fall back to individual checks
  }

  const results: Record<string, { exists: boolean; message: string; sampleCount?: number }> = {};
  await Promise.all(
    tables.map(async (tbl) => {
      results[tbl] = await checkSupabaseTableStatus(tbl);
    })
  );
  return results;
}
