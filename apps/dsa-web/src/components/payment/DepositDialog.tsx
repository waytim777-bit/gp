import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { Button, Modal } from '@heroui/react';
import type { Connector } from 'wagmi';
import {
  useAccount,
  useConnect,
  useConnectors,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { erc20Abi, isAddress, parseUnits } from 'viem';
import payAliIcon from '../../assets/pay-ali.png';
import payCoinIcon from '../../assets/pay-coin.png';
import payWechatIcon from '../../assets/pay-wechat.png';
import { paymentApi, type DepositConfigResponse } from '../../api/payment';
import { cn } from '../../utils/cn';

type DepositDialogProps = {
  isOpen: boolean;
  onClose: (deposited?: boolean) => void;
  creditsPerDollar: number;
  creditsPer1kTokens: number;
};

type PaymentMethod = 'crypto' | 'wechat' | 'alipay';

const METHOD_OPTIONS: Array<{
  id: PaymentMethod;
  title: string;
  icon: string;
}> = [
  { id: 'crypto', title: '加密货币', icon: payCoinIcon },
  { id: 'wechat', title: '微信支付', icon: payWechatIcon },
  { id: 'alipay', title: '支付宝', icon: payAliIcon },
];

const CREDIT_PRESETS = [100, 500, 1000, 2000, 5000];
const DEFAULT_CREDIT_AMOUNT = 1000;
const OCT_PER_USDT = 1.5;

function getConnectorIcon(connector: Connector): string | undefined {
  return (connector as Connector & { icon?: string }).icon;
}

function getMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '操作失败';
}

export const DepositDialog: React.FC<DepositDialogProps> = ({
  isOpen,
  onClose,
  creditsPerDollar,
  creditsPer1kTokens,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('crypto');
  const [selectedCredits, setSelectedCredits] = useState(DEFAULT_CREDIT_AMOUNT);
  const [availableConnectors, setAvailableConnectors] = useState<Connector[]>([]);
  const [octAmount, setOctAmount] = useState('');
  const [submittedHash, setSubmittedHash] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [depositConfig, setDepositConfig] = useState<DepositConfigResponse | null>(null);
  const [depositConfigError, setDepositConfigError] = useState<string | null>(null);
  const [isLoadingDepositConfig, setIsLoadingDepositConfig] = useState(false);
  const [isSubmittingHash, setIsSubmittingHash] = useState(false);

  const connectors = useConnectors();
  const { address, chainId, isConnected } = useAccount();
  const { connect, isPending, variables, error, reset } = useConnect();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const {
    data: txHash,
    error: writeError,
    isPending: isWriting,
    reset: resetWrite,
    writeContract,
  } = useWriteContract();

  const tokenAddress = depositConfig?.tokenAddress && isAddress(depositConfig.tokenAddress)
    ? depositConfig.tokenAddress
    : undefined;
  const receiverAddress = depositConfig?.receiverAddress && isAddress(depositConfig.receiverAddress)
    ? depositConfig.receiverAddress
    : undefined;
  const hasDepositConfig = Boolean(tokenAddress && receiverAddress);

  const { data: tokenDecimals } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'decimals',
    chainId: sepolia.id,
    query: { enabled: Boolean(tokenAddress) },
  });

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: sepolia.id,
    query: { enabled: Boolean(txHash) },
  });

  const visibleConnectors = useMemo(() => {
    const namedConnectors = availableConnectors.filter((connector) => connector.id !== 'injected');
    return namedConnectors.length > 0 ? namedConnectors : availableConnectors;
  }, [availableConnectors]);

  useEffect(() => {
    let cancelled = false;

    async function detectAvailableConnectors() {
      const detected = await Promise.all(
        connectors.map(async (connector) => {
          try {
            const provider = await connector.getProvider();
            return provider ? connector : null;
          } catch {
            return null;
          }
        }),
      );

      if (!cancelled) {
        setAvailableConnectors(detected.filter((connector): connector is Connector => Boolean(connector)));
      }
    }

    void detectAvailableConnectors();
    return () => {
      cancelled = true;
    };
  }, [connectors]);

  useEffect(() => {
    if (!isOpen || selectedMethod !== 'crypto') return;

    let cancelled = false;
    setIsLoadingDepositConfig(true);
    setDepositConfigError(null);

    paymentApi.getDepositConfig()
      .then((config) => {
        if (!cancelled) {
          setDepositConfig(config);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDepositConfig(null);
          setDepositConfigError(getMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDepositConfig(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedMethod]);

  useEffect(() => {
    if (!txHash || !address || submittedHash === txHash) return;

    let cancelled = false;
    setIsSubmittingHash(true);
    setSubmitError(null);

    paymentApi.deposit(txHash, address)
      .then(() => {
        if (cancelled) return;
        setSubmittedHash(txHash);
        onClose(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSubmitError(getMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSubmittingHash(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address, onClose, submittedHash, txHash]);

  useEffect(() => {
    if (isOpen) return;
    reset();
    resetWrite();
    setSelectedMethod('crypto');
    setOctAmount('');
    setSubmittedHash(null);
    setSubmitError(null);
    setDepositConfigError(null);
    setIsSubmittingHash(false);
  }, [isOpen, reset, resetWrite]);

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    onClose(false);
  };

  const handleMethodSelect = (method: PaymentMethod) => {
    setSelectedMethod(method);
    reset();
    resetWrite();
    setSubmitError(null);
  };

  const handleCreditPresetSelect = (credits: number) => {
    setSelectedCredits(credits);
    setOctAmount(((credits / creditsPerDollar) * OCT_PER_USDT).toFixed(2));
  };

  const octValue = Number(octAmount);
  const estimatedCredits =
    Number.isFinite(octValue) && octValue > 0 ? Math.floor((octValue / 1.5) * creditsPerDollar) : 0;
  const parsedAmount = Number.isFinite(octValue) && octValue > 0
    ? parseUnits(octAmount, tokenDecimals ?? 18)
    : 0n;
  const isWrongChain = isConnected && chainId !== sepolia.id;
  const actionDisabled =
    !hasDepositConfig || parsedAmount <= 0n || isWriting || isConfirming || isSubmittingHash || isSwitchingChain;

  const handleDeposit = () => {
    setSubmitError(null);
    if (!tokenAddress || !receiverAddress || parsedAmount <= 0n) return;
    if (isWrongChain) {
      switchChain({ chainId: sepolia.id });
      return;
    }
    writeContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [receiverAddress, parsedAmount],
      chainId: sepolia.id,
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    handleCreditPresetSelect(DEFAULT_CREDIT_AMOUNT);
    // Keep default amount in sync with the current rate when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creditsPerDollar, isOpen]);

  const actionText = isWrongChain
    ? '切换 Sepolia'
    : isWriting
      ? '确认钱包'
      : isConfirming
        ? '等待确认'
        : isSubmittingHash
          ? '入账中'
          : '充值';

  return (
    <Modal.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Modal.Backdrop variant="blur">
        <Modal.Container size="lg" placement="center">
          <Modal.Dialog className="w-full max-w-[740px] rounded-[20px] bg-elevated p-[30px] text-foreground shadow-2xl">
            <Modal.Header className="mb-3 p-0">
              <Modal.Heading className="text-xl font-bold leading-none">充值</Modal.Heading>
              <Modal.CloseTrigger className="text-muted-text transition-colors hover:text-foreground" />
            </Modal.Header>

            <Modal.Body className="p-0">
              <div className="flex flex-col gap-5">
                <div className="grid gap-3 md:grid-cols-[1fr_1fr] md:items-end">
                  <div>
                    <p className="text-base font-bold leading-none text-foreground">收费标准</p>
                    <p className="mt-1 text-xs font-bold text-foreground">
                      约1USDT=10,000 Token使用量
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-8 text-sm">
                    <div>
                      <p className="text-xs font-medium text-muted-text">充值汇率</p>
                      <p className="mt-1 font-bold text-foreground">1USDT={creditsPerDollar}积分</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-text">Token单价</p>
                      <p className="mt-1 font-bold text-foreground">1000 Token ={creditsPer1kTokens}积分</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-[168px_1fr]">
                  <div className="flex h-[312px] flex-col gap-5">
                    {METHOD_OPTIONS.map((method) => {
                      const isActive = selectedMethod === method.id;
                      return (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => handleMethodSelect(method.id)}
                          className={cn(
                            'flex h-10 w-full items-center gap-1 rounded-full px-[30px] py-2 text-left text-base font-bold transition-colors',
                            isActive
                              ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                              : 'text-foreground hover:bg-hover'
                          )}
                        >
                          <img src={method.icon} alt="" className="h-6 w-6 shrink-0" />
                          {method.title}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex h-[312px] flex-col rounded-[20px] bg-hover p-5">
                    {selectedMethod === 'crypto' ? (
                      <>
                        <div className="space-y-2">
                          <p className="text-base font-bold leading-none text-foreground">充值积分</p>
                          <div className="grid grid-cols-5 gap-4">
                            {CREDIT_PRESETS.map((credits) => {
                              const isActive = selectedCredits === credits;
                              return (
                                <button
                                  key={credits}
                                  type="button"
                                  onClick={() => handleCreditPresetSelect(credits)}
                                  className={cn(
                                    'flex h-8 items-center justify-center rounded border px-3 text-sm font-bold transition-colors',
                                    isActive
                                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                                      : 'border-border text-muted-text hover:border-[hsl(var(--primary)/0.45)] hover:text-foreground'
                                  )}
                                >
                                  {credits}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex flex-1 items-center justify-center">
                          {isConnected ? (
                            <div className="w-full max-w-[260px] space-y-4 text-center">
                              <div>
                                <p className="text-sm text-muted-text">预计到账</p>
                                <p className="mt-1 text-2xl font-bold text-foreground">
                                  {estimatedCredits.toLocaleString()} 积分
                                </p>
                                <p className="mt-1 text-xs text-muted-text">
                                  需支付 {octAmount || '0'} O币
                                </p>
                              </div>

                              {!hasDepositConfig ? (
                                <div className="text-sm text-danger">
                                  {depositConfigError ?? '未配置收款信息'}
                                </div>
                              ) : null}
                              {writeError ? <div className="text-sm text-danger">{writeError.message}</div> : null}
                              {submitError ? <div className="text-sm text-danger">{submitError}</div> : null}

                              <Button
                                fullWidth
                                className="h-[30px] rounded-full text-base font-bold"
                                variant="primary"
                                isDisabled={actionDisabled || isLoadingDepositConfig}
                                onPress={handleDeposit}
                              >
                                {isLoadingDepositConfig || isWriting || isConfirming || isSubmittingHash || isSwitchingChain ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : null}
                                {isLoadingDepositConfig ? '加载中' : actionText}
                              </Button>
                            </div>
                          ) : (
                            <div className="flex w-full flex-col gap-4">
                              <p className="text-base font-bold leading-none text-foreground">选择钱包</p>
                              <div className="flex max-h-[178px] w-full flex-wrap items-start justify-center gap-x-6 gap-y-4 overflow-y-auto px-2 py-1">
                                {visibleConnectors.length > 0 ? (
                                  visibleConnectors.map((connector) => {
                                    const icon = getConnectorIcon(connector);
                                    const connecting = isPending && variables?.connector === connector;
                                    return (
                                      <button
                                        key={connector.uid}
                                        type="button"
                                        disabled={isPending}
                                        onClick={() => connect({ connector, chainId: sepolia.id })}
                                        className="group flex flex-col items-center gap-2 p-2 text-center transition-colors hover:opacity-70 disabled:cursor-wait"
                                        title={connector.name}
                                      >
                                        <span className="relative flex items-center justify-center overflow-hidden">
                                          {icon ? (
                                            <img src={icon} alt="" className="w-22 h-[auto] rounded-xl object-contain" />
                                          ) : (
                                            <Wallet className="h-8 w-8 text-muted-text" />
                                          )}
                                          {connecting ? (
                                            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                                              <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--primary))]" />
                                            </span>
                                          ) : null}
                                        </span>
                                        <span className="line-clamp-2 max-w-full text-[11px] font-medium leading-tight text-muted-text group-hover:text-foreground">
                                          {connector.name}
                                        </span>
                                      </button>
                                    );
                                  })
                                ) : (
                                  <div className="flex flex-col items-center gap-2 text-sm text-muted-text">
                                    <Wallet className="h-10 w-10" />
                                    未检测到钱包
                                  </div>
                                )}
                              </div>
                              {error ? <div className="text-center text-sm text-danger">{error.message}</div> : null}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-1 items-center justify-center">
                        <div className="text-center">
                          {/* <img
                            src={selectedMethod === 'wechat' ? payWechatIcon : payAliIcon}
                            alt=""
                            className="mx-auto h-12 w-12"
                          /> */}
                          <p className="mt-4 text-lg font-bold text-foreground">
                            {selectedMethod === 'wechat' ? '微信支付' : '支付宝'}
                          </p>
                          <p className="mt-2 text-sm text-muted-text">暂不支持</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
};
