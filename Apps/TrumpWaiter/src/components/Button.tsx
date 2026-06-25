// Themed button. `disabled` is used heavily to express the offline-disabled state
// for server-authoritative actions (OFFLINE-IMPLEMENTATION.md).
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  hint?: string;
}

export function Button({ label, onPress, variant = 'primary', disabled, loading, hint }: ButtonProps) {
  const isOff = disabled || loading;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(isOff) }}
        onPress={onPress}
        disabled={isOff}
        style={({ pressed }) => [
          styles.base,
          variantStyle[variant],
          isOff && styles.disabled,
          pressed && !isOff && styles.pressed
        ]}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'ghost' ? theme.colors.gold : '#0b0b0c'} />
        ) : (
          <Text style={[styles.label, variant === 'ghost' && styles.ghostLabel]}>{label}</Text>
        )}
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const variantStyle: Record<Variant, object> = {
  primary: { backgroundColor: theme.colors.gold },
  secondary: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, borderWidth: 1 },
  danger: { backgroundColor: theme.colors.red },
  ghost: { backgroundColor: 'transparent', borderColor: theme.colors.gold, borderWidth: 1 }
};

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.lg
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  label: { color: '#0b0b0c', fontSize: theme.font.md, fontWeight: '700' },
  ghostLabel: { color: theme.colors.gold },
  hint: { color: theme.colors.textDim, fontSize: theme.font.sm, marginTop: theme.space.xs, textAlign: 'center' }
});
