// Navigation param lists (typed routes).
export type RootStackParamList = {
  Main: undefined;
  TableDetail: { tableId: string };
  AddItems: { tableId: string };
  SplitBill: { tableId: string };
  Chat: { tableId?: string } | undefined;
  Requests: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Shift: undefined;
  Tables: undefined;
  Alerts: undefined;
  Profile: undefined;
};
