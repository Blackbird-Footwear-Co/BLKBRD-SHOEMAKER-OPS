import { UserProfile, UserRole } from '../types';

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'disabled';
  department?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface CreateStaffUserInput {
  name: string;
  email: string;
  role: UserRole;
  password: string;
  department?: string;
  status?: 'active' | 'disabled';
}

export interface UpdateStaffUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
  password?: string;
  department?: string;
  status?: 'active' | 'disabled';
}

/**
 * Login with email and password
 */
export async function authenticateStaffUser(
  email: string,
  password: string
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Authentication failed. Please check your credentials.' };
    }

    return {
      success: true,
      user: {
        id: data.user.id,
        uid: data.user.id,
        email: data.user.email,
        displayName: data.user.name,
        name: data.user.name,
        role: data.user.role,
        department: data.user.department
      }
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unable to connect to authentication service.' };
  }
}

/**
 * Fetch all registered staff users (Admin authority)
 */
export async function fetchStaffUsers(): Promise<StaffUser[]> {
  try {
    const res = await fetch('/api/admin/users');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.users || [];
  } catch (err) {
    console.warn('Failed to fetch staff users from server:', err);
    return [];
  }
}

/**
 * Create a new staff user with password (Admin authority)
 */
export async function createStaffUser(input: CreateStaffUserInput): Promise<{ success: boolean; user?: StaffUser; error?: string }> {
  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Failed to create staff user.' };
    }

    return { success: true, user: data.user };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error while creating staff member.' };
  }
}

/**
 * Update staff member details or reset their password (Admin authority)
 */
export async function updateStaffUser(id: string, input: UpdateStaffUserInput): Promise<{ success: boolean; user?: StaffUser; error?: string }> {
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Failed to update staff user.' };
    }

    return { success: true, user: data.user };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error while updating staff member.' };
  }
}

/**
 * Deactivate or delete staff user (Admin authority)
 */
export async function deleteStaffUser(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Failed to remove staff member.' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error while removing staff member.' };
  }
}
