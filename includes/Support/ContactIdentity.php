<?php

declare(strict_types=1);

namespace KeluneCRM\Support;

/**
 * Which contact columns must be filled in. Defaults to the email address alone;
 * dropping it allows contacts with no address, which are never mailable.
 */
class ContactIdentity
{
    private const FALLBACK = ['email'];

    /** @return array<int, string> */
    public static function requiredFields(): array
    {
        /** @param array<int, string> $fields Default ['email']; only standard columns are honoured. */
        $filtered = apply_filters('kelune_crm_contact_required_fields', self::FALLBACK);

        $fields = array_values(array_unique(array_intersect(
            array_map('strval', array_filter((array) $filtered, 'is_scalar')),
            ContactFields::STANDARD
        )));

        // An empty list would let a contact save with nothing in it at all.
        return $fields === [] ? self::FALLBACK : $fields;
    }

    public static function isEmailRequired(): bool
    {
        return in_array('email', self::requiredFields(), true);
    }

    /**
     * Required columns left empty once $data is written over $stored.
     *
     * @param array<string, mixed> $data   A null value means "not sent".
     * @param array<string, mixed> $stored
     * @return array<int, string>
     */
    public static function missingFields(array $data, array $stored = []): array
    {
        $merged = self::merge($data, $stored);

        return array_values(array_filter(
            self::requiredFields(),
            static function (string $field) use ($merged): bool {
                $value = $merged[$field] ?? null;

                return !is_scalar($value) || trim((string) $value) === '';
            }
        ));
    }

    /**
     * Whether a supplied address is unusable. Whether an absent one is allowed
     * is answered by missingFields().
     *
     * @param array<string, mixed> $data
     * @param array<string, mixed> $stored
     */
    public static function hasInvalidEmail(array $data, array $stored = []): bool
    {
        $merged = self::merge($data, $stored);
        $email = trim((string) ($merged['email'] ?? ''));

        return $email !== '' && !is_email($email);
    }

    /**
     * The columns a repeat of an address-less contact is recognised by. Kept
     * separate from the required columns: being mandatory and identifying
     * someone are different things.
     *
     * @return array<int, string>
     */
    public static function duplicateFields(): array
    {
        /** @param array<int, string> $fields Default []; empty allows duplicates. */
        $filtered = apply_filters('kelune_crm_contact_duplicate_fields', []);

        return array_values(array_unique(array_intersect(
            array_map('strval', array_filter((array) $filtered, 'is_scalar')),
            ContactFields::STANDARD
        )));
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function duplicateValues(array $data): array
    {
        $values = [];

        foreach (self::duplicateFields() as $field) {
            if ($field === 'email') {
                continue;
            }

            $value = $data[$field] ?? null;

            // An incomplete set identifies nothing rather than everything.
            if (!is_scalar($value) || trim((string) $value) === '') {
                return [];
            }

            $values[$field] = trim((string) $value);
        }

        return $values;
    }

    /**
     * @param array<string, mixed> $data
     * @param array<string, mixed> $stored
     * @return array<string, mixed>
     */
    private static function merge(array $data, array $stored): array
    {
        return array_merge(
            $stored,
            array_filter($data, static fn ($value): bool => null !== $value)
        );
    }
}
