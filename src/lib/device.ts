// Device label from the User-Agent of an addon request.
// Observed 2026-11-22: Apple TV "Stremio-Apple/0.6.0 (AppleTV14,1; tvOS 27.2.1)",
// Mac app bare WebKit "…Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)", Web = normal browser UA.
export function deviceFromUa(ua: string | null | undefined): string {
  if (!ua) return "Stremio";
  if (/AppleTV/i.test(ua)) return "Apple TV";
  if (/Stremio-Apple/i.test(ua)) return /iPad/i.test(ua) ? "iPad" : "iPhone";
  if (/Android/i.test(ua)) return /TV|AFT|BRAVIA|SHIELD/i.test(ua) ? "Android TV" : "Android";
  if (/(Chrome|Firefox|Safari)\//.test(ua)) return "Web";
  if (/Macintosh/.test(ua) && /AppleWebKit/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Stremio";
}
