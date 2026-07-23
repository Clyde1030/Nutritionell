import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProfileId } from '../src/hooks/useProfile';
import HomeTab from '../src/screens/tabs/HomeTab';
import ProfileTab from '../src/screens/tabs/ProfileTab';
import GoalsTab from '../src/screens/tabs/GoalsTab';
import ScanTab from '../src/screens/tabs/ScanTab';
import NutritionPlanTab from '../src/screens/tabs/NutritionPlanTab';
import GreenwashingTab from '../src/screens/tabs/GreenwashingTab';
import IngredientAnalyticsTab from '../src/screens/tabs/IngredientAnalyticsTab';
import AboutTab from '../src/screens/tabs/AboutTab';
import AppearanceTab from '../src/screens/tabs/AppearanceTab';
import { DEFAULT_PALETTE, getPaletteByName, THEME_STORAGE_KEY } from '../src/theme/palettes';

type Tab = 'home' | 'profile' | 'goals' | 'scan' | 'plan' | 'greenwashing' | 'ingredients' | 'about' | 'appearance';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'profile', label: 'Profile',  icon: '◎' },
  { key: 'goals',   label: 'Goals',    icon: '◈' },
  { key: 'scan',    label: 'Scan',     icon: '⊕' },
  { key: 'plan',    label: 'My Plan',  icon: '📋' },
  { key: 'greenwashing', label: 'Greenwashing', icon: '🔍' },
  { key: 'ingredients', label: 'Nutrition', icon: '🧬' },
  { key: 'about', label: 'About', icon: '✉' },
  { key: 'appearance', label: 'Appearance', icon: '⚙' },
];

export default function App() {
  const { profileId, loading } = useProfileId();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [activePaletteName, setActivePaletteName] = useState(DEFAULT_PALETTE.name);
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const drawerAnim = React.useRef(new Animated.Value(0)).current;

  const activeTabLabel = TABS.find((t) => t.key === activeTab)?.label ?? 'Nutritionell';

  const openDrawer = () => {
    setDrawerVisible(true);
    setDrawerOpen(true);
    Animated.timing(drawerAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    Animated.timing(drawerAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setDrawerVisible(false);
    });
  };

  const handleTabSelect = (tab: Tab) => {
    setActiveTab(tab);
    closeDrawer();
  };

  useEffect(() => {
    if (!loading) setActiveTab(profileId ? 'home' : 'profile');
  }, [loading]);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((savedName) => {
      const next = getPaletteByName(savedName);
      setPalette(next);
      setActivePaletteName(next.name);
    }).catch(() => {});
  }, []);

  const onSelectPalette = async (name: string) => {
    const next = getPaletteByName(name);
    setPalette(next);
    setActivePaletteName(next.name);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, next.name);
    } catch {}
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: palette.bg }} />;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.bg }]} edges={['top']}>
      <View style={[styles.topBar, { backgroundColor: palette.bar, borderBottomColor: palette.border }]}>
        <Pressable style={[styles.menuBtn, { borderColor: palette.border, backgroundColor: palette.card }]} onPress={() => (drawerOpen ? closeDrawer() : openDrawer())}>
          <Text style={[styles.menuBtnText, { color: palette.accent }]}>☰</Text>
        </Pressable>
        <Text style={[styles.topTitle, { color: palette.text }]}>{activeTabLabel}</Text>
      </View>

      <View style={styles.screen}>
        {activeTab === 'home'    && <HomeTab onNavigate={(t) => handleTabSelect(t as Tab)} />}
        {activeTab === 'profile' && <ProfileTab onSaved={() => handleTabSelect('scan')} />}
        {activeTab === 'goals'   && <GoalsTab />}
        {activeTab === 'scan'    && <ScanTab />}
        {activeTab === 'plan'    && <NutritionPlanTab />}
        {activeTab === 'greenwashing' && <GreenwashingTab />}
        {activeTab === 'ingredients' && <IngredientAnalyticsTab />}
        {activeTab === 'about' && <AboutTab palette={palette} />}
        {activeTab === 'appearance' && <AppearanceTab activePaletteName={activePaletteName} onSelectPalette={onSelectPalette} palette={palette} />}
      </View>

      {drawerVisible && (
        <Animated.View
          style={[
            styles.overlay,
            {
              backgroundColor: '#00000066',
              opacity: drawerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
            },
          ]}
          pointerEvents={drawerOpen ? 'auto' : 'none'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
          <Animated.View
            style={[
              styles.drawer,
              {
                backgroundColor: palette.bar,
                borderRightColor: palette.border,
                transform: [
                  {
                    translateX: drawerAnim.interpolate({ inputRange: [0, 1], outputRange: [-280, 0] }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.drawerHeader}>
              <Text style={[styles.drawerTitle, { color: palette.text }]}>Navigation</Text>
              <Pressable style={[styles.closeBtn, { borderColor: palette.border, backgroundColor: palette.card }]} onPress={closeDrawer}>
                <Text style={[styles.closeBtnText, { color: palette.accent }]}>×</Text>
              </Pressable>
            </View>
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <Pressable key={tab.key} style={[styles.drawerItem, active && { backgroundColor: palette.accent + '22' }]} onPress={() => handleTabSelect(tab.key)}>
                  <Text style={[styles.drawerIcon, { color: active ? palette.accent : palette.sub }]}>{tab.icon}</Text>
                  <Text style={[styles.drawerLabel, { color: active ? palette.accent : palette.sub }]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    gap: 10,
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  menuBtnText: { fontSize: 22, marginTop: -2 },
  topTitle: { fontSize: 16, fontWeight: '700' },
  screen: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  drawer: {
    width: 270,
    height: '100%',
    borderRightWidth: 1,
    paddingTop: 18,
    paddingHorizontal: 12,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  drawerTitle: { fontSize: 18, fontWeight: '800' },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  closeBtnText: { fontSize: 20, lineHeight: 22 },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 6,
  },
  drawerIcon: { fontSize: 17, width: 24, textAlign: 'center' },
  drawerLabel: { fontSize: 14, fontWeight: '600' },
});
