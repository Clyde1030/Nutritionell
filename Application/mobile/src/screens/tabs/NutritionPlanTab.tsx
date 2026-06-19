import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ENDPOINTS } from '../../config';
import { useProfileId } from '../../hooks/useProfile';
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

export default function NutritionPlanTab() {
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
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.loadTitle}>Building your plan</Text>
        <Text style={styles.sub}>This takes about 10 seconds…</Text>
      </View>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Text style={{ fontSize: 40 }}>📋</Text></View>
          <Text style={styles.emptyTitle}>Your Nutrition Plan</Text>
          <Text style={styles.sub}>
            Based on your philosophy, goals, allergies, and ingredient preferences, the AI generates a
            personalised step-by-step nutrition roadmap.
          </Text>

          <View style={styles.requirementsCard}>
            {[
              ['✓', 'Complete your Profile'],
              ['✓', 'Set your Health Goals'],
              ['✓', 'Add Gemini API key to backend/.env'],
            ].map(([icon, text]) => (
              <View key={text} style={styles.reqRow}>
                <Text style={[styles.reqIcon, { color: C.green }]}>{icon}</Text>
                <Text style={styles.reqText}>{text}</Text>
              </View>
            ))}
          </View>

          <Pressable style={styles.generateBtn} onPress={generate}>
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
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.planHeader}>
          <Text style={styles.pageTitle}>My Plan</Text>
          <Pressable style={styles.regenBtn} onPress={generate}>
            <Text style={styles.regenBtnText}>Regenerate</Text>
          </Pressable>
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryText}>{plan.summary}</Text>
        </View>

        {/* Daily targets */}
        {Object.keys(plan.daily_targets).length > 0 && (
          <Section title="Daily Targets">
            <View style={styles.targetGrid}>
              {Object.entries(plan.daily_targets).map(([k, v]) => (
                <View key={k} style={styles.targetTile}>
                  <Text style={styles.targetValue}>{v}</Text>
                  <Text style={styles.targetLabel}>{k}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* Weekly focus */}
        {plan.weekly_focus_areas.length > 0 && (
          <Section title="This Week">
            {plan.weekly_focus_areas.map((area, i) => (
              <View key={i} style={styles.focusRow}>
                <View style={styles.focusDot} />
                <Text style={styles.focusText}>{area}</Text>
              </View>
            ))}
          </Section>
        )}

        {/* Steps */}
        {plan.steps.length > 0 && (
          <Section title="Action Steps">
            {plan.steps.map((step, i) => <StepCard key={i} step={step} index={i + 1} />)}
          </Section>
        )}

        {/* Foods */}
        {plan.foods_to_emphasise.length > 0 && (
          <Section title="Eat More">
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
          <Section title="Limit or Avoid">
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
          <Section title="Supplements to Consider">
            {plan.supplements_to_consider.map((s, i) => (
              <Text key={i} style={styles.bullet}>· {s}</Text>
            ))}
          </Section>
        )}

        {/* Lifestyle */}
        {plan.lifestyle_notes.length > 0 && (
          <Section title="Lifestyle Notes">
            {plan.lifestyle_notes.map((n, i) => (
              <Text key={i} style={styles.bullet}>· {n}</Text>
            ))}
          </Section>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function StepCard({ step, index }: { step: NutritionPlanStep; index: number }) {
  const p = PRIORITY[step.priority] ?? PRIORITY.medium;
  return (
    <View style={[styles.stepCard, { borderLeftColor: p.color }]}>
      <View style={styles.stepTop}>
        <View style={styles.stepNum}>
          <Text style={styles.stepNumText}>{index}</Text>
        </View>
        <Text style={styles.stepTitle} numberOfLines={2}>{step.title}</Text>
        <View style={[styles.priorityTag, { borderColor: p.color }]}>
          <Text style={[styles.priorityTagText, { color: p.color }]}>{p.label}</Text>
        </View>
      </View>
      <Text style={styles.stepDetail}>{step.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadTitle: { color: C.text, fontSize: 20, fontWeight: '700' },
  sub: { color: C.sub, fontSize: 13, textAlign: 'center', lineHeight: 20 },

  empty: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 24, backgroundColor: C.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { color: C.text, fontSize: 22, fontWeight: '800' },
  requirementsCard: {
    width: '100%', backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, padding: 16, gap: 10,
  },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reqIcon: { fontSize: 14, fontWeight: '800' },
  reqText: { color: C.sub, fontSize: 13 },
  generateBtn: {
    width: '100%', backgroundColor: C.accent,
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
  pageTitle: { color: C.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  regenBtn: { backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  regenBtnText: { color: C.sub, fontSize: 12, fontWeight: '600' },
  summaryCard: {
    backgroundColor: C.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: C.border, marginBottom: 8,
  },
  summaryText: { color: C.text, fontSize: 14, lineHeight: 22 },
  section: { marginTop: 24 },
  sectionTitle: {
    color: C.sub, fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
  },
  targetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  targetTile: {
    backgroundColor: C.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', minWidth: '28%',
  },
  targetValue: { color: C.text, fontSize: 15, fontWeight: '800' },
  targetLabel: { color: C.sub, fontSize: 10, marginTop: 2, textAlign: 'center' },
  focusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  focusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  focusText: { color: C.sub, fontSize: 14, flex: 1, lineHeight: 20 },
  stepCard: {
    backgroundColor: C.card, borderRadius: 14, padding: 14,
    marginBottom: 8, borderLeftWidth: 3, borderWidth: 1, borderColor: C.border,
  },
  stepTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8, flexWrap: 'wrap' },
  stepNum: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: C.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { color: C.accent, fontSize: 11, fontWeight: '800' },
  stepTitle: { color: C.text, fontSize: 14, fontWeight: '700', flex: 1 },
  priorityTag: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  priorityTagText: { fontSize: 9, fontWeight: '700' },
  stepDetail: { color: C.sub, fontSize: 13, lineHeight: 20 },
  foodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  foodTag: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  foodTagText: { fontSize: 12, fontWeight: '600' },
  bullet: { color: C.sub, fontSize: 13, lineHeight: 22, paddingLeft: 4, marginBottom: 2 },
});
