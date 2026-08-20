<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

/**
 * Email HTML generator: turns the visual builder's block model into email-safe,
 * table-based HTML with inline CSS.
 *
 * Byte-for-byte compatible with the TypeScript twin (utils/emailHtml.ts) so a
 * block template renders identically whether built here or in the browser. The
 * juice() CSS-inlining step is omitted — every block already emits inline styles.
 */
class EmailHtmlRenderer
{
    /**
     * Sentinel at the top of every builder document's <body>, marking it as an
     * email that OWNS its footer so the global footer is never appended.
     * A comment, not the doctype: wp_kses_post strips the
     * <!DOCTYPE>/<html>/<head>/<body> scaffold but preserves comments, so only
     * this survives sanitization. MUST match the TS twin (EMAIL_DOC_MARKER).
     */
    public const EMAIL_DOC_MARKER = '<!--kelune-crm:email-doc-->';

    /** @var array<string, mixed> */
    private const DEFAULT_SETTINGS = [
        'contentWidth' => 700,
        'backgroundColor' => '#f8f8f8',
        'contentBackground' => '#ffffff',
        'fontFamily' => 'Arial, sans-serif',
        'pagePadding' => '30px 15px 10px 15px',
        'contentPadding' => '20px',
        'footerEnabled' => true,
        'footerSource' => 'global',
        'footerContent' => '',
        'footerFontSize' => '14px',
        'footerTextColor' => '#333333',
        'footerLinkColor' => '#1677ff',
        'footerBackground' => 'transparent',
        'footerPadding' => '20px 20px 20px 20px',
    ];

    /**
     * Build the full email document from blocks + settings.
     *
     * @param array<int, array<string, mixed>> $blocks
     * @param array<string, mixed> $settings
     */
    public function render(array $blocks, array $settings = []): string
    {
        $body = '';
        foreach ($blocks as $block) {
            $body .= $this->renderBlockBody($block);
        }

        // Builder documents carry the template's own footer inside Main.
        return $this->renderHtml($body, $settings, true);
    }

    /**
     * Wrap ready-made body HTML in the same document shell the block renderer
     * produces, so plugin-composed emails (opt-in confirmation, notifications)
     * inherit the same chrome. They pass no footer; only builder documents
     * ($includeFooter) render the template footer below the content.
     *
     * @param array<string, mixed> $settings
     */
    public function renderHtml(string $body, array $settings = [], bool $includeFooter = false): string
    {
        $settings = array_merge(self::DEFAULT_SETTINGS, $settings);
        $footer = $includeFooter ? $this->buildFooterBlock($settings) : '';

        // Every link opens in a new tab: inject target/rel into any anchor that
        // lacks a target (image/button links and author-written text links).
        $body = preg_replace(
            '/<a\b(?![^>]*\btarget=)/i',
            '<a target="_blank" rel="noopener noreferrer"',
            $body
        ) ?? $body;

        $bg = (string) $settings['backgroundColor'];
        $font = (string) $settings['fontFamily'];
        $contentBg = (string) $settings['contentBackground'];
        $contentWidth = (string) $settings['contentWidth'];
        $pagePadding = $this->s($settings['pagePadding'] ?? null, '30px 15px 10px 15px');
        $contentPadding = $this->s($settings['contentPadding'] ?? null, '20px');

        return '<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: ' . $font . ';
            background-color: ' . $bg . ';
        }
    </style>
</head>
<body>
    ' . self::EMAIL_DOC_MARKER . '
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ' . $bg . ';">
        <tr>
            <td align="center" style="padding: ' . $pagePadding . ';">
                <table width="' . $contentWidth . '" cellpadding="0" cellspacing="0" style="background-color: ' . $contentBg . '; max-width: ' . $contentWidth . 'px; width: 100%;">
                    <tr>
                        <td style="padding: ' . $contentPadding . '; font-family: ' . $font . ';">
                            ' . $body . '
                        </td>
                    </tr>
                </table>
                ' . $footer . '
            </td>
        </tr>
    </table>
</body>
</html>';
    }

    /**
     * The footer block: inside Main, below the Container, at content width.
     * `global` emits the marker EmailService swaps at send; `custom` bakes the
     * authored content; disabled renders empty. Byte-identical to the TS twin.
     *
     * @param array<string, mixed> $settings
     */
    private function buildFooterBlock(array $settings): string
    {
        if (empty($settings['footerEnabled'])) {
            return '';
        }

        $linkColor = (string) ($settings['footerLinkColor'] ?? '#1677ff');
        $inner = ($settings['footerSource'] ?? 'global') === 'custom'
            ? self::colorizeAnchors((string) ($settings['footerContent'] ?? ''), $linkColor)
            : '<!--kelune-crm:global-footer:' . $linkColor . '-->';

        $w = (string) $settings['contentWidth'];
        $font = (string) $settings['fontFamily'];
        $footerFontSize = $this->s($settings['footerFontSize'] ?? null, '14px');

        return '<table width="' . $w . '" cellpadding="0" cellspacing="0" role="presentation" style="max-width: ' . $w . 'px; width: 100%;"><tr><td style="padding: ' . $this->s($settings['footerPadding'] ?? null, '20px 20px 20px 20px') . '; background: ' . $this->s($settings['footerBackground'] ?? null, 'transparent') . ';">'
            . '<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td style="font-family: ' . $font . '; font-size: ' . $footerFontSize . '; font-weight: ' . $this->s($settings['footerFontWeight'] ?? null, '400') . '; line-height: ' . $this->s($settings['footerLineHeight'] ?? null, $this->defaultLineHeight($footerFontSize)) . '; color: ' . $this->s($settings['footerTextColor'] ?? null, '#333333') . '; text-align: center;">'
            . $inner
            . '</td></tr></table>'
            . '</td></tr></table>';
    }

    /**
     * Inline a link colour onto every `<a>` in a footer body: email clients
     * ignore a stylesheet block, so it has to live on each anchor. Merges into an existing
     * style attribute. Byte-identical to the TS twin; EmailService applies it
     * when swapping the global-footer marker.
     */
    public static function colorizeAnchors(string $html, string $color): string
    {
        return (string) preg_replace_callback(
            '/<a\b([^>]*)>/i',
            static function (array $m) use ($color): string {
                $attrs = $m[1];
                if (preg_match('/\bstyle\s*=\s*(["\'])/i', $attrs)) {
                    return '<a' . preg_replace(
                        '/\bstyle\s*=\s*(["\'])/i',
                        'style=$1color: ' . $color . '; ',
                        $attrs,
                        1
                    ) . '>';
                }

                return '<a' . $attrs . ' style="color: ' . $color . ';">';
            },
            $html
        );
    }

    /**
     * `$val || $fallback` but treats null/'' as missing so we never emit an
     * empty CSS value for a style key the block omits.
     *
     * @param mixed $val
     */
    private function s($val, string $fallback): string
    {
        $str = $val === null ? '' : (string) $val;
        return trim($str) === '' ? $fallback : $str;
    }

    /**
     * Escape a value for use inside an HTML attribute (src/href/alt/…).
     *
     * @param mixed $value
     */
    private function escAttr($value): string
    {
        return str_replace(
            ['&', '"', "'", '<', '>'],
            ['&amp;', '&quot;', '&#39;', '&lt;', '&gt;'],
            (string) ($value ?? '')
        );
    }

    /**
     * Outer wrapper shared by every block: background, outer padding, margin.
     *
     * @param array<string, mixed> $st
     */
    private function wrap(array $st, string $body): string
    {
        return '<div style="background: ' . $this->s($st['blockBackground'] ?? null, 'transparent')
            . '; padding: ' . $this->s($st['padding'] ?? null, '0')
            . '; margin: ' . $this->s($st['margin'] ?? null, '0') . ';">' . $body . '</div>';
    }

    /**
     * Columns wrap with background + outer padding + margin (like every other
     * block); the per-cell padding is applied inside renderColumns.
     *
     * @param array<string, mixed> $st
     */
    private function wrapRow(array $st, string $body): string
    {
        return '<div style="background: ' . $this->s($st['blockBackground'] ?? null, 'transparent')
            . '; padding: ' . $this->s($st['padding'] ?? null, '0')
            . '; margin: ' . $this->s($st['margin'] ?? null, '0') . ';">' . $body . '</div>';
    }

    /** @param array<string, mixed> $block */
    private function renderBlockBody(array $block): string
    {
        /** @var array<string, mixed> $st */
        $st = is_array($block['styles'] ?? null) ? $block['styles'] : [];
        $type = (string) ($block['type'] ?? '');

        switch ($type) {
            case 'text':
                return $this->wrap($st, $this->renderText($st));
            case 'html':
                // Author-supplied raw HTML (sanitized on save via wp_kses_post;
                // the `html` styles key is NOT the inline-only `content` key).
                // Emitted as-is. Mirror of the TS twin (utils/emailHtml.ts).
                return $this->wrap($st, (string) ($st['html'] ?? ''));
            case 'image':
                return $this->wrap($st, $this->renderImage($st));
            case 'button':
                return $this->wrap($st, $this->renderButton($st));
            case 'divider':
                return $this->wrap($st, $this->renderDivider($st));
            case 'spacer':
                return $this->wrap($st, $this->renderSpacer($st));
            case 'columns':
                // Columns get outer padding/margin like any block; per-cell
                // padding is applied inside renderColumns.
                return $this->wrapRow($st, $this->renderColumns($st));
            default:
                return '';
        }
    }

    /**
     * The default line-height when the author hasn't set one: font-size + 10px
     * (16px → 26px, 14px → 24px). Mirror of the TypeScript `defaultLineHeight`.
     */
    private function defaultLineHeight(string $fontSize): string
    {
        $size = (float) $fontSize;

        return (($size > 0 ? $size : 16.0) + 10) . 'px';
    }

    /** @param array<string, mixed> $st */
    private function renderText(array $st): string
    {
        // font-family is omitted so text inherits the template Base Font.
        $fontSize = $this->s($st['fontSize'] ?? null, '16px');
        $style = 'font-size: ' . $fontSize
            . '; color: ' . $this->s($st['color'] ?? null, '#333333')
            . '; font-weight: ' . $this->s($st['fontWeight'] ?? null, '400')
            . '; text-align: ' . $this->s($st['textAlign'] ?? null, 'left')
            . '; line-height: ' . $this->s($st['lineHeight'] ?? null, $this->defaultLineHeight($fontSize)) . ';';

        // content is author-controlled rich HTML (sanitized on save to a
        // block-level allow-list; see EmailTemplatesController::allowedInlineHtml).
        // Per-child spacing is inlined here because email drops stylesheets.
        return '<div style="' . $style . '">' . $this->styleRichContent((string) ($st['content'] ?? '')) . '</div>';
    }

    /**
     * Inline block-level spacing onto each top-level child of a Text block.
     * Email clients strip stylesheet blocks and ignore descendant / `:last-child`
     * selectors, so paragraph gaps, list indent and the blockquote rule are
     * stamped inline. Author styles stay ahead of ours and win. Mirror of the
     * TypeScript `styleRichContent`.
     */
    private function styleRichContent(string $content): string
    {
        $content = trim($content);
        if ($content === '') {
            return '';
        }

        $lower = strtolower($content);
        // Nothing but inline/text content → no block children to space.
        if (
            strpos($lower, '<p') === false
            && strpos($lower, '<ul') === false
            && strpos($lower, '<ol') === false
            && strpos($lower, '<blockquote') === false
        ) {
            return $content;
        }

        $dom = new \DOMDocument();
        // The XML declaration forces UTF-8 so multibyte content is not mangled;
        // NOIMPLIED keeps our wrapper div as the sole root element (no <html>/
        // <body>), so documentElement is it — getElementById is unreliable here
        // because libxml does not treat `id` as an ID without a DTD.
        $wrapped = '<?xml encoding="UTF-8"?><div>' . $content . '</div>';
        $loaded = @$dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        if ($loaded === false) {
            return $content;
        }

        $root = $dom->documentElement;
        if (!$root instanceof \DOMElement) {
            return $content;
        }

        $elements = [];
        foreach ($root->childNodes as $node) {
            if ($node instanceof \DOMElement) {
                $elements[] = $node;
            }
        }
        $lastIndex = count($elements) - 1;
        foreach ($elements as $i => $el) {
            $this->applyBlockSpacing($el, $i === $lastIndex);
        }

        $html = '';
        foreach ($root->childNodes as $node) {
            $rendered = $dom->saveHTML($node);
            if ($rendered !== false) {
                $html .= $rendered;
            }
        }

        return $html;
    }

    private function applyBlockSpacing(\DOMElement $el, bool $isLast): void
    {
        $tag = strtolower($el->tagName);
        $indent = ($tag === 'ul' || $tag === 'ol') ? '28px' : '0';
        $bottom = $isLast ? '0' : '15px';
        $rules = 'margin: 0 0 ' . $bottom . ' ' . $indent . ';';
        if ($tag === 'blockquote') {
            $rules .= ' border-width: 0 0 0 2px; border-style: solid;'
                . ' border-color: rgba(0, 0, 0, 0.45); padding: 0 0 0 1em;';
        }
        // Author-set inline styles (colour, alignment) are kept and win.
        $existing = trim($el->getAttribute('style'));
        $el->setAttribute('style', $existing === '' ? $rules : $existing . ' ' . $rules);
    }

    /** @param array<string, mixed> $st */
    private function renderImage(array $st): string
    {
        if (empty($st['src'])) {
            return '';
        }
        // width 'auto' → natural size (capped to the container); a percentage
        // scales the image. max-width:100% always guards against overflow.
        $w = $this->s($st['width'] ?? null, 'auto');
        $img = '<img src="' . $this->escAttr($st['src']) . '" alt="' . $this->escAttr($st['alt'] ?? __('Image', 'kelune-crm'))
            . '" style="width: ' . $w
            . '; max-width: 100%; height: auto; display: inline-block; font-size: 16px; line-height: 1.6;" />';
        $content = !empty($st['link'])
            ? '<a href="' . $this->escAttr($st['link']) . '">' . $img . '</a>'
            : $img;
        // line-height:0 on the wrapper removes the inline-block baseline gap.
        return '<div style="text-align: ' . $this->s($st['textAlign'] ?? null, 'center') . '; line-height: 0;">' . $content . '</div>';
    }

    /** @param array<string, mixed> $st */
    private function renderButton(array $st): string
    {
        // width 'auto' → button hugs its text (inline); a percentage makes a
        // fixed-width CTA, centred inside the wrapper's text-align.
        $w = $this->s($st['width'] ?? null, 'auto');
        $widthStyle = $w === 'auto' ? '' : 'width: ' . $w . '; box-sizing: border-box; ';
        $btnStyle = 'display: inline-block; ' . $widthStyle . 'padding: ' . $this->s($st['buttonPadding'] ?? null, '12px 24px')
            . '; background-color: ' . $this->s($st['backgroundColor'] ?? null, '#333333')
            . '; color: ' . $this->s($st['textColor'] ?? null, '#FFFFFF')
            . '; font-size: ' . $this->s($st['fontSize'] ?? null, '16px')
            . '; font-weight: ' . $this->s($st['fontWeight'] ?? null, 'normal')
            . '; line-height: ' . $this->s($st['lineHeight'] ?? null, 'normal')
            . '; border-radius: ' . $this->s($st['borderRadius'] ?? null, '4px')
            . '; text-decoration: none;';

        return '<div style="text-align: ' . $this->s($st['textAlign'] ?? null, 'center') . ';">'
            . '<a href="' . $this->escAttr($this->s($st['link'] ?? null, '#')) . '" style="' . $btnStyle . '">'
            . $this->escAttr($st['text'] ?? __('Click Me', 'kelune-crm')) . '</a></div>';
    }

    /** @param array<string, mixed> $st */
    private function renderDivider(array $st): string
    {
        // width 'auto' → full width; a percentage makes a shorter, centred rule.
        $w = $this->s($st['width'] ?? null, 'auto');
        $width = $w === 'auto' ? '100%' : $w;
        return '<hr style="border: none; border-top: ' . $this->s($st['borderWidth'] ?? null, '1px')
            . ' ' . $this->s($st['borderStyle'] ?? null, 'solid')
            . ' ' . $this->s($st['borderColor'] ?? null, '#DDDDDD')
            . '; width: ' . $width . '; margin: 0 auto;" />';
    }

    /** @param array<string, mixed> $st */
    private function renderSpacer(array $st): string
    {
        $height = $this->s($st['height'] ?? null, '40px');
        return '<div style="height: ' . $height . '; line-height: ' . $height . '; font-size: 1px;">&nbsp;</div>';
    }

    /** @param array<string, mixed> $st */
    private function renderColumns(array $st): string
    {
        $count = (int) ($st['columnCount'] ?? 2);
        if ($count < 1) {
            $count = 1;
        }
        $width = (100 / $count) . '%';
        // Per-cell padding (separate from the block's outer Section padding).
        $cellPadding = $this->s($st['cellPadding'] ?? null, '0');
        /** @var array<int, array<string, mixed>> $columns */
        $columns = is_array($st['columns'] ?? null) ? $st['columns'] : [];

        $html = '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;"><tr>';
        for ($i = 0; $i < $count; $i++) {
            $col = $columns[$i] ?? [];
            $cellContent = '';
            if (!empty($col['blocks']) && is_array($col['blocks'])) {
                foreach ($col['blocks'] as $nested) {
                    if (is_array($nested)) {
                        $cellContent .= $this->renderBlockBody($nested);
                    }
                }
            } elseif (isset($col['content'])) {
                $cellContent = (string) $col['content'];
            }
            $html .= '<td width="' . $width . '" valign="top" style="padding: ' . $cellPadding . ';">' . $cellContent . '</td>';
        }
        $html .= '</tr></table>';
        return $html;
    }
}
