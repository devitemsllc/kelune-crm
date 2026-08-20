import React from 'react';
import { Checkbox } from 'antd';

// Renders column-visibility toggles as a bordered grid. `options` = [{ key, label }];
// `visible` = { key: bool }. Cell borders + container top/left border form clean
// 1px gridlines with no doubling.
const BORDER = '1px solid #F3F4F6';

interface ColumnOption {
  key: string;
  label: React.ReactNode;
}

interface ColumnSettingsProps {
  options: ColumnOption[];
  visible: Record<string, boolean>;
  onChange: (visible: Record<string, boolean>) => void;
  cols?: number;
  /** Render a plain single-column checkbox list (no gridlines). */
  simple?: boolean;
}

const ColumnSettings = ({
  options,
  visible,
  onChange,
  cols = 2,
  simple = false,
}: ColumnSettingsProps) => {
  if (simple) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {options.map((opt) => (
          <Checkbox
            key={opt.key}
            checked={visible[opt.key]}
            onChange={(e) =>
              onChange({ ...visible, [opt.key]: e.target.checked })
            }
          >
            {opt.label}
          </Checkbox>
        ))}
      </div>
    );
  }

  const rowCount = Math.ceil(options.length / cols);
  const cellCount = rowCount * cols;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        borderTop: BORDER,
        borderLeft: BORDER,
        marginBottom: 24,
      }}
    >
      {Array.from({ length: cellCount }, (_, i) => {
        const opt = options[i];
        return (
          <div
            key={i}
            style={{
              padding: 8,
              borderRight: BORDER,
              borderBottom: BORDER,
            }}
          >
            {opt && (
              <Checkbox
                checked={visible[opt.key]}
                onChange={(e) =>
                  onChange({ ...visible, [opt.key]: e.target.checked })
                }
              >
                {opt.label}
              </Checkbox>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ColumnSettings;
