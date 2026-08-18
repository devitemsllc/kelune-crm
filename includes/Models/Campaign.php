<?php

declare(strict_types=1);

namespace KeluneCRM\Models;

class Campaign
{
    /** @var int|null */
    public $id = null;

    /** @var string|null */
    public $name = null;

    /** @var string|null */
    public $description = null;

    /** @var string|null */
    public $campaign_type = null;

    /** @var string|null */
    public $status = null;

    /** @var string|null */
    public $subject = null;

    /** @var string|null */
    public $preview_text = null;

    /** @var string|null */
    public $from_name = null;

    /** @var string|null */
    public $from_email = null;

    /** @var string|null */
    public $reply_to = null;

    /** @var int|null */
    public $email_provider_id = null;

    /** @var string|null */
    public $email_content = null;

    /** @var string|null */
    public $content_mode = null;

    /** @var string|array<string, mixed>|null */
    public $json_structure = null;

    /** @var int|null */
    public $template_id = null;

    /** @var string|array<int|string>|null */
    public $target_segments = null;

    /** @var string|array<int|string>|null */
    public $target_lists = null;

    /** @var string|array<int|string>|null */
    public $target_tags = null;

    /** @var string|array<int|string>|null */
    public $exclude_segments = null;

    /** @var string|array<int|string>|null */
    public $exclude_lists = null;

    /** @var string|array<int|string>|null */
    public $exclude_tags = null;

    /** @var string|array<string, mixed>|null */
    public $settings = null;

    /** @var string|array<string, mixed>|null */
    public $stats = null;

    /** @var string|null */
    public $scheduled_at = null;

    /** @var string|null */
    public $sent_at = null;

    /** @var int|null */
    public $created_by = null;

    /** @var string|null */
    public $created_at = null;

    /** @var string|null */
    public $updated_at = null;

    /** @var int|bool|null */
    public $ab_testing_enabled = null;

    /** @var string|null */
    public $ab_test_winner_metric = null;

    /** @var int|null */
    public $ab_test_sample_size = null;

    /** @param array<string, mixed> $data */
    public function __construct($data = [])
    {
        foreach ($data as $key => $value) {
            if (property_exists($this, $key)) {
                $this->$key = $value;
            }
        }

        $this->id = isset($this->id) ? (int) $this->id : null;
        $this->template_id = isset($this->template_id) ? (int) $this->template_id : null;
        $this->created_by = isset($this->created_by) ? (int) $this->created_by : null;
        $this->email_provider_id = isset($data['email_provider_id'])
            ? (int) $data['email_provider_id']
            : null;

        // Decode the stored block tree so the visual builder receives an object.
        if (is_string($this->json_structure)) {
            $decoded = json_decode($this->json_structure, true);
            $this->json_structure = is_array($decoded) ? $decoded : null;
        }
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'campaign_type' => $this->campaign_type,
            'status' => $this->status,
            'subject' => $this->subject,
            'preview_text' => $this->preview_text,
            'from_name' => $this->from_name,
            'from_email' => $this->from_email,
            'reply_to' => $this->reply_to,
            'email_provider_id' => $this->email_provider_id,
            'email_content' => $this->email_content,
            'content_mode' => $this->content_mode ?? 'html',
            'json_structure' => $this->json_structure,
            'template_id' => $this->template_id,
            'target_segments' => $this->getTargetSegmentsArray(),
            'target_lists' => $this->getTargetListsArray(),
            'target_tags' => $this->getTargetTagsArray(),
            'exclude_segments' => $this->getExcludeSegmentsArray(),
            'exclude_lists' => $this->getExcludeListsArray(),
            'exclude_tags' => $this->getExcludeTagsArray(),
            'settings' => $this->getSettingsArray(),
            'stats' => $this->getStatsArray(),
            'scheduled_at' => $this->scheduled_at,
            'sent_at' => $this->sent_at,
            'created_by' => $this->created_by,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'ab_testing_enabled' => $this->ab_testing_enabled,
            'ab_test_winner_metric' => $this->ab_test_winner_metric,
            'ab_test_sample_size' => $this->ab_test_sample_size,
        ];
    }

    /** @return array<int|string> */
    public function getTargetSegmentsArray(): array
    {
        if (is_string($this->target_segments)) {
            return json_decode($this->target_segments, true) ?? [];
        }
        return $this->target_segments ?? [];
    }

    /** @return array<int|string> */
    public function getTargetListsArray(): array
    {
        if (is_string($this->target_lists)) {
            return json_decode($this->target_lists, true) ?? [];
        }
        return $this->target_lists ?? [];
    }

    /** @return array<int|string> */
    public function getTargetTagsArray(): array
    {
        if (is_string($this->target_tags)) {
            return json_decode($this->target_tags, true) ?? [];
        }
        return $this->target_tags ?? [];
    }

    /** @return array<int|string> */
    public function getExcludeSegmentsArray(): array
    {
        if (is_string($this->exclude_segments)) {
            return json_decode($this->exclude_segments, true) ?? [];
        }
        return $this->exclude_segments ?? [];
    }

    /** @return array<int|string> */
    public function getExcludeListsArray(): array
    {
        if (is_string($this->exclude_lists)) {
            return json_decode($this->exclude_lists, true) ?? [];
        }
        return $this->exclude_lists ?? [];
    }

    /** @return array<int|string> */
    public function getExcludeTagsArray(): array
    {
        if (is_string($this->exclude_tags)) {
            return json_decode($this->exclude_tags, true) ?? [];
        }
        return $this->exclude_tags ?? [];
    }

    /** @return array<string, mixed> */
    public function getSettingsArray(): array
    {
        if (is_string($this->settings)) {
            return json_decode($this->settings, true) ?? [];
        }
        return $this->settings ?? [];
    }

    /** @return array<string, mixed> */
    public function getStatsArray(): array
    {
        if (is_string($this->stats)) {
            return json_decode($this->stats, true) ?? [];
        }
        return $this->stats ?? [];
    }

    public function isDraft(): bool
    {
        return $this->status === 'draft';
    }

    public function isScheduled(): bool
    {
        return $this->status === 'scheduled';
    }

    public function isSending(): bool
    {
        return $this->status === 'sending';
    }

    public function isPaused(): bool
    {
        return $this->status === 'paused';
    }
}
