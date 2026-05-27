import { useState, type FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Spinner } from '../components/ui/Spinner';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (user) {
    const dest = user.role === 'waiter' ? '/Waiter' : user.role === 'kitchen' ? '/Kitchen' : '/Admin';
    return <Navigate to={dest} replace />;
  }

  function roleToPath(role: string, defaultPath?: string): string {
    if (defaultPath) return defaultPath;
    if (role === 'waiter') return '/Trump/Waiter';
    if (role === 'kitchen') return '/Trump/Kitchen';
    return '/Trump/Admin';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login({ username, password });
      if (result.ok && result.user) {
        const dest = roleToPath(result.user.role, result.defaultPath);
        window.location.href = dest;
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
          <div className={styles.brandMark}>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19V5h16v14" />
              <path d="M8 19V9h8v10" />
            </svg>
          </div>
          <h1 className={styles.title}>TRUMPS</h1>
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
          <a href="/Trump/table1">← Back to menu</a>
        </p>
      </div>
    </div>
  );
}
