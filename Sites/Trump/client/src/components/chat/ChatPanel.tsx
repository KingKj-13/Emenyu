import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Send, Sparkles, Bell, Check } from 'lucide-react';
import { api } from '../../services/api';
import { getSocket } from '../../services/socket';
import { RESTAURANT_ID } from '../../constants/api';
import { useApp } from '../../context/AppContext';
import { useCart } from '../../hooks/useCart';
import { useMenuData } from '../../context/MenuContext';
import { normalizeName } from '../../lib/menuUtils';
import { RecommendationCard, type RecommendationItem } from '../reco/RecommendationCard';
import { trackImpressions, trackClick, trackAccepted } from '../../lib/recoAnalytics';
import { useConciergeTiming, type TriggerReason } from '../../hooks/useConciergeTiming';
import { requestNotificationPermissionOnce, showConciergeNotification } from '../../lib/browserNotify';
import { getContextChips } from './conciergeChips';
import { QuickActionMenu } from './QuickActionMenu';
import { timeGreeting, isEvening } from '../../lib/greeting';
import type { ChatSuggestionItem, ChatResponse } from '../../types/menu';
import styles from './ChatPanel.module.css';

const CHAT_RECO_CTX = { mode: 'customer', source: 'chat' } as const;
// How long an acceptance keeps proactive nudges paused ("stop recommending,
// do NOT immediately recommend something else" — scenario 4).
const POST_ACCEPT_PAUSE_MS = 8000;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: ChatSuggestionItem[];
  proactive?: boolean;
}

interface ChatPanelProps {
  onItemClick?: (item: ChatSuggestionItem) => void;
}

// Keyword categories highlighted in the concierge's own reply text (gold),
// in addition to this message's own suggestion-card names. Presentation only
// — never changes what's recommended, only how the reply text reads.
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
  // Word-boundary the whole alternation (so "steak" can't match mid-word) and
  // allow an optional trailing "s" as ONE match (so plurals — which is how the
  // server actually phrases these words most of the time — highlight whole,
  // not split into a bold stem plus a plain trailing letter).
  const pattern = new RegExp(`\\b((?:${escaped.join('|')})s?)\\b`, 'gi');
  const lowerSet = new Set(all.map(n => n.toLowerCase()));
  const parts = content.split(pattern);
  return parts.map((part, i) => {
    const lower = part.toLowerCase();
    const isMatch = lowerSet.has(lower) || lowerSet.has(lower.replace(/s$/, ''));
    return isMatch
      ? <span key={i} className={styles.dishName}>{part}</span>
      : <span key={i}>{part}</span>;
  });
}

export function ChatPanel({ onItemClick }: ChatPanelProps) {
  const { chatOpen, setChatOpen, tableId, effectiveDayPartSlug } = useApp();
  const { items: cartItems, addItem, removeAt, justAdded } = useCart();
  const { activeItemNames } = useMenuData();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [waiterCalled, setWaiterCalled] = useState(false);
  // Phase 5 (AI Concierge): the assistant's display name comes from server
  // config; default matches the rebrand so there's no flash of an old name.
  const [assistantName, setAssistantName] = useState('🍷 Your Sommelier');
  // Phase 3 (Dining Concierge): a quiet gold badge on the chat icon when the
  // concierge has a new suggestion — never opens the panel itself, never
  // repeats once shown for the same suggestion.
  const [hasUnseenSuggestion, setHasUnseenSuggestion] = useState(false);
  // Phase 5: briefly highlights the latest suggestion card when the guest
  // arrives via a clicked browser notification.
  const [flashLatest, setFlashLatest] = useState(false);
  const [justAccepted, setJustAccepted] = useState(false);
  // A guest just browsing (no cart yet) previously saw a static, motionless
  // launcher with no cue a chat concierge exists at all — the only emphasis
  // (notifyDot) is gated behind an actual suggestion, which needs a cart.
  // This fires once per browser session regardless of cart state.
  const [showEntranceHint, setShowEntranceHint] = useState(false);

  const shownItemNamesRef = useRef<Set<string>>(new Set());
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;

  useEffect(() => {
    api.getConfig().then(c => { if (c?.assistantName) setAssistantName(c.assistantName); }).catch(() => { /* keep default */ });
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem('chatLauncherHintShown')) return;
    const timer = window.setTimeout(() => {
      setShowEntranceHint(true);
      sessionStorage.setItem('chatLauncherHintShown', '1');
      window.setTimeout(() => setShowEntranceHint(false), 3200);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, []);

  // Phase 5 (AI Concierge): fetch a proactive recommendation from Recommendation
  // Engine V2 for the given scenario and present it — presentation/timing only,
  // the engine still decides WHAT to recommend (api.getRecommendations).
  const triggerProactiveRecommendation = useCallback(async ({ reason }: { reason: TriggerReason }) => {
    try {
      const recs = await api.getRecommendations({
        cart: cartItems,
        proactive: true,
        tableId,
        ...(reason === 'dessert' ? { reason: 'dessert' } : {}),
      }) as ChatSuggestionItem[];
      // Day/Night toggle: the recommendation engine scores over the full
      // catalog, unaware of the client-side toggle -- never proactively push
      // an item that isn't part of the menu currently being shown.
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
      if (reason === 'dessert') {
        introLine = top.reason || `For dessert, might I suggest the ${top.name}?`;
      } else if (reason === 'upgrade') {
        introLine = top.reason || `If you'd like something even more special, I'd suggest the ${top.name}.`;
      } else if (lastAdded && !mentionsLastAdded) {
        introLine = `I see you've added ${lastAdded} to the cart — why not add our ${top.name}?${why}`;
      } else {
        introLine = top.reason || `I'd suggest the ${top.name}.`;
      }

      setMessages(prev => [...prev, { role: 'assistant', content: introLine, suggestions: shown, proactive: true }]);
      trackImpressions(shown, CHAT_RECO_CTX);
      setHasUnseenSuggestion(true);

      // Never notify while the chat window is already open.
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
  }, [cartItems, setChatOpen, tableId]);

  const { recordIgnored } = useConciergeTiming({
    cartItems,
    chatOpen,
    paused: justAccepted,
    onTrigger: triggerProactiveRecommendation,
  });
  void recordIgnored; // context-key gating already prevents repeats; kept for call-site legibility

  useEffect(() => {
    if (chatOpen) setHasUnseenSuggestion(false);
  }, [chatOpen]);

  // `justAdded` fires from CartContext.addItem() — the one function every
  // accept path (this chat's own card, the cart-strip card, ItemModal) already
  // calls. Pausing the proactive timer here means an accept from ANY of those
  // surfaces backs off the next nudge, not only an accept made inside chat.
  useEffect(() => {
    if (!justAdded) return;
    setJustAccepted(true);
    const timer = window.setTimeout(() => setJustAccepted(false), POST_ACCEPT_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [justAdded]);

  function callWaiter() {
    getSocket().emit('callWaiter', { restaurantId: RESTAURANT_ID, tableId });
    setWaiterCalled(true);
    window.setTimeout(() => setWaiterCalled(false), 2600);
  }
  const endRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [chatOpen]);

  // Phase 5 (AI Concierge): "scroll to the latest message" on open — the panel
  // unmounts on close (AnimatePresence), so a fresh mount always starts
  // scrolled to the top; re-scroll every time it opens, not only when new
  // messages arrive while it's already open.
  useEffect(() => {
    if (!chatOpen) return;
    // Anchor to the TOP of the newest message, not the very bottom of the
    // panel — a reply + its enlarged suggestion card can together be taller
    // than the visible chat window, so scrolling all the way to the end only
    // ever showed the card's price/Add button, with the reply text and dish
    // name (what actually makes it "the newest message") scrolled off above.
    if (messages.length === 0) {
      endRef.current?.scrollIntoView({ behavior: 'auto' });
    } else {
      lastMessageRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [chatOpen, messages]);

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    setInput('');
    const userMsg: Message = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    // The reply itself is deterministic/local (see aiService.js) -- an
    // occasional failure here is almost always a transient server-side
    // hiccup (e.g. a concurrent write on a shared log file), not a real
    // inability to answer, since an identical retry reliably succeeds. One
    // silent retry with a short backoff absorbs that before ever bothering
    // the guest with an error.
    async function attemptChat(): Promise<ChatResponse> {
      try {
        return await api.chat({ message: content, history, tableId, cart: cartItems, dayPart: effectiveDayPartSlug }) as ChatResponse;
      } catch (firstError) {
        await new Promise(resolve => setTimeout(resolve, 600));
        try {
          return await api.chat({ message: content, history, tableId, cart: cartItems, dayPart: effectiveDayPartSlug }) as ChatResponse;
        } catch {
          throw firstError;
        }
      }
    }

    try {
      const res = await attemptChat();
      // Same Day/Night filtering as the proactive path above -- the reply
      // text itself is unaffected, only which dish gets attached as a card.
      const eligibleReplies = activeItemNames
        ? (res.suggestions || []).filter(s => s?.name && activeItemNames.has(normalizeName(s.name)))
        : (res.suggestions || []);
      const shown = eligibleReplies.slice(0, 1);
      shown.forEach(s => { if (s?.name) shownItemNamesRef.current.add(s.name); });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.reply || 'Let me think on that again — go ahead and ask once more.',
        suggestions: shown
      }]);
      if (shown.length) trackImpressions(shown, CHAT_RECO_CTX);
    } catch {
      // Softer than the old "I'm having a moment" phrasing -- reads as a
      // normal, retry-friendly nudge rather than something being broken,
      // since by this point a silent retry has already genuinely failed twice.
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ask me that again in just a moment — I want to make sure I get it right for you.' }]);
    } finally {
      setLoading(false);
    }
  }

  // Phase 3 (Dining Concierge): "Add to Cart" straight from the chat card, no
  // detour through the item modal. Reuses the same CartContext every other
  // add-to-cart path in the app already uses.
  function addFromChat(item: ChatSuggestionItem) {
    // Scenario 4 (record acceptance, stop recommending immediately after) is
    // now handled by the `justAdded` effect above — addItem() firing it covers
    // every accept path, not just this one.
    addItem({ name: item.name, price: item.price, img: item.img, description: item.description, source: 'guest', categoryType: item.categoryType, beverageKind: item.beverageKind });
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

  const chips = getContextChips(cartItems);
  const lastMessageIndex = messages.length - 1;

  return (
    <>
      {!chatOpen && (
        <button className={styles.callBell} onClick={callWaiter} aria-label="Call your waiter">
          <Bell size={20} />
        </button>
      )}
      {waiterCalled && <div className={styles.calledPill} role="status"><Check size={13} strokeWidth={3} /> Waiter notified</div>}

      <button
        className={`${styles.launcher} ${!chatOpen && showEntranceHint ? styles.launcherHint : ''}`}
        onClick={() => { setChatOpen(!chatOpen); setShowEntranceHint(false); }}
        aria-label={chatOpen ? 'Close concierge chat' : (hasUnseenSuggestion ? `Open concierge chat — ${assistantName} has a suggestion for you` : 'Open concierge chat')}
        title={!chatOpen && hasUnseenSuggestion ? `${assistantName} has a suggestion for you` : undefined}
        aria-expanded={chatOpen}
      >
        {chatOpen ? <X size={20} /> : <span className={styles.aiBadge} aria-hidden="true">🍷</span>}
        {/* The dot itself must stay decorative (aria-hidden) since its meaning
            is now carried by the button's own aria-label/title above -- a
            screen reader shouldn't announce two separate, undescribed things. */}
        {!chatOpen && hasUnseenSuggestion && <span className={styles.notifyDot} aria-hidden="true" />}
        {!chatOpen && showEntranceHint && !hasUnseenSuggestion && <span className={styles.launcherLabel}>Ask {assistantName}</span>}
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
            aria-modal="true"
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
                  <p>{timeGreeting()} — I'm your sommelier {isEvening() ? 'tonight' : 'today'}. How may I look after your table?</p>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} ref={i === messages.length - 1 ? lastMessageRef : undefined}>
                  <div className={`${styles.message} ${msg.role === 'user' ? styles.userMsg : styles.assistantMsg}`}>
                    {msg.role === 'assistant'
                      ? highlightKeywords(msg.content, (msg.suggestions || []).map(s => s.name))
                      : msg.content}
                  </div>
                  {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && (
                    <div className={`${styles.suggestionCards} ${flashLatest && i === lastMessageIndex ? styles.flash : ''}`}>
                      {msg.suggestions.map((item, j) => (
                        <RecommendationCard
                          key={j}
                          variant="compact"
                          large
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

            {/* Phase 5 (AI Concierge): ongoing, context-aware suggestion chips —
                never empty, updates as the cart/conversation changes. */}
            {!loading && chips.length > 0 && (
              <div className={styles.chipRow} role="list" aria-label="Suggested questions">
                {chips.map(chip => (
                  <button key={chip.label} type="button" className={styles.chip} role="listitem" onClick={() => sendMessage(chip.message)}>
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            <form
              className={styles.inputRow}
              onSubmit={e => { e.preventDefault(); sendMessage(input); }}
            >
              <QuickActionMenu onSelect={sendMessage} disabled={loading} />
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
