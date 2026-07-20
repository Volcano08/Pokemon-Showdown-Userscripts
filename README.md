# Showdown Suite + NCP Calc Auto-Import

Setup instructions below, followed by full documentation of what every feature does. The documentation section is also available as its own file if you just want that part.

# Setup

This covers getting both userscripts installed and configured.

## Prerequisites

You need a userscript manager. **[Violentmonkey](https://violentmonkey.github.io/)** is recommended and is what both scripts were built and tested against. They may work on Tampermonkey or other managers too, but that hasn't been verified — if something behaves differently there, Violentmonkey is the known-working option.

There are two scripts, and they work together:

- **`showdown-suite.user.js`** — runs on Pokemon Showdown itself (music player, QoL shortcuts, teambuilder folders, battle/replay tools, rainbow menu buttons).
- **`ncp-calc-auto-import.user.js`** — runs on the NCP VGC Damage Calculator site. It's what actually receives and imports a set when you click the "NCP Calc+Copy" button that the first script adds inside Teambuilder. Install both, or the button won't do anything when clicked.

## Installing a script

**Easiest:** click on the `.user.js` file in this repo, then open it in "raw" form. Violentmonkey will detect it and pop up an install prompt automatically.

**Manual fallback:** open the Violentmonkey dashboard → **"+" (Create a new script)** → delete the placeholder template → paste in the full contents of the `.user.js` file → save (Ctrl+S).

Do this once for each of the two scripts.

## Configuring Showdown Suite

Everything you'd actually want to hand-edit is gathered in one `CONFIG` section near the top of the file. Open the script in Violentmonkey's editor to change any of it:

| Setting | What it does |
|---|---|
| `CUSTOM_AVATAR_URL` | Your trainer sprite, shown on the home screen, userbar, and in battle. Point it at any filename from [Showdown's own sprite set](https://play.pokemonshowdown.com/sprites/trainers/), or your own hosted image. |
| `ALLOWED_ROOMS` | Which rooms show by default in the room list (before hitting "Show more rooms"). Edit the list to whichever rooms you actually want to see. |
| `MUSIC_TRACKS` | Empty by default. This is a list of direct mp3 URLs used by the music player and the Ctrl+Alt+M picker. |

**Adding your own music:** `MUSIC_TRACKS` starts empty on purpose — it's meant to hold links to *your own* hosted tracks, not come preloaded with someone else's. The companion **Showdown Music Uploader** tool (its own folder in this repo, with its own setup instructions) handles converting, cleaning up, and uploading your own audio files to GitHub, then hands you back entries in exactly the format this array expects — just paste them in.

Everything else (Open Team Sheets behavior, auto-copy/close replay, Battle Mode, Teambuilder Mode, quick-links toggle, whether OTS Pokepaste exports include Nature) is configured live from Showdown's own **Options** popup once the script is running, and is saved automatically — no need to edit the script for any of that.

## Configuring NCP Calc Auto-Import

Nothing to configure — install it and it works. It sits quietly until it detects a set was sent over from the Showdown Suite's "NCP Calc+Copy" button, then imports it automatically.

## Verifying it's working

Open your browser console (F12) on Pokemon Showdown. You should see:

```
[Showdown Suite] v1.2.0 loaded - Music, QoL, Move to Folder, Battle Update, OTS Pokepaste Modifier, Text Size, Rainbow Buttons.
```

On the NCP calculator's page, you should see:

```
[NCP Auto-Import] v1.2 loaded.
```

If either message is missing, the script isn't running on that page — check that it's enabled in Violentmonkey and that you're on a matching URL (`play.pokemonshowdown.com` or `psim.us` for the suite; the NCP calculator's own domain for the import script).

## What everything does

---

## Showdown Suite (Merged)

### Custom Music

- Plays background music automatically once a battle starts, shuffled from your `MUSIC_TRACKS` list with no repeats until the whole pool has played.
- **Ctrl+Alt+M** opens a picker window: filter/search tracks by name, **Play** switches to a track immediately, **Loop** keeps replaying that one track until you pick something else, **Resume Shuffle** goes back to random.
- Play/Loop only take effect immediately if you're *currently* in an active battle. Used anywhere else (home screen, teambuilder, between battles), they just arm that track to play whenever your *next* battle's music starts, rather than playing anything audible right away.
- A small "Now Playing" widget shows below your team-switch buttons during battle, displaying the current track name.
- **Arrow Up / Arrow Down** change the music volume slider, as long as nothing else currently has keyboard focus.
- Live percentage labels appear next to the Effects, Music, and Notifications volume sliders in Options.

### Quality of Life

- The news announcement popup closes itself automatically shortly after it appears.
- A popup about IP/proxy locks closes itself automatically.
- Your last-used format and team are remembered and restored automatically across page reloads.
- **Backtick (`)** toggles a small cheatsheet listing all the keyboard shortcuts below.
- **Ctrl+Alt+H / B / T / L** jump to Home, Battles, Teambuilder, and Ladder respectively.
- **Ctrl+Alt+F** starts a battle search with your currently selected format, same as clicking the Battle! button.
- **Left / Right arrow keys** cycle between your open room tabs, as long as you're not typing in a text field or have the volume panel open.
- Your custom avatar is applied everywhere: the home screen, the top-right userbar, your name popup, your side of the battle screen, and the Best-of-3 tracker room's side-by-side player display.
- The room list only shows a curated set of rooms by default; "Show more rooms" reveals the full list, and toggling it back re-applies the filter.

### Move to Folder

- Adds a **Folder** button in the Teambuilder editor, next to Validate.
- Move any team into a folder (or subfolder, using `/` to nest — e.g. `VGC/2026`) from a picker with per-folder buttons to open, create a subfolder inside, move/reorganize it elsewhere in the hierarchy, or pin it.
- **Pin** moves a folder to the top of the sidebar, above the alphabetical list.
- Folder headers show a breadcrumb trail for nested folders (e.g. "VGC › 2026"), each part clickable to navigate up.
- The all-teams view groups everything sensibly: pinned folder(s) first, then other folders alphabetically, then a "No Folder" separator, then unfoldered teams last.
- Subfolders show indented under their parent in the sidebar.
- The battle team-selector popup (when choosing a team to bring into a match) shows folder names properly indented for subfolders instead of the full "Parent/Child" path.

### Battle Update

- Every section of the Options popup (including Showdown's own built-in ones) can be collapsed by clicking its header, and remembers your collapsed/expanded choice.
- **Open Team Sheets**: Ask each time / Always accept / Always reject.
- **Auto-copy replay link**: copies the replay URL to your clipboard when a battle ends.
- **Auto-close battle after replay is copied**: closes the room a few seconds after the battle ends, giving you time to actually see the result first.
- **Close battle after forfeiting**: closes the room automatically if you forfeit (on by default).
- **Teambuilder quick-links**: adds Serebii / MunchStats / NCP Calc+Copy buttons next to Copy Set in the Teambuilder (see below).
- **Modes** (mutually exclusive — turning one on turns the others off):
  - **Default Mode**: normal behavior, nothing automated beyond the toggles above.
  - **Battle Mode**: repeatedly searches your current format automatically, with a floating widget tracking your battle/series count and replays saved. Correctly counts a Best-of-3 match as *one* series rather than 2–3 separate battles. Pause/Resume/End controls, plus an Export Replays button that downloads a `.txt` of all saved links.
  - **Teambuilder Mode**: opens Teambuilder, MunchStats, and the NCP damage calculator together in background tabs, refreshing MunchStats automatically as you switch which format you're editing. Optional "set status to Away" while it's active.
- Auto-joins the VGC room the first time you log in, if it isn't already open.
- Your room tab order is remembered after you drag tabs around, and restored on reload.
- A countdown timer appears near the Battle! button while searching, auto-cancelling the search if it runs out.
- Away/Back buttons appear in your own name popup to toggle your online status.
- **F key** (when not typing anywhere) shows a small popup with your Elo, GXE, Glicko rating, and win/loss record for whichever format is currently selected.

### OTS Pokepaste Modifier

Changes what the "Upload to PokePaste (Open Team Sheet)" button in the Teambuilder actually uploads:

- Any Mega Pokémon is exported in its base forme (still holding the mega stone) rather than as the mega itself.
- If the mega's own ability isn't one the base forme can actually have, you'll be asked to pick from the base forme's real ability options (or leave it blank to default to its primary ability). No prompt appears at all if the ability is already valid on the base forme.
- Shiny status is left out of OTS exports.
- Nature is included by default. Turn this off in Options → Teambuilder → **"Include Nature in OTS Pokepaste export"** if your tournament uses the older teamsheet convention that doesn't reveal it.
- The regular "Upload to PokePaste" button (the non-OTS one) is unaffected by any of this.

### Text Size

- **Ctrl+Alt+=** / **Ctrl+Alt+-** scale chat and battle-log text up or down in 10% steps (80%–200%).
- **Ctrl+Alt+0** resets to 100%.
- A brief on-screen indicator shows the current percentage each time you adjust it.
- Your chosen size is remembered across reloads.
- Only chat and battle-log text are affected — buttons and other UI stay their normal size. Showdown has no built-in setting for this otherwise.

### Rainbow Button Colors

- Home screen buttons are recolored in strict spectral order: Battle! (red) → Teambuilder (orange) → Ladder (yellow) → Tournaments (green) → Watch a battle (light blue) → Find a user (blue) → Friends (violet) → Info & Resources (magenta).
- Buttons that are genuinely disabled (before you've logged in) correctly show a grayed-out look instead of full color, so it's still clear they're not clickable yet.

---

## NCP Calc Auto-Import

Works together with the "NCP Calc+Copy" button that Showdown Suite adds in Teambuilder (part of the quick-links feature above).

- When you click that button, this script automatically receives the set data on the calculator's page and imports it as a custom set.
- If a set with that exact species + team name already exists, it skips re-saving and just loads the existing one instead of duplicating it.
- Either way, it loads the set directly into the calculator's left panel, ready to use — no manual copy-pasting into the custom set fields required.
