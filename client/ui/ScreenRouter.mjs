export const SCREEN_IDS = Object.freeze({
  MAIN_MENU: 'MAIN_MENU',
  SOLO_MENU: 'SOLO_MENU',
  PRIVATE_MENU: 'PRIVATE_MENU',
  LOBBY: 'LOBBY',
  PLAYING: 'PLAYING',
  PRACTICE_OVERLAY: 'PRACTICE_OVERLAY',
  END_SCREEN: 'END_SCREEN',
  HOW_TO_PLAY: 'HOW_TO_PLAY',
});

export class ScreenRouter {
  constructor(elements = {}) {
    this.elements = elements;
    this.current = null;
  }

  show(screenId) {
    if (!Object.values(SCREEN_IDS).includes(screenId)) throw new Error(`Unknown screen: ${screenId}`);
    for (const element of Object.values(this.elements)) element?.classList?.add('hidden');
    const target = this.elements[screenId];
    if (target) target.classList.remove('hidden');
    this.current = screenId;
    return screenId;
  }

  hideAll() {
    for (const element of Object.values(this.elements)) element?.classList?.add('hidden');
    this.current = null;
  }
}
