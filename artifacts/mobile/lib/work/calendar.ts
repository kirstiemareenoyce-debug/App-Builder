import type { WorkEvent } from "../../types/work";

export function validWorkDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1)
    return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return (
    day <=
    [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  );
}
export function localWorkDate(date = new Date()): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dateAtNoon(day: string): Date {
  if (!validWorkDate(day))
    throw new Error("Use a real date in YYYY-MM-DD format.");
  const [year, month, date] = day.split("-").map(Number);
  const result = new Date(0);
  result.setHours(12, 0, 0, 0);
  result.setFullYear(year, month - 1, date);
  return result;
}
export function shiftWorkDate(day: string, days: number): string {
  const date = dateAtNoon(day);
  date.setDate(date.getDate() + days);
  const result = localWorkDate(date);
  if (!validWorkDate(result))
    throw new Error("Date is outside the supported calendar range.");
  return result;
}
export function shiftWorkMonth(month: string, delta: number): string {
  const date = dateAtNoon(`${month}-01`);
  date.setMonth(date.getMonth() + delta);
  const result = localWorkDate(date);
  if (!validWorkDate(result))
    throw new Error("Month is outside the supported range.");
  return result.slice(0, 7);
}
export function monthCells(month: string): (string | null)[] {
  const first = dateAtNoon(`${month}-01`);
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  for (let day = 1; day <= 31; day++) {
    const value = `${month}-${String(day).padStart(2, "0")}`;
    if (validWorkDate(value)) cells.push(value);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}
export function validWorkTimezone(zone: string): boolean {
  if (!zone || zone.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
function zoneParts(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}
export function workDayInZone(instant: string, zone: string): string {
  const p = zoneParts(new Date(instant), zone);
  return `${p.year.padStart(4, "0")}-${p.month}-${p.day}`;
}
export function zonedWorkISO(date: Date, zone: string): string {
  const p = zoneParts(date, zone);
  const local = `${p.year.padStart(4, "0")}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  const offset = Math.round(
    (Date.parse(`${local}Z`) - Math.floor(date.getTime() / 1000) * 1000) /
      60000,
  );
  const sign = offset < 0 ? "-" : "+";
  return `${local}${sign}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;
}
/** Reject rollover dates, missing offsets, DST gaps and an offset inconsistent with the chosen zone. */
export function validateWorkInstant(value: string, zone: string): string {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (
    !match ||
    !validWorkDate(match[1]) ||
    Number(match[2]) > 23 ||
    Number(match[3]) > 59 ||
    Number(match[4] ?? 0) > 59
  ) {
    throw new Error(
      "Use a valid ISO date/time with an explicit offset, e.g. 2026-11-16T09:00+10:00.",
    );
  }
  if (!validWorkTimezone(zone))
    throw new Error("Choose a valid IANA timezone, e.g. Australia/Brisbane.");
  const offset = match[5];
  if (offset !== "Z") {
    const hours = Number(offset.slice(1, 3)),
      minutes = Number(offset.slice(4));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0))
      throw new Error("Timezone offset must be within ±14:00.");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Invalid event instant.");
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999)
    throw new Error("Event instant is outside years 0001–9999.");
  const actual = zonedWorkISO(date, zone);
  const expectedLocal = `${match[1]}T${match[2]}:${match[3]}:${match[4] ?? "00"}`;
  if (actual.slice(0, 19) !== expectedLocal)
    throw new Error(
      "The time/offset does not match this timezone (check daylight saving).",
    );
  return date.toISOString();
}
export function eventsOnWorkDay(
  events: WorkEvent[],
  day: string,
  displayZone: string,
): WorkEvent[] {
  return events
    .filter((e) =>
      e.all_day
        ? Boolean(
            e.start_date &&
            e.end_date &&
            e.start_date <= day &&
            e.end_date > day,
          )
        : Boolean(
            e.starts_at &&
            e.ends_at &&
            workDayInZone(e.starts_at, displayZone) <= day &&
            workDayInZone(
              new Date(Date.parse(e.ends_at) - 1).toISOString(),
              displayZone,
            ) >= day,
          ),
    )
    .sort(
      (a, b) =>
        Number(b.all_day) - Number(a.all_day) ||
        (a.starts_at ?? a.start_date ?? "").localeCompare(
          b.starts_at ?? b.start_date ?? "",
        ),
    );
}

/** Validated month input prevents filter injection; low years never pass through Date.UTC's 1900 offset. */
export function workMonthBounds(month: string) {
  const first = `${month}-01`;
  if (!/^\d{4}-\d{2}$/.test(month) || !validWorkDate(first))
    throw new Error("Choose a valid Work calendar month.");
  const start = new Date(`${first}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const next = `${String(end.getUTCFullYear()).padStart(4, "0")}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return {
    first,
    next,
    lower: new Date(start.getTime() - 86400000).toISOString(),
    upper: new Date(end.getTime() + 86400000).toISOString(),
  };
}

/** Resolve a wall-clock default in an IANA zone; edited ambiguous times still require explicit offsets. */
export function workWallClockISO(
  day: string,
  hour: number,
  zone: string,
): string {
  if (
    !validWorkDate(day) ||
    !validWorkTimezone(zone) ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23
  )
    throw new Error("Invalid Work wall-clock time.");
  const wall = `${day}T${String(hour).padStart(2, "0")}:00:00`;
  const target = Date.parse(`${wall}Z`);
  let instant = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const formatted = zonedWorkISO(new Date(instant), zone);
    const represented = Date.parse(`${formatted.slice(0, 19)}Z`);
    if (represented === target) return formatted;
    instant += target - represented;
  }
  throw new Error(
    "The selected wall-clock time does not exist in this timezone.",
  );
}
