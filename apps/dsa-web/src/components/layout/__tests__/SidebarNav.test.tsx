import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SidebarNav } from '../SidebarNav';

const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockThemeToggle = vi.fn(({ collapsed, variant }: { collapsed?: boolean; variant?: string }) => (
  <button type="button">{variant === 'icon' ? '切换主题图标' : collapsed ? '切换主题(折叠)' : '切换主题'}</button>
));

const completionBadgeState = { value: true };

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    authEnabled: true,
    currentUser: {
      id: 1,
      username: 'demo',
      avatarUrl: null,
      isAdmin: true,
      menuPermissions: ['home', 'chat'],
    },
    logout: mockLogout,
  }),
}));

vi.mock('../../../stores/agentChatStore', () => ({
  useAgentChatStore: (selector: (state: { completionBadge: boolean }) => unknown) =>
    selector({ completionBadge: completionBadgeState.value }),
}));

vi.mock('../../../stores/creditStore', () => ({
  useCreditStore: () => ({
    balance: 1000,
    claimedToday: false,
    claiming: false,
    creditsPerDollar: 100,
    creditsPer1kTokens: 10,
    initialize: vi.fn().mockResolvedValue(undefined),
    claimDailyCredits: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({
    address: undefined,
    chain: undefined,
    isConnected: false,
  }),
  useDisconnect: () => ({
    disconnect: vi.fn(),
  }),
}));

vi.mock('../../theme/ThemeToggle', () => ({
  ThemeToggle: (props: { collapsed?: boolean; variant?: string }) => mockThemeToggle(props),
}));

vi.mock('../../payment/DepositDialog', () => ({
  DepositDialog: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div role="dialog" aria-label="充值">充值弹窗</div> : null
  ),
}));

vi.mock('../../profile/ProfileDialog', () => ({
  ProfileDialog: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div role="dialog" aria-label="个人中心">个人中心弹窗</div> : null
  ),
}));

describe('SidebarNav', () => {
  it('shows the shared completion badge only when chat completion is pending', () => {
    completionBadgeState.value = true;

    const { rerender } = render(
      <MemoryRouter initialEntries={['/chat']}>
        <SidebarNav />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('chat-completion-badge')).toBeInTheDocument();
    expect(screen.getByLabelText('问股有新消息')).toBeInTheDocument();

    completionBadgeState.value = false;
    rerender(
      <MemoryRouter initialEntries={['/chat']}>
        <SidebarNav />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('chat-completion-badge')).not.toBeInTheDocument();
  });

  it('renders the sidebar theme icon variant when the sidebar is collapsed', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <SidebarNav collapsed />
      </MemoryRouter>,
    );

    expect(mockThemeToggle).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'icon', collapsed: true }),
    );
    expect(screen.getByRole('button', { name: '切换主题图标' })).toBeInTheDocument();
  });

  it('opens the avatar popover on hover and confirms logout', async () => {
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <SidebarNav />
      </MemoryRouter>,
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: '用户菜单' }));
    expect(await screen.findByText('每日免费积分')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '退出' }));

    expect(await screen.findByRole('heading', { name: '退出登录' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认退出' }));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('opens profile dialog from the avatar popover instead of navigating', async () => {
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <SidebarNav />
      </MemoryRouter>,
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: '用户菜单' }));
    fireEvent.click((await screen.findAllByRole('button', { name: /个人中心/ }))[1]);

    expect(await screen.findByRole('dialog', { name: '个人中心' })).toBeInTheDocument();
  });
});
