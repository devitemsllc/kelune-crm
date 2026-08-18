import dayjs, { Dayjs } from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import utcPlugin from 'dayjs/plugin/utc';
import { __, sprintf } from '@wordpress/i18n';

dayjs.extend(relativeTime);
dayjs.extend(utcPlugin);

type DateInput = string | number | Date | null | undefined;

/** MySQL DATETIME shape the backend stores and compares against (UTC). */
const DB_FORMAT = 'YYYY-MM-DD HH:mm:ss';

/**
 * Convert a picker value (interpreted in the viewer's local browser timezone)
 * to the UTC string the backend stores. The whole app stores UTC and compares
 * against UTC (`current_time('mysql', true)`), so every datetime the user picks
 * must be converted here before it is sent — otherwise a value picked in a
 * non-UTC browser is compared against UTC and fires at the wrong wall-clock time.
 *
 * The inverse of {@link fromUtc}; the display helpers below already do the same
 * UTC→local conversion for read-only output.
 */
export const toUtc = (value: Dayjs | null | undefined): string | null => {
  if (!value || !dayjs.isDayjs(value) || !value.isValid()) {
    return null;
  }
  return value.utc().format(DB_FORMAT);
};

/**
 * Convert a UTC datetime string from the backend into a local-time dayjs object
 * suitable for seeding an Ant Design DatePicker, so the user edits in their own
 * browser timezone. The inverse of {@link toUtc}.
 */
export const fromUtc = (dbTime: DateInput): Dayjs | null => {
  if (!dbTime) {
    return null;
  }
  return dayjs.utc(dbTime).local();
};

/**
 * Human relative time (e.g. "3 days ago"). DB timestamps are treated as UTC and
 * converted to the viewer's local time, matching the support-genix convention.
 */
export const timeDiff = (dbTime: DateInput, utc = true): string => {
  if (!dbTime) {
    return '-';
  }
  return utc ? dayjs.utc(dbTime).local().fromNow() : dayjs(dbTime).fromNow();
};

/**
 * Absolute formatted timestamp (e.g. "January 5, 2026 at 3:30 pm"). Used for the
 * tooltip behind the relative time.
 */
export const timeFormat = (
  dbTime: DateInput,
  type: 'date' | 'time' | 'both' = 'both',
  utc = true
): string => {
  if (!dbTime) {
    return '-';
  }
  const dayObj = utc ? dayjs.utc(dbTime).local() : dayjs(dbTime);
  const date = dayObj.format('MMMM D, YYYY');
  const time = dayObj.format('h:mm a');

  switch (type) {
    case 'date':
      return date;
    case 'time':
      return time;
    default:
      // translators: 1: formatted date, 2: formatted time.
      return sprintf(__('%1$s at %2$s', 'kelune-crm'), date, time);
  }
};
