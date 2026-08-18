<?php

declare(strict_types=1);

namespace KeluneCRM\Support;

/**
 * Adaptive time-series bucketing for analytics/reporting.
 *
 * Chooses day/week/month granularity from a range length, produces the safe SQL
 * grouping expression, and enumerates the aligned bucket-start dates so callers
 * can zero-fill gaps for continuous charts. Every bucket key is a plain
 * `Y-m-d` date, so the SQL group keys and the PHP period keys line up exactly.
 */
class DateBucketer
{
    public const DAY = 'day';
    public const WEEK = 'week';
    public const MONTH = 'month';

    /**
     * Pick a bucket granularity from the span: daily up to ~2 months, weekly up
     * to ~3, monthly beyond. Mirrors how the charts stay readable as the range
     * grows.
     */
    public static function choose(string $start, string $end): string
    {
        $days = (int) floor((strtotime($end . ' UTC') - strtotime($start . ' UTC')) / DAY_IN_SECONDS);

        if ($days <= 62) {
            return self::DAY;
        }

        if ($days <= 92) {
            return self::WEEK;
        }

        return self::MONTH;
    }

    /**
     * SQL expression that maps a datetime column to its aligned bucket-start
     * DATE. `$column` and `$bucket` are always internal literals (never request
     * input), so the result is safe to interpolate into a query.
     */
    public static function sqlExpr(string $column, string $bucket): string
    {
        switch ($bucket) {
            case self::WEEK:
                // WEEKDAY() is 0 for Monday, so this snaps to the ISO week start.
                return "DATE(DATE_SUB({$column}, INTERVAL WEEKDAY({$column}) DAY))";
            case self::MONTH:
                return "DATE_FORMAT({$column}, '%Y-%m-01')";
            case self::DAY:
            default:
                return "DATE({$column})";
        }
    }

    /**
     * Aligned bucket-start dates (`Y-m-d`) spanning [start, end] inclusive.
     *
     * @return array<int, string>
     */
    public static function periods(string $start, string $end, string $bucket): array
    {
        $cursor = self::align($start, $bucket);
        $last = self::align($end, $bucket);

        $keys = [];
        $guard = 0;
        while ($cursor <= $last && $guard++ < 1000) {
            $keys[] = $cursor;
            $cursor = self::next($cursor, $bucket);
        }

        return $keys;
    }

    private static function align(string $date, string $bucket): string
    {
        // Parse as UTC so the aligned key matches the SQL buckets, which group a
        // UTC-stored column with DATE()/DATE_FORMAT() (i.e. in UTC).
        $ts = (int) strtotime($date . ' UTC');

        switch ($bucket) {
            case self::WEEK:
                $dow = (int) gmdate('N', $ts); // 1 = Monday
                return gmdate('Y-m-d', $ts - ($dow - 1) * DAY_IN_SECONDS);
            case self::MONTH:
                return gmdate('Y-m-01', $ts);
            case self::DAY:
            default:
                return gmdate('Y-m-d', $ts);
        }
    }

    private static function next(string $date, string $bucket): string
    {
        $ts = (int) strtotime($date . ' UTC');

        switch ($bucket) {
            case self::WEEK:
                return gmdate('Y-m-d', $ts + 7 * DAY_IN_SECONDS);
            case self::MONTH:
                return gmdate('Y-m-01', (int) strtotime($date . ' UTC +1 month'));
            case self::DAY:
            default:
                return gmdate('Y-m-d', $ts + DAY_IN_SECONDS);
        }
    }
}
