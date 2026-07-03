// Dismissible "Update available" banner. On launch the app asks the server for the
// latest published waiter-app version (GET /api/config → waiterLatestVersion) and,
// if the installed build is older, shows a tap-to-download bar linking to the APK.
// This covers NEW APK releases (native changes) that can't ship over-the-air; small
// JS fixes still arrive silently via expo-updates. Dismissal is remembered per
// version so the same release never nags twice.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from '../api/apiClient';
import { EP } from '../api/endpoints';
import { APP_VERSION } from '../config';
import { theme } from './theme';

const DISMISS_KEY = 'trumpwaiter.dismissedUpdateVersion';

type PublicConfig = { waiterLatestVersion?: string; waiterApkUrl?: string };

// Compare dotted numeric versions: returns true when `latest` is strictly newer
// than `installed`. Non-numeric / missing segments are treated as 0 so a malformed
// version never triggers a false prompt.
export function isNewerVersion(latest: string, installed: string): boolean {
  const parse = (v: string) => String(v || '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(installed);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

export function UpdateBanner() {
  const insets = useSafeAreaInsets();
  const [latest, setLatest] = useState<string | null>(null);
  const [apkUrl, setApkUrl] = useState<string>('');
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Public endpoint — no token needed; fail silent (an update prompt is never
        // worth interrupting the app for).
        const cfg = await apiRequest<PublicConfig>(EP.config, { anonymous: true, allowOffline: true });
        const newest = cfg?.waiterLatestVersion || '';
        if (!newest || !isNewerVersion(newest, APP_VERSION)) return;
        const dismissed = await AsyncStorage.getItem(DISMISS_KEY);
        if (dismissed === newest) return; // already dismissed this exact release
        if (cancelled) return;
        setLatest(newest);
        setApkUrl(cfg?.waiterApkUrl || '');
        setHidden(false);
      } catch {
        /* offline / server down — no banner */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (hidden || !latest) return null;

  const onDownload = () => {
    if (apkUrl) Linking.openURL(apkUrl).catch(() => {});
  };
  const onDismiss = async () => {
    setHidden(true);
    try { await AsyncStorage.setItem(DISMISS_KEY, latest); } catch { /* best effort */ }
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={styles.title}>Update available</Text>
          <Text style={styles.sub}>Version {latest} is ready to install</Text>
        </View>
        <Pressable style={styles.download} onPress={onDownload} accessibilityRole="button">
          <Text style={styles.downloadText}>Download</Text>
        </Pressable>
        <Pressable style={styles.dismiss} onPress={onDismiss} accessibilityLabel="Dismiss update banner" hitSlop={8}>
          <Text style={styles.dismissText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1, borderBottomColor: theme.colors.gold,
    paddingHorizontal: theme.space.lg, paddingBottom: theme.space.md
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  textCol: { flex: 1 },
  title: { color: theme.colors.gold, fontSize: theme.font.md, fontWeight: '800' },
  sub: { color: theme.colors.textDim, fontSize: theme.font.sm },
  download: {
    backgroundColor: theme.colors.gold, borderRadius: theme.radius.sm,
    paddingHorizontal: theme.space.md, paddingVertical: 8
  },
  downloadText: { color: '#0b0b0c', fontWeight: '800', fontSize: theme.font.sm },
  dismiss: { paddingHorizontal: 6, paddingVertical: 6 },
  dismissText: { color: theme.colors.textDim, fontSize: theme.font.md, fontWeight: '700' }
});
