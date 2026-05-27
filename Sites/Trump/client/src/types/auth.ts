export type Role = 'owner' | 'manager' | 'waiter' | 'kitchen';

export interface AuthUser {
  username: string;
  role: Role;
  label?: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResponse {
  ok: boolean;
  user?: AuthUser;
  defaultPath?: string;
  error?: string;
}
