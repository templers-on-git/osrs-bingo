# osrs-bingo v2 — feature backlog

Discussion/backlog only — none of this is implemented yet.

## Confirmed direction

1. **Admin / player split** — two distinct views instead of one undifferentiated page. Full design now in `ADMIN_SPEC.md` (roles, entities, tile types, auth/sessions, event lifecycle, privacy, backend choice).
2. **Tile history** — a log of completed tiles with who finished what and when.
3. **Dark/light theme** toggle.
4. **Mobile-friendly** layout (current app is desktop-oriented).
5. **Results/summary tools** — exportable end-of-event summary, plus graphs/charts for a visual recap.

## Deferred / uncertain

**Multi-clan support** — each clan runs its own bingo instance (clan-vs-clan competition):
- Per-clan passwords so members "log into" their clan's version
- Separate admin/player sides per clan
- A way to switch between clan instances
- A "super-admin / god" role above individual clan admins

Not committed to yet — unsure about scale and maintenance cost. Keep in mind as a possible future direction when shaping v2 architecture (avoid decisions that would make this hard to add later), but don't build any of it until it's explicitly greenlit.
