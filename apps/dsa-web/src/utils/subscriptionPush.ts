import type { NotificationProfile } from '../types/subscriptions';

export function hasSubscriptionPushDestination(
  profile: Pick<NotificationProfile, 'notificationEmail' | 'webhookUrls'> | null | undefined,
): boolean {
  return Boolean(profile?.notificationEmail?.trim() || profile?.webhookUrls?.trim());
}
