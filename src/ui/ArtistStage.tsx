import { useMemo } from "react";
import { Peaks } from "../audio/Peaks";
import { describeCommand, type CommandLogEntry } from "../daw/DawCommand";
import type { EarNote } from "../ears/SonaEars";
import { Format } from "../model/Format";
import type { ListenChannel } from "../listen/ListenContext";
import type { Project, StoredBuffer, Transport } from "../model/types";
import { StudioModes } from "./StudioModes";
import { Waveform } from "./Waveform";

export function ArtistStage({
  project,
  buffers,
  transport,
  playheadSec,
  channel,
  findSeconds,
  livePeaks,
  heard,
  did,
  onUseTake,
}: {
  project: Project;
  buffers: Record<string, StoredBuffer>;
  transport: Transport;
  playheadSec: number;
  channel: ListenChannel;
  findSeconds: number | null;
  livePeaks: Float32Array | null;
  heard: EarNote[];
  did: CommandLogEntry[];
  onUseTake: (trackName: string, take: number) => void;
}) {
  const armed = project.tracks.filter((track) => track.armed).map((track) => track.name);
  const lyrics = project.tracks.flatMap((track) => track.takes.flatMap((take) => take.words.map((word) => word.text)));
  const clip = useMemo(() => {
    const selected = project.tracks.find((track) => track.id === project.selectedTrackId) ?? project.tracks[0];
    const last = selected?.clips[selected.clips.length - 1] ?? project.tracks.flatMap((track) => track.clips).at(-1);
    return last ?? null;
  }, [project]);
  const peaks = useMemo(() => {
    if (transport === "recording" && livePeaks) return livePeaks;
    if (!clip) return new Float32Array();
    const channelData = buffers[clip.bufferId]?.channels[0];
    if (!channelData) return new Float32Array();
    return Peaks.compute(channelData, 96);
  }, [buffers, clip, livePeaks, transport]);

  const status = transport === "recording" ? "Recording" : transport === "playing" ? "Playing" : "Stopped";

  const takes = project.tracks.flatMap((track) => track.takes.map((take) => ({ track, take })));
  const recent = did.slice(-4).reverse();

  return (
    <section className="artist" aria-label="Artist mode" data-surfaces={StudioModes.surfaces("artist").join(" ")}>
      <div className="artist-status">
        <p className={`record-lamp ${transport}`} aria-live="polite">{status}</p>
        <p className="artist-time">{Format.time(playheadSec)} · {project.bpm} BPM</p>
        <p>{armed.length > 0 ? `Armed ${armed.join(", ")}` : "Nothing armed"}</p>
        <p className="channel">Listening: {channel}</p>
        {findSeconds != null ? <p>Find my mic · {findSeconds}s left</p> : null}
      </div>
      <div className="artist-wave" aria-hidden="true">
        <Waveform peaks={peaks} color="#e6c48a" width={640} height={120} />
      </div>
      <div className="lyrics">
        <p className="section-label">Lyrics</p>
        {lyrics.length > 0 ? <p>{lyrics.join(" ")}</p> : (
          <p className="section-note">Words from a real take land here. While recording, speech stays in the performance unless you say SONA.</p>
        )}
      </div>
      <div className="booth-grid">
        <div>
          <p className="section-label">Takes</p>
          {takes.length === 0 ? <p className="section-note">No takes yet. Record, or load a scratch vocal if this browser has no mic.</p> : null}
          <ul className="take-list">
            {takes.map(({ track, take }) => (
              <li key={take.id}>
                <button type="button" onClick={() => onUseTake(track.name, take.number)}>
                  Use take {take.number}
                </button>
                <span>{track.name} · {Format.time(take.startSec)} · {take.durationSec.toFixed(1)}s</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="section-label">What SONA heard</p>
          {heard.length === 0 ? <p className="section-note">Ears reads the audio after a take. It does not read the lyric.</p> : null}
          <ul className="heard-list">
            {heard.map((note) => (
              <li key={note.id}><strong>{note.summary}</strong> {note.offer}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="section-label">What SONA did</p>
          {recent.length === 0 ? <p className="section-note">Commands land here after SONA runs them.</p> : null}
          <ul className="did-list">
            {recent.map((entry) => (
              <li key={entry.id}><code>{describeCommand(entry)}</code></li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
