import * as schema from './schema.ts';

// Cloud SQL disabled
export const db: any = {
  select: () => ({ from: async () => [] }),
  insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [{ id: 1, uid: 'crm3-admin', email: 'crm3.blkbrdshoemaker@gmail.com' }] }) }) })
};

export const createPool = () => undefined;

