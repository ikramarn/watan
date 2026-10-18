import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, View, StyleProp, ViewStyle } from 'react-native';
import { Theme } from '../lib/theme';

interface Props {
  title: string;
  onPress?: () => void;
  theme: Theme;
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
  const bg =
    variant === 'primary'
      ? theme.ctaBg
      : variant === 'danger'
      ? theme.danger
      : variant === 'ghost'
      ? 'transparent'
      : theme.surfaceAlt;
  const color =
    variant === 'primary'
      ? theme.ctaText
      : variant === 'danger'
      ? '#fff'
      : theme.text;
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
