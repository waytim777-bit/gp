import { createAvatar } from '@dicebear/core';
import { identicon } from '@dicebear/collection';

export function buildDefaultUserAvatar(seed: string, size = 96): string {
  return createAvatar(identicon, {
    seed,
    size,
    backgroundColor: ['f8fafc'],
  }).toDataUri();
}

export function resolveUserAvatarUrl(
  userId: number,
  username: string,
  avatarUrl?: string | null,
  size = 96,
): string {
  if (avatarUrl && avatarUrl.trim()) {
    return avatarUrl.trim();
  }
  return buildDefaultUserAvatar(`${userId}:${username}`, size);
}

export const MAX_AVATAR_FILE_BYTES = 200 * 1024;

export async function readImageFileAsDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件');
  }
  if (file.size > MAX_AVATAR_FILE_BYTES) {
    throw new Error('图片大小不能超过 200KB');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('读取图片失败'));
      }
    };
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}
