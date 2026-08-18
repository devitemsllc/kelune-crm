import { __ } from '@wordpress/i18n';
import type { EmailPoint } from '../../types/analytics';

/**
 * Shared chart palette. Kept here so every analytics chart reads as one system.
 */
export const CHART_COLORS = {
  primary: '#335CFF',
  violet: '#7D52F4',
  amber: '#F6B51E',
  teal: '#22CCEE',
  green: '#1FC16B',
  red: '#FB3748',
  // Sent / Opened / Clicked, in that order.
  engagement: ['#335CFF', '#1FC16B', '#F6B51E'],
} as const;

/**
 * Bar style shared by every categorical column chart: a light tinted fill, no
 * border — mirroring the Contact Growth area (fillOpacity 0.15).
 */
export const barStyle = (color: string) =>
  ({
    fill: color,
    fillOpacity: 0.45,
    radiusTopLeft: 4,
    radiusTopRight: 4,
  }) as const;

export interface EmailLongPoint {
  date: string;
  type: string;
  value: number;
}

/**
 * Pivot the wide sent/opened/clicked series into the long form a multi-series
 * line chart expects (one row per metric per day).
 */
export const toEmailLong = (points: EmailPoint[]): EmailLongPoint[] =>
  points.flatMap((p) => [
    { date: p.date, type: __('Sent', 'kelune-crm'), value: p.sent },
    { date: p.date, type: __('Opened', 'kelune-crm'), value: p.opened },
    {
      date: p.date,
      type: __('Clicked', 'kelune-crm'),
      value: p.clicked,
    },
  ]);
