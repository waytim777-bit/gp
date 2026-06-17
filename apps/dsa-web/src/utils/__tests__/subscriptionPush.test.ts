import { describe, expect, it } from 'vitest';
import { hasSubscriptionPushDestination } from '../subscriptionPush';

describe('hasSubscriptionPushDestination', () => {
  it('returns false when profile is empty', () => {
    expect(hasSubscriptionPushDestination(null)).toBe(false);
    expect(hasSubscriptionPushDestination({
      notificationEmail: '',
      webhookUrls: '',
    })).toBe(false);
  });

  it('returns true when email or webhook is configured', () => {
    expect(hasSubscriptionPushDestination({
      notificationEmail: 'user@example.com',
      webhookUrls: '',
    })).toBe(true);
    expect(hasSubscriptionPushDestination({
      notificationEmail: '',
      webhookUrls: 'https://example.com/hook',
    })).toBe(true);
  });
});
