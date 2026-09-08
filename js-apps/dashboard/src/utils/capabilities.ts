/**
 * CRM capabilities, mirrored from includes/Support/Capabilities.php.
 *
 * The dashboard hides what the current user cannot do; the REST layer refuses
 * it. Both read the same slugs, delivered in `window.kelunecrm.user.capabilities`.
 */
export const CAP = {
  ACCESS: 'kelune_crm_access',

  VIEW_CONTACTS: 'kelune_crm_view_contacts',
  CREATE_CONTACTS: 'kelune_crm_create_contacts',
  EDIT_CONTACTS: 'kelune_crm_edit_contacts',
  DELETE_CONTACTS: 'kelune_crm_delete_contacts',
  IMPORT_CONTACTS: 'kelune_crm_import_contacts',
  EXPORT_CONTACTS: 'kelune_crm_export_contacts',

  VIEW_LISTS: 'kelune_crm_view_lists',
  CREATE_LISTS: 'kelune_crm_create_lists',
  EDIT_LISTS: 'kelune_crm_edit_lists',
  DELETE_LISTS: 'kelune_crm_delete_lists',

  VIEW_TAGS: 'kelune_crm_view_tags',
  CREATE_TAGS: 'kelune_crm_create_tags',
  EDIT_TAGS: 'kelune_crm_edit_tags',
  DELETE_TAGS: 'kelune_crm_delete_tags',

  VIEW_SEGMENTS: 'kelune_crm_view_segments',
  CREATE_SEGMENTS: 'kelune_crm_create_segments',
  EDIT_SEGMENTS: 'kelune_crm_edit_segments',
  DELETE_SEGMENTS: 'kelune_crm_delete_segments',

  VIEW_CAMPAIGNS: 'kelune_crm_view_campaigns',
  CREATE_CAMPAIGNS: 'kelune_crm_create_campaigns',
  EDIT_CAMPAIGNS: 'kelune_crm_edit_campaigns',
  DELETE_CAMPAIGNS: 'kelune_crm_delete_campaigns',
  SEND_CAMPAIGNS: 'kelune_crm_send_campaigns',

  VIEW_AUTOMATIONS: 'kelune_crm_view_automations',
  CREATE_AUTOMATIONS: 'kelune_crm_create_automations',
  EDIT_AUTOMATIONS: 'kelune_crm_edit_automations',
  DELETE_AUTOMATIONS: 'kelune_crm_delete_automations',

  VIEW_EMAIL_TEMPLATES: 'kelune_crm_view_email_templates',
  CREATE_EMAIL_TEMPLATES: 'kelune_crm_create_email_templates',
  EDIT_EMAIL_TEMPLATES: 'kelune_crm_edit_email_templates',
  DELETE_EMAIL_TEMPLATES: 'kelune_crm_delete_email_templates',

  VIEW_EMAIL_LOGS: 'kelune_crm_view_email_logs',
  EXPORT_EMAIL_LOGS: 'kelune_crm_export_email_logs',
  DELETE_EMAIL_LOGS: 'kelune_crm_delete_email_logs',

  VIEW_SMART_LINKS: 'kelune_crm_view_smart_links',
  CREATE_SMART_LINKS: 'kelune_crm_create_smart_links',
  EDIT_SMART_LINKS: 'kelune_crm_edit_smart_links',
  DELETE_SMART_LINKS: 'kelune_crm_delete_smart_links',

  VIEW_ANALYTICS: 'kelune_crm_view_analytics',

  MANAGE_SETTINGS: 'kelune_crm_manage_settings',
  MANAGE_CUSTOM_FIELDS: 'kelune_crm_manage_custom_fields',
  MANAGE_EMAIL_PROVIDERS: 'kelune_crm_manage_email_providers',
  MANAGE_WEBHOOKS: 'kelune_crm_manage_webhooks',
  MANAGE_ROLES: 'kelune_crm_manage_roles',
} as const;

export type Capability = (typeof CAP)[keyof typeof CAP];

const capabilityMap = (): Record<string, boolean> =>
  window.kelunecrm?.user?.capabilities || {};

export const isSiteAdmin = (): boolean =>
  capabilityMap().manage_options === true;

/**
 * Site administrators pass every check, which also covers the load right after
 * an update, before the sync has handed them a newly declared capability.
 */
export const can = (capability: Capability | string): boolean =>
  capabilityMap()[capability] === true || isSiteAdmin();

export const canAny = (capabilities: Array<Capability | string>): boolean =>
  capabilities.some((capability) => can(capability));

export const canAll = (capabilities: Array<Capability | string>): boolean =>
  capabilities.every((capability) => can(capability));
