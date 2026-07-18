# osrs-bingo v2 — bugs & small changes

Bug reports and small UI/behavior tweaks that aren't new features — see `FEATURE_IDEAS.md` for the feature backlog instead.

## Open

1. **Equipment-doll: images break, slots look too small, and clicking a slot still re-renders/feels sluggish — all three persist in Liel's real browser and only clear after a hard refresh (Ctrl+Shift+R).** Recorded in detail so the same fixes aren't attempted twice:

   - **Symptoms Liel actually observes**: (a) item images in the doll show as broken until a hard refresh; (b) the doll/slots render too small even after the stretch-CSS change below; (c) clicking a doll slot still visibly refreshes/redraws the whole set, feeling slow — the exact symptom the DOM-surgery fix below was meant to remove.
   - **Already tried, 2026-07-18, none of it resolved what Liel sees** (do not redo these):
     - Added `referrerpolicy="no-referrer"` to every doll/item `<img>` tag, on the hotlink-block hypothesis for the broken images.
     - Changed `.doll-slot`'s `background-size` from `cover` to `100% 100%` (stretch) and raised `.doll-slot-icon`'s `max-width`/`max-height` from 65% to 88%, to fix the "tiny icon in a big tile" look.
     - Rewrote slot-selection and expand/collapse in both `dev.js` and `login.js` (builder) and the `login.js` item/set viewer modal from full-list re-renders (`renderItemSets()`/`renderItemSetsManagement()`/`renderModalNSets()`) to targeted DOM updates (`rerenderItemSetCard()` for one card only; slot-select does pure `.active`-class + detail-panel-innerHTML swaps, touching zero `<img>` elements) — specifically to stop other sets'/slots' images from being torn down and recreated on every click.
   - **Why these are believed to not be the real fix**: every one of the above was verified live via Playwright against a *freshly loaded* page (no cache) and worked correctly there — the doll rendered compact, images loaded, slot-clicks didn't touch other elements. Liel then reproduced all three symptoms anyway, and a hard refresh (which forces the browser to re-fetch every asset, bypassing cache) made all three go away at once. That combination — automated fresh-load tests pass, but only a hard refresh fixes it for a real user — points at **stale browser caching of `style.css`/`dev.js`/`login.js` from earlier in the session** as the actual cause, not a defect in the code changes themselves.
   - **Still not tried**: cache-busting the asset references in `dev.html`/`login.html` (e.g. a `?v=` query string on the `<script src>`/`<link href>` tags, bumped whenever these files change) so a normal reload can never serve a stale copy. This is the next thing to try, before spending more time re-investigating the doll's rendering logic itself.

## Done

1. ~~Item modal chips reorder on every click~~ — moot, superseded by the equipment-slot-doll layout rework (item sets are no longer shown as a flat chip list).
2. ~~Auto-color tile brackets by difficulty/points~~ — done, 2026-07-18. `bracketColor(points, minPoints, maxPoints)` in `analytics.js` (TDD'd), an HSL hue sweep (120°→0°) scaled to the event's own min/max bracket points, falling back to green if every bracket has equal points. Applied to the group-header pill's background in `tileGroupHtml` (`login.js`), shared by View/Edit/Progress.
3. ~~Rename tile status labels "Open"/"Done" → "Available"/"Completed"~~ — done, 2026-07-18. `tileCardHtml`/`progressTileCardHtml` (`login.js`); underlying `.status-badge.open`/`.done` classes unchanged.
4. ~~Hide completed tiles toggle should be a button, not a checkbox~~ — done, 2026-07-18. Both View and Progress panes now use a `.btn-ghost` button with `.active` state, matching the tab buttons.
5. ~~Doll: swap the empty per-slot equipment art for a generic "occupied" background once a slot holds an item~~ — done, 2026-07-18, using Liel's provided `assets/doll-slots/occupied.png`. `dollSlotButtonHtml` (both `dev.js` and `login.js`) now adds an `.occupied` class when `members.length > 0`; `.doll-slot.occupied` in `style.css` overrides the per-slot `background-image` rule by source order. Reverts automatically when the item is removed, since every mutation re-renders from fresh `members` data (no extra logic needed). Doesn't touch the broken-images/tiny-slots/sluggish-render bugs above — those are believed to be a caching issue, unrelated to which image renders.
