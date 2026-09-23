<?php

declare(strict_types=1);

namespace KeluneCRM\Services\Bounce;

/**
 * Turns one provider's webhook payload into delivery-failure events. Classifies
 * only, never touches a contact; events not acted on are simply not emitted.
 */
interface BounceNormalizerInterface
{
    /** Suppress on the first one. */
    public const TYPE_HARD = 'hard';

    /** Counted; suppressed at the strike limit. */
    public const TYPE_SOFT = 'soft';

    public const TYPE_COMPLAINT = 'complaint';

    /** Opted out at the provider rather than through our link. */
    public const TYPE_UNSUBSCRIBE = 'unsubscribe';

    /**
     * `event_at` is the provider's failure time as UTC `Y-m-d H:i:s` (bounds
     * address-matched attribution); `event_id` its report identifier (lets a
     * strike count once). Either is '' when the payload carries none.
     *
     * @param array<string, mixed> $payload
     * @return array<int, array{email: string, type: string, reason: string, token: string, event_at: string, event_id: string}>
     */
    public function normalize(array $payload): array;
}
