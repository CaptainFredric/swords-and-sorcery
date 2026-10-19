import { writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { json, validateArchive, digest } from './archive.mjs';
import { SHA, DIGEST, validateRun, REPOSITORY } from './policy.mjs';

export async function sealCandidate(directory, env = process.env) {
  const report = await validateArchive(directory);
  const browser = await json(path.join(directory, 'browser-check.json'));
  if (!browser.passed || browser.revision !== report.revision || browser.sha256 !== report.sha256 ||
    !['menu', 'assets', 'practice', 'movement', 'sword', 'guard', 'fireball', 'leave', 'tutorial', 'mobileLookAndMove'].every(check => browser.checks?.[check] === true)) throw new Error('Candidate browser verification missing or failed');
  const candidate = { schema: 1, repository: REPOSITORY, revision: report.revision, sha256: report.sha256,
    runId: env.GITHUB_RUN_ID || 'local', runAttempt: env.GITHUB_RUN_ATTEMPT || '1', event: env.GITHUB_EVENT_NAME || 'local',
    browserSha256: digest(JSON.stringify(browser)), files: report.files, archiveBytes: report.archiveBytes,
    extractedBytes: report.extractedBytes, warnings: report.warnings ?? [], version: `sha-${report.revision}` };
  await writeFile(path.join(directory, 'candidate.json'), JSON.stringify(candidate, null, 2) + '\n');
  return candidate;
}

export async function validateCandidate(directory, { revision, checksum, runId, runAttempt } = {}) {
  const report = await validateArchive(directory, { revision, checksum });
  const candidate = await json(path.join(directory, 'candidate.json'));
  const browser = await json(path.join(directory, 'browser-check.json'));
  if (candidate.schema !== 1 || candidate.repository !== REPOSITORY || candidate.revision !== report.revision || candidate.sha256 !== report.sha256 ||
    !browser.passed || !['menu','assets','practice','movement','sword','guard','fireball','leave','tutorial','mobileLookAndMove'].every(check => browser.checks?.[check] === true) || browser.revision !== report.revision || browser.sha256 !== report.sha256 || candidate.browserSha256 !== digest(JSON.stringify(browser)) ||
    (runId && candidate.runId !== String(runId)) || (runAttempt && candidate.runAttempt !== String(runAttempt))) throw new Error('Candidate evidence/provenance mismatch');
  return candidate;
}

export function github(endpoint) {
  return JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', maxBuffer: 4 * 1024 ** 2 }));
}

export function findRecoveryRelease(tag, revision, request = github) {
  const matches = [];
  // The release-by-tag endpoint returns published releases only. Recovery archives
  // remain drafts, so find their exact tag through the authenticated release list.
  for (let page = 1; ; page++) {
    const releases = request(`repos/${REPOSITORY}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(releases)) throw new Error('Recovery archive list is invalid');
    matches.push(...releases.filter(release => release.tag_name === tag));
    if (matches.length > 1) throw new Error('Recovery archive is ambiguous');
    if (releases.length < 100) break;
  }
  const release = matches[0];
  if (!release?.draft || release.target_commitish !== revision) throw new Error('Recovery archive is missing or its draft/source identity does not match');
  return release;
}

export async function downloadCandidate(directory, env = process.env) {
  const runId = env.CANDIDATE_RUN, revision = env.CANDIDATE_SHA, checksum = env.CANDIDATE_SHA256;
  if (!/^\d+$/.test(runId || '') || !SHA.test(revision || '') || !DIGEST.test(checksum || '')) throw new Error('Supply the candidate run ID, full source SHA and SHA256 from its summary');
  const run = github(`repos/${REPOSITORY}/actions/runs/${runId}`);
  validateRun(run, { runId, revision });
  execFileSync('git', ['merge-base', '--is-ancestor', revision, 'origin/main']);
  await mkdir(directory, { recursive: true });
  let artifact = null;
  const names = ['swords-and-sorcery-html5.zip', 'export-report.json', 'candidate.json', 'browser-check.json'];
  if (env.RECOVERY_RUN) {
    if (env.RELEASE_OPERATION !== 'rollback' || !/^\d+$/.test(env.RECOVERY_RUN)) throw new Error('Recovery archives are available only for explicit rollback');
    const tag = `itch-${revision}-${env.RECOVERY_RUN}`;
    const release = findRecoveryRelease(tag, revision);
    for (const name of [...names, 'publication.json']) {
      const matches = release.assets.filter(asset => asset.name === name);
      if (matches.length !== 1) throw new Error(`Missing recovery asset: ${name}`);
      await writeFile(path.join(directory, name), execFileSync('gh', ['api', '-H', 'Accept: application/octet-stream', `repos/${REPOSITORY}/releases/assets/${matches[0].id}`], { maxBuffer: 100 * 1024 ** 2 }));
    }
    const receipt = await json(path.join(directory, 'publication.json'));
    if (receipt.revision !== revision || receipt.sha256 !== checksum || String(receipt.candidateRunId) !== runId || receipt.remoteBuild?.userVersion !== `sha-${revision}` || !receipt.completedAt) throw new Error('Recovery receipt does not identify a completed publication');
  } else {
    const name = `itch-html5-${revision}-${runId}-${run.run_attempt}`;
    const artifacts = github(`repos/${REPOSITORY}/actions/runs/${runId}/artifacts?per_page=100`).artifacts.filter(a => a.name === name && !a.expired);
    if (artifacts.length !== 1) throw new Error('Verified candidate artifact missing, expired or ambiguous; use a preserved recovery draft for rollback');
    artifact = artifacts[0];
    const outer = execFileSync('gh', ['api', `repos/${REPOSITORY}/actions/artifacts/${artifact.id}/zip`], { maxBuffer: 100 * 1024 ** 2 });
    const outerPath = path.join(directory, 'download.zip');
    await writeFile(outerPath, outer);
    // Read only known data files. Never execute artifact scripts in the publishing job.
    for (const name of names) await writeFile(path.join(directory, name), execFileSync('unzip', ['-p', outerPath, name], { maxBuffer: 100 * 1024 ** 2 }));
  }
  const candidate = await validateCandidate(directory, { revision, checksum, runId, runAttempt: run.run_attempt });
  return { ...candidate, artifactId: artifact?.id ?? null, artifactDigest: artifact?.digest ?? null, candidateRunUrl: run.html_url };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [command, directory = 'dist/html5'] = process.argv.slice(2);
    const candidate = command === 'seal' ? await sealCandidate(directory) : command === 'download' ? await downloadCandidate(directory) : await validateCandidate(directory);
    console.log(JSON.stringify(candidate, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) {
      const { appendFile } = await import('node:fs/promises');
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n## HTML5 candidate\n\nSource: \`${candidate.revision}\`\n\nSHA256: \`${candidate.sha256}\`\n\nRun: ${candidate.runId} attempt ${candidate.runAttempt}\n\nFiles: ${candidate.files}; archive: ${candidate.archiveBytes} bytes\n\n${(candidate.warnings || []).join('\n')}\n`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
