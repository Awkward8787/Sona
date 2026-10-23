import { useMemo } from "react";
import { Peaks } from "../audio/Peaks";
import { Format } from "../model/Format";
import type { ListenChannel } from "../listen/ListenContext";
import type { Project, StoredBuffer, Transport } from "../model/types";
import { Waveform } from "./Waveform";

export function ArtistStage({
  project,
  buffers,
  transport,
  playheadSec,
  channel,
  findSeconds,
  livePeaks,
}: {
  project: Project;
  buffers: Record<string, StoredBuffer>;
  transport: Transport;
  playheadSec: number;
  channel: ListenChannel;
  findSeconds: number | null;
  livePeaks: Float32Array | null;
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

  return (
    <section className="artist" aria-label="Artist mode">
      <div className="artist-status">
        <p className={`record-lamp ${transport}`} aria-live="polite">{status}</p>
        <p>{Format.time(playheadSec)} · {project.bpm} BPM</p>
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
    </section>
  );
}
