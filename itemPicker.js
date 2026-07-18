import { searchLocalItems, getOrCreateItemFromWiki } from "./admin.js";
import { filterWikiItemIndex } from "./wikiItems.js";

function normalizeLocalRow(row) {
  return {
    source: "local",
    id: row.id,
    name: row.name,
    photoUrl: row.photo_url,
    equipmentSlot: row.equipment_slot,
    wikiPageName: row.wiki_page_name,
  };
}

// Merges already-cached local items with the live wiki index for a search
// box: a wiki result already represented by a local (cached) row is deduped
// out in favor of that local row, so picking it never re-triggers caching.
export async function searchPickableItems(supabase, wikiIndex, query) {
  if (!query.trim()) return [];

  const localRows = await searchLocalItems(supabase, query);
  const cachedWikiPageNames = new Set(localRows.filter((row) => row.wiki_page_name).map((row) => row.wiki_page_name));

  const localResults = localRows.map(normalizeLocalRow);
  const wikiResults = filterWikiItemIndex(wikiIndex, query)
    .filter((row) => !cachedWikiPageNames.has(row.wikiPageName))
    .map((row) => ({ source: "wiki", id: null, ...row }));

  return [...localResults, ...wikiResults];
}

// Resolves a search result to a stable local items row: a local pick is
// already a real row (just re-shaped to snake_case to match); a wiki pick
// gets cached via getOrCreateItemFromWiki so it has one from now on.
export async function resolvePickedItem(supabase, result) {
  if (result.source === "local") {
    return {
      id: result.id,
      name: result.name,
      photo_url: result.photoUrl,
      equipment_slot: result.equipmentSlot,
      wiki_page_name: result.wikiPageName,
    };
  }

  return getOrCreateItemFromWiki(supabase, {
    name: result.name,
    photoUrl: result.photoUrl,
    equipmentSlot: result.equipmentSlot,
    wikiPageName: result.wikiPageName,
  });
}
