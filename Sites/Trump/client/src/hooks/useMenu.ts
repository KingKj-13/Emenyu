import { useMenuData } from '../context/MenuContext';
import { useSocketEvent } from './useSocket';

export function useMenu() {
  const ctx = useMenuData();

  useSocketEvent('menuUpdated', () => ctx.reload());
  useSocketEvent('dealUpdated', () => ctx.reload());

  return ctx;
}
