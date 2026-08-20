import { useSelector } from '@store/hooks';
import {
  selectIsLicenseActive,
  selectIsLicenseLoaded,
  selectLicense,
} from '@store/slices/licenseSlice';
import { isProActive } from '@hooks/useFeature';

/**
 * Read-side helper for the Pro license.
 *
 * `isLicenseRequired` is the switch every gate hangs off: only an active Pro
 * add-on has a license to check, so a Free-only install is never blocked.
 */
export const useLicense = () => {
  const data = useSelector(selectLicense);
  const active = useSelector(selectIsLicenseActive);
  const loaded = useSelector(selectIsLicenseLoaded);

  const required = isProActive();

  return {
    getLicense: () => data,
    isLicenseRequired: () => required,
    isLicenseLoaded: () => loaded,
    isLicenseActive: () => loaded && active,
    isLicenseValid: () => loaded && active && !!data?.is_valid,
    /** Pro is active but unlicensed (or the license went invalid). */
    isLicenseBlocked: () => required && loaded && !(active && !!data?.is_valid),
  };
};

export default useLicense;
