/**
 * Client-side SmileMore POS revenue helpers (mirrors services/dental/dentalPosRevenue.js).
 */
export function johannesburgDayKey(value) {
  let candidate = value;
  if (candidate && typeof candidate.toDate === 'function') candidate = candidate.toDate();
  if (candidate && typeof candidate === 'object' && !(candidate instanceof Date)) {
    const seconds = candidate.seconds ?? candidate._seconds;
    if (seconds != null) candidate = new Date(Number(seconds) * 1000);
  }
  const date = candidate instanceof Date ? candidate : new Date(candidate);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function recordedDentalPosAmount(sale) {
  return Math.max(0, Number(sale?.total) || 0);
}

export function collectedDentalPosAmount(sale) {
  const method = String(sale?.method || '');
  if (method === 'medical_aid') return 0;
  if (method === 'split') {
    return Math.max(0, Number(sale?.split?.cash) || 0) + Math.max(0, Number(sale?.split?.card) || 0);
  }
  return Math.max(0, Number(sale?.total) || 0);
}

export function summarizeDentalPosRevenue(sales = []) {
  const todayKey = johannesburgDayKey(new Date());
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenStart = johannesburgDayKey(sevenDaysAgo);

  let receiptCount = 0;
  let collectedToday = 0;
  let collected7d = 0;
  let collectedAll = 0;
  let recordedToday = 0;
  let recorded7d = 0;
  let recordedAll = 0;
  let todayReceiptCount = 0;

  for (const sale of sales) {
    receiptCount += 1;
    const collected = collectedDentalPosAmount(sale);
    const recorded = recordedDentalPosAmount(sale);
    collectedAll += collected;
    recordedAll += recorded;
    const day = johannesburgDayKey(sale?.createdAt);
    if (day && day >= sevenStart) {
      collected7d += collected;
      recorded7d += recorded;
    }
    if (day === todayKey) {
      todayReceiptCount += 1;
      collectedToday += collected;
      recordedToday += recorded;
    }
  }

  return {
    receiptCount,
    todayReceiptCount,
    collectedToday,
    collected7d,
    collectedAll,
    recordedToday,
    recorded7d,
    recordedAll,
  };
}
