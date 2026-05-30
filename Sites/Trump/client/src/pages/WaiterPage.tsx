import { LayoutGrid, ShoppingCart, UtensilsCrossed, Sparkles, Activity, Bell, LogOut } from 'lucide-react';
import '../styles/waiter-theme.css';
import { WaiterProvider, useWaiter } from '../context/WaiterContext';
import { useAuth } from '../hooks/useAuth';
import { BRAND_NAME } from '../constants/waiter';
import type { WaiterTab } from '../types/waiter';

import { StartShiftScreen } from './waiter/StartShiftScreen';
import { FloorScreen } from './waiter/FloorScreen';
import { OrderScreen } from './waiter/OrderScreen';
import { MenuScreen } from './waiter/MenuScreen';
import { AICoachScreen } from './waiter/AICoachScreen';
import { TodayScreen } from './waiter/TodayScreen';
import { ItemDetailSheet } from '../components/waiter/ItemDetailSheet';
import { ServiceNotesModal } from '../components/waiter/ServiceNotesModal';
import { SplitBillModal } from '../components/waiter/SplitBillModal';
import { FloorAlerts } from '../components/waiter/FloorAlerts';
import { ServiceRecoverySheet } from '../components/waiter/ServiceRecoverySheet';
import { VoiceAssistant } from '../components/waiter/VoiceAssistant';

const NAV: { tab: WaiterTab; label: string; Icon: typeof LayoutGrid }[] = [
  { tab: 'floor', label: 'Floor', Icon: LayoutGrid },
  { tab: 'order', label: 'Order', Icon: ShoppingCart },
  { tab: 'menu', label: 'Menu', Icon: UtensilsCrossed },
  { tab: 'coach', label: 'AI Coach', Icon: Sparkles },
  { tab: 'today', label: 'Today', Icon: Activity }
];

function TopBar() {
  const { shift, liveAlertCount, openOverlay } = useWaiter();
  const { logout } = useAuth();
  return (
    <div className="w-topbar">
      <div className="w-topbar-id">
        <span className="w-avatar">{(shift.name || 'A').charAt(0).toUpperCase()}</span>
        <div style={{ minWidth: 0 }}>
          <div className="w-topbar-status"><span className="w-online-dot" /> Online · {shift.role}</div>
          <div className="w-topbar-name">{shift.name || BRAND_NAME}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="w-bell" onClick={() => openOverlay('alerts')} aria-label="Floor alerts">
          <Bell size={20} />
          {liveAlertCount > 0 && <span className="w-bell-badge">{liveAlertCount}</span>}
        </button>
        <button
          className="w-bell"
          onClick={() => { if (confirm('Sign out of the waiter app?')) logout(); }}
          aria-label="Sign out"
        >
          <LogOut size={19} />
        </button>
      </div>
    </div>
  );
}

function BottomNav() {
  const { tab, setTab, order } = useWaiter();
  const orderCount = order.reduce((n, l) => n + l.quantity, 0);
  return (
    <div className="w-bottomnav">
      {NAV.map(({ tab: t, label, Icon }) => (
        <button key={t} className={`w-navitem ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
          {t === 'order' && orderCount > 0 && <span className="nav-badge">{orderCount}</span>}
          <Icon size={22} strokeWidth={tab === t ? 2.4 : 1.8} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function Screen() {
  const { tab } = useWaiter();
  switch (tab) {
    case 'floor': return <FloorScreen />;
    case 'order': return <OrderScreen />;
    case 'menu': return <MenuScreen />;
    case 'coach': return <AICoachScreen />;
    case 'today': return <TodayScreen />;
    default: return <FloorScreen />;
  }
}

function Overlays() {
  const { overlay, openItem } = useWaiter();
  return (
    <>
      {openItem && <ItemDetailSheet />}
      {overlay === 'notes' && <ServiceNotesModal />}
      {overlay === 'split' && <SplitBillModal />}
      {overlay === 'alerts' && <FloorAlerts />}
      {overlay === 'recovery' && <ServiceRecoverySheet />}
      {overlay === 'voice' && <VoiceAssistant />}
    </>
  );
}

function Toast() {
  const { toast } = useWaiter();
  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 'calc(var(--w-nav-h) + 20px)', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--w-gold-grad)', color: '#1a1407', padding: '11px 20px', borderRadius: 999,
      fontWeight: 800, fontSize: 13, zIndex: 60, boxShadow: 'var(--w-gold-glow)', whiteSpace: 'nowrap'
    }}>
      {toast}
    </div>
  );
}

function WaiterShell() {
  const { shift } = useWaiter();
  if (!shift.started) return <StartShiftScreen />;
  return (
    <>
      <TopBar />
      <Screen />
      <BottomNav />
      <Overlays />
      <Toast />
    </>
  );
}

export function WaiterPage() {
  return (
    <div className="waiter-app">
      <WaiterProvider>
        <WaiterShell />
      </WaiterProvider>
    </div>
  );
}
