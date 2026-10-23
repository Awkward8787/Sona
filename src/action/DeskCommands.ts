import { command, type DawCommand } from "../daw/DawCommand";
import { ClipEdits } from "../model/ClipEdits";
import { Ids } from "../model/Ids";
import { Gain } from "../model/Gain";
import { ProjectOps } from "../model/ProjectOps";
import type { AutomationPoint, Bus, Clip, MarkerName, Project, Track, Transport } from "../model/types";
import { VolumeAutomation } from "../model/VolumeAutomation";

export interface DeskEdit {
  project: Project;
  inverse: DawCommand;
  reply: string;
}

const MARKERS: MarkerName[] = ["intro", "verse", "chorus", "bridge"];

/**
 * Mixer and arrangement writes.
 * Every edit returns the command that puts the previous value back.
 */
export class DeskCommands {
  static handles(action: string): boolean {
    return (
      action === "clip-set"
      || action === "clips-set"
      || action === "split"
      || action === "trim"
      || action === "marker-at"
      || action === "loop-range"
      || action === "punch-region"
      || action === "automation-set"
      || action === "use-take"
      || action === "deesser"
      || action === "eq-band"
      || action === "comp-threshold"
      || action === "send-level"
      || action === "tune-enable"
      || action === "bus-assign"
      || action === "bus-gain"
      || action === "bus-pan"
      || action === "bus-mute"
      || action === "bus-solo"
      || action === "select"
    );
  }

  static apply(project: Project, item: DawCommand, playheadSec: number, transport: Transport): DeskEdit | null {
    if (!DeskCommands.handles(item.action)) return null;
    if ((item.action === "split" || item.action === "trim") && transport === "recording") {
      return DeskCommands.hold(project, item, "Stop the take before we cut.");
    }
    if (item.action === "select") return DeskCommands.select(project, item);
    if (item.action === "clip-set") return DeskCommands.clipSet(project, item);
    if (item.action === "clips-set") return DeskCommands.clipsSet(project, item);
    if (item.action === "split") return DeskCommands.split(project, item, playheadSec);
    if (item.action === "trim") return DeskCommands.trim(project, item, playheadSec);
    if (item.action === "marker-at") return DeskCommands.markerAt(project, item);
    if (item.action === "loop-range") return DeskCommands.loopRange(project, item);
    if (item.action === "punch-region") return DeskCommands.punchRegion(project, item);
    if (item.action === "automation-set") return DeskCommands.automation(project, item);
    if (item.action === "use-take") return DeskCommands.placeTake(project, item);
    if (item.action === "deesser") return DeskCommands.deesser(project, item);
    if (item.action === "eq-band") return DeskCommands.eqBand(project, item);
    if (item.action === "comp-threshold") return DeskCommands.compThreshold(project, item);
    if (item.action === "send-level") return DeskCommands.sendLevel(project, item);
    if (item.action === "tune-enable") return DeskCommands.tuneEnable(project, item);
    if (item.action === "bus-assign") return DeskCommands.busAssign(project, item);
    if (item.action === "bus-gain" || item.action === "bus-pan" || item.action === "bus-mute" || item.action === "bus-solo") {
      return DeskCommands.busMix(project, item);
    }
    return null;
  }

  private static select(project: Project, item: DawCommand): DeskEdit {
    const track = DeskCommands.track(project, item.track);
    if (!track) return DeskCommands.hold(project, item, "I don't see that track.");
    const clipId = item.amount === "none" ? null : typeof item.amount === "string" ? item.amount : project.selectedClipId;
    const previous = project.tracks.find((entry) => entry.id === project.selectedTrackId);
    if (project.selectedTrackId === track.id && project.selectedClipId === clipId) {
      return DeskCommands.hold(project, item, `${track.name} is already selected.`);
    }
    return {
      project: ProjectOps.touch(project, { selectedTrackId: track.id, selectedClipId: clipId }),
      inverse: command(previous?.name ?? track.name, "select", project.selectedClipId ?? "none"),
      reply: `${track.name} is selected.`,
    };
  }

  private static clipSet(project: Project, item: DawCommand): DeskEdit {
    const clip = DeskCommands.parseClip(item.amount);
    if (!clip) return DeskCommands.hold(project, item, "That clip edit didn't parse.");
    const found = DeskCommands.findClip(project, clip.id);
    if (!found) return DeskCommands.hold(project, item, "That clip isn't on the session.");
    return {
      project: ProjectOps.replaceClip(project, clip.id, clip),
      inverse: command(found.track.name, "clip-set", JSON.stringify(found.clip)),
      reply: `Moved ${found.track.name}.`,
    };
  }

  private static clipsSet(project: Project, item: DawCommand): DeskEdit {
    const clips = DeskCommands.parseClips(item.amount);
    const track = DeskCommands.track(project, item.track);
    if (!clips || !track) return DeskCommands.hold(project, item, "Those clips didn't parse.");
    return {
      project: ProjectOps.updateTrack(project, track.id, (itemTrack) => ({ ...itemTrack, clips })),
      inverse: command(track.name, "clips-set", JSON.stringify(track.clips)),
      reply: `${track.name} clips are back in place.`,
    };
  }

  private static split(project: Project, item: DawCommand, playheadSec: number): DeskEdit {
    const found = ProjectOps.findClip(project, playheadSec);
    if (!found) return DeskCommands.hold(project, item, "Move the playhead into a clip and I'll cut it.");
    const parts = ClipEdits.split(found.clip, playheadSec);
    if (!parts) return DeskCommands.hold(project, item, "The playhead is on the edge. Move into the clip.");
    return {
      project: ProjectOps.replaceClip(project, found.clip.id, parts[0], parts[1]),
      inverse: command(found.track.name, "clips-set", JSON.stringify(found.track.clips)),
      reply: `Split ${found.track.name}.`,
    };
  }

  private static trim(project: Project, item: DawCommand, playheadSec: number): DeskEdit {
    if (typeof item.amount !== "string") return DeskCommands.hold(project, item, "Tell me which edge to trim.");
    const [edge, seconds] = item.amount.split(":");
    const parsed = seconds ? Number(seconds) : null;
    if (edge !== "start" && edge !== "end" && edge !== "auto") {
      return DeskCommands.hold(project, item, "Tell me which edge to trim.");
    }
    const found = ProjectOps.findClip(project, playheadSec);
    const edited = ProjectOps.applyTrim(project, playheadSec, edge, Number.isFinite(parsed) ? parsed : null);
    if (!found || !edited) return DeskCommands.hold(project, item, "Move the playhead into a clip and I'll trim it.");
    return {
      project: edited.project,
      inverse: command(found.track.name, "clips-set", JSON.stringify(found.track.clips)),
      reply: `Trimmed ${found.track.name}.`,
    };
  }

  private static markerAt(project: Project, item: DawCommand): DeskEdit {
    if (typeof item.amount !== "string") return DeskCommands.hold(project, item, "Name the section.");
    const [name, raw] = item.amount.split(":");
    const time = Number(raw);
    if (!DeskCommands.isMarker(name) || !Number.isFinite(time)) return DeskCommands.hold(project, item, "Name the section.");
    const previous = project.markers[name];
    return {
      project: ProjectOps.touch(project, { markers: { ...project.markers, [name]: Math.max(0, time) } }),
      inverse: command("session", "marker-at", `${name}:${previous}`),
      reply: `${DeskCommands.markerLabel(name)} is at ${Math.max(0, time).toFixed(1)}s.`,
    };
  }

  private static loopRange(project: Project, item: DawCommand): DeskEdit {
    const inverse = command("session", "loop-range", DeskCommands.regionAmount(project.loop));
    if (item.amount === "clear") {
      return { project: ProjectOps.touch(project, { loop: null }), inverse, reply: "Loop is clear." };
    }
    const region = DeskCommands.parseRegion(item.amount);
    if (!region) return DeskCommands.hold(project, item, "The loop end has to come after the start.");
    return { project: ProjectOps.touch(project, { loop: region }), inverse, reply: "Loop is set." };
  }

  private static punchRegion(project: Project, item: DawCommand): DeskEdit {
    const inverse = command("session", "punch-region", DeskCommands.regionAmount(project.punch));
    if (item.amount === "clear") {
      return { project: ProjectOps.touch(project, { punch: null }), inverse, reply: "Punch region is clear." };
    }
    const region = DeskCommands.parseRegion(item.amount);
    if (!region) return DeskCommands.hold(project, item, "The punch out has to come after the punch in.");
    return { project: ProjectOps.touch(project, { punch: region }), inverse, reply: "Punch region is set. Record stays inside it." };
  }

  private static automation(project: Project, item: DawCommand): DeskEdit {
    const points = DeskCommands.parsePoints(item.amount);
    const track = DeskCommands.track(project, item.track);
    if (!points || !track) return DeskCommands.hold(project, item, "Those volume points didn't parse.");
    return {
      project: ProjectOps.updateTrack(project, track.id, (itemTrack) => ({
        ...itemTrack,
        automation: VolumeAutomation.ordered(points),
      })),
      inverse: command(track.name, "automation-set", JSON.stringify(track.automation)),
      reply: points.length === 0 ? `${track.name} volume automation is clear.` : `${track.name} volume automation is updated.`,
    };
  }

  private static placeTake(project: Project, item: DawCommand): DeskEdit {
    const track = DeskCommands.track(project, item.track);
    const number = typeof item.amount === "number" ? item.amount : Number(item.amount);
    if (!track || !Number.isFinite(number)) return DeskCommands.hold(project, item, "Name the take.");
    const take = track.takes.find((entry) => entry.number === number);
    if (!take) return DeskCommands.hold(project, item, `I don't see take ${number} on ${track.name}.`);
    const clip: Clip = {
      id: Ids.next(),
      bufferId: take.rawBufferId,
      startSec: take.startSec,
      offsetSec: 0,
      durationSec: take.durationSec,
      sourceDurationSec: take.durationSec,
    };
    return {
      project: ProjectOps.updateTrack(project, track.id, (itemTrack) => ({ ...itemTrack, clips: [clip] })),
      inverse: command(track.name, "clips-set", JSON.stringify(track.clips)),
      reply: `${track.name} is now take ${number}. The other takes stay in the lanes.`,
    };
  }

  private static deesser(project: Project, item: DawCommand): DeskEdit {
    const track = DeskCommands.track(project, item.track);
    if (!track || typeof item.amount !== "string") return DeskCommands.hold(project, item, "Name the track to de-ess.");
    const current = track.deesser;
    if (item.amount === "on" || item.amount === "off") {
      const enabled = item.amount === "on";
      return {
        project: ProjectOps.updateTrack(project, track.id, (itemTrack) => ({ ...itemTrack, deesser: { ...current, enabled } })),
        inverse: command(track.name, "deesser", current.enabled ? "on" : "off"),
        reply: enabled ? `De-esser is on ${track.name}.` : `De-esser is off ${track.name}.`,
      };
    }
    const [field, raw] = item.amount.split(":");
    const value = Number(raw);
    if (!Number.isFinite(value) || (field !== "threshold" && field !== "frequency" && field !== "ratio")) {
      return DeskCommands.hold(project, item, "Set the de-esser threshold, frequency, or ratio.");
    }
    const next = { ...current, enabled: true };
    if (field === "threshold") next.threshold = DeskCommands.clamp(value, -60, 0);
    if (field === "frequency") next.frequency = DeskCommands.clamp(value, 2000, 12000);
    if (field === "ratio") next.ratio = DeskCommands.clamp(value, 1, 20);
    return {
      project: ProjectOps.updateTrack(project, track.id, (itemTrack) => ({ ...itemTrack, deesser: next })),
      inverse: command(track.name, "deesser", `${field}:${current[field]}`),
      reply: `De-esser ${field} on ${track.name} is ${next[field]}.`,
    };
  }

  private static eqBand(project: Project, item: DawCommand): DeskEdit {
    const track = DeskCommands.track(project, item.track);
    if (!track || typeof item.amount !== "string") return DeskCommands.hold(project, item, "Name an EQ band.");
    const [band, raw, flag] = item.amount.split(":");
    const value = Number(raw);
    if ((band !== "low" && band !== "mid" && band !== "high") || !Number.isFinite(value)) {
      return DeskCommands.hold(project, item, "Name an EQ band.");
    }
    const key = band === "low" ? "lowDb" : band === "mid" ? "midDb" : "highDb";
    const enabled = flag === undefined ? true : flag === "1";
    const previous = track.eq[key];
    return {
      project: ProjectOps.updateTrack(project, track.id, (itemTrack) => ({
        ...itemTrack,
        eq: { ...itemTrack.eq, enabled, [key]: DeskCommands.clamp(value, -12, 12) },
      })),
      inverse: command(track.name, "eq-band", `${band}:${previous}:${track.eq.enabled ? 1 : 0}`),
      reply: `${track.name} ${band} EQ is ${value.toFixed(1)} dB.`,
    };
  }

  private static compThreshold(project: Project, item: DawCommand): DeskEdit {
    const track = DeskCommands.track(project, item.track);
    if (!track || typeof item.amount !== "string") return DeskCommands.hold(project, item, "Set a compressor threshold.");
    const [raw, flag] = item.amount.split(":");
    const value = Number(raw);
    if (!Number.isFinite(value)) return DeskCommands.hold(project, item, "Set a compressor threshold.");
    const enabled = flag === undefined ? true : flag === "1";
    return {
      project: ProjectOps.updateTrack(project, track.id, (itemTrack) => ({
        ...itemTrack,
        compressor: { ...itemTrack.compressor, enabled, threshold: DeskCommands.clamp(value, -60, 0) },
      })),
      inverse: command(track.name, "comp-threshold", `${track.compressor.threshold}:${track.compressor.enabled ? 1 : 0}`),
      reply: `${track.name} compressor threshold is ${value.toFixed(0)} dB.`,
    };
  }

  private static sendLevel(project: Project, item: DawCommand): DeskEdit {
    const track = DeskCommands.track(project, item.track);
    if (!track || typeof item.amount !== "string") return DeskCommands.hold(project, item, "Name the reverb or delay send.");
    const [which, raw, flag] = item.amount.split(":");
    const value = Number(raw);
    if ((which !== "reverb" && which !== "delay") || !Number.isFinite(value)) {
      return DeskCommands.hold(project, item, "Name the reverb or delay send.");
    }
    const mix = DeskCommands.clamp(value, 0, 1);
    const enabled = flag === undefined ? mix > 0 : flag === "1";
    if (which === "reverb") {
      return {
        project: ProjectOps.updateTrack(project, track.id, (itemTrack) => ({
          ...itemTrack,
          reverb: { ...itemTrack.reverb, enabled, mix },
        })),
        inverse: command(track.name, "send-level", `reverb:${track.reverb.mix}:${track.reverb.enabled ? 1 : 0}`),
        reply: `${track.name} reverb send is ${Math.round(mix * 100)}%.`,
      };
    }
    return {
      project: ProjectOps.updateTrack(project, track.id, (itemTrack) => ({
        ...itemTrack,
        delay: { ...itemTrack.delay, enabled, mix },
      })),
      inverse: command(track.name, "send-level", `delay:${track.delay.mix}:${track.delay.enabled ? 1 : 0}`),
      reply: `${track.name} delay send is ${Math.round(mix * 100)}%.`,
    };
  }

  private static tuneEnable(project: Project, item: DawCommand): DeskEdit {
    const track = DeskCommands.track(project, item.track);
    if (!track || (item.amount !== "on" && item.amount !== "off")) return DeskCommands.hold(project, item, "Say tune on or off.");
    const enabled = item.amount === "on";
    return {
      project: ProjectOps.updateTrack(project, track.id, (itemTrack) => ({
        ...itemTrack,
        tune: { ...itemTrack.tune, enabled },
      })),
      inverse: command(track.name, "tune-enable", track.tune.enabled ? "on" : "off"),
      reply: enabled ? `Tune is on ${track.name}. Monophonic, not formant-preserving.` : `Tune is off ${track.name}.`,
    };
  }

  private static busAssign(project: Project, item: DawCommand): DeskEdit {
    const track = DeskCommands.track(project, item.track);
    const bus = project.buses.find((entry) => entry.id === item.amount || entry.name.toLowerCase() === String(item.amount).toLowerCase());
    if (!track || !bus || bus.kind !== "group") return DeskCommands.hold(project, item, "Pick a group bus.");
    return {
      project: ProjectOps.updateTrack(project, track.id, (itemTrack) => ({ ...itemTrack, busId: bus.id })),
      inverse: command(track.name, "bus-assign", track.busId),
      reply: `${track.name} goes to ${bus.name}.`,
    };
  }

  private static busMix(project: Project, item: DawCommand): DeskEdit {
    const bus = DeskCommands.bus(project, item.track);
    if (!bus) return DeskCommands.hold(project, item, "I don't see that bus.");
    if (item.action === "bus-gain" && typeof item.amount === "number") {
      const gainDb = Gain.clamp(item.amount);
      return {
        project: DeskCommands.replaceBus(project, bus.id, { gainDb }),
        inverse: command(bus.name, "bus-gain", bus.gainDb),
        reply: `${bus.name} is at ${Gain.format(gainDb)}.`,
      };
    }
    if (item.action === "bus-pan" && typeof item.amount === "number") {
      const pan = DeskCommands.clamp(item.amount, -1, 1);
      return {
        project: DeskCommands.replaceBus(project, bus.id, { pan }),
        inverse: command(bus.name, "bus-pan", bus.pan),
        reply: `${bus.name} pan is ${pan.toFixed(2)}.`,
      };
    }
    if (item.action === "bus-mute" && (item.amount === "on" || item.amount === "off")) {
      return {
        project: DeskCommands.replaceBus(project, bus.id, { mute: item.amount === "on" }),
        inverse: command(bus.name, "bus-mute", bus.mute ? "on" : "off"),
        reply: item.amount === "on" ? `${bus.name} is muted.` : `${bus.name} is open.`,
      };
    }
    if (item.action === "bus-solo" && (item.amount === "on" || item.amount === "off")) {
      return {
        project: DeskCommands.replaceBus(project, bus.id, { solo: item.amount === "on" }),
        inverse: command(bus.name, "bus-solo", bus.solo ? "on" : "off"),
        reply: item.amount === "on" ? `${bus.name} is soloed.` : `${bus.name} is out of solo.`,
      };
    }
    return DeskCommands.hold(project, item, "That bus move didn't parse.");
  }

  static markerLabel(marker: MarkerName): string {
    if (marker === "chorus") return "Hook";
    return marker.charAt(0).toUpperCase() + marker.slice(1);
  }

  private static replaceBus(project: Project, id: string, patch: Partial<Bus>): Project {
    return ProjectOps.touch(project, {
      buses: project.buses.map((bus) => (bus.id === id ? { ...bus, ...patch } : bus)),
    });
  }

  private static track(project: Project, name: string): Track | null {
    if (name === "selected") {
      return project.tracks.find((track) => track.id === project.selectedTrackId) ?? project.tracks[0] ?? null;
    }
    return project.tracks.find((track) => track.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  private static bus(project: Project, name: string): Bus | null {
    return project.buses.find((bus) => bus.name.toLowerCase() === name.toLowerCase() || bus.id === name) ?? null;
  }

  private static findClip(project: Project, clipId: string): { track: Track; clip: Clip } | null {
    for (const track of project.tracks) {
      const clip = track.clips.find((item) => item.id === clipId);
      if (clip) return { track, clip };
    }
    return null;
  }

  private static parseClip(amount: DawCommand["amount"]): Clip | null {
    if (typeof amount !== "string") return null;
    try {
      const clip = JSON.parse(amount) as Clip;
      if (!clip || typeof clip.id !== "string" || typeof clip.durationSec !== "number") return null;
      return clip;
    } catch {
      return null;
    }
  }

  private static parseClips(amount: DawCommand["amount"]): Clip[] | null {
    if (typeof amount !== "string") return null;
    try {
      const clips = JSON.parse(amount) as Clip[];
      if (!Array.isArray(clips)) return null;
      return clips;
    } catch {
      return null;
    }
  }

  private static parsePoints(amount: DawCommand["amount"]): AutomationPoint[] | null {
    if (typeof amount !== "string") return null;
    try {
      const points = JSON.parse(amount) as AutomationPoint[];
      if (!Array.isArray(points)) return null;
      if (points.some((point) => typeof point.id !== "string" || typeof point.timeSec !== "number" || typeof point.gainDb !== "number")) {
        return null;
      }
      return points;
    } catch {
      return null;
    }
  }

  private static parseRegion(amount: DawCommand["amount"]): { startSec: number; endSec: number } | null {
    if (typeof amount !== "string") return null;
    const [rawStart, rawEnd] = amount.split(":");
    const startSec = Number(rawStart);
    const endSec = Number(rawEnd);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) return null;
    return { startSec: Math.max(0, startSec), endSec };
  }

  private static regionAmount(region: { startSec: number; endSec: number } | null): string {
    return region ? `${region.startSec}:${region.endSec}` : "clear";
  }

  private static isMarker(value: string): value is MarkerName {
    return (MARKERS as string[]).includes(value);
  }

  private static clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private static hold(project: Project, item: DawCommand, reply: string): DeskEdit {
    return { project, inverse: command(item.track, "noop", null), reply };
  }
}
