import { TrialPairItem } from '../types';

const STORAGE_KEY_TRIALS = 'blkbrd_trial_pairs';

export const initialTrialPairs: TrialPairItem[] = [];

export function getStoredTrialPairs(): TrialPairItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_TRIALS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Failed to load trial pairs', e);
  }
  return initialTrialPairs;
}

export function saveStoredTrialPairs(items: TrialPairItem[]) {
  localStorage.setItem(STORAGE_KEY_TRIALS, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('blkbrd_trials_updated', { detail: items }));
}
