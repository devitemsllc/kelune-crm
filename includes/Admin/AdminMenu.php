<?php

declare(strict_types=1);

namespace KeluneCRM\Admin;

use KeluneCRM\Support\BrandMark;

class AdminMenu
{
    private string $menuSlug = 'kelune-crm';

    private string $capability = 'manage_options';

    /**
     * Single source of truth for both the WordPress admin menu and the admin
     * bar menu. Each entry:
     *   - hash: URL hash appended to the shared admin page ('' = bare slug,
     *           which loads the app with no hash → React redirects to #/dashboard).
     *   - title: translated label.
     *   - separator: whether a divider rule is drawn above this item.
     *   - indent: whether the item is visually nested (extra left padding +
     *             smaller font) so it reads as a child of Contacts.
     *
     * @return array<int, array{hash: string, title: string, separator: bool, indent: bool}>
     */
    private function menuItems(): array
    {
        // The bare-slug first item is Dashboard (loads the app with no hash →
        // React redirects to #/dashboard). "Contacts" and "Emails" are clickable
        // section headers; the indented rows beneath them are their children.
        // "#/contacts-group" and "#/emails-group" are thin redirect routes
        // (→ /contacts and → /email-templates) so each header has its own slug
        // distinct from the "All Contacts" / "Templates" child beneath it.
        $items = [
            ['hash' => '', 'title' => __('Dashboard', 'kelune-crm'), 'separator' => false, 'indent' => false],
            ['hash' => '#/contacts-group', 'title' => __('Contacts', 'kelune-crm'), 'separator' => true, 'indent' => false],
            ['hash' => '#/contacts', 'title' => __('All Contacts', 'kelune-crm'), 'separator' => false, 'indent' => true],
            ['hash' => '#/contacts/lists', 'title' => __('Lists', 'kelune-crm'), 'separator' => false, 'indent' => true],
            ['hash' => '#/contacts/tags', 'title' => __('Tags', 'kelune-crm'), 'separator' => false, 'indent' => true],
        ];

        // Segments are a Pro feature; the submenu row appears only when the Pro
        // add-on is active (it flips the `kelune_crm_pro_active` filter).
        if ((bool) apply_filters('kelune_crm_pro_active', false)) {
            $items[] = ['hash' => '#/contacts/segments', 'title' => __('Segments', 'kelune-crm'), 'separator' => false, 'indent' => true];
        }

        $items = array_merge($items, [
            ['hash' => '#/campaigns', 'title' => __('Campaigns', 'kelune-crm'), 'separator' => true, 'indent' => false],
            ['hash' => '#/automations', 'title' => __('Automations', 'kelune-crm'), 'separator' => false, 'indent' => false],
            ['hash' => '#/emails-group', 'title' => __('Emails', 'kelune-crm'), 'separator' => true, 'indent' => false],
            ['hash' => '#/email-templates', 'title' => __('Templates', 'kelune-crm'), 'separator' => false, 'indent' => true],
            ['hash' => '#/email-logs', 'title' => __('Logs', 'kelune-crm'), 'separator' => false, 'indent' => true],
            ['hash' => '#/analytics', 'title' => __('Analytics', 'kelune-crm'), 'separator' => true, 'indent' => false],
            ['hash' => '#/settings', 'title' => __('Settings', 'kelune-crm'), 'separator' => false, 'indent' => false],
        ]);

        // The license belongs to the Pro add-on; without it there is nothing to
        // activate, so the row only exists while Pro is active.
        if ((bool) apply_filters('kelune_crm_pro_active', false)) {
            $items[] = ['hash' => '#/license', 'title' => __('License', 'kelune-crm'), 'separator' => true, 'indent' => false];
        }

        return $items;
    }

    public function register(): void
    {
        // Single admin page (slug = plugin slug). React app handles routing via URL hash.
        // Submenus point to the same page with a hash route; the React app keeps the
        // active submenu indicator in sync (WordPress can't, since they share one page).
        add_menu_page(
            __('Kelune CRM', 'kelune-crm'),
            __('Kelune CRM', 'kelune-crm'),
            $this->capability,
            $this->menuSlug,
            [$this, 'renderApp'],
            'none',
            2.000001
        );

        // The first item uses the bare slug so it overrides the auto-created
        // duplicate. WordPress can't draw dividers between submenu items, so the
        // divider/indent styling is enqueued separately (see enqueueAssets()).
        foreach ($this->menuItems() as $item) {
            add_submenu_page(
                $this->menuSlug,
                $item['title'],
                $item['title'],
                $this->capability,
                $this->menuSlug . $item['hash'],
                [$this, 'renderApp']
            );
        }
    }

    /**
     * Admin bar menu mirroring the WordPress admin menu (same items + dividers).
     */
    public function registerAdminBar(\WP_Admin_Bar $wpAdminBar): void
    {
        if (!current_user_can($this->capability)) {
            return;
        }

        $adminUrl = admin_url('admin.php?page=' . $this->menuSlug);

        $wpAdminBar->add_node([
            'id'    => $this->menuSlug,
            'title' => '<span class="ab-icon"></span>' . esc_html__('Kelune CRM', 'kelune-crm'),
            'href'  => $adminUrl,
        ]);

        foreach ($this->menuItems() as $item) {
            // Bare '' (Contacts header) → 'home' so it can't collide with the
            // "#/contacts" (All Contacts) child, which maps to 'contacts'.
            $childId = $this->menuSlug . '-' . ($this->itemSlug($item['hash']) ?: 'home');

            // Divider/indent styling for these nodes is enqueued separately (see
            // enqueueAssets()); the label itself stays plain text.
            $wpAdminBar->add_node([
                'parent' => $this->menuSlug,
                'id'     => $childId,
                'title'  => esc_html($item['title']),
                'href'   => $adminUrl . $item['hash'],
            ]);
        }
    }

    /**
     * Enqueue the menu divider/indent styling and the admin app wrapper reset.
     *
     * WordPress can't draw dividers between submenu items or nest them, so those
     * rules are added through the styles pipeline (wp_add_inline_style) rather
     * than an inline stylesheet tag embedded in each menu label. Hooked on both
     * admin_enqueue_scripts and wp_enqueue_scripts (the admin bar, and thus its
     * styling, also renders on the front end).
     */
    public function enqueueAssets(string $hook = ''): void
    {
        // Admin sidebar dividers/indents — the sidebar shows on every admin page.
        if (is_admin()) {
            wp_register_style('kelune-crm-admin-menu', false, [], KELUNE_CRM_VERSION);
            wp_enqueue_style('kelune-crm-admin-menu');

            wp_add_inline_style('kelune-crm-admin-menu', $this->menuIconCss());

            $menuCss = $this->menuSidebarCss();
            if ($menuCss !== '') {
                wp_add_inline_style('kelune-crm-admin-menu', $menuCss);
            }

            // App wrapper reset — only on the plugin's own screens.
            if (strpos($hook, $this->menuSlug) !== false) {
                wp_add_inline_style('kelune-crm-admin-menu', $this->appWrapperCss());
            }
        }

        // Admin bar dividers/indents — the bar renders on the front end too.
        if (is_admin_bar_showing()) {
            wp_register_style('kelune-crm-admin-bar', false, [], KELUNE_CRM_VERSION);
            wp_enqueue_style('kelune-crm-admin-bar');
            wp_add_inline_style('kelune-crm-admin-bar', $this->barIconCss());

            $barCss = $this->adminBarCss();
            if ($barCss !== '') {
                wp_add_inline_style('kelune-crm-admin-bar', $barCss);
            }
        }
    }

    /**
     * Paint the brand mark into the admin menu's icon slot.
     *
     * The mark is a mask rather than an image, filled with `currentColor`, so it
     * takes whatever colour the active admin colour scheme gives the icon —
     * including its hover and current-menu states, and the light schemes where a
     * fixed white icon would vanish. Menus registered with 'none' leave the slot
     * empty for exactly this.
     */
    private function menuIconCss(): string
    {
        $selector = '#adminmenu #toplevel_page_' . $this->menuSlug . ' div.wp-menu-image';

        return '@supports ((-webkit-mask-image:url("")) or (mask-image:url(""))){'
            . $selector . '::before{'
            . 'content:"";width:18px;height:18px;padding:8px 0;'
            . 'background-color:currentColor;'
            . $this->maskDeclarations(18)
            . '}}';
    }

    /**
     * The same treatment for the admin bar node, which also renders on the front
     * end. Sized and nudged to sit on the bar's text baseline.
     */
    private function barIconCss(): string
    {
        $selector = '#wpadminbar #wp-admin-bar-' . $this->menuSlug . ' > .ab-item .ab-icon';

        return '@supports ((-webkit-mask-image:url("")) or (mask-image:url(""))){'
            . $selector . '{width:16px;height:16px;margin-right:6px;}'
            . $selector . '::before{'
            . 'content:"";display:block;width:16px;height:16px;padding:0;top:4px;'
            . 'background-color:currentColor;'
            . $this->maskDeclarations(16)
            . '}}';
    }

    /**
     * Mask shorthand, prefixed and unprefixed. The data URI is generated from
     * first-party geometry, so nothing external is fetched.
     */
    private function maskDeclarations(int $size): string
    {
        $mask = 'url("' . BrandMark::tileMaskUri() . '") no-repeat center/' . $size . 'px ' . $size . 'px;';

        return '-webkit-mask:' . $mask . 'mask:' . $mask;
    }

    /**
     * Build the admin sidebar divider/indent CSS. Selectors and hrefs are built
     * from internal, static menu constants only — no user input.
     */
    private function menuSidebarCss(): string
    {
        $css = '';

        foreach ($this->menuItems() as $item) {
            if (!$item['separator'] && !$item['indent']) {
                continue;
            }

            $href = 'admin.php?page=' . $this->menuSlug . $item['hash'];
            $selector = '#adminmenu li#toplevel_page_' . $this->menuSlug
                . ' ul.wp-submenu a[href="' . $href . '"]';

            if ($item['separator']) {
                $css .= $selector . '{border-top:2px solid rgba(240,246,252,.2);margin-top:5px;padding-top:8px;}';
            }
            if ($item['indent']) {
                // Nest under Contacts: default anchor left padding is 12px.
                $css .= $selector . '{padding-left:20px;font-size:90%;}';
            }
        }

        return $css;
    }

    /**
     * Build the admin bar divider/indent CSS. Same static, internal inputs as
     * menuSidebarCss().
     */
    private function adminBarCss(): string
    {
        $css = '';

        foreach ($this->menuItems() as $item) {
            if (!$item['separator'] && !$item['indent']) {
                continue;
            }

            $childId = $this->menuSlug . '-' . ($this->itemSlug($item['hash']) ?: 'home');
            $liSelector = '#wpadminbar li#wp-admin-bar-' . $this->menuSlug
                . ' ul.ab-submenu li#wp-admin-bar-' . $childId;

            if ($item['separator']) {
                $css .= $liSelector . '{border-top:2px solid rgba(240,246,252,.2);margin-top:3px;padding-top:1px;}';
            }
            if ($item['indent']) {
                // Nest under Contacts, matching the WP admin menu treatment.
                $css .= $liSelector . ' > .ab-item{padding-left:20px;font-size:90%;}';
            }
        }

        return $css;
    }

    private function appWrapperCss(): string
    {
        return '#wpcontent{padding-left:0;}#kelune-crm-dashboard{margin:0;padding:0;}';
    }

    /**
     * Derive a stable, unique node slug from a hash ('#/contacts/lists' → 'contacts-lists').
     */
    private function itemSlug(string $hash): string
    {
        return str_replace('/', '-', ltrim($hash, '#/'));
    }

    public function renderApp(): void
    {
        echo '<div id="kelune-crm-dashboard" class="wrap"></div>';
    }
}
