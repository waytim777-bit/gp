import apiClient from './index';
import { toCamelCase } from './utils';

export type UserProfile = {
  id: number;
  username: string;
  avatarUrl?: string | null;
  accountType: 'admin' | 'web' | 'system';
  isAdmin: boolean;
};

export type UpdateUserProfilePayload = {
  username?: string;
  avatarUrl?: string | null;
  clearAvatar?: boolean;
};

export const profileApi = {
  get: async (): Promise<UserProfile> => {
    const response = await apiClient.get<Record<string, unknown>>('/api/v1/profile');
    return toCamelCase<UserProfile>(response.data);
  },

  update: async (payload: UpdateUserProfilePayload): Promise<UserProfile> => {
    const body: Record<string, unknown> = {};
    if (payload.username !== undefined) {
      body.username = payload.username;
    }
    if (payload.avatarUrl !== undefined) {
      body.avatar_url = payload.avatarUrl;
    }
    if (payload.clearAvatar) {
      body.clear_avatar = true;
    }
    const response = await apiClient.patch<Record<string, unknown>>('/api/v1/profile', body);
    return toCamelCase<UserProfile>(response.data);
  },
};
