import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AppPalette } from '../../theme/palettes';
import { PALETTES } from '../../theme/palettes';

type Props = {
  activePaletteName: string;
  palette: AppPalette;
  onSelectPalette: (name: string) => void;
};

export default function AppearanceTab({ activePaletteName, palette, onSelectPalette }: Props) {

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={[styles.title, { color: palette.text }]}>Appearance</Text>
        <Text style={[styles.sub, { color: palette.sub }]}>Palette updates now apply to the app shell and selected tabs on this device.</Text>

        {PALETTES.map((palette) => {
          const activeState = activePaletteName === palette.name;
          return (
            <Pressable
              key={palette.name}
              onPress={() => onSelectPalette(palette.name)}
              style={[
                styles.row,
                { borderColor: palette.border, backgroundColor: palette.card },
                activeState && { borderColor: palette.accent, backgroundColor: palette.accent + '22' },
              ]}
            >
              <View style={[styles.swatch, { backgroundColor: palette.bg, borderColor: palette.border }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: palette.text }, activeState && { color: palette.accent }]}>{palette.name}</Text>
                <View style={styles.tokenRow}>
                  <View style={[styles.token, { backgroundColor: palette.accent }]} />
                  <View style={[styles.token, { backgroundColor: palette.card }]} />
                  <View style={[styles.token, { backgroundColor: palette.bar }]} />
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  sub: { marginTop: 8, marginBottom: 14, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  swatch: { width: 28, height: 28, borderRadius: 8, borderWidth: 1 },
  name: { fontWeight: '700' },
  tokenRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  token: { width: 18, height: 6, borderRadius: 4 },
});
