import type React from 'react';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import loginBgDark from '../assets/login-bg-dark.png';
import loginBg from '../assets/login-bg.png';
import loginLogo from '../assets/login-logo.png';
import type { ParsedApiError } from '../api/error';
import { isParsedApiError } from '../api/error';
import { Button, Input } from '../components/common';
import { SettingsAlert } from '../components/settings';
import { useAuth } from '../hooks';

const LoginPage: React.FC = () => {
  const { login, register, passwordSet, setupState } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [registerMode, setRegisterMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | ParsedApiError | null>(null);

  const isRegistering = registerMode;
  const rawRedirect = searchParams.get('redirect') ?? '';
  const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';

  useEffect(() => {
    document.title = '登录 - DSA';
  }, []);

  useEffect(() => {
    if (setupState === 'no_password' || !passwordSet) {
      console.error('Admin password is not initialized.');
    }
  }, [passwordSet, setupState]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const usernameValue = username.trim();
    if (!usernameValue) {
      setError('用户名不能为空');
      return;
    }
    if (isRegistering && password !== passwordConfirm) {
      setError('两次输入的密码不一致');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = isRegistering
        ? await register(usernameValue, password, passwordConfirm)
        : await login(password, undefined, usernameValue);

      if (result.success) {
        navigate(redirect, { replace: true });
      } else {
        setError(result.error ?? '登录失败');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleRegisterMode = () => {
    setRegisterMode((value) => !value);
    setError(null);
    setPassword('');
    setPasswordConfirm('');
    if (!registerMode && username === 'admin') {
      setUsername('');
    }
  };

  const title = isRegistering ? '新用户注册' : '欢迎登录';
  const description = isRegistering
    ? '使用用户名注册独立账号，数据会与其他用户隔离。'
    : '每日股票分析引擎';
  const inputClassName =
    'h-[52px] rounded-full pl-12 pr-12 text-sm font-medium shadow-none';

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[var(--login-bg-main)] px-5 py-10 font-sans selection:bg-[var(--login-accent-soft)] sm:px-8 lg:px-12">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat dark:hidden"
        style={{ backgroundImage: `url(${loginBg})` }}
      />
      <div
        className="absolute inset-0 z-0 hidden bg-cover bg-center bg-no-repeat dark:block"
        style={{ backgroundImage: `url(${loginBgDark})` }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[1440px] items-center justify-center lg:justify-end lg:pr-[7vw] xl:pr-[9vw]">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="relative w-full max-w-[500px] overflow-hidden rounded-2xl border border-[var(--login-border-card)] p-8 shadow-[0_24px_64px_rgba(0,0,0,0.22)] backdrop-blur-xl dark:shadow-[0_24px_64px_rgba(0,0,0,0.34)] sm:p-9"
        >
          <div className="absolute inset-0 z-0 bg-white/50 dark:bg-[#161922]/50" />
          <div className="relative z-10">
            {isRegistering ? (
              <div className="mb-7 space-y-2.5">
                <h1 className="text-[28px] font-bold leading-none tracking-normal text-[var(--login-text-primary)]">
                  {title}
                </h1>
                <p className="text-sm font-bold leading-normal text-[var(--login-text-muted)]">{description}</p>
              </div>
            ) : (
              <div className="mb-7 space-y-3">
                <div className="flex items-center gap-2.5">
                  <img src={loginLogo} alt="" className="h-11 w-11" />
                  <span className="text-[28px] font-bold leading-none tracking-normal text-[var(--login-text-primary)]">DSA</span>
                </div>
                <div className="flex items-end justify-between gap-4">
                  <h1 className="text-[28px] font-bold leading-none tracking-normal text-[var(--login-text-primary)]">
                    {title}
                  </h1>
                  <p className="pb-0.5 text-sm font-bold leading-none text-[var(--login-text-muted)]">{description}</p>
                </div>
              </div>
            )}

          <form onSubmit={handleSubmit} className="space-y-7">
            <div className="space-y-3.5">
              <Input
                id="username"
                type="text"
                appearance="login"
                iconType="user"
                aria-label="用户名"
                placeholder="请输入用户名"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={isSubmitting}
                autoFocus
                autoComplete="username"
                className={inputClassName}
              />

              <Input
                id="password"
                type="password"
                appearance="login"
                allowTogglePassword
                iconType="password"
                aria-label="密码"
                placeholder="请输入密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                autoComplete={isRegistering ? 'new-password' : 'current-password'}
                className={inputClassName}
              />

              {isRegistering && (
                <Input
                  id="passwordConfirm"
                  type="password"
                  appearance="login"
                  allowTogglePassword
                  iconType="password"
                  aria-label="确认密码"
                  placeholder="再次输入密码"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  disabled={isSubmitting}
                  autoComplete="new-password"
                  className={inputClassName}
                />
              )}

              {/* {!isRegistering && (
                <div className="flex justify-end py-1">
                  <button
                    type="button"
                    className="text-sm font-bold leading-none text-[var(--login-text-muted)] transition-colors hover:text-[var(--login-text-primary)]"
                  >
                    忘记密码？
                  </button>
                </div>
              )} */}
            </div>

            {error && (
              <SettingsAlert
                title={isRegistering ? '提交失败' : '验证未通过'}
                message={isParsedApiError(error) ? error.message : error}
                variant="error"
                className="!border-[var(--login-error-border)] !bg-[var(--login-error-bg)] !text-[var(--login-error-text)]"
              />
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="h-[52px] w-full rounded-full border-0 bg-[#00a1c2] text-base font-bold text-white shadow-[0_18px_26px_rgba(0,161,194,0.22)] transition-colors hover:bg-[#10b4d3]"
              disabled={isSubmitting}
            >
              <span className="flex items-center justify-center gap-2">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting
                  ? isRegistering
                    ? '正在创建用户...'
                    : '正在登录...'
                  : isRegistering
                    ? '注册并登录'
                    : '登录'}
              </span>
            </Button>
          </form>

          <button
            type="button"
            className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-full border-0 bg-transparent text-base font-bold text-primary outline-none ring-0 transition-colors hover:text-primary/80 focus:outline-none focus:ring-0"
            onClick={toggleRegisterMode}
            disabled={isSubmitting}
          >
            {isRegistering ? (
              <span className="text-[var(--login-text-muted)]">
                已有账号？ <span className="text-primary">立即登录</span>
              </span>
            ) : (
              '注册'
            )}
          </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
