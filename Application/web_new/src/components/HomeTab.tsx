'use client';
import s from './HomeTab.module.css';

interface Props {
  onNavigate: (tab: string) => void;
}

const STEPS = [
  {
    n: 1,
    title: 'Set up your profile',
    text: 'Tell us your dietary needs, allergens, and health goals so every result is scored for you.',
  },
  {
    n: 2,
    title: 'Scan a shelf',
    text: 'Snap or upload a photo of a grocery shelf. Our model detects and identifies every product.',
  },
  {
    n: 3,
    title: 'Get instant analysis',
    text: 'See ingredients, nutrition, and a personalized score — plus better alternatives you can act on.',
  },
];

const FEATURES = [
  { icon: '⊕', title: 'Shelf scanning', text: 'AI detects every product in one photo and scores it against your profile.' },
  { icon: '🔍', title: 'Greenwashing check', text: 'Cut through marketing claims to see what a product really is.' },
  { icon: '🧬', title: 'Nutrition insights', text: 'Break down ingredients and nutrition so you can compare with confidence.' },
];

const VALUE_PROPS = [
  {
    title: 'Built for the real shelf, not the barcode',
    text: 'No more scanning one item at a time. Nutritionell reads an entire shelf in a single photo, so you get a complete picture in seconds instead of minutes.',
  },
  {
    title: 'Personalized to you, not a generic label',
    text: 'The same product can be great for one person and a poor fit for another. Every score reflects your allergies, dietary philosophy, avoided ingredients, and goals.',
  },
  {
    title: 'Marketing claims held to a standard',
    text: 'Front-of-pack claims like "All Natural" or "Heart Healthy" aren’t always what they seem. Our greenwashing check compares the claim to the actual ingredients and nutrition.',
  },
  {
    title: 'Transparent about how it works',
    text: 'Before you scan, you can see exactly what data is sent and how the pipeline reaches a score — nothing about the process is a black box.',
  },
];

export default function HomeTab({ onNavigate }: Props) {
  return (
    <div className={s.wrap}>
      {/* Hero */}
      <section className={s.hero}>
        <span className={s.badge}>AI-POWERED GROCERY ANALYSIS</span>
        <h1 className={s.title}>
          Know what&apos;s on the shelf<br />before it&apos;s in your <span className={s.accent}>cart</span>
        </h1>
        <p className={s.subtitle}>
          Nutritionell turns a single photo of a grocery shelf into a clear, personalized breakdown —
          identifying every product, analyzing its ingredients and nutrition, and scoring it against
          your dietary profile.
        </p>
        <div className={s.ctaRow}>
          <button className={s.ctaPrimary} onClick={() => onNavigate('profile')}>Set up your profile</button>
          <button className={s.ctaSecondary} onClick={() => onNavigate('scan')}>Scan a shelf</button>
        </div>
      </section>

      {/* Mission */}
      <section className={s.missionCard}>
        <p className={s.missionLabel}>Our Mission</p>
        <p className={s.missionText}>
          The modern grocery store is designed for brands, not shoppers. Consumers are left to
          decode flashy marketing and obscure ingredient lists on their own, one product at a time.
          Nutritionell exists to put scale and simplicity at the heart of nutrition intelligence —
          so anyone can walk down a grocery aisle and instantly understand what they&apos;re
          actually buying, without becoming a food-label expert first.
        </p>
      </section>

      {/* How it works */}
      <h2 className={s.sectionTitle}>How it works</h2>
      <p className={s.sectionSub}>Three steps from shelf to smarter choices.</p>
      <div className={s.steps}>
        {STEPS.map(step => (
          <div key={step.n} className={s.step}>
            <div className={s.stepNum}>{step.n}</div>
            <div className={s.stepTitle}>{step.title}</div>
            <div className={s.stepText}>{step.text}</div>
          </div>
        ))}
      </div>

      {/* Features */}
      <h2 className={s.sectionTitle}>What you can do</h2>
      <p className={s.sectionSub}>Everything you need to shop with confidence.</p>
      <div className={s.features}>
        {FEATURES.map(f => (
          <div key={f.title} className={s.feature}>
            <div className={s.featureIcon}>{f.icon}</div>
            <div className={s.featureTitle}>{f.title}</div>
            <div className={s.featureText}>{f.text}</div>
          </div>
        ))}
      </div>

      {/* Value proposition */}
      <h2 className={s.sectionTitle}>Why Nutritionell</h2>
      <p className={s.sectionSub}>What sets this apart from a barcode scanner.</p>
      <div className={s.valueList}>
        {VALUE_PROPS.map(v => (
          <div key={v.title} className={s.valueRow}>
            <div className={s.valueTitle}>{v.title}</div>
            <div className={s.valueText}>{v.text}</div>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <section className={s.disclaimer}>
        <p className={s.disclaimerTitle}>⚠️ A Note on Medical Advice</p>
        <p className={s.disclaimerText}>
          Nutritionell is an informational tool designed to help you understand product
          ingredients and nutrition more easily. It is <strong>not a medical device</strong> and
          does not provide medical advice, diagnosis, or treatment. Scores and recommendations are
          generated by AI models and general nutrition data, and may be incomplete or inaccurate.
          Always consult a qualified healthcare provider or registered dietitian for guidance on
          your specific health conditions, allergies, or dietary needs before making decisions
          based on this app.
        </p>
      </section>
    </div>
  );
}
