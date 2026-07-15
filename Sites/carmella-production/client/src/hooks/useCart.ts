// Socket-sync side effects (join table, syncCart listener, push-on-change)
// live in CartProvider itself (context/CartContext.tsx) so they run exactly
// once per table regardless of how many components call this hook.
export { useCart } from '../context/CartContext';
