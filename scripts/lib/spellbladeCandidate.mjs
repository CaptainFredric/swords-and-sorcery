// Serve a candidate third-person Spellblade GLB in place of the installed one, inside one Chrome page (CDP Fetch).
// Nothing on disk or on the server changes: the page asks for the manifest's spellblade.glb as usual and is handed the
// candidate's bytes, so production and candidate run under the same conditions, from the same checkout.
// The motion sidecars and the manifest stay the installed ones; the first-person model too, unless `fp` is given.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function candidateInfo(path) {
  if (!path) return null;
  const bytes = readFileSync(path);
  return { path, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** Call before the page navigates. Returns a counter of how many times the candidate was served. `fp` (candidateInfo of a
 * first-person GLB) serves spellblade-fp.glb the same way, so a third- and first-person pair is reviewed together. */
export async function substituteSpellblade(cdp, candidate, { fp = null } = {}) {
  const served = { count: 0, fpCount: 0, sha256: candidate?.sha256 ?? null, fpSha256: fp?.sha256 ?? null };
  if (!candidate && !fp) return served;
  const third = candidate?.bytes.toString('base64');
  const first = fp?.bytes.toString('base64');
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/characters/spellblade/spellblade*.glb*', requestStage: 'Request' }] });
  cdp.on('Fetch.requestPaused', (e) => {
    // (only the models asked for: the motion sidecars and the .gz copies pass through)
    const isThird = third && /\/characters\/spellblade\/spellblade\.glb(\?|$)/.test(e.request.url);
    const isFirst = first && /\/characters\/spellblade\/spellblade-fp\.glb(\?|$)/.test(e.request.url);
    if (!isThird && !isFirst) {
      cdp.send('Fetch.continueRequest', { requestId: e.requestId }).catch(() => {});
      return;
    }
    if (isThird) served.count += 1; else served.fpCount += 1;
    const model = isThird ? candidate : fp;
    cdp.send('Fetch.fulfillRequest', {
      requestId: e.requestId, responseCode: 200, body: isThird ? third : first,
      responseHeaders: [{ name: 'Content-Type', value: 'model/gltf-binary' }, { name: 'Cache-Control', value: 'no-store' },
        { name: 'Content-Length', value: String(model.bytes.length) }],
    }).catch(() => {});
  });
  return served;
}
