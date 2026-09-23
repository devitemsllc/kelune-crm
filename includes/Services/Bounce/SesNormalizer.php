<?php

declare(strict_types=1);

namespace KeluneCRM\Services\Bounce;

use KeluneCRM\Core\Debug;

/** Amazon SES bounce and complaint notifications, delivered over SNS. */
class SesNormalizer implements BounceNormalizerInterface
{
    /**
     * A rejected message, not a dead mailbox: no strike.
     *
     * @var array<int, string>
     */
    private const SENDER_FAULT_SUBTYPES = [
        'MessageTooLarge',
        'ContentRejected',
        'AttachmentRejected',
    ];

    /**
     * `UnsubscribedRecipient` arrives as a Permanent bounce but is an opt-out at the provider.
     *
     * @var array<string, string>
     */
    private const SUBTYPE_OVERRIDES = [
        'UnsubscribedRecipient' => self::TYPE_UNSUBSCRIBE,
    ];

    /**
     * ARF types that are not a recipient complaint: `not-spam` is the opposite
     * signal, the other two describe the message, not the recipient's opinion.
     *
     * @var array<int, string>
     */
    private const NON_COMPLAINT_FEEDBACK = [
        'not-spam',
        'auth-failure',
        'virus',
    ];

    /**
     * A suppression-list rejection, not a recipient complaint.
     *
     * @var array<int, string>
     */
    private const COMPLAINT_SUPPRESSION_SUBTYPES = [
        'OnAccountSuppressionList',
        'OnTenantSuppressionList',
    ];

    /**
     * @param array<string, mixed> $payload
     * @return array<int, array{email: string, type: string, reason: string, token: string, event_at: string, event_id: string}>
     */
    public function normalize(array $payload): array
    {
        $envelopeType = isset($payload['Type']) && is_string($payload['Type']) ? $payload['Type'] : '';

        if ('SubscriptionConfirmation' === $envelopeType) {
            $this->confirmSubscription($payload);

            return [];
        }

        $notification = $this->unwrap($payload);

        if ([] === $notification) {
            return [];
        }

        $type = '';
        foreach (['notificationType', 'eventType'] as $key) {
            if (isset($notification[$key]) && is_string($notification[$key])) {
                $type = $notification[$key];
                break;
            }
        }

        $token = $this->extractToken($notification);

        if ('Bounce' === $type) {
            return $this->normalizeBounce($notification, $token);
        }

        if ('Complaint' === $type) {
            return $this->normalizeComplaint($notification, $token);
        }

        return [];
    }

    /**
     * The SES notification is a JSON string inside SNS `Message`.
     *
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function unwrap(array $payload): array
    {
        if (isset($payload['Message']) && is_string($payload['Message'])) {
            $decoded = json_decode($payload['Message'], true);

            return is_array($decoded) ? $decoded : [];
        }

        return $payload;
    }

    /**
     * @param array<string, mixed> $notification
     * @return array<int, array{email: string, type: string, reason: string, token: string, event_at: string, event_id: string}>
     */
    private function normalizeBounce(array $notification, string $token): array
    {
        $bounce = isset($notification['bounce']) && is_array($notification['bounce'])
            ? $notification['bounce']
            : [];

        $subType = isset($bounce['bounceSubType']) && is_string($bounce['bounceSubType'])
            ? $bounce['bounceSubType']
            : '';

        if (in_array($subType, self::SENDER_FAULT_SUBTYPES, true)) {
            return [];
        }

        $bounceType = isset($bounce['bounceType']) && is_string($bounce['bounceType'])
            ? $bounce['bounceType']
            : '';

        if (isset(self::SUBTYPE_OVERRIDES[$subType])) {
            $type = self::SUBTYPE_OVERRIDES[$subType];
        } elseif ('Permanent' === $bounceType) {
            $type = self::TYPE_HARD;
        } elseif ('Transient' === $bounceType || 'Undetermined' === $bounceType) {
            // Undetermined: one unreadable report is not proof the mailbox is gone.
            $type = self::TYPE_SOFT;
        } else {
            return [];
        }

        $recipients = isset($bounce['bouncedRecipients']) && is_array($bounce['bouncedRecipients'])
            ? $bounce['bouncedRecipients']
            : [];

        $events = [];

        foreach ($recipients as $recipient) {
            if (!is_array($recipient)) {
                continue;
            }

            $email = isset($recipient['emailAddress']) && is_string($recipient['emailAddress'])
                ? $recipient['emailAddress']
                : '';

            if ('' === $email) {
                continue;
            }

            $diagnostic = isset($recipient['diagnosticCode']) && is_string($recipient['diagnosticCode'])
                ? $recipient['diagnosticCode']
                : $subType;

            $events[] = [
                'email' => $email,
                'type' => $type,
                'reason' => $diagnostic,
                'token' => $token,
                'event_at' => BounceAttribution::eventTime($bounce['timestamp'] ?? null),
                'event_id' => $this->feedbackId($bounce, $email),
            ];
        }

        return $events;
    }

    /**
     * @param array<string, mixed> $notification
     * @return array<int, array{email: string, type: string, reason: string, token: string, event_at: string, event_id: string}>
     */
    private function normalizeComplaint(array $notification, string $token): array
    {
        $complaint = isset($notification['complaint']) && is_array($notification['complaint'])
            ? $notification['complaint']
            : [];

        $feedback = isset($complaint['complaintFeedbackType']) && is_string($complaint['complaintFeedbackType'])
            ? $complaint['complaintFeedbackType']
            : '';

        if (in_array(strtolower($feedback), self::NON_COMPLAINT_FEEDBACK, true)) {
            return [];
        }

        $subType = isset($complaint['complaintSubType']) && is_string($complaint['complaintSubType'])
            ? $complaint['complaintSubType']
            : '';

        $suppression_list = in_array($subType, self::COMPLAINT_SUPPRESSION_SUBTYPES, true);
        $type = $suppression_list ? self::TYPE_HARD : self::TYPE_COMPLAINT;
        $reason = $suppression_list ? $subType : ('' !== $feedback ? $feedback : 'complaint');

        $recipients = isset($complaint['complainedRecipients']) && is_array($complaint['complainedRecipients'])
            ? $complaint['complainedRecipients']
            : [];

        $events = [];

        foreach ($recipients as $recipient) {
            if (!is_array($recipient)) {
                continue;
            }

            $email = isset($recipient['emailAddress']) && is_string($recipient['emailAddress'])
                ? $recipient['emailAddress']
                : '';

            if ('' === $email) {
                continue;
            }

            $events[] = [
                'email' => $email,
                'type' => $type,
                'reason' => $reason,
                'token' => $token,
                'event_at' => BounceAttribution::eventTime($complaint['timestamp'] ?? null),
                'event_id' => $this->feedbackId($complaint, $email),
            ];
        }

        return $events;
    }

    /**
     * Narrowed to one recipient: a notification may name several.
     *
     * @param array<string, mixed> $report
     */
    private function feedbackId(array $report, string $email): string
    {
        $id = isset($report['feedbackId']) && is_string($report['feedbackId']) ? trim($report['feedbackId']) : '';

        return '' === $id ? '' : $id . '|' . $email;
    }

    /**
     * Present only when the notification includes original headers.
     *
     * @param array<string, mixed> $notification
     */
    private function extractToken(array $notification): string
    {
        $mail = isset($notification['mail']) && is_array($notification['mail']) ? $notification['mail'] : [];
        $headers = isset($mail['headers']) && is_array($mail['headers']) ? $mail['headers'] : [];

        foreach ($headers as $header) {
            if (!is_array($header)) {
                continue;
            }

            $name = isset($header['name']) && is_string($header['name']) ? $header['name'] : '';

            if (0 !== strcasecmp($name, BounceAttribution::HEADER)) {
                continue;
            }

            return isset($header['value']) && is_string($header['value'])
                ? BounceAttribution::tokenFromHeaderValue($header['value'])
                : '';
        }

        return '';
    }

    /** @param array<string, mixed> $payload */
    private function confirmSubscription(array $payload): void
    {
        $url = isset($payload['SubscribeURL']) && is_string($payload['SubscribeURL'])
            ? $payload['SubscribeURL']
            : '';

        if ('' === $url) {
            return;
        }

        if (!SignatureVerifier::isSnsHost($url)) {
            Debug::log('KeluneCRM bounce: refused SNS SubscribeURL ' . $url);

            return;
        }

        $response = wp_remote_get($url, ['timeout' => 15]);

        if (is_wp_error($response)) {
            Debug::log('KeluneCRM bounce: SNS subscription confirmation failed: ' . $response->get_error_message());

            return;
        }

        $code = (int) wp_remote_retrieve_response_code($response);

        if (200 !== $code) {
            Debug::log('KeluneCRM bounce: SNS subscription confirmation returned HTTP ' . $code);

            return;
        }

        $topic = isset($payload['TopicArn']) && is_string($payload['TopicArn']) ? $payload['TopicArn'] : '';

        SignatureVerifier::rememberTopic($topic);
    }
}
