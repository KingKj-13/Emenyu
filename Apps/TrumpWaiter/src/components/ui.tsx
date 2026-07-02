// Small shared primitives: Card, Field (text input), EmptyState, Pill, Row.
import React from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Pill({ label, color }: { label: string; color?: string }) {
  return (
    <View style={[styles.pill, { borderColor: color ?? theme.colors.border }]}>
      <Text style={[styles.pillText, { color: color ?? theme.colors.textDim }]}>{label}</Text>
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = 'none',
  keyboardType
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'numeric';
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textDim}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
      />
    </View>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.space.lg,
    gap: theme.space.sm
  },
  h1: { color: theme.colors.text, fontSize: theme.font.xxl, fontWeight: '800' },
  h2: { color: theme.colors.text, fontSize: theme.font.lg, fontWeight: '700' },
  muted: { color: theme.colors.textDim, fontSize: theme.font.sm },
  body: { color: theme.colors.text, fontSize: theme.font.md },
  pill: { borderWidth: 1, borderRadius: theme.radius.pill, paddingHorizontal: theme.space.md, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: theme.font.sm, fontWeight: '700' },
  fieldWrap: { gap: theme.space.xs },
  fieldLabel: { color: theme.colors.textDim, fontSize: theme.font.sm, fontWeight: '600' },
  input: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    color: theme.colors.text,
    fontSize: theme.font.md,
    paddingHorizontal: theme.space.md,
    minHeight: 48
  },
  empty: { alignItems: 'center', justifyContent: 'center', padding: theme.space.xxl, gap: theme.space.xs },
  emptyTitle: { color: theme.colors.text, fontSize: theme.font.lg, fontWeight: '700' }
});
