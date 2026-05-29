import { X, Bell, Check, Users } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import type { WaiterAlert } from '../../types/waiter';

function AlertIcon({ kind }: { kind: WaiterAlert['kind'] }) {
  if (kind === 'manager') return <Users size={17} />;
  if (kind === 'ready') return <Check size={17} color="var(--w-blue)" />;
  return <Bell size={17} color="var(--w-gold)" />;
}

export function FloorAlerts() {
  const { alerts, respondAlert, dismissAlert, closeOverlay } = useWaiter();

  return (
    <div className="w-modal-wrap" style={{ alignItems: 'stretch' }}>
      <div className="w-backdrop" onClick={closeOverlay} />
      <div className="w-sheet" style={{ maxHeight: '92vh' }}>
        <div className="w-sheet-handle" />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p className="w-eyebrow">Floor Alerts</p>
            <h2 className="w-display" style={{ fontSize: 30 }}>Waiting on you</h2>
          </div>
          <button className="w-sheet-close" onClick={closeOverlay}><X size={18} /></button>
        </div>

        <div style={{ marginTop: 18 }}>
          {alerts.length === 0 && <p className="w-empty">All clear — no alerts right now.</p>}
          {alerts.map(a => (
            <div key={a.id} className={`w-alert ${a.kind}`}>
              <div className="w-alert-head">
                <span className="w-alert-icon"><AlertIcon kind={a.kind} /></span>
                <b style={{ color: a.kind === 'manager' ? 'var(--w-red)' : 'var(--w-text)' }}>{a.title}</b>
                <span className="w-alert-time">{a.time}</span>
              </div>
              <p className="w-alert-msg">{a.message}</p>
              {a.state === 'responded' ? (
                <span className="w-alert-responded"><Check size={15} /> Responded</span>
              ) : (
                <div className="w-alert-actions">
                  <button className="w-btn-primary" style={{ padding: 13 }} onClick={() => respondAlert(a.id)}>On my way</button>
                  <button className="w-btn-ghost" onClick={() => dismissAlert(a.id)}>Dismiss</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
