import React from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  NOVA_COLORS, NOVA_LABELS, SCORE_BG, SCORE_COLORS,
  type NutritionalFacts, type ProductItem, type ScoreEnum,
} from '../types';
import { DEFAULT_PALETTE, type AppPalette } from '../theme/palettes';

interface Props {
  product: ProductItem | null;
  onClose: () => void;
  palette?: AppPalette;
}

export default function ProductDetailCard({ product, onClose, palette = DEFAULT_PALETTE }: Props) {
  if (!product) return null;

  const color = SCORE_COLORS[product.scoring as ScoreEnum];
  const bgTint = SCORE_BG[product.scoring as ScoreEnum];

  return (
    <Modal visible={!!product} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <SafeAreaView style={styles.sheetContainer} edges={['bottom']}>
        <View style={[styles.sheet, { backgroundColor: palette.bar }]}> 
          <View style={[styles.handle, { backgroundColor: palette.border }]} />
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
              <Text style={[styles.reasoning, { color: palette.sub }]}>{product.reasoning}</Text>
            </View>

            {/* Factor-by-factor reasoning */}
            {product.reasoning_by_factor.length > 0 && (
              <View style={[styles.factorsCard, { backgroundColor: palette.card }]}> 
                <Text style={[styles.factorsTitle, { color: palette.sub }]}>Why this score?</Text>
                {product.reasoning_by_factor.map((f, i) => (
                  <Text key={i} style={[styles.factorItem, { color: palette.sub }]}>{f}</Text>
                ))}
              </View>
            )}

            {/* Product identity */}
            <Text style={[styles.brand, { color: palette.sub }]}>{product.brand}</Text>
            <Text style={[styles.productName, { color: palette.text }]}>{product.product_name}</Text>
            {product.data_source && (
              <Text style={[styles.dataSource, { color: palette.sub }]}>Data: {product.data_source.replace('_', ' ')}</Text>
            )}

            {/* Detected ingredients */}
            {product.nutritional_facts.detected_ingredients.length > 0 && (
              <View style={[styles.ingredientsCard, { backgroundColor: palette.card }]}>
                <Text style={[styles.ingredientsTitle, { color: palette.sub }]}>Detected Ingredients</Text>
                <Text style={[styles.ingredientsText, { color: palette.sub }]}>
                  {product.nutritional_facts.detected_ingredients.join(', ')}
                </Text>
              </View>
            )}

            {/* Nutritional facts */}
            <View style={[styles.factsPanel, { backgroundColor: palette.card }]}> 
              <Text style={[styles.factsTitle, { color: palette.text }]}>Nutrition Facts</Text>
              {product.nutritional_facts.serving_size && (
                <Text style={[styles.serving, { color: palette.sub }]}>Serving: {product.nutritional_facts.serving_size}</Text>
              )}
              <View style={[styles.divider, { backgroundColor: palette.border }]} />
              <NRow label="Calories"            value={product.nutritional_facts.calories}            unit=""   bold palette={palette} />
              <View style={[styles.divider, { backgroundColor: palette.border }]} />
              <NRow label="Total Fat"            value={product.nutritional_facts.total_fat_g}         unit="g" palette={palette} />
              <NRow label="  Saturated Fat"      value={product.nutritional_facts.saturated_fat_g}     unit="g" indent palette={palette} />
              <NRow label="  Trans Fat"          value={product.nutritional_facts.trans_fat_g}         unit="g" indent palette={palette} />
              <NRow label="Cholesterol"          value={product.nutritional_facts.cholesterol_mg}      unit="mg" palette={palette} />
              <NRow label="Sodium"               value={product.nutritional_facts.sodium_mg}           unit="mg" palette={palette} />
              <NRow label="Total Carbohydrate"   value={product.nutritional_facts.total_carbohydrate_g} unit="g" palette={palette} />
              <NRow label="  Dietary Fiber"      value={product.nutritional_facts.dietary_fiber_g}     unit="g" indent palette={palette} />
              <NRow label="  Total Sugars"       value={product.nutritional_facts.total_sugars_g}      unit="g" indent palette={palette} />
              <NRow label="  Added Sugars"       value={product.nutritional_facts.added_sugars_g}      unit="g" indent palette={palette} />
              <NRow label="Protein"              value={product.nutritional_facts.protein_g}           unit="g" palette={palette} />
              {product.nutritional_facts.flagged_ingredients.length > 0 && (
                <>
                  <View style={[styles.divider, { backgroundColor: palette.border }]} />
                  <Text style={styles.flaggedTitle}>⚠️ Flagged Ingredients</Text>
                  {product.nutritional_facts.flagged_ingredients.map((ing, i) => (
                    <Text key={i} style={styles.flaggedItem}>• {ing}</Text>
                  ))}
                </>
              )}
            </View>
          </ScrollView>
          <Pressable style={[styles.closeBtn, { backgroundColor: palette.card }]} onPress={onClose}>
            <Text style={[styles.closeBtnText, { color: palette.sub }]}>Close</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function NRow({ label, value, unit, bold = false, indent = false, palette }: {
  label: string; value?: number | null; unit: string; bold?: boolean; indent?: boolean; palette: AppPalette;
}) {
  if (value == null) return null;
  return (
    <View style={[styles.nutrientRow, indent && { paddingLeft: 16 }]}>
      <Text style={[styles.nutrientLabel, { color: palette.sub }, bold && styles.bold, bold && { color: palette.text }]}>{label}</Text>
      <Text style={[styles.nutrientValue, { color: palette.sub }, bold && styles.bold, bold && { color: palette.text }]}>
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
  reasoning: { fontSize: 13, lineHeight: 20 },
  factorsCard: {
    borderRadius: 10,
    padding: 12, marginBottom: 12,
  },
  factorsTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  factorItem: { fontSize: 12, lineHeight: 20, marginBottom: 2 },
  brand: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  productName: { fontSize: 20, fontWeight: '700', marginTop: 2, marginBottom: 4 },
  dataSource: { fontSize: 10, marginBottom: 12 },
  ingredientsCard: {
    borderRadius: 10,
    padding: 12, marginBottom: 12,
  },
  ingredientsTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  ingredientsText: { fontSize: 12, lineHeight: 18 },
  factsPanel: {
    borderRadius: 12, padding: 16, marginBottom: 8,
  },
  factsTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  serving: { fontSize: 12, marginBottom: 6 },
  divider: { height: 1, marginVertical: 6 },
  nutrientRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3,
  },
  nutrientLabel: { fontSize: 13 },
  nutrientValue: { fontSize: 13 },
  bold: { fontWeight: '700', fontSize: 16 },
  flaggedTitle: { color: '#fbbf24', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  flaggedItem: { color: '#f87171', fontSize: 12, lineHeight: 20 },
  closeBtn: {
    margin: 16, marginTop: 8,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  closeBtnText: { fontSize: 15, fontWeight: '600' },
});
