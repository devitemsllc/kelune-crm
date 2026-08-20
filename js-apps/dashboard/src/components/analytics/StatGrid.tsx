import React from 'react';
import { Card, Statistic } from 'antd';

export interface StatItem {
  title: string;
  value: number | string;
  suffix?: string;
  precision?: number;
  color?: string;
  /** When set, the tile is clickable (pointer cursor) and fires this on click. */
  onClick?: () => void;
}

interface StatGridProps {
  items: StatItem[];
  loading?: boolean;
}

/**
 * Equal-width KPI tiles that fill the full row width — flexbox rather than the
 * 24-column grid, so counts the grid can't divide evenly (e.g. 5) still land at
 * a clean 1/N each with no trailing gap. Tiles wrap on narrow viewports.
 */
const StatGrid: React.FC<StatGridProps> = ({ items, loading }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
    {items.map((item) => (
      <Card
        key={item.title}
        size="small"
        loading={loading}
        onClick={item.onClick}
        style={{
          flex: '1 1 160px',
          minWidth: 160,
          cursor: item.onClick ? 'pointer' : undefined,
        }}
      >
        <Statistic
          title={item.title}
          value={item.value}
          precision={item.precision}
          suffix={item.suffix}
          valueStyle={item.color ? { color: item.color } : undefined}
        />
      </Card>
    ))}
  </div>
);

export default StatGrid;
