'use client';
import s from './AboutTab.module.css';

const CONTACT_EMAIL = 'nutritionell@gmail.com';

// Placeholders — swap in real names, roles, and photo URLs when available.
const TEAM = [
  { name: 'Team Member 1', role: 'Role / Title' },
  { name: 'Team Member 2', role: 'Role / Title' },
  { name: 'Team Member 3', role: 'Role / Title' },
  { name: 'Team Member 4', role: 'Role / Title' },
];

export default function AboutTab() {
  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <h1 className={s.title}>About Us</h1>
        <p className={s.subtitle}>
          Nutritionell is built by a small team who believe grocery shopping should be
          transparent, not overwhelming.
        </p>
      </div>

      <h2 className={s.sectionTitle}>Meet the Team</h2>
      <div className={s.team}>
        {TEAM.map(m => (
          <div key={m.name} className={s.member}>
            <div className={s.photo} aria-hidden="true">👤</div>
            <p className={s.memberName}>{m.name}</p>
            <p className={s.memberRole}>{m.role}</p>
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
