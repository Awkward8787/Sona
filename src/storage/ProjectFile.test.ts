import { describe, expect, it } from "vitest";
import { ProjectFactory } from "../model/ProjectFactory";
import type { Project, StoredBuffer } from "../model/types";
import { ProjectFile } from "./ProjectFile";

describe("project file", () => {
  it("round-trips the session and fills buses on an older file", () => {
    const project = ProjectFactory.create("Booth");
    project.tracks[0]!.gainDb = -3;
    const buffer: StoredBuffer = {
      id: "raw-1",
      sampleRate: 8,
      channels: [Float32Array.from([0, 0.5, -0.25, 0.125])],
    };
    const text = ProjectFile.pack(project, { [buffer.id]: buffer });
    const unpacked = ProjectFile.unpack(text);
    expect(unpacked?.project.name).toBe("Booth");
    expect(unpacked?.project.tracks[0]?.gainDb).toBe(-3);
    expect(Array.from(unpacked?.buffers[buffer.id]?.channels[0] ?? [])).toEqual([0, 0.5, -0.25, 0.125]);

    const legacy = JSON.parse(text) as { project: Project };
    delete (legacy.project as { buses?: unknown }).buses;
    delete (legacy.project as { punch?: unknown }).punch;
    delete (legacy.project.tracks[0] as { deesser?: unknown }).deesser;
    const hydrated = ProjectFile.unpack(JSON.stringify(legacy));
    expect(hydrated?.project.buses.map((bus) => bus.id)).toEqual(["bus-vocals", "bus-beat", "bus-reverb", "bus-delay"]);
    expect(hydrated?.project.punch).toBeNull();
    expect(hydrated?.project.tracks[0]?.deesser.enabled).toBe(false);
    expect(hydrated?.project.tracks[0]?.gainDb).toBe(-3);
  });
});
