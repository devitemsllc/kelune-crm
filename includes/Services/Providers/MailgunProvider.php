<?php

declare(strict_types=1);

namespace KeluneCRM\Services\Providers;

use PHPMailer\PHPMailer\PHPMailer;

class MailgunProvider implements EmailProviderInterface
{
    use ExtractsMailParts;

    /**
     * Transport the assembled message via the Mailgun HTTP API.
     *
     * Reads the recipients, bodies, attachments and custom headers off the
     * PHPMailer instance and re-maps them into Mailgun's form fields. When
     * attachments are present the request is sent as multipart/form-data
     * (Mailgun only accepts files that way); otherwise a simple form body.
     *
     * @param array<string, mixed> $config
     * @return bool|\WP_Error
     */
    public function send(PHPMailer $phpmailer, array $config = []): bool|\WP_Error
    {
        $api_key = $config['mailgun_api_key'] ?? '';
        $domain = $config['mailgun_domain'] ?? '';
        $region = $config['mailgun_region'] ?? 'us';

        if (empty($api_key) || empty($domain)) {
            return new \WP_Error(
                'invalid_config',
                __('Mailgun API key and domain are required', 'kelune-crm')
            );
        }

        // Determine API endpoint based on region
        $api_url = $region === 'eu'
            ? 'https://api.eu.mailgun.net/v3/'
            : 'https://api.mailgun.net/v3/';

        $bodies = $this->bodies($phpmailer);

        $fields = [
            'from' => $this->formatAddress((string) $phpmailer->FromName, (string) $phpmailer->From),
            'subject' => (string) $phpmailer->Subject,
        ];

        $to = $this->joinAddresses($this->addressList($phpmailer->getToAddresses()));
        if ($to !== '') {
            $fields['to'] = $to;
        }
        $cc = $this->joinAddresses($this->addressList($phpmailer->getCcAddresses()));
        if ($cc !== '') {
            $fields['cc'] = $cc;
        }
        $bcc = $this->joinAddresses($this->addressList($phpmailer->getBccAddresses()));
        if ($bcc !== '') {
            $fields['bcc'] = $bcc;
        }
        if ($bodies['html'] !== '') {
            $fields['html'] = $bodies['html'];
        }
        if ($bodies['text'] !== '') {
            $fields['text'] = $bodies['text'];
        }

        $reply_to = $this->firstReplyTo($phpmailer);
        if ($reply_to !== null) {
            $fields['h:Reply-To'] = $this->formatAddress($reply_to['name'], $reply_to['email']);
        }
        foreach ($this->customHeaderList($phpmailer) as $name => $value) {
            $fields['h:' . $name] = $value;
        }

        $url = $api_url . $domain . '/messages';
        $auth = 'Basic ' . base64_encode('api:' . $api_key);
        $attachments = $this->attachmentList($phpmailer);

        if ($attachments !== []) {
            $boundary = 'cmcg-' . wp_generate_password(24, false);
            $response = wp_remote_post($url, [
                'headers' => [
                    'Authorization' => $auth,
                    'Content-Type' => 'multipart/form-data; boundary=' . $boundary,
                ],
                'body' => $this->buildMultipartBody($fields, $attachments, $boundary),
                'timeout' => 30,
            ]);
        } else {
            $response = wp_remote_post($url, [
                'headers' => ['Authorization' => $auth],
                'body' => $fields,
                'timeout' => 30,
            ]);
        }

        if (is_wp_error($response)) {
            return $response;
        }

        $status_code = wp_remote_retrieve_response_code($response);

        if ($status_code !== 200) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            $error_message = is_array($body) && isset($body['message'])
                ? (string) $body['message']
                : __('Unknown error', 'kelune-crm');

            return new \WP_Error(
                'mailgun_error',
                /* translators: %s: error message returned by Mailgun */
                sprintf(__('Mailgun API error: %s', 'kelune-crm'), $error_message)
            );
        }

        return true;
    }

    /**
     * Join a normalised address list into Mailgun's comma-separated
     * "Name <email>" recipient string.
     *
     * @param array<int, array{email: string, name: string}> $addresses
     */
    private function joinAddresses(array $addresses): string
    {
        $parts = [];
        foreach ($addresses as $address) {
            $parts[] = $this->formatAddress($address['name'], $address['email']);
        }

        return implode(', ', $parts);
    }

    /**
     * Assemble a multipart/form-data body carrying the form fields and file
     * attachments, so Mailgun receives the files as `attachment[N]` parts.
     *
     * @param array<string, string> $fields
     * @param array<int, array{content: string, name: string, type: string, disposition: string}> $attachments
     */
    private function buildMultipartBody(array $fields, array $attachments, string $boundary): string
    {
        $body = '';
        foreach ($fields as $name => $value) {
            $body .= "--$boundary\r\n";
            $body .= 'Content-Disposition: form-data; name="' . $name . "\"\r\n\r\n";
            $body .= $value . "\r\n";
        }

        $index = 0;
        foreach ($attachments as $attachment) {
            $body .= "--$boundary\r\n";
            $body .= 'Content-Disposition: form-data; name="attachment[' . $index . ']"; filename="' . $attachment['name'] . "\"\r\n";
            $body .= 'Content-Type: ' . $attachment['type'] . "\r\n\r\n";
            $body .= $attachment['content'] . "\r\n";
            $index++;
        }

        $body .= "--$boundary--\r\n";

        return $body;
    }

    /**
     * Test Mailgun connection
     *
     * @param array<string, mixed> $config
     * @return bool|\WP_Error
     */
    public function testConnection(array $config): bool|\WP_Error
    {
        $api_key = $config['mailgun_api_key'] ?? '';
        $domain = $config['mailgun_domain'] ?? '';
        $region = $config['mailgun_region'] ?? 'us';

        if (empty($api_key) || empty($domain)) {
            return new \WP_Error(
                'invalid_config',
                __('Mailgun API key and domain are required', 'kelune-crm')
            );
        }

        // Determine API endpoint based on region
        $api_url = $region === 'eu'
            ? 'https://api.eu.mailgun.net/v3/'
            : 'https://api.mailgun.net/v3/';

        // Test API key by getting domain info. The domain-details endpoint is
        // /v3/domains/<domain> — hitting /v3/<domain> directly returns 404.
        $response = wp_remote_get($api_url . 'domains/' . $domain, [
            'headers' => [
                'Authorization' => 'Basic ' . base64_encode('api:' . $api_key),
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
                'invalid_credentials',
                __('Invalid Mailgun API key or domain', 'kelune-crm')
            );
        }

        return true;
    }

    /**
     * Build an RFC 5322 address. A display name containing specials (comma,
     * angle brackets, quotes) must be quoted or Mailgun will mis-parse it into
     * multiple addresses.
     *
     * @param string $name
     * @param string $email
     * @return string
     */
    private function formatAddress(string $name, string $email): string
    {
        $name = trim($name);

        if ($name === '') {
            return $email;
        }

        if (preg_match('/[,<>"@]/', $name)) {
            $name = '"' . str_replace('"', '', $name) . '"';
        }

        return $name . ' <' . $email . '>';
    }

    /**
     * Mailgun sends from any address on the configured domain, so the domain
     * itself is the verified identity. A custom From is valid when its domain
     * matches.
     *
     * @param array<string, mixed> $config
     * @return array<int, string>
     */
    public function getVerifiedSenders(array $config): array
    {
        // Mailgun exposes no verified-identity list here, so the connection's
        // bound sender_email is its only implicit sender; extra addresses are
        // added manually.
        return [];
    }

    /**
     * Get provider name
     *
     * @return string
     */
    public function getName(): string
    {
        return 'Mailgun';
    }
}
