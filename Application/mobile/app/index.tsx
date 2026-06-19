import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProfileId } from '../src/hooks/useProfile';
import ProfileTab from '../src/screens/tabs/ProfileTab';
import GoalsTab from '../src/screens/tabs/GoalsTab';
import ScanTab from '../src/screens/tabs/ScanTab';
import NutritionPlanTab from '../src/screens/tabs/NutritionPlanTab';

type Tab = 'profile' | 'goals' | 'scan' | 'plan';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'profile', label: 'Profile',  icon: '◎' },
  { key: 'goals',   label: 'Goals',    icon: '◈' },
  { key: 'scan',    label: 'Scan',     icon: '⊕' },
  { key: 'plan',    label: 'My Plan',  icon: '≡' },
];

const C = { bg: '#09090f', bar: '#0d0d14', border: '#1a1a28', accent: '#7c6aff', sub: '#5a5870' };

export default function App() {
  const { profileId, loading } = useProfileId();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  useEffect(() => {
    if (!loading) setActiveTab(profileId ? 'scan' : 'profile');
  }, [loading]);

  if (loading) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.screen}>
        {activeTab === 'profile' && <ProfileTab onSaved={() => setActiveTab('scan')} />}
        {activeTab === 'goals'   && <GoalsTab />}
        {activeTab === 'scan'    && <ScanTab />}
        {activeTab === 'plan'    && <NutritionPlanTab />}
      </View>

      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <Pressable key={tab.key} style={styles.tabItem} onPress={() => setActiveTab(tab.key)}>
              <View style={[styles.tabIconWrap, active && styles.tabIconWrapActive]}>
                <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{tab.icon}</Text>
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.bar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingTop: 8,
    paddingBottom: 10,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 3 },
  tabIconWrap: { width: 40, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  tabIconWrapActive: { backgroundColor: C.accent + '22' },
  tabIcon: { fontSize: 17, color: C.sub },
  tabIconActive: { color: C.accent },
  tabLabel: { fontSize: 10, fontWeight: '600', color: C.sub, letterSpacing: 0.3 },
  tabLabelActive: { color: C.accent },
});
