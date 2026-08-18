<?php

declare(strict_types=1);

namespace KeluneCRM\Models;

class EmailLog
{
    /** @var int|null */
    public $id;

    /** @var string|null */
    public $email_type;          // campaign, automation, test, transactional

    /** @var int|null */
    public $campaign_id;          // nullable

    /** @var int|null */
    public $automation_id;        // nullable

    /** @var int|null */
    public $contact_id;           // nullable

    /** @var string|null */
    public $email_to;

    /** @var string|null */
    public $email_from;

    /** @var string|null */
    public $subject;

    /** @var string|null */
    public $body_html;

    /** @var string|null */
    public $body_text;            // nullable

    /** @var string|null */
    public $status;               // queued, sending, sent, failed, cancelled, bounced, delivered, opened, clicked

    /** @var string|null */
    public $provider;             // smtp, sendgrid, mailgun, ses, wp_mail

    /** @var string|null */
    public $tracking_token;       // nullable

    /** @var string|null */
    public $error_message;        // nullable

    /** @var string|array<string, mixed>|null */
    public $metadata;             // JSON (headers, attachments, context)

    /** @var string|null */
    public $queued_at;

    /** @var string|null */
    public $sent_at;

    /** @var string|null */
    public $delivered_at;

    /** @var string|null */
    public $bounced_at;

    /** @var string|null */
    public $opened_at;

    /** @var string|null */
    public $clicked_at;

    /** @var int|null */
    public $open_count;

    /** @var int|null */
    public $click_count;

    /** @var string|null */
    public $created_at;

    /** @var string|null */
    public $updated_at;

    /** @param array<string, mixed> $data */
    public function __construct($data = [])
    {
        if (empty($data)) {
            return;
        }

        $this->id = isset($data['id']) ? (int) $data['id'] : null;
        $this->email_type = $data['email_type'] ?? 'transactional';
        $this->campaign_id = isset($data['campaign_id']) ? (int) $data['campaign_id'] : null;
        $this->automation_id = isset($data['automation_id']) ? (int) $data['automation_id'] : null;
        $this->contact_id = isset($data['contact_id']) ? (int) $data['contact_id'] : null;
        $this->email_to = $data['email_to'] ?? '';
        $this->email_from = $data['email_from'] ?? '';
        $this->subject = $data['subject'] ?? '';
        $this->body_html = $data['body_html'] ?? '';
        $this->body_text = $data['body_text'] ?? null;
        $this->status = $data['status'] ?? 'queued';
        $this->provider = $data['provider'] ?? null;
        $this->tracking_token = $data['tracking_token'] ?? null;
        $this->error_message = $data['error_message'] ?? null;
        $this->metadata = $data['metadata'] ?? null;
        $this->queued_at = $data['queued_at'] ?? null;
        $this->sent_at = $data['sent_at'] ?? null;
        $this->delivered_at = $data['delivered_at'] ?? null;
        $this->bounced_at = $data['bounced_at'] ?? null;
        $this->opened_at = $data['opened_at'] ?? null;
        $this->clicked_at = $data['clicked_at'] ?? null;
        $this->open_count = isset($data['open_count']) ? (int) $data['open_count'] : 0;
        $this->click_count = isset($data['click_count']) ? (int) $data['click_count'] : 0;
        $this->created_at = $data['created_at'] ?? null;
        $this->updated_at = $data['updated_at'] ?? null;
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'email_type' => $this->email_type,
            'campaign_id' => $this->campaign_id,
            'automation_id' => $this->automation_id,
            'contact_id' => $this->contact_id,
            'email_to' => $this->email_to,
            'email_from' => $this->email_from,
            'subject' => $this->subject,
            'body_html' => $this->body_html,
            'body_text' => $this->body_text,
            'status' => $this->status,
            'provider' => $this->provider,
            'tracking_token' => $this->tracking_token,
            'error_message' => $this->error_message,
            'metadata' => $this->metadata,
            'queued_at' => $this->queued_at,
            'sent_at' => $this->sent_at,
            'delivered_at' => $this->delivered_at,
            'bounced_at' => $this->bounced_at,
            'opened_at' => $this->opened_at,
            'clicked_at' => $this->clicked_at,
            'open_count' => $this->open_count,
            'click_count' => $this->click_count,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    /** @return array<string, mixed> */
    public function getMetadata(): array
    {
        if (empty($this->metadata)) {
            return [];
        }

        if (is_array($this->metadata)) {
            return $this->metadata;
        }

        $decoded = json_decode($this->metadata, true);
        return is_array($decoded) ? $decoded : [];
    }
}
