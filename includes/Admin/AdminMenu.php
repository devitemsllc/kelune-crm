<?php

declare(strict_types=1);

namespace KeluneCRM\Admin;

use KeluneCRM\Support\BrandMark;

class AdminMenu
{
    private string $menuSlug = 'kelune-crm';

    private string $capability = 'manage_options';

    public function register(): void
    {
        // Single admin page (slug = plugin slug), no submenu items. The React app
        // handles all routing via the URL hash and renders its own navigation.
        add_menu_page(
            __('Kelune CRM', 'kelune-crm'),
            __('Kelune CRM', 'kelune-crm'),
            $this->capability,
            $this->menuSlug,
            [$this, 'renderApp'],
            'none',
            58.6
        );
    }

    /**
     * Admin bar entry pointing at the dashboard. No child nodes.
     */
    public function registerAdminBar(\WP_Admin_Bar $wpAdminBar): void
    {
        if (!current_user_can($this->capability)) {
            return;
        }

        $wpAdminBar->add_node([
            'id'    => $this->menuSlug,
            'title' => '<span class="ab-icon"></span>' . esc_html__('Kelune CRM', 'kelune-crm'),
            'href'  => admin_url('admin.php?page=' . $this->menuSlug),
        ]);
    }

    /**
     * Enqueue the brand icon styling and the admin app wrapper reset.
     *
     * Hooked on both admin_enqueue_scripts and wp_enqueue_scripts: the sidebar
     * shows on every admin page, and the admin bar renders on the front end too.
     */
    public function enqueueAssets(string $hook = ''): void
    {
        if (is_admin()) {
            wp_register_style('kelune-crm-admin-menu', false, [], KELUNE_CRM_VERSION);
            wp_enqueue_style('kelune-crm-admin-menu');
            wp_add_inline_style('kelune-crm-admin-menu', $this->menuIconCss());

            // App wrapper reset — only on the plugin's own screens.
            if (strpos($hook, $this->menuSlug) !== false) {
                wp_add_inline_style(
                    'kelune-crm-admin-menu',
                    '#wpcontent{padding-left:0;}#kelune-crm-admin-app{margin:0;padding:0;}'
                );
            }
        }

        if (is_admin_bar_showing()) {
            wp_register_style('kelune-crm-admin-bar', false, [], KELUNE_CRM_VERSION);
            wp_enqueue_style('kelune-crm-admin-bar');
            wp_add_inline_style('kelune-crm-admin-bar', $this->barIconCss());
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

    public function renderApp(): void
    {
        echo '<div id="kelune-crm-admin-app" class="wrap"></div>';
    }
}
