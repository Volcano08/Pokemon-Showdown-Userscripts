# Setup

This covers getting both userscripts installed and configured. Full documentation of what each feature does lives in a separate file.

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

Everything else (Open Team Sheets behavior, auto-copy/close replay, Battle Mode, Teambuilder Mode, quick-links toggle) is configured live from Showdown's own **Options** popup once the script is running, and is saved automatically — no need to edit the script for any of that.

## Configuring NCP Calc Auto-Import

Nothing to configure — install it and it works. It sits quietly until it detects a set was sent over from the Showdown Suite's "NCP Calc+Copy" button, then imports it automatically.

## Verifying it's working

Open your browser console (F12) on Pokemon Showdown. You should see:

```
[Showdown Suite] v1.0.0 loaded - Music, QoL, Move to Folder, Battle Update, Rainbow Buttons.
```

On the NCP calculator's page, you should see:

```
[NCP Auto-Import] v1.2 loaded.
```

If either message is missing, the script isn't running on that page — check that it's enabled in Violentmonkey and that you're on a matching URL (`play.pokemonshowdown.com` or `psim.us` for the suite; the NCP calculator's own domain for the import script).
