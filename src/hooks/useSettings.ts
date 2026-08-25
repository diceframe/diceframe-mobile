import { useSettingsStore } from '@/stores/settings';

export const useSettings = () => {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const token = useSettingsStore((state) => state.token);
  const ttsRate = useSettingsStore((state) => state.ttsRate);
  const themeMode = useSettingsStore((state) => state.themeMode);
  const setBaseUrl = useSettingsStore((state) => state.setBaseUrl);
  const setToken = useSettingsStore((state) => state.setToken);
  const setTtsRate = useSettingsStore((state) => state.setTtsRate);
  const setThemeMode = useSettingsStore((state) => state.setThemeMode);

  return { 
    settings: { baseUrl, token, ttsRate, themeMode },
    updateSetting: (newSettings: any) => {
      if (newSettings.baseUrl) setBaseUrl(newSettings.baseUrl);
      if (newSettings.token) setToken(newSettings.token);
      if (newSettings.ttsRate) setTtsRate(newSettings.ttsRate);
      if (newSettings.themeMode) setThemeMode(newSettings.themeMode);
    }
  };
};
