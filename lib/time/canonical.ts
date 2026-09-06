const UTC_INSTANT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isCanonicalUtcInstant(value: string): boolean {
  const match = UTC_INSTANT_RE.exec(value);
  if (!match) return false;
  const [, y, mo, d, h, mi, s, ms = "000"] = match;
  const parts = [y, mo, d, h, mi, s, ms].map(Number);
  if (parts[3] > 23 || parts[4] > 59 || parts[5] > 59) return false;

  const date = new Date(Date.UTC(
    parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5], parts[6],
  ));
  return date.getUTCFullYear() === parts[0]
    && date.getUTCMonth() + 1 === parts[1]
    && date.getUTCDate() === parts[2]
    && date.getUTCHours() === parts[3]
    && date.getUTCMinutes() === parts[4]
    && date.getUTCSeconds() === parts[5]
    && date.getUTCMilliseconds() === parts[6];
}

export function assertCanonicalUtcInstant(value: string, field = "timestamp"): void {
  if (!isCanonicalUtcInstant(value)) throw new Error(`${field} must be a canonical UTC instant`);
}

export function isCanonicalLocalDate(value: string): boolean {
  const match = LOCAL_DATE_RE.exec(value);
  if (!match) return false;
  const [, y, mo, d] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}

export function assertCanonicalLocalDate(value: string, field = "date"): void {
  if (!isCanonicalLocalDate(value)) throw new Error(`${field} must be a canonical local date`);
}

export function localDateDayNumber(value: string, field = "date"): number {
  assertCanonicalLocalDate(value, field);
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function previousLocalDate(value: string, field = "date"): string {
  assertCanonicalLocalDate(value, field);
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export function assertSevenDayLocalInterval(start: string, end: string, field = "week"): void {
  const startDay = localDateDayNumber(start, `${field} start`);
  const endDay = localDateDayNumber(end, `${field} end`);
  if (endDay - startDay !== 6) throw new Error(`${field} must span exactly seven local dates`);
}

/** Adds `offsetDays` (may be negative) whole days to a canonical local date, returning a canonical local date. */
export function addLocalDays(value: string, offsetDays: number, field = "date"): string {
  assertCanonicalLocalDate(value, field);
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}
