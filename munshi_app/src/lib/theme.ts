export const munshiTheme = {
  mode: 'dark' as const,
  bg: '#090D16',
  surface: '#0F1626',
  surfaceAlt: '#162033',
  surfaceContainerLow: '#0C121E',
  surfaceContainerHigh: '#1A263D',
  text: '#F8FAFC',
  textDim: '#94A3B8',
  textFaint: '#64748B',
  border: '#1E293B',
  ctaBg: '#10B981',
  ctaText: '#090D16',
  accent: '#10B981',
  accentDark: '#059669',
  accentSoft: '#064E3B',
  gold: '#F59E0B',
  goldDark: '#78350F',
  goldSoft: '#FBBF24',
  success: '#10B981',
  danger: '#EF4444',
  warn: '#F59E0B',
  primary: '#10B981',
  secondary: '#F59E0B',
};

export type Theme = typeof munshiTheme;
export const getTheme = (): Theme => munshiTheme;
