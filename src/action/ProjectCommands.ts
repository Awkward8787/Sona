import { Ids } from "../model/Ids";
import { ProjectFactory } from "../model/ProjectFactory";
import { ProjectOps } from "../model/ProjectOps";
import type { MicMove, MixAxis } from "../engine/Intent";
import type { MarkerName, PreampId, Project, Take, Track, VirtualMicId } from "../model/types";
import { MicEngine } from "../mic/MicEngine";
import { CompTakes } from "../edit/CompTakes";
import { LyricPunch } from "../edit/LyricPunch";

export class ProjectCommands {
  static selected(project: Project): Track | null {
    return project.tracks.find((track) => track.id === project.selectedTrackId) ?? project.tracks[0] ?? null;
  }

  static micMove(project: Project, move: MicMove): { project: Project; reply: string } {
    return MicEngine.applyMove(project, move);
  }

  static mic(project: Project, micId: VirtualMicId): { project: Project; reply: string } {
    return MicEngine.applyMic(project, micId);
  }

  static preamp(project: Project, preampId: PreampId): { project: Project; reply: string } {
    return MicEngine.applyPreamp(project, preampId);
  }

  static mix(project: Project, axis: MixAxis): { project: Project; reply: string } {
    const track = ProjectCommands.selected(project);
    if (!track) return { project, reply: "There's no track to shape yet." };
    const next = ProjectOps.updateTrack(project, track.id, (item) => ProjectCommands.shape(item, axis));
    return { project: next, reply: `${track.name}: ${ProjectCommands.mixLabel(axis)}. Raw audio stays put.` };
  }

  static tune(project: Project, tighter: boolean | null, key: string | null, scale: "major" | "minor" | null): { project: Project; reply: string } {
    const track = ProjectCommands.selected(project);
    if (!track) return { project, reply: "There's no track to tune yet." };
    const tune = { ...track.tune };
    if (tighter === true) {
      tune.strength = Math.min(1, tune.strength + 0.25);
      tune.enabled = true;
    } else if (tighter === false) {
      tune.strength = Math.max(0, tune.strength - 0.25);
      tune.enabled = tune.strength > 0;
    } else if (!key) {
      tune.enabled = true;
    }
    if (key) tune.key = key;
    if (scale) tune.scale = scale;
    if (key) tune.enabled = true;
    const next = ProjectOps.updateTrack(project, track.id, (item) => ({ ...item, tune }));
    return {
      project: next,
      reply: `Tune on ${track.name} is ${Math.round(tune.strength * 100)}% toward ${tune.key} ${tune.scale}. It's monophonic and not formant-preserving.`,
    };
  }

  static widen(project: Project): { project: Project; reply: string } {
    const doubles = project.tracks.filter((track) => /double|ad-?lib/i.test(track.name));
    if (doubles.length >= 2) {
      let next = project;
      doubles.forEach((track, index) => {
        const pan = index % 2 === 0 ? -0.85 : 0.85;
        next = ProjectOps.updateTrack(next, track.id, (item) => ({ ...item, pan, width: 0.85 }));
      });
      return { project: next, reply: "Doubles are wider, split left and right. The raw takes are untouched." };
    }
    if (doubles.length === 1) {
      const only = doubles[0];
      if (!only) return { project, reply: "I don't see a doubles track." };
      const next = ProjectOps.updateTrack(project, only.id, (item) => ({ ...item, pan: item.pan || 0.72, width: 0.8 }));
      return { project: next, reply: `${only.name} is wider. The raw take is untouched.` };
    }
    const lead = project.tracks.find((track) => track.clips.length > 0 && /vocal|lead/i.test(track.name))
      ?? project.tracks.find((track) => track.clips.length > 0 && !/beat|instrumental/i.test(track.name));
    if (!lead || lead.clips.length === 0) {
      return { project, reply: "I don't have a vocal to double yet. Record a pass, then ask me to widen the doubles." };
    }
    const left = ProjectCommands.doubleTrack(lead, "Doubles L", project.tracks.length, -0.78);
    const right = ProjectCommands.doubleTrack(lead, "Doubles R", project.tracks.length + 1, 0.78);
    const next = ProjectOps.touch(project, { tracks: [...project.tracks, left, right] });
    return { project: next, reply: "Doubles are wide, left and right, off the same raw take. The lead is untouched." };
  }

  static punch(project: Project, playheadSec: number, phrase: string): { project: Project; playheadSec: number; reply: string; roll: boolean } {
    const takes = project.tracks.flatMap((track) => track.takes);
    const hit = LyricPunch.find(takes, phrase);
    if (!hit) {
      return { project, playheadSec, reply: `I don't have "${phrase}" on a take yet.`, roll: false };
    }
    let next = project;
    const host = project.tracks.find((track) => track.takes.some((take) => take.number === hit.takeNumber && LyricPunch.find([take], phrase)));
    if (host) next = ProjectOps.updateTrack(project, host.id, (track) => ({ ...track, armed: true }));
    return {
      project: next,
      playheadSec: hit.startSec,
      reply: `Punching in at "${phrase}" with a short pre-roll.`,
      roll: true,
    };
  }

  static comp(project: Project, assignments: Array<{ take: number; marker: MarkerName }>): { project: Project; reply: string } {
    const track = ProjectCommands.selected(project);
    if (!track) return { project, reply: "There's no track to comp." };
    const next = CompTakes.comp(project, track, assignments);
    if (!next) return { project, reply: "I couldn't find those takes on the selected track." };
    return { project: next, reply: "Comped those takes onto the track. The raw buffers are the same audio." };
  }

  static saveTake(project: Project): { project: Project; reply: string } {
    const track = ProjectCommands.selected(project);
    const clip = track?.clips.find((item) => item.id === project.selectedClipId) ?? track?.clips[track.clips.length - 1];
    if (!track || !clip) return { project, reply: "There's no audio to save as a take." };
    const take: Take = {
      id: Ids.next(),
      number: track.takes.length + 1,
      rawBufferId: clip.bufferId,
      startSec: clip.startSec,
      durationSec: clip.durationSec,
      words: [],
      micId: track.micId,
      preampId: track.preampId,
    };
    const next = ProjectOps.updateTrack(project, track.id, (item) => ({ ...item, takes: [...item.takes, take] }));
    return { project: next, reply: `Take ${take.number} is saved. That's the raw recording.` };
  }

  static deleteTake(project: Project, number: number): { project: Project; reply: string } {
    const track = ProjectCommands.selected(project);
    if (!track) return { project, reply: "There's no track to edit." };
    if (!track.takes.some((take) => take.number === number)) return { project, reply: `I don't see take ${number}.` };
    const next = ProjectOps.updateTrack(project, track.id, (item) => ({
      ...item,
      takes: item.takes.filter((take) => take.number !== number),
    }));
    return { project: next, reply: `Take ${number} is off the list. The raw audio is still in the session until you bounce.` };
  }

  private static doubleTrack(lead: Track, name: string, index: number, pan: number): Track {
    const track = ProjectFactory.track(name, index);
    return {
      ...track,
      armed: false,
      pan,
      width: 0.85,
      gainDb: -6,
      micId: lead.micId,
      preampId: lead.preampId,
      clips: lead.clips.map((clip) => ({ ...clip, id: Ids.next() })),
    };
  }

  private static shape(track: Track, axis: MixAxis): Track {
    if (axis === "brighter" || axis === "air" || axis === "harsh" || axis === "mud") {
      const eq = { ...track.eq, enabled: true };
      if (axis === "brighter") eq.highDb += 1.5;
      if (axis === "air") eq.highDb += 2.5;
      if (axis === "harsh") {
        eq.highDb -= 1.5;
        eq.midDb -= 1;
      }
      if (axis === "mud") eq.lowDb -= 2;
      return { ...track, eq };
    }
    if (axis === "reverb") {
      return {
        ...track,
        reverb: {
          ...track.reverb,
          enabled: true,
          mix: Math.min(0.8, track.reverb.mix + 0.12),
          decay: Math.min(4, track.reverb.decay + 0.35),
        },
      };
    }
    return {
      ...track,
      delay: { ...track.delay, enabled: true, mix: Math.max(track.delay.mix, 0.28) },
    };
  }

  private static mixLabel(axis: MixAxis): string {
    if (axis === "brighter") return "a little brighter";
    if (axis === "air") return "more air";
    if (axis === "harsh") return "less harsh";
    if (axis === "mud") return "low mids pulled back";
    if (axis === "reverb") return "a bigger reverb";
    return "a little delay";
  }

}
