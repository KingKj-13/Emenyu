import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useMenuData } from '../../context/MenuContext';
import { useButcheryCuts } from './useButcheryCuts';
import { useI18n } from '../../i18n';
import { flattenMenu } from '../../lib/menuUtils';
import { ButcheryModal } from './ButcheryModal';
import type { MenuItem } from '../../types/menu';

/**
 * Mounted once, above the route tree (see App.tsx), so the header's cow icon
 * and a dish's "From the X" link — two components with no parent/child
 * relationship — can both open the SAME modal via AppContext's
 * butcheryOpen/pendingCutId, regardless of which page is current.
 *
 * Opening a dish from inside the chart re-uses the existing pendingItemName
 * signal MenuPage.tsx already consumes; if the guest triggered this from a
 * page other than the menu, they're navigated there first so that effect has
 * somewhere to land.
 */
export function GlobalButcheryModal() {
  const { butcheryOpen, setButcheryOpen, pendingCutId, setPendingCutId, tableId, setPendingItemName } = useApp();
  const { menuData } = useMenuData();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const allItems = useMemo(() => flattenMenu(menuData), [menuData]);
  const serverCuts = useButcheryCuts(locale);

  function close() {
    setButcheryOpen(false);
    setPendingCutId(null);
  }

  function openDish(item: MenuItem) {
    close();
    setPendingItemName(item.name);
    navigate(`/${tableId}/menu`);
  }

  return (
    <ButcheryModal
      open={butcheryOpen}
      onClose={close}
      items={allItems}
      serverCuts={serverCuts}
      initialCut={pendingCutId}
      onOpenItem={openDish}
    />
  );
}
