<?php

declare(strict_types=1);

namespace KeluneCRM\Services\Providers;

use PHPMailer\PHPMailer\PHPMailer;

class SESProvider implements EmailProviderInterface
{
    /**
     * Transport the assembled message via the Amazon SES HTTP API.
     *
     * @param array<string, mixed> $config
     * @return bool|\WP_Error
     */
    public function send(PHPMailer $phpmailer, array $config = []): bool|\WP_Error
    {
        $access_key = $config['ses_access_key_id'] ?? '';
        $secret_key = $config['ses_secret_access_key'] ?? '';
        $region = $config['ses_region'] ?? 'us-east-1';

        if (empty($access_key) || empty($secret_key)) {
            return new \WP_Error(
                'invalid_config',
                __('Amazon SES access key and secret key are required', 'kelune-crm')
            );
        }

        // Let PHPMailer assemble the full MIME message (From, Reply-To,
        // To/Cc/Bcc, HTML + plain-text parts, attachments and custom headers),
        // then hand SES the raw message via SendRawEmail. This is why SES honors
        // attachments and multiple recipients — the QueryAPI SendEmail action
        // could not. The recipients and sender are read by SES from the MIME
        // headers, so no Destination/Source params are needed.
        try {
            $phpmailer->preSend();
            $raw_message = $phpmailer->getSentMIMEMessage();
        } catch (\PHPMailer\PHPMailer\Exception $e) {
            return new \WP_Error(
                'ses_build_failed',
                /* translators: %s: message-assembly error */
                sprintf(__('Failed to assemble message for Amazon SES: %s', 'kelune-crm'), $e->getMessage())
            );
        }

        $endpoint = $this->apiEndpoint($region);
        $timestamp = gmdate('Ymd\THis\Z');
        $date = gmdate('Ymd');

        $params = [
            'Action' => 'SendRawEmail',
            'RawMessage.Data' => base64_encode($raw_message),
        ];

        $query_string = http_build_query($params);

        $host = $this->apiHost($region);
        $signature = $this->signRequest($access_key, $secret_key, 'POST', $host, $query_string, $region, $timestamp, $date);

        $response = wp_remote_post($endpoint, [
            'headers' => [
                'Authorization' => $signature,
                'X-Amz-Date' => $timestamp,
                'Content-Type' => 'application/x-www-form-urlencoded',
            ],
            'body' => $query_string,
            'timeout' => 30,
        ]);

        if (is_wp_error($response)) {
            return $response;
        }

        $status_code = wp_remote_retrieve_response_code($response);

        if ($status_code !== 200) {
            $body = wp_remote_retrieve_body($response);
            $message = $this->parseErrorMessage($body);

            return new \WP_Error(
                'ses_error',
                $message !== ''
                    /* translators: %s: error message returned by Amazon SES */
                    ? sprintf(__('Amazon SES error: %s', 'kelune-crm'), $message)
                    /* translators: %s: error message returned by Amazon SES */
                    : sprintf(__('Amazon SES error: %s', 'kelune-crm'), $body)
            );
        }

        return true;
    }

    /**
     * Test Amazon SES connection
     *
     * @param array<string, mixed> $config
     * @return bool|\WP_Error
     */
    public function testConnection(array $config): bool|\WP_Error
    {
        $access_key = $config['ses_access_key_id'] ?? '';
        $secret_key = $config['ses_secret_access_key'] ?? '';
        $region = $config['ses_region'] ?? 'us-east-1';

        if (empty($access_key) || empty($secret_key)) {
            return new \WP_Error(
                'invalid_config',
                __('Amazon SES access key and secret key are required', 'kelune-crm')
            );
        }

        // Test connection by getting send quota
        $endpoint = $this->apiEndpoint($region);
        $timestamp = gmdate('Ymd\THis\Z');
        $date = gmdate('Ymd');

        $params = ['Action' => 'GetSendQuota'];
        $query_string = http_build_query($params);

        $host = $this->apiHost($region);
        $signature = $this->signRequest($access_key, $secret_key, 'POST', $host, $query_string, $region, $timestamp, $date);

        $response = wp_remote_post($endpoint, [
            'headers' => [
                'Authorization' => $signature,
                'X-Amz-Date' => $timestamp,
                'Content-Type' => 'application/x-www-form-urlencoded',
            ],
            'body' => $query_string,
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

        if ($status_code === 200) {
            return true;
        }

        $body = wp_remote_retrieve_body($response);
        $error_code = $this->parseErrorCode($body);

        // AWS authenticated the credentials but the IAM user is not allowed to
        // perform GetSendQuota (e.g. an SMTP send-only user). The credentials
        // are valid for sending, so treat this as a successful connection test.
        if (in_array($error_code, ['AccessDenied', 'AccessDeniedException'], true)) {
            return true;
        }

        // Genuine credential failures reported by AWS SigV4 / IAM.
        $credential_errors = [
            'SignatureDoesNotMatch',
            'InvalidClientTokenId',
            'InvalidAccessKeyId',
            'UnrecognizedClientException',
            'IncompleteSignature',
            'MissingAuthenticationToken',
        ];

        if (in_array($error_code, $credential_errors, true)) {
            return new \WP_Error(
                'invalid_credentials',
                __('Invalid Amazon SES credentials', 'kelune-crm')
            );
        }

        // Anything else (throttling, region mismatch, clock skew, …): surface
        // the real AWS error so the cause is visible instead of masked.
        $message = $this->parseErrorMessage($body);

        return new \WP_Error(
            'ses_error',
            $message !== ''
                /* translators: %s: error message returned by Amazon SES */
                ? sprintf(__('Amazon SES error: %s', 'kelune-crm'), $message)
                : __('Invalid Amazon SES credentials', 'kelune-crm')
        );
    }

    /**
     * SES send quota for the Connection Details view (Max 24-hour send, sent in
     * last 24h, max send rate). Returns null when credentials are missing or the
     * lookup fails.
     *
     * @param array<string, mixed> $config
     * @return array{max_24h: int, sent_24h: int, max_rate: float}|null
     */
    public function getSendStats(array $config): ?array
    {
        $access_key = $config['ses_access_key_id'] ?? '';
        $secret_key = $config['ses_secret_access_key'] ?? '';
        $region = $config['ses_region'] ?? 'us-east-1';

        if (empty($access_key) || empty($secret_key)) {
            return null;
        }

        $body = $this->sesApiRequest($access_key, $secret_key, $region, ['Action' => 'GetSendQuota']);
        if ($body === null) {
            return null;
        }

        $value = static function (string $tag) use ($body): float {
            return preg_match('/<' . $tag . '>([\d.]+)<\/' . $tag . '>/', $body, $m) ? (float) $m[1] : 0.0;
        };

        return [
            'max_24h' => (int) $value('Max24HourSend'),
            'sent_24h' => (int) $value('SentLast24Hours'),
            'max_rate' => $value('MaxSendRate'),
        ];
    }

    /**
     * Return the verified sending identities (emails and domains) for this SES
     * account. Used to validate custom From addresses. Returns an empty array
     * when the credentials lack ListIdentities permission or the lookup fails,
     * so callers fall back to allow-with-warning instead of blocking.
     *
     * @param array<string, mixed> $config
     * @return array<int, string>
     */
    public function getVerifiedSenders(array $config): array
    {
        $access_key = $config['ses_access_key_id'] ?? '';
        $secret_key = $config['ses_secret_access_key'] ?? '';
        $region = $config['ses_region'] ?? 'us-east-1';

        if (empty($access_key) || empty($secret_key)) {
            return [];
        }

        $body = $this->sesApiRequest($access_key, $secret_key, $region, ['Action' => 'ListIdentities']);
        if ($body === null) {
            return [];
        }

        // Parse <member>identity</member> entries from the ListIdentities result.
        if (!preg_match_all('/<member>(.*?)<\/member>/s', $body, $matches)) {
            return [];
        }

        $identities = array_values(array_unique(array_map('trim', $matches[1])));
        if (empty($identities)) {
            return [];
        }

        // Keep only identities whose verification status is Success.
        $verified = $this->filterVerifiedIdentities($access_key, $secret_key, $region, $identities);

        // If the verification lookup failed (e.g. missing permission), fall back
        // to the full identity list rather than returning nothing.
        return $verified !== null ? $verified : $identities;
    }

    /**
     * Filter a list of SES identities down to those verified (status Success).
     *
     * @param array<int, string> $identities
     * @return array<int, string>|null Null when the lookup could not be performed.
     */
    private function filterVerifiedIdentities(string $access_key, string $secret_key, string $region, array $identities): ?array
    {
        $params = ['Action' => 'GetIdentityVerificationAttributes'];
        $index = 1;
        foreach ($identities as $identity) {
            $params['Identities.member.' . $index] = $identity;
            $index++;
        }

        $body = $this->sesApiRequest($access_key, $secret_key, $region, $params);
        if ($body === null) {
            return null;
        }

        // Each entry pairs a <key>identity</key> with a VerificationStatus.
        if (!preg_match_all('/<entry>(.*?)<\/entry>/s', $body, $entries)) {
            return [];
        }

        $verified = [];
        foreach ($entries[1] as $entry) {
            if (
                preg_match('/<key>(.*?)<\/key>/s', $entry, $k)
                && preg_match('/<VerificationStatus>(.*?)<\/VerificationStatus>/s', $entry, $s)
                && trim($s[1]) === 'Success'
            ) {
                $verified[] = trim($k[1]);
            }
        }

        return $verified;
    }

    /**
     * Perform a signed SES Query-API request and return the response body, or
     * null on transport error or any non-200 response.
     *
     * @param array<string, string> $params
     */
    private function sesApiRequest(string $access_key, string $secret_key, string $region, array $params): ?string
    {
        $endpoint = $this->apiEndpoint($region);
        $timestamp = gmdate('Ymd\THis\Z');
        $date = gmdate('Ymd');
        $host = $this->apiHost($region);

        $query_string = http_build_query($params);
        $signature = $this->signRequest($access_key, $secret_key, 'POST', $host, $query_string, $region, $timestamp, $date);

        $response = wp_remote_post($endpoint, [
            'headers' => [
                'Authorization' => $signature,
                'X-Amz-Date' => $timestamp,
                'Content-Type' => 'application/x-www-form-urlencoded',
            ],
            'body' => $query_string,
            'timeout' => 10,
        ]);

        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return null;
        }

        return wp_remote_retrieve_body($response);
    }

    /**
     * Extract the AWS <Code> value from an SES error response body.
     *
     * @param string $body Raw XML error response
     * @return string AWS error code, or empty string when not found
     */
    private function parseErrorCode(string $body): string
    {
        if ($body !== '' && preg_match('/<Code>(.*?)<\/Code>/s', $body, $m) === 1) {
            return trim($m[1]);
        }

        return '';
    }

    /**
     * Extract the AWS <Message> value from an SES error response body.
     *
     * @param string $body Raw XML error response
     * @return string AWS error message, or empty string when not found
     */
    private function parseErrorMessage(string $body): string
    {
        if ($body !== '' && preg_match('/<Message>(.*?)<\/Message>/s', $body, $m) === 1) {
            return trim($m[1]);
        }

        return '';
    }

    /**
     * Regional SES Query-API host, used both as the request target and as the
     * signed `Host` value in the SigV4 canonical request.
     */
    private function apiHost(string $region): string
    {
        // phpcs:ignore PluginCheck.CodeAnalysis.Offloading.OffloadedContent -- Amazon SES API host for signed mail delivery, not remote asset hosting.
        return "email.$region.amazonaws.com";
    }

    /**
     * Full SES Query-API endpoint URL for a region. Must resolve to the same host
     * apiHost() returns, or SigV4 rejects the request as SignatureDoesNotMatch.
     */
    private function apiEndpoint(string $region): string
    {
        // phpcs:ignore PluginCheck.CodeAnalysis.Offloading.OffloadedContent -- Amazon SES API endpoint for signed mail delivery, not remote asset hosting.
        return "https://email.$region.amazonaws.com/";
    }

    /**
     * Sign AWS request (complete AWS Signature Version 4 implementation)
     *
     * @param string $access_key AWS access key ID
     * @param string $secret_key AWS secret access key
     * @param string $method HTTP method (POST)
     * @param string $host Host name, as returned by apiHost()
     * @param string $query_string Request payload
     * @param string $region AWS region
     * @param string $timestamp ISO 8601 timestamp
     * @param string $date Date in YYYYMMDD format
     * @return string Complete Authorization header value
     */
    private function signRequest(string $access_key, string $secret_key, string $method, string $host, string $query_string, string $region, string $timestamp, string $date): string
    {
        $algorithm = 'AWS4-HMAC-SHA256';
        $service = 'ses';

        // Step 1: Create canonical request
        // Canonical headers must be sorted alphabetically
        $canonical_headers = "content-type:application/x-www-form-urlencoded\n"
                             . "host:$host\n"
                             . "x-amz-date:$timestamp\n";

        $signed_headers = 'content-type;host;x-amz-date';

        // Hash the payload
        $payload_hash = hash('sha256', $query_string);

        // Build canonical request
        $canonical_request = "$method\n"
                             . "/\n"
                             . "\n"
                             . $canonical_headers . "\n"
                             . $signed_headers . "\n"
                             . $payload_hash;

        // Step 2: Create string to sign
        $credential_scope = "$date/$region/$service/aws4_request";
        $string_to_sign = "$algorithm\n"
                          . "$timestamp\n"
                          . "$credential_scope\n"
                          . hash('sha256', $canonical_request);

        // Step 3: Calculate signature
        $signing_key = $this->getSignatureKey($secret_key, $date, $region, $service);
        $signature = hash_hmac('sha256', $string_to_sign, $signing_key);

        // Step 4: Build Authorization header
        return "$algorithm Credential=$access_key/$credential_scope, SignedHeaders=$signed_headers, Signature=$signature";
    }

    /**
     * Get signature key for AWS
     *
     * @param string $key
     * @param string $date
     * @param string $region
     * @param string $service
     * @return string
     */
    private function getSignatureKey(string $key, string $date, string $region, string $service): string
    {
        $kDate = hash_hmac('sha256', $date, 'AWS4' . $key, true);
        $kRegion = hash_hmac('sha256', $region, $kDate, true);
        $kService = hash_hmac('sha256', $service, $kRegion, true);
        $kSigning = hash_hmac('sha256', 'aws4_request', $kService, true);

        return $kSigning;
    }

    /**
     * Get provider name
     *
     * @return string
     */
    public function getName(): string
    {
        return 'Amazon SES';
    }
}
