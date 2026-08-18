<?php

declare(strict_types=1);

namespace KeluneCRM\Services\Providers;

use PHPMailer\PHPMailer\PHPMailer;

/**
 * Shared helpers for the HTTP-API drivers (Mailgun, SendGrid) that must re-map a
 * fully-assembled PHPMailer message into their own request bodies.
 *
 * The message is built once by {@see \KeluneCRM\Services\EmailService}, so
 * every driver sees the same recipients, attachments, and headers: PHPMailer
 * assembles the MIME and each provider only transports it.
 */
trait ExtractsMailParts
{
    /**
     * Normalise a PHPMailer address list ([[email, name], …]) into
     * [['email' => …, 'name' => …], …], dropping empties.
     *
     * @param array<int, array<int, string>> $addresses
     * @return array<int, array{email: string, name: string}>
     */
    protected function addressList(array $addresses): array
    {
        $out = [];
        foreach ($addresses as $address) {
            $email = trim((string) ($address[0] ?? ''));
            if ($email === '') {
                continue;
            }
            $out[] = ['email' => $email, 'name' => trim((string) ($address[1] ?? ''))];
        }

        return $out;
    }

    /**
     * The first Reply-To address, or null when none was set.
     *
     * PHPMailer keys reply-to entries by email → [email, name].
     *
     * @return array{email: string, name: string}|null
     */
    protected function firstReplyTo(PHPMailer $mail): ?array
    {
        foreach ($mail->getReplyToAddresses() as $entry) {
            $email = trim((string) ($entry[0] ?? ''));
            if ($email !== '') {
                return ['email' => $email, 'name' => trim((string) ($entry[1] ?? ''))];
            }
        }

        return null;
    }

    /**
     * Decoded attachments as [['content' => raw-bytes, 'name' => filename,
     * 'type' => mime, 'disposition' => …], …]. File-path attachments are read
     * from disk; string attachments are used as-is. Unreadable entries are
     * skipped.
     *
     * @return array<int, array{content: string, name: string, type: string, disposition: string}>
     */
    protected function attachmentList(PHPMailer $mail): array
    {
        $out = [];
        foreach ($mail->getAttachments() as $attachment) {
            // PHPMailer attachment tuple: 0 => path|string, 1 => filename,
            // 2 => name, 3 => encoding, 4 => type, 5 => isStringAttachment,
            // 6 => disposition, 7 => cid.
            $is_string = (bool) ($attachment[5] ?? false);
            $source = (string) ($attachment[0] ?? '');

            if ($is_string) {
                $content = $source;
            } elseif ($source !== '' && is_readable($source)) {
                $content = (string) file_get_contents($source);
            } else {
                $content = '';
            }

            if ($content === '') {
                continue;
            }

            $name = (string) ($attachment[2] ?? '');
            if ($name === '') {
                $name = (string) ($attachment[1] ?? 'attachment');
            }

            $out[] = [
                'content' => $content,
                'name' => $name,
                'type' => (string) ($attachment[4] ?? 'application/octet-stream'),
                'disposition' => (string) ($attachment[6] ?? 'attachment'),
            ];
        }

        return $out;
    }

    /**
     * Custom headers as ['Name' => 'Value', …], excluding the ones the API body
     * already carries natively (From/To/Cc/Bcc/Subject/Reply-To/Content-Type).
     *
     * @return array<string, string>
     */
    protected function customHeaderList(PHPMailer $mail): array
    {
        $skip = ['from', 'to', 'cc', 'bcc', 'subject', 'reply-to', 'content-type', 'mime-version'];
        $out = [];
        foreach ($mail->getCustomHeaders() as $header) {
            $name = trim((string) ($header[0] ?? ''));
            $value = (string) ($header[1] ?? '');
            if ($name === '' || in_array(strtolower($name), $skip, true)) {
                continue;
            }
            $out[$name] = $value;
        }

        return $out;
    }

    /**
     * The HTML and plain-text bodies of the message.
     *
     * @return array{html: string, text: string}
     */
    protected function bodies(PHPMailer $mail): array
    {
        $is_html = stripos($mail->ContentType, 'text/html') !== false
            || stripos($mail->ContentType, 'multipart/alternative') !== false;

        return [
            'html' => $is_html ? $mail->Body : '',
            'text' => $is_html ? $mail->AltBody : $mail->Body,
        ];
    }
}
