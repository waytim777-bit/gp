import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@heroui/react/card';
import { BellRing, Mail, Trash2, Webhook } from 'lucide-react';
import { subscriptionsApi } from '../api/subscriptions';
import { getParsedApiError, createParsedApiError, type ParsedApiError } from '../api/error';
import { StockAutocomplete } from '../components/StockAutocomplete/StockAutocomplete';
import {
  ApiErrorAlert,
  Button,
  ConfirmDialog,
  EmptyState,
  InlineAlert,
} from '../components/common';
import { useCreditStore } from '../stores/creditStore';
import {
  INTERVAL_OPTIONS,
  type NotificationProfile,
  type SubscriptionItem,
  type SubscriptionPricing,
  type SubscriptionPushLogItem,
} from '../types/subscriptions';
import { hasSubscriptionPushDestination } from '../utils/subscriptionPush';

const SubscriptionsPage: React.FC = () => {
  const { balance, refreshBalance } = useCreditStore();
  const [profile, setProfile] = useState<NotificationProfile | null>(null);
  const [pricing, setPricing] = useState<SubscriptionPricing | null>(null);
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [pushLogs, setPushLogs] = useState<SubscriptionPushLogItem[]>([]);
  const [activeCount, setActiveCount] = useState(0);

  const [notificationEmail, setNotificationEmail] = useState('');
  const [webhookUrls, setWebhookUrls] = useState('');
  const [webhookBearerToken, setWebhookBearerToken] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [stockInput, setStockInput] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [intervalDays, setIntervalDays] = useState<1 | 3 | 5>(1);

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SubscriptionItem | null>(null);
  const [error, setError] = useState<ParsedApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileData, pricingData, listData, pushLogData] = await Promise.all([
        subscriptionsApi.getProfile(),
        subscriptionsApi.getPricing(),
        subscriptionsApi.list(),
        subscriptionsApi.listPushLogs(20),
      ]);
      setProfile(profileData);
      setPricing(pricingData);
      setItems(listData.items);
      setPushLogs(pushLogData.items);
      setActiveCount(listData.activeCount);
      setNotificationEmail(profileData.notificationEmail || '');
      setWebhookUrls(profileData.webhookUrls || '');
    } catch (err: unknown) {
      setError(getParsedApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = '我的订阅 - DSA';
    void loadAll();
    void refreshBalance();
  }, [loadAll, refreshBalance]);

  const hasPushDestination = hasSubscriptionPushDestination({
    notificationEmail,
    webhookUrls,
  });
  const estimatedMonthly = pricing?.estimatedMonthlyByInterval[String(intervalDays)] ?? 0;
  const creditsPerPush = pricing?.creditsPerPush ?? 0;

  const pushStatusLabel = (status: string) => {
    if (status === 'success') return '成功';
    if (status === 'failed') return '失败';
    if (status === 'skipped') return '跳过';
    return status;
  };

  const pushChannelLabel = (channel: string) => {
    if (channel === 'email') return '邮件';
    if (channel === 'webhook') return 'Webhook';
    if (channel === 'both') return '邮件+Webhook';
    if (channel === 'none') return '无';
    return channel;
  };

  const profileDirty = useMemo(() => {
    if (!profile) {
      return Boolean(notificationEmail.trim() || webhookUrls.trim() || webhookBearerToken.trim());
    }
    return (
      notificationEmail !== (profile.notificationEmail || '')
      || webhookUrls !== (profile.webhookUrls || '')
      || Boolean(webhookBearerToken.trim())
    );
  }, [notificationEmail, profile, webhookBearerToken, webhookUrls]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setError(null);
    setSuccessMessage('');
    try {
      const saved = await subscriptionsApi.saveProfile({
        notificationEmail,
        webhookUrls,
        webhookBearerToken: webhookBearerToken.trim() || undefined,
      });
      setProfile(saved);
      setWebhookBearerToken('');
      setSuccessMessage('推送方式已保存');
    } catch (err: unknown) {
      setError(getParsedApiError(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleStockSubmit = (code: string, name?: string) => {
    setSelectedCode(code.trim().toUpperCase());
    setSelectedName(name?.trim() || '');
    setStockInput(code);
  };

  const handleCreateSubscription = async () => {
    const code = (selectedCode || stockInput).trim().toUpperCase();
    if (!code) {
      setError(createParsedApiError({
        title: '请填写股票代码',
        message: '请先输入或选择要订阅的股票代码。',
        category: 'missing_params',
      }));
      return;
    }
    setCreating(true);
    setError(null);
    setSuccessMessage('');
    try {
      const created = await subscriptionsApi.create({
        code,
        name: selectedName || undefined,
        intervalDays,
      });
      setItems((prev) => [created, ...prev]);
      setActiveCount((prev) => prev + 1);
      setStockInput('');
      setSelectedCode('');
      setSelectedName('');
      setSuccessMessage(`已添加订阅：${created.code}`);
    } catch (err: unknown) {
      setError(getParsedApiError(err));
    } finally {
      setCreating(false);
    }
  };

  const handleTogglePause = async (item: SubscriptionItem) => {
    setError(null);
    try {
      const nextStatus = item.status === 'active' ? 'paused' : 'active';
      const updated = await subscriptionsApi.update(item.id, { status: nextStatus });
      setItems((prev) => prev.map((row) => (row.id === item.id ? updated : row)));
      setActiveCount((prev) => prev + (nextStatus === 'active' ? 1 : -1));
    } catch (err: unknown) {
      setError(getParsedApiError(err));
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }
    setError(null);
    try {
      await subscriptionsApi.remove(pendingDelete.id);
      setItems((prev) => prev.filter((row) => row.id !== pendingDelete.id));
      if (pendingDelete.status === 'active') {
        setActiveCount((prev) => Math.max(0, prev - 1));
      }
      setPendingDelete(null);
      setSuccessMessage(`已删除订阅：${pendingDelete.code}`);
    } catch (err: unknown) {
      setError(getParsedApiError(err));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan/20 border-t-cyan" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">我的订阅</h1>
            <p className="mt-1 text-sm text-default-500">
              配置推送方式并订阅股票，系统将在交易日按设定间隔发送分析报告。
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card px-4 py-2 text-sm">
            当前余额 <span className="font-semibold text-amber-400">{Math.max(balance, 0)}</span> 积分
          </div>
        </div>
      </div>

      {error ? (
        <ApiErrorAlert error={error} onDismiss={() => setError(null)} />
      ) : null}
      {successMessage ? (
        <InlineAlert variant="success" title={successMessage} message=" " />
      ) : null}
      {!hasPushDestination ? (
        <InlineAlert
          variant="warning"
          title="请先配置推送方式"
          message="至少填写收件邮箱或 Webhook，否则无法接收订阅推送。"
        />
      ) : null}

      <Card>
        <Card.Content className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">推送方式</h2>
          </div>
          <p className="text-sm text-default-500">
            邮件由平台统一发送，您只需填写收件邮箱；也可选填 Webhook 接收推送。
          </p>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">收件邮箱</span>
            <input
              type="email"
              value={notificationEmail}
              onChange={(event) => setNotificationEmail(event.target.value)}
              placeholder="your@email.com"
              className="input-surface input-focus-glow h-11 w-full rounded-xl border bg-transparent px-4 text-sm"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">Webhook 地址（可选）</span>
            <textarea
              value={webhookUrls}
              onChange={(event) => setWebhookUrls(event.target.value)}
              placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
              rows={2}
              className="input-surface input-focus-glow w-full rounded-xl border bg-transparent px-4 py-3 text-sm"
            />
          </label>

          <button
            type="button"
            className="text-sm text-primary hover:underline"
            onClick={() => setShowAdvanced((value) => !value)}
          >
            {showAdvanced ? '收起高级选项' : '展开高级选项'}
          </button>

          {showAdvanced ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Webhook Bearer Token（可选）</span>
              <input
                type="password"
                value={webhookBearerToken}
                onChange={(event) => setWebhookBearerToken(event.target.value)}
                placeholder={profile?.hasWebhookBearerToken ? '已保存，留空则不修改' : '可选'}
                className="input-surface input-focus-glow h-11 w-full rounded-xl border bg-transparent px-4 text-sm"
              />
            </label>
          ) : null}

          <div className="flex justify-end">
            <Button
              variant="primary"
              isLoading={savingProfile}
              disabled={!profileDirty}
              onClick={() => void handleSaveProfile()}
            >
              保存推送方式
            </Button>
          </div>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">添加订阅</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">股票代码</span>
              <StockAutocomplete
                value={stockInput}
                onChange={setStockInput}
                onSubmit={handleStockSubmit}
                placeholder="输入股票代码或名称"
              />
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">推送间隔（交易日）</span>
            <div className="flex flex-wrap gap-2">
              {INTERVAL_OPTIONS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => setIntervalDays(option.days)}
                  className={`rounded-xl border px-4 py-2 text-sm transition-colors ${
                    intervalDays === option.days
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border/70 bg-card text-secondary-text hover:bg-hover'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-base/60 px-4 py-3 text-sm text-default-500">
            预计消耗 <span className="font-medium text-foreground">{creditsPerPush}</span> 积分/次，
            约 <span className="font-medium text-foreground">{estimatedMonthly}</span> 积分/月（按
            {pricing?.tradingDaysPerMonth ?? 22} 个交易日估算）。
          </div>

          <div className="flex justify-end">
            <Button
              variant="primary"
              isLoading={creating}
              onClick={() => void handleCreateSubscription()}
            >
              添加订阅
            </Button>
          </div>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">我的订阅列表</h2>
            </div>
            <span className="text-sm text-default-500">
              共 {items.length} 只 · 活跃 {activeCount}
            </span>
          </div>

          {items.length === 0 ? (
            <EmptyState
              title="还没有订阅股票"
              description="在上方搜索代码并选择推送间隔，即可开始接收每日分析报告。"
            />
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/60 bg-base/40 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{item.code}</span>
                      {item.name ? (
                        <span className="text-sm text-default-500">{item.name}</span>
                      ) : null}
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {item.intervalLabel}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          item.status === 'active'
                            ? 'bg-green-500/10 text-green-600'
                            : 'bg-default-100 text-default-500'
                        }`}
                      >
                        {item.status === 'active' ? '活跃' : '已暂停'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-default-500">
                      下次推送：{item.nextPushOn || '待定'} · {item.creditsPerPush} 积分/次
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleTogglePause(item)}
                    >
                      {item.status === 'active' ? '暂停' : '恢复'}
                    </Button>
                    <Button
                      variant="danger-subtle"
                      size="sm"
                      onClick={() => setPendingDelete(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">最近推送记录</h2>
          </div>

          {pushLogs.length === 0 ? (
            <EmptyState
              title="暂无推送记录"
              description="订阅到期并成功推送后，记录会显示在这里。"
            />
          ) : (
            <div className="space-y-2">
              {pushLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col gap-1 rounded-xl border border-border/60 bg-base/40 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{log.code}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          log.status === 'success'
                            ? 'bg-green-500/10 text-green-600'
                            : log.status === 'skipped'
                              ? 'bg-default-100 text-default-500'
                              : 'bg-red-500/10 text-red-600'
                        }`}
                      >
                        {pushStatusLabel(log.status)}
                      </span>
                      <span className="text-xs text-default-500">
                        {pushChannelLabel(log.channel)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-default-500">
                      {log.pushedOn || log.createdAt || '-'}
                      {log.status === 'success' && log.creditsCharged > 0
                        ? ` · 扣费 ${log.creditsCharged} 积分`
                        : ''}
                      {log.errorMessage ? ` · ${log.errorMessage}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card.Content>
      </Card>

      <p className="text-xs leading-relaxed text-default-500">
        免责声明：分析结果仅供参考，不构成投资建议。积分仅在推送成功后扣减；推送由管理员在后台「推送管理」中手动触发。
      </p>

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title="删除订阅"
        message={pendingDelete ? `确认删除 ${pendingDelete.code} 的订阅吗？` : ''}
        confirmText="删除"
        cancelText="取消"
        isDanger
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};

export default SubscriptionsPage;
