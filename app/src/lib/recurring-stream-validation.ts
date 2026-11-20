const MAX_LEDGER = 0xffff_ffff;

export function validateRecurringSchedule(start: string, end: string, interval: string): string | null {
  const values = [start, end, interval];
  if (values.some((value) => !/^\d+$/.test(value))) return "Ledgers and interval must be whole numbers";
  const [startLedger, endLedger, intervalLedgers] = values.map(Number);
  if ([startLedger, endLedger, intervalLedgers].some((value) => !Number.isSafeInteger(value) || value > MAX_LEDGER)) {
    return "Ledger values must fit in u32";
  }
  if (intervalLedgers === 0) return "Interval must be at least one ledger";
  if (endLedger <= startLedger || endLedger - startLedger < intervalLedgers) {
    return "End ledger must be at least one interval after start ledger";
  }
  return null;
}
