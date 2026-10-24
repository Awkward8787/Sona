import { useEffect, useMemo, useRef } from "react";
import { command, type DawCommand } from "../daw/DawCommand";
import { Peaks } from "../audio/Peaks";
import { DeskCommands } from "../action/DeskCommands";
import { ClipEdits } from "../model/ClipEdits";
import { Gain } from "../model/Gain";
import { ProjectOps } from "../model/ProjectOps";
import type { Clip, MarkerName, Project, StoredBuffer, Track, Transport } from "../model/types";
import { StudioModes } from "./StudioModes";
import { Waveform } from "./Waveform";

const MARKERS: MarkerName[] = ["intro", "verse", "chorus", "bridge"];

export function Timeline({
  project,
  buffers,
  playheadSec,
  zoom,
  transport,
  recordStart,
  livePeaks,
  onSeek,
  onSelect,
  onPreview,
  onCommit,
  onArm,
  onMute,
  onSolo,
  onToggleEffect,
  onDesk,
  onPhrase,
}: {
  project: Project;
  buffers: Record<string, StoredBuffer>;
  playheadSec: number;
  zoom: number;
  transport: Transport;
  recordStart: number;
  livePeaks: Float32Array | null;
  onSeek: (sec: number) => void;
  onSelect: (trackId: string, clipId: string | null) => void;
  onPreview: (project: Project) => void;
  onCommit: (before: Project, project: Project) => void;
  onArm: (trackId: string) => void;
  onMute: (trackId: string) => void;
  onSolo: (trackId: string) => void;
  onToggleEffect: (trackId: string, effect: "eq" | "compressor" | "reverb") => void;
  onDesk: (item: DawCommand) => void;
  onPhrase: (text: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const seconds = Math.max(48, ProjectOps.contentEnd(project) + 8, playheadSec + 8, project.markers.bridge + 8);
  const laneWidth = Math.ceil(seconds * zoom);
  const bar = (60 / Math.max(1, project.bpm)) * 4;
  const regionStart = Math.floor(playheadSec / bar) * bar;

  useEffect(() => {
    if (transport === "stopped") return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const x = 272 + playheadSec * zoom;
    const viewRight = scroller.scrollLeft + scroller.clientWidth - 40;
    if (x > viewRight || x < scroller.scrollLeft + 280) {
      scroller.scrollLeft = Math.max(0, x - 320);
    }
  }, [playheadSec, transport, zoom]);

  return (
    <div className="arrangement" data-surfaces={StudioModes.surfaces("creator").join(" ")}>
      <div className="arrange-tools" role="toolbar" aria-label="Arrangement">
        <button type="button" onClick={() => onPhrase("loop 4 bars")}>Loop 4</button>
        <button type="button" onClick={() => onPhrase("stop looping")} disabled={!project.loop}>Clear loop</button>
        <button type="button" onClick={() => onDesk(command("session", "punch-region", `${regionStart}:${regionStart + bar * 4}`))}>Punch 4</button>
        <button type="button" onClick={() => onDesk(command("session", "punch-region", "clear"))} disabled={!project.punch}>Clear punch</button>
      </div>
      <div className="timeline" ref={scrollerRef}>
      <div className="sheet" style={{ width: 272 + laneWidth }}>
        <div className="ruler-row">
          <div className="gutter ruler-gutter">Timeline</div>
          <div
            className="ruler"
            style={{ width: laneWidth }}
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              const rect = event.currentTarget.getBoundingClientRect();
              onSeek(Math.max(0, (event.clientX - rect.left) / zoom));
            }}
          >
            {Array.from({ length: Math.ceil(seconds) + 1 }, (_, second) => (
              <span key={second} className={second % 5 === 0 ? "tick major" : "tick"} style={{ left: second * zoom }}>
                {second % 5 === 0 ? FormatSeconds.label(second) : ""}
              </span>
            ))}
            {MARKERS.map((marker) => (
              <button
                key={marker}
                type="button"
                className="marker"
                aria-label={`${DeskCommands.markerLabel(marker)} section`}
                style={{ left: project.markers[marker] * zoom }}
                onClick={() => onDesk(command("session", "marker-at", `${marker}:${playheadSec}`))}
              >
                {DeskCommands.markerLabel(marker)}
              </button>
            ))}
          </div>
        </div>
        {project.tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            project={project}
            buffers={buffers}
            zoom={zoom}
            laneWidth={laneWidth}
            selected={project.selectedTrackId === track.id}
            transport={transport}
            playheadSec={playheadSec}
            recordStart={recordStart}
            livePeaks={livePeaks}
            onSeek={onSeek}
            onSelect={onSelect}
            onPreview={onPreview}
            onCommit={onCommit}
            onArm={onArm}
            onMute={onMute}
            onSolo={onSolo}
            onToggleEffect={onToggleEffect}
            onDesk={onDesk}
          />
        ))}
        {project.punch ? (
          <div
            className="punch-region"
            style={{ left: 272 + project.punch.startSec * zoom, width: Math.max(2, (project.punch.endSec - project.punch.startSec) * zoom) }}
          />
        ) : null}
        {project.loop ? (
          <div
            className="loop-region"
            style={{ left: 272 + project.loop.startSec * zoom, width: Math.max(2, (project.loop.endSec - project.loop.startSec) * zoom) }}
          />
        ) : null}
        <div className="playhead" style={{ left: 272 + playheadSec * zoom }} />
      </div>
      </div>
    </div>
  );
}

function TrackRow({
  track,
  project,
  buffers,
  zoom,
  laneWidth,
  selected,
  transport,
  playheadSec,
  recordStart,
  livePeaks,
  onSeek,
  onSelect,
  onPreview,
  onCommit,
  onArm,
  onMute,
  onSolo,
  onToggleEffect,
  onDesk,
}: {
  track: Track;
  project: Project;
  buffers: Record<string, StoredBuffer>;
  zoom: number;
  laneWidth: number;
  selected: boolean;
  transport: Transport;
  playheadSec: number;
  recordStart: number;
  livePeaks: Float32Array | null;
  onSeek: (sec: number) => void;
  onSelect: (trackId: string, clipId: string | null) => void;
  onPreview: (project: Project) => void;
  onCommit: (before: Project, project: Project) => void;
  onArm: (trackId: string) => void;
  onMute: (trackId: string) => void;
  onSolo: (trackId: string) => void;
  onToggleEffect: (trackId: string, effect: "eq" | "compressor" | "reverb") => void;
  onDesk: (item: DawCommand) => void;
}) {
  const origin = useRef(project);
  const editing = useRef(false);
  function beginEdit() {
    if (editing.current) return;
    editing.current = true;
    origin.current = project;
  }
  function endEdit() {
    if (!editing.current) return;
    editing.current = false;
    onCommit(origin.current, project);
  }
  return (
    <div className={`track-row ${selected ? "selected" : ""}`}>
      <div className="track-head">
        <div className="track-title">
          <span className="swatch" style={{ background: track.color }} />
          <input
            aria-label={`${track.name} name`}
            value={track.name}
            onFocus={beginEdit}
            onChange={(event) => onPreview(setTrack(project, track.id, { name: event.target.value }))}
            onBlur={endEdit}
          />
        </div>
        <div className="track-buttons">
          <button type="button" className="arm" aria-pressed={track.armed} onClick={() => onArm(track.id)}>
            Arm
          </button>
          <button type="button" aria-pressed={track.mute} onClick={() => onMute(track.id)}>M</button>
          <button type="button" aria-pressed={track.solo} onClick={() => onSolo(track.id)}>S</button>
        </div>
        <label className="slider compact">
          <span>{Gain.format(track.gainDb)}</span>
          <input
            type="range"
            min={Gain.MIN_DB}
            max={Gain.MAX_DB}
            step="0.1"
            value={track.gainDb}
            aria-label={`${track.name} volume`}
            aria-valuetext={`${track.name} volume ${Gain.format(track.gainDb)}`}
            onPointerDown={beginEdit}
            onFocus={beginEdit}
            onChange={(event) => onPreview(setTrack(project, track.id, { gainDb: Number(event.target.value) }))}
            onPointerUp={endEdit}
            onBlur={endEdit}
          />
        </label>
        <label className="slider compact">
          <span>Pan {panLabel(track.pan)}</span>
          <input
            type="range"
            min={-100}
            max={100}
            step="1"
            value={Math.round(track.pan * 100)}
            aria-label={`${track.name} pan`}
            aria-valuetext={`${track.name} pan ${panLabel(track.pan)}`}
            onPointerDown={beginEdit}
            onFocus={beginEdit}
            onChange={(event) => onPreview(setTrack(project, track.id, { pan: Number(event.target.value) / 100 }))}
            onPointerUp={endEdit}
            onBlur={endEdit}
          />
        </label>
        <div className="fx">
          <button type="button" aria-pressed={track.eq.enabled} onClick={() => onToggleEffect(track.id, "eq")}>EQ</button>
          <button type="button" aria-pressed={track.compressor.enabled} onClick={() => onToggleEffect(track.id, "compressor")}>Comp</button>
          <button type="button" aria-pressed={track.reverb.enabled} onClick={() => onToggleEffect(track.id, "reverb")}>Verb</button>
        </div>
      </div>
      <div
        className="lane"
        style={{ width: laneWidth }}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest(".clip, .take-row, button")) return;
          const rect = event.currentTarget.getBoundingClientRect();
          onSelect(track.id, null);
          onSeek(Math.max(0, (event.clientX - rect.left) / zoom));
        }}
      >
        {track.clips.length === 0 && !(transport === "recording" && track.armed) ? (
          <p className="empty-lane">Arm this track and hit record.</p>
        ) : null}
        {track.clips.map((clip) => (
          <ClipView
            key={clip.id}
            clip={clip}
            track={track}
            project={project}
            buffers={buffers}
            zoom={zoom}
            selected={project.selectedClipId === clip.id}
            onSeek={onSeek}
            onSelect={onSelect}
            onPreview={onPreview}
            onCommit={onCommit}
          />
        ))}
        {transport === "recording" && track.armed ? (
          <div
            className="clip recording"
            style={{ left: Math.max(0, recordStart) * zoom, width: Math.max(8, (playheadSec - recordStart) * zoom) }}
          >
            {livePeaks ? <Waveform peaks={livePeaks} color={track.color} width={Math.max(8, (playheadSec - recordStart) * zoom)} height={64} /> : null}
          </div>
        ) : null}
        {track.takes.length > 0 ? (
          <div className="comp-lanes" aria-label={`${track.name} takes`}>
            {track.takes.map((take) => (
              <div key={take.id} className="take-row">
                <button type="button" onClick={() => onDesk(command(track.name, "use-take", take.number))}>
                  Use take {take.number}
                </button>
                <span>{take.durationSec.toFixed(1)}s{take.words.length > 0 ? ` · ${take.words.map((word) => word.text).join(" ")}` : ""}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ClipView({
  clip,
  track,
  project,
  buffers,
  zoom,
  selected,
  onSeek,
  onSelect,
  onPreview,
  onCommit,
}: {
  clip: Clip;
  track: Track;
  project: Project;
  buffers: Record<string, StoredBuffer>;
  zoom: number;
  selected: boolean;
  onSeek: (sec: number) => void;
  onSelect: (trackId: string, clipId: string | null) => void;
  onPreview: (project: Project) => void;
  onCommit: (before: Project, project: Project) => void;
}) {
  const width = Math.max(8, clip.durationSec * zoom);
  const peaks = useMemo(() => {
    const stored = buffers[clip.bufferId];
    const channel = stored?.channels[0];
    if (!stored || !channel) return new Float32Array();
    const slice = Peaks.slice(channel, stored.sampleRate, clip.offsetSec, clip.durationSec);
    return Peaks.compute(slice, Math.max(8, Math.floor(width / 2)));
  }, [buffers, clip.bufferId, clip.offsetSec, clip.durationSec, width]);

  return (
    <div
      className={`clip ${selected ? "selected" : ""}`}
      style={{ left: clip.startSec * zoom, width, borderColor: track.color }}
      onPointerDown={(event) => {
        event.stopPropagation();
        const element = event.currentTarget;
        const bounds = element.getBoundingClientRect();
        const local = event.clientX - bounds.left;
        const edge = local < 8 ? "start" : local > bounds.width - 8 ? "end" : "body";
        const startX = event.clientX;
        const origin = clip;
        const before = project;
        let moved = false;
        let latest = before;
        function move(ev: PointerEvent) {
          const delta = (ev.clientX - startX) / zoom;
          if (Math.abs(ev.clientX - startX) < 3) return;
          moved = true;
          const next = edge === "start"
            ? ClipEdits.trimStartBy(origin, delta)
            : edge === "end"
              ? ClipEdits.trimEndBy(origin, delta)
              : ClipEdits.move(origin, origin.startSec + delta);
          latest = ProjectOps.replaceClip(before, origin.id, next);
          onPreview(latest);
        }
        function up(ev: PointerEvent) {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          if (!moved) {
            onSelect(track.id, origin.id);
            onSeek(origin.startSec + Math.max(0, (ev.clientX - bounds.left) / zoom));
            return;
          }
          onCommit(before, latest);
        }
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      <Waveform peaks={peaks} color={track.color} width={width - 2} height={64} />
    </div>
  );
}

function setTrack(project: Project, trackId: string, patch: Partial<Track>): Project {
  return {
    ...project,
    tracks: project.tracks.map((track) => (track.id === trackId ? { ...track, ...patch } : track)),
  };
}

function panLabel(value: number): string {
  if (value < -0.05) return `${Math.round(Math.abs(value) * 100)} L`;
  if (value > 0.05) return `${Math.round(value * 100)} R`;
  return "C";
}

class FormatSeconds {
  static label(second: number): string {
    const minutes = Math.floor(second / 60);
    const seconds = second % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
}
