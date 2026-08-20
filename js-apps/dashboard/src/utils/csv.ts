/**
 * Minimal RFC-4180-ish CSV parser (no external dependency). Handles quoted
 * fields, escaped quotes (""), and commas / newlines inside quotes. Returns a
 * matrix of rows × cells; blank trailing lines are dropped.
 */
export const parseCsv = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Normalise line endings and strip a leading UTF-8 BOM.
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\n') {
      pushRow();
    } else {
      field += char;
    }
  }

  // Flush the final field/row unless the input ended on a clean newline.
  if (field !== '' || row.length > 0) {
    pushRow();
  }

  // Drop fully-empty rows (e.g. trailing blank line).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
};
