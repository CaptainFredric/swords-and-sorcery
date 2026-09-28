// Where the game's own files are, wherever the page is served from: the game server's root (Render), or a sub-path
// such as a GitHub Pages copy of the client. An app path like '/client/assets/x' resolves against the page itself.
export function appUrl(path) {
  const value = String(path);
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  const base = globalThis.document?.baseURI ?? 'http://localhost/';
  return new URL(value.replace(/^\/+/, ''), base).href;
}
