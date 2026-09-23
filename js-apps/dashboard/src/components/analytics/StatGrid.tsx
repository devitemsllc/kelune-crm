import React, { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Card, Col, Row, Statistic } from 'antd';

export interface StatItem {
  /** Falls back to `title`; required when the title is not a plain string. */
  key?: string;
  title: ReactNode;
  value: number | string;
  suffix?: string;
  precision?: number;
  color?: string;
  /** Extra card styling, e.g. a tinted background and border. */
  style?: CSSProperties;
  /** When set, the tile is clickable (pointer cursor) and fires this on click. */
  onClick?: () => void;
}

interface StatGridProps {
  items: StatItem[];
  loading?: boolean;
  /** Tiles per row when there is room. Defaults to the tile count. */
  columns?: number;
}

const GUTTER = 16;

// Narrowest tile that keeps the longest two-word title on one line.
const MIN_TILE_WIDTH = 170;

// Widest of full / half / quarter whose tiles stay above MIN_TILE_WIDTH, so
// rows split evenly (8 → 4 → 2 → 1) instead of leaving a lone tile.
const perRowFor = (columns: number, width: number): number =>
  [columns, Math.ceil(columns / 2), Math.ceil(columns / 4)].find(
    (n) => (width - GUTTER * (n - 1)) / n >= MIN_TILE_WIDTH
  ) ?? 1;

/**
 * Equal-width KPI tiles that fill every row. Sized from the grid's own width
 * rather than the viewport, so the admin sidebar, a modal or a drawer never
 * squeezes a title onto two lines. Tiles grow, so a short last row still spans
 * the full width instead of leaving a hole.
 */
const StatGrid: React.FC<StatGridProps> = ({ items, loading, columns }) => {
  const count = Math.max(1, columns ?? items.length);
  const ref = useRef<HTMLDivElement>(null);
  const [perRow, setPerRow] = useState(count);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return undefined;
    }
    const measure = () => setPerRow(perRowFor(count, el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [count]);

  return (
    <div ref={ref}>
      <Row gutter={[GUTTER, GUTTER]}>
        {items.map((item) => (
          <Col
            key={item.key ?? String(item.title)}
            flex={`1 1 ${100 / perRow}%`}
          >
            <Card
              size="small"
              loading={loading}
              onClick={item.onClick}
              style={{
                height: '100%',
                cursor: item.onClick ? 'pointer' : undefined,
                ...item.style,
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
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default StatGrid;
