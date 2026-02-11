import { useState, useEffect, useCallback } from 'react';
import { getTheme, setTheme as storeTheme } from '@/shared/storage';
import type { Theme } from '@/shared/storage';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    getTheme().then(setThemeState);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      storeTheme(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme, isDark: theme === 'dark' };
}
