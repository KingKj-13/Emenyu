import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Send, Sparkles, Bell, Check } from 'lucide-react';
import { api } from '../../services/api';
import { getSocket } from '../../services/socket';
import { RESTAURANT_ID } from '../../constants/api';
import { useApp } from '../../context/AppContext';
import { useCart } from '../../context/CartContext';
import { RecommendationCard, type RecommendationItem } from '../reco/RecommendationCard';
import { trackImpressions, trackClick, trackAccepted } from '../../lib/recoAnalytics';
import type { ChatSuggestionItem, ChatResponse } from '../../types/menu';
import styles from './ChatPanel.module.css';

const CHAT_RECO_CTX = { mode: 'customer', source: 'chat' } as const;

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
  const { chatOpen, setChatOpen, tableId } = useApp();
  const { items: cartItems, addItem, removeAt } = useCart();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [waiterCalled, setWaiterCalled] = useState(false);
  // Phase 3B: the assistant's display name (Donald) comes from server config.
  const [assistantName, setAssistantName] = useState('Donald');
  // Phase 3 (Dining Concierge): a quiet gold badge on the chat icon when the
  // Brain has a new next-best suggestion for this cart -- never opens the
  // panel itself, never repeats once shown for the same suggestion.
  const [hasUnseenSuggestion, setHasUnseenSuggestion] = useState(false);
  const lastNotifiedName = useRef<string | null>(null);

  useEffect(() => {
    api.getConfig().then(c => { if (c?.assistantName) setAssistantName(c.assistantName); }).catch(() => { /* keep default */ });
  }, []);

  useEffect(() => {
    if (chatOpen) { setHasUnseenSuggestion(false); return; }
    if (!cartItems.length) return;
    const timer = window.setTimeout(async () => {
      try {
        const recs = await api.getRecommendations({ cart: cartItems }) as ChatSuggestionItem[];
        const top = recs?.[0]?.name || null;
        if (top && top !== lastNotifiedName.current) {
          lastNotifiedName.current = top;
          setHasUnseenSuggestion(true);
        }
      } catch { /* stay quiet -- a missed badge is not worth surfacing an error for */ }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [cartItems, chatOpen]);

  function callWaiter() {
    getSocket().emit('callWaiter', { restaurantId: RESTAURANT_ID, tableId });
    setWaiterCalled(true);
    window.setTimeout(() => setWaiterCalled(false), 2600);
  }
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
      // Phase 3B: send the live cart so Donald can do cart-aware cross-sell.
      const res = await api.chat({ message: content, history, tableId, cart: cartItems }) as ChatResponse;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.reply || 'Sorry, I had trouble responding.',
        suggestions: res.suggestions || []
      }]);
      if (res.suggestions?.length) trackImpressions(res.suggestions, CHAT_RECO_CTX);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'I\'m having a moment — please try again shortly.' }]);
    } finally {
      setLoading(false);
    }
  }

  // Phase 3 (Dining Concierge): "Add to Cart" straight from the chat card, no
  // detour through the item modal. Reuses the same CartContext every other
  // add-to-cart path in the app already uses.
  function addFromChat(item: ChatSuggestionItem) {
    addItem({ name: item.name, price: item.price, img: item.img, description: item.description, source: 'guest' });
    trackAccepted(item, CHAT_RECO_CTX);
  }

  // A same-role swap (Phase 1 Replacement Logic: item.replacement). Only
  // trusted for beverages/desserts (the reliable case since Phase 1) or an
  // explicit premium-upgrade candidate (rotationGroup "upgrade:*") -- MAIN
  // otherwise mixes in sides/sauces the shared classifier also buckets as
  // MAIN, which would misread as "replace the steak with the chips".
  function canReplace(item: ChatSuggestionItem): boolean {
    if (!item.replacement) return false;
    if (item.rotationGroup?.startsWith('upgrade:')) return true;
    return ['WINE', 'DRINK', 'DESSERT'].includes(item.categoryType || '');
  }

  function replaceFromChat(item: ChatSuggestionItem) {
    if (!item.replacement) return;
    const oldIndex = cartItems.findIndex(c => c.name === item.replacement!.name);
    if (oldIndex >= 0) removeAt(oldIndex);
    addFromChat(item);
  }

  return (
    <>
      {!chatOpen && (
        <button className={styles.callBell} onClick={callWaiter} aria-label="Call your waiter">
          <Bell size={20} />
        </button>
      )}
      {waiterCalled && <div className={styles.calledPill} role="status"><Check size={13} strokeWidth={3} /> Waiter notified</div>}

      <button
        className={styles.launcher}
        onClick={() => setChatOpen(!chatOpen)}
        aria-label={chatOpen ? 'Close concierge chat' : 'Open concierge chat'}
        aria-expanded={chatOpen}
      >
        {chatOpen ? <X size={20} /> : <span className={styles.aiBadge}>AI</span>}
        {!chatOpen && hasUnseenSuggestion && <span className={styles.notifyDot} aria-hidden="true" />}
      </button>

      <AnimatePresence>
        {chatOpen && (
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setChatOpen(false)}
          />
        )}
      </AnimatePresence>

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
              <span>{assistantName}</span>
            </div>

            <div className={styles.messages} aria-live="polite" aria-atomic="false">
              {messages.length === 0 && (
                <div className={styles.welcome}>
                  <p>Hello! I'm {assistantName} — your personal dining assistant. How can I help you tonight?</p>
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
                        <RecommendationCard
                          key={j}
                          variant="compact"
                          item={item as RecommendationItem}
                          showReason
                          premium={item.rotationGroup?.startsWith('upgrade:')}
                          onOpen={() => { trackClick(item as RecommendationItem, CHAT_RECO_CTX); onItemClick?.(item); }}
                          onAdd={() => addFromChat(item)}
                          onReplace={canReplace(item) ? () => replaceFromChat(item) : undefined}
                        />
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
