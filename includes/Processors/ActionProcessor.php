<?php

declare(strict_types=1);

namespace KeluneCRM\Processors;

use KeluneCRM\Repositories\ContactRepository;
use KeluneCRM\Services\EmailLogService;
use KeluneCRM\Services\EmailService;
use KeluneCRM\Services\MergeTagService;

/**
 * Executes the basic (Free) automation actions: send_email, add_tag, remove_tag,
 * add_list, remove_list. The advanced actions (update_field, outgoing webhook)
 * live in the Pro add-on's AdvancedActionProcessor, registered onto the
 * `kelune_crm_automation_processors` filter.
 */
class ActionProcessor
{
    private \KeluneCRM\Repositories\ContactRepository $contactRepo;
    private \KeluneCRM\Services\EmailLogService $emailLogService;
    private \KeluneCRM\Services\EmailService $emailService;
    private \KeluneCRM\Services\MergeTagService $mergeTagService;

    public function __construct()
    {
        $this->contactRepo = new ContactRepository();
        $this->emailLogService = new EmailLogService();
        $this->emailService = new EmailService();
        $this->mergeTagService = new MergeTagService();
    }

    /**
     * Execute an action
     *
     * @param string $action_type The type of action to execute
     * @param array<string, mixed> $config Action configuration
     * @param \KeluneCRM\Models\Contact $contact The contact object
     * @param array<string, mixed> $context Automation context data
     * @return array<string, mixed> Result with 'success' boolean and 'message' string
     */
    public function execute(string $action_type, array $config, \KeluneCRM\Models\Contact $contact, array $context = []): array
    {
        try {
            switch ($action_type) {
                case 'send_email':
                    return $this->sendEmail($config, $contact, $context);

                case 'add_tag':
                    return $this->addTags($config, $contact);

                case 'remove_tag':
                    return $this->removeTags($config, $contact);

                case 'add_list':
                    return $this->addLists($config, $contact);

                case 'remove_list':
                    return $this->removeLists($config, $contact);

                default:
                    return [
                        'success' => false,
                        /* translators: %s: action type identifier */
                        'message' => sprintf(__('Unknown action type: %s', 'kelune-crm'), $action_type),
                    ];
            }
        } catch (\Exception $e) {
            return [
                'success' => false,
                /* translators: %s: error message */
                'message' => sprintf(__('Action failed: %s', 'kelune-crm'), $e->getMessage()),
            ];
        }
    }

    /**
     * @param array<string, mixed> $config
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    private function sendEmail(array $config, \KeluneCRM\Models\Contact $contact, array $context): array
    {
        // Automation email is marketing email: honour the same consent gate the
        // campaign sender uses. Checked before the log row is written so an
        // unsendable contact leaves no phantom 'queued' entry, and reported as a
        // completed step — the contact is not mailable, which is a final answer,
        // not a transient failure for the executor to retry.
        if (!\KeluneCRM\Models\Contact::isSendableStatus($contact->get('status'))) {
            return [
                'success' => true,
                'message' => sprintf(
                    /* translators: %1$s: contact email, %2$s: contact status */
                    __('Email skipped: contact %1$s is %2$s.', 'kelune-crm'),
                    (string) $contact->get('email'),
                    (string) $contact->get('status')
                ),
            ];
        }

        $to = sanitize_email((string) $contact->get('email'));

        // Not mailable is a final answer, like the status gate above.
        if (!is_email($to)) {
            return [
                'success' => true,
                'message' => sprintf(
                    /* translators: %d: contact ID */
                    __('Email skipped: contact %d has no valid email address.', 'kelune-crm'),
                    (int) $contact->getId()
                ),
            ];
        }

        $subject = (string) ($config['subject'] ?? '');
        $body = (string) ($config['body'] ?? '');

        // `template_id` only records which saved template seeded the body in the
        // builder — the picker copies the template's content into the body at
        // configure time. The body is the single source of truth at send time,
        // so the template is deliberately not re-read here: a step can never sit
        // in an ambiguous "template says one thing, body says another" state.

        if ($subject === '') {
            $subject = __('Automated Email', 'kelune-crm');
        }

        // Replace merge tags. The resolver escapes for HTML, which is right for
        // the body but not for the subject — a mail header is not markup, so a
        // contact called "Tom & Jerry" must not arrive as "Tom &amp; Jerry".
        // Decode the subject back and strip any tags the merge introduced.
        $body = $this->replaceMergeTags($body, $contact, $context);
        $subject = wp_strip_all_tags(
            wp_specialchars_decode(
                $this->replaceMergeTags($subject, $contact, $context),
                ENT_QUOTES
            )
        );

        // Inbox preview text (preheader): hidden block at the top of the body so
        // clients show it after the subject instead of the first visible line.
        // Resolved through the same merge-tag pass as the subject, then stripped
        // of markup — a preheader is display text, not HTML.
        $preview_text = wp_strip_all_tags(
            wp_specialchars_decode(
                $this->replaceMergeTags((string) ($config['preview_text'] ?? ''), $contact, $context),
                ENT_QUOTES
            )
        );
        if ($preview_text !== '') {
            $body = $this->emailService->injectPreheader($body, $preview_text);
        }

        $automation_id = $context['automation_id'] ?? null;

        // From overrides from the step config (optional). A provider may be
        // chosen per-step via email_provider_id to send through that driver;
        // otherwise the step goes out via wp_mail with the Global Email / custom
        // From identity (no silent fallback to the default provider).
        $from_name = (string) ($config['from_name'] ?? '');
        $from_email = (string) ($config['from_email'] ?? '');
        $provider_id = !empty($config['email_provider_id']) ? (int) $config['email_provider_id'] : null;

        // Log line uses the effective sender, falling back to the site defaults
        // purely for display when no override and no provider sender exist.
        $log_from_name = $from_name !== '' ? $from_name : get_bloginfo('name');
        $log_from_email = $from_email !== '' ? $from_email : get_option('admin_email');

        $log_id = $this->emailLogService->logEmailQueued([
            'email_type' => 'automation',
            'automation_id' => $automation_id,
            'contact_id' => $contact->get('id'),
            'email_to' => $to,
            'email_from' => $log_from_name . ' <' . $log_from_email . '>',
            'subject' => $subject,
            'body_html' => $body,
            'metadata' => json_encode([
                'automation_id' => $automation_id,
                'step_id' => $context['step_id'] ?? null,
                'action_config' => $config,
            ]),
        ]);

        global $wpdb;
        $table = $wpdb->prefix . 'kelune_crm_email_logs';

        // Add tracking to HTML if log was created
        $unsubscribe_url = '';
        if ($log_id) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API, fresh read required.
            $log = $wpdb->get_row($wpdb->prepare('SELECT * FROM %i WHERE id = %d', $table, $log_id), ARRAY_A);

            if ($log && !empty($log['tracking_token'])) {
                $body = $this->emailLogService->addTrackingToHtml($body, $log['tracking_token']);

                $unsubscribe_url = $this->emailService->unsubscribeUrlFor((string) $log['tracking_token']);
            }
        }

        // Automation email is marketing email, so it carries the same footer
        // every campaign gets: business identity plus the unsubscribe link
        // anti-spam law requires. Spliced after the click-tracking pass so the
        // unsubscribe link goes out direct rather than through a redirect.
        $body = $this->emailService->appendGlobalFooterFor($body, $contact->toArray(), $unsubscribe_url);

        // Persist what actually goes out, footer and tracking included.
        if ($log_id) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API.
            $wpdb->update(
                $table,
                [
                    'body_html' => $body,
                    'updated_at' => current_time('mysql', true),
                ],
                ['id' => $log_id]
            );
        }

        // Send through the provider system (campaign + automation share one
        // path), so automation email honors the configured/default provider.
        $sent = $this->emailService->sendTransactional($to, $subject, $body, [
            'provider_id' => $provider_id,
            'from_name' => $from_name,
            'from_email' => $from_email,
            'reply_to' => (string) ($config['reply_to'] ?? ''),
        ]);

        if (!is_wp_error($sent) && $sent) {
            if ($log_id) {
                // Only an explicitly chosen provider sends through its driver;
                // with none set the send goes via wp_mail, so log it as such
                // rather than attributing it to the (unused) default provider.
                $provider = $provider_id
                    ? (new \KeluneCRM\Repositories\EmailProviderRepository())->find($provider_id)
                    : null;
                $this->emailLogService->logEmailSent($log_id, $provider ? $provider->provider_type : 'wp_mail');
            }

            $this->logContactEvent($contact->get('id'), 'email_sent', [
                'subject' => $subject,
                'automation' => true,
                'email_log_id' => $log_id,
            ]);

            return [
                'success' => true,
                /* translators: %s: recipient email address */
                'message' => sprintf(__('Email sent to %s', 'kelune-crm'), $to),
            ];
        } else {
            // Surface the provider's real failure reason instead of a generic one.
            $error_message = is_wp_error($sent)
                ? $sent->get_error_message()
                : __('Failed to send email', 'kelune-crm');

            if ($log_id) {
                $this->emailLogService->logEmailFailed($log_id, $error_message);
            }

            return [
                'success' => false,
                /* translators: %1$s: recipient email address, %2$s: error message */
                'message' => sprintf(__('Failed to send email to %1$s: %2$s', 'kelune-crm'), $to, $error_message),
            ];
        }
    }

    /**
     * @param array<string, mixed> $config
     * @return array<string, mixed>
     */
    private function addTags(array $config, \KeluneCRM\Models\Contact $contact): array
    {
        $tag_ids = $config['tag_ids'] ?? [];

        if (empty($tag_ids)) {
            return [
                'success' => false,
                'message' => __('No tags specified', 'kelune-crm'),
            ];
        }

        if (!is_array($tag_ids)) {
            $tag_ids = [$tag_ids];
        }

        $result = $this->contactRepo->addTags($contact->get('id'), $tag_ids);

        if ($result) {
            $this->logContactEvent($contact->get('id'), 'tags_added', [
                'tag_ids' => $tag_ids,
                'automation' => true,
            ]);

            return [
                'success' => true,
                /* translators: %d: number of tags */
                'message' => sprintf(__('Added %d tag(s)', 'kelune-crm'), count($tag_ids)),
            ];
        } else {
            return [
                'success' => false,
                'message' => __('Failed to add tags', 'kelune-crm'),
            ];
        }
    }

    /**
     * @param array<string, mixed> $config
     * @return array<string, mixed>
     */
    private function removeTags(array $config, \KeluneCRM\Models\Contact $contact): array
    {
        $tag_ids = $config['tag_ids'] ?? [];

        if (empty($tag_ids)) {
            return [
                'success' => false,
                'message' => __('No tags specified', 'kelune-crm'),
            ];
        }

        if (!is_array($tag_ids)) {
            $tag_ids = [$tag_ids];
        }

        $result = $this->contactRepo->removeTags($contact->get('id'), $tag_ids);

        if ($result) {
            $this->logContactEvent($contact->get('id'), 'tags_removed', [
                'tag_ids' => $tag_ids,
                'automation' => true,
            ]);

            return [
                'success' => true,
                /* translators: %d: number of tags */
                'message' => sprintf(__('Removed %d tag(s)', 'kelune-crm'), count($tag_ids)),
            ];
        } else {
            return [
                'success' => false,
                'message' => __('Failed to remove tags', 'kelune-crm'),
            ];
        }
    }

    /**
     * @param array<string, mixed> $config
     * @return array<string, mixed>
     */
    private function addLists(array $config, \KeluneCRM\Models\Contact $contact): array
    {
        $list_ids = $config['list_ids'] ?? [];

        if (empty($list_ids)) {
            return [
                'success' => false,
                'message' => __('No lists specified', 'kelune-crm'),
            ];
        }

        if (!is_array($list_ids)) {
            $list_ids = [$list_ids];
        }

        $result = $this->contactRepo->addLists($contact->get('id'), $list_ids);

        if ($result) {
            $this->logContactEvent($contact->get('id'), 'lists_added', [
                'list_ids' => $list_ids,
                'automation' => true,
            ]);

            return [
                'success' => true,
                /* translators: %d: number of lists */
                'message' => sprintf(__('Added to %d list(s)', 'kelune-crm'), count($list_ids)),
            ];
        } else {
            return [
                'success' => false,
                'message' => __('Failed to add to lists', 'kelune-crm'),
            ];
        }
    }

    /**
     * @param array<string, mixed> $config
     * @return array<string, mixed>
     */
    private function removeLists(array $config, \KeluneCRM\Models\Contact $contact): array
    {
        $list_ids = $config['list_ids'] ?? [];

        if (empty($list_ids)) {
            return [
                'success' => false,
                'message' => __('No lists specified', 'kelune-crm'),
            ];
        }

        if (!is_array($list_ids)) {
            $list_ids = [$list_ids];
        }

        $result = $this->contactRepo->removeLists($contact->get('id'), $list_ids);

        if ($result) {
            $this->logContactEvent($contact->get('id'), 'lists_removed', [
                'list_ids' => $list_ids,
                'automation' => true,
            ]);

            return [
                'success' => true,
                /* translators: %d: number of lists */
                'message' => sprintf(__('Removed from %d list(s)', 'kelune-crm'), count($list_ids)),
            ];
        } else {
            return [
                'success' => false,
                'message' => __('Failed to remove from lists', 'kelune-crm'),
            ];
        }
    }

    /**
     * Resolve merge tags in an automation email, for HTML output.
     *
     * Delegates to MergeTagService, the same resolver the campaign sender uses,
     * so a tag resolves identically whichever surface authored the content.
     * Contact values come back HTML-escaped — a name containing markup must
     * render as text, not live HTML.
     *
     * @param array<string, mixed> $context
     */
    private function replaceMergeTags(string $text, \KeluneCRM\Models\Contact $contact, array $context): string
    {
        if ($text === '') {
            return $text;
        }

        // Tags outside MergeTagService's shared set: the extra contact fields
        // this processor has always resolved, plus any scalar values carried in
        // the trigger context.
        $extra = [
            '{{phone}}' => esc_html((string) $contact->get('phone', '')),
            '{{company}}' => esc_html((string) $contact->get('company', '')),
            '{{website}}' => esc_html((string) $contact->get('website', '')),
        ];

        foreach ($context as $key => $value) {
            if (is_scalar($value)) {
                $extra['{{' . $key . '}}'] = esc_html((string) $value);
            }
        }

        return $this->mergeTagService->render($text, $contact->toArray(), $extra);
    }

    /**
     * @param array<string, mixed> $event_data
     */
    private function logContactEvent(int $contact_id, string $event_type, array $event_data = []): void
    {
        global $wpdb;
        $table = $wpdb->prefix . 'kelune_crm_events';

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API.
        $wpdb->insert($table, [
            'contact_id' => $contact_id,
            'event_type' => $event_type,
            'event_data' => wp_json_encode($event_data),
            'created_at' => current_time('mysql', true),
        ]);
    }
}
