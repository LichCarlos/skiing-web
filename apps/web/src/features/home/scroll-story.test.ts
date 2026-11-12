import { describe, expect, it } from "vitest";
import { openingFrame } from "@/features/home/home-opening";
import {
  railTimelineDistance,
  railTimelineOffset,
} from "@/features/home/scroll-rail";

describe("scroll story timing", () => {
  it("starts with lettering and replaces phrases only under fully opaque grid tiles", () => {
    const first = openingFrame(0);
    expect(first.first).toBe(1);
    expect(first.cover).toBe(0);
    expect(first.second).toBe(0);
    const second = openingFrame(0.55);
    expect(second.first).toBe(0);
    expect(second.second).toBe(1);
    expect(second.cover).toBe(0);
    expect(second.mountain).toBe(0);
    expect(openingFrame(0.95).mountain).toBe(1);
    expect(openingFrame(0.35999).cover).toBe(1);
    expect(openingFrame(0.36).cover).toBe(1);
    expect(openingFrame(0.73999).cover).toBe(1);
    expect(openingFrame(0.74).cover).toBe(1);
    for (let p = 0; p <= 1; p += 0.005) {
      const frame = openingFrame(p);
      expect([0, 1]).toContain(frame.first);
      expect([0, 1]).toContain(frame.second);
      expect(frame.first * frame.second).toBe(0);
      if (frame.mountain > 0) expect(frame.first + frame.second).toBe(0);
    }
  });
  it("holds every card for 360 scroll pixels, including the last card", () => {
    const stops = [0, 420, 840];
    expect(railTimelineOffset(0, stops)).toBe(0);
    expect(railTimelineOffset(359, stops)).toBe(0);
    expect(railTimelineOffset(780, stops)).toBe(420);
    expect(railTimelineOffset(1139, stops)).toBe(420);
    expect(railTimelineOffset(1560, stops)).toBe(840);
    expect(railTimelineOffset(1920, stops)).toBe(840);
  });
  it("maps keyboard/control targets through eased travel in either direction", () => {
    const stops = [0, 420, 840];
    for (const offset of [0, 1, 210, 419, 420, 421, 700, 840])
      expect(
        railTimelineOffset(railTimelineDistance(offset, stops), stops),
      ).toBeCloseTo(offset, 3);
    let previous = -1;
    for (let distance = 0; distance < 2000; distance += 10) {
      const offset = railTimelineOffset(distance, stops);
      expect(offset).toBeGreaterThanOrEqual(previous);
      previous = offset;
    }
  });
});
