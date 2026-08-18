// Merge-tag placeholder sets surfaced by the RichTextEditor "Placeholders"
// button (insert-at-cursor). Each list mirrors EXACTLY what the matching PHP
// send path resolves, so no tag ever ships to a recipient as literal text:
//
// - CONTACT_MERGE_TAGS → MergeTagService::contactTags + businessTags (the shared
//   set resolved by both the campaign sender and the automation ActionProcessor).
// - FOOTER_MERGE_TAGS  → the footer append path (adds the per-recipient
//   {{unsubscribe_url}}, resolved in EmailService::appendGlobalFooterFor).
// - OPTIN_MERGE_TAGS   → the double opt-in email (adds {{confirmation_url}},
//   resolved in DoubleOptinService).

// Contact identity + business tags — resolvable on every send path (campaign and
// automation email bodies, and the visual builder's Text blocks).
export const CONTACT_MERGE_TAGS: readonly string[] = [
  '{{first_name}}',
  '{{last_name}}',
  '{{email}}',
  '{{full_name}}',
  '{{business_name}}',
  '{{business_address}}',
];

// Global / per-template footer — the contact/business tags plus the
// per-recipient unsubscribe link.
export const FOOTER_MERGE_TAGS: readonly string[] = [
  '{{business_name}}',
  '{{business_address}}',
  '{{unsubscribe_url}}',
  '{{first_name}}',
];

// Double opt-in confirmation email — the confirm link plus contact/business tags.
export const OPTIN_MERGE_TAGS: readonly string[] = [
  '{{confirmation_url}}',
  '{{first_name}}',
  '{{last_name}}',
  '{{email}}',
  '{{business_name}}',
];
