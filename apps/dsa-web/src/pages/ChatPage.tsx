import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../utils/cn';
import { agentApi } from '../api/agent';
import { ApiErrorAlert, Badge, Button, ConfirmDialog, EmptyState, InlineAlert, ScrollArea, Tooltip } from '../components/common';
import { getParsedApiError } from '../api/error';
import type { SkillInfo } from '../api/agent';
import { DashboardStateBlock } from '../components/dashboard';
import {
  useAgentChatStore,
  type Message,
  type ProgressStep,
} from '../stores/agentChatStore';
import { downloadSession, formatSessionAsMarkdown } from '../utils/chatExport';
import type { ChatFollowUpContext } from '../utils/chatFollowUp';
import {
  buildFollowUpInputPlaceholder,
  formatFollowUpDisplayName,
  parseFollowUpRecordId,
  REPORT_FOLLOW_UP_QUICK_QUESTIONS,
  resolveChatFollowUpContext,
  sanitizeFollowUpStockCode,
  sanitizeFollowUpStockName,
  type ChatMode,
} from '../utils/chatFollowUp';
import { isNearBottom } from '../utils/chatScroll';
import { getReportText } from '../utils/reportLanguage';
import NewConversationIconSvg from '../assets/new-conversation.svg?raw';
import ConversationIconSvg from '../assets/conversation.svg?raw';

// Quick question examples shown on empty state
const QUICK_QUESTIONS = [
  { label: '用缠论分析茅台', skill: 'chan_theory' },
  { label: '波浪理论看宁德时代', skill: 'wave_theory' },
  { label: '分析比亚迪趋势', skill: 'bull_trend' },
  { label: '箱体震荡技能看中芯国际', skill: 'box_oscillation' },
  { label: '分析腾讯 hk00700', skill: 'bull_trend' },
  { label: '用情绪周期分析东方财富', skill: 'emotion_cycle' },
];

const ChatPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState('');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<string>('');
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [isFollowUpContextLoading, setIsFollowUpContextLoading] = useState(false);
  const [sendToast, setSendToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [copiedMessages, setCopiedMessages] = useState<Set<string>>(new Set());
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const copyResetTimerRef = useRef<Partial<Record<string, number>>>({});
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const skillMenuRef = useRef<HTMLDivElement>(null);
  const sessionMenuRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const sendToastTimerRef = useRef<number | null>(null);
  const followUpHydrationTokenRef = useRef(0);
  const [followUpContext, setFollowUpContext] = useState<ChatFollowUpContext | null>(null);
  const [followUpInputPlaceholder, setFollowUpInputPlaceholder] = useState<string | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const pendingScrollBehaviorRef = useRef<ScrollBehavior>('auto');

  // Get localized text (default to Chinese)
  const text = getReportText('zh');

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = copyResetTimerRef.current;
    return () => {
      if (sendToastTimerRef.current !== null) {
        window.clearTimeout(sendToastTimerRef.current);
      }
      Object.values(timers).forEach((timerId) => {
        if (timerId !== undefined) {
          window.clearTimeout(timerId);
        }
      });
    };
  }, []);

  // Set page title
  useEffect(() => {
    document.title = '问股 - DSA';
  }, []);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const {
    messages,
    loading,
    progressSteps,
    sessionId,
    sessions,
    sessionsLoading,
    chatError,
    loadSessions,
    loadInitialSession,
    switchSession,
    startStream,
    clearCompletionBadge,
  } = useAgentChatStore();

  const syncScrollState = useCallback(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    const nearBottom = isNearBottom({
      scrollTop: viewport.scrollTop,
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
    });
    shouldStickToBottomRef.current = nearBottom;
    setShowJumpToBottom((prev) => (nearBottom ? false : prev));
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const requestScrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    shouldStickToBottomRef.current = true;
    pendingScrollBehaviorRef.current = behavior;
    setShowJumpToBottom(false);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    syncScrollState();
  }, [syncScrollState]);

  useEffect(() => {
    syncScrollState();
  }, [syncScrollState, sessionId]);

  useEffect(() => {
    const behavior = pendingScrollBehaviorRef.current;
    const shouldAutoScroll = shouldStickToBottomRef.current;
    if (!shouldAutoScroll) {
      if (messages.length > 0 || progressSteps.length > 0 || loading) {
        setShowJumpToBottom(true);
      }
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollToBottom(behavior);
      pendingScrollBehaviorRef.current = loading ? 'auto' : 'smooth';
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, progressSteps, loading, sessionId, scrollToBottom]);

  useEffect(() => {
    if (!loading) {
      pendingScrollBehaviorRef.current = 'smooth';
    }
  }, [loading]);

  useEffect(() => {
    clearCompletionBadge();
  }, [clearCompletionBadge]);

  useEffect(() => {
    loadInitialSession();
  }, [loadInitialSession]);

  useEffect(() => {
    agentApi.getSkills()
      .then((res) => {
        setSkills(res.skills);
        const defaultId =
          res.default_skill_id ||
          res.skills[0]?.id ||
          '';
        setSelectedSkill(defaultId);
      })
      .catch((error) => {
        console.error('Failed to load chat skills:', error);
      });
  }, []);

  const availableSkillIds = new Set(skills.map((skill) => skill.id));
  const quickQuestions = QUICK_QUESTIONS.filter((question) => availableSkillIds.size === 0 || availableSkillIds.has(question.skill));
  const inlineSkills = skills.slice(0, 5);
  const skillMenuOptions = [
    { id: '', name: '通用分析', description: '' },
    ...skills,
  ];
  // If the selected skill is hidden from the inline row, surface it in the "more" trigger.
  const inlineSkillIds = new Set(['', ...inlineSkills.map((skill) => skill.id)]);
  const selectedOverflowSkill = skills.find(
    (skill) => skill.id === selectedSkill && !inlineSkillIds.has(skill.id)
  );

  useEffect(() => {
    if (!showSkillMenu) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!skillMenuRef.current?.contains(event.target as Node)) {
        setShowSkillMenu(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [showSkillMenu]);

  useEffect(() => {
    if (!openSessionMenuId) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!sessionMenuRef.current?.contains(event.target as Node)) {
        setOpenSessionMenuId(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [openSessionMenuId]);

  const handleStartNewChat = useCallback(() => {
    setFollowUpContext(null);
    setFollowUpInputPlaceholder(null);
    setOpenSessionMenuId(null);
    requestScrollToBottom('auto');
    useAgentChatStore.getState().startNewChat();
    setSidebarOpen(false);
  }, [requestScrollToBottom]);

  const handleSwitchSession = useCallback((targetSessionId: string) => {
    setOpenSessionMenuId(null);
    requestScrollToBottom('auto');
    switchSession(targetSessionId);
    setSidebarOpen(false);
  }, [requestScrollToBottom, switchSession]);

  const confirmDelete = useCallback(() => {
    if (!deleteConfirmId) return;
    agentApi.deleteChatSession(deleteConfirmId)
      .then(() => {
        loadSessions();
        if (deleteConfirmId === sessionId) {
          handleStartNewChat();
        }
      })
      .catch((error) => {
        console.error('Failed to delete chat session:', error);
      });
    setDeleteConfirmId(null);
  }, [deleteConfirmId, sessionId, loadSessions, handleStartNewChat]);

  // Handle follow-up from report page: ?stock=600519&name=贵州茅台&recordId=xxx
  useEffect(() => {
    const stock = sanitizeFollowUpStockCode(searchParams.get('stock'));
    const name = sanitizeFollowUpStockName(searchParams.get('name'));
    const recordId = parseFollowUpRecordId(searchParams.get('recordId'));

    if (!stock) {
      setSearchParams({}, { replace: true });
      return;
    }

    const hydrationToken = ++followUpHydrationTokenRef.current;
    setInput('');
    setFollowUpInputPlaceholder(
      recordId !== undefined ? buildFollowUpInputPlaceholder(stock, name) : null,
    );
    setFollowUpContext({
      stock_code: stock,
      stock_name: name,
      chat_mode: recordId !== undefined ? 'report_interpret' : 'standard',
      record_id: recordId,
    });
    if (recordId !== undefined) {
      setIsFollowUpContextLoading(true);
    }
    void resolveChatFollowUpContext({
      stockCode: stock,
      stockName: name,
      recordId,
    }).then((context) => {
      if (!isMountedRef.current || followUpHydrationTokenRef.current !== hydrationToken) {
        return;
      }
      setFollowUpContext(context);
    }).finally(() => {
      if (isMountedRef.current && followUpHydrationTokenRef.current === hydrationToken) {
        setIsFollowUpContextLoading(false);
      }
    });
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleSend = useCallback(
    async (
      overrideMessage?: string,
      overrideSkill?: string,
      overrideChatMode?: ChatMode,
    ) => {
      const msgText = overrideMessage || input.trim();
      if (!msgText || loading) return;
      const usedSkill = overrideSkill || selectedSkill;
      const usedSkillName =
        skills.find((s) => s.id === usedSkill)?.name ||
        (usedSkill ? usedSkill : '通用');

      const isReportInterpret =
        followUpContext?.record_id !== undefined
        && (overrideChatMode ?? followUpContext.chat_mode ?? 'report_interpret') !== 'incremental';

      const contextPayload = followUpContext
        ? {
            ...followUpContext,
            chat_mode: overrideChatMode ?? followUpContext.chat_mode ?? 'report_interpret',
          }
        : undefined;

      const payload = {
        message: msgText,
        session_id: sessionId,
        skills: isReportInterpret ? undefined : (usedSkill ? [usedSkill] : undefined),
        context: contextPayload,
      };

      setInput('');
      requestScrollToBottom('smooth');
      await startStream(payload, {
        skillName: isReportInterpret ? '报告解读' : usedSkillName,
      });
    },
    [input, loading, requestScrollToBottom, selectedSkill, skills, sessionId, startStream, followUpContext],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickQuestion = (q: (typeof QUICK_QUESTIONS)[0]) => {
    setSelectedSkill(q.skill);
    handleSend(q.label, q.skill);
  };

  const isReportFollowUp =
    followUpContext?.record_id !== undefined
    && followUpContext.chat_mode !== 'incremental';

  const followUpDisplayName = followUpContext
    ? formatFollowUpDisplayName(followUpContext.stock_code, followUpContext.stock_name)
    : '';

  const handleFollowUpQuickQuestion = (question: (typeof REPORT_FOLLOW_UP_QUICK_QUESTIONS)[0]) => {
    const message = question.buildMessage(followUpDisplayName);
    handleSend(message, '', question.chat_mode);
  };

  const showSendFeedback = useCallback((nextToast: { type: 'success' | 'error'; message: string }, durationMs: number) => {
    if (sendToastTimerRef.current !== null) {
      window.clearTimeout(sendToastTimerRef.current);
    }
    setSendToast(nextToast);
    sendToastTimerRef.current = window.setTimeout(() => {
      setSendToast(null);
      sendToastTimerRef.current = null;
    }, durationMs);
  }, []);

  const toggleThinking = (msgId: string) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const copyMessageToClipboard = async (msgId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessages((prev) => new Set(prev).add(msgId));
      const existingTimer = copyResetTimerRef.current[msgId];
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }
      copyResetTimerRef.current[msgId] = window.setTimeout(() => {
        setCopiedMessages((prev) => {
          const next = new Set(prev);
          next.delete(msgId);
          return next;
        });
        delete copyResetTimerRef.current[msgId];
      }, 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const downloadMessageAsMarkdown = useCallback((msg: Message) => {
    const heading = msg.role === 'user' ? '# 用户消息' : `# AI 回复${msg.skillName ? ` · ${msg.skillName}` : ''}`;
    const content = [heading, '', msg.content].join('\n');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${msg.role === 'user' ? 'user' : 'assistant'}-message-${msg.id}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, []);

  const getCurrentStage = (steps: ProgressStep[]): string => {
    if (steps.length === 0) return '正在连接...';
    const last = steps[steps.length - 1];
    if (last.type === 'thinking') return last.message || 'AI 正在思考...';
    if (last.type === 'tool_start')
      return `${last.display_name || last.tool}...`;
    if (last.type === 'tool_done')
      return `${last.display_name || last.tool} 完成`;
    if (last.type === 'generating')
      return last.message || '正在生成最终分析...';
    return '处理中...';
  };

  const renderThinkingBlock = (msg: Message) => {
    if (!msg.thinkingSteps || msg.thinkingSteps.length === 0) return null;
    const isExpanded = expandedThinking.has(msg.id);
    const toolSteps = msg.thinkingSteps.filter((s) => s.type === 'tool_done');
    const totalDuration = toolSteps.reduce(
      (sum, s) => sum + (s.duration || 0),
      0,
    );
    const summary = `${toolSteps.length} 个工具调用 · ${totalDuration.toFixed(1)}s`;

    return (
      <button
        onClick={() => toggleThinking(msg.id)}
        className="flex items-center gap-2 text-xs text-muted-text hover:text-secondary-text transition-colors mb-2 w-full text-left"
      >
        <svg
          className={`w-3 h-3 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        <span className="flex items-center gap-1.5">
          <span className="opacity-60">思考过程</span>
          <span className="text-muted-text/50">·</span>
          <span className="opacity-50">{summary}</span>
        </span>
      </button>
    );
  };

  const renderThinkingDetails = (steps: ProgressStep[]) => (
    <div className="mb-3 pl-5 border-l border-border/40 space-y-1.5 animate-fade-in">
      {steps.map((step, idx) => {
        let statusClass = 'chat-progress-item-muted';
        let iconClass = 'chat-progress-dot-muted';
        let text = '';
        if (step.type === 'thinking') {
          text = step.message || `第 ${step.step} 步：思考`;
          statusClass = 'chat-progress-item-thinking';
          iconClass = 'chat-progress-dot-thinking';
        } else if (step.type === 'tool_start') {
          text = `${step.display_name || step.tool}...`;
          statusClass = 'chat-progress-item-tool';
          iconClass = 'chat-progress-dot-tool';
        } else if (step.type === 'tool_done') {
          text = `${step.display_name || step.tool} (${step.duration}s)`;
          statusClass = step.success ? 'chat-progress-item-success' : 'chat-progress-item-danger';
          iconClass = step.success ? 'chat-progress-dot-success' : 'chat-progress-dot-danger';
        } else if (step.type === 'generating') {
          text = step.message || '生成分析';
          statusClass = 'chat-progress-item-generating';
          iconClass = 'chat-progress-dot-generating';
        }
        return (
          <div
            key={idx}
            className={cn('chat-progress-item', statusClass)}
          >
            <span className={cn('chat-progress-dot', iconClass)} />
            <span className="leading-relaxed">{text}</span>
          </div>
        );
      })}
    </div>
  );

  const sidebarContent = (
    <>
      {/* <div className="flex items-center justify-between border-b border-white/5 bg-white/2 p-3.5">
        <h2 className="text-sm font-semibold text-cyan uppercase tracking-[0.2em] flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          历史对话
        </h2>
        <button
          onClick={handleStartNewChat}
          className="rounded-lg p-1.5 text-muted-text transition-all hover:bg-white/10 hover:text-foreground"
          aria-label="开启新对话"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div> */}
      <button
      onClick={handleStartNewChat}
      className='flex py-5 px-6 gap-2 items-center bg-[var(--bg-card)] rounded-lg'>
        <span
          className="[&_svg]:block [&_svg]:h-7 [&_svg]:w-7"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: NewConversationIconSvg }}
        />
        <span className='text-while'>新对话</span>
      </button>
      <ScrollArea testId="chat-session-list-scroll" viewportClassName="py-3">
        {sessionsLoading ? (
          <DashboardStateBlock
            loading
            compact
            title="加载对话中..."
            className="rounded-2xl border border-dashed border-border/50 bg-surface/30"
          />
        ) : sessions.length === 0 ? (
          <DashboardStateBlock
            compact
            title="暂无历史对话"
            description="开始提问后，这里会保留会话记录。"
            className="rounded-2xl border border-dashed border-border/50 bg-surface/30"
          />
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.session_id}
                className={cn(
                  'session-item-row',
                  s.session_id === sessionId && 'active',
                  openSessionMenuId === s.session_id && 'menu-open',
                )}
                ref={openSessionMenuId === s.session_id ? sessionMenuRef : undefined}
              >
                <button
                  type="button"
                  onClick={() => handleSwitchSession(s.session_id)}
                  className="session-item"
                  aria-label={`切换到对话 ${s.title}`}
                  aria-current={s.session_id === sessionId ? 'page' : undefined}
                >
                  {/* <div className="indicator" /> */}
                  <div className="content flex items-center gap-1">
                    <span
                      className="[&_svg]:block [&_svg]:h-6 [&_svg]:w-6 text-secondary"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: ConversationIconSvg }}
                    />
                    <span className={`title block truncate`}>{s.title}</span>
                    {/* <div className="mt-0.5 flex items-center gap-2">
                      <span className="meta">
                        {s.message_count} 条对话
                      </span>
                      {s.last_active && (
                        <>
                          <span className="separator" />
                          <span className="meta">
                            {new Date(s.last_active).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                          </span>
                        </>
                      )}
                    </div> */}
                  </div>
                </button>
                <div className="session-item-actions">
                  <button
                    type="button"
                    className="session-item-more-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenSessionMenuId((current) => (
                        current === s.session_id ? null : s.session_id
                      ));
                    }}
                    aria-label={`更多操作 ${s.title}`}
                    aria-expanded={openSessionMenuId === s.session_id}
                    aria-haspopup="menu"
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="5" cy="12" r="1.6" />
                      <circle cx="12" cy="12" r="1.6" />
                      <circle cx="19" cy="12" r="1.6" />
                    </svg>
                  </button>
                  {openSessionMenuId === s.session_id ? (
                    <div className="session-item-menu" role="menu" aria-label={`会话操作 ${s.title}`}>
                      <button
                        type="button"
                        className="session-item-menu-delete"
                        role="menuitem"
                        onClick={() => {
                          setDeleteConfirmId(s.session_id);
                          setOpenSessionMenuId(null);
                        }}
                        aria-label={`删除对话 ${s.title}`}
                      >
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 7V5.4C9 4.63 9.63 4 10.4 4h3.2c.77 0 1.4.63 1.4 1.4V7" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18 7l-.72 11.2A2 2 0 0115.28 20H8.72a2 2 0 01-2-1.8L6 7" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 11v5M14 11v5" />
                        </svg>
                        <span>删除</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </>
  );

  return (
    <div
      data-testid="chat-workspace"
      className="flex h-full w-full min-w-0 gap-4 overflow-hidden"
    >
      {/* Desktop sidebar */}
      <div className="hidden h-full w-64 flex-shrink-0 flex-col overflow-hidden md:flex">
        {sidebarContent}
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="page-drawer-overlay absolute inset-0" />
          <div
            className="absolute left-0 top-0 bottom-0 w-72 flex flex-col glass-card overflow-hidden border-r border-white/10 bg-card/90 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteConfirmId)}
        title="删除对话"
        message="删除后，该对话将不可恢复，确认删除吗？"
        confirmText="删除"
        cancelText="取消"
        isDanger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {/* Main chat area */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden border border-1 border-[hsl(var(--card))] rounded-lg">
        <header className="mb-4 flex-shrink-0 space-y-3 p-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-hover transition-colors text-secondary-text hover:text-foreground"
                aria-label="历史对话"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
              <svg
                className="w-6 h-6 text-cyan"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              问股
            </h1>
            {messages.length > 0 && (
              <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
                <Tooltip content="导出会话为 Markdown 文件">
                  <span className="inline-flex">
                    <Button
                      variant="action-primary"
                      size="sm"
                      onClick={() => downloadSession(messages)}
                      aria-label="导出会话为 Markdown 文件"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      导出会话
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip content="发送到已配置的通知机器人/邮箱">
                  <span className="inline-flex">
                    <Button
                      variant="action-primary"
                      size="sm"
                      disabled={sending}
                      onClick={async () => {
                        if (sending) return;
                        setSending(true);
                        setSendToast(null);
                        try {
                          const content = formatSessionAsMarkdown(messages);
                          await agentApi.sendChat(content);
                          showSendFeedback({ type: 'success', message: '已发送到通知渠道' }, 3000);
                        } catch (err) {
                          const parsed = getParsedApiError(err);
                          showSendFeedback({
                            type: 'error',
                            message: parsed.message || '发送失败',
                          }, 5000);
                        } finally {
                          setSending(false);
                        }
                      }}
                      aria-label="发送到已配置的通知机器人/邮箱"
                    >
                      {sending ? (
                        <svg
                          className="w-4 h-4 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                          />
                        </svg>
                      )}
                      发送
                    </Button>
                  </span>
                </Tooltip>
              </div>
            )}
          </div>
          <p className="text-secondary-text text-sm">
            向 AI 询问个股分析，获取基于技能视角的交易建议与实时决策报告。
          </p>
          {sendToast ? (
            <InlineAlert
              variant={sendToast.type === 'success' ? 'success' : 'danger'}
              title={sendToast.type === 'success' ? '发送成功' : '发送失败'}
              message={sendToast.message}
              className="max-w-md rounded-xl px-3 py-2 text-xs shadow-none"
            />
          ) : null}
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <ScrollArea
            className="relative z-10 flex-1"
            viewportRef={messagesViewportRef}
            onScroll={handleMessagesScroll}
            viewportClassName="space-y-6 p-4 md:p-6"
            testId="chat-message-scroll"
          >
            {messages.length === 0 && !loading ? (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  title={isReportFollowUp ? '基于报告继续追问' : '开始问股'}
                  description={
                    isReportFollowUp
                      ? `将基于首页分析报告解读 ${followUpDisplayName}，不会重复跑完整分析。可选下方快捷问题，或自行输入追问。`
                      : '输入「分析 600519」或「茅台现在能买吗」，AI 将调用实时数据工具为您生成决策报告。'
                  }
                  className="max-w-2xl border-dashed bg-card/55"
                  icon={(
                    <svg
                      className="h-8 w-8"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  )}
                  action={(
                    <div className="flex max-w-lg flex-wrap justify-center gap-2">
                      {isReportFollowUp
                        ? REPORT_FOLLOW_UP_QUICK_QUESTIONS.map((question) => (
                            <button
                              key={question.id}
                              type="button"
                              onClick={() => handleFollowUpQuickQuestion(question)}
                              className="quick-question-btn"
                            >
                              {question.label}
                            </button>
                          ))
                        : quickQuestions.map((q, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleQuickQuestion(q)}
                              className="quick-question-btn"
                            >
                              {q.label}
                            </button>
                          ))}
                    </div>
                  )}
                />
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold shadow-sm transition-all',
                      msg.role === 'user' ? 'chat-avatar-user' : 'chat-avatar-ai'
                    )}
                  >
                    {msg.role === 'user' ? 'U' : 'AI'}
                  </div>
                  <div
                    className={cn(
                      'group/message min-w-0 w-fit max-w-[min(100%,48rem)] overflow-hidden px-5 py-2 transition-colors',
                      msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'
                    )}
                  >
                    {msg.role === 'assistant' && msg.skillName && (
                      <div className="mb-2">
                        <Badge variant="info" className="chat-skill-badge shadow-none" aria-label={`技能 ${msg.skillName}`}>
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                          {msg.skillName}
                        </Badge>
                      </div>
                    )}
                    {msg.role === 'assistant' && renderThinkingBlock(msg)}
                    {msg.role === 'assistant' &&
                      expandedThinking.has(msg.id) &&
                      msg.thinkingSteps &&
                      renderThinkingDetails(msg.thinkingSteps)}
                    {msg.role === 'assistant' ? (
                      <div className="relative">
                        <div className="chat-message-actions">
                          <button
                            type="button"
                            onClick={() => copyMessageToClipboard(msg.id, msg.content)}
                            className="chat-copy-btn"
                            aria-label={copiedMessages.has(msg.id) ? text.copied : text.copy}
                          >
                            {copiedMessages.has(msg.id) ? text.copied : text.copy}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadMessageAsMarkdown(msg)}
                            className="chat-copy-btn"
                            aria-label="导出此条消息为 Markdown"
                          >
                            导出
                          </button>
                        </div>
                        <div className="chat-prose pr-20 sm:pr-24">
                          <Markdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </Markdown>
                        </div>
                      </div>
                    ) : (
                      msg.content
                        .split('\n')
                        .map((line, i) => (
                          <p
                            key={i}
                            className="mb-1 last:mb-0 leading-relaxed"
                          >
                            {line || '\u00A0'}
                          </p>
                        ))
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-elevated text-foreground flex items-center justify-center flex-shrink-0 text-xs font-bold">
                  AI
                </div>
                <div className="min-w-[200px] max-w-[min(100%,48rem)] overflow-hidden rounded-2xl rounded-tl-sm border border-white/6 bg-card/72 px-5 py-4">
                  <div className="flex items-center gap-2.5 text-sm text-secondary-text">
                    <div className="relative w-4 h-4 flex-shrink-0">
                      <div className="absolute inset-0 rounded-full border-2 border-cyan/20" />
                      <div className="absolute inset-0 rounded-full border-2 border-cyan border-t-transparent animate-spin" />
                    </div>
                    <span className="text-secondary-text">
                      {getCurrentStage(progressSteps)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </ScrollArea>

          {showJumpToBottom && (
            <div className="pointer-events-none absolute bottom-[5.75rem] right-4 z-20 md:bottom-24 md:right-6">
              <button
                type="button"
                className="pointer-events-auto chat-copy-btn shadow-soft-card"
                onClick={() => {
                  requestScrollToBottom('smooth');
                  scrollToBottom('smooth');
                }}
                aria-label="查看最新消息"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
                有新消息
              </button>
            </div>
          )}

          {/* Input area */}
          <div className="p-4 md:p-6 relative z-20">
            <div className="space-y-3">
              {chatError ? <ApiErrorAlert error={chatError} /> : null}
              {isFollowUpContextLoading ? (
                <InlineAlert
                  variant="info"
                  title="追问上下文加载中"
                  message="正在加载首页分析报告；可直接选择快捷问题或输入追问。"
                  className="rounded-xl px-3 py-2 text-xs shadow-none"
                />
              ) : null}
              <div className="chat-input-panel">
                {skills.length > 0 && (
                  <div className="chat-input-skill-row">
                    <div className="chat-input-skill-options">
                      <span className="chat-input-skill-label">
                        策略
                      </span>
                      <label className="chat-skill-inline-option">
                        <input
                          type="radio"
                          name="skill"
                          value=""
                          checked={selectedSkill === ''}
                          onChange={() => setSelectedSkill('')}
                          className="chat-skill-radio"
                        />
                        <span>通用分析</span>
                      </label>
                      {inlineSkills.map((s) => (
                        <label
                          key={s.id}
                          className="chat-skill-inline-option"
                        >
                          <input
                            type="radio"
                            name="skill"
                            value={s.id}
                            checked={selectedSkill === s.id}
                            onChange={() => setSelectedSkill(s.id)}
                            className="chat-skill-radio"
                          />
                          <span>{s.name}</span>
                        </label>
                      ))}
                    </div>

                    <div ref={skillMenuRef} className="chat-skill-menu-anchor">
                      <button
                        type="button"
                        className={cn('chat-skill-more-button', selectedOverflowSkill && 'has-overflow-selection')}
                        onClick={() => setShowSkillMenu((open) => !open)}
                        aria-haspopup="listbox"
                        aria-expanded={showSkillMenu}
                      >
                        <span>{selectedOverflowSkill?.name ?? '更多'}</span>
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </button>

                      {showSkillMenu && (
                        <div className="chat-skill-menu -translate-y-6" role="listbox" aria-label="选择分析策略">
                          {skillMenuOptions.map((skill) => {
                            const isSelected = selectedSkill === skill.id;
                            return (
                              <button
                                key={skill.id || 'general'}
                                type="button"
                                className={cn('chat-skill-menu-item', isSelected && 'is-selected')}
                                onClick={() => {
                                  setSelectedSkill(skill.id);
                                  setShowSkillMenu(false);
                                }}
                                role="option"
                                aria-selected={isSelected}
                              >
                                <span className="chat-skill-menu-title">
                                  <span className={cn('chat-skill-menu-radio', isSelected && 'is-selected')} />
                                  <span>{skill.name}</span>
                                </span>
                                {skill.description ? (
                                  <span className="chat-skill-menu-desc">
                                    {skill.description}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="chat-input-field-row">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      followUpInputPlaceholder
                        ?? '例如：分析 600519 / 茅台现在适合买入吗？ (Enter 发送, Shift+Enter 换行)'
                    }
                    disabled={loading}
                    rows={1}
                    className="chat-input-textarea"
                    style={{ height: 'auto' }}
                    onInput={(e) => {
                      const t = e.target as HTMLTextAreaElement;
                      t.style.height = 'auto';
                      t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
                    }}
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || loading}
                  isLoading={loading}
                  className="btn-primary chat-input-send-button"
                >
                  发送
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
