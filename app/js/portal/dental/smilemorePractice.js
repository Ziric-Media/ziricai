/**
 * Browser copy of the published SmileMore diary facts.
 * Keep ids aligned with services/dental/smilemorePractice.js.
 */

export const SMILEMORE_LOCATIONS = [
  { id: 'family-city-square', label: 'Family practice — Shop No. 04, City Square Mall, Rustenburg' },
  { id: 'paediatric-senthadi', label: 'Paediatric practice — Senthadi Centre, 147 Leyds Street, Rustenburg' },
];

export const SMILEMORE_SERVICES = [
  { id: 'cleaning-polish', label: 'Cleaning and polish' },
  { id: 'root-planing', label: 'Root planing' },
  { id: 'filling', label: 'Filling' },
  { id: 'paediatric', label: 'Paediatric visit' },
  { id: 'cosmetic', label: 'Cosmetic dentistry' },
  { id: 'dentures', label: 'Dentures' },
  { id: 'braces', label: 'Braces' },
];

export const SMILEMORE_CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'phone', label: 'Phone' },
  { id: 'walk-in', label: 'Walk-in' },
  { id: 'sarah-sales', label: 'Sarah Sales' },
  { id: 'portal', label: 'Practice desk' },
  { id: 'other', label: 'Other' },
];

export const SMILEMORE_PUBLIC_TEAM = [
  'Dr. M.E. Ramorola',
  'Onkgopotse Pimpi',
  'Dr. V.B. Malema',
];

export const SMILEMORE_HOURS = 'Monday–Friday 09:00–17:00 · Saturday 09:00–13:00 · closed Sunday';

export const SA_MEDICAL_SCHEMES = [
  'Discovery Health',
  'GEMS',
  'Bonitas',
  'Momentum Medical Scheme',
  'Medihelp',
  'Bestmed',
  'Fedhealth',
  'Bankmed',
  'Polmed',
  'Profmed',
  'Medshield',
  'Sizwe Hosmed',
  'KeyHealth',
  'CompCare',
  'Thebemed',
  'Makoti',
  'Selfmed',
  'Medipos',
  'CAMAF',
  'Private / cash',
  'Other',
];

export function digitsPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

const OPEN = { Mon: [540, 1020], Tue: [540, 1020], Wed: [540, 1020], Thu: [540, 1020], Fri: [540, 1020], Sat: [540, 780] };
const BLOCKING = new Set(['requested', 'confirmed', 'checked_in', 'scheduled']);

export function practiceDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds;
    if (seconds != null && seconds !== '') {
      const date = new Date(Number(seconds) * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function practiceWall(value) {
  const date = practiceDate(value);
  if (!date) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Johannesburg',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function practiceLabel(value) {
  const date = practiceDate(value);
  if (!date) return 'Time not recorded';
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function slotsForDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return [];
  const weekday = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'short',
  }).format(new Date(`${dateStr}T12:00:00+02:00`));
  const bounds = OPEN[weekday];
  if (!bounds) return [];
  const slots = [];
  for (let minutes = bounds[0]; minutes + 30 <= bounds[1]; minutes += 30) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
    const minute = String(minutes % 60).padStart(2, '0');
    slots.push({ wall: `${dateStr}T${hour}:${minute}`, label: `${hour}:${minute}` });
  }
  return slots;
}

export function slotTaken(bookings, wall, locationId, excludeId) {
  return (bookings || []).some((booking) => {
    if (!booking || booking.id === excludeId) return false;
    if (booking.locationId !== locationId) return false;
    if (!BLOCKING.has(String(booking.status || '').toLowerCase())) return false;
    return practiceWall(booking.scheduledAt) === wall;
  });
}
