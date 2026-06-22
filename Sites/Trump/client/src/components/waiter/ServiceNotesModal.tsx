import { useState } from 'react';
import { X } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { SERVICE_NOTE_TAGS } from '../../constants/waiter';

export function ServiceNotesModal() {
  const { selectedTableId, notes, setTableNotes, closeOverlay, showToast } = useWaiter();
  const existing = selectedTableId ? notes[selectedTableId] : undefined;
  const [text, setText] = useState(existing?.text || '');
  const [tags, setTags] = useState<string[]>(existing?.tags || []);

  const toggleTag = (tag: string) => setTags(t => (t.includes(tag) ? t.filter(x => x !== tag) : [...t, tag]));
  const save = () => {
    if (selectedTableId) setTableNotes(selectedTableId, { text, tags });
    showToast('Notes saved');
    closeOverlay();
  };

  const num = selectedTableId ? selectedTableId.replace('table', '') : '';

  return (
    <div className="w-modal-wrap">
      <div className="w-backdrop" onClick={closeOverlay} />
      <div className="w-modal" style={{ position: 'relative', zIndex: 2 }}>
        <div className="w-modal-head">
          <div>
            <h2 className="w-modal-title">Service notes</h2>
            <p className="w-modal-sub">Table {num} · allergies, preferences, requests</p>
          </div>
          <button className="w-modal-close" onClick={closeOverlay}><X size={18} /></button>
        </div>

        <textarea
          className="w-textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="e.g. Window seat · nut allergy (guest 2) · anniversary — bring baklava with candle at dessert"
        />

        <div className="w-tones" style={{ marginTop: 16 }}>
          {SERVICE_NOTE_TAGS.map(tag => (
            <button key={tag} className={`w-tone ${tags.includes(tag) ? 'active' : ''}`} onClick={() => toggleTag(tag)}>
              {tags.includes(tag) ? '✓ ' : ''}{tag}
            </button>
          ))}
        </div>

        <button className="w-btn-primary" style={{ marginTop: 22 }} onClick={save}>Save notes</button>
      </div>
    </div>
  );
}
