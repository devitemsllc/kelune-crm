<?php

declare(strict_types=1);

namespace KeluneCRM\Support;

/**
 * The contact columns automations may read in a condition or write with an
 * update_field action. Anything not listed here is treated as a custom field.
 */
class ContactFields
{
    /**
     * @var array<int, string>
     */
    public const STANDARD = [
        'first_name',
        'last_name',
        'email',
        'phone',
        'company',
        'address_line1',
        'address_line2',
        'city',
        'state',
        'postal_code',
        'country',
        'status',
    ];

    /**
     * Step configs saved against the shorthand names these columns used to be
     * offered under. Resolving them keeps those steps working; without it they
     * read an absent column and silently evaluate to an empty string.
     *
     * @var array<string, string>
     */
    private const ALIASES = [
        'address' => 'address_line1',
        'zip' => 'postal_code',
    ];

    /** Resolve a configured field name to the column it refers to. */
    public static function resolve(string $field): string
    {
        return self::ALIASES[$field] ?? $field;
    }

    /** Whether a configured field names a contact column rather than a custom field. */
    public static function isStandard(string $field): bool
    {
        return in_array(self::resolve($field), self::STANDARD, true);
    }
}
