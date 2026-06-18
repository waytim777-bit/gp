import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@heroui/react/card';
import { profileApi } from '../api/profile';
import { getParsedApiError, createParsedApiError, type ParsedApiError } from '../api/error';
import { ApiErrorAlert, Button, Input, InlineAlert } from '../components/common';
import { ChangePasswordCard } from '../components/settings/ChangePasswordCard';
import { useAuth } from '../contexts/AuthContext';
import { readImageFileAsDataUrl, resolveUserAvatarUrl } from '../utils/userAvatar';

const ProfilePage: React.FC = () => {
  const { currentUser, refreshStatus } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState<ParsedApiError | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isAdminAccount, setIsAdminAccount] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await profileApi.get();
      setUsername(profile.username);
      setAvatarPreview(profile.avatarUrl ?? null);
      setPendingAvatar(undefined);
      setIsAdminAccount(profile.accountType === 'admin');
    } catch (err) {
      setError(getParsedApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = '个人中心 - DSA';
    void loadProfile();
  }, [loadProfile]);

  const displayAvatar = useMemo(() => {
    if (!currentUser) {
      return '';
    }
    if (pendingAvatar !== undefined) {
      if (pendingAvatar === null) {
        return resolveUserAvatarUrl(currentUser.id, username || currentUser.username);
      }
      return pendingAvatar;
    }
    return resolveUserAvatarUrl(
      currentUser.id,
      username || currentUser.username,
      avatarPreview,
    );
  }, [avatarPreview, currentUser, pendingAvatar, username]);

  const handlePickAvatar = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setError(null);
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setPendingAvatar(dataUrl);
    } catch (err) {
      setError(getParsedApiError(err));
    }
  }, []);

  const handleResetAvatar = useCallback(() => {
    setPendingAvatar(null);
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (isAdminAccount) {
      return;
    }
    const nextUsername = username.trim();
    if (!nextUsername) {
      setError(createParsedApiError({ title: '保存失败', message: '请输入昵称' }));
      return;
    }
    setSavingProfile(true);
    setError(null);
    setSuccessMessage('');
    try {
      const payload: {
        username?: string;
        avatarUrl?: string | null;
        clearAvatar?: boolean;
      } = {};
      if (nextUsername !== currentUser?.username) {
        payload.username = nextUsername;
      }
      if (pendingAvatar === null) {
        payload.clearAvatar = true;
      } else if (typeof pendingAvatar === 'string') {
        payload.avatarUrl = pendingAvatar;
      }
      if (!payload.username && payload.avatarUrl === undefined && !payload.clearAvatar) {
        setSuccessMessage('没有需要保存的修改');
        return;
      }
      const updated = await profileApi.update(payload);
      setUsername(updated.username);
      setAvatarPreview(updated.avatarUrl ?? null);
      setPendingAvatar(undefined);
      await refreshStatus();
      setSuccessMessage('资料已更新');
    } catch (err) {
      setError(getParsedApiError(err));
    } finally {
      setSavingProfile(false);
    }
  }, [currentUser?.username, isAdminAccount, pendingAvatar, refreshStatus, username]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">个人中心</h1>
        <p className="mt-1 text-sm text-muted-text">管理昵称、头像与登录密码。</p>
      </div>

      {error ? <ApiErrorAlert error={error} onDismiss={() => setError(null)} /> : null}
      {successMessage ? <InlineAlert variant="success" message={successMessage} /> : null}

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-text">加载中...</div>
      ) : (
        <>
          <Card className="border border-default-200 bg-surface/80 p-5">
            <h2 className="text-lg font-semibold text-foreground">基本资料</h2>
            <p className="mt-1 text-sm text-muted-text">
              {isAdminAccount ? '管理员账号昵称固定为 admin。' : '修改后将同步到全站展示。'}
            </p>

            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex flex-col items-center gap-3">
                <img
                  src={displayAvatar}
                  alt=""
                  className="h-24 w-24 rounded-full border border-default-200 object-cover"
                />
                {!isAdminAccount ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      上传头像
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleResetAvatar}>
                      恢复默认
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => void handlePickAvatar(event)}
                    />
                  </div>
                ) : null}
              </div>

              <div className="min-w-0 flex-1 space-y-4">
                <Input
                  id="profile-username"
                  label="昵称"
                  placeholder="输入昵称"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={isAdminAccount || savingProfile}
                  autoComplete="username"
                />
                {!isAdminAccount ? (
                  <Button
                    variant="primary"
                    isLoading={savingProfile}
                    onClick={() => void handleSaveProfile()}
                  >
                    保存资料
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          <ChangePasswordCard
            description={
              isAdminAccount
                ? '更新管理员登录密码。修改成功后，后续登录请使用新密码。'
                : '更新当前账号登录密码。修改成功后，后续登录请使用新密码。'
            }
            successMessage={isAdminAccount ? '管理员密码已更新。' : '密码已更新。'}
          />
        </>
      )}
    </div>
  );
};

export default ProfilePage;
