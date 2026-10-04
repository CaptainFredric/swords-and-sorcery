import { CHALLENGES, CHALLENGE_FAMILIES, challengeView } from '../../shared/src/challenges.mjs';

/** A receipt can describe only the feats the server settled for the match currently being shown. */
export function challengeRewardView(profile, snapshot, local = false) {
  const reward = profile?.lastReward;
  if (local || snapshot?.roomState !== 'FINISHED' || !snapshot.rewardMatchId || reward?.matchId !== snapshot.rewardMatchId) return null;
  const ids = [...new Set(Array.isArray(reward.challenges) ? reward.challenges : [])]
    .filter((id) => Object.hasOwn(CHALLENGES, id) && profile?.challenges?.completed?.[id]);
  if (!ids.length) return null;
  const amount = Number.isSafeInteger(reward.challengeAmount) && reward.challengeAmount > 0 ? reward.challengeAmount : 0;
  const titles = ids.map((id) => CHALLENGES[id].title);
  return { matchId: reward.matchId, ids, titles, amount,
    text: `${titles.join(' · ')}${amount ? ` · +${amount} RENOWN` : ''}` };
}

export class ChallengesController {
  constructor({ link = null, getProfile = () => null, root = null, rewardRoot = null, document: doc = root?.ownerDocument ?? globalThis.document } = {}) {
    this.link = link;
    this.getProfile = getProfile;
    this.root = root;
    this.rewardRoot = rewardRoot;
    this.doc = doc;
    this.profile = getProfile();
    this.snapshot = null;
    this.renderedProfile = null;
    this.visibleReceipt = null;
    this.receipts = new Map();
    link?.on('profile', ({ profile }) => this.updateProfile(profile));
    link?.on('snapshot', (snapshot) => this.updateSnapshot(snapshot));
    link?.on('status', () => this.renderReward());
    this.render();
  }

  updateProfile(profile) { this.profile = profile; this.render(); }
  updateSnapshot(snapshot) { this.snapshot = snapshot; this.renderReward(); }

  node(tag, className, text = '') {
    const element = this.doc.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  }

  render() {
    const profile = this.profile ?? this.getProfile();
    const views = challengeView(profile?.challenges ?? {});
    const signature = JSON.stringify(views);
    if (this.root && this.doc && signature !== this.renderedProfile) {
      this.renderedProfile = signature;
      const header = this.node('div', 'mastery-intro');
      header.appendChild(this.node('p', 'armory-slot', 'PERMANENT MASTERY'));
      header.appendChild(this.node('p', 'mastery-copy', 'Master combat techniques. Completed feats grant Renown once and are saved after server matches. Practice is for training.'));
      header.appendChild(this.node('p', 'mastery-count', `${views.filter((view) => view.complete).length} / ${views.length} MASTERED`));
      const content = [header];
      for (const [family, label] of Object.entries(CHALLENGE_FAMILIES)) {
        const entries = views.filter((view) => view.family === family);
        if (!entries.length) continue;
        const section = this.node('section', 'mastery-family');
        section.setAttribute('aria-label', label);
        section.appendChild(this.node('h3', 'mastery-family-title', label));
        for (const view of entries) {
          const card = this.node('article', `mastery-feat${view.complete ? ' complete' : ''}${view.hint && !view.complete ? ' hinted' : ''}`);
          const heading = this.node('div', 'mastery-feat-heading');
          heading.appendChild(this.node('h4', 'mastery-feat-title', view.title));
          heading.appendChild(this.node('span', 'mastery-feat-state', view.complete ? 'COMPLETE' : view.hint ? 'UNDISCOVERED' : 'TO MASTER'));
          card.appendChild(heading);
          card.appendChild(this.node('p', 'mastery-condition', view.condition ?? view.hint));
          if (view.condition) {
            if (view.goal > 1) {
              const progress = this.node('progress', 'mastery-progress');
              progress.max = view.goal;
              progress.value = view.progress;
              progress.setAttribute('aria-label', `${view.title} progress`);
              progress.setAttribute('aria-valuetext', `${view.progress} of ${view.goal}`);
              card.appendChild(progress);
              card.appendChild(this.node('small', 'mastery-progress-count', `${view.progress} / ${view.goal}`));
            }
            card.appendChild(this.node('small', 'mastery-reward', `${view.complete ? 'EARNED' : 'REWARD'} · ${view.reward.renown} RENOWN`));
          }
          if (view.complete && view.flavor) card.appendChild(this.node('p', 'mastery-flavor', view.flavor));
          section.appendChild(card);
        }
        content.push(section);
      }
      this.root.replaceChildren(...content);
    }
    this.renderReward();
  }

  renderReward() {
    if (!this.rewardRoot) return;
    const receipt = challengeRewardView(this.profile ?? this.getProfile(), this.snapshot, Boolean(this.link?.playingLocally));
    if (!receipt) {
      if (this.visibleReceipt !== null) {
        this.rewardRoot.replaceChildren();
        this.rewardRoot.hidden = true;
        this.visibleReceipt = null;
      } else this.rewardRoot.hidden = true;
      return;
    }
    // Receipt text is stable across profile retries, purchases and repeated settlement broadcasts.
    if (this.visibleReceipt === receipt.matchId) return;
    const settled = this.receipts.get(receipt.matchId) ?? receipt;
    this.receipts.set(receipt.matchId, settled);
    this.visibleReceipt = receipt.matchId;
    this.rewardRoot.hidden = false;
    if (this.doc) {
      this.rewardRoot.replaceChildren(
        this.node('strong', 'mastery-earned-label', 'MASTERY EARNED'),
        this.node('span', 'mastery-earned-copy', settled.text),
      );
    } else this.rewardRoot.textContent = `MASTERY EARNED · ${settled.text}`;
  }
}
