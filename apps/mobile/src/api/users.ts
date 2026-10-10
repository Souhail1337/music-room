import type { Me } from './auth';
import { api } from './client';

export interface UserRef {
  id: string;
  displayName: string;
}

export interface UserSummary extends UserRef {
  isFriend: boolean;
}

export interface PublicInfo {
  bio?: string;
  city?: string;
}

export interface FriendsInfo {
  phone?: string;
  /** YYYY-MM-DD */
  birthday?: string;
}

export interface PrivateInfo {
  fullName?: string;
  address?: string;
}

export interface MusicPrefs {
  genres: string[];
  artists: string[];
}

export type Friendship = 'none' | 'friends' | 'incoming' | 'outgoing' | 'self';

/**
 * A profile as the server lets the caller see it (AD-7): `friends` is present only for friends and
 * yourself, `private` only for yourself.
 */
export interface Profile {
  id: string;
  displayName: string;
  public: PublicInfo;
  musicPrefs: MusicPrefs;
  friends?: FriendsInfo;
  private?: PrivateInfo;
  friendship: Friendship;
  /** The pending request when `incoming` or `outgoing`. */
  requestId?: string;
}

export interface ProfileUpdate {
  displayName?: string;
  public?: PublicInfo;
  friends?: FriendsInfo;
  private?: PrivateInfo;
  musicPrefs?: Partial<MusicPrefs>;
}

export interface Friend extends UserRef {
  since: string;
}

export interface FriendRequest {
  id: string;
  user: UserRef;
  createdAt: string;
}

export interface FriendRequests {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

export const usersApi = {
  /** Display-name prefix or exact email (min 2 characters). Never returns the caller; friends first. */
  search: (q: string) => api.request<{ items: UserSummary[] }>(`/users/search?q=${encodeURIComponent(q)}`),
  myProfile: () => api.request<Profile>('/me/profile'),
  updateProfile: (body: ProfileUpdate) => api.request<Profile>('/me/profile', { method: 'PATCH', body }),
  profile: (id: string) => api.request<Profile>(`/users/${encodeURIComponent(id)}/profile`),
  /** FR-3: link a Google account (the server verifies the ID token). */
  linkGoogle: (idToken: string) => api.request<Me>('/me/google', { method: 'POST', body: { idToken } }),
};

export const friendsApi = {
  list: () => api.request<{ items: Friend[] }>('/friends'),
  requests: () => api.request<FriendRequests>('/friends/requests'),
  /** Sends a request, or accepts theirs if they already asked. Returns their profile as you now see it. */
  request: (userId: string) => api.request<Profile>('/friends/requests', { method: 'POST', body: { userId } }),
  accept: (requestId: string) =>
    api.request<Profile>(`/friends/requests/${encodeURIComponent(requestId)}/accept`, { method: 'POST' }),
  decline: (requestId: string) =>
    api.request<void>(`/friends/requests/${encodeURIComponent(requestId)}/decline`, { method: 'POST' }),
  cancel: (requestId: string) => api.request<void>(`/friends/requests/${encodeURIComponent(requestId)}`, { method: 'DELETE' }),
  remove: (userId: string) => api.request<void>(`/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
};
