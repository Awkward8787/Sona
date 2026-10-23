import { useRef, type ReactNode } from "react";
import { command, type CommandLogEntry, type DawCommand } from "../daw/DawCommand";
import { MasterPresets } from "../engine/EffectPresets";
import type { MixLevels } from "../audio/AudioEngine";
import { Gain } from "../model/Gain";
import { VolumeAutomation } from "../model/VolumeAutomation";
import type { Bus, MasterPreset, Project, Track } from "../model/types";
import { StudioModes } from "./StudioModes";
import { CommandLog } from "./CommandLog";

const PRESETS: MasterPreset[] = ["off", "broadcast", "streaming", "loud"];

export function Mixer({
  project,
  levels,
  playheadSec,
  bouncing,
  log,
  canUndo,
  onPreview,
  onDesk,
  onUndo,
  onBounce,
}: {
  project: Project;
  levels: MixLevels;
  playheadSec: number;
  bouncing: boolean;
  log: CommandLogEntry[];
  canUndo: boolean;
  onPreview: (project: Project) => void;
  onDesk: (item: DawCommand, origin?: Project) => void;
  onUndo: () => void;
  onBounce: () => void;
}) {
  const selected = project.tracks.find((track) => track.id === project.selectedTrackId) ?? project.tracks[0] ?? null;
  const chain = MasterPresets.chain(project.masterPreset);
  return (
    <section className="mixer" aria-label="Engineer mode" data-surfaces={StudioModes.surfaces("engineer").join(" ")}>
      <header className="mixer-head">
        <div>
          <p className="section-label">Engineer</p>
          <p className="section-note">Faders, inserts, and buses write commands. Undo reads the log.</p>
        </div>
      </header>
      <div className="strips">
        {project.tracks.map((track) => (
          <ChannelStrip
            key={track.id}
            project={project}
            track={track}
            level={levels.tracks[track.id] ?? 0}
            onPreview={onPreview}
            onDesk={onDesk}
          />
        ))}
        {project.buses.map((bus) => (
          <BusStrip
            key={bus.id}
            project={project}
            bus={bus}
            level={levels.buses[bus.id] ?? 0}
            onPreview={onPreview}
            onDesk={onDesk}
          />
        ))}
        <section className="strip master-strip" aria-label="Master chain">
          <p className="strip-name">Master</p>
          <Meter level={levels.master} label="Master meter" />
          <div className="presets" role="group" aria-label="Master chain">
            {PRESETS.map((preset) => (
              <button key={preset} type="button" aria-pressed={project.masterPreset === preset} onClick={() => onDesk(command("master", "master", preset))}>
                {preset}
              </button>
            ))}
          </div>
          <p className="chain-readout">
            Threshold {chain.threshold} dB · ratio {chain.ratio}:1 · makeup {chain.makeupDb} dB
          </p>
          <Fader
            label="Master output"
            min={Gain.MIN_MASTER_DB}
            max={Gain.MAX_MASTER_DB}
            value={project.masterGainDb}
            text={Gain.format(project.masterGainDb)}
            project={project}
            onPreview={(db) => onPreview({ ...project, masterGainDb: db })}
            onCommit={(db, origin) => onDesk(command("master", "gain-set", db), origin)}
          />
          <button type="button" onClick={onBounce} disabled={bouncing}>{bouncing ? "Bouncing…" : "Bounce WAV"}</button>
        </section>
      </div>
      {selected ? (
        <AutomationLane
          track={selected}
          playheadSec={playheadSec}
          onDesk={onDesk}
        />
      ) : null}
      <CommandLog entries={log} onUndo={onUndo} canUndo={canUndo} />
    </section>
  );
}

function ChannelStrip({
  project,
  track,
  level,
  onPreview,
  onDesk,
}: {
  project: Project;
  track: Track;
  level: number;
  onPreview: (project: Project) => void;
  onDesk: (item: DawCommand, origin?: Project) => void;
}) {
  function patch(next: Partial<Track>, preview: Project = project): Project {
    return { ...preview, tracks: preview.tracks.map((item) => (item.id === track.id ? { ...item, ...next } : item)) };
  }
  const groups = project.buses.filter((bus) => bus.kind === "group");
  return (
    <section className={`strip ${project.selectedTrackId === track.id ? "selected" : ""}`} aria-label={`${track.name} channel`}>
      <p className="strip-name"><span className="swatch" style={{ background: track.color }} />{track.name}</p>
      <Meter level={level} label={`${track.name} meter`} />
      <Fader
        label={`${track.name} volume`}
        min={Gain.MIN_DB}
        max={Gain.MAX_DB}
        value={track.gainDb}
        text={Gain.format(track.gainDb)}
        project={project}
        onPreview={(db) => onPreview(patch({ gainDb: db }))}
        onCommit={(db, origin) => onDesk(command(track.name, "gain-set", db), origin)}
      />
      <Fader
        label={`${track.name} pan`}
        min={-100}
        max={100}
        step={1}
        value={Math.round(track.pan * 100)}
        text={panText(track.pan)}
        project={project}
        onPreview={(value) => onPreview(patch({ pan: value / 100 }))}
        onCommit={(value, origin) => onDesk(command(track.name, "pan", value / 100), origin)}
      />
      <div className="track-buttons">
        <button type="button" aria-pressed={track.mute} onClick={() => onDesk(command(track.name, "mute", "toggle"))}>Mute</button>
        <button type="button" aria-pressed={track.solo} onClick={() => onDesk(command(track.name, "solo", "toggle"))}>Solo</button>
      </div>
      <Insert
        name="EQ"
        on={track.eq.enabled}
        onToggle={() => onDesk(command(track.name, track.eq.enabled ? "remove-effect" : "effect", track.eq.enabled ? "eq" : `eq:${track.eq.preset}`))}
      >
        <Band project={project} label={`${track.name} low EQ`} value={track.eq.lowDb} onPreview={(db) => onPreview(patch({ eq: { ...track.eq, lowDb: db } }))} onCommit={(db, origin) => onDesk(command(track.name, "eq-band", `low:${db}`), origin)} />
        <Band project={project} label={`${track.name} mid EQ`} value={track.eq.midDb} onPreview={(db) => onPreview(patch({ eq: { ...track.eq, midDb: db } }))} onCommit={(db, origin) => onDesk(command(track.name, "eq-band", `mid:${db}`), origin)} />
        <Band project={project} label={`${track.name} high EQ`} value={track.eq.highDb} onPreview={(db) => onPreview(patch({ eq: { ...track.eq, highDb: db } }))} onCommit={(db, origin) => onDesk(command(track.name, "eq-band", `high:${db}`), origin)} />
      </Insert>
      <Insert
        name="Comp"
        on={track.compressor.enabled}
        onToggle={() => onDesk(command(track.name, track.compressor.enabled ? "remove-effect" : "effect", track.compressor.enabled ? "compressor" : `compressor:${track.compressor.preset}`))}
      >
        <Band
          project={project}
          label={`${track.name} compressor threshold`}
          min={-60}
          max={0}
          value={track.compressor.threshold}
          onPreview={(db) => onPreview(patch({ compressor: { ...track.compressor, threshold: db } }))}
          onCommit={(db, origin) => onDesk(command(track.name, "comp-threshold", String(db)), origin)}
        />
      </Insert>
      <Insert
        name="De-ess"
        on={track.deesser.enabled}
        onToggle={() => onDesk(command(track.name, "deesser", track.deesser.enabled ? "off" : "on"))}
      >
        <Band
          project={project}
          label={`${track.name} de-esser threshold`}
          min={-60}
          max={0}
          value={track.deesser.threshold}
          onPreview={(db) => onPreview(patch({ deesser: { ...track.deesser, threshold: db } }))}
          onCommit={(db, origin) => onDesk(command(track.name, "deesser", `threshold:${db}`), origin)}
        />
      </Insert>
      <Insert
        name="Tune"
        on={track.tune.enabled}
        onToggle={() => onDesk(command(track.name, "tune-enable", track.tune.enabled ? "off" : "on"))}
      >
        <Band
          project={project}
          label={`${track.name} tune strength`}
          min={0}
          max={100}
          value={Math.round(track.tune.strength * 100)}
          onPreview={(value) => onPreview(patch({ tune: { ...track.tune, strength: value / 100, enabled: true } }))}
          onCommit={(value, origin) => onDesk(command(track.name, "tune-strength", value / 100), origin)}
        />
      </Insert>
      <Band
        project={project}
        label={`${track.name} reverb send`}
        min={0}
        max={100}
        value={Math.round((track.reverb.enabled ? track.reverb.mix : 0) * 100)}
        onPreview={(value) => onPreview(patch({ reverb: { ...track.reverb, mix: value / 100 } }))}
        onCommit={(value, origin) => onDesk(command(track.name, "send-level", `reverb:${value / 100}`), origin)}
      />
      <Band
        project={project}
        label={`${track.name} delay send`}
        min={0}
        max={100}
        value={Math.round((track.delay.enabled ? track.delay.mix : 0) * 100)}
        onPreview={(value) => onPreview(patch({ delay: { ...track.delay, mix: value / 100 } }))}
        onCommit={(value, origin) => onDesk(command(track.name, "send-level", `delay:${value / 100}`), origin)}
      />
      <label className="bus-select">
        Bus
        <select
          aria-label={`${track.name} bus`}
          value={track.busId}
          onChange={(event) => onDesk(command(track.name, "bus-assign", event.target.value))}
        >
          {groups.map((bus) => (
            <option key={bus.id} value={bus.id}>{bus.name}</option>
          ))}
        </select>
      </label>
    </section>
  );
}

function BusStrip({
  project,
  bus,
  level,
  onPreview,
  onDesk,
}: {
  project: Project;
  bus: Bus;
  level: number;
  onPreview: (project: Project) => void;
  onDesk: (item: DawCommand, origin?: Project) => void;
}) {
  function replace(next: Partial<Bus>): Project {
    return { ...project, buses: project.buses.map((item) => (item.id === bus.id ? { ...item, ...next } : item)) };
  }
  return (
    <section className="strip bus-strip" aria-label={`${bus.name} bus`}>
      <p className="strip-name">{bus.name}</p>
      <p className="section-note">{bus.kind === "group" ? "Group" : "Return"}</p>
      <Meter level={level} label={`${bus.name} meter`} />
      <Fader
        label={`${bus.name} volume`}
        min={Gain.MIN_DB}
        max={Gain.MAX_DB}
        value={bus.gainDb}
        text={Gain.format(bus.gainDb)}
        project={project}
        onPreview={(db) => onPreview(replace({ gainDb: db }))}
        onCommit={(db, origin) => onDesk(command(bus.name, "bus-gain", db), origin)}
      />
      <Fader
        label={`${bus.name} pan`}
        min={-100}
        max={100}
        step={1}
        value={Math.round(bus.pan * 100)}
        text={panText(bus.pan)}
        project={project}
        onPreview={(value) => onPreview(replace({ pan: value / 100 }))}
        onCommit={(value, origin) => onDesk(command(bus.name, "bus-pan", value / 100), origin)}
      />
      <div className="track-buttons">
        <button type="button" aria-pressed={bus.mute} onClick={() => onDesk(command(bus.name, "bus-mute", bus.mute ? "off" : "on"))}>Mute</button>
        <button type="button" aria-pressed={bus.solo} onClick={() => onDesk(command(bus.name, "bus-solo", bus.solo ? "off" : "on"))}>Solo</button>
      </div>
    </section>
  );
}

function AutomationLane({
  track,
  playheadSec,
  onDesk,
}: {
  track: Track;
  playheadSec: number;
  onDesk: (item: DawCommand, origin?: Project) => void;
}) {
  const width = 360;
  const seconds = Math.max(8, ...track.automation.map((point) => point.timeSec + 1), playheadSec + 1);
  return (
    <section className="automation" aria-label="Volume automation">
      <header>
        <p className="section-label">Volume automation · {track.name}</p>
        <button
          type="button"
          onClick={() => onDesk(command(track.name, "automation-set", JSON.stringify(VolumeAutomation.withPoint(track.automation, playheadSec, track.gainDb))))}
        >
          Add point at playhead
        </button>
        <button
          type="button"
          onClick={() => onDesk(command(track.name, "automation-set", "[]"))}
          disabled={track.automation.length === 0}
        >
          Clear
        </button>
      </header>
      <p className="section-note">While the song plays, these points replace the fader. The raw take stays put.</p>
      <svg
        className="automation-lane"
        viewBox={`0 0 ${width} 48`}
        role="img"
        aria-label={`${track.name} volume points`}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const time = Math.max(0, ((event.clientX - rect.left) / rect.width) * seconds);
          onDesk(command(track.name, "automation-set", JSON.stringify(VolumeAutomation.withPoint(track.automation, time, track.gainDb))));
        }}
      >
        <line x1="0" y1="24" x2={width} y2="24" />
        {track.automation.map((point) => {
          const x = (point.timeSec / seconds) * width;
          const y = 24 - (point.gainDb / 12) * 16;
          return <circle key={point.id} cx={x} cy={Math.max(4, Math.min(44, y))} r="4" />;
        })}
      </svg>
      <ul className="point-list">
        {track.automation.length === 0 ? <li>No volume points yet.</li> : null}
        {VolumeAutomation.ordered(track.automation).map((point) => (
          <li key={point.id}>
            <span>{point.timeSec.toFixed(2)}s · {Gain.format(point.gainDb)}</span>
            <button type="button" onClick={() => onDesk(command(track.name, "automation-set", JSON.stringify(VolumeAutomation.without(track.automation, point.id))))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Insert({
  name,
  on,
  onToggle,
  children,
}: {
  name: string;
  on: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="insert">
      <button type="button" aria-pressed={on} onClick={onToggle}>{name}</button>
      {on ? children : null}
    </div>
  );
}

function Band({
  project,
  label,
  value,
  min = -12,
  max = 12,
  onPreview,
  onCommit,
}: {
  project: Project;
  label: string;
  value: number;
  min?: number;
  max?: number;
  onPreview: (value: number) => void;
  onCommit: (value: number, origin: Project) => void;
}) {
  return (
    <Fader
      label={label}
      min={min}
      max={max}
      step={0.1}
      value={value}
      text={value.toFixed(1)}
      project={project}
      onPreview={onPreview}
      onCommit={onCommit}
    />
  );
}

function Fader({
  label,
  min,
  max,
  step = 0.1,
  value,
  text,
  project,
  onPreview,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  text: string;
  project: Project;
  onPreview: (value: number) => void;
  onCommit: (value: number, origin: Project) => void;
}) {
  const editing = useRef(false);
  const origin = useRef(project);
  const start = useRef(value);
  function begin() {
    if (editing.current) return;
    editing.current = true;
    origin.current = project;
    start.current = value;
  }
  function end(next: number) {
    if (!editing.current) return;
    editing.current = false;
    if (Math.abs(next - start.current) < 0.0001) return;
    onCommit(next, origin.current);
  }
  return (
    <label className="slider compact">
      <span>{label} {text}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={`${label} ${text}`}
        onPointerDown={begin}
        onFocus={begin}
        onChange={(event) => onPreview(Number(event.target.value))}
        onPointerUp={(event) => end(Number(event.currentTarget.value))}
        onBlur={(event) => end(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function Meter({ level, label }: { level: number; label: string }) {
  const width = `${Math.round(Math.max(0, Math.min(1, level)) * 100)}%`;
  return (
    <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
      <span style={{ width }} />
    </div>
  );
}

function panText(value: number): string {
  if (value < -0.05) return `${Math.round(Math.abs(value) * 100)} L`;
  if (value > 0.05) return `${Math.round(value * 100)} R`;
  return "C";
}
