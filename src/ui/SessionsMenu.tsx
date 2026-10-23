import { useEffect, useId, useRef, useState } from "react";
import type { SessionSummary } from "../storage/ProjectStore";

export function SessionsMenu({
  sessions,
  currentId,
  onLoad,
  onNew,
  onDelete,
}: {
  sessions: SessionSummary[];
  currentId: string;
  onLoad: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="sessions" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        Sessions
      </button>
      {open ? (
        <div className="session-menu" id={menuId} role="menu">
          {sessions.length === 0 ? <p className="menu-empty">No saved sessions yet.</p> : null}
          {sessions.map((session) => (
            <div key={session.id} className="session-row">
              <button
                type="button"
                role="menuitem"
                aria-current={session.id === currentId}
                onClick={() => {
                  setOpen(false);
                  onLoad(session.id);
                }}
              >
                {session.name}
              </button>
              <button
                type="button"
                className="quiet"
                aria-label={`Delete ${session.name}`}
                onClick={() => onDelete(session.id)}
              >
                Delete
              </button>
            </div>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNew();
            }}
          >
            New session
          </button>
        </div>
      ) : null}
    </div>
  );
}
