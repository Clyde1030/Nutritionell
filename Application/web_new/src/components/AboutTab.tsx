'use client';
import s from './AboutTab.module.css';

const CONTACT_EMAIL = 'nutritionell@gmail.com';

const TEAM = [
  {
    name: 'Steve Lanciotti',
    role: 'Supply Chain Manager, Booz Allen Hamilton',
    photoUrl: '/team/steve.png',
    photoAlt: 'Portrait of Steve Lanciotti',
  },
  {
    name: 'Najmeh Rahimi',
    role: 'Battery Thermal Analyst',
    photoUrl: '/team/najmeh.jpg',
    photoAlt: 'Portrait of Najmeh Rahimi',
  },
  {
    name: 'Priyanka Banerjee',
    role: 'Software Engineer, Ex-Amazon',
    photoUrl: '/team/priyanka.jpeg',
    photoAlt: 'Portrait of Priyanka Banerjee',
  },
  {
    name: 'Yu-Sheng Lee',
    role: 'Business Data Analyst, Protective Life',
    photoUrl: '/team/yu-sheng.jpeg',
    photoAlt: 'Portrait of Yu_Sheng Lee',
  },
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
            <img className={s.photo} src={m.photoUrl} alt={m.photoAlt} />
            <div className={s.memberContent}>
              <p className={s.memberName}>{m.name}</p>
              <p className={s.memberRole}>{m.role}</p>
            </div>
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
