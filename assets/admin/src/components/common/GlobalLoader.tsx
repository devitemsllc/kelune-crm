import { Spin } from 'antd';
import { useSelector } from '@store/hooks';
import { selectIsGlobalLoading } from '../../store/slices/globalLoadingSlice';

/**
 * Single app-wide blocking overlay. Renders once near the app root and reacts to
 * the `globalLoading` slice. Toggle it with `startGlobalLoading` /
 * `stopGlobalLoading` around long, navigation-blocking operations.
 */
const GlobalLoader = () => {
  const isLoading = useSelector(selectIsGlobalLoading);

  return <Spin fullscreen spinning={isLoading} />;
};

export default GlobalLoader;
