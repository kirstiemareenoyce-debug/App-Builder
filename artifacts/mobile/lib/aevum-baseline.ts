import { AEVUM_BASELINE_DAYS } from "./aevum";

type BaselineEntry = {
  logged_at: string;
  score: number;
  energy_level: number | null;
};

export type AevumBaselineSummary = {
  daysTracked: number;
  moodAverage: number | null;
  energyAverage: number | null;
  isComplete: boolean;
  windowStart: string;
  windowEnd: string;
};

type DayBucket = { mood: number[]; energy: number[] };

function startOfLocalDay(value: Date) {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
}

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const date = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function validScore(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 1 && value <= 10;
}

function averageDaily(values: number[][]) {
  if (values.length === 0) return null;
  const dailyMeans = values.map((day) => day.reduce((sum, value) => sum + value, 0) / day.length);
  const mean = dailyMeans.reduce((sum, value) => sum + value, 0) / dailyMeans.length;
  return Math.round(mean * 10) / 10;
}

/**
 * Summarise only observations in the current local-calendar 14-day window.
 * One day counts only when both a valid mood and energy value were recorded.
 * Multiple check-ins on one day are averaged within that day before the
 * 14-day average is calculated, so extra entries do not overweight a day.
 */
export function summarizeAevumBaseline(entries: readonly BaselineEntry[], now = new Date()): AevumBaselineSummary {
  const windowEnd = startOfLocalDay(now);
  const windowStart = new Date(windowEnd);
  windowStart.setDate(windowStart.getDate() - (AEVUM_BASELINE_DAYS - 1));
  const nextDay = new Date(windowEnd);
  nextDay.setDate(nextDay.getDate() + 1);
  const buckets = new Map<string, DayBucket>();

  for (const entry of entries) {
    const loggedAt = new Date(entry.logged_at);
    const timestamp = loggedAt.getTime();
    if (!Number.isFinite(timestamp) || timestamp < windowStart.getTime() || timestamp > now.getTime() || timestamp >= nextDay.getTime()) continue;
    const key = localDateKey(loggedAt);
    const bucket = buckets.get(key) ?? { mood: [], energy: [] };
    if (validScore(entry.score)) bucket.mood.push(entry.score);
    if (validScore(entry.energy_level)) bucket.energy.push(entry.energy_level);
    buckets.set(key, bucket);
  }

  const moodDays = [...buckets.values()].filter((day) => day.mood.length > 0);
  const energyDays = [...buckets.values()].filter((day) => day.energy.length > 0);
  const daysTracked = [...buckets.values()].filter((day) => day.mood.length > 0 && day.energy.length > 0).length;
  return {
    daysTracked,
    moodAverage: averageDaily(moodDays.map((day) => day.mood)),
    energyAverage: averageDaily(energyDays.map((day) => day.energy)),
    isComplete: daysTracked >= AEVUM_BASELINE_DAYS,
    windowStart: localDateKey(windowStart),
    windowEnd: localDateKey(windowEnd),
  };
}
