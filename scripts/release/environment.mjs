import { fileURLToPath } from 'node:url';
import { github } from './candidate.mjs';
import { REPOSITORY } from './policy.mjs';

export function validateEnvironment(environment, policies) {
  if (!environment.protection_rules?.some(rule => rule.type === 'required_reviewers' && rule.reviewers?.length > 0)) throw new Error('Configure at least one required reviewer for GitHub environment itch-release');
  if (!environment.deployment_branch_policy?.custom_branch_policies ||
    policies.branch_policies?.length !== 1 || policies.branch_policies[0].name !== 'main' || policies.branch_policies[0].type !== 'branch') throw new Error('Restrict itch-release to the main branch only, with no tag or wildcard policy');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    validateEnvironment(github(`repos/${REPOSITORY}/environments/itch-release`), github(`repos/${REPOSITORY}/environments/itch-release/deployment-branch-policies`));
    console.log('Protected itch-release environment is configured');
  } catch (error) { console.error(`Release setup incomplete: ${error.message}. See docs/release/OPERATIONS.md. No upload attempted.`); process.exitCode = 1; }
}
