import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@heroui/react';
import { profileApi } from '../../api/profile';
import { createParsedApiError, getParsedApiError, isParsedApiError, type ParsedApiError } from '../../api/error';
import { Button, Input, InlineAlert } from '../common';
import { useAuth } from '../../contexts/AuthContext';
import { readImageFileAsDataUrl, resolveUserAvatarUrl } from '../../utils/userAvatar';

type ProfileDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const ProfileDialog: React.FC<ProfileDialogProps> = ({ isOpen, onOpenChange }) => {
  const { currentUser, refreshStatus, changePassword } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<string | null | undefined>(undefined);
  const [isAdminAccount, setIsAdminAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<ParsedApiError | null>(null);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | ParsedApiError | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setProfileError(null);
    setProfileSuccess('');
    try {
      const profile = await profileApi.get();
      setUsername(profile.username);
      setAvatarPreview(profile.avatarUrl ?? null);
      setPendingAvatar(undefined);
      setIsAdminAccount(profile.accountType === 'admin');
    } catch (err) {
      setProfileError(getParsedApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadProfile();
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setPasswordError(null);
      setPasswordSuccess('');
    }
  }, [isOpen, loadProfile]);

  const displayAvatar = useMemo(() => {
    if (!currentUser) {
      return '';
    }
    if (pendingAvatar !== undefined) {
      return pendingAvatar === null
        ? resolveUserAvatarUrl(currentUser.id, username || currentUser.username)
        : pendingAvatar;
    }
    return resolveUserAvatarUrl(currentUser.id, username || currentUser.username, avatarPreview);
  }, [avatarPreview, currentUser, pendingAvatar, username]);

  const handlePickAvatar = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setProfileError(null);
    setProfileSuccess('');
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setPendingAvatar(dataUrl);
    } catch (err) {
      setProfileError(getParsedApiError(err));
    }
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (isAdminAccount) {
      return;
    }
    const nextUsername = username.trim();
    if (!nextUsername) {
      setProfileError(createParsedApiError({ title: '保存失败', message: '请输入昵称' }));
      return;
    }
    setSavingProfile(true);
    setProfileError(null);
    setProfileSuccess('');
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
        setProfileSuccess('没有需要保存的修改');
        return;
      }
      const updated = await profileApi.update(payload);
      setUsername(updated.username);
      setAvatarPreview(updated.avatarUrl ?? null);
      setPendingAvatar(undefined);
      await refreshStatus();
      setProfileSuccess('资料已更新');
    } catch (err) {
      setProfileError(getParsedApiError(err));
    } finally {
      setSavingProfile(false);
    }
  }, [currentUser?.username, isAdminAccount, pendingAvatar, refreshStatus, username]);

  const handleSavePassword = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess('');
    if (!currentPassword.trim()) {
      setPasswordError('请输入当前密码');
      return;
    }
    if (!newPassword.trim()) {
      setPasswordError('请输入新密码');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('新密码至少 6 位');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }

    setSavingPassword(true);
    try {
      const result = await changePassword(currentPassword, newPassword, newPasswordConfirm);
      if (result.success) {
        setCurrentPassword('');
        setNewPassword('');
        setNewPasswordConfirm('');
        setPasswordSuccess(isAdminAccount ? '管理员密码已更新' : '密码已更新');
      } else {
        setPasswordError(result.error ?? '修改失败');
      }
    } finally {
      setSavingPassword(false);
    }
  }, [changePassword, currentPassword, isAdminAccount, newPassword, newPasswordConfirm]);

  const passwordErrorMessage = passwordError
    ? isParsedApiError(passwordError)
      ? passwordError.message
      : passwordError
    : '';

  return (
    <Modal.Root isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop variant="blur">
        <Modal.Container size="lg" placement="center">
          <Modal.Dialog className="flex max-h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-[560px] flex-col rounded-[20px] bg-elevated p-5 text-foreground shadow-2xl sm:p-6">
            <Modal.Header className="mb-5 p-0">
              <div className="min-w-0">
                <Modal.Heading className="text-xl font-bold leading-none">个人中心</Modal.Heading>
                <p className="mt-2 text-sm leading-none text-muted-text">管理昵称、头像与登录密码</p>
              </div>
              <Modal.CloseTrigger className="text-muted-text transition-colors hover:text-foreground" />
            </Modal.Header>

            <Modal.Body className="min-h-0 overflow-y-auto p-0 pr-1">
              {loading ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-text">加载中...</div>
              ) : (
                <div className="flex flex-col gap-7">
                  <section className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-base font-bold leading-none text-foreground">基本资料</h3>
                      <p className="text-sm leading-none text-muted-text">
                        {isAdminAccount ? '管理员账号昵称固定为 admin' : '修改后将同步到全站展示'}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--border-dim)] p-4">
                      <div className="flex flex-col gap-5 sm:flex-row">
                        <div className="flex shrink-0 flex-col items-center gap-3 rounded-2xl border border-[var(--border-dim)] p-4 sm:w-[148px]">
                          <img
                            src={displayAvatar}
                            alt=""
                            className="h-16 w-16 rounded-full border border-[var(--border-dim)] object-cover"
                          />
                          {!isAdminAccount ? (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 w-28 text-xs font-bold border-none"
                                onClick={() => fileInputRef.current?.click()}
                              >
                                上传头像
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-28 text-xs"
                                onClick={() => {
                                  setPendingAvatar(null);
                                  setProfileSuccess('');
                                  setProfileError(null);
                                }}
                              >
                                恢复默认头像
                              </Button>
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => void handlePickAvatar(event)}
                              />
                            </>
                          ) : null}
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col gap-4">
                          <Input
                            id="profile-dialog-username"
                            label="昵称"
                            placeholder="输入昵称"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            disabled={isAdminAccount || savingProfile}
                            autoComplete="username"
                          />
                          {profileError ? (
                            <InlineAlert
                              title={profileError.title}
                              message={profileError.message}
                              variant="danger"
                            />
                          ) : null}
                          {profileSuccess ? <InlineAlert message={profileSuccess} variant="success" /> : null}
                          {!isAdminAccount ? (
                            <div className="flex justify-end">
                              <Button
                                variant="primary"
                                className="w-[110px]"
                                isLoading={savingProfile}
                                onClick={() => void handleSaveProfile()}
                              >
                                保存资料
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-base font-bold leading-none text-foreground">修改密码</h3>
                      <p className="text-sm leading-5 text-muted-text">
                        更新当前账号登录密码。修改成功后，后续登录请使用新密码。
                      </p>
                    </div>

                    <form className="rounded-xl border border-[var(--border-dim)] p-4" onSubmit={(event) => void handleSavePassword(event)}>
                      <div className="flex flex-col gap-3">
                        <Input
                          id="profile-dialog-current-password"
                          type="password"
                          allowTogglePassword
                          iconType="password"
                          label="当前密码"
                          placeholder="请输入当前密码"
                          value={currentPassword}
                          onChange={(event) => setCurrentPassword(event.target.value)}
                          disabled={savingPassword}
                          autoComplete="current-password"
                        />
                        <Input
                          id="profile-dialog-new-password"
                          type="password"
                          allowTogglePassword
                          iconType="password"
                          label="新密码"
                          placeholder="请输入新密码"
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          disabled={savingPassword}
                          autoComplete="new-password"
                        />
                        <Input
                          id="profile-dialog-new-password-confirm"
                          type="password"
                          allowTogglePassword
                          iconType="password"
                          label="确认新密码"
                          placeholder="请再次输入新密码"
                          value={newPasswordConfirm}
                          onChange={(event) => setNewPasswordConfirm(event.target.value)}
                          disabled={savingPassword}
                          autoComplete="new-password"
                        />
                      </div>

                      {passwordErrorMessage ? (
                        <InlineAlert
                          title="修改失败"
                          message={passwordErrorMessage}
                          variant="danger"
                          className="mt-3"
                        />
                      ) : null}
                      {passwordSuccess ? (
                        <InlineAlert message={passwordSuccess} variant="success" className="mt-3" />
                      ) : null}

                      <div className="mt-5 flex justify-end">
                        <Button type="submit" variant="primary" className="w-[110px]" isLoading={savingPassword}>
                          保存新密码
                        </Button>
                      </div>
                    </form>
                  </section>
                </div>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
};
