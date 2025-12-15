const DEFAULT_LOCALE = 'en-US';

type FormatterKey = string;

const dateFormatterCache = new Map<FormatterKey, Intl.DateTimeFormat>();

const getFormatter = (timeZone: string, options: Intl.DateTimeFormatOptions) => {
  const mergedOptions = { timeZone, ...options };
  const key = JSON.stringify(mergedOptions);
  if (!dateFormatterCache.has(key)) {
    dateFormatterCache.set(key, new Intl.DateTimeFormat(DEFAULT_LOCALE, mergedOptions));
  }
  return dateFormatterCache.get(key)!;
};

const getDateTimeParts = (date: Date, timeZone: string) => {
  const formatter = getFormatter(timeZone, {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const result: Record<string, string> = {};
  parts.forEach(({ type, value }) => {
    if (type !== 'literal') {
      result[type] = value;
    }
  });
  return {
    year: Number(result.year),
    month: Number(result.month),
    day: Number(result.day),
    hour: Number(result.hour ?? '0'),
    minute: Number(result.minute ?? '0'),
    second: Number(result.second ?? '0'),
  };
};

const createDateInTimeZone = (
  components: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string
) => {
  const utcMillis = Date.UTC(
    components.year,
    components.month - 1,
    components.day,
    components.hour ?? 0,
    components.minute ?? 0,
    components.second ?? 0
  );
  const tempDate = new Date(utcMillis);
  const offset = getTimeZoneOffsetMilliseconds(tempDate, timeZone);
  return new Date(utcMillis - offset);
};

const getTimeZoneOffsetMilliseconds = (date: Date, timeZone: string) => {
  const parts = getDateTimeParts(date, timeZone);
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUTC - date.getTime();
};

export const getAppTimeZone = (preferred?: string | null): string => {
  if (preferred && preferred.trim().length) {
    return preferred.trim();
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
};

export const formatDateInTimeZone = (date: Date, timeZone: string): string => {
  const formatter = getFormatter(timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const result: Record<string, string> = {};
  parts.forEach(({ type, value }) => {
    if (type !== 'literal') {
      result[type] = value;
    }
  });
  return `${result.year}-${result.month}-${result.day}`;
};

export const startOfDayISO = (date: Date, timeZone: string): string => {
  const parts = getDateTimeParts(date, timeZone);
  const zonedDate = createDateInTimeZone(
    { year: parts.year, month: parts.month, day: parts.day, hour: 0, minute: 0, second: 0 },
    timeZone
  );
  return zonedDate.toISOString();
};

export const startOfNextDayISO = (date: Date, timeZone: string): string => {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return startOfDayISO(next, timeZone);
};
