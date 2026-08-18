import React from 'react';

interface BrandMarkProps {
  size?: number;
  /** Any CSS colour. Applies to the `plain` variant only. */
  color?: string;
  /**
   * `plain` draws the bare mark in one colour, for surfaces that set their own.
   * `tile` sets the mark on a rounded tile, matching the lockup on the
   * WordPress.org banner.
   */
  variant?: 'plain' | 'tile';
  /** Tile fill. Pass the theme's primary so the badge tracks it. */
  tileColor?: string;
}

const RING_RADIUS = 33;
const DOT_RADIUS = 10.6;
const CORE_RADIUS = 14.6;
const CENTER = 50;

const CORE_ON_TILE = '#7BE0C3';
const TILE_RADIUS = 22.5;
// The mark occupies this much of the tile, leaving the surrounding margin.
const MARK_SCALE = 0.62;

// Six contacts ringed around one send. Mirrors Support\BrandMark on the PHP
// side, which draws the same figure for the admin menu and admin bar — a change
// to the geometry belongs in both.
const RING = Array.from({ length: 6 }, (_, i) => {
  const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
  return {
    cx: Number((CENTER + Math.cos(angle) * RING_RADIUS).toFixed(2)),
    cy: Number((CENTER + Math.sin(angle) * RING_RADIUS).toFixed(2)),
  };
});

const BrandMark = ({
  size = 24,
  color = 'currentColor',
  variant = 'plain',
  tileColor = 'currentColor',
}: BrandMarkProps) => {
  const onTile = variant === 'tile';
  const dots = onTile ? '#FFFFFF' : color;
  const core = onTile ? CORE_ON_TILE : color;

  const mark = (
    <>
      {RING.map((dot) => (
        <circle
          key={`${dot.cx}-${dot.cy}`}
          cx={dot.cx}
          cy={dot.cy}
          r={DOT_RADIUS}
          fill={dots}
        />
      ))}
      <circle cx={CENTER} cy={CENTER} r={CORE_RADIUS} fill={core} />
    </>
  );

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {onTile && (
        <rect width="100" height="100" rx={TILE_RADIUS} fill={tileColor} />
      )}
      {onTile ? (
        <g
          transform={`translate(${CENTER} ${CENTER}) scale(${MARK_SCALE}) translate(${-CENTER} ${-CENTER})`}
        >
          {mark}
        </g>
      ) : (
        mark
      )}
    </svg>
  );
};

export default BrandMark;
