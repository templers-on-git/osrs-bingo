import { describe, it, expect } from "vitest";
import { computeBracketBreakdown, computePointsOverTime } from "./analytics.js";

const easyBracket = { id: "bracket-easy", label: "Easy", points: 5 };
const hardBracket = { id: "bracket-hard", label: "Hard", points: 20 };

const tiles = [
  { id: "tile-1", point_brackets: easyBracket },
  { id: "tile-2", point_brackets: easyBracket },
  { id: "tile-3", point_brackets: hardBracket },
];

describe("computeBracketBreakdown", () => {
  it("counts completed vs total tiles per bracket, sorted by points descending", () => {
    const progressByTileId = {
      "tile-1": { completed: true },
      "tile-2": { completed: false },
      "tile-3": { completed: true },
    };

    const result = computeBracketBreakdown(tiles, progressByTileId);

    expect(result).toEqual([
      { bracketId: "bracket-hard", label: "Hard", points: 20, completedCount: 1, totalCount: 1 },
      { bracketId: "bracket-easy", label: "Easy", points: 5, completedCount: 1, totalCount: 2 },
    ]);
  });

  it("treats a tile with no progress row yet as not completed", () => {
    const result = computeBracketBreakdown(tiles, {});

    expect(result).toEqual([
      { bracketId: "bracket-hard", label: "Hard", points: 20, completedCount: 0, totalCount: 1 },
      { bracketId: "bracket-easy", label: "Easy", points: 5, completedCount: 0, totalCount: 2 },
    ]);
  });
});

describe("computePointsOverTime", () => {
  it("returns a cumulative points series starting at 0 at the given start time", () => {
    const progressRows = [
      { tileId: "tile-1", completed: true, completedAt: "2026-07-10T12:00:00.000Z" },
      { tileId: "tile-3", completed: true, completedAt: "2026-07-11T09:00:00.000Z" },
      { tileId: "tile-2", completed: false, completedAt: null },
    ];

    const result = computePointsOverTime(tiles, progressRows, "2026-07-10T00:00:00.000Z");

    expect(result).toEqual([
      { time: "2026-07-10T00:00:00.000Z", cumulativePoints: 0 },
      { time: "2026-07-10T12:00:00.000Z", cumulativePoints: 5 },
      { time: "2026-07-11T09:00:00.000Z", cumulativePoints: 25 },
    ]);
  });

  it("sorts out-of-order completions chronologically before accumulating", () => {
    const progressRows = [
      { tileId: "tile-3", completed: true, completedAt: "2026-07-11T09:00:00.000Z" },
      { tileId: "tile-1", completed: true, completedAt: "2026-07-10T12:00:00.000Z" },
    ];

    const result = computePointsOverTime(tiles, progressRows, "2026-07-10T00:00:00.000Z");

    expect(result).toEqual([
      { time: "2026-07-10T00:00:00.000Z", cumulativePoints: 0 },
      { time: "2026-07-10T12:00:00.000Z", cumulativePoints: 5 },
      { time: "2026-07-11T09:00:00.000Z", cumulativePoints: 25 },
    ]);
  });
});
