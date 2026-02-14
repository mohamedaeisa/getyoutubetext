const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function sanitizeYoutubeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new Error('Invalid URL length');
  }
  return trimmed.replace(/[\u0000-\u001F\u007F]/g, '');
}

export function extractVideoId(rawUrl: string): string {
  const safeUrl = sanitizeYoutubeUrl(rawUrl);

  let url: URL;
  try {
    url = new URL(safeUrl);
  } catch {
    throw new Error('URL is malformed');
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    if (YOUTUBE_ID_REGEX.test(id)) return id;
  }

  if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v') ?? '';
      if (YOUTUBE_ID_REGEX.test(id)) return id;
    }

    const pathParts = url.pathname.split('/').filter(Boolean);
    const candidate = pathParts.length >= 2 ? pathParts[1] : '';
    if (['embed', 'shorts', 'v', 'live'].includes(pathParts[0]) && YOUTUBE_ID_REGEX.test(candidate)) {
      return candidate;
    }
  }

  throw new Error('Unsupported or invalid YouTube URL');
}
