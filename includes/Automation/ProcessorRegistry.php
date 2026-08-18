<?php

declare(strict_types=1);

namespace KeluneCRM\Automation;

use KeluneCRM\Models\Contact;
use KeluneCRM\Processors\ActionProcessor;

/**
 * Central map of automation step/action processors — the Free/Pro extension seam.
 * Free seeds the basic action processors; the Pro add-on hangs advanced ones
 * (condition, update_field, webhook, ...) onto the
 * `kelune_crm_automation_processors` filter. AutomationExecutor looks a
 * processor up by key and skips gracefully when it is absent.
 *
 * Every processor is a callable with the signature:
 *   callable(array<string,mixed> $config, Contact $contact, array<string,mixed> $context, string $type): array<string,mixed>
 * returning a result array ('success' => bool, plus 'branch' for condition processors).
 */
class ProcessorRegistry
{
    /** @var array<string, callable>|null */
    private static ?array $processors = null;

    /**
     * Resolve the processor map (memoised for the request).
     *
     * @return array<string, callable>
     */
    public static function all(): array
    {
        if (self::$processors !== null) {
            return self::$processors;
        }

        $actionProcessor = new ActionProcessor();

        // Shared dispatcher for the basic actions shipped in Free. It delegates
        // to ActionProcessor::execute() keyed by the runtime action type.
        $dispatch = static function (array $config, Contact $contact, array $context, string $type) use ($actionProcessor): array {
            return $actionProcessor->execute($type, $config, $contact, $context);
        };

        // Basic action processors (Free). Advanced processors (update_field,
        // webhook, condition, advanced triggers) are intentionally NOT registered
        // here — the Pro add-on adds them via the filter below.
        $basic = [
            'send_email' => $dispatch,
            'add_tag' => $dispatch,
            'remove_tag' => $dispatch,
            'add_list' => $dispatch,
            'remove_list' => $dispatch,
        ];

        /**
         * Filter the automation step/action processor map.
         *
         * @param array<string, callable> $processors Map of step/action key => processor callable.
         */
        self::$processors = apply_filters('kelune_crm_automation_processors', $basic);

        return self::$processors;
    }

    public static function has(string $key): bool
    {
        return isset(self::all()[$key]);
    }

    public static function get(string $key): ?callable
    {
        return self::all()[$key] ?? null;
    }
}
