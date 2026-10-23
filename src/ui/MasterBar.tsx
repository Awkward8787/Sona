import { Gain } from "../model/Gain";
import type { MasterPreset } from "../model/types";

const PRESETS: MasterPreset[] = ["off", "broadcast", "streaming", "loud"];

export function MasterBar({
  preset,
  gainDb,
  meter,
  bouncing,
  onPreset,
  onGain,
  onBeginGain,
  onCommitGain,
  onBounce,
}: {
  preset: MasterPreset;
  gainDb: number;
  meter: number;
  bouncing: boolean;
  onPreset: (preset: MasterPreset) => void;
  onGain: (db: number) => void;
  onBeginGain: () => void;
  onCommitGain: () => void;
  onBounce: () => void;
}) {
  return (
    <section className="master" aria-label="Master bus">
      <div>
        <p className="section-label">Master</p>
        <p className="section-note">{preset === "off" ? "Limiter out" : "Limiter in"}</p>
      </div>
      <div className="presets" role="group" aria-label="Loudness preset">
        {PRESETS.map((item) => (
          <button key={item} type="button" aria-pressed={preset === item} onClick={() => onPreset(item)}>
            {item}
          </button>
        ))}
      </div>
      <label className="slider">
        <span>Output {Gain.format(gainDb)}</span>
        <input
          type="range"
          min={Gain.MIN_MASTER_DB}
          max={Gain.MAX_MASTER_DB}
          step="0.1"
          value={gainDb}
          aria-valuetext={`Master output ${Gain.format(gainDb)}`}
          onFocus={onBeginGain}
          onPointerDown={onBeginGain}
          onChange={(event) => onGain(Number(event.target.value))}
          onPointerUp={onCommitGain}
          onBlur={onCommitGain}
        />
      </label>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${Math.round(meter * 100)}%` }} />
      </div>
      <button type="button" className="bounce" onClick={onBounce} disabled={bouncing}>
        {bouncing ? "Bouncing…" : "Bounce WAV"}
      </button>
    </section>
  );
}
