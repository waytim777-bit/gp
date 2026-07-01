import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pagination } from '@heroui/react';
import { motion } from 'motion/react';
import { BarChart3, BellRing, ChevronRight, History, Home, LogOut, MessageSquareQuote, Share2, Unplug, UserRound } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAccount, useDisconnect } from 'wagmi';
import { paymentApi, type PaymentHistoryItem } from '../../api/payment';
import creditIconSvg from '../../assets/creditIcon.svg?raw';
import { useAuth } from '../../contexts/AuthContext';
import { useAgentChatStore } from '../../stores/agentChatStore';
import { useCreditStore } from '../../stores/creditStore';
import { cn } from '../../utils/cn';
import { formatDate } from '../../utils/format';
import { resolveUserAvatarUrl } from '../../utils/userAvatar';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DepositDialog } from '../payment/DepositDialog';
import { ProfileDialog } from '../profile/ProfileDialog';
import { StatusDot } from '../common/StatusDot';
import { ThemeToggle } from '../theme/ThemeToggle';

type SidebarNavProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
};

type NavItem = {
  key: string;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: 'completion';
  permission?: string;
};

type UsageHistoryRow = {
  id: string;
  detail: string;
  type: string;
  date: string;
  credits: number;
  createdAt: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: '首页', to: '/', icon: Home, exact: true, permission: 'home' },
  { key: 'chat', label: '问股', to: '/chat', icon: MessageSquareQuote, badge: 'completion', permission: 'chat' },
  { key: 'backtest', label: '回测', to: '/backtest', icon: BarChart3, permission: 'backtest' },
  { key: 'subscriptions', label: '我的订阅', to: '/subscriptions', icon: BellRing, permission: 'subscriptions' },
  { key: 'prediction_reports', label: '预测报告', to: '/prediction-reports', icon: Share2, permission: 'prediction_reports' },
];

const USAGE_HISTORY_PAGE_SIZE = 8;

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}****${address.slice(-4)}`;
}

function getCallTypeLabel(callType: string): string {
  const labels: Record<string, string> = {
    agent: '问股',
    analysis: '分析',
    analysis_probe: '分析预检',
    consultation: '会诊',
    market_review: '市场复盘',
    prediction_report_purchase: '预测报告',
    subscription_push: '订阅推送',
  };
  return labels[callType] ?? callType;
}

function getUsagePageNumbers(page: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 0) return [];
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | 'ellipsis'> = [1];

  if (page > 3) {
    pages.push('ellipsis');
  }

  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    pages.push(pageNumber);
  }

  if (page < totalPages - 2) {
    pages.push('ellipsis');
  }

  pages.push(totalPages);
  return pages;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({ collapsed = false, onNavigate }) => {
  const { currentUser, logout } = useAuth();
  const completionBadge = useAgentChatStore((state) => state.completionBadge);
  const {
    balance, lifetimeCredits, claimedToday, claiming, creditsPerDollar, creditsPer1kTokens,
    initialize, claimDailyCredits,
  } = useCreditStore();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDepositDialog, setShowDepositDialog] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showUsageDialog, setShowUsageDialog] = useState(false);
  const [usageHistoryLoading, setUsageHistoryLoading] = useState(false);
  const [usageHistoryError, setUsageHistoryError] = useState<string | null>(null);
  const [usageHistoryItems, setUsageHistoryItems] = useState<PaymentHistoryItem[]>([]);
  const [usageHistoryPage, setUsageHistoryPage] = useState(1);
  const [usageHistoryTotal, setUsageHistoryTotal] = useState(0);
  const [usageHistoryTotalPages, setUsageHistoryTotalPages] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuCloseTimerRef = useRef<number | null>(null);
  const { address, chain, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  const loadUsageHistory = useCallback(async (page = usageHistoryPage) => {
    setUsageHistoryLoading(true);
    setUsageHistoryError(null);
    try {
      const history = await paymentApi.getHistory({
        page,
        pageSize: USAGE_HISTORY_PAGE_SIZE,
      });
      setUsageHistoryItems(history.items || []);
      setUsageHistoryPage(history.page || page);
      setUsageHistoryTotal(history.total || 0);
      setUsageHistoryTotalPages(history.totalPages || 0);
    } catch {
      setUsageHistoryError('交易记录加载失败，请稍后重试');
    } finally {
      setUsageHistoryLoading(false);
    }
  }, [usageHistoryPage]);

  useEffect(() => {
    if (currentUser) {
      void initialize();
    }
  }, [currentUser, initialize]);

  useEffect(() => {
    if (showUsageDialog) {
      void loadUsageHistory(usageHistoryPage);
    }
  }, [loadUsageHistory, showUsageDialog, usageHistoryPage]);

  useEffect(() => {
    return () => {
      if (userMenuCloseTimerRef.current !== null) {
        window.clearTimeout(userMenuCloseTimerRef.current);
      }
    };
  }, []);

  const clearUserMenuCloseTimer = () => {
    if (userMenuCloseTimerRef.current !== null) {
      window.clearTimeout(userMenuCloseTimerRef.current);
      userMenuCloseTimerRef.current = null;
    }
  };

  const openUserMenu = () => {
    clearUserMenuCloseTimer();
    setUserMenuOpen(true);
  };

  const scheduleUserMenuClose = () => {
    clearUserMenuCloseTimer();
    userMenuCloseTimerRef.current = window.setTimeout(() => {
      setUserMenuOpen(false);
      userMenuCloseTimerRef.current = null;
    }, 120);
  };

  const shortAddress = address ? formatAddress(address) : '';
  const displayBalance = Math.max(balance, 0).toLocaleString();
  const displayLifetimeCredits = Math.max(lifetimeCredits ?? 0, 0).toLocaleString();
  const usageRows = useMemo<UsageHistoryRow[]>(() => {
    return usageHistoryItems.map((item) => ({
      id: `${item.kind}-${item.id}`,
      detail: item.kind === 'deduction' ? getCallTypeLabel(item.callType || item.detail) : item.reason || item.detail || '积分充值',
      type: item.transactionType,
      date: formatDate(item.createdAt),
      credits: item.creditAmount,
      createdAt: item.createdAt,
    }));
  }, [usageHistoryItems]);
  const usagePageNumbers = useMemo(
    () => getUsagePageNumbers(usageHistoryPage, usageHistoryTotalPages),
    [usageHistoryPage, usageHistoryTotalPages]
  );
  const userAvatar = currentUser
    ? resolveUserAvatarUrl(currentUser.id, currentUser.username, currentUser.avatarUrl, 40)
    : null;
  const permissions = new Set(currentUser?.menuPermissions ?? []);
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (currentUser?.isAdmin) {
      return true;
    }
    if (item.permission === 'subscriptions') {
      return permissions.has('subscriptions') || permissions.has('settings');
    }
    return !item.permission || permissions.has(item.permission);
  });

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center gap-3 px-3 py-4', collapsed && 'justify-center px-2')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 text-white shadow-[0_8px_20px_rgba(0,212,255,0.3)]">
          <BarChart3 className="h-5 w-5" />
        </div>
        {!collapsed ? (
          <span className="truncate text-sm font-bold text-foreground">DSA</span>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2" aria-label="主导航">
        {visibleItems.map(({ key, label, to, icon: Icon, exact, badge }) => (
          <NavLink
            key={key}
            to={to}
            end={exact}
            onClick={onNavigate}
            aria-label={label}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all',
                collapsed && 'justify-center px-2',
                isActive
                  ? 'bg-primary/10 text-[hsl(var(--primary))] font-medium'
                  : 'text-secondary-text hover:bg-hover hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute inset-y-1.5 left-1.5 w-0.5 rounded-full bg-[hsl(var(--primary))]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  />
                )}
                <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-[hsl(var(--primary))]')} />
                {!collapsed ? <span className="truncate">{label}</span> : null}
                {badge === 'completion' && completionBadge ? (
                  <StatusDot
                    tone="info"
                    data-testid="chat-completion-badge"
                    className={cn(
                      'absolute right-2 border-2 border-card',
                      collapsed && 'right-1 top-1'
                    )}
                    aria-label="问股有新消息"
                  />
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div
        className={cn(
          'mt-auto flex w-full flex-col items-start pb-4',
          collapsed ? 'px-1' : 'px-0'
        )}
      >
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            setUsageHistoryPage(1);
            setShowUsageDialog(true);
          }}
          className={cn(
            'group flex h-16 w-full items-center rounded-xl text-[hsl(var(--primary))]',
            collapsed ? 'justify-center' : 'pl-5'
          )}
          title="积分余额"
          aria-label={`积分余额 ${displayBalance}`}
        >
          <span
            className={cn(
              'flex h-10 min-w-0 items-center gap-1 rounded-xl px-2 transition-colors group-hover:bg-hover',
              collapsed ? 'max-w-[64px]' : 'max-w-[180px]'
            )}
          >
            <span
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-[hsl(var(--primary))] [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: creditIconSvg }}
            />
            <span className="truncate text-xs font-medium leading-none">{displayBalance}</span>
          </span>
        </button>

        <div className={cn('flex h-16 w-full items-center rounded-xl', collapsed ? 'justify-center' : 'pl-5')}>
          <div
            className="relative z-[110] h-10 w-10"
            onMouseEnter={openUserMenu}
            onMouseLeave={scheduleUserMenuClose}
          >
            <button
              type="button"
              className="group flex h-10 w-10 cursor-pointer select-none items-center justify-center rounded-full"
              aria-label="用户菜单"
              onFocus={openUserMenu}
              onBlur={scheduleUserMenuClose}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] transition-shadow group-hover:ring-2 group-hover:ring-[hsl(var(--primary)/0.24)]">
                {userAvatar ? (
                  <img src={userAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserRound className="h-5 w-5" />
                )}
              </span>
            </button>

            {userMenuOpen ? (
              <>
                <div className="absolute bottom-0 left-full h-10 w-3" aria-hidden="true" />
                <div
                  role="dialog"
                  aria-label="用户菜单"
                  className="absolute bottom-0 left-[calc(100%+10px)] z-[110] w-[300px] rounded-xl bg-elevated p-4 shadow-[0_10px_10px_rgba(0,0,0,0.10)]"
                  onMouseEnter={openUserMenu}
                  onMouseLeave={scheduleUserMenuClose}
                >
                  <div className="flex w-full flex-col gap-5 text-foreground">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            setShowProfileDialog(true);
                          }}
                          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                          title="个人中心"
                        >
                          {userAvatar ? (
                            <img src={userAvatar} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <UserRound className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            setShowProfileDialog(true);
                          }}
                          className="flex h-6 items-center text-[13px] font-medium text-foreground"
                        >
                          个人中心
                          <ChevronRight className="h-5 w-5 text-muted-text" />
                        </button>
                      </div>

                      <div className="h-px w-full bg-border/70" />

                      <div className="flex flex-col gap-3">
                        <div className="flex h-8 items-center justify-between">
                          <div className="flex min-w-0 items-center">
                            <span
                              aria-hidden="true"
                              className="h-5 w-5 shrink-0 text-[hsl(var(--primary))] [&_svg]:h-full [&_svg]:w-full"
                              dangerouslySetInnerHTML={{ __html: creditIconSvg }}
                            />
                            <span className="truncate text-lg font-bold leading-none text-foreground">
                              {displayBalance}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setUserMenuOpen(false);
                              setShowDepositDialog(true);
                            }}
                            className="flex h-8 w-[72px] items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-sm font-bold leading-none text-[hsl(var(--primary-foreground))] transition-colors hover:bg-[hsl(var(--primary)/0.86)]"
                          >
                            充值
                          </button>
                        </div>

                        <div className="flex flex-col">
                          <div className="flex h-8 items-center justify-between">
                            <span className="text-sm font-bold leading-none text-foreground">每日免费积分</span>
                            <button
                              type="button"
                              disabled={claimedToday || claiming}
                              onClick={() => {
                                void claimDailyCredits();
                              }}
                              className={cn(
                                'flex h-8 w-[72px] items-center justify-center rounded-xl border px-3 text-sm font-bold leading-none transition-colors',
                                claimedToday
                                  ? 'cursor-not-allowed border-border text-muted-text'
                                  : 'border-border text-muted-text hover:border-[hsl(var(--primary)/0.45)] hover:text-[hsl(var(--primary))]'
                              )}
                            >
                              {claiming ? '领取中' : claimedToday ? '已领' : '领取'}
                            </button>
                          </div>
                          <p className="text-xs font-medium leading-5 text-muted-text">每天重置为100免费积分</p>
                        </div>

                        {isConnected && address ? (
                          <button
                            type="button"
                            onClick={() => {
                              disconnect();
                              setUserMenuOpen(false);
                            }}
                            className="flex items-center gap-2 text-xs font-medium text-muted-text transition-colors hover:text-foreground"
                          >
                            <Unplug className="h-4 w-4" />
                            {shortAddress} · {chain?.name ?? 'Sepolia'}
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            setUsageHistoryPage(1);
                            setShowUsageDialog(true);
                          }}
                          className="flex h-6 w-full items-center justify-between text-sm font-bold leading-none text-foreground transition-colors hover:text-[hsl(var(--primary))]"
                        >
                          使用详情
                          <ChevronRight className="h-5 w-5 text-muted-text" />
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setShowLogoutConfirm(true);
                      }}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-hover text-sm font-bold leading-none text-foreground transition-colors hover:bg-[hsl(var(--foreground)/0.12)]"
                    >
                      <LogOut className="h-5 w-5" />
                      退出
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className={cn('flex h-16 w-full items-center rounded-xl', collapsed ? 'justify-center' : 'pl-5')}>
          <ThemeToggle variant="icon" collapsed={collapsed} />
        </div>
      </div>

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        title="退出登录"
        message="确认退出当前登录状态吗？退出后需要重新输入密码。"
        confirmText="确认退出"
        cancelText="取消"
        isDanger
        onConfirm={() => {
          setShowLogoutConfirm(false);
          onNavigate?.();
          void logout();
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      <DepositDialog
        isOpen={showDepositDialog}
        creditsPerDollar={creditsPerDollar}
        creditsPer1kTokens={creditsPer1kTokens}
        onClose={(deposited) => {
          setShowDepositDialog(false);
          if (deposited) {
            void initialize();
            if (showUsageDialog) {
              setUsageHistoryPage(1);
              void loadUsageHistory(1);
            }
          }
        }}
      />

      <ProfileDialog
        isOpen={showProfileDialog}
        onOpenChange={setShowProfileDialog}
      />

      <Modal.Root isOpen={showUsageDialog} onOpenChange={setShowUsageDialog}>
        <Modal.Backdrop variant="blur">
          <Modal.Container size="lg" placement="center">
            <Modal.Dialog className="w-[calc(100vw-32px)] max-w-[560px] rounded-[18px] bg-elevated p-5 text-foreground shadow-2xl sm:p-6">
              <Modal.Header className="mb-6 p-0">
                <Modal.Heading className="text-lg font-bold leading-none">当前积分</Modal.Heading>
                <Modal.CloseTrigger className="text-muted-text transition-colors hover:text-foreground" />
              </Modal.Header>

              <Modal.Body className="flex flex-col gap-8 p-0">
                <section className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center">
                        <span
                          aria-hidden="true"
                          className="h-5 w-5 shrink-0 text-[hsl(var(--primary))] [&_svg]:h-full [&_svg]:w-full"
                          dangerouslySetInnerHTML={{ __html: creditIconSvg }}
                        />
                        <span className="truncate text-xl font-bold leading-none text-[hsl(var(--primary))]">
                          {displayBalance}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-none text-muted-text">
                        累计充值 {displayLifetimeCredits} 积分
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowUsageDialog(false);
                        setShowDepositDialog(true);
                      }}
                      className="flex h-8 w-20 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-sm font-bold leading-none text-[hsl(var(--primary-foreground))] transition-colors hover:bg-[hsl(var(--primary)/0.86)]"
                    >
                      充值
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-base font-bold leading-none text-foreground">每日免费积分</span>
                    <button
                      type="button"
                      disabled={claimedToday || claiming}
                      onClick={() => {
                        void claimDailyCredits().then((success) => {
                          if (success) {
                            setUsageHistoryPage(1);
                            void loadUsageHistory(1);
                          }
                        });
                      }}
                      className={cn(
                        'flex h-8 w-20 shrink-0 items-center justify-center rounded-xl border px-3 text-sm font-bold leading-none transition-colors',
                        claimedToday
                          ? 'cursor-not-allowed border-border text-muted-text'
                          : 'border-border text-muted-text hover:border-[hsl(var(--primary)/0.45)] hover:text-[hsl(var(--primary))]'
                      )}
                    >
                      {claiming ? '领取中' : claimedToday ? '已领取' : '领取'}
                    </button>
                  </div>
                </section>

                <section className="flex flex-col gap-4">
                  <div>
                    <h3 className="text-base font-bold leading-none text-foreground">交易记录</h3>
                    <div className="mt-3 h-px w-full bg-[#343a4a]">
                      <div className="h-[3px] w-9 rounded-full bg-[hsl(var(--primary))]" />
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-[var(--border-dim)]">
                    <div className="grid grid-cols-[1.2fr_1fr_1.1fr_0.9fr] bg-[var(--backtest-table-bg)] px-3 py-2.5 text-xs font-medium text-muted-text sm:text-sm">
                      <span>明细</span>
                      <span>交易类型</span>
                      <span>日期</span>
                      <span>积分消耗</span>
                    </div>

                    {usageHistoryLoading ? (
                      <div className="flex h-28 items-center justify-center text-sm text-muted-text">加载中...</div>
                    ) : usageHistoryError ? (
                      <div className="flex h-28 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-muted-text">
                        <span>{usageHistoryError}</span>
                        <button
                          type="button"
                          onClick={() => void loadUsageHistory(usageHistoryPage)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-[hsl(var(--primary)/0.45)] hover:text-[hsl(var(--primary))]"
                        >
                          重新加载
                        </button>
                      </div>
                    ) : usageRows.length > 0 ? (
                      <div className="max-h-[300px] overflow-y-auto">
                        {usageRows.map((row) => (
                          <div
                            key={row.id}
                            className="grid grid-cols-[1.2fr_1fr_1.1fr_0.9fr] border-t border-[var(--border-dim)] px-3 py-3 text-sm font-bold leading-none text-foreground"
                          >
                            <span className="min-w-0 truncate pr-2">{row.detail}</span>
                            <span className="min-w-0 truncate pr-2">{row.type}</span>
                            <span className="min-w-0 truncate pr-2">{row.date}</span>
                            <span className={cn('min-w-0 truncate', row.credits > 0 && 'text-emerald-400')}>
                              {row.credits > 0 ? '+' : ''}
                              {row.credits}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-28 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-text">
                        <History className="h-8 w-8 text-muted-text" />
                        <span>暂无交易记录</span>
                      </div>
                    )}
                  </div>
                  {usageRows.length > 0 ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-full max-w-full overflow-x-auto">
                        <Pagination className="justify-center">
                          <Pagination.Content>
                            <Pagination.Item>
                              <Pagination.Previous
                                isDisabled={usageHistoryPage === 1}
                                onPress={() => setUsageHistoryPage((page) => Math.max(1, page - 1))}
                              >
                                <Pagination.PreviousIcon />
                                <span>上一页</span>
                              </Pagination.Previous>
                            </Pagination.Item>
                            {usagePageNumbers.map((pageNumber, index) =>
                              pageNumber === 'ellipsis' ? (
                                <Pagination.Item key={`ellipsis-${index}`}>
                                  <Pagination.Ellipsis />
                                </Pagination.Item>
                              ) : (
                                <Pagination.Item key={pageNumber}>
                                  <Pagination.Link
                                    isActive={pageNumber === usageHistoryPage}
                                    onPress={() => setUsageHistoryPage(pageNumber)}
                                  >
                                    {pageNumber}
                                  </Pagination.Link>
                                </Pagination.Item>
                              )
                            )}
                            <Pagination.Item>
                              <Pagination.Next
                                isDisabled={usageHistoryPage === usageHistoryTotalPages}
                                onPress={() => setUsageHistoryPage((page) => Math.min(usageHistoryTotalPages, page + 1))}
                              >
                                <span>下一页</span>
                                <Pagination.NextIcon />
                              </Pagination.Next>
                            </Pagination.Item>
                          </Pagination.Content>
                        </Pagination>
                      </div>
                      <p className="text-xs text-muted-text">
                        共 {usageHistoryTotal} 条记录 · 第 {usageHistoryPage}/{Math.max(usageHistoryTotalPages, 1)} 页
                      </p>
                    </div>
                  ) : null}
                </section>
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </div>
  );
};
