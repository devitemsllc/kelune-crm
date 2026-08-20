import dayjs from 'dayjs';
import type { RangePickerProps } from 'antd/es/date-picker';
import { __ } from '@wordpress/i18n';

// Shared quick-range presets for every RangePicker in the dashboard (list
// filters, Dashboard, Analytics). Each `value` is a function so the range is
// computed fresh on click — "Today" stays correct across a long-lived session.
// Ranges are inclusive of both endpoints (start-of-day → end-of-day).
export const dateRangePresets: RangePickerProps['presets'] = [
  {
    label: __('Last 30 Days', 'kelune-crm'),
    value: () => [dayjs().add(-29, 'day').startOf('day'), dayjs().endOf('day')],
  },
  {
    label: __('Last 14 Days', 'kelune-crm'),
    value: () => [dayjs().add(-13, 'day').startOf('day'), dayjs().endOf('day')],
  },
  {
    label: __('Last 7 Days', 'kelune-crm'),
    value: () => [dayjs().add(-6, 'day').startOf('day'), dayjs().endOf('day')],
  },
  {
    label: __('Today', 'kelune-crm'),
    value: () => [dayjs().startOf('day'), dayjs().endOf('day')],
  },
];
