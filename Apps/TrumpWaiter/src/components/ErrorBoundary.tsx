// Phase 08 (SRE1) — top-level error boundary for the waiter app. Without it, a single
// render error white-screens the app mid-service. This catches it and shows a recoverable
// fallback (the data is safe on the server) with a Try again button.
import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error?.message, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app hit an unexpected error. Your data is safe on the server. Tap to try again.
        </Text>
        <Pressable onPress={this.reset} style={styles.btn} accessibilityRole="button">
          <Text style={styles.btnLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: theme.colors.bg },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: '800' },
  body: { color: theme.colors.textDim, fontSize: 15, textAlign: 'center', maxWidth: 320 },
  btn: { minHeight: 48, paddingHorizontal: 24, borderRadius: 12, backgroundColor: theme.colors.gold, alignItems: 'center', justifyContent: 'center' },
  btnLabel: { color: '#0b0b0c', fontSize: 15, fontWeight: '700' }
});
