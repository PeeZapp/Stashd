import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type ThemeName = 'default' | 'plum' | 'chocolate' | 'midnight';

export interface ThemeDefinition {
  id: ThemeName;
  label: string;
  description: string;
  primary: string;
  bg: string;
  accent: string;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'default',
    label: 'Charcoal',
    description: 'Clean & minimal',
    primary: '#111827',
    bg: '#F9FAFB',
    accent: '#C9956C',
  },
  {
    id: 'plum',
    label: 'Plum Noir',
    description: 'Plum · Champagne · Rose Gold',
    primary: '#3D1C3A',
    bg: '#F5ECD7',
    accent: '#C9956C',
  },
  {
    id: 'chocolate',
    label: 'Quiet Luxury',
    description: 'Chocolate · Blush · Mauve',
    primary: '#3B2314',
    bg: '#F0D5C8',
    accent: '#987284',
  },
  {
    id: 'midnight',
    label: 'Midnight Classic',
    description: 'Black · Ivory · Gold',
    primary: '#1A1A1A',
    bg: '#FAF6EF',
    accent: '#C9A84C',
  },
];

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const stored = localStorage.getItem('stashd-theme') as ThemeName | null;
    const initial = stored && ['default', 'plum', 'chocolate', 'midnight'].includes(stored)
      ? stored
      : 'default';
    applyTheme(initial);
    return initial;
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('stashd-theme', theme);
  }, [theme]);

  const setTheme = (t: ThemeName) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
