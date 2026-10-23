import { useEffect, useRef } from "react";
import { describeCommand, type CommandLogEntry } from "../daw/DawCommand";

export function CommandLog({
  entries,
  onUndo,
  canUndo = false,
}: {
  entries: CommandLogEntry[];
  onUndo?: () => void;
  canUndo?: boolean;
}) {
  const listRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [entries]);
  return (
    <section className="command-log" aria-label="Command log" ref={listRef}>
      <header>
        <p className="section-label">Command log</p>
        <p className="section-note">Every command SONA ran. Each line has an inverse. Undo puts the session back.</p>
        {onUndo ? (
          <button type="button" onClick={onUndo} disabled={!canUndo}>Undo</button>
        ) : null}
      </header>
      {entries.length === 0 ? <p className="empty-log">No commands yet. The planner has not touched the session.</p> : null}
      <ol>
        {entries.map((entry, index) => (
          <li key={entry.id} className={index === entries.length - 1 ? "latest" : undefined}>
            <code>{describeCommand(entry)}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}
