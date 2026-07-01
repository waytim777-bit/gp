import type React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { erc20Abi, parseUnits } from 'viem';
import { sepolia } from 'wagmi/chains';
import { paymentApi } from '../../../api/payment';
import { depositAbi } from '../../../utils/abi';
import { DepositDialog } from '../DepositDialog';

const approveWrite = vi.fn();
const depositWrite = vi.fn();
const depositContractAddress = '0x3333333333333333333333333333333333333333';
let allowanceValue = 0n;
let writeHookIndex = 0;

vi.mock('@heroui/react', () => {
  const Button = ({
    children,
    isDisabled,
    onPress,
  }: {
    children: React.ReactNode;
    isDisabled?: boolean;
    onPress?: () => void;
  }) => (
    <button type="button" disabled={isDisabled} onClick={onPress}>
      {children}
    </button>
  );
  const Modal = {
    Root: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) => (
      isOpen ? <div>{children}</div> : null
    ),
    Backdrop: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Container: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Dialog: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
    Header: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Heading: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    CloseTrigger: () => <button type="button">关闭</button>,
    Body: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
  return { Button, Modal };
});

vi.mock('../../../api/payment', () => ({
  paymentApi: {
    getDepositConfig: vi.fn(),
    deposit: vi.fn(),
  },
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({
    address: '0x1111111111111111111111111111111111111111',
    chainId: 11155111,
    isConnected: true,
  }),
  useConnect: () => ({
    connect: vi.fn(),
    isPending: false,
    variables: undefined,
    error: null,
    reset: vi.fn(),
  }),
  useConnectors: () => [],
  useReadContract: ({ functionName }: { functionName: string }) => {
    if (functionName === 'allowance') {
      return { data: allowanceValue, refetch: vi.fn() };
    }
    if (functionName === 'decimals') {
      return { data: 18, refetch: vi.fn() };
    }
    return { data: undefined, refetch: vi.fn() };
  },
  useSwitchChain: () => ({
    switchChain: vi.fn(),
    isPending: false,
  }),
  useWaitForTransactionReceipt: () => ({
    isLoading: false,
    isSuccess: false,
  }),
  useWriteContract: () => {
    writeHookIndex += 1;
    return {
      data: undefined,
      error: null,
      isPending: false,
      reset: vi.fn(),
      writeContract: writeHookIndex % 2 === 1 ? approveWrite : depositWrite,
    };
  },
}));

describe('DepositDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeHookIndex = 0;
    allowanceValue = 0n;
    vi.mocked(paymentApi.getDepositConfig).mockResolvedValue({
      chainId: sepolia.id,
      receiverAddress: depositContractAddress,
      tokenAddress: '0x2222222222222222222222222222222222222222',
      contractAddress: depositContractAddress,
    });
  });

  it('approves the deposit contract before depositing when allowance is insufficient', async () => {
    render(
      <DepositDialog
        isOpen
        onClose={vi.fn()}
        creditsPerDollar={100}
        creditsPer1kTokens={10}
      />,
    );

    const approveButton = await screen.findByRole('button', { name: '授权 O 币' });
    await waitFor(() => expect(approveButton).not.toBeDisabled());
    fireEvent.click(approveButton);

    const amount = parseUnits('15.00', 18);
    expect(approveWrite).toHaveBeenCalledWith({
      address: '0x2222222222222222222222222222222222222222',
      abi: erc20Abi,
      functionName: 'approve',
      args: [depositContractAddress, amount],
      chainId: sepolia.id,
    });
    expect(depositWrite).not.toHaveBeenCalled();
  });

  it('calls deposit directly when allowance covers the selected amount', async () => {
    allowanceValue = parseUnits('15.00', 18);

    render(
      <DepositDialog
        isOpen
        onClose={vi.fn()}
        creditsPerDollar={100}
        creditsPer1kTokens={10}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: '充值' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '充值' }));

    expect(depositWrite).toHaveBeenCalledWith({
      address: depositContractAddress,
      abi: depositAbi,
      functionName: 'deposit',
      args: [parseUnits('15.00', 18)],
      chainId: sepolia.id,
    });
    expect(approveWrite).not.toHaveBeenCalled();
  });
});
