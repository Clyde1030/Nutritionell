import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ENDPOINTS } from '../../config';
import { useProfileId } from '../../hooks/useProfile';
import type { AppPalette } from '../../theme/palettes';
import type { NutritionPlanResponse, NutritionPlanStep } from '../../types';

const C = {
  bg: '#09090f', card: '#111118', border: '#1f1f2e', surface: '#16161f',
  text: '#f1f0ff', sub: '#9896b0', accent: '#7c6aff', accentLight: '#7c6aff22',
  green: '#22d3a5', red: '#ff5c7a', yellow: '#f59e0b', white: '#ffffff',
};

const PRIORITY = {
  high:   { color: C.red,    label: 'High priority' },
  medium: { color: C.yellow, label: 'Medium' },
  low:    { color: C.green,  label: 'Lower priority' },
};

export default function NutritionPlanTab({ palette }: { palette: AppPalette }) {
  const { profileId } = useProfileId();
  const [plan, setPlan] = useState<NutritionPlanResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!profileId) {
      Alert.alert('Profile required', 'Complete your profile and goals first.');
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(ENDPOINTS.nutritionPlan, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail ?? `Server ${r.status}`);
      }
      setPlan(await r.json());
    } catch (e: any) {
      Alert.alert('Generation failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={[styles.loadTitle, { color: palette.text }]}>Building your plan</Text>
        <Text style={[styles.sub, { color: palette.sub }]}>This takes about 10 seconds…</Text>
      </View>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]} edges={['bottom']}>
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: palette.accent + '22' }]}><Text style={{ fontSize: 40 }}>📋</Text></View>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>Your Nutrition Plan</Text>
          <Text style={[styles.sub, { color: palette.sub }]}>
            Based on your philosophy, goals, allergies, and ingredient preferences, the AI generates a
            personalised step-by-step nutrition roadmap.
          </Text>

          <View style={[styles.requirementsCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            {[
              ['✓', 'Complete your Profile'],
              ['✓', 'Set your Health Goals'],
              ['✓', 'Add Gemini API key to backend/.env'],
            ].map(([icon, text]) => (
              <View key={text} style={styles.reqRow}>
                <Text style={[styles.reqIcon, { color: C.green }]}>{icon}</Text>
                <Text style={[styles.reqText, { color: palette.sub }]}>{text}</Text>
              </View>
            ))}
          </View>

          <Pressable style={[styles.generateBtn, { backgroundColor: palette.accent }]} onPress={generate}>
            <Text style={styles.generateBtnText}>Generate My Plan</Text>
          </Pressable>

          {!profileId && (
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>⚠️  Profile not found — set it up in the Profile tab first</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.planHeader}>
          <Text style={[styles.pageTitle, { color: palette.text }]}>My Plan</Text>
          <Pressable style={[styles.regenBtn, { backgroundColor: palette.card }]} onPress={generate}>
            <Text style={[styles.regenBtnText, { color: palette.sub }]}>Regenerate</Text>
          </Pressable>
        </View>

        {/* Summary */}
        <View style={[styles.summaryCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.summaryText, { color: palette.text }]}>{plan.summary}</Text>
        </View>

        {/* Daily targets */}
        {Object.keys(plan.daily_targets).length > 0 && (
          <Section title="Daily Targets" palette={palette}>
            <View style={styles.targetGrid}>
              {Object.entries(plan.daily_targets).map(([k, v]) => (
                <View key={k} style={[styles.targetTile, { backgroundColor: palette.card, borderColor: palette.border }]}>
                  <Text style={[styles.targetValue, { color: palette.text }]}>{v}</Text>
                  <Text style={[styles.targetLabel, { color: palette.sub }]}>{k}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* Weekly focus */}
        {plan.weekly_focus_areas.length > 0 && (
          <Section title="This Week" palette={palette}>
            {plan.weekly_focus_areas.map((area, i) => (
              <View key={i} style={styles.focusRow}>
                <View style={[styles.focusDot, { backgroundColor: palette.accent }]} />
                <Text style={[styles.focusText, { color: palette.sub }]}>{area}</Text>
              </View>
            ))}
          </Section>
        )}

        {/* Steps */}
        {plan.steps.length > 0 && (
          <Section title="Action Steps" palette={palette}>
            {plan.steps.map((step, i) => <StepCard key={i} step={step} index={i + 1} palette={palette} />)}
          </Section>
        )}

        {/* Foods */}
        {plan.foods_to_emphasise.length > 0 && (
          <Section title="Eat More" palette={palette}>
            <View style={styles.foodGrid}>
              {plan.foods_to_emphasise.map((f, i) => (
                <View key={i} style={[styles.foodTag, { borderColor: C.green }]}>
                  <Text style={[styles.foodTagText, { color: C.green }]}>{f}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {plan.foods_to_limit.length > 0 && (
          <Section title="Limit or Avoid" palette={palette}>
            <View style={styles.foodGrid}>
              {plan.foods_to_limit.map((f, i) => (
                <View key={i} style={[styles.foodTag, { borderColor: C.red }]}>
                  <Text style={[styles.foodTagText, { color: C.red }]}>{f}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* Supplements */}
        {plan.supplements_to_consider.length > 0 && (
          <Section title="Supplements to Consider" palette={palette}>
            {plan.supplements_to_consider.map((s, i) => (
              <Text key={i} style={[styles.bullet, { color: palette.sub }]}>· {s}</Text>
            ))}
          </Section>
        )}

        {/* Lifestyle */}
        {plan.lifestyle_notes.length > 0 && (
          <Section title="Lifestyle Notes" palette={palette}>
            {plan.lifestyle_notes.map((n, i) => (
              <Text key={i} style={[styles.bullet, { color: palette.sub }]}>· {n}</Text>
            ))}
          </Section>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children, palette }: { title: string; children: React.ReactNode; palette: AppPalette }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.sub }]}>{title}</Text>
      {children}
    </View>
  );
}

function StepCard({ step, index, palette }: { step: NutritionPlanStep; index: number; palette: AppPalette }) {
  const p = PRIORITY[step.priority] ?? PRIORITY.medium;
  return (
    <View style={[styles.stepCard, { borderLeftColor: p.color, backgroundColor: palette.card, borderColor: palette.border }]}> 
      <View style={styles.stepTop}>
        <View style={[styles.stepNum, { backgroundColor: palette.accent + '22' }]}>
          <Text style={[styles.stepNumText, { color: palette.accent }]}>{index}</Text>
        </View>
        <Text style={[styles.stepTitle, { color: palette.text }]} numberOfLines={2}>{step.title}</Text>
        <View style={[styles.priorityTag, { borderColor: p.color }]}>
          <Text style={[styles.priorityTagText, { color: p.color }]}>{p.label}</Text>
        </View>
      </View>
      <Text style={[styles.stepDetail, { color: palette.sub }]}>{step.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadTitle: { fontSize: 20, fontWeight: '700' },
  sub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  empty: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 24, backgroundColor: C.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 22, fontWeight: '800' },
  requirementsCard: {
    width: '100%', borderRadius: 14,
    borderWidth: 1, padding: 16, gap: 10,
  },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reqIcon: { fontSize: 14, fontWeight: '800' },
  reqText: { color: C.sub, fontSize: 13 },
  generateBtn: {
    width: '100%',
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  generateBtnText: { color: C.white, fontSize: 16, fontWeight: '700' },
  warningCard: {
    width: '100%', backgroundColor: '#1a0d0d', borderWidth: 1,
    borderColor: '#4a1515', borderRadius: 12, padding: 12,
  },
  warningText: { color: '#f87171', fontSize: 13 },

  // Plan content
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  pageTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  regenBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  regenBtnText: { fontSize: 12, fontWeight: '600' },
  summaryCard: {
    borderRadius: 14, padding: 16,
    borderWidth: 1, marginBottom: 8,
  },
  summaryText: { fontSize: 14, lineHeight: 22 },
  section: { marginTop: 24 },
  sectionTitle: {
    fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
  },
  targetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  targetTile: {
    borderRadius: 12, padding: 12,
    borderWidth: 1, alignItems: 'center', minWidth: '28%',
  },
  targetValue: { fontSize: 15, fontWeight: '800' },
  targetLabel: { fontSize: 10, marginTop: 2, textAlign: 'center' },
  focusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  focusDot: { width: 6, height: 6, borderRadius: 3 },
  focusText: { fontSize: 14, flex: 1, lineHeight: 20 },
  stepCard: {
    borderRadius: 14, padding: 14,
    marginBottom: 8, borderLeftWidth: 3, borderWidth: 1,
  },
  stepTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8, flexWrap: 'wrap' },
  stepNum: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { fontSize: 11, fontWeight: '800' },
  stepTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  priorityTag: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  priorityTagText: { fontSize: 9, fontWeight: '700' },
  stepDetail: { fontSize: 13, lineHeight: 20 },
  foodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  foodTag: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  foodTagText: { fontSize: 12, fontWeight: '600' },
  bullet: { fontSize: 13, lineHeight: 22, paddingLeft: 4, marginBottom: 2 },
});
