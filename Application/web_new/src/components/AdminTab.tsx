'use client';
/**
 * Admin screen for the TEMPORARY approval gate.
 *
 * Reached from the account menu (admins only), not the top nav — see the note in
 * lib/tabs.ts. Goes away with the rest of the gate.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  ENDPOINTS,
  adminUserAction,
  authJson,
  type AdminUserActionName,
} from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import s from './AdminTab.module.css';

interface AdminUser {
  id: string;
  email: string;
  is_approved: boolean;
  is_admin: boolean;
  created_at: string;
}

interface ActionResponse {
  user: AdminUser;
  message: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminTab() {
  const { user: currentUser } = useAuth();

  const [pending, setPending] = useState<AdminUser[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Which user+action is in flight, so only that button shows a busy state.
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, u] = await Promise.all([
        authJson<AdminUser[]>(ENDPOINTS.adminPendingUsers),
        authJson<AdminUser[]>(ENDPOINTS.adminUsers),
      ]);
      setPending(p);
      setUsers(u);
    } catch (e: any) {
      // A 401 already cleared the session and reopened the login modal.
      if (!(e instanceof ApiError && e.status === 401)) {
        setError(e instanceof ApiError ? e.detail : 'Could not load accounts.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (target: AdminUser, action: AdminUserActionName) => {
    setBusy(`${target.id}:${action}`);
    setError(null);
    setNotice(null);
    try {
      const res = await authJson<ActionResponse>(adminUserAction(target.id, action), {
        method: 'POST',
      });
      // The backend writes a human-readable message for every action (including
      // the "already an admin" no-ops) — show it rather than inventing our own.
      setNotice(res.message);

      // Patch the row in place so the screen reflects reality immediately; the
      // pending list is derived from the same truth, so recompute it here too.
      setUsers(prev => prev.map(u => (u.id === res.user.id ? res.user : u)));
      setPending(prev =>
        res.user.is_approved
          ? prev.filter(u => u.id !== res.user.id)
          : prev.some(u => u.id === res.user.id)
            ? prev.map(u => (u.id === res.user.id ? res.user : u))
            : [...prev, res.user],
      );
    } catch (e: any) {
      if (!(e instanceof ApiError && e.status === 401)) {
        // The self-removal guard lands here — its 400 detail is the explanation.
        setError(e instanceof ApiError ? e.detail : 'That action failed.');
      }
    } finally {
      setBusy(null);
    }
  };

  const isBusy = (u: AdminUser, a: AdminUserActionName) => busy === `${u.id}:${a}`;

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <h1 className={s.title}>Admin</h1>
        <p className={s.subtitle}>
          Signup is open, but a new account can&rsquo;t use Nutritionell until it&rsquo;s approved
          here. Temporary — this screen goes away once open signup is ready.
        </p>
      </div>

      {error && (
        <div className={s.errorBanner} role="alert">
          <span>{error}</span>
          <button className={s.errorDismiss} onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {notice && (
        <div className={s.noticeBanner} role="status">
          <span>{notice}</span>
          <button className={s.errorDismiss} onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {loading ? (
        <section className={s.card}>
          <p className={s.empty}>Loading accounts…</p>
        </section>
      ) : (
        <>
          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>Pending approval</h2>
              <span className={s.valuePill}>{pending.length}</span>
            </div>
            <p className={s.cardText}>
              Waiting longest first. Approving takes effect immediately — they don&rsquo;t need to
              sign in again.
            </p>

            {pending.length === 0 ? (
              <p className={s.empty}>Nobody is waiting. 🎉</p>
            ) : (
              <ul className={s.rows}>
                {pending.map(u => (
                  <li key={u.id} className={s.row}>
                    <div className={s.rowMain}>
                      <span className={s.email}>{u.email}</span>
                      <span className={s.meta}>signed up {formatDate(u.created_at)}</span>
                    </div>
                    <div className={s.rowActions}>
                      <button
                        className={s.primaryBtn}
                        disabled={isBusy(u, 'approve')}
                        onClick={() => run(u, 'approve')}
                      >
                        {isBusy(u, 'approve') ? 'Approving…' : 'Approve'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>All accounts</h2>
              <span className={s.valuePill}>{users.length}</span>
            </div>
            <p className={s.cardText}>
              An admin always has access, whether or not they&rsquo;re separately approved.
            </p>

            <ul className={s.rows}>
              {users.map(u => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <li key={u.id} className={s.row}>
                    <div className={s.rowMain}>
                      <span className={s.email}>
                        {u.email}
                        {isSelf && <span className={s.you}>you</span>}
                      </span>
                      <span className={s.badges}>
                        <span className={u.is_approved ? s.badgeOn : s.badgeOff}>
                          {u.is_approved ? 'Approved' : 'Not approved'}
                        </span>
                        {u.is_admin && <span className={s.badgeAdmin}>Admin</span>}
                      </span>
                    </div>
                    <div className={s.rowActions}>
                      <button
                        className={s.secondaryBtn}
                        disabled={isBusy(u, 'make-admin') || isBusy(u, 'remove-admin')}
                        // Disabled rather than hidden for self-removal: the button
                        // staying put explains why it can't be used.
                        title={
                          u.is_admin && isSelf
                            ? "You can't remove your own admin rights"
                            : undefined
                        }
                        onClick={() => run(u, u.is_admin ? 'remove-admin' : 'make-admin')}
                      >
                        {u.is_admin ? 'Remove admin' : 'Make admin'}
                      </button>
                      <button
                        className={u.is_approved ? s.dangerBtn : s.primaryBtn}
                        disabled={isBusy(u, 'approve') || isBusy(u, 'revoke')}
                        onClick={() => run(u, u.is_approved ? 'revoke' : 'approve')}
                      >
                        {u.is_approved ? 'Revoke' : 'Approve'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
