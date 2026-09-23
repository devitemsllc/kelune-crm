<?php

declare(strict_types=1);

namespace KeluneCRM\Services\Bounce;

use KeluneCRM\Core\Debug;

/** SendGrid event webhooks; one request carries a batch. */
class SendGridNormalizer implements BounceNormalizerInterface
{
    /** Above what a 768 KB batch can hold, so a real batch is never truncated. */
    private const MAX_EVENTS = 10000;

    /**
     * Only `bounce` means the address is gone. An unknown or absent `type` is
     * soft, so an unfamiliar value costs a strike, not a live address.
     *
     * @var array<string, string>
     */
    private const BOUNCE_TYPES = [
        'bounce' => self::TYPE_HARD,
        'blocked' => self::TYPE_SOFT,
    ];

    /**
     * `dropped` also reports content and quota rejections, where the mailbox is
     * fine; only reasons that describe the address are acted on.
     *
     * @var array<string, string>
     */
    private const DROP_REASONS = [
        'invalid address' => self::TYPE_HARD,
        'bounced address' => self::TYPE_HARD,
        'unsubscribed address' => self::TYPE_UNSUBSCRIBE,
        'spam reporting address' => self::TYPE_COMPLAINT,
    ];

    /**
     * @param array<string, mixed> $payload
     * @return array<int, array{email: string, type: string, reason: string, token: string, event_at: string, event_id: string}>
     */
    public function normalize(array $payload): array
    {
        $events = [];
        $processed = 0;

        foreach ($payload as $event) {
            if (++$processed > self::MAX_EVENTS) {
                Debug::log('KeluneCRM bounce: SendGrid batch exceeded ' . self::MAX_EVENTS . ' events, remainder ignored.');

                break;
            }

            if (!is_array($event)) {
                continue;
            }

            $email = isset($event['email']) && is_string($event['email']) ? $event['email'] : '';
            $name = isset($event['event']) && is_string($event['event']) ? strtolower($event['event']) : '';

            if ('' === $email) {
                continue;
            }

            $type = $this->classify($name, $event);

            if ('' === $type) {
                continue;
            }

            $token = $event[BounceAttribution::SENDGRID_ARG] ?? '';
            $event_id = $event['sg_event_id'] ?? '';

            $events[] = [
                'email' => $email,
                'type' => $type,
                'reason' => $this->reason($event, $name),
                'token' => is_string($token) ? trim($token) : '',
                'event_at' => BounceAttribution::eventTime($event['timestamp'] ?? null),
                'event_id' => is_string($event_id) ? trim($event_id) : '',
            ];
        }

        return $events;
    }

    /** @param array<string, mixed> $event */
    private function classify(string $name, array $event): string
    {
        if ('spamreport' === $name) {
            return self::TYPE_COMPLAINT;
        }

        if ('unsubscribe' === $name || 'group_unsubscribe' === $name) {
            return self::TYPE_UNSUBSCRIBE;
        }

        if ('dropped' === $name) {
            $reason = isset($event['reason']) && is_string($event['reason']) ? strtolower(trim($event['reason'])) : '';

            return self::DROP_REASONS[$reason] ?? '';
        }

        if ('bounce' !== $name) {
            return '';
        }

        $type = isset($event['type']) && is_string($event['type']) ? strtolower(trim($event['type'])) : '';

        return self::BOUNCE_TYPES[$type] ?? self::TYPE_SOFT;
    }

    /** @param array<string, mixed> $event */
    private function reason(array $event, string $fallback): string
    {
        foreach (['reason', 'response', 'status'] as $key) {
            if (isset($event[$key]) && is_string($event[$key]) && '' !== $event[$key]) {
                return $event[$key];
            }
        }

        return $fallback;
    }
}
