import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal,
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ENDPOINTS } from '../../config';
import { useProfileId } from '../../hooks/useProfile';
import type { AppPalette } from '../../theme/palettes';
import type { AllergyOption, IngredientCategory, PhilosophyOption, ProfileOptions, UserProfile } from '../../types';

const C = {
  bg: '#09090f', card: '#111118', border: '#1f1f2e', surface: '#16161f',
  text: '#f1f0ff', sub: '#9896b0', accent: '#7c6aff', accentGlow: '#7c6aff22',
  green: '#22d3a5', red: '#ff5c7a', pink: '#f472b6', yellow: '#f59e0b',
  white: '#ffffff',
};

export default function ProfileTab({ onSaved, palette }: { onSaved?: () => void; palette: AppPalette }) {
  const { profileId, setProfileId } = useProfileId();
  const [options, setOptions] = useState<ProfileOptions | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [philosophy, setPhilosophy] = useState('No Preference');
  const [philosophyCustom, setPhilosophyCustom] = useState({ stricter: [] as string[], lenient: [] as string[], extra: [] as string[] });
  const [customPhilosophyText, setCustomPhilosophyText] = useState('');
  const [isCustomPhilosophy, setIsCustomPhilosophy] = useState(false);
  const [avoidedCategories, setAvoidedCategories] = useState<string[]>([]);
  const [processingTolerance, setProcessingTolerance] = useState(3);

  const [allergyModal, setAllergyModal] = useState<AllergyOption | null>(null);
  const [philosophyModal, setPhilosophyModal] = useState<PhilosophyOption | null>(null);
  const [customizeModal, setCustomizeModal] = useState<PhilosophyOption | null>(null);
  const [buildOwnModal, setBuildOwnModal] = useState(false);
  const [ingredientModal, setIngredientModal] = useState<IngredientCategory | null>(null);

  useEffect(() => {
    fetch(ENDPOINTS.profileOptions)
      .then(r => r.json()).then(setOptions)
      .catch(() => Alert.alert('Connection error', 'Cannot reach backend — make sure it is running on port 8000.'));
  }, []);

  useEffect(() => {
    if (!profileId || !options) return;
    fetch(ENDPOINTS.getProfile(profileId))
      .then(r => r.json())
      .then((p: UserProfile) => {
        setName(p.name ?? '');
        setSelectedAllergies(p.allergies_and_conditions ?? []);
        setProcessingTolerance(p.processed_food_tolerance ?? 3);
        if (p.dietary_philosophy === 'custom') {
          setIsCustomPhilosophy(true);
          setCustomPhilosophyText(p.custom_philosophy_text ?? '');
        } else {
          setPhilosophy(p.dietary_philosophy ?? 'No Preference');
        }
        if (p.philosophy_customizations) {
          try { setPhilosophyCustom(JSON.parse(p.philosophy_customizations)); } catch {}
        }
        setAvoidedCategories(p.avoided_ingredients ?? []);
      }).catch(() => {});
  }, [profileId, options]);

  const toggleAllergy = useCallback((key: string) =>
    setSelectedAllergies(p => p.includes(key) ? p.filter(a => a !== key) : [...p, key]), []);

  const toggleCategory = useCallback((cat: string) =>
    setAvoidedCategories(p => p.includes(cat) ? p.filter(c => c !== cat) : [...p, cat]), []);

  const handleSave = async () => {
    setSaving(true);
    const body = {
      name: name.trim() || undefined,
      allergies_and_conditions: selectedAllergies,
      dietary_philosophy: isCustomPhilosophy ? 'custom' : philosophy,
      philosophy_customizations: JSON.stringify(philosophyCustom),
      custom_philosophy_text: isCustomPhilosophy ? customPhilosophyText : undefined,
      avoided_ingredients: avoidedCategories,
      processed_food_tolerance: processingTolerance,
    };
    try {
      const url = profileId ? ENDPOINTS.updateProfile(profileId) : ENDPOINTS.createProfile;
      const r = await fetch(url, {
        method: profileId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail ?? `Server error ${r.status}`);
      }
      const saved: UserProfile = await r.json();
      await setProfileId(saved.id);
      Alert.alert('Saved ✓', 'Your profile has been updated.');
      onSaved?.();
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!options) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={[styles.sub, { color: palette.sub }]}>Connecting to server…</Text>
      </View>
    );
  }

  const philData = options.dietary_philosophies.find(p => p.key === philosophy);
  // Fix: tolerance labels keys come back as strings from JSON
  const toleranceLabel = options.processed_food_tolerance_labels[String(processingTolerance)]
    ?? options.processed_food_tolerance_labels[processingTolerance as any]
    ?? 'Moderate processing';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.pageHeader}>
            <Text style={[styles.pageTitle, { color: palette.text }]}>Profile</Text>
            <Text style={[styles.pageSub, { color: palette.sub }]}>Everything here shapes your product analysis</Text>
          </View>

          {/* Name */}
          <Label text="Your Name" palette={palette} />
          <TextInput style={[styles.input, { backgroundColor: palette.card, borderColor: palette.border, color: palette.text }]} value={name} onChangeText={setName}
            placeholder="Optional" placeholderTextColor={palette.sub} />

          {/* ── Philosophy ─────────────────────────────────────────────── */}
          <Label text="Dietary Philosophy" palette={palette} />
          {!isCustomPhilosophy && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
              {options.dietary_philosophies.map(p => (
                <Pressable key={p.key}
                  style={[
                    styles.pillBtn,
                    { backgroundColor: palette.card, borderColor: palette.border },
                    philosophy === p.key && { backgroundColor: palette.accent, borderColor: palette.accent },
                  ]}
                  onPress={() => setPhilosophy(p.key)}>
                  <Text style={[styles.pillBtnText, { color: palette.sub }, philosophy === p.key && styles.pillBtnTextActive]}>{p.key}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {!isCustomPhilosophy && philData && (
            <View style={[styles.infoCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.infoCardTitle, { color: palette.text }]}>{philData.key}</Text>
              <Text style={[styles.infoCardBody, { color: palette.sub }]}>{philData.summary}</Text>
              <View style={styles.actionRow}>
                <Pressable style={[styles.actionBtn, { borderColor: palette.border }]} onPress={() => setPhilosophyModal(philData)}>
                  <Text style={[styles.actionBtnText, { color: palette.sub }]}>Learn more</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, { borderColor: palette.border }]} onPress={() => setCustomizeModal(philData)}>
                  <Text style={[styles.actionBtnText, { color: palette.sub }]}>Customize</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, { borderColor: palette.accent }]} onPress={() => setBuildOwnModal(true)}>
                  <Text style={[styles.actionBtnText, { color: palette.accent }]}>Build my own</Text>
                </Pressable>
              </View>
            </View>
          )}

          {isCustomPhilosophy && (
            <View style={[styles.infoCard, { backgroundColor: palette.card, borderColor: palette.accent }]}>
              <Text style={[styles.infoCardTitle, { color: palette.accent }]}>Custom philosophy active</Text>
              <Text style={[styles.infoCardBody, { color: palette.sub }]} numberOfLines={2}>{customPhilosophyText || 'No text yet'}</Text>
              <View style={styles.actionRow}>
                <Pressable style={[styles.actionBtn, { borderColor: palette.accent }]} onPress={() => setBuildOwnModal(true)}>
                  <Text style={[styles.actionBtnText, { color: palette.accent }]}>Edit</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, { borderColor: palette.border }]} onPress={() => setIsCustomPhilosophy(false)}>
                  <Text style={[styles.actionBtnText, { color: palette.sub }]}>Use standard</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ── Allergies ──────────────────────────────────────────────── */}
          <Label text="Allergies & Conditions" hint="Tap ℹ to see what each covers" palette={palette} />
          <View style={[styles.listGroup, { backgroundColor: palette.card, borderColor: palette.border }]}> 
            {options.allergies_and_conditions.map(a => {
              const on = selectedAllergies.includes(a.key);
              return (
                <View key={a.key} style={[styles.listRow, { borderBottomColor: palette.border }]}> 
                  <Pressable style={[styles.listCheck, on && { backgroundColor: palette.accent + '22' }]} onPress={() => toggleAllergy(a.key)}>
                    <View style={[styles.checkbox, { borderColor: palette.border }, on && { backgroundColor: palette.accent, borderColor: palette.accent }]}>
                      {on && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={[styles.listLabel, { color: on ? palette.text : palette.sub }]}>{a.key}</Text>
                  </Pressable>
                  <Pressable onPress={() => setAllergyModal(a)} style={styles.infoTap}>
                    <Text style={[styles.infoTapText, { color: palette.sub }]}>ℹ</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          {/* ── Ingredients to Avoid ───────────────────────────────────── */}
          <Label text="Ingredients to Avoid" hint="Tap ℹ to see examples and health concerns" palette={palette} />
          <View style={[styles.listGroup, { backgroundColor: palette.card, borderColor: palette.border }]}> 
            {options.ingredient_categories.map(cat => {
              const on = avoidedCategories.includes(cat.category);
              return (
                <View key={cat.category} style={[styles.listRow, { borderBottomColor: palette.border }]}> 
                  <Pressable style={[styles.listCheck, on && { backgroundColor: palette.accent + '22' }]} onPress={() => toggleCategory(cat.category)}>
                    <View style={[styles.checkbox, { borderColor: palette.border }, on && { backgroundColor: palette.accent, borderColor: palette.accent }]}>
                      {on && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={[styles.listLabel, { color: on ? palette.text : palette.sub }]}>{cat.category}</Text>
                  </Pressable>
                  <Pressable onPress={() => setIngredientModal(cat)} style={styles.infoTap}>
                    <Text style={[styles.infoTapText, { color: palette.sub }]}>ℹ</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          {/* ── Processing Tolerance ───────────────────────────────────── */}
          <Label text="Processed Food Tolerance" hint={toleranceLabel} palette={palette} />
          <View style={styles.segmentRow}>
            {[0, 1, 2, 3, 4].map(n => (
              <Pressable key={n} style={[
                styles.segment,
                { backgroundColor: palette.card, borderColor: palette.border },
                processingTolerance === n && { backgroundColor: palette.accent, borderColor: palette.accent },
              ]}
                onPress={() => setProcessingTolerance(n)}>
                <Text style={[styles.segmentText, { color: processingTolerance === n ? C.white : palette.sub }]}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.segmentLabels}>
            <Text style={[styles.segmentHint, { color: palette.sub }]}>Whole foods only</Text>
            <Text style={[styles.segmentHint, { color: palette.sub }]}>No restriction</Text>
          </View>

          {/* Save */}
          <Pressable style={[styles.saveBtn, { backgroundColor: palette.accent }, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={styles.saveBtnText}>{profileId ? 'Update Profile' : 'Save Profile'}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Allergy info modal */}
      <BottomSheet visible={!!allergyModal} onClose={() => setAllergyModal(null)} title={allergyModal?.key ?? ''} palette={palette}>
        <Text style={[styles.sheetBody, { color: palette.sub }]}>{allergyModal?.description}</Text>
      </BottomSheet>

      {/* Philosophy learn more */}
      <BottomSheet visible={!!philosophyModal} onClose={() => setPhilosophyModal(null)} title={philosophyModal?.key ?? ''} palette={palette}>
        <Text style={[styles.sheetBody, { color: palette.sub }]}>{philosophyModal?.description}</Text>
        {philosophyModal?.avoid_categories && philosophyModal.avoid_categories.length > 0 && (
          <>
            <Text style={[styles.sheetSectionLabel, { color: palette.accent }]}>Avoids</Text>
            {philosophyModal.avoid_categories.map(c => <Text key={c} style={[styles.sheetBullet, { color: palette.sub }]}>· {c}</Text>)}
          </>
        )}
        {philosophyModal?.favour_categories && philosophyModal.favour_categories.length > 0 && (
          <>
            <Text style={[styles.sheetSectionLabel, { color: palette.accent }]}>Favours</Text>
            {philosophyModal.favour_categories.map(c => <Text key={c} style={[styles.sheetBullet, { color: palette.sub }]}>· {c}</Text>)}
          </>
        )}
      </BottomSheet>

      {/* Customize philosophy */}
      <CustomizeModal visible={!!customizeModal} philosophy={customizeModal}
        customizations={philosophyCustom}
        onSave={c => { setPhilosophyCustom(c); setCustomizeModal(null); }}
        onClose={() => setCustomizeModal(null)}
        palette={palette} />

      {/* Build own */}
      <BuildModal visible={buildOwnModal} initialText={customPhilosophyText}
        onSave={t => { setCustomPhilosophyText(t); setIsCustomPhilosophy(true); setBuildOwnModal(false); }}
        onClose={() => setBuildOwnModal(false)}
        palette={palette} />

      {/* Ingredient info */}
      <BottomSheet visible={!!ingredientModal} onClose={() => setIngredientModal(null)} title={ingredientModal?.category ?? ''} palette={palette}>
        <Text style={[styles.sheetSectionLabel, { color: palette.accent }]}>Why avoid?</Text>
        <Text style={[styles.sheetBody, { color: palette.sub }]}>{ingredientModal?.concern}</Text>
        <Text style={[styles.sheetSectionLabel, { color: palette.accent }]}>Common examples</Text>
        {ingredientModal?.examples.map(e => <Text key={e} style={[styles.sheetBullet, { color: palette.sub }]}>· {e}</Text>)}
      </BottomSheet>
    </SafeAreaView>
  );
}

// ── Reusable sub-components ───────────────────────────────────────────────────

function Label({ text, hint, palette }: { text: string; hint?: string; palette: AppPalette }) {
  return (
    <View style={{ marginTop: 28, marginBottom: 10 }}>
      <Text style={[styles.label, { color: palette.text }]}>{text}</Text>
      {hint && <Text style={[styles.labelHint, { color: palette.sub }]}>{hint}</Text>}
    </View>
  );
}

function BottomSheet({ visible, onClose, title, children, palette }: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode; palette: AppPalette;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: palette.card }]}>
        <View style={[styles.sheetHandle, { backgroundColor: palette.border }]} />
        <Text style={[styles.sheetTitle, { color: palette.text }]}>{title}</Text>
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          {children}
        </ScrollView>
        <Pressable style={[styles.sheetCloseBtn, { backgroundColor: palette.bar }]} onPress={onClose}>
          <Text style={[styles.sheetCloseBtnText, { color: palette.sub }]}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function CustomizeModal({ visible, philosophy, customizations, onSave, onClose, palette }: {
  visible: boolean; philosophy: PhilosophyOption | null;
  customizations: { stricter: string[]; lenient: string[]; extra: string[] };
  onSave: (c: { stricter: string[]; lenient: string[]; extra: string[] }) => void;
  onClose: () => void;
  palette: AppPalette;
}) {
  const [s, setS] = useState('');
  const [l, setL] = useState('');
  const [e, setE] = useState('');
  useEffect(() => {
    if (visible) { setS(customizations.stricter.join('\n')); setL(customizations.lenient.join('\n')); setE(customizations.extra.join('\n')); }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.sheet, { maxHeight: '90%', backgroundColor: palette.card }]}>
        <View style={[styles.sheetHandle, { backgroundColor: palette.border }]} />
        <Text style={[styles.sheetTitle, { color: palette.text }]}>Customize: {philosophy?.key}</Text>
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          <Text style={[styles.sheetSectionLabel, { color: palette.accent }]}>Make stricter</Text>
          <TextInput style={[styles.input, { minHeight: 72, backgroundColor: palette.bg, borderColor: palette.border, color: palette.text }]} multiline value={s} onChangeText={setS}
            placeholder="One rule per line" placeholderTextColor={palette.sub} textAlignVertical="top" />
          <Text style={[styles.sheetSectionLabel, { color: palette.accent }]}>Make more lenient</Text>
          <TextInput style={[styles.input, { minHeight: 72, backgroundColor: palette.bg, borderColor: palette.border, color: palette.text }]} multiline value={l} onChangeText={setL}
            placeholder="One rule per line" placeholderTextColor={palette.sub} textAlignVertical="top" />
          <Text style={[styles.sheetSectionLabel, { color: palette.accent }]}>Extra rules</Text>
          <TextInput style={[styles.input, { minHeight: 72, backgroundColor: palette.bg, borderColor: palette.border, color: palette.text }]} multiline value={e} onChangeText={setE}
            placeholder="One rule per line" placeholderTextColor={palette.sub} textAlignVertical="top" />
        </ScrollView>
        <Pressable style={[styles.saveBtn, { backgroundColor: palette.accent }]} onPress={() => onSave({
          stricter: s.split('\n').map(x => x.trim()).filter(Boolean),
          lenient: l.split('\n').map(x => x.trim()).filter(Boolean),
          extra: e.split('\n').map(x => x.trim()).filter(Boolean),
        })}>
          <Text style={styles.saveBtnText}>Apply</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function BuildModal({ visible, initialText, onSave, onClose, palette }: {
  visible: boolean; initialText: string; onSave: (t: string) => void; onClose: () => void; palette: AppPalette;
}) {
  const [text, setText] = useState(initialText);
  useEffect(() => { if (visible) setText(initialText); }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.sheet, { maxHeight: '92%', backgroundColor: palette.card }]}>
        <View style={[styles.sheetHandle, { backgroundColor: palette.border }]} />
        <Text style={[styles.sheetTitle, { color: palette.text }]}>Build Your Own Philosophy</Text>
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          <Text style={[styles.sheetBody, { color: palette.sub }]}> 
            Write your dietary rules in plain language. The AI will use this exactly as written when scoring products.
          </Text>
          <Text style={[styles.sheetBody, { fontStyle: 'italic', marginTop: 8, color: palette.sub }]}>
            Example: "Mostly plant-based with occasional wild fish. No seed oils, no refined sugar, max 5 ingredients. Prioritise fermented foods."
          </Text>
          <TextInput style={[styles.input, { minHeight: 180, marginTop: 12, backgroundColor: palette.bg, borderColor: palette.border, color: palette.text }]} multiline value={text}
            onChangeText={setText} placeholder="Describe your philosophy…" placeholderTextColor={palette.sub}
            textAlignVertical="top" />
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable style={[styles.saveBtn, { flex: 1, backgroundColor: palette.bar, marginTop: 0 }]} onPress={onClose}>
            <Text style={[styles.saveBtnText, { color: palette.sub }]}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.saveBtn, { flex: 2, marginTop: 0, backgroundColor: palette.accent }]} onPress={() => onSave(text.trim())}>
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 60 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  sub: { color: C.sub, fontSize: 13 },
  pageHeader: { marginBottom: 8 },
  pageTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  pageSub: { fontSize: 13, marginTop: 4 },
  label: { color: C.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  labelHint: { color: C.sub, fontSize: 11, marginTop: 2 },
  input: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, color: C.text, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12,
  },
  // Pill selector (horizontal scroll)
  pillBtn: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.surface,
  },
  pillBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  pillBtnText: { color: C.sub, fontSize: 13, fontWeight: '600' },
  pillBtnTextActive: { color: C.white, fontWeight: '700' },
  // Info card below selector
  infoCard: {
    backgroundColor: C.card, borderRadius: 14, padding: 14,
    marginTop: 12, borderWidth: 1, borderColor: C.border,
  },
  infoCardTitle: { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  infoCardBody: { color: C.sub, fontSize: 13, lineHeight: 19 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  actionBtn: {
    borderWidth: 1, borderColor: C.border, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  actionBtnText: { color: C.sub, fontSize: 12, fontWeight: '600' },
  // List group (allergies / ingredients)
  listGroup: {
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  listCheck: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  listCheckOn: { backgroundColor: C.accentGlow },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: C.accent, borderColor: C.accent },
  checkmark: { color: '#fff', fontSize: 11, fontWeight: '800' },
  listLabel: { color: C.sub, fontSize: 14, fontWeight: '500' },
  infoTap: { padding: 14 },
  infoTapText: { color: C.sub, fontSize: 15, fontWeight: '600' },
  // Segment control
  segmentRow: { flexDirection: 'row', gap: 6 },
  segment: {
    flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  segmentOn: { backgroundColor: C.accent, borderColor: C.accent },
  segmentText: { color: C.sub, fontSize: 15, fontWeight: '700' },
  segmentTextOn: { color: C.white },
  segmentLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  segmentHint: { color: C.sub, fontSize: 10 },
  // Save
  saveBtn: {
    marginTop: 32,
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  saveBtnText: { color: C.white, fontSize: 16, fontWeight: '700' },
  // Bottom sheet
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '80%', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32,
  },
  sheetHandle: { width: 36, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { color: C.text, fontSize: 17, fontWeight: '700', marginBottom: 12 },
  sheetBody: { color: C.sub, fontSize: 14, lineHeight: 22 },
  sheetSectionLabel: { color: C.accent, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  sheetBullet: { color: C.sub, fontSize: 13, lineHeight: 22, paddingLeft: 4 },
  sheetCloseBtn: { marginTop: 12, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sheetCloseBtnText: { color: C.sub, fontSize: 15, fontWeight: '600' },
});
