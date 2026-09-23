<?php

declare(strict_types=1);

namespace KeluneCRM\Services\Bounce;

/** Mailgun event webhooks. */
class MailgunNormalizer implements BounceNormalizerInterface
{
    /**
     * @param array<string, mixed> $payload
     * @return array<int, array{email: string, type: string, reason: string, token: string, event_at: string, event_id: string}>
     */
    public function normalize(array $payload): array
    {
        $event = isset($payload['event-data']) && is_array($payload['event-data'])
            ? $payload['event-data']
            : $payload;

        $name = isset($event['event']) && is_string($event['event']) ? strtolower($event['event']) : '';
        $email = isset($event['recipient']) && is_string($event['recipient']) ? $event['recipient'] : '';

        if ('' === $email) {
            return [];
        }

        $type = $this->classify($name, $event);

        if ('' === $type) {
            return [];
        }

        $event_id = isset($event['id']) && is_string($event['id']) ? trim($event['id']) : '';

        return [[
            'email' => $email,
            'type' => $type,
            'reason' => $this->reason($event, $name),
            'token' => $this->extractToken($event),
            'event_at' => BounceAttribution::eventTime($event['timestamp'] ?? null),
            'event_id' => $event_id,
        ]];
    }

    /** @param array<string, mixed> $event */
    private function classify(string $name, array $event): string
    {
        if ('complained' === $name) {
            return self::TYPE_COMPLAINT;
        }

        if ('unsubscribed' === $name) {
            return self::TYPE_UNSUBSCRIBE;
        }

        // `failed` is the only delivery failure the webhook posts; `rejected` is API-only and sender-side.
        if ('failed' !== $name) {
            return '';
        }

        $severity = isset($event['severity']) && is_string($event['severity'])
            ? strtolower($event['severity'])
            : '';

        return 'temporary' === $severity ? self::TYPE_SOFT : self::TYPE_HARD;
    }

    /** @param array<string, mixed> $event */
    private function reason(array $event, string $fallback): string
    {
        $status = isset($event['delivery-status']) && is_array($event['delivery-status'])
            ? $event['delivery-status']
            : [];

        foreach (['message', 'description'] as $key) {
            if (isset($status[$key]) && is_string($status[$key]) && '' !== $status[$key]) {
                return $status[$key];
            }
        }

        if (isset($event['reason']) && is_string($event['reason']) && '' !== $event['reason']) {
            return $event['reason'];
        }

        return $fallback;
    }

    /** @param array<string, mixed> $event */
    private function extractToken(array $event): string
    {
        $variables = isset($event['user-variables']) && is_array($event['user-variables'])
            ? $event['user-variables']
            : [];

        $token = $variables[BounceAttribution::MAILGUN_VARIABLE] ?? '';

        return is_string($token) ? trim($token) : '';
    }
}
