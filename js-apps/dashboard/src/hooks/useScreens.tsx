import { useMediaQuery } from 'react-responsive';

/**
 * Responsive breakpoints.
 *
 * xs–xxl mirror Ant Design's grid breakpoints (min-widths) so the JS layer and
 * AntD components agree on what "md" etc. mean.
 *
 * `wp` is WordPress-specific: at >= 783px the admin bar is fixed, at <= 782px it
 * scrolls with the page. We key our WP-aware layout off this single threshold.
 */
const BREAKPOINTS = {
  xs: 576,
  sm: 768,
  md: 992,
  lg: 1200,
  xl: 1600,
  wp: 783,
};

/**
 * useScreens — booleans for the current viewport.
 *
 * Mutually-exclusive band flags (xs..xxl) report exactly one active band.
 * `wpl` / `wps` are independent WordPress-admin-bar flags and may overlap a band.
 *
 *   const { md, wps } = useScreens();
 */
const useScreens = () => {
  const xs = useMediaQuery({ maxWidth: BREAKPOINTS.xs - 1 });
  const sm = useMediaQuery({
    minWidth: BREAKPOINTS.xs,
    maxWidth: BREAKPOINTS.sm - 1,
  });
  const md = useMediaQuery({
    minWidth: BREAKPOINTS.sm,
    maxWidth: BREAKPOINTS.md - 1,
  });
  const lg = useMediaQuery({
    minWidth: BREAKPOINTS.md,
    maxWidth: BREAKPOINTS.lg - 1,
  });
  const xl = useMediaQuery({
    minWidth: BREAKPOINTS.lg,
    maxWidth: BREAKPOINTS.xl - 1,
  });
  const xxl = useMediaQuery({ minWidth: BREAKPOINTS.xl });

  // WordPress admin bar: fixed at >= 783px, scrolls at <= 782px.
  const wpl = useMediaQuery({ minWidth: BREAKPOINTS.wp });
  const wps = useMediaQuery({ maxWidth: BREAKPOINTS.wp - 1 });

  return { xs, sm, md, lg, xl, xxl, wpl, wps };
};

export default useScreens;
