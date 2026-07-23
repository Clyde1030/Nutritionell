import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ENDPOINTS } from '../../config';

const C = {
  bg: '#09090f', card: '#111118', border: '#1f1f2e', surface: '#16161f',
  text: '#f1f0ff', sub: '#9896b0', accent: '#7c6aff', green: '#22d3a5', yellow: '#f59e0b', red: '#ff5c7a',
};

type ClaimVerdict = { claim: string; verdict: 'true' | 'false' | 'misleading'; explanation: string };
type GreenwashResult = {
  image_status: 'single_product' | 'multiple_products' | 'unidentifiable';
  status_detail: string;
  product_name: string | null;
  overall_score: number | null;
  verdict: string;
  claims: ClaimVerdict[];
};

export default function GreenwashingTab() {
  const [loading, setLoading] = useState(false);
  const [imageUri, setImageUri] = useState('');
  const [result, setResult] = useState<GreenwashResult | null>(null);

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
    if (!r.canceled && r.assets[0]) analyze(r.assets[0].uri, r.assets[0].mimeType ?? 'image/jpeg');
  };

  const analyze = async (uri: string, mime = 'image/jpeg') => {
    setLoading(true);
    setResult(null);
    setImageUri(uri);
    try {
      const fd = new FormData();
      fd.append('image', { uri, name: 'product.jpg', type: mime } as any);
      const res = await fetch(ENDPOINTS.greenwashingAnalyze, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail ?? data.error ?? `Server ${res.status}`);
      setResult(data as GreenwashResult);
    } catch (e: any) {
      Alert.alert('Analysis failed', e.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (s: number | null) => (s == null ? C.sub : s >= 70 ? C.green : s >= 40 ? C.yellow : C.red);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Greenwashing Detection</Text>
        <Text style={styles.sub}>Upload one product front-label photo to check claim honesty.</Text>

        <Pressable style={styles.uploadBtn} onPress={pick}>
          <Text style={styles.uploadBtnText}>Select Product Photo</Text>
        </Pressable>

        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator color={C.accent} size="large" />
            <Text style={styles.sub}>Analyzing claims…</Text>
          </View>
        )}

        {!!imageUri && (
          <View style={styles.imageWrap}>
            <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
          </View>
        )}

        {result && (
          <View style={styles.card}>
            <Text style={styles.product}>{result.product_name ?? 'Unknown product'}</Text>
            {result.overall_score != null && (
              <Text style={[styles.score, { color: scoreColor(result.overall_score) }]}>
                Honesty Score: {result.overall_score}/100
              </Text>
            )}
            <Text style={styles.verdict}>{result.verdict}</Text>

            {result.claims?.length ? (
              <View style={{ marginTop: 10 }}>
                {result.claims.map((c, i) => (
                  <View key={i} style={styles.claimRow}>
                    <Text style={styles.claimTitle}>{c.claim}</Text>
                    <Text style={styles.claimBody}>{c.explanation}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  title: { color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: C.sub, fontSize: 13, marginTop: 6 },
  uploadBtn: { marginTop: 18, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', paddingVertical: 14 },
  uploadBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  centered: { alignItems: 'center', gap: 10, marginTop: 18 },
  imageWrap: { marginTop: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 10 },
  image: { width: '100%', height: 240, borderRadius: 10 },
  card: { marginTop: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14 },
  product: { color: C.text, fontSize: 17, fontWeight: '800' },
  score: { marginTop: 8, fontSize: 16, fontWeight: '800' },
  verdict: { color: C.sub, marginTop: 8, lineHeight: 20 },
  claimRow: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  claimTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  claimBody: { color: C.sub, marginTop: 4, lineHeight: 19, fontSize: 12.5 },
});
