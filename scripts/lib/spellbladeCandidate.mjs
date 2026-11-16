// Serve a candidate third-person Spellblade GLB in place of the installed one, inside one Chrome page (CDP Fetch).
// Nothing on disk or on the server changes: the page asks for the manifest's spellblade.glb as usual and is handed the
// candidate's bytes, so production and candidate run under the same conditions, from the same checkout.
// The first-person model, the motion sidecars and the manifest stay the installed ones.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function candidateInfo(path) {
  if (!path) return null;
  const bytes = readFileSync(path);
  return { path, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** Call before the page navigates. Returns a counter of how many times the candidate was served. */
export async function substituteSpellblade(cdp, candidate) {
  const served = { count: 0, sha256: candidate?.sha256 ?? null };
  if (!candidate) return served;
  const body = candidate.bytes.toString('base64');
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/characters/spellblade/spellblade.glb*', requestStage: 'Request' }] });
  cdp.on('Fetch.requestPaused', (e) => {
    // (only the third-person model: spellblade-fp.glb and spellblade-motion.glb don't match this name)
    if (!/\/characters\/spellblade\/spellblade\.glb(\?|$)/.test(e.request.url)) {
      cdp.send('Fetch.continueRequest', { requestId: e.requestId }).catch(() => {});
      return;
    }
    served.count += 1;
    cdp.send('Fetch.fulfillRequest', {
      requestId: e.requestId, responseCode: 200, body,
      responseHeaders: [{ name: 'Content-Type', value: 'model/gltf-binary' }, { name: 'Cache-Control', value: 'no-store' },
        { name: 'Content-Length', value: String(candidate.bytes.length) }],
    }).catch(() => {});
  });
  return served;
}
