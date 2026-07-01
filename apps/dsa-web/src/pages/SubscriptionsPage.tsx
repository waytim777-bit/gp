import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@heroui/react';
import { Bell, Check, Trash2 } from 'lucide-react';
import { subscriptionsApi } from '../api/subscriptions';
import { getParsedApiError, createParsedApiError, type ParsedApiError } from '../api/error';
import { StockAutocomplete } from '../components/StockAutocomplete/StockAutocomplete';
import {
  ApiErrorAlert,
  ConfirmDialog,
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

  const [notificationEmail, setNotificationEmail] = useState('');
  const [webhookUrls, setWebhookUrls] = useState('');
  const [webhookBearerToken, setWebhookBearerToken] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [stockInput, setStockInput] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [intervalDays, setIntervalDays] = useState<1 | 3 | 5>(3);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showPushDialog, setShowPushDialog] = useState(false);

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<SubscriptionItem | null>(null);
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
  const activeCount = items.filter((item) => item.status === 'active').length;

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
      setShowPushDialog(false);
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
      setStockInput('');
      setSelectedCode('');
      setSelectedName('');
      setShowAddDialog(false);
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
      setSelectedSubscription((current) => (current?.id === item.id ? updated : current));
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
      setSelectedSubscription((current) => (current?.id === pendingDelete.id ? null : current));
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
    <div className="sm:px-6 w-full h-full overflow-hidden flex flex-col">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {/* <h1 className="text-xl font-bold text-foreground">我的订阅</h1> */}
            <p className="mt-1 text-sm text-default-500">
              配置推送方式并订阅股票，系统将在交易日按设定间隔发送分析报告。
            </p>
          </div>
          {/* <div className="rounded-xl border border-border/60 bg-card px-4 py-2 text-sm">
            当前余额 <span className="font-semibold text-amber-400">{Math.max(balance, 0)}</span> 积分
          </div> */}
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

      <div className="flex-1 text-foreground flex flex-col md:flex-row gap-3 mt-4">

        {/* 左侧栏：宽度固定或自适应，flex 垂直布局 */}
        <div className="w-full md:w-1/3 flex flex-col gap-3">

          {/* 当前积分余额 */}
          <div className="bg-[hsl(var(--card))]  p-5 rounded-xl flex justify-between items-center">
            <span className="text-sm font-medium">当前积分余额</span>
            <span className="text-cyan-400 font-semibold">{Math.max(balance, 0)}</span>
          </div>

          {/* 我的订阅列表 */}
          <div className="bg-[hsl(var(--card))]  p-5 rounded-xl flex-1 flex flex-col min-h-[300px]">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-medium">我的订阅列表</span>
              <button
                type="button"
                className="text-xs text-cyan-400 flex items-center gap-1 hover:underline"
                onClick={() => setShowAddDialog(true)}
              >
                <span>+</span> 添加订阅
              </button>
            </div>
            {items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                <img src={new URL('../assets/sub-empty.png', import.meta.url).href} className="w-35 h-auto" alt="" />
                <p>暂无订阅</p>
              </div>
            ) : (
              <div className="flex flex-col gap-[10px] overflow-auto pb-2">
                <div className="text-xs font-medium text-[#697087]">共 {items.length} 只 · 活跃 {activeCount}</div>
                {items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="grid w-full grid-cols-[minmax(0,1fr)_86px] gap-x-3 gap-y-3 rounded-[12px] bg-transparent px-3 py-3 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)] focus-visible:outline-none"
                    onClick={() => setSelectedSubscription(item)}
                  >
                    <p className="min-w-0 truncate text-[16px] font-semibold leading-none text-foreground">
                      {item.code}{item.name ? ` ${item.name}` : ''}
                    </p>
                    <span
                      className={`ml-auto flex h-[22px] w-[60px] items-center justify-center rounded-full px-1 text-[12px] font-medium leading-none ${
                        item.status === 'active'
                          ? 'bg-[#00a1c2]/10 text-[#00a1c2]'
                          : 'bg-[#ff5151]/10 text-[#ff5151]'
                      }`}
                    >
                      {item.status === 'active' ? '订阅中' : '已暂停'}
                    </span>
                    <p className="min-w-0 truncate text-[12px] font-medium leading-none text-[#697087]">
                      下次推送:{item.nextPushOn || '待定'}
                    </p>
                    <p className="text-right text-[12px] font-medium leading-none text-foreground">{item.creditsPerPush}积分/次</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 免责声明 */}
          <div className="text-xs text-slate-500 leading-relaxed px-1">
            免责声明：分析结果仅供参考，不构成投资建议。积分仅在推送成功后扣减；推送由管理员在后台「推送管理」中手动触发。
          </div>
        </div>

        {/* 右侧栏：最近推送记录 (占据剩余空间) */}
        <div className="flex-1 bg-[hsl(var(--card))] p-5 rounded-xl flex flex-col min-h-[400px]">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-medium">最近推送记录</span>
            <button
              type="button"
              className="text-xs text-slate-400 flex items-center gap-1 hover:text-slate-200"
              onClick={() => setShowPushDialog(true)}
            >
              ✉️ 推送方式
            </button>
          </div>
          {pushLogs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
              <img src={new URL('../assets/push-empty.png', import.meta.url).href} className="w-35 h-auto" alt="" />
              <p>暂无推送记录</p>
            </div>
          ) : (
            <div className="space-y-3 overflow-auto pr-1">
              {pushLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-white/8 bg-[#11131b] px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-100">{log.code}</span>
                    <span className="text-xs text-slate-500">
                      {pushStatusLabel(log.status)} · {pushChannelLabel(log.channel)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{log.pushedOn || log.createdAt || '-'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <Modal.Root isOpen={showAddDialog} onOpenChange={setShowAddDialog}>
        <Modal.Backdrop variant="blur">
          <Modal.Container size="lg" placement="center">
            <Modal.Dialog className="w-full max-w-[620px] rounded-[22px] bg-[hsl(var(--card))] shadow-2xl">
              <Modal.Header className="px-6 pb-0 pt-6">
                <Modal.Heading
                  id="add-subscription-title"
                  className="text-[22px] font-semibold leading-7 tracking-normal text-foreground"
                >
                  添加订阅
                </Modal.Heading>
                <Modal.CloseTrigger className="text-[#697087] transition-colors hover:text-slate-100" />
              </Modal.Header>

              <Modal.Body className="px-6 pb-6 pt-5">
                <StockAutocomplete
                  value={stockInput}
                  onChange={setStockInput}
                  onSubmit={handleStockSubmit}
                  placeholder="请输入股票代码"
                  className="h-12 rounded-full border-0 bg-[var(--bg-hover)]! px-6 text-[15px] font-normal text-slate-100 placeholder:text-[#6f778c] focus:ring-0"
                />

                <div className="mt-7">
                  <div className="text-[15px] leading-5 text-[#717990]">推送间隔（交易日）</div>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {INTERVAL_OPTIONS.map((option) => {
                      const selected = intervalDays === option.days;
                      return (
                        <button
                          key={option.days}
                          type="button"
                          className={`h-[42px] rounded-[12px] border text-[15px] font-medium leading-5 transition-colors ${
                            selected
                              ? 'border-[#09bde6] bg-transparent text-[#02c7f3]'
                              : 'border-transparent bg-[var(--bg-hover)] text-foreground hover:bg-[#303342]'
                          }`}
                          onClick={() => setIntervalDays(option.days)}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="mt-6 text-[15px] font-medium leading-6 text-[#00c8f5]">
                  预计消耗 {creditsPerPush} 积分/次， 约 {estimatedMonthly} 积分/月（按{pricing?.tradingDaysPerMonth ?? 22} 个交易日估算）。
                </p>

                <div className="mt-20 flex justify-end">
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() => void handleCreateSubscription()}
                    className="h-11 w-full rounded-[12px] bg-[hsl(var(--primary))] text-[15px] font-medium text-foreground transition-colors hover:bg-[var(--color-cyan-glow)] sm:w-[280px]"
                  >
                    {creating ? '添加中...' : '添加订阅'}
                  </button>
                </div>
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <Modal.Root isOpen={showPushDialog} onOpenChange={setShowPushDialog}>
        <Modal.Backdrop variant="blur">
          <Modal.Container size="lg" placement="center">
            <Modal.Dialog className="w-full max-w-[620px] rounded-[22px] bg-[hsl(var(--card))] text-slate-100 shadow-2xl">
              <Modal.Header className="px-5 pb-0 pt-5">
                <div>
                  <div className="flex items-center gap-2.5">
                    <Bell className="h-6 w-6 text-foreground" />
                    <Modal.Heading className="text-[20px] font-semibold leading-none text-foreground">
                      推送方式
                    </Modal.Heading>
                  </div>
                  <p className="mt-2 text-[12px] font-medium leading-5 text-[#697087]">
                    邮件由平台统一发送，您只需填写收件邮箱;也可选填Webhook接收推送。
                  </p>
                </div>
                <Modal.CloseTrigger className="text-[#697087] transition-colors hover:text-slate-100" />
              </Modal.Header>

              <Modal.Body className="px-5 pb-5 pt-8">
                <label className="block">
                  <span className="text-[14px] font-medium leading-none text-foreground">收件邮箱</span>
                  <input
                    type="email"
                    value={notificationEmail}
                    onChange={(event) => setNotificationEmail(event.target.value)}
                    placeholder="your@email.com"
                    className="mt-3 h-10 w-full rounded-[12px] border-0 bg-[var(--bg-hover)] px-3 text-[14px] font-medium text-foreground outline-none transition-colors placeholder:text-[#697087] focus:ring-2 focus:ring-[#00a1c2]/40"
                  />
                </label>

                <label className="mt-8 block">
                  <span className="flex items-center justify-between gap-4">
                    <span className="text-[14px] font-medium leading-none text-foreground">Webhook地址(可选)</span>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[14px] font-medium leading-none text-[#00a1c2]"
                      onClick={() => setShowAdvanced((value) => !value)}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded-[4px] border border-[#00a1c2] ${
                        showAdvanced ? 'bg-[#00a1c2]' : 'bg-transparent'
                      }`}
                      >
                        {showAdvanced ? <Check className="h-3 w-3 text-[#191b24]" /> : null}
                      </span>
                      高级选项
                    </button>
                  </span>
                  <textarea
                    value={webhookUrls}
                    onChange={(event) => setWebhookUrls(event.target.value)}
                    placeholder="请输入第三方推送链接"
                    rows={2}
                    className="mt-3 min-h-10 w-full resize-none rounded-[12px] border-0 bg-[var(--bg-hover)] px-3 py-3 text-[14px] font-medium text-foreground outline-none transition-colors placeholder:text-[#697087] focus:ring-2 focus:ring-[#00a1c2]/40"
                  />
                </label>

                {showAdvanced ? (
                  <label className="mt-8 block">
                    <span className="text-[14px] font-medium leading-none text-foreground">Webhook Bearer Token(可选)</span>
                    <input
                      type="password"
                      value={webhookBearerToken}
                      onChange={(event) => setWebhookBearerToken(event.target.value)}
                      placeholder={profile?.hasWebhookBearerToken ? '已保存，留空则不修改' : '请输入'}
                      className="mt-3 h-10 w-full rounded-[12px] border-0 bg-[var(--bg-hover)] px-3 text-[14px] font-medium text-foreground outline-none transition-colors placeholder:text-[#697087] focus:ring-2 focus:ring-[#00a1c2]/40"
                    />
                  </label>
                ) : null}

                <div className="mt-24 flex justify-end">
                  <button
                    type="button"
                    disabled={!profileDirty || savingProfile}
                    onClick={() => void handleSaveProfile()}
                    className="h-10 w-full rounded-[12px] bg-[hsl(var(--primary))] px-4 text-[14px] font-medium leading-none text-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-[280px]"
                  >
                    {savingProfile ? '保存中...' : '保存推送方式'}
                  </button>
                </div>
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <Modal.Root
        isOpen={Boolean(selectedSubscription)}
        onOpenChange={(open) => {
          if (!open) setSelectedSubscription(null);
        }}
      >
        <Modal.Backdrop variant="blur">
          <Modal.Container size="lg" placement="center">
            <Modal.Dialog className="w-full max-w-[620px] rounded-[22px] bg-[hsl(var(--card))] shadow-2xl">
              {selectedSubscription ? (
                <>
                  <Modal.Header className="px-5 pb-0 pt-5">
                    <Modal.Heading className="text-[20px] font-semibold leading-none text-foreground">
                      订阅详情
                    </Modal.Heading>
                    <Modal.CloseTrigger className="text-[#697087] transition-colors hover:text-slate-100" />
                  </Modal.Header>

                  <Modal.Body className="px-5 pb-5 pt-8">
                    <div className="flex items-start justify-between gap-5">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <h2 className="min-w-0 truncate text-[28px] font-semibold leading-none text-foreground">
                            {selectedSubscription.name || selectedSubscription.code}
                          </h2>
                          <span
                            className={`flex h-[22px] w-[60px] shrink-0 items-center justify-center rounded-full px-1 text-[12px] font-medium leading-none ${
                              selectedSubscription.status === 'active'
                                ? 'bg-[#00a1c2]/10 text-[#00a1c2]'
                                : 'bg-[#ff5151]/10 text-[#ff5151]'
                            }`}
                          >
                            {selectedSubscription.status === 'active' ? '订阅中' : '已暂停'}
                          </span>
                        </div>
                        <p className="mt-2 text-[14px] font-medium leading-none text-[#697087]">
                          股票代码：{selectedSubscription.code}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="flex h-10 shrink-0 items-center justify-center gap-1 rounded-[12px] bg-[#ff5151] px-3 text-[14px] font-semibold leading-none text-foreground transition-colors hover:bg-[#ff6666]"
                        onClick={() => {
                          setPendingDelete(selectedSubscription);
                          setSelectedSubscription(null);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        取消订阅
                      </button>
                    </div>

                    <div className="mt-12">
                      <p className="text-[14px] font-medium leading-none text-[#697087]">推送间隔（交易日）</p>
                      <div className="mt-2 grid grid-cols-3 gap-5">
                        {INTERVAL_OPTIONS.map((option) => {
                          const selected = selectedSubscription.intervalDays === option.days;
                          return (
                            <div
                              key={option.days}
                              className={`flex h-10 items-center justify-center rounded-[12px] border px-2 text-[14px] font-medium leading-none ${
                                selected
                                  ? 'border-[#00a1c2] bg-[var(--bg-hover)] text-[#00c8f5]'
                                  : 'border-transparent bg-[var(--bg-hover)] text-foreground'
                              }`}
                            >
                              {option.label}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <p className="mt-6 text-[14px] font-medium leading-none text-[#00c8f5]">
                      预计消耗 {selectedSubscription.creditsPerPush} 积分/次，
                      约 {selectedSubscription.estimatedMonthlyCredits} 积分/月（按{pricing?.tradingDaysPerMonth ?? 22} 个交易日估算）。
                    </p>

                    <div className="mt-24">
                      <button
                        type="button"
                        className="flex h-10 w-full items-center justify-center rounded-[12px] bg-[hsl(var(--primary))] px-4 text-[14px] font-medium leading-none text-foreground transition-colors hover:brightness-110"
                        onClick={() => void handleTogglePause(selectedSubscription)}
                      >
                        {selectedSubscription.status === 'active' ? '暂停订阅' : '恢复订阅'}
                      </button>
                    </div>
                  </Modal.Body>
                </>
              ) : null}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

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
