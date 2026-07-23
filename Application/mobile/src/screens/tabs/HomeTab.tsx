import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const C = {
  bg: '#09090f', card: '#111118', border: '#1f1f2e',
  text: '#f1f0ff', sub: '#9896b0', accent: '#7c6aff', white: '#ffffff',
};

export default function HomeTab({ onNavigate }: { onNavigate: (tab: string) => void }) {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.wrap}>
        <Text style={styles.kicker}>SMART GROCERY NUTRITION</Text>
        <Text style={styles.title}>Nutritionell</Text>
        <Text style={styles.sub}>One photo. Smarter grocery choices.</Text>

        <View style={styles.actions}>
          <Pressable style={styles.primary} onPress={() => onNavigate('scan')}>
            <Text style={styles.primaryText}>Shelf Photo to Insight</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => onNavigate('profile')}>
            <Text style={styles.secondaryText}>Set up Profile</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  wrap: { flex: 1, padding: 24, justifyContent: 'center' },
  kicker: { color: '#22d3a5', fontSize: 14, fontWeight: '800', marginBottom: 16 },
  title: { color: C.text, fontSize: 44, fontWeight: '800', letterSpacing: -1.2 },
  sub: { color: C.sub, fontSize: 22, lineHeight: 30, marginTop: 10, marginBottom: 24, fontWeight: '700' },
  actions: { gap: 12 },
  primary: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: C.white, fontWeight: '800', fontSize: 16 },
  secondary: { borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: C.card },
  secondaryText: { color: C.text, fontWeight: '700', fontSize: 15 },
});
