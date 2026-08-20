import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '..';

/**
 * First-run setup wizard state.
 *
 * `step` / `finished` are persisted server-side inside the settings blob
 * (SettingsService: setup_wizard_step / setup_wizard_finished) and shipped to
 * the client at boot via `window.kelunecrm.settings`. `running` is
 * client-only: it keeps the wizard mounted through the final congratulations
 * step (where `finished` is already true) until the user chooses to leave, and
 * defaults to false so a reload after completion never re-opens the wizard.
 */
interface SetupWizardState {
  step: number;
  finished: boolean;
  running: boolean;
}

/** wp_localize_script may hand booleans/ints back as strings; coerce defensively. */
const toBool = (value: unknown): boolean =>
  value === true || value === 1 || value === '1' || value === 'true';

const toStep = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

const seed = (): SetupWizardState => {
  const settings = window.kelunecrm?.settings ?? {};
  return {
    step: toStep(settings.setup_wizard_step),
    finished: toBool(settings.setup_wizard_finished),
    running: false,
  };
};

const setupWizardSlice = createSlice({
  name: 'setupWizard',
  initialState: seed,
  reducers: {
    setSetupStep: (state, action: PayloadAction<number>) => {
      state.step = action.payload;
    },
    setSetupFinished: (state, action: PayloadAction<boolean>) => {
      state.finished = action.payload;
    },
    setSetupRunning: (state, action: PayloadAction<boolean>) => {
      state.running = action.payload;
    },
  },
});

export const { setSetupStep, setSetupFinished, setSetupRunning } =
  setupWizardSlice.actions;

export const selectSetupStep = (state: RootState): number =>
  state.setupWizard.step;
export const selectSetupFinished = (state: RootState): boolean =>
  state.setupWizard.finished;
export const selectSetupRunning = (state: RootState): boolean =>
  state.setupWizard.running;

export default setupWizardSlice.reducer;
