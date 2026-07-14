export type Role = 'owner' | 'manager' | 'waiter' | 'kitchen';

export interface AuthUser {
  username: string;
  role: Role;
  label?: string;
}
