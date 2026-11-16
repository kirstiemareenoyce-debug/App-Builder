/**
 * Task due_date is a calendar day, not a timestamp. Never convert it through UTC.
 * Local noon avoids the ordinary DST transitions around local midnight.
 */
export function parseTaskDueDate(value: string | null | undefined): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  // setFullYear, unlike the multi-argument constructor, preserves years 1–99.
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;
  return date;
}

export function formatTaskDueDate(value: Date | null): string | null {
  if (value === null) return null;
  const year = value.getFullYear();
  if (!Number.isFinite(value.getTime()) || year < 1 || year > 9999) {
    throw new RangeError("Choose a valid task due date.");
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}
