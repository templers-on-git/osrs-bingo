export function wikiImageUrl(image) {
  if (!image) return null;
  const filename = image.replace(/^File:/, "").replaceAll(" ", "_");
  return `https://oldschool.runescape.wiki/w/Special:FilePath/${filename}`;
}

export function buildBucketQueryUrl({ bucket, select, where, limit, offset }) {
  const selectStr = select.map((field) => `'${field}'`).join(",");
  let query = `bucket('${bucket}').select(${selectStr})`;
  if (where) query += `.where('${where[0]}','${where[1]}')`;
  if (limit != null) query += `.limit(${limit})`;
  if (offset != null) query += `.offset(${offset})`;
  query += ".run()";

  const params = new URLSearchParams({ action: "bucket", format: "json", origin: "*", query });
  return `https://oldschool.runescape.wiki/api.php?${params.toString()}`;
}

export function mapWikiItemToItemRow(wikiItem, bonusesByPageName) {
  // The Bucket API always returns `image` as an array — even single-image
  // items get a one-element array — since some items (e.g. Coins) have
  // several (one per denomination/charge variant). We only need one icon,
  // so just take the first.
  return {
    name: wikiItem.page_name,
    photoUrl: wikiImageUrl(wikiItem.image?.[0]),
    equipmentSlot: bonusesByPageName[wikiItem.page_name]?.equipment_slot ?? null,
    wikiPageName: wikiItem.page_name,
  };
}

export function filterWikiItemIndex(index, query) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return index;
  return index.filter((item) => item.name.toLowerCase().includes(trimmed));
}

export async function fetchBucketPage(fetchImpl, { bucket, select, limit, offset }) {
  const url = buildBucketQueryUrl({ bucket, select, limit, offset });
  const res = await fetchImpl(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.bucket;
}

const ITEM_FIELDS = ["page_name", "item_id", "image", "examine", "is_members_only", "tradeable", "high_alchemy_value"];
const BONUSES_FIELDS = ["page_name", "equipment_slot"];

async function fetchAllPages(fetchImpl, { bucket, select, pageSize }) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const page = await fetchBucketPage(fetchImpl, { bucket, select, limit: pageSize, offset });
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

export async function loadWikiItemIndex(fetchImpl, { pageSize = 5000 } = {}) {
  const [items, bonuses] = await Promise.all([
    fetchAllPages(fetchImpl, { bucket: "infobox_item", select: ITEM_FIELDS, pageSize }),
    fetchAllPages(fetchImpl, { bucket: "infobox_bonuses", select: BONUSES_FIELDS, pageSize }),
  ]);

  const bonusesByPageName = Object.fromEntries(bonuses.map((row) => [row.page_name, row]));
  return items.map((item) => mapWikiItemToItemRow(item, bonusesByPageName));
}

// The 11 worn-equipment slots, in the same order as the in-game equipment
// interface (used both for doll layout and as the canonical bucket list).
export const EQUIPMENT_SLOTS = ["head", "cape", "neck", "ammo", "weapon", "body", "shield", "legs", "hands", "feet", "ring"];

// Maps a raw wiki equipment_slot value to a display bucket. "2h" collapses
// into "weapon" — a 2h weapon is shown in the Weapon cell with a "(2h)"
// badge rather than visually merging the Weapon/Shield doll cells, since a
// set can hold many weapons and shields at once (it's a checklist, not a
// single loadout) so there's no one "current" equip state to collapse into.
// Anything unrecognized (including non-equipable items, equipment_slot ===
// null) falls into "other".
export function slotBucketFor(equipmentSlot) {
  if (equipmentSlot === "2h") return "weapon";
  if (EQUIPMENT_SLOTS.includes(equipmentSlot)) return equipmentSlot;
  return "other";
}

// Groups a list of items into slot buckets (all 11 + "other", always
// present even if empty, so callers can render every doll cell without a
// presence check). getSlot is an accessor so this works against both raw DB
// rows (equipment_slot, snake_case) and live search results (equipmentSlot,
// camelCase) without duplicating this logic per shape.
export function groupBySlotBucket(items, getSlot) {
  const buckets = Object.fromEntries([...EQUIPMENT_SLOTS, "other"].map((slot) => [slot, []]));
  for (const item of items) {
    buckets[slotBucketFor(getSlot(item))].push(item);
  }
  return buckets;
}
