import { describe, expect, it } from "vitest";
import { LlmIntent } from "./LlmIntent";

describe("LlmIntent", () => {
  it("stays off without an endpoint", () => {
    expect(LlmIntent.enabled()).toBe(false);
  });

  it("accepts a well-formed intent and rejects prose", () => {
    expect(LlmIntent.coerce({
      type: "volume",
      target: { kind: "name", name: "vocal" },
      mode: "relative",
      db: -1.5,
    })).toEqual({
      type: "volume",
      target: { kind: "name", name: "vocal" },
      mode: "relative",
      db: -1.5,
    });
    expect(LlmIntent.coerce({ type: "record", at: { kind: "marker", marker: "chorus" } })).toMatchObject({
      type: "record",
    });
    expect(LlmIntent.coerce({ type: "loop", mode: "bars", bars: 4 })).toEqual({ type: "loop", mode: "bars", bars: 4 });
    expect(LlmIntent.coerce({ intent: "bounce it" })).toBeNull();
    expect(LlmIntent.coerce({ type: "volume", target: { kind: "name" }, mode: "relative", db: 1 })).toBeNull();
    expect(LlmIntent.coerce(null)).toBeNull();
  });
});
