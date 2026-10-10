import { Comic } from '../types';

export function getComicCoverUrl(comic: Comic | { local_cover_path?: string; cover_url?: string }): string | null {
  if (comic.local_cover_path && comic.local_cover_path.trim()) {
    return comic.local_cover_path;
  }
  if (comic.cover_url && comic.cover_url.trim()) {
    const url = comic.cover_url.trim();
    if (url.startsWith('/uploads')) {
      return url;
    }
    // If it's a HoVistoCose remote URL, route through backend proxy to avoid 403 Forbidden
    if (url.includes('hovistocose.it')) {
      return `/api/proxy/image?url=${encodeURIComponent(url)}`;
    }
    return url;
  }
  return null;
}

/**
 * Fallback automatico in caso di errore di caricamento immagine (es. disco effimero Render riavviato).
 * Se l'immagine locale fallisce, tenta il ripristino dall'URL originale o dal proxy.
 */
export function handleCoverError(
  e: React.SyntheticEvent<HTMLImageElement, Event>,
  comic?: { cover_url?: string; local_cover_path?: string } | null,
  onFinalFail?: () => void
) {
  const img = e.currentTarget;
  const currentSrc = img.src;

  // Evita loop infiniti
  if (img.dataset.failedOnce === 'true') {
    if (onFinalFail) onFinalFail();
    else img.style.display = 'none';
    return;
  }

  if (comic && comic.cover_url && comic.cover_url.trim()) {
    const rawUrl = comic.cover_url.trim();
    let fallbackUrl = rawUrl;

    if (rawUrl.includes('hovistocose.it')) {
      fallbackUrl = `/api/proxy/image?url=${encodeURIComponent(rawUrl)}`;
    }

    // Se l'attuale src non è già l'URL fallback, prova il fallback
    if (!currentSrc.includes(fallbackUrl) && !currentSrc.endsWith(rawUrl)) {
      img.dataset.failedOnce = 'true';
      img.src = fallbackUrl;
      return;
    }
  }

  img.dataset.failedOnce = 'true';
  if (onFinalFail) onFinalFail();
  else img.style.display = 'none';
}
