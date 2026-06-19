import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, LayoutChangeEvent,
  Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ENDPOINTS, USE_MOCK_ANALYZE } from '../../config';
import { useProfileId } from '../../hooks/useProfile';
import ProductDetailCard from '../../components/ProductDetailCard';
import type { ProductItem, ScoreEnum, ShelfAnalysisResponse } from '../../types';
import { NOVA_COLORS, NOVA_LABELS, SCORE_BG, SCORE_COLORS } from '../../types';

const C = {
  bg: '#09090f', card: '#111118', border: '#1f1f2e', surface: '#16161f',
  text: '#f1f0ff', sub: '#9896b0', accent: '#7c6aff', white: '#ffffff',
  green: '#22d3a5',
};

// Native-only camera import — safe to require conditionally
let CameraView: any = null;
let useCameraPermissions: any = () => [null, () => {}];
if (Platform.OS !== 'web') {
  try {
    const cam = require('expo-camera');
    CameraView = cam.CameraView;
    useCameraPermissions = cam.useCameraPermissions;
  } catch {}
}

type View = 'picker' | 'camera' | 'analyzing' | 'results';

export default function ScanTab() {
  const { profileId } = useProfileId();
  const [permission, requestPermission] = useCameraPermissions();
  const [view, setView] = useState<View>('picker');
  const [statusText, setStatusText] = useState('');
  const [imageUri, setImageUri] = useState('');
  const [result, setResult] = useState<ShelfAnalysisResponse | null>(null);
  const [imageLayout, setImageLayout] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<ProductItem | null>(null);

  // ── Core analyze function ─────────────────────────────────────────────────
  const analyze = async (uri: string, mimeType = 'image/jpeg') => {
    if (!profileId) {
      Alert.alert('Profile required', 'Set up your profile in the Profile tab first.');
      return;
    }
    setView('analyzing');
    setStatusText('Uploading image…');

    try {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        // On web, uri is a blob: URL — fetch and convert to File
        const resp = await fetch(uri);
        const blob = await resp.blob();
        formData.append('image', blob, 'shelf.jpg');
      } else {
        formData.append('image', { uri, name: 'shelf.jpg', type: mimeType } as any);
      }
      formData.append('profile_id', profileId);

      setStatusText('Identifying products…');
      const url = USE_MOCK_ANALYZE ? ENDPOINTS.analyzeMock : ENDPOINTS.analyze;
      const r = await fetch(url, { method: 'POST', body: formData });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail ?? `Server error ${r.status}`);
      }

      setStatusText('Scoring against your profile…');
      const data: ShelfAnalysisResponse = await r.json();
      setImageUri(uri);
      setResult(data);
      setView('results');
    } catch (e: any) {
      Alert.alert('Analysis failed', e.message ?? 'Unknown error. Is the backend running?');
      setView('picker');
    }
  };

  const pickFromLibrary = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
    });
    if (!r.canceled && r.assets[0]) {
      analyze(r.assets[0].uri, r.assets[0].mimeType ?? 'image/jpeg');
    }
  };

  const openCamera = async () => {
    if (Platform.OS === 'web') {
      // Web: use image picker with camera capture
      const r = await ImagePicker.launchCameraAsync({ quality: 0.9 });
      if (!r.canceled && r.assets[0]) analyze(r.assets[0].uri);
      return;
    }
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) { Alert.alert('Permission needed', 'Camera access is required.'); return; }
    }
    setView('camera');
  };

  // ── Analyzing state ───────────────────────────────────────────────────────
  if (view === 'analyzing') {
    return (
      <View style={styles.fill}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.analyzingTitle}>Analyzing shelf</Text>
        <Text style={styles.analyzingStatus}>{statusText}</Text>
        <View style={styles.dots}>
          {[0, 1, 2].map(i => <View key={i} style={styles.dot} />)}
        </View>
      </View>
    );
  }

  // ── Native camera view ────────────────────────────────────────────────────
  if (view === 'camera' && CameraView && Platform.OS !== 'web') {
    return <NativeCameraView
      onCapture={analyze}
      onBack={() => setView('picker')}
      permission={permission}
      requestPermission={requestPermission}
    />;
  }

  // ── Results view ──────────────────────────────────────────────────────────
  if (view === 'results' && result) {
    const counts = result.products.reduce((acc, p) => {
      const s = p.scoring as ScoreEnum;
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {} as Record<ScoreEnum, number>);

    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* Annotated image */}
          <View style={styles.imageWrap}
            onLayout={(e: LayoutChangeEvent) => {
              const { width, height } = e.nativeEvent.layout;
              setImageLayout({ width, height });
            }}>
            <Image source={{ uri: imageUri }} style={styles.resultImage} resizeMode="contain" />
            {imageLayout.width > 0 && result.products.map((p, i) => {
              const [ymin, xmin, ymax, xmax] = p.bounding_box;
              const color = SCORE_COLORS[p.scoring as ScoreEnum];
              return (
                <Pressable key={i} onPress={() => setSelected(p)} style={[styles.bbox, {
                  top: ymin * imageLayout.height, left: xmin * imageLayout.width,
                  width: (xmax - xmin) * imageLayout.width, height: (ymax - ymin) * imageLayout.height,
                  borderColor: color,
                }]}>
                  <View style={[styles.bboxBadge, { backgroundColor: color }]}>
                    <Text style={styles.bboxText}>{p.scoring[0]}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Score summary + rescan */}
          <View style={styles.summaryBar}>
            {(['Great', 'OK', 'Avoid', 'Unidentified'] as ScoreEnum[]).map(s =>
              counts[s] ? (
                <View key={s} style={[styles.chip, { borderColor: SCORE_COLORS[s] }]}>
                  <Text style={[styles.chipCount, { color: SCORE_COLORS[s] }]}>{counts[s]}</Text>
                  <Text style={styles.chipLabel}>{s}</Text>
                </View>
              ) : null
            )}
            <Pressable style={styles.newScanBtn} onPress={() => { setResult(null); setView('picker'); }}>
              <Text style={styles.newScanText}>New scan</Text>
            </Pressable>
          </View>

          <Text style={styles.listHeader}>Products — tap for details</Text>
          {result.products.map((p, i) => <ProductRow key={i} product={p} onPress={() => setSelected(p)} />)}
        </ScrollView>
        <ProductDetailCard product={selected} onClose={() => setSelected(null)} />
      </SafeAreaView>
    );
  }

  // ── Picker / home view ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.pickerScreen}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pageTitle}>Scan a Shelf</Text>
          <Text style={styles.pageSub}>Take a photo or upload one from your library</Text>
        </View>

        {/* Big action buttons */}
        <View style={styles.actionCards}>
          <Pressable style={styles.actionCard} onPress={openCamera}>
            <Text style={styles.actionCardIcon}>📷</Text>
            <Text style={styles.actionCardTitle}>Take Photo</Text>
            <Text style={styles.actionCardSub}>Use your camera</Text>
          </Pressable>
          <Pressable style={styles.actionCard} onPress={pickFromLibrary}>
            <Text style={styles.actionCardIcon}>🖼️</Text>
            <Text style={styles.actionCardTitle}>Upload Image</Text>
            <Text style={styles.actionCardSub}>From your library</Text>
          </Pressable>
        </View>

        {/* How it works */}
        <View style={styles.howItWorks}>
          <Text style={styles.howTitle}>How it works</Text>
          {[
            ['1', 'Snap or upload a photo of a grocery shelf'],
            ['2', 'AI identifies every product and reads the label'],
            ['3', 'Products are scored against your exact profile'],
            ['4', 'Tap any product for full nutrition details'],
          ].map(([n, t]) => (
            <View key={n} style={styles.howRow}>
              <View style={styles.howNum}><Text style={styles.howNumText}>{n}</Text></View>
              <Text style={styles.howText}>{t}</Text>
            </View>
          ))}
        </View>

        {!profileId && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>⚠️  Set up your profile first for personalised scoring</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Native camera sub-component ───────────────────────────────────────────────
function NativeCameraView({ onCapture, onBack, permission, requestPermission }: {
  onCapture: (uri: string, mime: string) => void;
  onBack: () => void;
  permission: any;
  requestPermission: () => Promise<any>;
}) {
  const camRef = React.useRef<any>(null);
  const [capturing, setCapturing] = useState(false);

  if (!permission?.granted) {
    return (
      <View style={styles.fill}>
        <Text style={styles.permText}>Camera access needed to scan shelves</Text>
        <Pressable style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Access</Text>
        </Pressable>
        <Pressable onPress={onBack} style={{ marginTop: 12 }}>
          <Text style={{ color: C.sub }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const capture = async () => {
    if (!camRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await camRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) onCapture(photo.uri, 'image/jpeg');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {CameraView && (
        <CameraView ref={camRef} style={{ flex: 1 }} facing="back">
          {/* Back button */}
          <Pressable style={styles.camBack} onPress={onBack}>
            <Text style={styles.camBackText}>← Back</Text>
          </Pressable>
          {/* Guide frame */}
          <View style={styles.frame} pointerEvents="none">
            {['TL','TR','BL','BR'].map(pos => (
              <View key={pos} style={[styles.corner,
                pos.includes('T') ? { top: 0 } : { bottom: 0 },
                pos.includes('L') ? { left: 0 } : { right: 0 },
                { borderTopWidth: pos.includes('T') ? 3 : 0, borderBottomWidth: pos.includes('B') ? 3 : 0,
                  borderLeftWidth: pos.includes('L') ? 3 : 0, borderRightWidth: pos.includes('R') ? 3 : 0 },
              ]} />
            ))}
          </View>
          {/* Shutter */}
          <View style={styles.shutterRow}>
            <Pressable style={styles.shutter} onPress={capture} disabled={capturing}>
              {capturing
                ? <ActivityIndicator color="#000" />
                : <View style={styles.shutterInner} />
              }
            </Pressable>
          </View>
        </CameraView>
      )}
    </View>
  );
}

// ── ProductRow ────────────────────────────────────────────────────────────────
function ProductRow({ product, onPress }: { product: ProductItem; onPress: () => void }) {
  const color = SCORE_COLORS[product.scoring as ScoreEnum];
  const bg = SCORE_BG[product.scoring as ScoreEnum];
  return (
    <Pressable onPress={onPress} style={[styles.productRow, { borderLeftColor: color }]}>
      <View style={styles.productTop}>
        <View style={[styles.scorePill, { backgroundColor: bg, borderColor: color }]}>
          <Text style={[styles.scorePillText, { color }]}>{product.scoring}</Text>
        </View>
        {product.processing_level != null && (
          <View style={[styles.novaTag, { borderColor: NOVA_COLORS[product.processing_level] }]}>
            <Text style={[styles.novaTagText, { color: NOVA_COLORS[product.processing_level] }]}>
              NOVA {product.processing_level} · {NOVA_LABELS[product.processing_level]}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.productBrand}>{product.brand}</Text>
      <Text style={styles.productName}>{product.product_name}</Text>
      {product.reasoning_by_factor.length > 0
        ? product.reasoning_by_factor.map((f, i) => <Text key={i} style={styles.factor}>{f}</Text>)
        : <Text style={styles.factor}>{product.reasoning}</Text>
      }
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  fill: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 14 },
  analyzingTitle: { color: C.text, fontSize: 22, fontWeight: '700' },
  analyzingStatus: { color: C.sub, fontSize: 14 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },

  // Picker / home
  pickerScreen: { flex: 1, padding: 20 },
  pickerHeader: { marginBottom: 28 },
  pageTitle: { color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  pageSub: { color: C.sub, fontSize: 13, marginTop: 4 },
  actionCards: { flexDirection: 'row', gap: 12 },
  actionCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 18,
    borderWidth: 1, borderColor: C.border, padding: 20,
    alignItems: 'center', gap: 8,
  },
  actionCardIcon: { fontSize: 36 },
  actionCardTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  actionCardSub: { color: C.sub, fontSize: 12 },
  howItWorks: {
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
    borderColor: C.border, padding: 16, marginTop: 24, gap: 12,
  },
  howTitle: { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  howNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.accent + '33', alignItems: 'center', justifyContent: 'center',
  },
  howNumText: { color: C.accent, fontSize: 12, fontWeight: '800' },
  howText: { color: C.sub, fontSize: 13, flex: 1 },
  warningCard: {
    backgroundColor: '#1a0d0d', borderWidth: 1, borderColor: '#4a1515',
    borderRadius: 12, padding: 12, marginTop: 16,
  },
  warningText: { color: '#f87171', fontSize: 13 },

  // Native camera
  camBack: { position: 'absolute', top: 50, left: 16, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  camBackText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  frame: { position: 'absolute', top: '20%', left: '5%', right: '5%', bottom: '22%' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: C.accent },
  shutterRow: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center' },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  permText: { color: C.sub, fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
  permBtn: { backgroundColor: C.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12, marginTop: 12 },
  permBtnText: { color: C.white, fontWeight: '700', fontSize: 15 },

  // Results
  imageWrap: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#000', position: 'relative' },
  resultImage: { width: '100%', height: '100%' },
  bbox: { position: 'absolute', borderWidth: 2, borderRadius: 4 },
  bboxBadge: { position: 'absolute', top: 3, left: 3, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  bboxText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  summaryBar: { flexDirection: 'row', gap: 8, padding: 12, flexWrap: 'wrap', alignItems: 'center' },
  chip: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center' },
  chipCount: { fontSize: 16, fontWeight: '800' },
  chipLabel: { color: C.sub, fontSize: 9, fontWeight: '600' },
  newScanBtn: { marginLeft: 'auto', backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  newScanText: { color: C.sub, fontSize: 12, fontWeight: '600' },
  listHeader: { color: C.sub, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 14, marginBottom: 8 },
  productRow: { backgroundColor: C.card, marginHorizontal: 10, marginBottom: 8, borderRadius: 14, padding: 14, borderLeftWidth: 3 },
  productTop: { flexDirection: 'row', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  scorePill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  scorePillText: { fontSize: 11, fontWeight: '700' },
  novaTag: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  novaTagText: { fontSize: 10, fontWeight: '600' },
  productBrand: { color: C.sub, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  productName: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  factor: { color: C.sub, fontSize: 12, lineHeight: 18 },
});
