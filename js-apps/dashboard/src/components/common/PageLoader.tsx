import { Flex, Spin } from 'antd';
import useScreens from '../../hooks/useScreens';

interface PageLoaderProps {
  /** Override the centered area height (defaults to filling the Content shell). */
  minHeight?: number | string;
}

/**
 * Full-area loading state: a centered, default-size spinner that fills the
 * remaining height inside the app Content shell. Use as the route Suspense
 * fallback and for page-level data loads.
 */
const PageLoader = ({ minHeight }: PageLoaderProps) => {
  const { wps } = useScreens();

  return (
    <Flex
      align="center"
      justify="center"
      style={{
        minHeight:
          minHeight ?? (wps ? 'calc(100vh - 297px)' : 'calc(100vh - 242px)'),
      }}
    >
      <Spin style={{ maxHeight: 'unset' }} />
    </Flex>
  );
};

export default PageLoader;
