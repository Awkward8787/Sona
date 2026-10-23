import { useEffect, useRef } from "react";
import { CommandCatalog } from "../engine/CommandCatalog";
import type { RankedMic } from "../mic/FindMyMic";
import type { ChatMessage } from "../model/types";
import { WaveformMark } from "./WaveformMark";

export function EngineerPanel({
  messages,
  listening,
  partial,
  voiceMuted,
  speechSupported,
  sessionActive,
  pending,
  ranking,
  suggestions,
  onSubmit,
  onTalkStart,
  onTalkStop,
  onToggleVoice,
  onYes,
  onNo,
}: {
  messages: ChatMessage[];
  listening: boolean;
  partial: string;
  voiceMuted: boolean;
  speechSupported: boolean;
  sessionActive: boolean;
  pending: string | null;
  ranking: RankedMic[] | null;
  suggestions?: string[];
  onSubmit: (text: string) => void;
  onTalkStart: () => void;
  onTalkStop: () => void;
  onToggleVoice: () => void;
  onYes: () => void;
  onNo: () => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTop = log.scrollHeight;
  }, [messages, partial]);

  return (
    <aside className="engineer" aria-label="Engineer">
      <header className="engineer-head">
        <WaveformMark size={22} />
        <div>
          <p className="section-label">Engineer</p>
          <p className="section-note">Your engineer. Just speak.</p>
        </div>
        <button type="button" aria-pressed={voiceMuted} onClick={onToggleVoice}>
          {voiceMuted ? "Voice off" : "Voice on"}
        </button>
      </header>
      <div className="log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions">
        {messages.map((message) => (
          <article key={message.id} className={`bubble ${message.role}`}>
            <span className="who">{message.role === "engineer" ? "SONA" : "You"}</span>
            <p>{message.text}</p>
          </article>
        ))}
      </div>
      {ranking && ranking.length > 0 ? (
        <ol className="ranks" aria-label="Mic ranking">
          {ranking.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onSubmit(String(item.rank))}>
                {item.rank}. {item.name}
              </button>
              <p>{item.reason}</p>
            </li>
          ))}
        </ol>
      ) : null}
      {pending ? (
        <div className="confirm" role="group" aria-label="Confirm command">
          <p>{pending}</p>
          <button type="button" onClick={onYes}>Yes</button>
          <button type="button" onClick={onNo}>No</button>
        </div>
      ) : null}
      <div className="composer">
        {listening ? <p className="partial">{partial || "Listening…"}</p> : null}
        <button
          type="button"
          className="talk"
          data-talk="true"
          aria-pressed={listening}
          disabled={!speechSupported || sessionActive}
          onPointerDown={(event) => {
            event.preventDefault();
            onTalkStart();
          }}
          onPointerUp={onTalkStop}
          onPointerCancel={onTalkStop}
          onKeyDown={(event) => {
            if (event.repeat) return;
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              onTalkStart();
            }
          }}
          onKeyUp={(event) => {
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              onTalkStop();
            }
          }}
        >
          {!speechSupported ? "Voice input unavailable" : sessionActive ? (listening ? "Listening" : "Session live") : listening ? "Listening" : "Hold to talk"}
        </button>
        {!speechSupported ? (
          <p className="hint">Desktop Chrome can take voice. Type a command and SONA will still do it. This browser is not inventing a transcript.</p>
        ) : sessionActive ? (
          <p className="hint">Session is live. During a take, speech is lyrics unless you say SONA. Headphones on — I'll duck while I talk.</p>
        ) : (
          <p className="hint">Hold the button, say the move, then release. Say SONA, let's work to leave the mic open.</p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = inputRef.current?.value ?? "";
            if (!value.trim()) return;
            onSubmit(value);
            if (inputRef.current) inputRef.current.value = "";
          }}
        >
          <label className="sr-only" htmlFor="command">Command</label>
          <input
            id="command"
            ref={inputRef}
            name="command"
            autoComplete="off"
            placeholder="arm track two, add reverb…"
          />
          <button type="submit">Send</button>
        </form>
        <div className="chips" aria-label="Example commands">
          {(suggestions ?? CommandCatalog.suggestions()).map((phrase) => (
            <button key={phrase} type="button" className="chip" onClick={() => onSubmit(phrase)}>
              {phrase}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
