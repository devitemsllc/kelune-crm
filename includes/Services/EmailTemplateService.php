<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

class EmailTemplateService
{
    private EmailHtmlRenderer $renderer;

    public function __construct(?EmailHtmlRenderer $renderer = null)
    {
        $this->renderer = $renderer ?? new EmailHtmlRenderer();
    }

    /**
     * Built-in ("Built-in" tab) email templates.
     *
     * These live in code — NOT the database. Nothing is seeded on activation and
     * nothing is stored; the set is authored here and served on the fly (mirrors
     * the built-in automation templates). Each template is authored as a
     * visual-builder block tree (`structure` => ['mode','settings','blocks']); the
     * HTML is generated from those blocks via EmailHtmlRenderer so the two never
     * drift and every built-in template opens fully editable in the drag-and-drop
     * builder. No HTML block is used — only the first-class visual blocks (text,
     * button, divider, spacer, columns).
     *
     * @return array<int, array<string, mixed>>
     */
    public function getTemplates(): array
    {
        /** @var array<int, array<string, mixed>> $definitions */
        $definitions = [
            $this->promotionTemplate(),
            $this->eventInvitationTemplate(),
            $this->welcomeTemplate(),
            $this->announcementTemplate(),
            $this->newsletterTemplate(),
        ];

        $templates = [];
        foreach ($definitions as $def) {
            $structure = is_array($def['structure'] ?? null) ? $def['structure'] : [];
            // Every built-in opens in the visual builder.
            $structure['mode'] = 'builder';
            $blocks = is_array($structure['blocks'] ?? null) ? $structure['blocks'] : [];
            $settings = is_array($structure['settings'] ?? null) ? $structure['settings'] : [];

            $templates[] = [
                'id' => $def['id'],
                'name' => $def['name'],
                'description' => $def['description'] ?? '',
                'editor' => 'builder',
                'structure' => $structure,
                'html' => $this->renderer->render($blocks, $settings),
            ];
        }

        return $templates;
    }

    /**
     * Get a single built-in template by its string id.
     *
     * @return array<string, mixed>|null
     */
    public function getTemplate(string $template_id): ?array
    {
        foreach ($this->getTemplates() as $template) {
            if ($template['id'] === $template_id) {
                return $template;
            }
        }

        return null;
    }

    /**
     * Design settings shared by every built-in template. Partial by design: the
     * dashboard merges these over its own DEFAULT_TEMPLATE_SETTINGS on import, so
     * only the keys that differ from the defaults need to appear here.
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
     * A text block. Only the keys that differ from the builder's own text-block
     * defaults are set; the renderer fills the rest.
     *
     * @param array<string, mixed> $styles
     * @return array<string, mixed>
     */
    private function textBlock(string $id, string $content, array $styles = []): array
    {
        return [
            'id' => $id,
            'type' => 'text',
            'styles' => array_merge(
                [
                    'content' => $content,
                    'padding' => '0 0 0 0',
                    'margin' => '0 0 15px 0',
                ],
                $styles
            ),
        ];
    }

    /**
     * A call-to-action button block.
     *
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
     * A horizontal divider block.
     *
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
     * A vertical spacer block.
     *
     * @return array<string, mixed>
     */
    private function spacerBlock(string $id, string $height = '20px'): array
    {
        return [
            'id' => $id,
            'type' => 'spacer',
            'styles' => [
                'height' => $height,
                'padding' => '0 0 0 0',
                'margin' => '0 0 0 0',
            ],
        ];
    }

    /**
     * A columns block. Each entry in $cells is a list of child blocks for one
     * column.
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
     * A centred brand header (business name) shared by every built-in template.
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

    /**
     * @return array<string, mixed>
     */
    private function welcomeTemplate(): array
    {
        return [
            'id' => 'welcome',
            'name' => __('Welcome Email', 'kelune-crm'),
            'description' => __('Greet a new subscriber and point them to a first action.', 'kelune-crm'),
            'structure' => [
                'settings' => $this->baseSettings(),
                'blocks' => [
                    $this->brandHeader('welcome-brand'),
                    $this->dividerBlock('welcome-div'),
                    $this->textBlock(
                        'welcome-title',
                        '<p>' . __('Welcome aboard, {{first_name}}! 🎉', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '26px',
                            'color' => '#1a1a1a',
                            'fontWeight' => '700',
                            'textAlign' => 'center',
                            'margin' => '0 0 12px 0',
                        ]
                    ),
                    $this->textBlock(
                        'welcome-body',
                        '<p>' . __('We are thrilled to have you with us. Your account is ready, and everything you need is a click away. If you ever have a question, just reply to this email — a real person reads every message.', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '16px',
                            'color' => '#4a4a4a',
                            'textAlign' => 'center',
                            'lineHeight' => '26px',
                            'margin' => '0 0 24px 0',
                        ]
                    ),
                    $this->buttonBlock('welcome-cta', __('Get Started', 'kelune-crm'), ['margin' => '0 0 24px 0']),
                    $this->spacerBlock('welcome-spacer', '8px'),
                    $this->textBlock(
                        'welcome-signoff',
                        '<p>' . __('Cheers,<br>The {{business_name}} Team', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '15px',
                            'color' => '#6b7280',
                            'textAlign' => 'center',
                            'margin' => '0 0 0 0',
                        ]
                    ),
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function newsletterTemplate(): array
    {
        return [
            'id' => 'newsletter',
            'name' => __('Newsletter', 'kelune-crm'),
            'description' => __('A clean two-up layout for regular updates and stories.', 'kelune-crm'),
            'structure' => [
                'settings' => $this->baseSettings(),
                'blocks' => [
                    $this->brandHeader('news-brand'),
                    $this->textBlock(
                        'news-sub',
                        '<p>' . __('The Monthly Digest', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '13px',
                            'color' => '#8a94a6',
                            'fontWeight' => '600',
                            'textAlign' => 'center',
                            'margin' => '0 0 20px 0',
                        ]
                    ),
                    $this->dividerBlock('news-div1'),
                    $this->textBlock(
                        'news-hi',
                        '<p>' . __('Hi {{first_name}}, here is what is new', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '22px',
                            'color' => '#1a1a1a',
                            'fontWeight' => '700',
                            'margin' => '0 0 20px 0',
                        ]
                    ),
                    $this->columnsBlock('news-cols', [
                        [
                            $this->textBlock(
                                'news-c1-title',
                                '<p><strong>' . __('Feature spotlight', 'kelune-crm') . '</strong></p>',
                                ['fontSize' => '16px', 'color' => '#1a1a1a', 'margin' => '0 0 6px 0']
                            ),
                            $this->textBlock(
                                'news-c1-body',
                                '<p>' . __('A short teaser for your first story. Keep it to a sentence or two and link out for the full read.', 'kelune-crm') . '</p>',
                                ['fontSize' => '14px', 'color' => '#6b7280', 'lineHeight' => '22px', 'margin' => '0 0 0 0']
                            ),
                        ],
                        [
                            $this->textBlock(
                                'news-c2-title',
                                '<p><strong>' . __('Tips &amp; tricks', 'kelune-crm') . '</strong></p>',
                                ['fontSize' => '16px', 'color' => '#1a1a1a', 'margin' => '0 0 6px 0']
                            ),
                            $this->textBlock(
                                'news-c2-body',
                                '<p>' . __('Another bite-sized update. Two columns keep the layout scannable on phones and desktops alike.', 'kelune-crm') . '</p>',
                                ['fontSize' => '14px', 'color' => '#6b7280', 'lineHeight' => '22px', 'margin' => '0 0 0 0']
                            ),
                        ],
                    ]),
                    $this->dividerBlock('news-div2'),
                    $this->buttonBlock('news-cta', __('Read the Full Update', 'kelune-crm'), [
                        'backgroundColor' => '#111827',
                        'margin' => '0 0 16px 0',
                    ]),
                    $this->textBlock(
                        'news-note',
                        '<p>' . __('You are receiving this because you subscribed to {{business_name}} updates.', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '13px',
                            'color' => '#9aa2b1',
                            'textAlign' => 'center',
                            'margin' => '0 0 0 0',
                        ]
                    ),
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function promotionTemplate(): array
    {
        $settings = array_merge($this->baseSettings(), [
            'contentPadding' => '48px 40px 36px 40px',
        ]);

        return [
            'id' => 'promotion',
            'name' => __('Promotional Offer', 'kelune-crm'),
            'description' => __('A high-contrast sale announcement built around one big offer.', 'kelune-crm'),
            'structure' => [
                'settings' => $settings,
                'blocks' => [
                    $this->textBlock(
                        'promo-eyebrow',
                        '<p>' . __('Limited time offer', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '13px',
                            'color' => '#e11d48',
                            'fontWeight' => '700',
                            'textAlign' => 'center',
                            'margin' => '0 0 8px 0',
                        ]
                    ),
                    $this->textBlock(
                        'promo-hero',
                        '<p>' . __('Save 30% Today', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '40px',
                            'color' => '#1a1a1a',
                            'fontWeight' => '700',
                            'textAlign' => 'center',
                            'lineHeight' => '46px',
                            'margin' => '0 0 12px 0',
                        ]
                    ),
                    $this->textBlock(
                        'promo-body',
                        '<p>' . __('{{first_name}}, this one is just for you. Use the code below at checkout and enjoy 30% off your next order — but hurry, it ends soon.', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '16px',
                            'color' => '#4a4a4a',
                            'textAlign' => 'center',
                            'lineHeight' => '26px',
                            'margin' => '0 0 20px 0',
                        ]
                    ),
                    $this->textBlock(
                        'promo-code',
                        '<p><strong>' . __('SAVE30', 'kelune-crm') . '</strong></p>',
                        [
                            'fontSize' => '22px',
                            'color' => '#111827',
                            'fontWeight' => '700',
                            'textAlign' => 'center',
                            'blockBackground' => '#fff1f2',
                            'padding' => '14px 0 14px 0',
                            'margin' => '0 0 24px 0',
                        ]
                    ),
                    $this->buttonBlock('promo-cta', __('Shop Now', 'kelune-crm'), [
                        'backgroundColor' => '#e11d48',
                        'width' => '100%',
                        'buttonPadding' => '15px 0',
                        'margin' => '0 0 20px 0',
                    ]),
                    $this->textBlock(
                        'promo-fine',
                        '<p>' . __('Offer valid for a limited time. Cannot be combined with other promotions.', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '12px',
                            'color' => '#9aa2b1',
                            'textAlign' => 'center',
                            'margin' => '0 0 0 0',
                        ]
                    ),
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function announcementTemplate(): array
    {
        return [
            'id' => 'announcement',
            'name' => __('Announcement', 'kelune-crm'),
            'description' => __('Share product news with a three-up highlights row.', 'kelune-crm'),
            'structure' => [
                'settings' => $this->baseSettings(),
                'blocks' => [
                    $this->brandHeader('ann-brand'),
                    $this->dividerBlock('ann-div'),
                    $this->textBlock(
                        'ann-title',
                        '<p>' . __('Big news, {{first_name}}', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '26px',
                            'color' => '#1a1a1a',
                            'fontWeight' => '700',
                            'textAlign' => 'center',
                            'margin' => '0 0 12px 0',
                        ]
                    ),
                    $this->textBlock(
                        'ann-body',
                        '<p>' . __('We have been busy. Here is what just landed — three improvements we think you will love.', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '16px',
                            'color' => '#4a4a4a',
                            'textAlign' => 'center',
                            'lineHeight' => '26px',
                            'margin' => '0 0 24px 0',
                        ]
                    ),
                    $this->columnsBlock('ann-cols', [
                        [
                            $this->textBlock(
                                'ann-c1',
                                '<p><strong>' . __('Faster', 'kelune-crm') . '</strong></p>',
                                ['fontSize' => '15px', 'color' => '#1a1a1a', 'textAlign' => 'center', 'margin' => '0 0 4px 0']
                            ),
                            $this->textBlock(
                                'ann-c1b',
                                '<p>' . __('Everything loads quicker than before.', 'kelune-crm') . '</p>',
                                ['fontSize' => '13px', 'color' => '#6b7280', 'textAlign' => 'center', 'lineHeight' => '20px', 'margin' => '0 0 0 0']
                            ),
                        ],
                        [
                            $this->textBlock(
                                'ann-c2',
                                '<p><strong>' . __('Simpler', 'kelune-crm') . '</strong></p>',
                                ['fontSize' => '15px', 'color' => '#1a1a1a', 'textAlign' => 'center', 'margin' => '0 0 4px 0']
                            ),
                            $this->textBlock(
                                'ann-c2b',
                                '<p>' . __('A cleaner flow with fewer clicks.', 'kelune-crm') . '</p>',
                                ['fontSize' => '13px', 'color' => '#6b7280', 'textAlign' => 'center', 'lineHeight' => '20px', 'margin' => '0 0 0 0']
                            ),
                        ],
                        [
                            $this->textBlock(
                                'ann-c3',
                                '<p><strong>' . __('Smarter', 'kelune-crm') . '</strong></p>',
                                ['fontSize' => '15px', 'color' => '#1a1a1a', 'textAlign' => 'center', 'margin' => '0 0 4px 0']
                            ),
                            $this->textBlock(
                                'ann-c3b',
                                '<p>' . __('New automations do the busywork.', 'kelune-crm') . '</p>',
                                ['fontSize' => '13px', 'color' => '#6b7280', 'textAlign' => 'center', 'lineHeight' => '20px', 'margin' => '0 0 0 0']
                            ),
                        ],
                    ], ['cellPadding' => '0 8px 0 8px']),
                    $this->buttonBlock('ann-cta', __('Learn More', 'kelune-crm'), ['margin' => '4px 0 0 0']),
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function eventInvitationTemplate(): array
    {
        return [
            'id' => 'event-invitation',
            'name' => __('Event Invitation', 'kelune-crm'),
            'description' => __('Invite contacts to an event with the key details up front.', 'kelune-crm'),
            'structure' => [
                'settings' => $this->baseSettings(),
                'blocks' => [
                    $this->brandHeader('event-brand'),
                    $this->textBlock(
                        'event-title',
                        '<p>' . __('You are invited', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '30px',
                            'color' => '#1a1a1a',
                            'fontWeight' => '700',
                            'textAlign' => 'center',
                            'margin' => '0 0 10px 0',
                        ]
                    ),
                    $this->textBlock(
                        'event-intro',
                        '<p>' . __('{{first_name}}, we would love for you to join us. Save the details below and let us know you are coming.', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '16px',
                            'color' => '#4a4a4a',
                            'textAlign' => 'center',
                            'lineHeight' => '26px',
                            'margin' => '0 0 24px 0',
                        ]
                    ),
                    $this->columnsBlock('event-cols', [
                        [
                            $this->textBlock(
                                'event-date-l',
                                '<p><strong>' . __('When', 'kelune-crm') . '</strong></p>',
                                ['fontSize' => '13px', 'color' => '#8a94a6', 'textAlign' => 'center', 'margin' => '0 0 4px 0']
                            ),
                            $this->textBlock(
                                'event-date-v',
                                '<p>' . __('Fri, Jan 24 · 6:00 PM', 'kelune-crm') . '</p>',
                                ['fontSize' => '15px', 'color' => '#1a1a1a', 'fontWeight' => '600', 'textAlign' => 'center', 'margin' => '0 0 0 0']
                            ),
                        ],
                        [
                            $this->textBlock(
                                'event-loc-l',
                                '<p><strong>' . __('Where', 'kelune-crm') . '</strong></p>',
                                ['fontSize' => '13px', 'color' => '#8a94a6', 'textAlign' => 'center', 'margin' => '0 0 4px 0']
                            ),
                            $this->textBlock(
                                'event-loc-v',
                                '<p>{{business_address}}</p>',
                                ['fontSize' => '15px', 'color' => '#1a1a1a', 'fontWeight' => '600', 'textAlign' => 'center', 'margin' => '0 0 0 0']
                            ),
                        ],
                    ], ['blockBackground' => '#f4f5f7', 'padding' => '20px 12px 20px 12px', 'margin' => '0 0 24px 0']),
                    $this->buttonBlock('event-cta', __('RSVP Now', 'kelune-crm'), [
                        'width' => '100%',
                        'buttonPadding' => '15px 0',
                        'margin' => '0 0 12px 0',
                    ]),
                    $this->textBlock(
                        'event-note',
                        '<p>' . __('Can you not make it? Just reply and let us know.', 'kelune-crm') . '</p>',
                        [
                            'fontSize' => '13px',
                            'color' => '#9aa2b1',
                            'textAlign' => 'center',
                            'margin' => '0 0 0 0',
                        ]
                    ),
                ],
            ],
        ];
    }
}
