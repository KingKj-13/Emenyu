import { useState, type FormEvent } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useApp } from '../context/AppContext';
import { Spinner } from '../components/ui/Spinner';
import { LANDING_BRAND_NAME } from '../constants/api';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { user, login } = useAuth();
  const { tableId } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (user) {
    const dest = user.role === 'waiter' ? '/Waiter' : user.role === 'kitchen' ? '/Kitchen' : user.role === 'owner' ? '/Owner' : '/Admin';
    return <Navigate to={dest} replace />;
  }

  function roleToPath(role: string, defaultPath?: string): string {
    const path = defaultPath?.replace(/^\/Trump/i, '') || '';
    if (path) return path;
    if (role === 'waiter') return '/Waiter';
    if (role === 'kitchen') return '/Kitchen';
    if (role === 'owner') return '/Owner';
    return '/Admin';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login({ username, password });
      if (result.ok && result.user) {
        const dest = roleToPath(result.user.role, result.defaultPath);
        navigate(dest, { replace: true });
      } else {
        setError(result.error || 'Invalid credentials. Please try again.');
      }
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.brand}>
          {/* Same circled-T monogram as the customer landing screen — one brand, one mark. */}
          <div className={styles.brandMark} aria-hidden>{LANDING_BRAND_NAME.charAt(0)}</div>
          <h1 className={styles.title}>{LANDING_BRAND_NAME}</h1>
          <div className={styles.line} />
          <p className={styles.subtitle}>Staff Portal</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              className={styles.input}
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">Password</label>
            <div className={styles.passWrap}>
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                className={styles.input}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className={styles.passToggle}
                onClick={() => setShowPass(v => !v)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading || !username || !password}>
            {loading ? <Spinner size={18} /> : 'Sign In'}
          </button>
        </form>

        <p className={styles.back}>
          <Link to={`/${tableId}`}>← Back to menu</Link>
        </p>
      </div>
    </div>
  );
}
