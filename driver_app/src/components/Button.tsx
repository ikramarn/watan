import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, View, StyleProp, ViewStyle } from 'react-native';
import { Theme, getTheme } from '../lib/theme';

interface Props {
  title: string;
  onPress?: () => void;
  theme?: Theme;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export default function Button({
  title,
  onPress,
  theme,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  testID,
}: Props) {
  const activeTheme = theme || getTheme('driver');
  const bg =
    variant === 'primary'
      ? activeTheme.ctaBg
      : variant === 'danger'
      ? activeTheme.danger
      : variant === 'ghost'
      ? 'transparent'
      : activeTheme.surfaceAlt;
  const color =
    variant === 'primary'
      ? activeTheme.ctaText
      : variant === 'danger'
      ? '#fff'
      : activeTheme.text;
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.85}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        {
          height: 56,
          borderRadius: 18,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: disabled ? 0.5 : 1,
          paddingHorizontal: 20,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text style={{ color, fontSize: 17, fontWeight: '600' }}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}
