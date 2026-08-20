<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

/**
 * Built-in ("Use a Template") automation workflows.
 *
 * Authored in code, never seeded or stored (as with {@see EmailTemplateService});
 * importing one clones its steps into a real automation.
 *
 * Every workflow must run on a brand-new install with ZERO existing
 * tags/lists/segments: triggers limited to `contact_created` and `manual`, email
 * steps self-contained, tag/list steps shipped with nothing preselected (the user
 * picks or creates inline on the draft), and no `condition` steps, since
 * branching is a Pro-only processor.
 *
 * Email bodies are block trees rendered through {@see EmailHtmlRenderer}, so the
 * preview and the imported, editable step never drift. The set passes through the
 * `kelune_crm_automation_templates` filter so Pro can append workflows.
 */
class AutomationTemplateService
{
    private EmailHtmlRenderer $renderer;

    public function __construct(?EmailHtmlRenderer $renderer = null)
    {
        $this->renderer = $renderer ?? new EmailHtmlRenderer();
    }

    /**
     * All available automation templates (built-in + filtered additions).
     *
     * @return array<int, array<string, mixed>>
     */
    public function getTemplates(): array
    {
        $templates = [
            $this->welcomeSeriesTemplate(),
            $this->leadNurtureTemplate(),
            $this->welcomeDiscountTemplate(),
            $this->winBackTemplate(),
            $this->eventReminderTemplate(),
        ];

        /**
         * Filter the automation template library.
         *
         * The Pro add-on appends premium workflows here. Each entry is
         * ['id','name','description','icon','popular','steps'=>[...]].
         *
         * @param array<int, array<string, mixed>> $templates
         */
        return apply_filters('kelune_crm_automation_templates', $templates);
    }

    /**
     * A single template by its string id, or null when unknown.
     *
     * @return array<string, mixed>|null
     */
    public function getTemplate(string $template_id): ?array
    {
        foreach ($this->getTemplates() as $template) {
            if (($template['id'] ?? null) === $template_id) {
                return $template;
            }
        }

        return null;
    }

    // -- Step builders ---------------------------------------------------------

    /**
     * The trigger (root) step. Its `trigger_type`/`trigger_config` are also copied
     * onto the automation record itself by the importer.
     *
     * @param array<string, mixed> $trigger_config
     * @return array<string, mixed>
     */
    private function triggerStep(string $trigger_type, string $label, array $trigger_config = []): array
    {
        return [
            'step_type' => 'trigger',
            'trigger_type' => $trigger_type,
            'trigger_config' => $trigger_config,
            'label' => $label,
        ];
    }

    /**
     * A send_email action step. The body is rendered from the block tree so the
     * imported step opens in the visual builder identically to the preview.
     *
     * @param array<int, array<string, mixed>> $blocks
     * @param array<string, mixed> $settingsOverride
     * @return array<string, mixed>
     */
    private function emailStep(
        string $label,
        string $subject,
        string $preview_text,
        array $blocks,
        array $settingsOverride = []
    ): array {
        $settings = array_merge($this->baseSettings(), $settingsOverride);
        $structure = [
            'mode' => 'builder',
            'settings' => $settings,
            'blocks' => $blocks,
        ];

        return [
            'step_type' => 'action',
            'action_type' => 'send_email',
            'label' => $label,
            'action_config' => [
                'subject' => $subject,
                'preview_text' => $preview_text,
                'sender_type' => 'global',
                'content_mode' => 'builder',
                'body' => $this->renderer->render($blocks, $settings),
                'json_structure' => wp_json_encode($structure),
            ],
        ];
    }

    /**
     * A delay step.
     *
     * @return array<string, mixed>
     */
    private function delayStep(int $value, string $unit, string $label): array
    {
        return [
            'step_type' => 'delay',
            'delay_type' => $unit,
            'delay_value' => $value,
            'label' => $label,
        ];
    }

    /**
     * An add_tag action step, shipped with NO tag preselected: the label states
     * the intent ("Tag as Lead") and the user picks or creates one inline on the
     * draft. Templates never silently create tags on import.
     *
     * @return array<string, mixed>
     */
    private function addTagStep(string $label): array
    {
        return [
            'step_type' => 'action',
            'action_type' => 'add_tag',
            'label' => $label,
            'action_config' => [],
        ];
    }

    // -- Email block helpers (mirror EmailTemplateService) ----------------------

    /**
     * Design settings shared by every template email. Partial: the dashboard
     * merges these over DEFAULT_TEMPLATE_SETTINGS on import and the renderer
     * fills the rest for the preview.
     *
     * @return array<string, mixed>
     */
    private function baseSettings(): array
    {
        return [
            'contentWidth' => 600,
            'backgroundColor' => '#f4f5f7',
            'contentBackground' => '#ffffff',
            'fontFamily' => 'Arial, Helvetica, sans-serif',
            'pagePadding' => '32px 15px 12px 15px',
            'contentPadding' => '40px 40px 32px 40px',
            'footerEnabled' => true,
            'footerSource' => 'global',
            'footerContent' => '',
            'footerFontSize' => '13px',
            'footerTextColor' => '#8a94a6',
            'footerLinkColor' => '#1677ff',
            'footerBackground' => 'transparent',
            'footerPadding' => '24px 20px 8px 20px',
        ];
    }

    /**
     * @param array<string, mixed> $styles
     * @return array<string, mixed>
     */
    private function textBlock(string $id, string $content, array $styles = []): array
    {
        return [
            'id' => $id,
            'type' => 'text',
            'styles' => array_merge(
                ['content' => $content, 'padding' => '0 0 0 0', 'margin' => '0 0 15px 0'],
                $styles
            ),
        ];
    }

    /**
     * @param array<string, mixed> $styles
     * @return array<string, mixed>
     */
    private function buttonBlock(string $id, string $text, array $styles = []): array
    {
        return [
            'id' => $id,
            'type' => 'button',
            'styles' => array_merge(
                [
                    'text' => $text,
                    'link' => '#',
                    'backgroundColor' => '#1677ff',
                    'textColor' => '#ffffff',
                    'fontSize' => '16px',
                    'fontWeight' => '600',
                    'borderRadius' => '6px',
                    'textAlign' => 'center',
                    'buttonPadding' => '13px 32px',
                    'width' => 'auto',
                    'padding' => '0 0 0 0',
                    'margin' => '0 0 15px 0',
                ],
                $styles
            ),
        ];
    }

    /**
     * @param array<string, mixed> $styles
     * @return array<string, mixed>
     */
    private function dividerBlock(string $id, array $styles = []): array
    {
        return [
            'id' => $id,
            'type' => 'divider',
            'styles' => array_merge(
                [
                    'borderStyle' => 'solid',
                    'borderColor' => '#e5e8eb',
                    'borderWidth' => '1px',
                    'width' => 'auto',
                    'padding' => '0 0 0 0',
                    'margin' => '0 0 20px 0',
                ],
                $styles
            ),
        ];
    }

    /**
     * Each entry in $cells is a list of child blocks for one column.
     *
     * @param array<int, array<int, array<string, mixed>>> $cells
     * @param array<string, mixed> $styles
     * @return array<string, mixed>
     */
    private function columnsBlock(string $id, array $cells, array $styles = []): array
    {
        $columns = [];
        foreach ($cells as $blocks) {
            $columns[] = ['blocks' => $blocks];
        }

        return [
            'id' => $id,
            'type' => 'columns',
            'styles' => array_merge(
                [
                    'columnCount' => count($cells),
                    'columns' => $columns,
                    'cellPadding' => '0 12px 0 0',
                    'padding' => '0 0 0 0',
                    'margin' => '0 0 20px 0',
                ],
                $styles
            ),
        ];
    }

    /**
     * A centred brand header (business name).
     *
     * @return array<string, mixed>
     */
    private function brandHeader(string $id): array
    {
        return $this->textBlock(
            $id,
            '<p><strong>{{business_name}}</strong></p>',
            [
                'fontSize' => '22px',
                'color' => '#1677ff',
                'fontWeight' => '700',
                'textAlign' => 'center',
                'margin' => '0 0 8px 0',
            ]
        );
    }

    // -- Templates -------------------------------------------------------------

    /**
     * @return array<string, mixed>
     */
    private function welcomeSeriesTemplate(): array
    {
        return [
            'id' => 'welcome-series',
            'name' => __('Welcome Onboarding Series', 'kelune-crm'),
            'description' => __('Greet every new contact, then guide them over their first week with three friendly emails.', 'kelune-crm'),
            'icon' => 'smile',
            'popular' => true,
            'steps' => [
                $this->triggerStep('contact_created', __('New contact added', 'kelune-crm')),
                $this->emailStep(
                    __('Welcome email', 'kelune-crm'),
                    __('Welcome to {{business_name}}, {{first_name}}! 🎉', 'kelune-crm'),
                    __('We are so glad you are here — let us show you around.', 'kelune-crm'),
                    [
                        $this->brandHeader('ws-e1-brand'),
                        $this->dividerBlock('ws-e1-div'),
                        $this->textBlock(
                            'ws-e1-title',
                            '<p>' . __('Welcome aboard, {{first_name}}! 🎉', 'kelune-crm') . '</p>',
                            ['fontSize' => '26px', 'color' => '#1a1a1a', 'fontWeight' => '700', 'textAlign' => 'center', 'margin' => '0 0 12px 0']
                        ),
                        $this->textBlock(
                            'ws-e1-body',
                            '<p>' . __('We are thrilled to have you with us. Everything you need is a click away — and if you ever have a question, just reply to this email. A real person reads every message.', 'kelune-crm') . '</p>',
                            ['fontSize' => '16px', 'color' => '#4a4a4a', 'textAlign' => 'center', 'lineHeight' => '26px', 'margin' => '0 0 24px 0']
                        ),
                        $this->buttonBlock('ws-e1-cta', __('Get Started', 'kelune-crm'), ['margin' => '0 0 24px 0']),
                        $this->textBlock(
                            'ws-e1-sign',
                            '<p>' . __('Cheers,<br>The {{business_name}} Team', 'kelune-crm') . '</p>',
                            ['fontSize' => '15px', 'color' => '#6b7280', 'textAlign' => 'center', 'margin' => '0 0 0 0']
                        ),
                    ]
                ),
                $this->delayStep(2, 'days', __('Wait 2 days', 'kelune-crm')),
                $this->emailStep(
                    __('Getting started email', 'kelune-crm'),
                    __('{{first_name}}, here is how to get started', 'kelune-crm'),
                    __('Three quick steps to get the most out of your account.', 'kelune-crm'),
                    [
                        $this->brandHeader('ws-e2-brand'),
                        $this->dividerBlock('ws-e2-div'),
                        $this->textBlock(
                            'ws-e2-title',
                            '<p>' . __('Let us get you set up', 'kelune-crm') . '</p>',
                            ['fontSize' => '24px', 'color' => '#1a1a1a', 'fontWeight' => '700', 'textAlign' => 'center', 'margin' => '0 0 20px 0']
                        ),
                        $this->columnsBlock('ws-e2-cols', [
                            [
                                $this->textBlock('ws-e2-c1', '<p><strong>' . __('1. Complete your profile', 'kelune-crm') . '</strong></p>', ['fontSize' => '15px', 'color' => '#1a1a1a', 'margin' => '0 0 4px 0']),
                                $this->textBlock('ws-e2-c1b', '<p>' . __('Add your details so everything is tailored to you.', 'kelune-crm') . '</p>', ['fontSize' => '14px', 'color' => '#6b7280', 'lineHeight' => '22px', 'margin' => '0 0 0 0']),
                            ],
                            [
                                $this->textBlock('ws-e2-c2', '<p><strong>' . __('2. Explore the basics', 'kelune-crm') . '</strong></p>', ['fontSize' => '15px', 'color' => '#1a1a1a', 'margin' => '0 0 4px 0']),
                                $this->textBlock('ws-e2-c2b', '<p>' . __('A five-minute tour covers the essentials.', 'kelune-crm') . '</p>', ['fontSize' => '14px', 'color' => '#6b7280', 'lineHeight' => '22px', 'margin' => '0 0 0 0']),
                            ],
                        ]),
                        $this->buttonBlock('ws-e2-cta', __('Open Your Dashboard', 'kelune-crm'), ['margin' => '4px 0 0 0']),
                    ]
                ),
                $this->delayStep(3, 'days', __('Wait 3 days', 'kelune-crm')),
                $this->emailStep(
                    __('Tips email', 'kelune-crm'),
                    __('A few tips to get more from {{business_name}}', 'kelune-crm'),
                    __('Small things that make a big difference.', 'kelune-crm'),
                    [
                        $this->brandHeader('ws-e3-brand'),
                        $this->dividerBlock('ws-e3-div'),
                        $this->textBlock(
                            'ws-e3-title',
                            '<p>' . __('Getting the most out of it', 'kelune-crm') . '</p>',
                            ['fontSize' => '24px', 'color' => '#1a1a1a', 'fontWeight' => '700', 'textAlign' => 'center', 'margin' => '0 0 16px 0']
                        ),
                        $this->textBlock(
                            'ws-e3-body',
                            '<p>' . __('You have had a few days to settle in, {{first_name}}. Here is a favourite tip from our team — and remember, we are one reply away whenever you need a hand.', 'kelune-crm') . '</p>',
                            ['fontSize' => '16px', 'color' => '#4a4a4a', 'textAlign' => 'center', 'lineHeight' => '26px', 'margin' => '0 0 24px 0']
                        ),
                        $this->buttonBlock('ws-e3-cta', __('See More Tips', 'kelune-crm'), ['margin' => '0 0 0 0']),
                    ]
                ),
                $this->addTagStep(__('Tag as Onboarded', 'kelune-crm')),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function leadNurtureTemplate(): array
    {
        return [
            'id' => 'lead-nurture',
            'name' => __('Lead Nurture Drip', 'kelune-crm'),
            'description' => __('Tag new contacts as leads and warm them up with a three-part educational sequence.', 'kelune-crm'),
            'icon' => 'bulb',
            'popular' => true,
            'steps' => [
                $this->triggerStep('contact_created', __('New contact added', 'kelune-crm')),
                $this->addTagStep(__('Tag as Lead', 'kelune-crm')),
                $this->delayStep(1, 'days', __('Wait 1 day', 'kelune-crm')),
                $this->emailStep(
                    __('Educational email #1', 'kelune-crm'),
                    __('{{first_name}}, the one thing most people miss', 'kelune-crm'),
                    __('A quick lesson to start you off on the right foot.', 'kelune-crm'),
                    [
                        $this->brandHeader('ln-e1-brand'),
                        $this->dividerBlock('ln-e1-div'),
                        $this->textBlock('ln-e1-title', '<p>' . __('Start here', 'kelune-crm') . '</p>', ['fontSize' => '24px', 'color' => '#1a1a1a', 'fontWeight' => '700', 'margin' => '0 0 14px 0']),
                        $this->textBlock('ln-e1-body', '<p>' . __('Hi {{first_name}}, over the next few days we will share a few ideas that help you get results faster. Today, let us start with the fundamentals.', 'kelune-crm') . '</p>', ['fontSize' => '16px', 'color' => '#4a4a4a', 'lineHeight' => '26px', 'margin' => '0 0 22px 0']),
                        $this->buttonBlock('ln-e1-cta', __('Read the Guide', 'kelune-crm'), ['margin' => '0 0 0 0']),
                    ]
                ),
                $this->delayStep(3, 'days', __('Wait 3 days', 'kelune-crm')),
                $this->emailStep(
                    __('Educational email #2', 'kelune-crm'),
                    __('A simple framework you can use today', 'kelune-crm'),
                    __('Part two of your series — practical and to the point.', 'kelune-crm'),
                    [
                        $this->brandHeader('ln-e2-brand'),
                        $this->dividerBlock('ln-e2-div'),
                        $this->textBlock('ln-e2-title', '<p>' . __('Put it into practice', 'kelune-crm') . '</p>', ['fontSize' => '24px', 'color' => '#1a1a1a', 'fontWeight' => '700', 'margin' => '0 0 14px 0']),
                        $this->textBlock('ln-e2-body', '<p>' . __('Now that the basics are clear, here is a simple framework you can apply straight away. Keep it handy — it comes up again and again.', 'kelune-crm') . '</p>', ['fontSize' => '16px', 'color' => '#4a4a4a', 'lineHeight' => '26px', 'margin' => '0 0 22px 0']),
                        $this->buttonBlock('ln-e2-cta', __('See the Framework', 'kelune-crm'), ['margin' => '0 0 0 0']),
                    ]
                ),
                $this->delayStep(4, 'days', __('Wait 4 days', 'kelune-crm')),
                $this->emailStep(
                    __('Soft-CTA email #3', 'kelune-crm'),
                    __('Ready when you are, {{first_name}}', 'kelune-crm'),
                    __('No pressure — just an open door whenever it suits you.', 'kelune-crm'),
                    [
                        $this->brandHeader('ln-e3-brand'),
                        $this->dividerBlock('ln-e3-div'),
                        $this->textBlock('ln-e3-title', '<p>' . __('Whenever you are ready', 'kelune-crm') . '</p>', ['fontSize' => '24px', 'color' => '#1a1a1a', 'fontWeight' => '700', 'textAlign' => 'center', 'margin' => '0 0 14px 0']),
                        $this->textBlock('ln-e3-body', '<p>' . __('You have seen what we are about. If it feels like a fit, we would love to help you go further. Reply to this email or book a time — no pressure either way.', 'kelune-crm') . '</p>', ['fontSize' => '16px', 'color' => '#4a4a4a', 'textAlign' => 'center', 'lineHeight' => '26px', 'margin' => '0 0 24px 0']),
                        $this->buttonBlock('ln-e3-cta', __('Talk to Us', 'kelune-crm'), ['margin' => '0 0 0 0']),
                    ]
                ),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function welcomeDiscountTemplate(): array
    {
        return [
            'id' => 'welcome-discount',
            'name' => __('New Subscriber Discount', 'kelune-crm'),
            'description' => __('Thank new subscribers with a welcome code, then nudge them before it expires.', 'kelune-crm'),
            'icon' => 'gift',
            'popular' => false,
            'steps' => [
                $this->triggerStep('contact_created', __('New contact added', 'kelune-crm')),
                $this->emailStep(
                    __('Welcome offer email', 'kelune-crm'),
                    __('Welcome! Here is 15% off, {{first_name}} 🎁', 'kelune-crm'),
                    __('A little thank-you for joining us.', 'kelune-crm'),
                    [
                        $this->textBlock('wd-e1-eyebrow', '<p>' . __('A warm welcome', 'kelune-crm') . '</p>', ['fontSize' => '13px', 'color' => '#e11d48', 'fontWeight' => '700', 'textAlign' => 'center', 'margin' => '0 0 8px 0']),
                        $this->textBlock('wd-e1-hero', '<p>' . __('Enjoy 15% Off', 'kelune-crm') . '</p>', ['fontSize' => '38px', 'color' => '#1a1a1a', 'fontWeight' => '700', 'textAlign' => 'center', 'lineHeight' => '44px', 'margin' => '0 0 12px 0']),
                        $this->textBlock('wd-e1-body', '<p>' . __('Thanks for joining {{business_name}}, {{first_name}}! Use the code below at checkout to take 15% off your first order.', 'kelune-crm') . '</p>', ['fontSize' => '16px', 'color' => '#4a4a4a', 'textAlign' => 'center', 'lineHeight' => '26px', 'margin' => '0 0 20px 0']),
                        $this->textBlock('wd-e1-code', '<p><strong>' . __('WELCOME15', 'kelune-crm') . '</strong></p>', ['fontSize' => '22px', 'color' => '#111827', 'fontWeight' => '700', 'textAlign' => 'center', 'blockBackground' => '#fff1f2', 'padding' => '14px 0 14px 0', 'margin' => '0 0 24px 0']),
                        $this->buttonBlock('wd-e1-cta', __('Shop Now', 'kelune-crm'), ['backgroundColor' => '#e11d48', 'width' => '100%', 'buttonPadding' => '15px 0', 'margin' => '0 0 0 0']),
                    ]
                ),
                $this->delayStep(3, 'days', __('Wait 3 days', 'kelune-crm')),
                $this->emailStep(
                    __('Expiry reminder email', 'kelune-crm'),
                    __('{{first_name}}, your 15% code is about to expire', 'kelune-crm'),
                    __('Do not miss your welcome discount.', 'kelune-crm'),
                    [
                        $this->textBlock('wd-e2-eyebrow', '<p>' . __('Last chance', 'kelune-crm') . '</p>', ['fontSize' => '13px', 'color' => '#e11d48', 'fontWeight' => '700', 'textAlign' => 'center', 'margin' => '0 0 8px 0']),
                        $this->textBlock('wd-e2-hero', '<p>' . __('Your code expires soon', 'kelune-crm') . '</p>', ['fontSize' => '30px', 'color' => '#1a1a1a', 'fontWeight' => '700', 'textAlign' => 'center', 'margin' => '0 0 12px 0']),
                        $this->textBlock('wd-e2-body', '<p>' . __('Just a friendly nudge, {{first_name}} — your welcome code is still waiting, but not for long. Use it before it is gone.', 'kelune-crm') . '</p>', ['fontSize' => '16px', 'color' => '#4a4a4a', 'textAlign' => 'center', 'lineHeight' => '26px', 'margin' => '0 0 20px 0']),
                        $this->textBlock('wd-e2-code', '<p><strong>' . __('WELCOME15', 'kelune-crm') . '</strong></p>', ['fontSize' => '22px', 'color' => '#111827', 'fontWeight' => '700', 'textAlign' => 'center', 'blockBackground' => '#fff1f2', 'padding' => '14px 0 14px 0', 'margin' => '0 0 24px 0']),
                        $this->buttonBlock('wd-e2-cta', __('Redeem It Now', 'kelune-crm'), ['backgroundColor' => '#e11d48', 'width' => '100%', 'buttonPadding' => '15px 0', 'margin' => '0 0 0 0']),
                    ]
                ),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function winBackTemplate(): array
    {
        return [
            'id' => 'win-back',
            'name' => __('Win-Back Re-engagement', 'kelune-crm'),
            'description' => __('Manually enrol inactive contacts, then win them back with a heartfelt note and an incentive.', 'kelune-crm'),
            'icon' => 'heart',
            'popular' => false,
            'steps' => [
                $this->triggerStep('manual', __('Manually enrol inactive contacts', 'kelune-crm')),
                $this->emailStep(
                    __('We miss you email', 'kelune-crm'),
                    __('We miss you, {{first_name}} 💙', 'kelune-crm'),
                    __('It has been a while — here is what you have missed.', 'kelune-crm'),
                    [
                        $this->brandHeader('wb-e1-brand'),
                        $this->dividerBlock('wb-e1-div'),
                        $this->textBlock('wb-e1-title', '<p>' . __('It has been a while', 'kelune-crm') . '</p>', ['fontSize' => '28px', 'color' => '#1a1a1a', 'fontWeight' => '700', 'textAlign' => 'center', 'margin' => '0 0 12px 0']),
                        $this->textBlock('wb-e1-body', '<p>' . __('We noticed you have been away, {{first_name}}, and we would love to have you back. A lot has changed at {{business_name}} — we think you will like what is new.', 'kelune-crm') . '</p>', ['fontSize' => '16px', 'color' => '#4a4a4a', 'textAlign' => 'center', 'lineHeight' => '26px', 'margin' => '0 0 24px 0']),
                        $this->buttonBlock('wb-e1-cta', __('See What\'s New', 'kelune-crm'), ['margin' => '0 0 0 0']),
                    ]
                ),
                $this->delayStep(4, 'days', __('Wait 4 days', 'kelune-crm')),
                $this->emailStep(
                    __('Incentive email', 'kelune-crm'),
                    __('A little something to welcome you back', 'kelune-crm'),
                    __('20% off, just for you.', 'kelune-crm'),
                    [
                        $this->textBlock('wb-e2-eyebrow', '<p>' . __('Welcome back offer', 'kelune-crm') . '</p>', ['fontSize' => '13px', 'color' => '#e11d48', 'fontWeight' => '700', 'textAlign' => 'center', 'margin' => '0 0 8px 0']),
                        $this->textBlock('wb-e2-hero', '<p>' . __('Here is 20% off', 'kelune-crm') . '</p>', ['fontSize' => '36px', 'color' => '#1a1a1a', 'fontWeight' => '700', 'textAlign' => 'center', 'margin' => '0 0 12px 0']),
                        $this->textBlock('wb-e2-body', '<p>' . __('No hard feelings for being away, {{first_name}}. Here is 20% off to pick up right where you left off.', 'kelune-crm') . '</p>', ['fontSize' => '16px', 'color' => '#4a4a4a', 'textAlign' => 'center', 'lineHeight' => '26px', 'margin' => '0 0 20px 0']),
                        $this->textBlock('wb-e2-code', '<p><strong>' . __('COMEBACK20', 'kelune-crm') . '</strong></p>', ['fontSize' => '22px', 'color' => '#111827', 'fontWeight' => '700', 'textAlign' => 'center', 'blockBackground' => '#fff1f2', 'padding' => '14px 0 14px 0', 'margin' => '0 0 24px 0']),
                        $this->buttonBlock('wb-e2-cta', __('Come Back', 'kelune-crm'), ['backgroundColor' => '#e11d48', 'width' => '100%', 'buttonPadding' => '15px 0', 'margin' => '0 0 0 0']),
                    ]
                ),
                $this->addTagStep(__('Tag as Re-engaged', 'kelune-crm')),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function eventReminderTemplate(): array
    {
        return [
            'id' => 'event-reminder',
            'name' => __('Event Reminder Sequence', 'kelune-crm'),
            'description' => __('Manually enrol registrants, confirm their spot, then remind them as the event approaches.', 'kelune-crm'),
            'icon' => 'calendar',
            'popular' => false,
            'steps' => [
                $this->triggerStep('manual', __('Manually enrol registrants', 'kelune-crm')),
                $this->emailStep(
                    __('RSVP confirmation email', 'kelune-crm'),
                    __('You are in, {{first_name}} — see you there!', 'kelune-crm'),
                    __('Your spot is confirmed. Here are the details.', 'kelune-crm'),
                    [
                        $this->brandHeader('er-e1-brand'),
                        $this->textBlock('er-e1-title', '<p>' . __('You are registered', 'kelune-crm') . '</p>', ['fontSize' => '30px', 'color' => '#1a1a1a', 'fontWeight' => '700', 'textAlign' => 'center', 'margin' => '0 0 10px 0']),
                        $this->textBlock('er-e1-intro', '<p>' . __('Thanks for signing up, {{first_name}}! Your spot is saved. Add the details below to your calendar so you do not miss it.', 'kelune-crm') . '</p>', ['fontSize' => '16px', 'color' => '#4a4a4a', 'textAlign' => 'center', 'lineHeight' => '26px', 'margin' => '0 0 24px 0']),
                        $this->columnsBlock('er-e1-cols', [
                            [
                                $this->textBlock('er-e1-when-l', '<p><strong>' . __('When', 'kelune-crm') . '</strong></p>', ['fontSize' => '13px', 'color' => '#8a94a6', 'textAlign' => 'center', 'margin' => '0 0 4px 0']),
                                $this->textBlock('er-e1-when-v', '<p>' . __('Add your date &amp; time', 'kelune-crm') . '</p>', ['fontSize' => '15px', 'color' => '#1a1a1a', 'fontWeight' => '600', 'textAlign' => 'center', 'margin' => '0 0 0 0']),
                            ],
                            [
                                $this->textBlock('er-e1-where-l', '<p><strong>' . __('Where', 'kelune-crm') . '</strong></p>', ['fontSize' => '13px', 'color' => '#8a94a6', 'textAlign' => 'center', 'margin' => '0 0 4px 0']),
                                $this->textBlock('er-e1-where-v', '<p>' . __('Add your location or link', 'kelune-crm') . '</p>', ['fontSize' => '15px', 'color' => '#1a1a1a', 'fontWeight' => '600', 'textAlign' => 'center', 'margin' => '0 0 0 0']),
                            ],
                        ], ['blockBackground' => '#f4f5f7', 'padding' => '20px 12px 20px 12px', 'margin' => '0 0 24px 0']),
                        $this->buttonBlock('er-e1-cta', __('Add to Calendar', 'kelune-crm'), ['width' => '100%', 'buttonPadding' => '15px 0', 'margin' => '0 0 0 0']),
                    ]
                ),
                $this->delayStep(1, 'days', __('Wait until closer to the event', 'kelune-crm')),
                $this->emailStep(
                    __('Reminder email', 'kelune-crm'),
                    __('Reminder: your event with {{business_name}} is coming up', 'kelune-crm'),
                    __('Just a heads-up so it stays on your radar.', 'kelune-crm'),
                    [
                        $this->brandHeader('er-e2-brand'),
                        $this->dividerBlock('er-e2-div'),
                        $this->textBlock('er-e2-title', '<p>' . __('It is almost here', 'kelune-crm') . '</p>', ['fontSize' => '26px', 'color' => '#1a1a1a', 'fontWeight' => '700', 'textAlign' => 'center', 'margin' => '0 0 12px 0']),
                        $this->textBlock('er-e2-body', '<p>' . __('Hi {{first_name}}, your event is coming up soon. We are looking forward to seeing you — here is your link again so it is easy to find.', 'kelune-crm') . '</p>', ['fontSize' => '16px', 'color' => '#4a4a4a', 'textAlign' => 'center', 'lineHeight' => '26px', 'margin' => '0 0 24px 0']),
                        $this->buttonBlock('er-e2-cta', __('View Event Details', 'kelune-crm'), ['margin' => '0 0 0 0']),
                    ]
                ),
                $this->delayStep(1, 'days', __('Wait until event day', 'kelune-crm')),
                $this->emailStep(
                    __('Starts today email', 'kelune-crm'),
                    __('Today is the day, {{first_name}}!', 'kelune-crm'),
                    __('Your event starts today — here is everything you need.', 'kelune-crm'),
                    [
                        $this->textBlock('er-e3-eyebrow', '<p>' . __('Happening today', 'kelune-crm') . '</p>', ['fontSize' => '13px', 'color' => '#1677ff', 'fontWeight' => '700', 'textAlign' => 'center', 'margin' => '0 0 8px 0']),
                        $this->textBlock('er-e3-title', '<p>' . __('See you soon!', 'kelune-crm') . '</p>', ['fontSize' => '32px', 'color' => '#1a1a1a', 'fontWeight' => '700', 'textAlign' => 'center', 'margin' => '0 0 12px 0']),
                        $this->textBlock('er-e3-body', '<p>' . __('This is it, {{first_name}} — your event starts today. Tap below to join, and please arrive a few minutes early.', 'kelune-crm') . '</p>', ['fontSize' => '16px', 'color' => '#4a4a4a', 'textAlign' => 'center', 'lineHeight' => '26px', 'margin' => '0 0 24px 0']),
                        $this->buttonBlock('er-e3-cta', __('Join Now', 'kelune-crm'), ['width' => '100%', 'buttonPadding' => '15px 0', 'margin' => '0 0 0 0']),
                    ]
                ),
            ],
        ];
    }
}
