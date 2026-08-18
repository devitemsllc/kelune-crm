/**
 * Which editor a template opens in — the single rule shared by the template
 * gallery (the "Editor" column) and the content editor (its import-time
 * editor-switch confirmation), so the label shown and the behaviour on import
 * never disagree.
 */
import { __ } from '@wordpress/i18n';
import type { EmailTemplate } from '@/types/models';

export type TemplateEditorMode = 'builder' | 'richtext';

// Accept a stored structure as an object or a JSON string; return a plain object
// (or null). Tolerates the current shape and legacy `{ blocks, settings }`.
const parse = (raw: unknown): Record<string, unknown> | null => {
  let value: unknown = raw;
  if (typeof value === 'string' && value !== '') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
};

/**
 * Resolve the editor a template uses from its stored structure. `builder` only
 * when the structure says so (or, for legacy records with no `mode`, when a
 * block tree is present); everything else — including legacy html/text — opens
 * in Rich Text, mirroring the content editor's own normalisation.
 */
export const resolveTemplateEditor = (
  template: Pick<EmailTemplate, 'json_structure'>
): TemplateEditorMode => {
  const parsed = parse(template.json_structure);
  const mode = parsed?.mode;
  if (mode === 'builder') {
    return 'builder';
  }
  if (mode === 'richtext') {
    return 'richtext';
  }
  // No stored mode (pre-mode record): a block tree means it was a visual design.
  return Array.isArray(parsed?.blocks) && parsed.blocks.length > 0
    ? 'builder'
    : 'richtext';
};

/** Human label for an editor mode, used by the gallery's Editor column. */
export const editorModeLabel = (mode: TemplateEditorMode): string =>
  mode === 'builder'
    ? __('Visual', 'kelune-crm')
    : __('Rich Text', 'kelune-crm');
