import { Format } from "../model/Format";
import type { Transport } from "../model/types";

export function TransportBar({
  transport,
  playheadSec,
  bpm,
  metronome,
  canUndo,
  canRedo,
  onPlay,
  onStop,
  onRecord,
  onSplit,
  onStart,
  onUndo,
  onRedo,
  onBpm,
  onMetronome,
  onZoom,
}: {
  transport: Transport;
  playheadSec: number;
  bpm: number;
  metronome: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onPlay: () => void;
  onStop: () => void;
  onRecord: () => void;
  onSplit: () => void;
  onStart: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onBpm: (bpm: number) => void;
  onMetronome: () => void;
  onZoom: (direction: -1 | 1) => void;
}) {
  return (
    <div className="transport" role="toolbar" aria-label="Transport">
      <div className="transport-group">
        <button type="button" onClick={onStart}>Top</button>
        <button type="button" onClick={onPlay} aria-pressed={transport === "playing"}>
          {transport === "playing" ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={onStop}>Stop</button>
        <button type="button" className="record" onClick={onRecord} aria-pressed={transport === "recording"}>
          {transport === "recording" ? "Recording" : "Record"}
        </button>
        <button type="button" onClick={onSplit}>Split</button>
      </div>
      <p className="time" aria-label={`Playhead ${Format.time(playheadSec)}, bar ${Format.bars(playheadSec, bpm)}`}>
        <span className="time-main">{Format.time(playheadSec)}</span>
        <span className="time-bars">bar {Format.bars(playheadSec, bpm)}</span>
      </p>
      <label className="bpm">
        BPM
        <input
          aria-label="Tempo in BPM"
          type="number"
          min={40}
          max={240}
          value={bpm}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onBpm(next);
          }}
        />
      </label>
      <button type="button" aria-pressed={metronome} onClick={onMetronome}>
        {metronome ? "Click on" : "Click off"}
      </button>
      <div className="transport-group">
        <button type="button" onClick={onUndo} disabled={!canUndo}>Undo</button>
        <button type="button" onClick={onRedo} disabled={!canRedo}>Redo</button>
        <button type="button" onClick={() => onZoom(-1)} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => onZoom(1)} aria-label="Zoom in">+</button>
      </div>
    </div>
  );
}
