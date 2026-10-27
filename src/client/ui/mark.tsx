// The app's mark: two machines joined by a flow, on the pack accent. The top bar, the welcome and the game
// picker show it at their own sizes.
import { cx } from "./cx";

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("drop-shadow-glow", className)} aria-hidden>
      <rect width="24" height="24" rx="6.5" className="fill-accent" />
      <path d="M7 8.5C12 8.5 12 15.5 17 15.5" fill="none" strokeWidth="2" className="stroke-on-accent" />
      <circle cx="7" cy="8.5" r="2.5" className="fill-on-accent" />
      <circle cx="17" cy="15.5" r="2.5" className="fill-on-accent" />
    </svg>
  );
}
