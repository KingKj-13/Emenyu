import { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, Check, Send, Sparkles, X } from 'lucide-react';
import { api } from '../../services/api';
import { getSocket } from '../../services/socket';
import { RESTAURANT_ID } from '../../constants/api';
import { useApp } from '../../context/AppContext';
import { useCart } from '../../hooks/useCart';
import { useMenuData } from '../../context/MenuContext';
import { resolveThumbnail } from '../../lib/imageResolver';
import { normalizeName, formatPrice } from '../../lib/menuUtils';
import { trackImpressions, trackClick, trackAccepted } from '../../lib/recoAnalytics';
import { useConciergeTiming, type TriggerReason } from '../../hooks/useConciergeTiming';
import { requestNotificationPermissionOnce, showConciergeNotification } from '../../lib/browserNotify';
import { getContextChips } from './conciergeChips';
import { PremiumQuickActionMenu } from './PremiumQuickActionMenu';
import { timeGreeting, isEvening } from '../../lib/greeting';
import type { ChatSuggestionItem, ChatResponse, MenuItem } from '../../types/menu';
import styles from './PremiumConcierge.module.css';

const CHAT_RECO_CTX = { mode: 'customer', source: 'chat' } as const;
const POST_ACCEPT_PAUSE_MS = 8000;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: ChatSuggestionItem[];
  proactive?: boolean;
  rewardQrDataUrl?: string;
  rewardExpiresAt?: string;
}

interface Props {
  onItemClick?: (item: ChatSuggestionItem) => void;
}

const CATEGORY_WORDS = [
  'cabernet', 'shiraz', 'merlot', 'pinotage', 'chardonnay', 'sauvignon blanc', 'chenin', 'rosé', 'rose',
  'champagne', 'cap classique', 'mcc', 'prosecco', 'wine',
  'castle lager', 'castle lite', 'windhoek', 'savanna', 'hansa', 'lager', 'cider', 'beer',
  'margarita', 'mojito', 'martini', 'old fashioned', 'espresso martini', 'cocktail',
  'ribeye', 'rib-eye', 'fillet', 'sirloin', 'rump', 'tomahawk', 'wagyu', 'steak',
  'malva pudding', 'cheesecake', 'dessert',
  "chef's pick", "chef's special", "chef's favourite", "chef's recommendation",
  'premium upgrade',
];

function highlightKeywords(content: string, names: string[]) {
  const exact = [...new Set(names.filter(Boolean))];
  const all = [...new Set([...exact, ...CATEGORY_WORDS])].sort((a, b) => b.length - a.length);
  if (!all.length) return content;
  const escaped = all.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b((?:${escaped.join('|')})s?)\\b`, 'gi');
  const lowerSet = new Set(all.map(n => n.toLowerCase()));
  const parts = content.split(pattern);
  return parts.map((part, i) => {
    const lower = part.toLowerCase();
    const isMatch = lowerSet.has(lower) || lowerSet.has(lower.replace(/s$/, ''));
    return isMatch ? <span key={i} className={styles.dishName}>{part}</span> : <span key={i}>{part}</span>;
  });
}

function suggestionImage(item: ChatSuggestionItem): string {
  return resolveThumbnail({ name: item.name, price: item.price, description: item.description, img: item.img, category: item.category || '' } as MenuItem);
}

export function PremiumConcierge({ onItemClick }: Props) {
  const { chatOpen, setChatOpen, tableId, tableLabel, effectiveDayPartSlug, device } = useApp();
  const { items: cartItems, addItem, removeAt, justAdded } = useCart();
  const { activeItemNames } = useMenuData();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [waiterCalled, setWaiterCalled] = useState(false);
  const [assistantName, setAssistantName] = useState('Your Maître D');
  const [justAccepted, setJustAccepted] = useState(false);
  const [flashLatest, setFlashLatest] = useState(false);

  const shownItemNamesRef = useRef<Set<string>>(new Set());
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;

  useEffect(() => {
    api.getConfig().then(c => { if (c?.assistantName) setAssistantName(c.assistantName); }).catch(() => {});
  }, []);

  const triggerProactiveRecommendation = useCallback(async ({ reason }: { reason: TriggerReason }) => {
    try {
      const recs = await api.getRecommendations({
        cart: cartItems, proactive: true, tableId, deviceId: device.deviceId,
        ...(reason === 'dessert' ? { reason: 'dessert' } : {}),
      }) as ChatSuggestionItem[];
      const eligible = activeItemNames
        ? (recs || []).filter(r => r?.name && activeItemNames.has(normalizeName(r.name)))
        : (recs || []);
      const top = eligible.find(r => r?.name && !shownItemNamesRef.current.has(r.name)) || null;
      if (!top?.name) return;
      shownItemNamesRef.current.add(top.name);

      const shown = [top];
      const lastAdded = cartItems[cartItems.length - 1]?.name;
      const why = top.reason ? ` ${top.reason}` : '';
      const lastAddedCore = lastAdded?.replace(/\s*±?\d+\s*(g|ml|kg|l|pce|pcs?)?\.?$/i, '').trim();
      const mentionsLastAdded = Boolean(lastAddedCore && top.reason?.toLowerCase().includes(lastAddedCore.toLowerCase()));

      let introLine: string;
      if (reason === 'dessert') introLine = top.reason || `For dessert, might I suggest the ${top.name}?`;
      else if (reason === 'upgrade') introLine = top.reason || `If you'd like something even more special, I'd suggest the ${top.name}.`;
      else if (lastAdded && !mentionsLastAdded) introLine = `I see you've added ${lastAdded} — why not the ${top.name}?${why}`;
      else introLine = top.reason || `I'd suggest the ${top.name}.`;

      setMessages(prev => [...prev, { role: 'assistant', content: introLine, suggestions: shown, proactive: true }]);
      trackImpressions(shown, CHAT_RECO_CTX);

      if (!chatOpenRef.current) {
        void requestNotificationPermissionOnce();
        const body = introLine.length > 90 ? `${top.name} — a recommendation for your table.` : introLine;
        showConciergeNotification(body, () => {
          setChatOpen(true);
          setFlashLatest(true);
          window.setTimeout(() => setFlashLatest(false), 2200);
        });
      }
    } catch { /* a missed proactive nudge is not worth surfacing an error for */ }
  }, [cartItems, setChatOpen, tableId, device.deviceId, activeItemNames]);

  useConciergeTiming({ cartItems, chatOpen, paused: justAccepted, onTrigger: triggerProactiveRecommendation });

  useEffect(() => {
    if (!justAdded) return;
    setJustAccepted(true);
    const timer = window.setTimeout(() => setJustAccepted(false), POST_ACCEPT_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [justAdded]);

  useEffect(() => {
    const socket = getSocket();
    const onFollowUp = async (p: { tableId?: string; message?: string; rewardCode?: string; rewardExpiresAt?: string }) => {
      if (!p?.message || String(p.tableId || '').toLowerCase() !== String(tableId || '').toLowerCase()) return;
      let rewardQrDataUrl: string | undefined;
      if (p.rewardCode) {
        try {
          const QRCode = (await import('qrcode')).default;
          rewardQrDataUrl = await QRCode.toDataURL(p.rewardCode, { width: 220, margin: 2, color: { dark: '#221e18', light: '#faf6ec' } });
        } catch { /* text follow-up still lands even if the QR render fails */ }
      }
      setMessages(prev => [...prev, { role: 'assistant', content: p.message!, rewardQrDataUrl, rewardExpiresAt: p.rewardExpiresAt }]);
      setChatOpen(true);
    };
    socket.on('orderCompleteFollowUp', onFollowUp);
    return () => { socket.off('orderCompleteFollowUp', onFollowUp); };
  }, [tableId, setChatOpen]);

  function callWaiter() {
    getSocket().emit('callWaiter', { restaurantId: RESTAURANT_ID, tableId });
    setWaiterCalled(true);
    window.setTimeout(() => setWaiterCalled(false), 2600);
  }

  const endRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chatOpen) setTimeout(() => inputRef.current?.focus(), 120);
  }, [chatOpen]);

  useEffect(() => {
    if (!chatOpen) return;
    if (messages.length === 0) endRef.current?.scrollIntoView({ behavior: 'auto' });
    else lastMessageRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, [chatOpen, messages]);

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content }]);
    setLoading(true);
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    async function attemptChat(): Promise<ChatResponse> {
      try {
        return await api.chat({ message: content, history, tableId, deviceId: device.deviceId, cart: cartItems, dayPart: effectiveDayPartSlug }) as ChatResponse;
      } catch (firstError) {
        await new Promise(resolve => setTimeout(resolve, 600));
        try {
          return await api.chat({ message: content, history, tableId, deviceId: device.deviceId, cart: cartItems, dayPart: effectiveDayPartSlug }) as ChatResponse;
        } catch { throw firstError; }
      }
    }

    try {
      const res = await attemptChat();
      const eligibleReplies = activeItemNames
        ? (res.suggestions || []).filter(s => s?.name && activeItemNames.has(normalizeName(s.name)))
        : (res.suggestions || []);
      const shown = eligibleReplies.slice(0, 1);
      shown.forEach(s => { if (s?.name) shownItemNamesRef.current.add(s.name); });
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply || 'Let me think on that again — go ahead and ask once more.', suggestions: shown }]);
      if (shown.length) trackImpressions(shown, CHAT_RECO_CTX);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ask me that again in just a moment — I want to make sure I get it right for you.' }]);
    } finally {
      setLoading(false);
    }
  }

  function addFromChat(item: ChatSuggestionItem) {
    addItem({ name: item.name, price: item.price, img: item.img, description: item.description, source: 'guest', categoryType: item.categoryType, beverageKind: item.beverageKind });
    trackAccepted(item, CHAT_RECO_CTX);
  }

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

  async function skipFromChat(messageIndex: number) {
    try {
      const recs = await api.getRecommendations({ cart: cartItems, tableId, deviceId: device.deviceId, skip: true }) as ChatSuggestionItem[];
      const next = (recs || [])[0] || null;
      setMessages(prev => prev.map((m, idx) => (idx === messageIndex ? { ...m, suggestions: next?.name ? [next] : [] } : m)));
      if (next?.name) trackImpressions([next], CHAT_RECO_CTX);
    } catch { /* a missed skip is not worth surfacing an error for */ }
  }

  const chips = getContextChips(cartItems);
  const lastMessageIndex = messages.length - 1;

  return (
    <>
      {!chatOpen && (
        <button type="button" className={styles.callBell} onClick={callWaiter} aria-label="Call your waiter">
          <Bell size={17} />
        </button>
      )}
      {waiterCalled && <div className={styles.calledPill} role="status"><Check size={12} strokeWidth={3} /> Waiter notified</div>}

      {chatOpen && (
        <>
          <div className={styles.backdrop} onClick={() => setChatOpen(false)} />
          <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Concierge">
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}><Sparkles size={14} /> {assistantName}</div>
              <button type="button" className={styles.panelClose} onClick={() => setChatOpen(false)}><X size={16} /></button>
            </div>

            <div className={styles.messages} aria-live="polite">
              {messages.length === 0 && (
                <div className={styles.welcome}>
                  {timeGreeting()}, {tableLabel} — I'm looking after your table {isEvening() ? 'tonight' : 'today'}. What can I bring you?
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} ref={i === messages.length - 1 ? lastMessageRef : undefined} className={styles.message}>
                  <div className={msg.role === 'user' ? styles.userMsg : styles.assistantMsg}>
                    {msg.role === 'assistant' ? highlightKeywords(msg.content, (msg.suggestions || []).map(s => s.name)) : msg.content}
                  </div>
                  {msg.role === 'assistant' && msg.rewardQrDataUrl && (
                    <div className={styles.rewardCard}>
                      <img src={msg.rewardQrDataUrl} alt="Reward QR code" className={styles.rewardQrImg} />
                      {msg.rewardExpiresAt && <p className={styles.rewardExpiry}>Valid until {new Date(msg.rewardExpiresAt).toLocaleDateString()}</p>}
                    </div>
                  )}
                  {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && (
                    <div className={`${styles.suggestionCards} ${flashLatest && i === lastMessageIndex ? styles.flash : ''}`}>
                      {msg.suggestions.map((item, j) => (
                        <div key={j} className={styles.suggestCard}>
                          <img src={suggestionImage(item)} alt={item.name} className={styles.suggestImg} loading="lazy" />
                          <div className={styles.suggestBody}>
                            <div className={styles.suggestName}>
                              {item.name}
                              {item.rotationGroup?.startsWith('upgrade:') && <span className={styles.premiumTag}>Premium</span>}
                            </div>
                            {item.reason && <div className={styles.suggestReason}>{item.reason}</div>}
                            {item.price > 0 && <div className={styles.suggestPrice}>{formatPrice(item.price)}</div>}
                          </div>
                          <div className={styles.suggestActions}>
                            <button type="button" className={`${styles.suggestBtn} ${styles.suggestBtnPrimary}`} onClick={() => canReplace(item) ? replaceFromChat(item) : addFromChat(item)}>
                              {canReplace(item) ? 'Replace' : 'Add'}
                            </button>
                            {onItemClick && (
                              <button type="button" className={styles.suggestBtn} onClick={() => { trackClick(item, CHAT_RECO_CTX); onItemClick(item); }}>View</button>
                            )}
                            {item.curated && (
                              <button type="button" className={styles.suggestBtn} onClick={() => skipFromChat(i)}>Skip</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className={`${styles.assistantMsg} ${styles.typing}`}>
                  <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
                </div>
              )}
              <div ref={endRef} />
            </div>

            {!loading && chips.length > 0 && (
              <div className={styles.chipRow} role="list" aria-label="Suggested questions">
                {chips.map(chip => (
                  <button key={chip.label} type="button" className={styles.chip} role="listitem" onClick={() => sendMessage(chip.message)}>
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            <form className={styles.inputRow} onSubmit={e => { e.preventDefault(); sendMessage(input); }}>
              <PremiumQuickActionMenu onSelect={sendMessage} disabled={loading} />
              <input
                ref={inputRef}
                type="text"
                className={styles.input}
                placeholder="Ask anything about the menu…"
                value={input}
                onChange={e => setInput(e.target.value)}
                aria-label="Message"
              />
              <button type="submit" className={styles.sendBtn} disabled={loading || !input.trim()} aria-label="Send">
                <Send size={15} />
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
