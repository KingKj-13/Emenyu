import { useEffect, useRef, useState } from 'react';
import { X, Mic } from 'lucide-react';
import { useWaiter } from '../../context/WaiterContext';
import { api } from '../../services/api';

/* Minimal Web Speech API typings (not in lib.dom by default). */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function getRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function VoiceAssistant() {
  const { selectedTableId, closeOverlay } = useWaiter();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [thinking, setThinking] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const rec = getRecognition();
    if (!rec) { setSupported(false); return; }
    rec.lang = 'en-ZA';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = e => {
      const text = Array.from(e.results).map(r => r[0].transcript).join(' ');
      setTranscript(text);
    };
    rec.onend = () => { setListening(false); };
    rec.onerror = () => { setListening(false); };
    recRef.current = rec;
    return () => { try { rec.stop(); } catch { /* noop */ } };
  }, []);

  const ask = async (text: string) => {
    if (!text.trim()) return;
    setThinking(true);
    setReply('');
    try {
      const res = await api.ask({ message: text, tableId: selectedTableId || undefined });
      setReply(res.reply);
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(res.reply);
        u.rate = 1.02;
        window.speechSynthesis.speak(u);
      }
    } catch {
      setReply('Sorry — I could not reach the assistant just now.');
    } finally {
      setThinking(false);
    }
  };

  const toggle = () => {
    if (!recRef.current) return;
    if (listening) {
      recRef.current.stop();
      setListening(false);
      ask(transcript);
    } else {
      setTranscript('');
      setReply('');
      try { recRef.current.start(); setListening(true); } catch { /* noop */ }
    }
  };

  return (
    <div className="w-modal-wrap">
      <div className="w-backdrop" onClick={closeOverlay} />
      <div className="w-sheet" style={{ textAlign: 'center' }}>
        <div className="w-sheet-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <p className="w-eyebrow">Voice Assistant</p>
          <button className="w-sheet-close" onClick={closeOverlay}><X size={18} /></button>
        </div>

        {!supported ? (
          <div style={{ padding: '20px 0' }}>
            <p style={{ color: 'var(--w-text2)' }}>Voice isn't supported on this device. Type your question instead:</p>
            <input
              className="w-floor-search"
              style={{ marginTop: 14 }}
              placeholder="e.g. What wine matches the Tomahawk?"
              onKeyDown={e => { if (e.key === 'Enter') ask((e.target as HTMLInputElement).value); }}
            />
          </div>
        ) : (
          <div style={{ padding: '24px 0 8px' }}>
            <button className={`w-mic ${listening ? 'listening' : ''}`} onClick={toggle}><Mic size={30} /></button>
            <p style={{ marginTop: 16, color: 'var(--w-text2)' }}>{listening ? 'Listening… tap to ask' : 'Tap to speak'}</p>
          </div>
        )}

        {transcript && <p className="w-display" style={{ fontSize: 22, marginTop: 10 }}>“{transcript}”</p>}
        {thinking && <div className="w-spinner" />}
        {reply && (
          <div className="w-sable" style={{ marginTop: 16, textAlign: 'left' }}>
            <p className="w-sable-body">{reply}</p>
          </div>
        )}
      </div>
    </div>
  );
}
