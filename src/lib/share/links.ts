/** View-only share links (§7). The URL carries only the token. */
export function buildShareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/share/${token}`;
}
