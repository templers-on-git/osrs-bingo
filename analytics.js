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
