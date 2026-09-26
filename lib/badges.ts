/** Pages dispatch this event after marking items as read so that header badges refresh at once. */
export const BADGES_REFRESH_EVENT = 'fas:badges-refresh';

export function refreshBadges() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(BADGES_REFRESH_EVENT));
}
