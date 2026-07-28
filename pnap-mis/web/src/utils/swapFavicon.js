// swapFavicon — replaces the browser tab icon at runtime. Some
// browsers cache favicons aggressively; the cache-bust query param
// helps but isn't a guarantee. Best-effort.
//
// Falls through silently when no URL is provided so the static
// favicon shipped with the build remains in place.

export function swapFavicon(url) {
  if (!url || typeof document === 'undefined') return;

  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  // Cache-bust by appending a stable token (the URL itself + a short
  // hash of the timestamp at module load). Bumping the URL re-triggers
  // a fetch in most browsers.
  const bust = url.includes('?') ? '&' : '?';
  link.href = `${url}${bust}v=${Date.now()}`;
}
