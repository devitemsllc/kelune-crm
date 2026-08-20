import { useEffect } from 'react';
import { useDispatch } from '@store/hooks';
import { setLicense, setLicenseLoaded } from '@store/slices/licenseSlice';
import { useLicense } from '@hooks/useLicense';
import api from '@/services/api';
import PageLoader from '@components/common/PageLoader';

/**
 * Fetches the Pro license once at boot and holds the app on a loader until the
 * answer is in — rendering first would flash the dashboard before the gate can
 * redirect an unlicensed install to /license.
 *
 * With Pro inactive the route does not exist, so nothing is requested and the
 * children render immediately.
 */
const LicenseLoader = ({ children }: { children: React.ReactNode }) => {
  const dispatch = useDispatch();
  const { isLicenseRequired, isLicenseLoaded } = useLicense();

  const required = isLicenseRequired();

  useEffect(() => {
    if (!required) {
      return;
    }

    let cancelled = false;

    api.license
      .status()
      .then((response) => {
        if (!cancelled) {
          dispatch(setLicense(response.data));
        }
      })
      .catch(() => {
        // An unreachable endpoint leaves the install unlicensed rather than
        // stuck on the loader; the license page states the outcome.
        if (!cancelled) {
          dispatch(setLicenseLoaded());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, required]);

  if (!isLicenseLoaded()) {
    return <PageLoader />;
  }

  return <>{children}</>;
};

export default LicenseLoader;
