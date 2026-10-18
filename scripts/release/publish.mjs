import { execFileSync } from 'node:child_process';
import { writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { downloadCandidate } from './candidate.mjs';
import { checkServer } from './server-check.mjs';
import { REPOSITORY, TARGET, publicationPlan, butlerStatus, invokeButler, butlerEnvironment } from './policy.mjs';

const env = process.env;
if (env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.RELEASE_APPROVED !== 'true') throw new Error('Publication requires explicit manual approval from main');
if (!env.BUTLER_API_KEY?.trim()) throw new Error('Set BUTLER_API_KEY in protected environment itch-release. No upload attempted.');
const directory = path.resolve(process.argv[2] || 'dist/approved');
const candidate = await downloadCandidate(directory);
const compatibility = await checkServer(directory);
const binary = path.resolve('.butler/butler');
const status = () => {
  let output;
  try { output = execFileSync(binary, ['status', TARGET, '--json'], { encoding: 'utf8', timeout: 30_000, env: butlerEnvironment(env.BUTLER_API_KEY) }); }
  catch { throw new Error('Butler status failed. Check the environment key, project access and itch service; no automatic fallback is permitted.'); }
  return butlerStatus(output);
};
const ancestor = (a, b) => {
  try { execFileSync('git', ['merge-base', '--is-ancestor', a, b], { stdio: 'pipe' }); return true; } catch { return false; }
};
const plan = publicationPlan({ ref: env.GITHUB_REF, event: env.GITHUB_EVENT_NAME, approved: true, key: env.BUTLER_API_KEY,
  channelReady: env.ITCH_HTML5_CHANNEL_READY === 'true', operation: env.RELEASE_OPERATION, reason: env.ROLLBACK_REASON,
  candidate, current: status(), isAncestor: ancestor });
const tag = `itch-${candidate.revision}-${env.GITHUB_RUN_ID}`;
const receiptPath = path.join(directory, 'publication.json');
const receipt = { ...plan, candidateRunId: candidate.runId, candidateRunUrl: candidate.candidateRunUrl, artifactId: candidate.artifactId,
  artifactDigest: candidate.artifactDigest, publicationRun: `https://github.com/${REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
  butler: '15.32.0', startedAt: new Date().toISOString(), compatibility, status: 'prepared', browserAcceptance: 'pending owner check', recoveryTag: tag };
const save = () => writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
await save();
// A recoverable draft release must exist BEFORE the live channel can change.
execFileSync('gh', ['release', 'create', tag, '--repo', REPOSITORY, '--draft', '--target', candidate.revision,
  '--title', `itch recovery ${candidate.revision.slice(0, 12)}`, '--notes', 'Recovery archive and publication evidence. This draft does not publish the game page.',
  path.join(directory, 'swords-and-sorcery-html5.zip'), path.join(directory, 'export-report.json'), path.join(directory, 'candidate.json'),
  path.join(directory, 'browser-check.json'), path.join(directory, 'server-check.json'), receiptPath], { stdio: 'pipe' });
try {
  // Recheck channel immediately before mutation, within the workflow's serialized job.
  publicationPlan({ ref: env.GITHUB_REF, event: env.GITHUB_EVENT_NAME, approved: true, key: env.BUTLER_API_KEY,
    channelReady: env.ITCH_HTML5_CHANNEL_READY === 'true', operation: env.RELEASE_OPERATION, reason: env.ROLLBACK_REASON,
    candidate, current: status(), isAncestor: ancestor });
  try { invokeButler(binary, plan, path.join(directory, 'swords-and-sorcery-html5.zip'), { key: env.BUTLER_API_KEY }); }
  catch { throw new Error('Butler push failed or timed out. Inspect channel status before retrying; the remote upload may have partially completed.'); }
  receipt.uploadedAt = new Date().toISOString();
  receipt.status = 'uploaded, awaiting processing';
  await save();
  let current = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { current = status(); } catch { /* processing can leave a pending build; bounded wait */ }
    if (current?.userVersion === plan.version) break;
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  if (current?.userVersion !== plan.version) throw new Error('Uploaded build did not become the completed channel head within 10 minutes. Check itch processing and use the documented rollback if needed.');
  receipt.status = plan.hidden ? 'hidden migration ready for owner configuration' : 'channel updated, browser acceptance required';
  receipt.completedAt = new Date().toISOString();
  receipt.remoteBuild = current;
} catch (error) {
  receipt.status = 'failed, inspect remote channel before any retry';
  receipt.failure = error.message;
  throw error;
} finally {
  await save();
  execFileSync('gh', ['release', 'upload', tag, receiptPath, '--repo', REPOSITORY, '--clobber'], { stdio: 'pipe' });
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `\n## itch channel operation\n\n${receipt.status}\n\nSource: ${candidate.revision}\n\nSHA256: ${candidate.sha256}\n\nRecovery draft: https://github.com/${REPOSITORY}/releases/tag/${tag}\n\nActual itch iframe and physical device acceptance remain owner checks. Never infer browser success from a zero Butler exit.\n`);
}
