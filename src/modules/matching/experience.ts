/** Оценка стажа по датам из резюме. Даты в резюме свободные, поэтому то, что не удалось разобрать, честно остаётся «неизвестно». */

const MONTHS: Record<string, number> = {
  янв: 1, фев: 2, мар: 3, апр: 4, май: 5, мая: 5, июн: 6, июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const PRESENT = /(по\s+)?(н\.?\s?в\.?|наст|сейчас|текущ|present|current|now|today)/i;

/** Возвращает номер месяца от нулевого года (год*12+месяц-1) или null. */
export function parseMonth(raw: string, now: Date): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (PRESENT.test(s)) return now.getUTCFullYear() * 12 + now.getUTCMonth();
  const year = s.match(/(?<!\d)((?:19|20)\d{2})(?!\d)/);
  if (!year) return null;
  const y = Number(year[1]);
  if (y > now.getUTCFullYear() + 1) return null;
  let m: number | undefined;
  const num = s.match(/(?<!\d)(\d{1,2})\s*[./-]\s*(?:19|20)\d{2}/) ?? s.match(/(?:19|20)\d{2}\s*[./-]\s*(\d{1,2})(?!\d)/);
  if (num) m = Number(num[1]);
  if (!m || m < 1 || m > 12) {
    const word = s.match(/[a-zа-я]{3,}/g)?.map((w) => MONTHS[w.slice(0, 3)]).find(Boolean);
    m = word ?? 1;
  }
  return y * 12 + (m - 1);
}

export type ExperienceEstimate = {
  /** Суммарный стаж в годах (округлён до 0.5) или null, если ни одной даты не разобрано. */
  years: number | null;
  parsed: number;
  total: number;
};

/** Суммарный стаж по объединению интервалов (пересекающиеся места работы не складываются). */
export function estimateExperience(entries: { start: string; end: string }[], now = new Date()): ExperienceEstimate {
  const intervals: [number, number][] = [];
  for (const e of entries) {
    const start = parseMonth(e.start, now);
    // Пустой конец не считается «по настоящее время»: это было бы догадкой.
    const end = parseMonth(e.end, now);
    if (start === null || end === null || end < start) continue;
    intervals.push([start, end + 1]);
  }
  if (intervals.length === 0) return { years: null, parsed: 0, total: entries.length };
  intervals.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let [curStart, curEnd] = intervals[0];
  for (const [s, e] of intervals.slice(1)) {
    if (s <= curEnd) curEnd = Math.max(curEnd, e);
    else {
      months += curEnd - curStart;
      [curStart, curEnd] = [s, e];
    }
  }
  months += curEnd - curStart;
  return { years: Math.round((months / 12) * 2) / 2, parsed: intervals.length, total: entries.length };
}
