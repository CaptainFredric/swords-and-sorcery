// Some phone apps (Handshake among them) refresh the page when a thumb drags down from the top of it, and a game
// lying sideways turns every drag to the right into a drag down. Two guards, for touch screens:
//
//   - the game keeps its drags to itself (every touch move is claimed, except inside lists that really scroll and
//     in form fields), so the app's web view never starts a pull;
//   - the page sits scrolled one pixel down, so an app that first asks "is the page at its top?" before refreshing
//     (Android's usual refresh wrapper does) always hears no.

// whether a touch that began here should be left to scroll something (a list taller than its box)
function scrollsItself(target) {
  if (target?.closest?.('input, textarea, select')) return true;
  for (let element = target; element && element !== document.body; element = element.parentElement) {
    const style = getComputedStyle(element);
    const scrollable = /(auto|scroll)/.test(`${style.overflowY} ${style.overflowX}`);
    if (scrollable && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)) return true;
  }
  return false;
}

export function guardPullToRefresh() {
  let leaveAlone = false;
  document.addEventListener('touchstart', (event) => { leaveAlone = scrollsItself(event.target); }, { passive: true });
  document.addEventListener('touchmove', (event) => {
    if (!leaveAlone && event.cancelable) event.preventDefault();
  }, { passive: false });

  document.documentElement.classList.add('pull-guard');
  const root = document.scrollingElement ?? document.documentElement;
  const nudge = () => { if (root.scrollTop < 1) root.scrollTop = 1; };
  addEventListener('scroll', nudge, { passive: true });
  addEventListener('resize', nudge);
  nudge();
  setTimeout(nudge, 250);
}
