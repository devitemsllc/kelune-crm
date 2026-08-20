<?php

declare(strict_types=1);

namespace KeluneCRM\Database;

class Migrator
{
    private string $tablePrefix;

    private string $charsetCollate;

    public function __construct(\wpdb $wpdb)
    {
        $this->tablePrefix = $wpdb->prefix . 'kelune_crm_';
        $this->charsetCollate = $wpdb->get_charset_collate();
    }

    public function migrate(): void
    {
        $current_version = get_option('kelune_crm_db_version', '0.0.0');

        // Run migrations if version is lower or tables don't exist
        if (version_compare($current_version, KELUNE_CRM_DB_VERSION, '<')) {
            $this->runMigrations();
            update_option('kelune_crm_db_version', KELUNE_CRM_DB_VERSION);
        }
    }

    private function runMigrations(): void
    {
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');

        $this->createContactsTable();
        $this->createListsTable();
        $this->createContactListsTable();
        $this->createTagsTable();
        $this->createContactTagsTable();
        $this->createEventsTable();
        $this->createCampaignsTable();
        $this->createCampaignEmailsTable();
        $this->createCampaignLinksTable();
        $this->createAutomationsTable();
        $this->createAutomationStepsTable();
        $this->createAutomationLogsTable();
        $this->createAutomationQueueTable();
        $this->createAutomationContactsTable();
        $this->createSegmentsTable();
        $this->createSegmentContactsTable();
        $this->createNotesTable();
        $this->createCustomFieldsTable();
        $this->createCampaignVariantsTable();
        $this->createIncomingWebhooksTable();
        $this->createWebhookLogsTable();
        $this->createSmartLinksTable();
        $this->createSmartLinkClicksTable();
        $this->createEmailTemplatesTable();
        $this->createEmailLogsTable();
        $this->createEmailProvidersTable();
    }

    private function createContactsTable(): void
    {
        $tableName = $this->tablePrefix . 'contacts';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NULL,
            email VARCHAR(255) NOT NULL,
            first_name VARCHAR(50) DEFAULT '',
            last_name VARCHAR(50) DEFAULT '',
            company VARCHAR(100) DEFAULT '',
            phone VARCHAR(20) DEFAULT '',
            address_line1 VARCHAR(100) DEFAULT '',
            address_line2 VARCHAR(100) DEFAULT '',
            city VARCHAR(50) DEFAULT '',
            state VARCHAR(50) DEFAULT '',
            country VARCHAR(2) DEFAULT '',
            postal_code VARCHAR(20) DEFAULT '',
            timezone VARCHAR(50) DEFAULT '',
            avatar_url VARCHAR(255) DEFAULT '',
            status VARCHAR(20) DEFAULT 'active',
            source VARCHAR(50) DEFAULT '',
            lead_score INT DEFAULT 0,
            language VARCHAR(10) DEFAULT '',
            ip_address VARCHAR(45) DEFAULT '',
            email_verified TINYINT(1) DEFAULT 0,
            optin_token VARCHAR(100) DEFAULT '',
            custom_fields LONGTEXT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY email (email),
            KEY user_id (user_id),
            KEY status (status),
            KEY optin_token (optin_token),
            KEY created_at (created_at),
            KEY lead_score (lead_score),
            KEY source (source)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createListsTable(): void
    {
        $tableName = $this->tablePrefix . 'lists';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            name VARCHAR(100) NOT NULL,
            description TEXT NULL,
            status VARCHAR(20) DEFAULT 'active',
            type VARCHAR(20) DEFAULT 'manual',
            conditions LONGTEXT NULL,
            contact_count INT DEFAULT 0,
            created_by BIGINT UNSIGNED NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY status (status),
            KEY type (type)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createContactListsTable(): void
    {
        $tableName = $this->tablePrefix . 'contact_lists';

        $sql = "CREATE TABLE {$tableName} (
            contact_id BIGINT UNSIGNED NOT NULL,
            list_id BIGINT UNSIGNED NOT NULL,
            subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (contact_id, list_id),
            KEY list_id (list_id)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createTagsTable(): void
    {
        $tableName = $this->tablePrefix . 'tags';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            name VARCHAR(50) NOT NULL,
            slug VARCHAR(50) NOT NULL,
            description TEXT NULL,
            color VARCHAR(7) DEFAULT '#000000',
            contact_count INT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY slug (slug),
            KEY name (name)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createContactTagsTable(): void
    {
        $tableName = $this->tablePrefix . 'contact_tags';

        $sql = "CREATE TABLE {$tableName} (
            contact_id BIGINT UNSIGNED NOT NULL,
            tag_id BIGINT UNSIGNED NOT NULL,
            tagged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (contact_id, tag_id),
            KEY tag_id (tag_id)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createEventsTable(): void
    {
        $tableName = $this->tablePrefix . 'events';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            contact_id BIGINT UNSIGNED NOT NULL,
            event_type VARCHAR(50) NOT NULL,
            event_category VARCHAR(50) DEFAULT '',
            event_label VARCHAR(255) DEFAULT '',
            event_value VARCHAR(255) DEFAULT '',
            event_data LONGTEXT NULL,
            ip_address VARCHAR(45) DEFAULT '',
            user_agent VARCHAR(255) DEFAULT '',
            referer_url VARCHAR(255) DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY contact_event (contact_id, event_type, created_at),
            KEY event_type (event_type),
            KEY created_at (created_at)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createCampaignsTable(): void
    {
        $tableName = $this->tablePrefix . 'campaigns';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            name VARCHAR(200) NOT NULL,
            description TEXT NULL,
            campaign_type VARCHAR(50) DEFAULT 'regular',
            status VARCHAR(20) DEFAULT 'draft',
            subject VARCHAR(255) DEFAULT '',
            preview_text VARCHAR(255) DEFAULT '',
            from_name VARCHAR(100) DEFAULT '',
            from_email VARCHAR(255) DEFAULT '',
            reply_to VARCHAR(255) DEFAULT '',
            email_provider_id BIGINT UNSIGNED NULL,
            email_content LONGTEXT NULL,
            content_mode VARCHAR(20) DEFAULT 'html',
            json_structure LONGTEXT NULL,
            template_id BIGINT UNSIGNED NULL,
            target_segments LONGTEXT NULL,
            target_lists LONGTEXT NULL,
            target_tags LONGTEXT NULL,
            exclude_segments LONGTEXT NULL,
            exclude_lists LONGTEXT NULL,
            exclude_tags LONGTEXT NULL,
            settings LONGTEXT NULL,
            stats LONGTEXT NULL,
            ab_testing_enabled TINYINT(1) DEFAULT 0,
            ab_test_winner_metric VARCHAR(20) DEFAULT 'open_rate',
            ab_test_sample_size INT DEFAULT 50,
            scheduled_at DATETIME NULL,
            sent_at DATETIME NULL,
            created_by BIGINT UNSIGNED NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY status (status),
            KEY campaign_type (campaign_type),
            KEY scheduled_at (scheduled_at),
            KEY created_by (created_by),
            KEY ab_testing_enabled (ab_testing_enabled),
            KEY email_provider_id (email_provider_id)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createCampaignEmailsTable(): void
    {
        $tableName = $this->tablePrefix . 'campaign_emails';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            campaign_id BIGINT UNSIGNED NOT NULL,
            contact_id BIGINT UNSIGNED NOT NULL,
            email VARCHAR(255) NOT NULL,
            ab_variant_id BIGINT UNSIGNED NULL,
            status VARCHAR(20) DEFAULT 'queued',
            tracking_token VARCHAR(64) NULL,
            sent_at DATETIME NULL,
            opened_at DATETIME NULL,
            clicked_at DATETIME NULL,
            bounced_at DATETIME NULL,
            unsubscribed_at DATETIME NULL,
            open_count INT DEFAULT 0,
            click_count INT DEFAULT 0,
            user_agent VARCHAR(255) NULL,
            ip_address VARCHAR(45) NULL,
            device_type VARCHAR(20) NULL,
            browser VARCHAR(50) NULL,
            os VARCHAR(50) NULL,
            country VARCHAR(2) NULL,
            region VARCHAR(100) NULL,
            city VARCHAR(100) NULL,
            error_message TEXT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY campaign_contact (campaign_id, contact_id),
            KEY contact_id (contact_id),
            KEY ab_variant_id (ab_variant_id),
            KEY status (status),
            KEY tracking_token (tracking_token),
            KEY campaign_status (campaign_id, status)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createCampaignLinksTable(): void
    {
        $tableName = $this->tablePrefix . 'campaign_links';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            campaign_id BIGINT UNSIGNED NOT NULL,
            original_url TEXT NOT NULL,
            tracking_url VARCHAR(255) NOT NULL,
            unique_clicks INT DEFAULT 0,
            total_clicks INT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY campaign_id (campaign_id),
            KEY tracking_url (tracking_url)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createAutomationsTable(): void
    {
        $tableName = $this->tablePrefix . 'automations';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            name VARCHAR(200) NOT NULL,
            description TEXT NULL,
            status VARCHAR(20) DEFAULT 'draft',
            trigger_type VARCHAR(50) NOT NULL,
            trigger_config LONGTEXT NULL,
            entry_conditions LONGTEXT NULL,
            settings LONGTEXT NULL,
            stats LONGTEXT NULL,
            total_enrolled INT DEFAULT 0,
            active_contacts INT DEFAULT 0,
            completed_contacts INT DEFAULT 0,
            conversion_rate DECIMAL(5,2) DEFAULT 0.00,
            created_by BIGINT UNSIGNED NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            last_triggered_at DATETIME NULL,
            PRIMARY KEY (id),
            KEY status (status),
            KEY trigger_type (trigger_type),
            KEY created_by (created_by),
            KEY last_triggered_at (last_triggered_at)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createAutomationStepsTable(): void
    {
        $tableName = $this->tablePrefix . 'automation_steps';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            automation_id BIGINT UNSIGNED NOT NULL,
            step_order INT NOT NULL,
            step_type VARCHAR(50) NOT NULL,
            label VARCHAR(191) NULL,
            parent_step_id BIGINT UNSIGNED NULL,
            branch_type VARCHAR(20) NULL,
            action_type VARCHAR(50) NULL,
            action_config LONGTEXT NULL,
            condition_type VARCHAR(50) NULL,
            condition_config LONGTEXT NULL,
            delay_type VARCHAR(20) NULL,
            delay_value VARCHAR(50) NULL,
            position_x INT DEFAULT 0,
            position_y INT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY automation_id (automation_id),
            KEY step_order (step_order),
            KEY parent_step_id (parent_step_id),
            KEY step_type (step_type)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createAutomationLogsTable(): void
    {
        $tableName = $this->tablePrefix . 'automation_logs';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            automation_id BIGINT UNSIGNED NOT NULL,
            contact_id BIGINT UNSIGNED NOT NULL,
            step_id BIGINT UNSIGNED NULL,
            action VARCHAR(50) NOT NULL,
            action_result VARCHAR(20) DEFAULT 'success',
            details LONGTEXT NULL,
            execution_time_ms INT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY automation_contact (automation_id, contact_id),
            KEY step_id (step_id),
            KEY action (action),
            KEY action_result (action_result),
            KEY created_at (created_at)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createAutomationQueueTable(): void
    {
        $tableName = $this->tablePrefix . 'automation_queue';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            automation_id BIGINT UNSIGNED NOT NULL,
            contact_id BIGINT UNSIGNED NOT NULL,
            current_step_id BIGINT UNSIGNED NULL,
            next_step_id BIGINT UNSIGNED NULL,
            scheduled_for DATETIME NOT NULL,
            status VARCHAR(20) DEFAULT 'pending',
            context_data LONGTEXT NULL,
            attempts INT DEFAULT 0,
            last_error TEXT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY automation_contact (automation_id, contact_id),
            KEY status_scheduled (status, scheduled_for),
            KEY scheduled_for (scheduled_for),
            KEY current_step_id (current_step_id),
            KEY next_step_id (next_step_id)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createAutomationContactsTable(): void
    {
        $tableName = $this->tablePrefix . 'automation_contacts';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            automation_id BIGINT UNSIGNED NOT NULL,
            contact_id BIGINT UNSIGNED NOT NULL,
            status VARCHAR(20) DEFAULT 'active',
            current_step_id BIGINT UNSIGNED NULL,
            enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME NULL,
            exited_at DATETIME NULL,
            times_enrolled INT DEFAULT 1,
            context_data LONGTEXT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY automation_contact (automation_id, contact_id),
            KEY contact_id (contact_id),
            KEY status (status),
            KEY enrolled_at (enrolled_at),
            KEY current_step_id (current_step_id)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createSegmentsTable(): void
    {
        $tableName = $this->tablePrefix . 'segments';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            name VARCHAR(200) NOT NULL,
            description TEXT NULL,
            type VARCHAR(20) DEFAULT 'dynamic',
            conditions LONGTEXT NOT NULL,
            match_type VARCHAR(10) DEFAULT 'all',
            contact_count INT DEFAULT 0,
            last_calculated DATETIME NULL,
            cache_enabled TINYINT(1) DEFAULT 1,
            auto_refresh TINYINT(1) DEFAULT 1,
            created_by BIGINT UNSIGNED NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY type (type),
            KEY created_by (created_by),
            KEY last_calculated (last_calculated)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createSegmentContactsTable(): void
    {
        $tableName = $this->tablePrefix . 'segment_contacts';

        $sql = "CREATE TABLE {$tableName} (
            segment_id BIGINT UNSIGNED NOT NULL,
            contact_id BIGINT UNSIGNED NOT NULL,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (segment_id, contact_id),
            KEY contact_id (contact_id),
            KEY added_at (added_at)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createNotesTable(): void
    {
        $tableName = $this->tablePrefix . 'notes';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            contact_id BIGINT UNSIGNED NOT NULL,
            content TEXT NOT NULL,
            created_by BIGINT UNSIGNED NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY contact_id (contact_id),
            KEY created_at (created_at)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createCustomFieldsTable(): void
    {
        $tableName = $this->tablePrefix . 'custom_fields';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            field_key VARCHAR(50) NOT NULL,
            field_label VARCHAR(100) NOT NULL,
            field_type VARCHAR(50) NOT NULL,
            field_options LONGTEXT NULL,
            field_default VARCHAR(255) NULL,
            field_required TINYINT(1) DEFAULT 0,
            field_order INT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY field_key (field_key)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createCampaignVariantsTable(): void
    {
        $tableName = $this->tablePrefix . 'campaign_variants';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            campaign_id BIGINT UNSIGNED NOT NULL,
            variant_type VARCHAR(20) DEFAULT 'subject',
            variant_label VARCHAR(50) NOT NULL,
            test_percentage INT DEFAULT 50,
            subject VARCHAR(255) DEFAULT '',
            email_content LONGTEXT NULL,
            from_name VARCHAR(100) DEFAULT '',
            sent_count INT DEFAULT 0,
            open_count INT DEFAULT 0,
            click_count INT DEFAULT 0,
            open_rate DECIMAL(5,2) DEFAULT 0.00,
            click_rate DECIMAL(5,2) DEFAULT 0.00,
            is_winner TINYINT(1) DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY campaign_id (campaign_id),
            KEY variant_type (variant_type),
            KEY is_winner (is_winner)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createIncomingWebhooksTable(): void
    {
        $tableName = $this->tablePrefix . 'incoming_webhooks';

        $sql = "CREATE TABLE {$tableName} (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            webhook_name varchar(255) NOT NULL,
            webhook_key varchar(100) NOT NULL,
            description text NULL,
            default_lists longtext NULL,
            default_tags longtext NULL,
            allowed_actions longtext NULL,
            status varchar(20) NOT NULL DEFAULT 'active',
            ip_whitelist text NULL,
            total_requests int(11) NOT NULL DEFAULT 0,
            last_used_at datetime NULL,
            created_at datetime NOT NULL,
            updated_at datetime NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY webhook_key (webhook_key),
            KEY status (status),
            KEY created_at (created_at)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createWebhookLogsTable(): void
    {
        $tableName = $this->tablePrefix . 'webhook_logs';

        $sql = "CREATE TABLE {$tableName} (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            webhook_id bigint(20) UNSIGNED NOT NULL,
            request_url varchar(500) NULL,
            request_method varchar(10) NULL,
            request_headers longtext NULL,
            request_payload longtext NULL,
            response_status int(11) NULL,
            response_body longtext NULL,
            ip_address varchar(45) NULL,
            processing_time float NULL,
            error_message text NULL,
            created_at datetime NOT NULL,
            PRIMARY KEY  (id),
            KEY webhook_id (webhook_id),
            KEY created_at (created_at),
            KEY response_status (response_status)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createSmartLinksTable(): void
    {
        $tableName = $this->tablePrefix . 'smart_links';

        $sql = "CREATE TABLE {$tableName} (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            name varchar(200) NOT NULL,
            description text NULL,
            link_type varchar(50) DEFAULT 'general',
            original_url text NOT NULL,
            tracking_code varchar(100) NOT NULL,
            add_tags longtext NULL,
            remove_tags longtext NULL,
            add_lists longtext NULL,
            remove_lists longtext NULL,
            trigger_automations longtext NULL,
            redirect_url text NOT NULL,
            redirect_type varchar(20) DEFAULT 'permanent',
            total_clicks int(11) DEFAULT 0,
            unique_clicks int(11) DEFAULT 0,
            last_clicked_at datetime NULL,
            status varchar(20) DEFAULT 'active',
            expires_at datetime NULL,
            settings longtext NULL,
            created_by bigint(20) UNSIGNED NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            UNIQUE KEY tracking_code (tracking_code),
            KEY status (status),
            KEY link_type (link_type),
            KEY created_by (created_by),
            KEY created_at (created_at)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createSmartLinkClicksTable(): void
    {
        $tableName = $this->tablePrefix . 'smart_link_clicks';

        $sql = "CREATE TABLE {$tableName} (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            smart_link_id bigint(20) UNSIGNED NOT NULL,
            contact_id bigint(20) UNSIGNED NULL,
            clicked_at datetime DEFAULT CURRENT_TIMESTAMP,
            ip_address varchar(45) DEFAULT '',
            user_agent varchar(255) DEFAULT '',
            referer_url varchar(500) DEFAULT '',
            country varchar(2) DEFAULT '',
            region varchar(100) DEFAULT '',
            city varchar(100) DEFAULT '',
            device_type varchar(20) DEFAULT '',
            browser varchar(50) DEFAULT '',
            os varchar(50) DEFAULT '',
            actions_performed longtext NULL,
            PRIMARY KEY  (id),
            KEY smart_link_id (smart_link_id),
            KEY contact_id (contact_id),
            KEY clicked_at (clicked_at),
            KEY ip_address (ip_address)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createEmailTemplatesTable(): void
    {
        $tableName = $this->tablePrefix . 'email_templates';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            name VARCHAR(200) NOT NULL,
            description TEXT NULL,
            thumbnail_url VARCHAR(500) NULL,
            template_type VARCHAR(50) DEFAULT 'custom',
            html_content LONGTEXT NOT NULL,
            json_structure LONGTEXT NULL,
            is_favorite TINYINT(1) DEFAULT 0,
            usage_count INT DEFAULT 0,
            last_used_at DATETIME NULL,
            created_by BIGINT UNSIGNED NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY template_type (template_type),
            KEY created_by (created_by),
            KEY is_favorite (is_favorite),
            KEY usage_count (usage_count)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createEmailLogsTable(): void
    {
        $tableName = $this->tablePrefix . 'email_logs';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            email_type VARCHAR(50) NOT NULL,
            campaign_id BIGINT UNSIGNED NULL,
            automation_id BIGINT UNSIGNED NULL,
            contact_id BIGINT UNSIGNED NULL,
            email_to VARCHAR(255) NOT NULL,
            email_from VARCHAR(255) NULL,
            subject VARCHAR(500) NOT NULL,
            body_html LONGTEXT NULL,
            body_text LONGTEXT NULL,
            status VARCHAR(20) DEFAULT 'queued',
            provider VARCHAR(50) NULL,
            tracking_token VARCHAR(100) NULL,
            error_message TEXT NULL,
            metadata LONGTEXT NULL,
            queued_at DATETIME NULL,
            sent_at DATETIME NULL,
            delivered_at DATETIME NULL,
            bounced_at DATETIME NULL,
            opened_at DATETIME NULL,
            clicked_at DATETIME NULL,
            open_count INT DEFAULT 0,
            click_count INT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY tracking_token (tracking_token),
            KEY email_type (email_type),
            KEY status (status),
            KEY contact_id (contact_id),
            KEY campaign_id (campaign_id),
            KEY automation_id (automation_id),
            KEY created_at (created_at),
            KEY sent_at (sent_at),
            KEY email_to (email_to),
            KEY provider (provider)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }

    private function createEmailProvidersTable(): void
    {
        $tableName = $this->tablePrefix . 'email_providers';

        $sql = "CREATE TABLE {$tableName} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            name VARCHAR(200) NOT NULL,
            provider_type VARCHAR(20) NOT NULL,
            sender_name VARCHAR(100) DEFAULT '',
            sender_email VARCHAR(255) NOT NULL,
            reply_to VARCHAR(255) DEFAULT '',
            region VARCHAR(50) DEFAULT '',
            credentials LONGTEXT NULL,
            settings LONGTEXT NULL,
            verified_senders LONGTEXT NULL,
            is_default TINYINT(1) DEFAULT 0,
            status VARCHAR(20) DEFAULT 'active',
            created_by BIGINT UNSIGNED NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY provider_type (provider_type),
            KEY status (status),
            KEY is_default (is_default),
            KEY sender_email (sender_email)
        ) {$this->charsetCollate};";

        dbDelta($sql);
    }
}
