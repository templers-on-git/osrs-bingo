// Pure client-side computation over already-loaded board data — no
// Supabase calls here, so no RLS/schema concerns. Own-clan only: callers
// pass in tiles + this clan's own progress rows (from listClanTileProgress),
// never another clan's, matching ADMIN_SPEC.md's privacy rule.

export function computeBracketBreakdown(tiles, progressByTileId) {
  const groups = new Map();
  for (const tile of tiles) {
    const bracket = tile.point_brackets;
    if (!groups.has(bracket.id)) {
      groups.set(bracket.id, { bracketId: bracket.id, label: bracket.label, points: bracket.points, completedCount: 0, totalCount: 0 });
    }
    const group = groups.get(bracket.id);
    group.totalCount += 1;
    if (progressByTileId[tile.id]?.completed) group.completedCount += 1;
  }
  return [...groups.values()].sort((a, b) => b.points - a.points);
}

// Difficulty color for a bracket's point value, on a green (easiest) to red
// (hardest) gradient relative to the event's own min/max bracket points —
// a fixed color scale wouldn't mean anything across events with very
// different point ranges. Falls back to green if every bracket in the
// event has the same points (nothing to compare against).
export function bracketColor(points, minPoints, maxPoints) {
  const fraction = maxPoints === minPoints ? 0 : (points - minPoints) / (maxPoints - minPoints);
  const hue = Math.round(120 * (1 - fraction));
  return `hsl(${hue}, 65%, 45%)`;
}

// Player-facing header stat: points earned so far vs. the board's total,
// and tiles done vs. total tiles — the v1-style always-visible summary.
export function computeBoardSummary(tiles, progressByTileId) {
  const totalPoints = tiles.reduce((sum, t) => sum + t.point_brackets.points, 0);
  const completedTiles = tiles.filter((t) => progressByTileId[t.id]?.completed);
  const earnedPoints = completedTiles.reduce((sum, t) => sum + t.point_brackets.points, 0);

  return {
    earnedPoints,
    totalPoints,
    completedCount: completedTiles.length,
    totalCount: tiles.length,
    percent: totalPoints ? Math.round((earnedPoints / totalPoints) * 100) : 0,
  };
}

// completed_at reflects only the most recent completion (tile_progress rows
// are upserted, not logged) — if a tile is uncompleted then recompleted, its
// original completion time is lost. Acceptable for a first version of this.
export function computePointsOverTime(tiles, progressRows, startTimeUtc) {
  const pointsByTileId = Object.fromEntries(tiles.map((t) => [t.id, t.point_brackets.points]));

  const completions = progressRows
    .filter((p) => p.completed && p.completedAt)
    .map((p) => ({ time: p.completedAt, points: pointsByTileId[p.tileId] ?? 0 }))
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  let cumulative = 0;
  const series = [{ time: startTimeUtc, cumulativePoints: 0 }];
  for (const { time, points } of completions) {
    cumulative += points;
    series.push({ time, cumulativePoints: cumulative });
  }
  return series;
}
