// Derives a display status for a floor table from the server floor snapshot + open
// workflow tasks — mirroring the web waiter's statusForTable/statusCopy. Kept in one
// place so the tables list and table detail agree. The socket "calling" state is
// overlaid where the server floor already reflects it (table.status).
import { theme } from '../components/theme';
import type { FloorTable, WaiterTask } from '../types/waiter';

export type TableStatus =
  | 'active'
  | 'attention'
  | 'calling'
  | 'ready'
  | 'manager'
  | 'birthday'
  | 'empty';

const RANK: Record<TableStatus, number> = {
  calling: 0,
  ready: 1,
  attention: 2,
  birthday: 3,
  manager: 4,
  active: 5,
  empty: 6
};

export function statusForTable(table: FloorTable, tasks: WaiterTask[] = []): TableStatus {
  const open = tasks.filter((t) => t.tableId === table.tableId && t.status === 'open');
  if (table.status === 'calling') return 'calling';
  if (open.some((t) => t.type.includes('birthday'))) return 'birthday';
  if (open.some((t) => t.type.includes('manager'))) return 'manager';
  if (open.some((t) => ['complaint', 'refund', 'allergy'].includes(t.type))) return 'attention';
  if (table.status === 'ready') return 'ready';
  if (table.status === 'empty') return 'empty';
  return table.spend > 0 ? 'active' : 'attention';
}

export function statusRank(status: TableStatus): number {
  return RANK[status];
}

export function statusLabel(status: TableStatus): string {
  return {
    active: 'Active',
    attention: 'Needs Attention',
    calling: 'Calling Waiter',
    ready: 'Food Ready',
    manager: 'Manager Request',
    birthday: 'Birthday Opportunity',
    empty: 'Empty'
  }[status];
}

export function statusColor(status: TableStatus): string {
  return {
    active: theme.colors.green,
    attention: theme.colors.amber,
    calling: theme.colors.red,
    ready: theme.colors.green,
    manager: theme.colors.blue,
    birthday: theme.colors.gold,
    empty: theme.colors.textDim
  }[status];
}

export function nextAction(status: TableStatus): string {
  return {
    active: 'Open table',
    attention: 'Check in with guests',
    calling: 'Respond to guest',
    ready: 'Run food now',
    manager: 'Check manager note',
    birthday: 'Request dessert approval',
    empty: 'Open table'
  }[status];
}
