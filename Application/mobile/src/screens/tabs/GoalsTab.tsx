import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ENDPOINTS } from '../../config';
import { useProfileId } from '../../hooks/useProfile';
import type { UserProfile } from '../../types';

const C = {
  bg: '#09090f', card: '#111118', border: '#1f1f2e', surface: '#16161f',
  text: '#f1f0ff', sub: '#9896b0', accent: '#7c6aff', green: '#22d3a5', white: '#ffffff',
};

const PROMPTS = [
  'Lose body fat, maintain muscle',
  'Build lean muscle mass',
  'More energy throughout the day',
  'Reduce inflammation',
  'Improve gut health',
  'Lower blood sugar',
  'Reduce cardiovascular risk',
  'Better sleep quality',
  'More protein, less sugar',
  'Eat fewer processed foods',
  'Improve focus and cognition',
  'Support hormonal balance',
];

export default function GoalsTab() {
  const { profileId } = useProfileId();
  const [goals, setGoals] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    fetch(ENDPOINTS.getProfile(profileId))
      .then(r => r.json())
      .then((p: UserProfile) => setGoals(p.free_text_goals ?? ''))
      .catch(() => {});
  }, [profileId]);

  const addPrompt = (p: string) =>
    setGoals(prev => prev.trim() ? `${prev.trim()}\n${p}` : p);

  const handleSave = async () => {
    if (!profileId) {
      Alert.alert('No profile yet', 'Create your profile first in the Profile tab.');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(ENDPOINTS.updateProfile(profileId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ free_text_goals: goals.trim() }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail ?? `Server ${r.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Health Goals</Text>
            <Text style={styles.pageSub}>The AI references these when explaining every product score</Text>
          </View>

          <TextInput
            style={styles.textArea}
            multiline
            value={goals}
            onChangeText={t => { setGoals(t); setSaved(false); }}
            placeholder={"Describe your goals in your own words…\n\ne.g. I want to build muscle, reduce body fat, and improve gut health. I need more protein, less sugar, and want to avoid ultra-processed foods."}
            placeholderTextColor={C.sub}
            textAlignVertical="top"
          />

          <Text style={styles.sectionLabel}>Quick add</Text>
          <View style={styles.promptGrid}>
            {PROMPTS.map(p => (
              <Pressable key={p} style={styles.promptChip} onPress={() => addPrompt(p)}>
                <Text style={styles.promptText}>+ {p}</Text>
              </Pressable>
            ))}
          </View>

          {!profileId && (
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>⚠️  Create your profile first before saving goals</Text>
            </View>
          )}

          <Pressable
            style={[styles.saveBtn, (saving || !profileId) && { opacity: 0.5 }, saved && { backgroundColor: C.green }]}
            onPress={handleSave} disabled={saving || !profileId}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>{saved ? '✓  Goals saved' : 'Save Goals'}</Text>
            }
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, paddingBottom: 60 },
  pageHeader: { marginBottom: 20 },
  pageTitle: { color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  pageSub: { color: C.sub, fontSize: 13, marginTop: 4 },
  textArea: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 16, color: C.text, fontSize: 15,
    paddingHorizontal: 16, paddingVertical: 14, minHeight: 160, lineHeight: 22,
  },
  sectionLabel: {
    color: C.sub, fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 24, marginBottom: 10,
  },
  promptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  promptChip: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
  },
  promptText: { color: C.sub, fontSize: 12, fontWeight: '500' },
  warningCard: {
    backgroundColor: '#2a1215', borderWidth: 1, borderColor: '#5b2020',
    borderRadius: 12, padding: 12, marginTop: 16,
  },
  warningText: { color: '#f87171', fontSize: 13 },
  saveBtn: {
    marginTop: 28, backgroundColor: C.accent,
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  saveBtnText: { color: C.white, fontSize: 16, fontWeight: '700' },
});
