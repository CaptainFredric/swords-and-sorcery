import { execFileSync } from 'node:child_process';

export const REPOSITORY = 'CaptainFredric/swords-and-sorcery';
export const TARGET = 'captainfredric/swords-and-sorcery:html5';
export const SHA = /^[a-f0-9]{40}$/;
export const DIGEST = /^[a-f0-9]{64}$/;
function requireThat(condition, message) { if (!condition) throw new Error(message); }

export function validateRun(run, { runId, revision }) {
  requireThat(/^\d+$/.test(String(runId)) && SHA.test(revision), 'Use a numeric run ID and a full source SHA');
  requireThat(String(run.id) === String(runId) && run.head_sha === revision, 'Candidate run/revision mismatch');
  requireThat(run.repository?.full_name === REPOSITORY && run.head_branch === 'main', 'Candidate must belong to repository main');
  requireThat(['push', 'workflow_dispatch'].includes(run.event), 'PR candidates cannot be published');
  requireThat(run.path === '.github/workflows/itch-candidate.yml' && run.conclusion === 'success', 'Candidate workflow must have succeeded');
}

export function publicationPlan({ ref, event, approved, key, channelReady, operation, reason = '', candidate, current, isAncestor }) {
  requireThat(ref === 'refs/heads/main' && event === 'workflow_dispatch', 'Publication requires manual dispatch from main');
  requireThat(approved === true, 'Explicit publication approval required');
  requireThat(typeof key === 'string' && key.trim().length > 0, 'Configure BUTLER_API_KEY in the protected itch-release environment');
  requireThat(SHA.test(candidate?.revision) && DIGEST.test(candidate?.sha256), 'Invalid verified candidate identity');
  requireThat(['release', 'rollback', 'migrate'].includes(operation), 'Unknown operation');
  const version = `sha-${candidate.revision}`;
  if (operation === 'migrate') requireThat(!current, 'Channel already exists; migration cannot overwrite it');
  else {
    requireThat(channelReady === true, 'Complete the owner controlled HTML5 migration setup first');
    requireThat(current, 'Missing channel; use explicit hidden migration');
    requireThat(current.userVersion !== version, 'Candidate already uploaded');
    requireThat(/^sha-[a-f0-9]{40}$/.test(current.userVersion), 'Current channel has an unrecognized version; inspect it before proceeding');
    const previous = current.userVersion.slice(4);
    if (operation === 'rollback') {
      requireThat(reason.trim().length >= 10, 'Rollback requires a meaningful reason');
      requireThat(isAncestor(candidate.revision, previous), 'Rollback must restore an older ancestor');
    } else requireThat(isAncestor(previous, candidate.revision), 'Candidate is older or diverged; use explicit rollback');
  }
  return { target: TARGET, version, hidden: operation === 'migrate', operation, revision: candidate.revision, sha256: candidate.sha256, ...(operation === 'rollback' ? { reason: reason.trim() } : {}) };
}

export function butlerStatus(output) {
  const lines = output.trim().split('\n').map(line => JSON.parse(line));
  const results = lines.filter(line => line.type === 'result');
  requireThat(results.length === 1 && Array.isArray(results[0].value?.channels), 'Invalid Butler status JSON');
  const channels = results[0].value.channels.filter(channel => channel.name === 'html5');
  requireThat(channels.length <= 1, 'Ambiguous HTML5 channel');
  if (!channels.length) return null;
  const channel = channels[0];
  requireThat(!channel.pending && channel.head?.state === 'completed', 'HTML5 build pending, failed or incomplete; inspect Butler status');
  return channel.head;
}

export function butlerEnvironment(key) {
  const { GH_TOKEN, GITHUB_TOKEN, ...rest } = process.env;
  return { ...rest, BUTLER_API_KEY: key };
}

export function invokeButler(binary, plan, zip, { runner = execFileSync, key } = {}) {
  const args = ['push', zip, plan.target, '--userversion', plan.version, '--json'];
  if (plan.hidden) args.push('--hidden');
  // Credentials are scoped to this process, never command arguments or release metadata.
  return runner(binary, args, { encoding: 'utf8', timeout: 20 * 60_000, maxBuffer: 4 * 1024 ** 2, env: butlerEnvironment(key) });
}
