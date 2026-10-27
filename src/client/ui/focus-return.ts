// Hides how a panel that isn't a dialog hands the keyboard focus back when it closes. Radix dialogs do this
// themselves; floating cards opened by a shortcut (the planner) need it too, or closing them from inside drops
// the focus on the page's body and the keyboard starts again from the top.

/** Remembers what has the focus now; the returned function gives it back, if the focus has been dropped since. */
export function rememberFocus(): () => void {
  const opener = document.activeElement;
  return () =>
    // After the closing panel has left the page, taking the focus with it.
    requestAnimationFrame(() => {
      const active = document.activeElement;
      const dropped = active === null || active === document.body;
      if (dropped && opener instanceof HTMLElement && opener !== document.body && opener.isConnected) opener.focus();
    });
}
