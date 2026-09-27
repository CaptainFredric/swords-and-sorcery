// The "Seeking a worthy challenger" banner shown in the practice yard while the server-wide queue works.

function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * @param {{active:boolean, since:number|null, others:number, botOffer:boolean}|null} status  from the server
 * @param {number} serverNow
 * @param {string} mode  the room the seeker is in right now
 */
export function seekView(status, serverNow, mode = 'PRACTICE') {
  if (!status?.active) return { visible: false };
  const waited = Number.isFinite(status.since) ? serverNow - status.since : 0;
  const others = Math.max(0, status.others ?? 0);
  return {
    visible: true,
    title: `SEEKING A WORTHY CHALLENGER · ${clock(waited)}`,
    detail: others === 0 ? 'No one else is seeking yet' : `${others} other${others === 1 ? '' : 's'} seeking`,
    // once offered, a bot duel stays on offer while they practise (not once they are already fighting one)
    offerBot: Boolean(status.botOffer) && mode !== 'BOT_DUEL',
  };
}
