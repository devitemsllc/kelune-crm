<?php

declare(strict_types=1);

namespace KeluneCRM\Services\Bounce;

/**
 * Webhook signing secrets, one per provider. Independent of email connections
 * (a site mailing through another plugin still verifies), and outside
 * `kelune_crm_settings` so the credential never reaches the browser.
 */
final class SigningSecrets
{
    public const OPTION = 'kelune_crm_bounce_signing_secrets';

    /**
     * SES is absent: it signs with a certificate SNS publishes.
     *
     * @var array<int, string>
     */
    public const PROVIDERS = ['mailgun', 'sendgrid'];

    public static function usesSecret(string $provider): bool
    {
        return in_array($provider, self::PROVIDERS, true);
    }

    public static function get(string $provider): string
    {
        return trim(self::all()[$provider] ?? '');
    }

    /** An empty value clears the secret. */
    public static function set(string $provider, string $secret): bool
    {
        if (!self::usesSecret($provider)) {
            return false;
        }

        $secrets = self::all();
        $secret = trim($secret);

        // update_option() reports false for an unchanged value; that is not a failure.
        if ($secret === ($secrets[$provider] ?? '')) {
            return true;
        }

        if ('' === $secret) {
            unset($secrets[$provider]);
        } else {
            $secrets[$provider] = $secret;
        }

        return update_option(self::OPTION, $secrets, false);
    }

    /**
     * @return array<string, string>
     */
    private static function all(): array
    {
        $stored = get_option(self::OPTION, []);

        if (!is_array($stored)) {
            return [];
        }

        $secrets = [];

        foreach ($stored as $provider => $secret) {
            if (is_string($provider) && is_string($secret)) {
                $secrets[$provider] = $secret;
            }
        }

        return $secrets;
    }
}
