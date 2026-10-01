import { UserProfile, UserRole } from '../types';

export const DEFAULT_STANDALONE_USER = {
  uid: 'crm3-admin',
  email: 'crm3.blkbrdshoemaker@gmail.com',
  displayName: 'BLKBRD Operations Lead (CRM3)',
  photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  role: 'admin' as UserRole
};

export const auth: any = {
  currentUser: DEFAULT_STANDALONE_USER
};

let cachedAccessToken: string | null = (() => {
  try {
    return sessionStorage.getItem('blkbrd_google_access_token');
  } catch {
    return null;
  }
})();

export const getCachedAccessToken = () => {
  if (cachedAccessToken) return cachedAccessToken;
  try {
    const stored = sessionStorage.getItem('blkbrd_google_access_token');
    if (stored) {
      cachedAccessToken = stored;
      return stored;
    }
  } catch {}
  return null;
};

export const initAuthListener = (
  onSuccess: (user: any, token: string | null) => void,
  onSignedOut: () => void
) => {
  const isSignedOut = localStorage.getItem('blkbrd_signed_out') === 'true';
  if (isSignedOut) {
    onSignedOut();
  } else {
    onSuccess(DEFAULT_STANDALONE_USER, cachedAccessToken);
  }
  return () => {};
};

export const signInWithGoogle = async (): Promise<{
  user: any;
  accessToken: string;
  role: UserRole;
  canceled?: boolean;
} | null> => {
  localStorage.removeItem('blkbrd_signed_out');
  return {
    user: DEFAULT_STANDALONE_USER,
    accessToken: cachedAccessToken || '',
    role: 'admin'
  };
};

export const logoutUser = async () => {
  try {
    localStorage.setItem('blkbrd_signed_out', 'true');
    cachedAccessToken = null;
    try {
      sessionStorage.removeItem('blkbrd_google_access_token');
    } catch {}
  } catch (err) {
    console.warn('Sign out notice:', err);
  }
};
