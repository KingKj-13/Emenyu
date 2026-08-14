// Socket-sync side effects (join/leave table, syncCart/syncHistory listeners,
// push-on-change) now live in CartProvider itself (context/CartContext.tsx),
// so they run exactly once per table regardless of how many components call
// this hook. This file stays as a thin re-export so existing call sites
// (MenuPage, Header, BottomBar, CartDrawer, CartRecommendations, TipSelector)
// don't all need touching.
export { useCart } from '../context/CartContext';
