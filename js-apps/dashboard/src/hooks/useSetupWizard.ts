import { useSelector } from '@store/hooks';
import {
  selectSetupFinished,
  selectSetupRunning,
  selectSetupStep,
} from '@store/slices/setupWizardSlice';
import { CAP, can } from '@/utils/capabilities';

/**
 * Read-side helper for the setup wizard. The wizard is shown whenever it has not
 * been finished, or while it is actively running (so the final congratulations
 * step — where `finished` is already true — stays visible until the user
 * leaves). It writes settings, so only someone who may manage them sees it.
 */
export const useSetupWizard = () => {
  const step = useSelector(selectSetupStep);
  const finished = useSelector(selectSetupFinished);
  const running = useSelector(selectSetupRunning);

  return {
    step,
    finished,
    running,
    shouldShowWizard: can(CAP.MANAGE_SETTINGS) && (!finished || running),
  };
};

export default useSetupWizard;
