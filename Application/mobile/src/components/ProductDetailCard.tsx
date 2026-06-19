import React from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  NOVA_COLORS, NOVA_LABELS, SCORE_BG, SCORE_COLORS,
  type NutritionalFacts, type ProductItem, type ScoreEnum,
} from '../types';

interface Props {
  product: ProductItem | null;
  onClose: () => void;
}

export default function ProductDetailCard({ product, onClose }: Props) {
  if (!product) return null;

  const color = SCORE_COLORS[product.scoring as ScoreEnum];
  const bgTint = SCORE_BG[product.scoring as ScoreEnum];

  return (
    <Modal visible={!!product} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <SafeAreaView style={styles.sheetContainer} edges={['bottom']}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

            {/* Score banner */}
            <View style={[styles.scoreBanner, { backgroundColor: bgTint, borderColor: color }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Text style={[styles.scoreLabel, { color }]}>{product.scoring}</Text>
                {product.processing_level != null && (
                  <View style={[styles.novaTag, { borderColor: NOVA_COLORS[product.processing_level] }]}>
                    <Text style={[styles.novaText, { color: NOVA_COLORS[product.processing_level] }]}>
                      NOVA {product.processing_level} — {NOVA_LABELS[product.processing_level]}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.reasoning}>{product.reasoning}</Text>
            </View>

            {/* Factor-by-factor reasoning */}
            {product.reasoning_by_factor.length > 0 && (
              <View style={styles.factorsCard}>
                <Text style={styles.factorsTitle}>Why this score?</Text>
                {product.reasoning_by_factor.map((f, i) => (
                  <Text key={i} style={styles.factorItem}>{f}</Text>
                ))}
              </View>
            )}

            {/* Product identity */}
            <Text style={styles.brand}>{product.brand}</Text>
            <Text style={styles.productName}>{product.product_name}</Text>
            {product.data_source && (
              <Text style={styles.dataSource}>Data: {product.data_source.replace('_', ' ')}</Text>
            )}

            {/* Detected ingredients */}
            {product.nutritional_facts.detected_ingredients.length > 0 && (
              <View style={styles.ingredientsCard}>
                <Text style={styles.ingredientsTitle}>Detected Ingredients</Text>
                <Text style={styles.ingredientsText}>
                  {product.nutritional_facts.detected_ingredients.join(', ')}
                </Text>
              </View>
            )}

            {/* Nutritional facts */}
            <View style={styles.factsPanel}>
              <Text style={styles.factsTitle}>Nutrition Facts</Text>
              {product.nutritional_facts.serving_size && (
                <Text style={styles.serving}>Serving: {product.nutritional_facts.serving_size}</Text>
              )}
              <View style={styles.divider} />
              <NRow label="Calories"            value={product.nutritional_facts.calories}            unit=""   bold />
              <View style={styles.divider} />
              <NRow label="Total Fat"            value={product.nutritional_facts.total_fat_g}         unit="g" />
              <NRow label="  Saturated Fat"      value={product.nutritional_facts.saturated_fat_g}     unit="g" indent />
              <NRow label="  Trans Fat"          value={product.nutritional_facts.trans_fat_g}         unit="g" indent />
              <NRow label="Cholesterol"          value={product.nutritional_facts.cholesterol_mg}      unit="mg" />
              <NRow label="Sodium"               value={product.nutritional_facts.sodium_mg}           unit="mg" />
              <NRow label="Total Carbohydrate"   value={product.nutritional_facts.total_carbohydrate_g} unit="g" />
              <NRow label="  Dietary Fiber"      value={product.nutritional_facts.dietary_fiber_g}     unit="g" indent />
              <NRow label="  Total Sugars"       value={product.nutritional_facts.total_sugars_g}      unit="g" indent />
              <NRow label="  Added Sugars"       value={product.nutritional_facts.added_sugars_g}      unit="g" indent />
              <NRow label="Protein"              value={product.nutritional_facts.protein_g}           unit="g" />
              {product.nutritional_facts.flagged_ingredients.length > 0 && (
                <>
                  <View style={styles.divider} />
                  <Text style={styles.flaggedTitle}>⚠️ Flagged Ingredients</Text>
                  {product.nutritional_facts.flagged_ingredients.map((ing, i) => (
                    <Text key={i} style={styles.flaggedItem}>• {ing}</Text>
                  ))}
                </>
              )}
            </View>
          </ScrollView>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function NRow({ label, value, unit, bold = false, indent = false }: {
  label: string; value?: number | null; unit: string; bold?: boolean; indent?: boolean;
}) {
  if (value == null) return null;
  return (
    <View style={[styles.nutrientRow, indent && { paddingLeft: 16 }]}>
      <Text style={[styles.nutrientLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.nutrientValue, bold && styles.bold]}>
        {unit ? `${value}${unit}` : `${value}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheetContainer: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: '#141720', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '88%', paddingTop: 12,
  },
  handle: {
    width: 40, height: 4, backgroundColor: '#374151',
    borderRadius: 2, alignSelf: 'center', marginBottom: 12,
  },
  content: { paddingHorizontal: 20, paddingBottom: 8 },
  scoreBanner: {
    borderWidth: 1.5, borderRadius: 12, padding: 14, marginBottom: 12,
  },
  scoreLabel: { fontSize: 18, fontWeight: '800' },
  novaTag: {
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  novaText: { fontSize: 10, fontWeight: '600' },
  reasoning: { color: '#d1d5db', fontSize: 13, lineHeight: 20 },
  factorsCard: {
    backgroundColor: '#1c1f2e', borderRadius: 10,
    padding: 12, marginBottom: 12,
  },
  factorsTitle: { color: '#9ca3af', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  factorItem: { color: '#d1d5db', fontSize: 12, lineHeight: 20, marginBottom: 2 },
  brand: { color: '#6b7280', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  productName: { color: '#f9fafb', fontSize: 20, fontWeight: '700', marginTop: 2, marginBottom: 4 },
  dataSource: { color: '#374151', fontSize: 10, marginBottom: 12 },
  ingredientsCard: {
    backgroundColor: '#1c1f2e', borderRadius: 10,
    padding: 12, marginBottom: 12,
  },
  ingredientsTitle: { color: '#9ca3af', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  ingredientsText: { color: '#d1d5db', fontSize: 12, lineHeight: 18 },
  factsPanel: {
    backgroundColor: '#1c1f2e', borderRadius: 12, padding: 16, marginBottom: 8,
  },
  factsTitle: { color: '#f9fafb', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  serving: { color: '#9ca3af', fontSize: 12, marginBottom: 6 },
  divider: { height: 1, backgroundColor: '#2d3148', marginVertical: 6 },
  nutrientRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3,
  },
  nutrientLabel: { color: '#d1d5db', fontSize: 13 },
  nutrientValue: { color: '#d1d5db', fontSize: 13 },
  bold: { fontWeight: '700', color: '#f9fafb', fontSize: 16 },
  flaggedTitle: { color: '#fbbf24', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  flaggedItem: { color: '#f87171', fontSize: 12, lineHeight: 20 },
  closeBtn: {
    margin: 16, marginTop: 8, backgroundColor: '#1c1f2e',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  closeBtnText: { color: '#9ca3af', fontSize: 15, fontWeight: '600' },
});
