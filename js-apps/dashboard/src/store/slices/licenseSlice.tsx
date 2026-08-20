import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '..';
import type { LicenseData, LicenseStatus } from '@/types/models';
import { isProActive } from '@hooks/useFeature';

/**
 * Pro license state.
 *
 * The license belongs to the Pro add-on, so with Pro inactive there is nothing
 * to fetch: the slice starts already loaded and inactive, and no gate consults
 * it (see useLicense). With Pro active it starts unloaded and the dashboard
 * blocks on GET /license before rendering anything.
 */
interface LicenseState {
  data: LicenseData | null;
  isActive: boolean;
  isLoaded: boolean;
}

const initialState: LicenseState = {
  data: null,
  isActive: false,
  isLoaded: !isProActive(),
};

const licenseSlice = createSlice({
  name: 'license',
  initialState,
  reducers: {
    setLicense: (state, action: PayloadAction<LicenseStatus>) => {
      state.data = action.payload.data;
      state.isActive = action.payload.active;
      state.isLoaded = true;
    },
    /** Mark the fetch settled with no license (request failed, or none stored). */
    setLicenseLoaded: (state) => {
      state.isLoaded = true;
    },
  },
});

export const { setLicense, setLicenseLoaded } = licenseSlice.actions;

export const selectLicense = (state: RootState): LicenseData | null =>
  state.license.data;
export const selectIsLicenseActive = (state: RootState): boolean =>
  state.license.isActive;
export const selectIsLicenseLoaded = (state: RootState): boolean =>
  state.license.isLoaded;

export default licenseSlice.reducer;
