import { useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { api } from '../../services/api';
import type { RecoveryResponse } from '../../types/waiter';

const ACTION_LABEL: Record<string, string> = {
  manager_visit: 'Send the manager over',
  comp_dessert: 'Offer a complimentary dessert',
  priority_fire: 'Flag table as kitchen priority',
  apology: 'Personal apology'
};

export function ServiceRecoverySheet() {
  const { selectedTableId, closeOverlay, showToast } = useWaiter();
  const [data, setData] = useState<RecoveryResponse | null>(null);

  useEffect(() => {
    if (!selectedTableId) return;
    api.recovery({ tableId: selectedTableId }).then(setData).catch(() => setData(null));
  }, [selectedTableId]);

  const severityColor = data?.severity === 'high' ? 'var(--w-red)' : data?.severity === 'medium' ? 'var(--w-amber)' : 'var(--w-green)';

  return (
    <div className="w-modal-wrap">
      <div className="w-backdrop" onClick={closeOverlay} />
      <div className="w-sheet">
        <div className="w-sheet-handle" />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p className="w-eyebrow">Service Recovery</p>
            <h2 className="w-display" style={{ fontSize: 30 }}>Put it right</h2>
          </div>
          <button className="w-sheet-close" onClick={closeOverlay}><X size={18} /></button>
        </div>

        {!data && <div className="w-spinner" />}
        {data && (
          <div style={{ marginTop: 16 }}>
            <div className="w-card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <AlertTriangle size={22} color={severityColor} />
              <div>
                <div style={{ fontWeight: 700, textTransform: 'capitalize', color: severityColor }}>{data.triggered ? `${data.severity} priority` : 'No issue detected'}</div>
                <div style={{ color: 'var(--w-text2)', fontSize: 13 }}>
                  {data.waitMinutes ? `Waiting ${data.waitMinutes} min` : 'On track'}{data.rating ? ` · last rating ${data.rating}/5` : ''}
                </div>
              </div>
            </div>

            {data.sayToTable && (
              <div className="w-saytable" style={{ marginTop: 16 }}>
                <div className="lbl">Say to the table</div>
                <p className="quote">“{data.sayToTable}”</p>
              </div>
            )}

            {data.suggestedActions.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p className="w-eyebrow-dim" style={{ marginBottom: 10 }}>Suggested actions</p>
                {data.suggestedActions.map(a => (
                  <button key={a} className="w-btn-ghost" style={{ width: '100%', marginBottom: 10, textAlign: 'left' }} onClick={() => { showToast('Action logged'); }}>
                    {ACTION_LABEL[a] || a}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
