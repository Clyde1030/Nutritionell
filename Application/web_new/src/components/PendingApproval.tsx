'use client';
/**
 * Shown to a signed-in account that hasn't been approved yet.
 *
 * Deliberately NOT the auth modal: a pending user is already authenticated, so
 * asking them to log in again would be both confusing and useless. They see a
 * waiting notice and a way out.
 */
import styles from '@/app/page.module.css';

export default function PendingApproval({
  email,
  onLogout,
}: {
  email?: string;
  onLogout: () => void;
}) {
  return (
    <div className={styles.gateNotice}>
      <h2>Your account is pending approval</h2>
      <p>
        Thanks for signing up{email ? ` as ${email}` : ''}. Nutritionell is being rebuilt right
        now, so new accounts are approved by hand. We&rsquo;ll notify you once you&rsquo;re
        approved — then everything here unlocks automatically, no need to sign up again.
      </p>
      <p className={styles.gateSub}>Home and Contact Us stay available in the meantime.</p>
      <button className={styles.gateBtn} onClick={onLogout}>
        Log out
      </button>
    </div>
  );
}
