import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Send, Sparkles } from 'lucide-react';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import type { ChatSuggestionItem, ChatResponse } from '../../types/menu';
import styles from './ChatPanel.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: ChatSuggestionItem[];
}

interface ChatPanelProps {
  onItemClick?: (item: ChatSuggestionItem) => void;
}

const SUGGESTED_PROMPTS = [
  "Can you suggest a wine for tonight?",
  "What's the chef's recommendation tonight?",
  "I'm celebrating a birthday — what do you suggest?",
  "What's the best steak on the menu?",
  "What are the vegetarian options?",
];

export function ChatPanel({ onItemClick }: ChatPanelProps) {
  const { chatOpen, setChatOpen } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [chatOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    setInput('');
    const userMsg: Message = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await api.chat({ message: content, history }) as ChatResponse;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.reply || 'Sorry, I had trouble responding.',
        suggestions: res.suggestions || []
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'I\'m having a moment — please try again shortly.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        className={styles.launcher}
        onClick={() => setChatOpen(!chatOpen)}
        aria-label={chatOpen ? 'Close concierge chat' : 'Open concierge chat'}
        aria-expanded={chatOpen}
      >
        {chatOpen ? <X size={20} /> : <Sparkles size={20} />}
      </button>

      <AnimatePresence>
        {chatOpen && (
          <motion.div
            className={styles.panel}
            role="dialog"
            aria-label="Concierge chat"
            aria-modal="false"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className={styles.panelHeader}>
              <Sparkles size={16} />
              <span>Trumps Concierge</span>
            </div>

            <div className={styles.messages} aria-live="polite" aria-atomic="false">
              {messages.length === 0 && (
                <div className={styles.welcome}>
                  <p>Hello! I'm your personal dining concierge. How can I help you tonight?</p>
                  <div className={styles.suggestions}>
                    {SUGGESTED_PROMPTS.map((p, i) => (
                      <button key={i} className={styles.suggestion} onClick={() => sendMessage(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i}>
                  <div className={`${styles.message} ${msg.role === 'user' ? styles.userMsg : styles.assistantMsg}`}>
                    {msg.content}
                  </div>
                  {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && (
                    <div className={styles.suggestionCards}>
                      {msg.suggestions.map((item, j) => (
                        <button
                          key={j}
                          className={styles.suggestionCard}
                          onClick={() => onItemClick?.(item)}
                          aria-label={`View ${item.name}`}
                        >
                          {item.img && (
                            <img
                              src={item.img.startsWith('/') ? item.img : `/Trump/${item.img}`}
                              alt={item.name}
                              className={styles.cardImg}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                          <div className={styles.cardBody}>
                            <span className={styles.cardName}>{item.name}</span>
                            <span className={styles.cardPrice}>R{item.price.toFixed(2)}</span>
                            {item.source_title && (
                              <span className={styles.cardSource}>{item.source_title}</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className={`${styles.message} ${styles.assistantMsg} ${styles.typing}`}>
                  <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
                </div>
              )}
              <div ref={endRef} />
            </div>

            <form
              className={styles.inputRow}
              onSubmit={e => { e.preventDefault(); sendMessage(input); }}
            >
              <input
                ref={inputRef}
                type="text"
                className={styles.input}
                placeholder="Ask anything about our menu…"
                value={input}
                onChange={e => setInput(e.target.value)}
                aria-label="Chat message"
              />
              <button
                type="submit"
                className={styles.sendBtn}
                disabled={loading || !input.trim()}
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
