import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { LightColors, DarkColors } from './colors';

type ThemeMode = 'light' | 'dark' | 'system';
type ThemeName = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  theme: ThemeName;
  colors: typeof LightColors;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const [resolvedTheme, setResolvedTheme] = useState<ThemeName>('light');

  useEffect(() => {
    if (themeMode === 'system') {
      setResolvedTheme(systemScheme === 'dark' ? 'dark' : 'light');
    } else {
      setResolvedTheme(themeMode);
    }
  }, [themeMode, systemScheme]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
  };

  const colors = resolvedTheme === 'dark' ? DarkColors : LightColors;

  return (
    <ThemeContext.Provider value={{ themeMode, theme: resolvedTheme, colors, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
