export function continuousMonths(months) {
  if (!months.length) return [];
  const sorted = [...new Set(months)].sort();
  const end = new Date(`${sorted.at(-1)}-01T00:00:00Z`);
  const cursor = new Date(`${sorted[0]}-01T00:00:00Z`);
  const result = [];
  while (cursor <= end) {
    result.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

export function completeMonths(months, rangeStart, rangeEndExclusive) {
  const start = new Date(rangeStart);
  const end = new Date(rangeEndExclusive);
  return months.filter((month) => {
    const monthStart = new Date(`${month}-01T00:00:00Z`);
    const nextMonth = new Date(monthStart);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    return monthStart >= start && nextMonth <= end;
  });
}

export function trendSegments(values) {
  const segments = [];
  let previous;
  values.forEach((value, index) => {
    if (value == null) return;
    const current = { index, value };
    if (previous) {
      segments.push({
        from: previous,
        to: current,
        dotted: current.index - previous.index > 1
      });
    }
    previous = current;
  });
  return segments;
}

export function dottedPointIndexes(segments) {
  return [...new Set(segments
    .filter((segment) => segment.dotted)
    .flatMap((segment) => [segment.from.index, segment.to.index]))];
}
