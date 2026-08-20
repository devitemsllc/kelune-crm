import type { CampaignVariant } from '@/types/models';

/**
 * How an A/B send divides its audience.
 *
 * Kept in step with the split the server actually performs (Pro's ABTestService):
 * the sample is a share of the whole audience, each variant takes its share of
 * that sample — never dropping below one contact while the sample can spare it —
 * and the control takes what is left. The rest of the audience waits for the
 * winner.
 */
export interface AudienceSplit {
  audience: number;
  sample: number;
  remainder: number;
  control: number;
  /** Contacts per variant, keyed by variant id. */
  perVariant: Record<string, number>;
  /** Share of the sample the variants claim; over 100 is a misconfiguration. */
  variantShare: number;
}

const clampPercent = (value: unknown): number => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, Math.round(number)));
};

export const audienceSplit = (
  audience: number,
  sampleSize: unknown,
  variants: CampaignVariant[]
): AudienceSplit => {
  const total = Math.max(0, Math.round(Number(audience) || 0));
  const share = Math.max(1, clampPercent(sampleSize));
  const sample =
    total === 0 ? 0 : Math.max(1, Math.round((total * share) / 100));

  const perVariant: Record<string, number> = {};
  let claimed = 0;
  let variantShare = 0;

  variants.forEach((variant) => {
    const percent = clampPercent(variant.test_percentage);
    variantShare += percent;
    const count = Math.floor((sample * percent) / 100);
    perVariant[String(variant.id)] = count;
    claimed += count;
  });

  variants.forEach((variant) => {
    const key = String(variant.id);
    if (perVariant[key] === 0 && claimed < sample) {
      perVariant[key] = 1;
      claimed += 1;
    }
  });

  return {
    audience: total,
    sample,
    remainder: Math.max(0, total - sample),
    control: Math.max(0, sample - claimed),
    perVariant,
    variantShare,
  };
};
