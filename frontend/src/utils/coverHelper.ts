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
