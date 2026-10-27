// The app's top bar: wordmark, open documents, global controls.
import { ThemeToggle } from "./ui/theme-toggle";

export function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface-1 px-3">
      <Wordmark />
      <div className="h-5 w-px bg-line" aria-hidden />
      {/* Placeholder until documents and tabs exist. */}
      <nav aria-label="Documents" className="flex min-w-0 items-center">
        <span className="flex h-8 items-center gap-2 rounded-md bg-surface-3 px-3 text-sm font-medium text-fg shadow-sm">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
          Untitled factory
        </span>
      </nav>
      <div className="ml-auto flex items-center">
        <ThemeToggle />
      </div>
    </header>
  );
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5 pr-1">
      <svg viewBox="0 0 24 24" className="size-6 drop-shadow-glow" aria-hidden>
        <rect width="24" height="24" rx="6.5" className="fill-accent" />
        <path d="M7 8.5C12 8.5 12 15.5 17 15.5" fill="none" strokeWidth="2" className="stroke-on-accent" />
        <circle cx="7" cy="8.5" r="2.5" className="fill-on-accent" />
        <circle cx="17" cy="15.5" r="2.5" className="fill-on-accent" />
      </svg>
      <span className="text-base font-semibold tracking-tight text-fg">Carbonara</span>
    </div>
  );
}
