// Контекст текущего пользователя.
import { createContext, useContext } from 'react';
import type { User } from './types';

export interface AuthState {
  user: User | null;
  setUser: (user: User | null) => void;
}

export const AuthContext = createContext<AuthState>({ user: null, setUser: () => {} });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('Пользователь не авторизован');
  return user;
}
