import { useState } from 'react';
import { api } from '../services/api';
import styles from './ReservationPage.module.css';

export function ReservationPage() {
  const [form, setForm] = useState({ name: '', phone: '', partySize: 2, date: '', time: '', notes: '' });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const timeSlots = Array.from({ length: 23 }, (_, i) => {
    const h = Math.floor(i / 2) + 11;
    const m = i % 2 === 0 ? '00' : '30';
    return `${String(h).padStart(2, '0')}:${m}`;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.date || !form.time) {
      setError('Please fill in your name, date and time.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const dateTime = new Date(`${form.date}T${form.time}`);
      await api.createReservation({ ...form, date: dateTime.toISOString() });
      setSubmitted(true);
    } catch {
      setError('Could not submit reservation. Please try again or call us directly.');
    }
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.successIcon}>✓</div>
          <h2 className={styles.successTitle}>Reservation Received</h2>
          <p className={styles.successText}>
            Thank you, <strong>{form.name}</strong>! We have your table request for{' '}
            <strong>{form.partySize} {form.partySize === 1 ? 'person' : 'people'}</strong> on{' '}
            <strong>{form.date} at {form.time}</strong>.
          </p>
          <p className={styles.successNote}>Our team will confirm your booking shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h1 className={styles.title}>Reserve a Table</h1>
          <p className={styles.subtitle}>We'll confirm your booking as soon as possible.</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Your Name *</label>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g. John Smith"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Phone Number</label>
            <input
              className={styles.input}
              type="tel"
              placeholder="e.g. +27 82 000 0000"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Party Size *</label>
              <select
                className={styles.input}
                value={form.partySize}
                onChange={e => setForm(f => ({ ...f, partySize: Number(e.target.value) }))}
              >
                {Array.from({ length: 15 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Date *</label>
              <input
                className={styles.input}
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Time *</label>
              <select
                className={styles.input}
                value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                required
              >
                <option value="">Select time</option>
                {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Special Requests</label>
            <textarea
              className={styles.textarea}
              placeholder="Allergies, high chair needed, birthday celebration…"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Submitting…' : 'Request Reservation'}
          </button>
        </form>
      </div>
    </div>
  );
}
