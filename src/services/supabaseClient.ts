/**
 * BLKBRD Supabase Client
 * 
 * Proxies queries through backend endpoints (/api/supabase/*) to keep
 * the service role secret API key protected on the server, avoiding
 * "Forbidden use of secret API key in browser" errors.
 */

export interface SupabaseResponse<T = any> {
  data: T | null;
  error: { message: string } | null;
}

export class SupabaseQueryBuilder<T = any> implements PromiseLike<SupabaseResponse<T>> {
  private table: string;
  private selectCols: string = '*';
  private orderCol?: string;
  private orderAscending: boolean = true;
  private limitCount?: number;
  private filters: Array<{ col: string; op: string; val: any }> = [];
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payloadRows?: any[];
  private updateValues?: any;
  private wantsSelect: boolean = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*') {
    if (this.mode === 'insert' || this.mode === 'update') {
      this.wantsSelect = true;
    } else {
      this.mode = 'select';
      this.selectCols = columns;
    }
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderCol = column;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ col: column, op: 'eq', val: value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ col: column, op: 'neq', val: value });
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push({ col: column, op: 'in', val: values });
    return this;
  }

  insert(rows: any | any[]) {
    this.mode = 'insert';
    this.payloadRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  upsert(rows: any | any[], _options?: { onConflict?: string }) {
    this.mode = 'insert';
    this.payloadRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(values: any) {
    this.mode = 'update';
    this.updateValues = values;
    return this;
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  private async execute(): Promise<SupabaseResponse<T>> {
    let endpoint = '/api/supabase/select';
    let body: any = {};

    if (this.mode === 'select') {
      endpoint = '/api/supabase/select';
      body = {
        table: this.table,
        select: this.selectCols,
        order: this.orderCol,
        ascending: this.orderAscending,
        limit: this.limitCount,
        filters: this.filters
      };
    } else if (this.mode === 'insert') {
      endpoint = '/api/supabase/insert';
      body = {
        table: this.table,
        rows: this.payloadRows,
        select: this.wantsSelect
      };
    } else if (this.mode === 'update') {
      endpoint = '/api/supabase/update';
      body = {
        table: this.table,
        values: this.updateValues,
        filters: this.filters,
        select: this.wantsSelect
      };
    } else if (this.mode === 'delete') {
      endpoint = '/api/supabase/delete';
      body = {
        table: this.table,
        filters: this.filters
      };
    }

    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(body)
        });

        let json: any = null;
        const text = await res.text();
        try {
          json = text ? JSON.parse(text) : {};
        } catch (_parseErr) {
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            continue;
          }
          return {
            data: this.mode === 'select' ? ([] as any) : null,
            error: null // Fallback quietly rather than crashing UI
          };
        }

        if (!res.ok) {
          const errMsg = json?.error?.message || '';
          const isTransient =
            errMsg.toLowerCase().includes('jwt issued at future') ||
            errMsg.toLowerCase().includes('clock skew') ||
            errMsg.toLowerCase().includes('pgrst303') ||
            errMsg.toLowerCase().includes('timeout') ||
            errMsg.toLowerCase().includes('525') ||
            errMsg.toLowerCase().includes('ssl') ||
            errMsg.toLowerCase().includes('cloudflare');

          if (isTransient && attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }

          return {
            data: this.mode === 'select' ? ([] as any) : null,
            error: json.error || { message: `Request failed with status ${res.status}` }
          };
        }

        return {
          data: json.data !== undefined ? json.data : (this.mode === 'select' ? [] : null),
          error: json.error || null
        };
      } catch (err: any) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        return {
          data: this.mode === 'select' ? ([] as any) : null,
          error: { message: err.message || 'Network error' }
        };
      }
    }

    return { data: this.mode === 'select' ? ([] as any) : null, error: { message: 'Failed after retries' } };
  }

  then<TResult1 = SupabaseResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export interface SupabaseRealtimeChannel {
  name: string;
  on: (
    type: string,
    filter: { event: string; schema?: string; table: string },
    callback: (payload: any) => void
  ) => SupabaseRealtimeChannel;
  subscribe: () => SupabaseRealtimeChannel;
  unsubscribe: () => void;
}

const activeChannels = new Set<{ name: string; intervalId?: any }>();

export const supabase = {
  from: <T = any>(table: string) => new SupabaseQueryBuilder<T>(table),
  channel: (name: string): SupabaseRealtimeChannel => {
    const listeners: Array<{
      type: string;
      filter: { event: string; schema?: string; table: string };
      callback: (payload: any) => void;
    }> = [];

    const channelObj: SupabaseRealtimeChannel = {
      name,
      on(type, filter, callback) {
        listeners.push({ type, filter, callback });
        return this;
      },
      subscribe() {
        // Quiet background sync poll across listeners (every 60s) without spamming
        const intervalId = setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden) {
            return; // Don't run background polls when tab is inactive
          }
          listeners.forEach(l => {
            try {
              l.callback({ eventType: 'SYNC', table: l.filter.table });
            } catch (e) {
              // ignore
            }
          });
        }, 60000);

        const record = { name, intervalId };
        activeChannels.add(record);
        return this;
      },
      unsubscribe() {
        for (const c of activeChannels) {
          if (c.name === name) {
            if (c.intervalId) clearInterval(c.intervalId);
            activeChannels.delete(c);
          }
        }
      }
    };

    return channelObj;
  },
  removeChannel: (channel: any) => {
    if (channel && typeof channel.unsubscribe === 'function') {
      channel.unsubscribe();
    }
  }
};
