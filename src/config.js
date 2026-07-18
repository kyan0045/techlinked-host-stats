export const CHANNEL_HANDLE = "techlinked";

const DEFAULT_START_DATE = "2025-07-01";

function parseDate(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} must use YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} is not a valid date`);
  }
  return date;
}

export function reportRange(environment = process.env, now = new Date()) {
  const startValue = environment.REPORT_START_DATE || DEFAULT_START_DATE;
  const endValue = !environment.REPORT_END_DATE || environment.REPORT_END_DATE === "today"
    ? now.toISOString().slice(0, 10)
    : environment.REPORT_END_DATE;
  const start = parseDate(startValue, "REPORT_START_DATE");
  const end = parseDate(endValue, "REPORT_END_DATE");
  if (end < start) throw new Error("REPORT_END_DATE must be on or after REPORT_START_DATE");
  const endExclusive = new Date(end);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return {
    start: start.toISOString(),
    endInclusive: end.toISOString(),
    endExclusive: endExclusive.toISOString()
  };
}

export function matureReportRange(range, environment = process.env, now = new Date()) {
  const value = environment.MIN_VIDEO_AGE_DAYS || "7";
  const minimumAgeDays = Number(value);
  if (!Number.isFinite(minimumAgeDays) || minimumAgeDays < 0) {
    throw new Error("MIN_VIDEO_AGE_DAYS must be a non-negative number");
  }
  const cutoff = new Date(now.getTime() - minimumAgeDays * 24 * 60 * 60 * 1000);
  const requestedEnd = new Date(range.endExclusive);
  const endExclusive = new Date(Math.min(requestedEnd.getTime(), cutoff.getTime() + 1));
  if (endExclusive <= new Date(range.start)) {
    throw new Error("The report range contains no videos old enough to include");
  }
  return {
    ...range,
    endInclusive: new Date(endExclusive.getTime() - 1).toISOString(),
    endExclusive: endExclusive.toISOString(),
    minimumVideoAgeDays: minimumAgeDays
  };
}
