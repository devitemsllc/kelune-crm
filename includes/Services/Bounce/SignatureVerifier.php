<?php

declare(strict_types=1);

namespace KeluneCRM\Services\Bounce;

use KeluneCRM\Core\Debug;
use WP_REST_Request;

/**
 * Verifies a bounce webhook came from the provider it claims. Each check returns
 * true (verified), false (reject) or null (nothing to verify against).
 */
class SignatureVerifier
{
    /** Covers Mailgun's eight-hour retry schedule; the token-to-body binding is what stops a replay. */
    private const MAILGUN_MAX_AGE = 12 * HOUR_IN_SECONDS;

    /** Wide enough for a provider's late retry, narrow enough that a capture cannot replay forever. */
    private const SIGNED_MAX_AGE = 2 * DAY_IN_SECONDS;

    private const CERT_CACHE_TTL = DAY_IN_SECONDS;

    /** Topic ARNs that completed the SNS subscription handshake. */
    public const TOPICS_OPTION = 'kelune_crm_bounce_sns_topics';

    /**
     * @param array<string, mixed> $payload Decoded body.
     * @return bool|null True verified, false rejected, null nothing to check against.
     */
    public function verify(string $provider, string $raw_body, array $payload, WP_REST_Request $request): ?bool
    {
        switch ($provider) {
            case 'ses':
                return $this->verifySns($payload);
            case 'mailgun':
                return $this->verifyMailgun($payload, $raw_body);
            case 'sendgrid':
                return $this->verifySendGrid($raw_body, $request);
            default:
                return null;
        }
    }

    /**
     * HMAC-SHA256 over `timestamp . token`, keyed with the webhook signing key.
     *
     * @param array<string, mixed> $payload
     */
    private function verifyMailgun(array $payload, string $raw_body): ?bool
    {
        $secrets = $this->secretsFor('mailgun');

        if ([] === $secrets) {
            return null;
        }

        $signature = isset($payload['signature']) && is_array($payload['signature']) ? $payload['signature'] : [];

        $timestamp = isset($signature['timestamp']) && is_scalar($signature['timestamp'])
            ? (string) $signature['timestamp']
            : '';
        $token = isset($signature['token']) && is_string($signature['token']) ? $signature['token'] : '';

        // A subaccount event carries the primary account's signature alongside its own.
        $provided = [];
        foreach (['signature', 'parent-signature'] as $field) {
            if (isset($signature[$field]) && is_string($signature[$field]) && '' !== $signature[$field]) {
                $provided[] = $signature[$field];
            }
        }

        if ('' === $timestamp || '' === $token || [] === $provided) {
            return false;
        }

        if (abs(time() - (int) $timestamp) > self::MAILGUN_MAX_AGE) {
            return false;
        }

        foreach ($secrets as $secret) {
            $expected = hash_hmac('sha256', $timestamp . $token, $secret);

            foreach ($provided as $candidate) {
                if (hash_equals($expected, $candidate)) {
                    return $this->tokenMatchesBody($token, $raw_body);
                }
            }
        }

        return false;
    }

    /**
     * The signature never covers the payload, so a captured header set would
     * authenticate any body; binding the token to its first body refuses that
     * while a redelivery of the same notification still gets its 200.
     */
    private function tokenMatchesBody(string $token, string $raw_body): bool
    {
        $cache_key = 'kelune_crm_mg_token_' . md5($token);
        $fingerprint = hash('sha256', $raw_body);
        $seen = get_transient($cache_key);

        if (is_string($seen) && '' !== $seen) {
            if (hash_equals($seen, $fingerprint)) {
                return true;
            }

            Debug::log('KeluneCRM bounce: refused a Mailgun signature reused over a different payload.');

            return false;
        }

        set_transient($cache_key, $fingerprint, self::MAILGUN_MAX_AGE);

        return true;
    }

    /** ECDSA P-256 over `timestamp . raw body`; re-encoding the JSON changes the bytes. */
    private function verifySendGrid(string $raw_body, WP_REST_Request $request): ?bool
    {
        $secrets = $this->secretsFor('sendgrid');

        if ([] === $secrets) {
            return null;
        }

        if (!function_exists('openssl_verify')) {
            Debug::log('KeluneCRM bounce: openssl unavailable, SendGrid signature not verified.');

            return null;
        }

        $signature = (string) $request->get_header('x-twilio-email-event-webhook-signature');
        $timestamp = (string) $request->get_header('x-twilio-email-event-webhook-timestamp');

        if ('' === $signature || '' === $timestamp) {
            return false;
        }

        if (abs(time() - (int) $timestamp) > self::SIGNED_MAX_AGE) {
            return false;
        }

        $decoded = base64_decode($signature, true);

        if (false === $decoded) {
            return false;
        }

        foreach ($secrets as $secret) {
            $key = openssl_pkey_get_public($this->toPem($secret));

            if (false === $key) {
                continue;
            }

            if (1 === openssl_verify($timestamp . $raw_body, $decoded, $key, OPENSSL_ALGO_SHA256)) {
                return true;
            }
        }

        return false;
    }

    /** The stored key may be bare base64 or armour that lost its line breaks in a paste. */
    private function toPem(string $key): string
    {
        $body = preg_replace('/-----(BEGIN|END) [A-Z ]+-----/', '', $key) ?? '';
        $body = preg_replace('/\s+/', '', $body) ?? '';

        if ('' === $body) {
            return '';
        }

        return "-----BEGIN PUBLIC KEY-----\n"
            . chunk_split($body, 64, "\n")
            . "-----END PUBLIC KEY-----\n";
    }

    /**
     * Canonical string of the notification's own fields, checked against the
     * certificate it names, fetched only from an SNS host.
     *
     * @param array<string, mixed> $payload
     */
    private function verifySns(array $payload): ?bool
    {
        $type = isset($payload['Type']) && is_string($payload['Type']) ? $payload['Type'] : '';
        $topic = isset($payload['TopicArn']) && is_string($payload['TopicArn']) ? $payload['TopicArn'] : '';
        $known = self::confirmedTopics();

        // A valid signature only proves some AWS account sent this, so once a
        // topic has confirmed, only that topic may report. The handshake itself
        // is exempt, or a second topic could never be added.
        if ('SubscriptionConfirmation' !== $type && [] !== $known && !in_array($topic, $known, true)) {
            Debug::log('KeluneCRM bounce: refused SNS notification from unconfirmed topic ' . $topic);

            return false;
        }

        if (!function_exists('openssl_verify')) {
            Debug::log('KeluneCRM bounce: openssl unavailable, SNS signature not verified.');

            return null;
        }

        $signature = isset($payload['Signature']) && is_string($payload['Signature']) ? $payload['Signature'] : '';
        $cert_url = isset($payload['SigningCertURL']) && is_string($payload['SigningCertURL'])
            ? $payload['SigningCertURL']
            : '';

        if ('' === $signature || '' === $cert_url) {
            // Unsigned is only trusted before any topic has confirmed; after that it is a downgrade.
            return [] === $known ? null : false;
        }

        $sent_at = isset($payload['Timestamp']) && is_string($payload['Timestamp'])
            ? strtotime($payload['Timestamp'])
            : false;

        if (is_int($sent_at) && abs(time() - $sent_at) > self::SIGNED_MAX_AGE) {
            return false;
        }

        $canonical = $this->snsCanonicalString($payload);

        if ('' === $canonical) {
            return false;
        }

        $certificate = $this->fetchSigningCertificate($cert_url);

        if (null === $certificate) {
            return false;
        }

        $key = openssl_pkey_get_public($certificate);

        if (false === $key) {
            return false;
        }

        $version = isset($payload['SignatureVersion']) && is_scalar($payload['SignatureVersion'])
            ? (string) $payload['SignatureVersion']
            : '1';

        $algorithm = '2' === $version ? OPENSSL_ALGO_SHA256 : OPENSSL_ALGO_SHA1;
        $decoded = base64_decode($signature, true);

        if (false === $decoded) {
            return false;
        }

        return 1 === openssl_verify($canonical, $decoded, $key, $algorithm);
    }

    /** @param array<string, mixed> $payload */
    private function snsCanonicalString(array $payload): string
    {
        $type = isset($payload['Type']) && is_string($payload['Type']) ? $payload['Type'] : '';

        if ('Notification' === $type) {
            $fields = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'];
        } elseif ('SubscriptionConfirmation' === $type || 'UnsubscribeConfirmation' === $type) {
            $fields = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
        } else {
            return '';
        }

        $canonical = '';

        foreach ($fields as $field) {
            if (!isset($payload[$field]) || !is_string($payload[$field])) {
                // Subject is the only optional field.
                if ('Subject' === $field) {
                    continue;
                }

                return '';
            }

            $canonical .= $field . "\n" . $payload[$field] . "\n";
        }

        return $canonical;
    }

    /** Gate on every caller-supplied URL that gets fetched; anything looser is an SSRF gadget. */
    public static function isSnsHost(string $url): bool
    {
        $host = (string) wp_parse_url($url, PHP_URL_HOST);
        $scheme = strtolower((string) wp_parse_url($url, PHP_URL_SCHEME));

        return 'https' === $scheme
            && 1 === preg_match('/^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/i', $host);
    }

    /** @return array<int, string> */
    public static function confirmedTopics(): array
    {
        $topics = get_option(self::TOPICS_OPTION, []);

        if (!is_array($topics)) {
            return [];
        }

        return array_values(array_filter($topics, 'is_string'));
    }

    public static function rememberTopic(string $topic): void
    {
        if ('' === $topic) {
            return;
        }

        $topics = self::confirmedTopics();

        if (in_array($topic, $topics, true)) {
            return;
        }

        $topics[] = $topic;

        update_option(self::TOPICS_OPTION, $topics, false);
    }

    private function fetchSigningCertificate(string $url): ?string
    {
        if (!self::isSnsHost($url)) {
            Debug::log('KeluneCRM bounce: refused SNS SigningCertURL ' . $url);

            return null;
        }

        $cache_key = 'kelune_crm_sns_cert_' . md5($url);
        $cached = get_transient($cache_key);

        if (is_string($cached) && '' !== $cached) {
            return $cached;
        }

        $response = wp_remote_get($url, ['timeout' => 15]);

        if (is_wp_error($response) || 200 !== (int) wp_remote_retrieve_response_code($response)) {
            return null;
        }

        $body = wp_remote_retrieve_body($response);

        if ('' === $body) {
            return null;
        }

        set_transient($cache_key, $body, self::CERT_CACHE_TTL);

        return $body;
    }

    /** @return array<int, string> */
    private function secretsFor(string $provider): array
    {
        $secret = SigningSecrets::get($provider);

        return '' === $secret ? [] : [$secret];
    }
}
