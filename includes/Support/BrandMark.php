<?php

declare(strict_types=1);

namespace KeluneCRM\Support;

/**
 * The Kelune CRM mark: six contacts ringed around one send.
 *
 * Seven circles on a 100x100 grid. The dashboard draws the same figure in
 * React (see components/common/BrandMark.tsx); the two are mirrors, so a change
 * to the geometry belongs in both.
 */
final class BrandMark
{
    /** Ring radius and dot size, in viewBox units. */
    private const RING_RADIUS = 33.0;
    private const DOT_RADIUS = 10.6;
    private const CORE_RADIUS = 14.6;
    private const CENTER = 50.0;

    /** Tile corner radius, and how much of the tile the mark occupies. */
    private const TILE_RADIUS = '22.5';
    private const MARK_SCALE = '0.62';

    /**
     * The mark knocked out of the brand tile, as a base64 data URI for use as a
     * CSS `mask` source.
     *
     * A mask reads the alpha channel, so the tile is opaque and the seven
     * circles are punched through it. Painted with `currentColor` that gives a
     * tile in the admin colour scheme's own icon colour, with the mark showing
     * as the menu background — so the badge follows every scheme instead of
     * being a fixed colour that disappears on the light ones.
     */
    public static function tileMaskUri(): string
    {
        $holes = '';

        foreach (self::ringPoints() as [$x, $y]) {
            $holes .= sprintf('<circle cx="%s" cy="%s" r="%s" fill="#000"/>', $x, $y, self::round(self::DOT_RADIUS));
        }

        $holes .= sprintf(
            '<circle cx="%s" cy="%s" r="%s" fill="#000"/>',
            self::round(self::CENTER),
            self::round(self::CENTER),
            self::round(self::CORE_RADIUS)
        );

        $tile = '<rect width="100" height="100" rx="' . self::TILE_RADIUS . '" fill="#fff"/>';
        $inner = '<g transform="translate(' . self::CENTER . ' ' . self::CENTER . ') scale(' . self::MARK_SCALE
            . ') translate(-' . self::CENTER . ' -' . self::CENTER . ')">' . $holes . '</g>';

        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            . '<mask id="m">' . $tile . $inner . '</mask>'
            . '<rect width="100" height="100" rx="' . self::TILE_RADIUS . '" fill="#000" mask="url(#m)"/>'
            . '</svg>';

        return 'data:image/svg+xml;base64,' . base64_encode($svg);
    }

    /**
     * Centres of the six ring dots, in viewBox units.
     *
     * @return array<int, array{0: string, 1: string}>
     */
    private static function ringPoints(): array
    {
        $points = [];

        for ($i = 0; $i < 6; $i++) {
            $angle = ((M_PI * 2) * $i / 6) - (M_PI / 2);
            $points[] = [
                self::round(self::CENTER + (cos($angle) * self::RING_RADIUS)),
                self::round(self::CENTER + (sin($angle) * self::RING_RADIUS)),
            ];
        }

        return $points;
    }

    /**
     * Trim trailing zeros so the markup stays short — it is inlined into CSS.
     */
    private static function round(float $value): string
    {
        return rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.');
    }
}
