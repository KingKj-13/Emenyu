// Static config for the waiter demo. Brand name is the showcase label only —
// it does not change the shared menu data.
import type { SpeechTone, WaiterRole } from '../types/waiter';

export const BRAND_NAME = 'Aurum & Ember';
export const SHIFT_START = '17:00';
export const DEFAULT_SECTION = [5, 7, 12, 18, 21, 24];
export const WAITER_ROLES: WaiterRole[] = ['Head Waiter', 'Server', 'Runner'];

export const SPEECH_TONES: { key: SpeechTone; label: string }[] = [
  { key: 'casual', label: 'Casual' },
  { key: 'professional', label: 'Professional' },
  { key: 'luxury', label: 'Luxury' },
  { key: 'short', label: 'Short' },
  { key: 'upsell', label: 'Upsell' }
];

export const SERVICE_NOTE_TAGS = ['Allergy', 'VIP', 'Birthday', 'High chair', 'Window', 'Quiet'];
