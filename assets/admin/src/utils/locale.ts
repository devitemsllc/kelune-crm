/**
 * Ant Design + dayjs locale loading, keyed off the WordPress site/user locale.
 *
 * PHP exposes the active locale as `window.kelunecrm.locale` (e.g. `fr_FR`,
 * `pt_BR`, `zh_CN`) via `get_user_locale()`. The two libraries name their packs
 * differently and neither naming matches WordPress one-to-one:
 *   - Ant Design ships `language_REGION` packs (`fr_FR`, `zh_CN`), but a few use
 *     a region WordPress never emits (`bel` → `by_BY`, `ckb` → `ku_IQ`).
 *   - dayjs ships lowercase dashed codes (`fr`, `pt-br`, `zh-cn`), and some WP
 *     codes differ (`bel` → `be`).
 *
 * So a plain "split off the language" guess is not enough — WP locales like
 * `bel`, `ckb`, `kmr`, or a bare `zh` resolve to a differently named pack. We
 * keep an explicit loader map per library plus a `wpTo*Alias` table for those
 * mismatches, and try candidates most-specific-first
 * (`de_DE_formal` → `de_DE` → `de`), applying the alias at every level.
 *
 * Loaders use bare-specifier dynamic imports (`import('antd/locale/fr_FR')`) so
 * they survive antd/dayjs upgrades and Vite still emits one lazy chunk per
 * locale — only the one locale a site uses is fetched. English needs no pack
 * (built-in default for both libraries).
 *
 * To add a locale: add the bare-specifier import to the relevant loader map AND,
 * if the WP code differs from the pack name, add a `wpTo*Alias` entry.
 */
import type { Locale } from 'antd/es/locale';
import dayjs from 'dayjs';

type AntdLoader = () => Promise<{ default: Locale }>;
type DayjsLoader = () => Promise<unknown>;

// Every antd locale pack we ship. Keyed by the antd file name.
const antdLocaleLoaders: Record<string, AntdLoader> = {
  ar_EG: () => import('antd/locale/ar_EG'),
  az_AZ: () => import('antd/locale/az_AZ'),
  bg_BG: () => import('antd/locale/bg_BG'),
  bn_BD: () => import('antd/locale/bn_BD'),
  by_BY: () => import('antd/locale/by_BY'),
  ca_ES: () => import('antd/locale/ca_ES'),
  cs_CZ: () => import('antd/locale/cs_CZ'),
  da_DK: () => import('antd/locale/da_DK'),
  de_DE: () => import('antd/locale/de_DE'),
  el_GR: () => import('antd/locale/el_GR'),
  en_GB: () => import('antd/locale/en_GB'),
  en_US: () => import('antd/locale/en_US'),
  es_ES: () => import('antd/locale/es_ES'),
  et_EE: () => import('antd/locale/et_EE'),
  eu_ES: () => import('antd/locale/eu_ES'),
  fa_IR: () => import('antd/locale/fa_IR'),
  fi_FI: () => import('antd/locale/fi_FI'),
  fr_BE: () => import('antd/locale/fr_BE'),
  fr_CA: () => import('antd/locale/fr_CA'),
  fr_FR: () => import('antd/locale/fr_FR'),
  ga_IE: () => import('antd/locale/ga_IE'),
  gl_ES: () => import('antd/locale/gl_ES'),
  he_IL: () => import('antd/locale/he_IL'),
  hi_IN: () => import('antd/locale/hi_IN'),
  hr_HR: () => import('antd/locale/hr_HR'),
  hu_HU: () => import('antd/locale/hu_HU'),
  hy_AM: () => import('antd/locale/hy_AM'),
  id_ID: () => import('antd/locale/id_ID'),
  is_IS: () => import('antd/locale/is_IS'),
  it_IT: () => import('antd/locale/it_IT'),
  ja_JP: () => import('antd/locale/ja_JP'),
  ka_GE: () => import('antd/locale/ka_GE'),
  kk_KZ: () => import('antd/locale/kk_KZ'),
  km_KH: () => import('antd/locale/km_KH'),
  kmr_IQ: () => import('antd/locale/kmr_IQ'),
  kn_IN: () => import('antd/locale/kn_IN'),
  ko_KR: () => import('antd/locale/ko_KR'),
  ku_IQ: () => import('antd/locale/ku_IQ'),
  lt_LT: () => import('antd/locale/lt_LT'),
  lv_LV: () => import('antd/locale/lv_LV'),
  mk_MK: () => import('antd/locale/mk_MK'),
  ml_IN: () => import('antd/locale/ml_IN'),
  mn_MN: () => import('antd/locale/mn_MN'),
  ms_MY: () => import('antd/locale/ms_MY'),
  my_MM: () => import('antd/locale/my_MM'),
  nb_NO: () => import('antd/locale/nb_NO'),
  ne_NP: () => import('antd/locale/ne_NP'),
  nl_BE: () => import('antd/locale/nl_BE'),
  nl_NL: () => import('antd/locale/nl_NL'),
  pl_PL: () => import('antd/locale/pl_PL'),
  pt_BR: () => import('antd/locale/pt_BR'),
  pt_PT: () => import('antd/locale/pt_PT'),
  ro_RO: () => import('antd/locale/ro_RO'),
  ru_RU: () => import('antd/locale/ru_RU'),
  si_LK: () => import('antd/locale/si_LK'),
  sk_SK: () => import('antd/locale/sk_SK'),
  sl_SI: () => import('antd/locale/sl_SI'),
  sr_RS: () => import('antd/locale/sr_RS'),
  sv_SE: () => import('antd/locale/sv_SE'),
  ta_IN: () => import('antd/locale/ta_IN'),
  th_TH: () => import('antd/locale/th_TH'),
  tk_TK: () => import('antd/locale/tk_TK'),
  tr_TR: () => import('antd/locale/tr_TR'),
  uk_UA: () => import('antd/locale/uk_UA'),
  ur_PK: () => import('antd/locale/ur_PK'),
  uz_UZ: () => import('antd/locale/uz_UZ'),
  vi_VN: () => import('antd/locale/vi_VN'),
  zh_CN: () => import('antd/locale/zh_CN'),
  zh_HK: () => import('antd/locale/zh_HK'),
  zh_TW: () => import('antd/locale/zh_TW'),
};

// WordPress region-less codes (e.g. `de`, `uk`) and WP-only codes (`bel`, `ckb`)
// mapped to the antd file that ships them.
const wpToAntdAlias: Record<string, string> = {
  ar: 'ar_EG',
  az: 'az_AZ',
  bel: 'by_BY',
  bg: 'bg_BG',
  bn: 'bn_BD',
  ca: 'ca_ES',
  ckb: 'ku_IQ',
  cs: 'cs_CZ',
  da: 'da_DK',
  de: 'de_DE',
  el: 'el_GR',
  es: 'es_ES',
  et: 'et_EE',
  eu: 'eu_ES',
  fa: 'fa_IR',
  fi: 'fi_FI',
  fr: 'fr_FR',
  ga: 'ga_IE',
  gl: 'gl_ES',
  he: 'he_IL',
  hi: 'hi_IN',
  hr: 'hr_HR',
  hu: 'hu_HU',
  hy: 'hy_AM',
  id: 'id_ID',
  is: 'is_IS',
  it: 'it_IT',
  ja: 'ja_JP',
  ka: 'ka_GE',
  kk: 'kk_KZ',
  km: 'km_KH',
  kmr: 'kmr_IQ',
  kn: 'kn_IN',
  ko: 'ko_KR',
  ku: 'ku_IQ',
  lt: 'lt_LT',
  lv: 'lv_LV',
  mk: 'mk_MK',
  ml: 'ml_IN',
  mn: 'mn_MN',
  ms: 'ms_MY',
  my: 'my_MM',
  nb: 'nb_NO',
  ne: 'ne_NP',
  nl: 'nl_NL',
  pl: 'pl_PL',
  pt: 'pt_PT',
  ro: 'ro_RO',
  ru: 'ru_RU',
  si: 'si_LK',
  sk: 'sk_SK',
  sl: 'sl_SI',
  sr: 'sr_RS',
  sv: 'sv_SE',
  ta: 'ta_IN',
  th: 'th_TH',
  tk: 'tk_TK',
  tr: 'tr_TR',
  uk: 'uk_UA',
  ur: 'ur_PK',
  uz: 'uz_UZ',
  vi: 'vi_VN',
  zh: 'zh_CN',
};

// Every dayjs locale pack we ship. Keyed by the dayjs locale name exactly, so
// `dayjs.locale(<key>)` always targets a registered locale.
const dayjsLocaleLoaders: Record<string, DayjsLoader> = {
  ar: () => import('dayjs/locale/ar'),
  az: () => import('dayjs/locale/az'),
  be: () => import('dayjs/locale/be'),
  bg: () => import('dayjs/locale/bg'),
  bn: () => import('dayjs/locale/bn'),
  ca: () => import('dayjs/locale/ca'),
  cs: () => import('dayjs/locale/cs'),
  da: () => import('dayjs/locale/da'),
  'de-at': () => import('dayjs/locale/de-at'),
  'de-ch': () => import('dayjs/locale/de-ch'),
  de: () => import('dayjs/locale/de'),
  el: () => import('dayjs/locale/el'),
  'en-au': () => import('dayjs/locale/en-au'),
  'en-ca': () => import('dayjs/locale/en-ca'),
  'en-gb': () => import('dayjs/locale/en-gb'),
  es: () => import('dayjs/locale/es'),
  et: () => import('dayjs/locale/et'),
  eu: () => import('dayjs/locale/eu'),
  fa: () => import('dayjs/locale/fa'),
  fi: () => import('dayjs/locale/fi'),
  'fr-ca': () => import('dayjs/locale/fr-ca'),
  fr: () => import('dayjs/locale/fr'),
  ga: () => import('dayjs/locale/ga'),
  gl: () => import('dayjs/locale/gl'),
  he: () => import('dayjs/locale/he'),
  hi: () => import('dayjs/locale/hi'),
  hr: () => import('dayjs/locale/hr'),
  hu: () => import('dayjs/locale/hu'),
  'hy-am': () => import('dayjs/locale/hy-am'),
  id: () => import('dayjs/locale/id'),
  is: () => import('dayjs/locale/is'),
  it: () => import('dayjs/locale/it'),
  ja: () => import('dayjs/locale/ja'),
  ka: () => import('dayjs/locale/ka'),
  kk: () => import('dayjs/locale/kk'),
  km: () => import('dayjs/locale/km'),
  kn: () => import('dayjs/locale/kn'),
  ko: () => import('dayjs/locale/ko'),
  ku: () => import('dayjs/locale/ku'),
  lt: () => import('dayjs/locale/lt'),
  lv: () => import('dayjs/locale/lv'),
  mk: () => import('dayjs/locale/mk'),
  ml: () => import('dayjs/locale/ml'),
  mn: () => import('dayjs/locale/mn'),
  ms: () => import('dayjs/locale/ms'),
  my: () => import('dayjs/locale/my'),
  nb: () => import('dayjs/locale/nb'),
  ne: () => import('dayjs/locale/ne'),
  'nl-be': () => import('dayjs/locale/nl-be'),
  nl: () => import('dayjs/locale/nl'),
  pl: () => import('dayjs/locale/pl'),
  'pt-br': () => import('dayjs/locale/pt-br'),
  pt: () => import('dayjs/locale/pt'),
  ro: () => import('dayjs/locale/ro'),
  ru: () => import('dayjs/locale/ru'),
  si: () => import('dayjs/locale/si'),
  sk: () => import('dayjs/locale/sk'),
  sl: () => import('dayjs/locale/sl'),
  sr: () => import('dayjs/locale/sr'),
  sv: () => import('dayjs/locale/sv'),
  ta: () => import('dayjs/locale/ta'),
  th: () => import('dayjs/locale/th'),
  tk: () => import('dayjs/locale/tk'),
  tr: () => import('dayjs/locale/tr'),
  uk: () => import('dayjs/locale/uk'),
  ur: () => import('dayjs/locale/ur'),
  uz: () => import('dayjs/locale/uz'),
  vi: () => import('dayjs/locale/vi'),
  'zh-cn': () => import('dayjs/locale/zh-cn'),
  'zh-hk': () => import('dayjs/locale/zh-hk'),
  'zh-tw': () => import('dayjs/locale/zh-tw'),
};

// WordPress codes dayjs ships under a different name.
const wpToDayjsAlias: Record<string, string> = {
  bel: 'be',
  ckb: 'ku',
  kmr: 'ku',
  zh: 'zh-cn',
};

/**
 * Build the ordered list of loader keys to try for a WP locale, most-specific
 * first, applying `alias` at every level. `sep` joins the WP `_`-delimited parts
 * (`_` for antd, `-` for dayjs) and `lower` lowercases for dayjs.
 */
function buildCandidates(
  wpLocale: string,
  alias: Record<string, string>,
  sep: string,
  lower: boolean
): string[] {
  const value = lower ? wpLocale.toLowerCase() : wpLocale;
  const parts = value.split('_');
  const list = [parts.join(sep)]; // fr_FR → fr_FR (antd) / fr-fr (dayjs)

  if (parts.length > 2) {
    list.push(parts.slice(0, 2).join(sep)); // de_DE_formal → de_DE / de-de
  }

  if (parts.length > 1) {
    list.push(parts[0]); // fr_FR → fr
  }

  return list.flatMap((name) => (alias[name] ? [name, alias[name]] : [name]));
}

/**
 * Resolve the active locale, load the matching dayjs locale (and set it), and
 * return the Ant Design locale pack for `<ConfigProvider locale=…>`. Returns
 * `undefined` for English or any locale without a matching pack, so callers fall
 * back to the library defaults. Never throws — a failed load leaves the library
 * on its English default.
 */
export async function loadLocale(): Promise<Locale | undefined> {
  const wpLocale = window.kelunecrm?.locale || 'en_US';

  // `en_US` and a bare `en` ARE the built-in defaults for both libraries — skip
  // them. Other English variants (en_GB, en_AU, en_CA, …) still load their own
  // pack: antd ships en_GB and dayjs ships en-gb/en-au/en-ca with the correct
  // week-start and date order, so they must not fall back to US formatting.
  if (wpLocale === 'en_US' || wpLocale === 'en') {
    return undefined;
  }

  // dayjs: load the first matching pack and switch to it.
  for (const name of buildCandidates(wpLocale, wpToDayjsAlias, '-', true)) {
    const loader = dayjsLocaleLoaders[name];

    if (!loader) {
      continue;
    }

    try {
      await loader();
      dayjs.locale(name);
      break;
    } catch {
      // Keep dayjs on its English default and try the next candidate.
    }
  }

  // Ant Design: return the first matching pack for <ConfigProvider>.
  for (const name of buildCandidates(wpLocale, wpToAntdAlias, '_', false)) {
    const loader = antdLocaleLoaders[name];

    if (!loader) {
      continue;
    }

    try {
      const mod = await loader();
      return mod.default;
    } catch {
      // Fall through to the antd English default.
    }
  }

  return undefined;
}
