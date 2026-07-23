import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const C = {
  bg: '#09090f', card: '#111118', border: '#1f1f2e',
  text: '#f1f0ff', sub: '#9896b0', accent: '#7c6aff',
};

export default function IngredientAnalyticsTab() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.wrap}>
        <Text style={styles.title}>Ingredient Analytics</Text>
        <Text style={styles.sub}>
          This feature is currently mocked in the web app and does not yet have a backend endpoint.
          We can still add local UX and connect it once the API is ready.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current status</Text>
          <Text style={styles.bullet}>• Mobile UI scaffold added</Text>
          <Text style={styles.bullet}>• Backend endpoint pending</Text>
          <Text style={styles.bullet}>• Ready for API integration</Text>
        </View>

        <Pressable style={styles.btn}>
          <Text style={styles.btnText}>Coming soon</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  wrap: { flex: 1, padding: 20 },
  title: { color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: C.sub, fontSize: 13, marginTop: 8, lineHeight: 20 },
  card: { marginTop: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  bullet: { color: C.sub, fontSize: 13, lineHeight: 20 },
  btn: { marginTop: 16, backgroundColor: C.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: 0.75 },
  btnText: { color: '#fff', fontWeight: '700' },
});
