import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AppPalette } from '../../theme/palettes';

const TEAM_ASSET_BASE_URL = process.env.EXPO_PUBLIC_TEAM_ASSET_BASE_URL?.replace(/\/$/, '') ?? '';

const TEAM = [
  {
    name: 'Steve Lanciotti',
    role: 'Supply Chain Manager, Booz Allen Hamilton',
    bio: 'Analyst with experience in economics, supply chain, and national security living in Charleston, SC.',
    photoPath: '/team/steve.png',
  },
  {
    name: 'Najmeh Rahimi',
    role: 'Battery Thermal Analyst',
    bio: 'Analyst with 10 years of experience in EV industry focusing on thermal and physic based simulations. Living in Huntington Beach, CA.',
    photoPath: '/team/najmeh.jpg',
  },
  {
    name: 'Priyanka Banerjee',
    role: 'Software Engineer, Ex-Amazon',
    bio: 'Former SDE with an educational background in Computer and Data Sciences living in the CA Bay Area!',
    photoPath: '/team/priyanka.jpeg',
  },
  {
    name: 'Yu-Sheng Lee',
    role: 'Business Data Analyst, Protective Life',
    bio: 'Analyst with experience in life and P&C insurance living in Irvine, CA.',
    photoPath: '/team/yu-sheng.jpeg',
  },
];

export default function AboutTab({ palette }: { palette: AppPalette }) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]}>About Us</Text>
          <Text style={[styles.sub, { color: palette.sub }]}>Nutritionell is built by a small team who believe grocery shopping should be transparent, not overwhelming.</Text>
        </View>

        <Text style={[styles.section, { color: palette.text }]}>Meet the Team</Text>
        {TEAM.map((member) => {
          const photoUri = TEAM_ASSET_BASE_URL ? `${TEAM_ASSET_BASE_URL}${member.photoPath}` : '';
          const initials = member.name.split(' ').map((part) => part[0]).join('').slice(0, 2);
          return (
            <View key={member.name} style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={[styles.photo, { borderColor: palette.border }]} resizeMode="cover" />
              ) : (
                <View style={[styles.avatar, { backgroundColor: palette.bar, borderColor: palette.border }]}>
                  <Text style={{ color: palette.sub, fontWeight: '700' }}>{initials}</Text>
                </View>
              )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: palette.accent }]}>{member.name}</Text>
              <Text style={[styles.role, { color: palette.text }]}>{member.role}</Text>
              <Text style={[styles.bio, { color: palette.sub }]}>{member.bio}</Text>
            </View>
          </View>
          );
        })}

        <Text style={[styles.section, { color: palette.text }]}>Get in Touch</Text>
        <View style={[styles.contactCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.contactTitle, { color: palette.text }]}>Questions, feedback, or partnership ideas?</Text>
          <Text style={[styles.contactBody, { color: palette.sub }]}>We would love to hear from you, whether it is a bug report, a feature request, or general feedback on how Nutritionell is working for you.</Text>
          <View style={[styles.emailChip, { backgroundColor: palette.accent + '22' }]}>
            <Text style={[styles.emailText, { color: palette.accent }]}>nutritionell@gmail.com</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  sub: { marginTop: 8, lineHeight: 20, textAlign: 'center', maxWidth: 620 },
  section: { fontWeight: '800', marginTop: 26, marginBottom: 12, fontSize: 20, textAlign: 'center' },
  card: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  avatar: { width: 52, height: 52, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 52, height: 52, borderRadius: 12, borderWidth: 1 },
  name: { fontSize: 16, fontWeight: '800' },
  role: { marginTop: 2, fontWeight: '600', fontSize: 13.5 },
  bio: { marginTop: 6, lineHeight: 18, fontSize: 12.5 },
  contactCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  contactTitle: { fontWeight: '700' },
  contactBody: { marginTop: 6, lineHeight: 20 },
  emailChip: { marginTop: 14, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  emailText: { fontWeight: '700' },
});
