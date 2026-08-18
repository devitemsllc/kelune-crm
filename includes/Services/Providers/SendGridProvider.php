<?php

declare(strict_types=1);

namespace KeluneCRM\Services\Providers;

use PHPMailer\PHPMailer\PHPMailer;

class SendGridProvider implements EmailProviderInterface
{
    use ExtractsMailParts;

    /**
     * Transport the assembled message via the SendGrid v3 JSON API.
     *
     * Re-maps the PHPMailer instance into SendGrid's schema: a single
     * personalization carrying To/Cc/Bcc, the From/Reply-To objects, the
     * plain-text and HTML content parts, base64 attachments and any custom
     * headers.
     *
     * @param array<string, mixed> $config
     * @return bool|\WP_Error
     */
    public function send(PHPMailer $phpmailer, array $config = []): bool|\WP_Error
    {
        $api_key = $config['sendgrid_api_key'] ?? '';
        $from_email = trim((string) $phpmailer->From);

        if (empty($api_key) || $from_email === '' || !is_email($from_email)) {
            return new \WP_Error(
                'invalid_config',
                __('SendGrid API key and from email are required', 'kelune-crm')
            );
        }

        // Only include a display name when non-empty — SendGrid rejects an empty
        // from.name string.
        $from = ['email' => $from_email];
        if ((string) $phpmailer->FromName !== '') {
            $from['name'] = (string) $phpmailer->FromName;
        }

        $personalization = ['to' => $this->recipients($phpmailer->getToAddresses())];
        $cc = $this->recipients($phpmailer->getCcAddresses());
        if ($cc !== []) {
            $personalization['cc'] = $cc;
        }
        $bcc = $this->recipients($phpmailer->getBccAddresses());
        if ($bcc !== []) {
            $personalization['bcc'] = $bcc;
        }

        // SendGrid requires the plain-text part before the HTML part.
        $bodies = $this->bodies($phpmailer);
        $content = [];
        if ($bodies['text'] !== '') {
            $content[] = ['type' => 'text/plain', 'value' => $bodies['text']];
        }
        if ($bodies['html'] !== '') {
            $content[] = ['type' => 'text/html', 'value' => $bodies['html']];
        }
        if ($content === []) {
            $content[] = ['type' => 'text/html', 'value' => $phpmailer->Body];
        }

        $payload = [
            'personalizations' => [$personalization],
            'from' => $from,
            'subject' => (string) $phpmailer->Subject,
            'content' => $content,
        ];

        $reply_to = $this->firstReplyTo($phpmailer);
        if ($reply_to !== null) {
            $payload['reply_to'] = ['email' => $reply_to['email']];
            if ($reply_to['name'] !== '') {
                $payload['reply_to']['name'] = $reply_to['name'];
            }
        }

        $attachments = [];
        foreach ($this->attachmentList($phpmailer) as $attachment) {
            $attachments[] = [
                'content' => base64_encode($attachment['content']),
                'filename' => $attachment['name'],
                'type' => $attachment['type'],
                'disposition' => $attachment['disposition'] !== '' ? $attachment['disposition'] : 'attachment',
            ];
        }
        if ($attachments !== []) {
            $payload['attachments'] = $attachments;
        }

        $custom_headers = $this->customHeaderList($phpmailer);
        if ($custom_headers !== []) {
            $payload['headers'] = $custom_headers;
        }

        $response = wp_remote_post('https://api.sendgrid.com/v3/mail/send', [
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode($payload) ?: '',
            'timeout' => 30,
        ]);

        if (is_wp_error($response)) {
            return $response;
        }

        $status_code = wp_remote_retrieve_response_code($response);

        if ($status_code !== 202) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            $error_message = is_array($body) && isset($body['errors'][0]['message'])
                ? (string) $body['errors'][0]['message']
                : __('Unknown error', 'kelune-crm');

            return new \WP_Error(
                'sendgrid_error',
                /* translators: %s: error message returned by SendGrid */
                sprintf(__('SendGrid API error: %s', 'kelune-crm'), $error_message)
            );
        }

        return true;
    }

    /**
     * Map a PHPMailer address list into SendGrid recipient objects, omitting
     * empty display names.
     *
     * @param array<int, array<int, string>> $addresses
     * @return array<int, array{email: string, name?: string}>
     */
    private function recipients(array $addresses): array
    {
        $out = [];
        foreach ($this->addressList($addresses) as $address) {
            $recipient = ['email' => $address['email']];
            if ($address['name'] !== '') {
                $recipient['name'] = $address['name'];
            }
            $out[] = $recipient;
        }

        return $out;
    }

    /**
     * Test SendGrid connection
     *
     * @param array<string, mixed> $config
     * @return bool|\WP_Error
     */
    public function testConnection(array $config): bool|\WP_Error
    {
        $api_key = $config['sendgrid_api_key'] ?? '';

        if (empty($api_key)) {
            return new \WP_Error(
                'invalid_config',
                __('SendGrid API key is required', 'kelune-crm')
            );
        }

        // Test API key by verifying it with SendGrid API
        $response = wp_remote_get('https://api.sendgrid.com/v3/user/profile', [
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
            ],
            'timeout' => 10,
        ]);

        if (is_wp_error($response)) {
            return new \WP_Error(
                'connection_error',
                /* translators: %s: connection error message */
                sprintf(__('Connection error: %s', 'kelune-crm'), $response->get_error_message())
            );
        }

        $status_code = wp_remote_retrieve_response_code($response);

        if ($status_code !== 200) {
            return new \WP_Error(
                'invalid_api_key',
                __('Invalid SendGrid API key', 'kelune-crm')
            );
        }

        return true;
    }

    /**
     * Fetch verified single-sender identities from SendGrid. Returns the
     * verified From addresses; on any API/permission failure returns an empty
     * list so the caller falls back to allow-with-warning rather than blocking.
     *
     * @param array<string, mixed> $config
     * @return array<int, string>
     */
    public function getVerifiedSenders(array $config): array
    {
        // The connection's bound sender_email is its only implicit sender; extra
        // addresses are registered manually.
        return [];
    }

    /**
     * Get provider name
     *
     * @return string
     */
    public function getName(): string
    {
        return 'SendGrid';
    }
}
