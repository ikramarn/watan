export const passengerTheme = {
  mode: 'light' as const,
  bg: '#FDFDFD',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F4F5',
  text: '#0F172A',
  textDim: '#64748B',
  textFaint: '#94A3B8',
  border: '#E2E8F0',
  ctaBg: '#0F172A',
  ctaText: '#FFFFFF',
  accent: '#2563EB',
  accentSoft: '#DBEAFE',
  success: '#10B981',
  danger: '#EF4444',
  warn: '#F59E0B',
  mapBg: '#E9EEF3',
  mapRoad: '#FFFFFF',
  mapRoadDim: '#D9DFE6',
  driverMarker: '#0F172A',
};

export const driverTheme = {
  mode: 'dark' as const,
  bg: '#09090B',
  surface: '#18181B',
  surfaceAlt: '#27272A',
  text: '#FAFAFA',
  textDim: '#A1A1AA',
  textFaint: '#71717A',
  border: '#27272A',
  ctaBg: '#FACC15',
  ctaText: '#09090B',
  accent: '#FACC15',
  accentSoft: '#3F3306',
  success: '#4ADE80',
  danger: '#F87171',
  warn: '#FBBF24',
  mapBg: '#111113',
  mapRoad: '#27272A',
  mapRoadDim: '#1F1F22',
  driverMarker: '#FACC15',
};

export type Theme = Omit<typeof passengerTheme, 'mode'> & { mode: 'light' | 'dark' };

export const getTheme = (role: 'passenger' | 'driver' | null | undefined): Theme =>
  role === 'driver' ? driverTheme : passengerTheme;
