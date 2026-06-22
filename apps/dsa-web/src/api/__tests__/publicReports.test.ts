import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildShareReportUrl,
  copyShareReportUrl,
  shareReportLink,
  shouldUseNativeShare,
  writeTextToClipboard,
} from '../publicReports';

describe('publicReports share helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { origin: 'http://127.0.0.1:8000' });
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
    vi.stubGlobal('execCommand', vi.fn().mockReturnValue(true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds an absolute share url', () => {
    expect(buildShareReportUrl('/r/abc123')).toBe('http://127.0.0.1:8000/r/abc123');
  });

  it('always copies the share url to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
      share: vi.fn(),
    });

    const url = await shareReportLink('/r/abc123', 'Demo report');

    expect(url).toBe('http://127.0.0.1:8000/r/abc123');
    expect(writeText).toHaveBeenCalledWith('http://127.0.0.1:8000/r/abc123');
    expect(navigator.share).not.toHaveBeenCalled();
  });

  it('copies before invoking native share on mobile', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
      share,
    });
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true } as MediaQueryList));

    await shareReportLink('/r/abc123', 'Demo report');

    expect(writeText).toHaveBeenCalledWith('http://127.0.0.1:8000/r/abc123');
    expect(share).toHaveBeenCalledWith({
      title: 'Demo report',
      url: 'http://127.0.0.1:8000/r/abc123',
    });
  });

  it('falls back to execCommand when clipboard api fails', async () => {
    const execCommandMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommandMock,
    });
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });

    await writeTextToClipboard('http://127.0.0.1:8000/r/abc123');

    expect(execCommandMock).toHaveBeenCalledWith('copy');
  });

  it('detects native share only on coarse pointer devices', () => {
    vi.stubGlobal('navigator', { share: vi.fn() });
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true } as MediaQueryList));
    expect(shouldUseNativeShare()).toBe(true);

    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    expect(shouldUseNativeShare()).toBe(false);
  });

  it('copyShareReportUrl returns the absolute url', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    await expect(copyShareReportUrl('/r/token')).resolves.toBe('http://127.0.0.1:8000/r/token');
  });
});
