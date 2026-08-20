import React from 'react';
import { InputNumber, ColorPicker, Select } from 'antd';

// Shared form controls for the email builder's property panels (block Section,
// template Settings, footer settings) so the four-up box editor and the
// resettable colour picker stay identical everywhere.

// Font weight presets (100–900), shared by the Text block and the footer.
const FONT_WEIGHT_OPTIONS = [
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
];

interface FontWeightSelectProps {
  value?: string;
  onChange: (value: string) => void;
}

export const FontWeightSelect = ({
  value,
  onChange,
}: FontWeightSelectProps) => (
  <Select
    value={value || '400'}
    onChange={onChange}
    options={FONT_WEIGHT_OPTIONS.map((w) => ({ value: w, label: w }))}
  />
);

// Four-up box editor (top / right / bottom / left) for CSS shorthand padding &
// margin. Edits a single shorthand string so the model/generator stay unchanged.
const BOX_SIDES = ['T', 'R', 'B', 'L'];

const parseBox = (value?: string): number[] => {
  const parts = (value || '')
    .trim()
    .split(/\s+/)
    .map((p) => parseInt(p, 10))
    .filter((n) => !Number.isNaN(n));
  if (parts.length === 0) {
    return [0, 0, 0, 0];
  }
  if (parts.length === 1) {
    return [parts[0], parts[0], parts[0], parts[0]];
  }
  if (parts.length === 2) {
    return [parts[0], parts[1], parts[0], parts[1]];
  }
  if (parts.length === 3) {
    return [parts[0], parts[1], parts[2], parts[1]];
  }
  return [parts[0], parts[1], parts[2], parts[3]];
};

const formatBox = (nums: number[]): string =>
  nums.map((n) => `${n || 0}px`).join(' ');

interface BoxInputProps {
  value?: string;
  onChange: (value: string) => void;
}

export const BoxInput = ({ value, onChange }: BoxInputProps) => {
  const nums = parseBox(value);
  const setSide = (index: number, next: number | null) => {
    const updated = [...nums];
    updated[index] = next ?? 0;
    onChange(formatBox(updated));
  };
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        width: '100%',
      }}
    >
      {nums.map((n, i) => (
        <InputNumber
          key={BOX_SIDES[i]}
          value={n}
          min={0}
          controls={false}
          onChange={(next) => setSide(i, next as number | null)}
          prefix={
            <span style={{ color: '#bbb', fontSize: 11 }}>{BOX_SIDES[i]}</span>
          }
          addonAfter="px"
          style={{ width: '100%' }}
        />
      ))}
    </div>
  );
};

interface PxInputProps {
  // Stored as a CSS length string ("16px") so the model/renderers stay unchanged;
  // this control just exposes it as a number with a px addon. Empty string clears
  // it back to the renderer default.
  value?: string;
  onChange: (value: string) => void;
  // Number shown when the value is empty (display only — not written until edited).
  fallback?: number;
  min?: number;
  max?: number;
  step?: number;
}

// Number input with a fixed "px" addon for single-value length fields (font size,
// line height, radius, border width). Reads "16px" → 16, writes 16 → "16px". The
// addon is a fixed suffix today; a future multi-unit selector can replace it here
// without changing how values are stored.
export const PxInput = ({
  value,
  onChange,
  fallback,
  min = 0,
  max,
  step = 1,
}: PxInputProps) => {
  const parsed = value == null || value === '' ? NaN : parseFloat(value);
  const shown = Number.isNaN(parsed) ? (fallback ?? null) : parsed;
  return (
    <InputNumber
      value={shown}
      min={min}
      max={max}
      step={step}
      controls={false}
      addonAfter="px"
      style={{ width: '100%' }}
      onChange={(next) => onChange(next == null ? '' : `${next}px`)}
    />
  );
};

interface ResettableColorProps {
  value?: string;
  defaultValue: string;
  onChange: (value: string) => void;
}

// ColorPicker that can be cleared back to a known default.
export const ResettableColor = ({
  value,
  defaultValue,
  onChange,
}: ResettableColorProps) => (
  <ColorPicker
    value={value || defaultValue}
    onChange={(color) => onChange(color.toHexString())}
    onClear={() => onChange(defaultValue)}
    allowClear
    showText
  />
);
