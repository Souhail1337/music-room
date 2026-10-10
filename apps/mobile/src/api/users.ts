import { api } from './client';

export interface UserRef {
  id: string;
  displayName: string;
}

export const usersApi = {
  /** Display-name prefix or exact email (min 2 characters). Never returns the caller. */
  search: (q: string) => api.request<{ items: UserRef[] }>(`/users/search?q=${encodeURIComponent(q)}`),
};
