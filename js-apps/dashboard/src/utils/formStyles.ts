import type { CSSProperties } from 'react';

// Divider margins inside a <Form>. Field-to-field rhythm is 24px (Form.Item's
// own bottom margin), so a section break earns its extra space above while a
// plain rule between field groups stays in the rhythm. Vertical margins collapse
// with the preceding Form.Item, so the top value IS the rendered gap.

// Unlabelled rule separating field groups without opening a named section.
export const formFieldDivider: CSSProperties = { margin: '24px 0' };

// Labelled divider opening a section mid-form.
export const formSectionDivider: CSSProperties = { margin: '40px 0 24px' };

// Same, when it is the first thing in a form or wizard step — nothing above it
// to separate from.
export const formSectionDividerFirst: CSSProperties = { margin: '0 0 24px' };
