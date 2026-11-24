// The menu already owns the page renderer. These cards only animate their
// cropped image layers, and only while the player can see the command.
export function observeCommandArt(menu, scrollArea, quality) {
  const commands = menu.querySelectorAll('.thematic-command');
  const visibleFraction = 0.15;
  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver((entries) => {
      for (const { target, intersectionRatio } of entries) {
        target.toggleAttribute('data-art-visible', intersectionRatio >= visibleFraction);
      }
    }, { root: scrollArea, threshold: visibleFraction });
    for (const command of commands) observer.observe(command);
  }
  const updateVisibility = () => menu.toggleAttribute('data-art-page-hidden', document.hidden);
  document.addEventListener('visibilitychange', updateVisibility);
  updateVisibility();

  const setQuality = (value) => { menu.dataset.artQuality = value; };
  setQuality(quality);
  return setQuality;
}
