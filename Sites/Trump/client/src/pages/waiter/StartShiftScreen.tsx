import { useState } from 'react';
import { useWaiter } from '../../context/WaiterContext';
import { useAuth } from '../../hooks/useAuth';
import { BRAND_NAME, SHIFT_START, DEFAULT_SECTION, WAITER_ROLES } from '../../constants/waiter';
import type { WaiterRole } from '../../types/waiter';

const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long' });

export function StartShiftScreen() {
  const { startShift } = useWaiter();
  const { user } = useAuth();
  const [name, setName] = useState(user?.label && user.label !== 'Waiter' ? user.label : 'Demetri');
  const [role, setRole] = useState<WaiterRole>('Head Waiter');
  const section = DEFAULT_SECTION;

  return (
    <div className="w-screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="w-avatar">A</span>
          <span className="w-display" style={{ fontSize: 26 }}>Emenyu</span>
        </div>
        <span className="w-chip" style={{ pointerEvents: 'none' }}>Floor</span>
      </div>

      <div style={{ marginTop: 'min(12vh, 90px)' }}>
        <p className="w-eyebrow">{BRAND_NAME} · {today} Service</p>
        <h1 className="w-display" style={{ fontSize: 46, marginTop: 14 }}>
          Good evening.<br /><em className="w-gold-text" style={{ fontStyle: 'italic' }}>Who's on the floor?</em>
        </h1>
      </div>

      <div style={{ marginTop: 28 }}>
        <p className="w-eyebrow-dim">Your name</p>
        <input className="w-field" style={{ marginTop: 8 }} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
      </div>

      <div style={{ marginTop: 22 }}>
        <p className="w-eyebrow-dim">Role</p>
        <div className="w-role-pills" style={{ marginTop: 8 }}>
          {WAITER_ROLES.map(r => (
            <button key={r} className={`w-role-pill ${role === r ? 'active' : ''}`} onClick={() => setRole(r)}>{r}</button>
          ))}
        </div>
      </div>

      <div className="w-card" style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="w-eyebrow-dim">Your section tonight</span>
          <span className="w-eyebrow">{section.length} Tables</span>
        </div>
        <div className="w-section-chips" style={{ marginTop: 14 }}>
          {section.map(n => <span key={n} className="w-section-chip">{n}</span>)}
        </div>
      </div>

      <button className="w-btn-primary" style={{ marginTop: 28 }} disabled={!name.trim()} onClick={() => startShift(name.trim(), role, section)}>
        Start Service
      </button>
      <p style={{ textAlign: 'center', color: 'var(--w-text3)', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 18 }}>
        Shift started {SHIFT_START} · 30 tables on floor
      </p>
    </div>
  );
}
