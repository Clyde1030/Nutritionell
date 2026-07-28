'use client';
import s from './AboutTab.module.css';

const CONTACT_EMAIL = 'nutritionell@gmail.com';

// Photos live in web_new/public/team/ and are served at /team/<file>. To change a
// photo, replace the file at that path (keep the same name), or edit `photo` below.
const TEAM = [
  {
    name: 'Steve Lanciotti',
    role: 'The Alchemist',
    desc: 'Computer vision and vision-language models for accurate product detection, identification, and analysis.',
    photo: '/team/steve.png',
  },
  {
    name: 'Priyanka Banerjee',
    role: 'The Vanguard',
    desc: 'User-facing application for instantaneous nutrition insights, field testing, and milestone delivery.',
    photo: '/team/priyanka.jpeg',
  },
  {
    name: 'Yu-Sheng Lee',
    role: 'The Architect',
    desc: 'Cloud infrastructure, database architecture, and backend pipelines for real-time processing.',
    photo: '/team/yu-sheng.jpeg',
  },
  {
    name: 'Najmeh Rahimi',
    role: 'The Oracle',
    desc: 'Subject-matter expertise, domain logic, and user feedback loops for AI vision reasoning.',
    photo: '/team/najmeh.jpg',
  },
];

export default function AboutTab() {
  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <h1 className={s.title}>Contact Us</h1>
        <p className={s.subtitle}>
          Nutritionell is built by a small team who believe grocery shopping should be
          transparent, not overwhelming. Reach out any time.
        </p>
      </div>

      <h2 className={s.sectionTitle}>Meet the Team</h2>
      <div className={s.team}>
        {TEAM.map(m => (
          <div key={m.name} className={s.member}>
            <img className={s.photo} src={m.photo} alt={m.name} />
            <p className={s.memberName}>{m.name}</p>
            <p className={s.memberRole}>{m.role}</p>
            <p className={s.memberRoleDesc}>{m.desc}</p>
          </div>
        ))}
      </div>

      <h2 className={s.sectionTitle}>Get in Touch</h2>
      <div className={s.contactCard}>
        <p className={s.contactTitle}>Questions, feedback, or partnership ideas?</p>
        <p className={s.contactText}>
          We&apos;d love to hear from you — whether it&apos;s a bug report, a feature request,
          or just general feedback on how Nutritionell is working for you.
        </p>
        <a className={s.contactEmail} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </div>
    </div>
  );
}
