import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AppPalette } from '../../theme/palettes';

const C = {
  bg: '#09090f', card: '#111118', border: '#1f1f2e',
  text: '#f1f0ff', sub: '#9896b0', accent: '#7c6aff',
};

export default function IngredientAnalyticsTab({ palette }: { palette: AppPalette }) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]} edges={['bottom']}>
      <View style={styles.wrap}>
        <Text style={[styles.title, { color: palette.text }]}>Ingredient Analytics</Text>
        <Text style={[styles.sub, { color: palette.sub }]}> 
          This feature is currently mocked in the web app and does not yet have a backend endpoint.
          We can still add local UX and connect it once the API is ready.
        </Text>

        <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>Current status</Text>
          <Text style={[styles.bullet, { color: palette.sub }]}>• Mobile UI scaffold added</Text>
          <Text style={[styles.bullet, { color: palette.sub }]}>• Backend endpoint pending</Text>
          <Text style={[styles.bullet, { color: palette.sub }]}>• Ready for API integration</Text>
        </View>

        <Pressable style={[styles.btn, { backgroundColor: palette.accent }]}>
          <Text style={styles.btnText}>Coming soon</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1, padding: 20 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 13, marginTop: 8, lineHeight: 20 },
  card: { marginTop: 18, borderWidth: 1, borderRadius: 14, padding: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  bullet: { fontSize: 13, lineHeight: 20 },
  btn: { marginTop: 16, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: 0.75 },
  btnText: { color: '#fff', fontWeight: '700' },
});
