# Showdown Music Uploader

Pick a folder of audio files → convert anything that isn't mp3 (320kbps, metadata preserved) → clean up filenames → review/edit them yourself → upload to GitHub → get back a ready-to-paste array of links in the same style as the `MUSIC_TRACKS` array in Showdown Suite.

Your original audio files are never modified or deleted — conversions are written as new `.mp3` files alongside them.

## One-time setup

**1. Install Python packages**

```
pip install -r requirements.txt
```

**2. Install ffmpeg**

This does the actual audio conversion. Get it from https://ffmpeg.org/download.html and make sure the `ffmpeg` command works from a terminal/command prompt (i.e. it's on your PATH). On Windows, that usually means adding the ffmpeg `bin` folder to your PATH environment variable after downloading.

**3. Make a GitHub Personal Access Token**

The script needs this to upload files on your behalf. It only ever checks whether a file exists and creates/updates files — so it only needs **Contents: Read and write** access to the one repo you're using, nothing more.

**Recommended - fine-grained token (scoped to just this repo):**

- Go to https://github.com/settings/tokens?type=beta → **Generate new token**
- Give it a name, set an expiration you're comfortable with
- Under **Repository access**, choose "Only select repositories" and pick your music repo specifically
- Under **Permissions → Repository permissions**, find **Contents** and set it to **Read and write**
- Leave everything else as "No access"
- Generate it and copy the token — GitHub only shows it once

**Simpler alternative - classic token (broader access, works fine too):**

- Go to https://github.com/settings/tokens → **Generate new token (classic)**
- Check the **repo** scope
- Generate it and copy the token

Note this gives the token read/write access to *all* your repos (public and private), not just the music one — the fine-grained option above is safer if you don't mind the extra couple of clicks.

**4. Fill in the config**

Copy `config.example.json` to `config.json` (same folder as the script) and fill in:

| Field | Meaning |
|---|---|
| `github_token` | The token you just made |
| `repo_owner` | Your GitHub username |
| `repo_name` | The repo to upload into |
| `branch` | Branch to commit to (`main` unless you use something else) |
| `repo_folder` | Folder path inside the repo (e.g. `Showdown Music`) |

If you skip this step, running the script will create a template `config.json` for you automatically and tell you to fill it in.

**Keep `config.json` private** — it has your token in it. Don't commit it anywhere public.

## Running it

```
python music_uploader.py
```

1. A folder picker opens (the one native dialog this still uses) — choose the folder with your audio files.
2. Anything that isn't already `.mp3` (flac, m4a, wav, ogg, aac, wma) gets converted, with detailed progress printed to the console.
3. For each file, the console shows the auto-cleaned suggested name (watermarks like SPOTISAVER/Soundloader stripped, leading track numbers removed, bracketed junk removed) and asks you to:
   - **Press Enter** to accept it as-is
   - **Type a new name** to replace it
   - **Type `s`** to skip/exclude that file entirely
4. Once you've gone through every file, it prints a summary and asks for a final yes/no before uploading anything.
5. Files already present on GitHub (matched by name) are skipped rather than re-uploaded.
6. The final array entries are printed to the console **and** saved to `output_array.txt` next to the script, so copying them isn't dependent on your terminal's scrollback/selection — just paste them where you want them in `MUSIC_TRACKS`.

If anything goes wrong (including ffmpeg not being installed), you'll get a clear error message instead of the script just closing silently.

## Using the prebuilt .exe

`music_uploader.exe` is included directly in this release, next to the source — no Python installation needed to run it. Just:

1. Put `config.json` (copied from `config.example.json`, filled in) in the same folder as `music_uploader.exe`.
2. Make sure ffmpeg is installed and on your PATH (still required either way — it isn't bundled into the exe).
3. Double-click `music_uploader.exe`, or run it from a terminal.

If you'd rather not run a stranger's prebuilt binary and prefer to build your own from source instead, that's straightforward too:

```
pip install pyinstaller
pyinstaller --onefile --console music_uploader.py
```

The `.exe` shows up in a new `dist` folder. A few things to know:

- **Keep `--console`** (or just don't add `--windowed`/`--noconsole`) — this script's entire review step runs through typed console input, so a windowed build with no console would have nowhere for you to type anything.
- **`config.json` needs to sit next to the `.exe`**, not next to the original `.py` file (the script looks next to the actual executable, not a temp folder, when running as a frozen build).
- You can move `music_uploader.exe` + `config.json` anywhere afterward (a permanent folder, Desktop, etc.) as a pair — just keep them together.



- The filename cleanup is rule-based, not perfect — it strips known downloader watermarks, leading track numbers, and anything in brackets/parentheses, plus a few common unbracketed qualifiers ("Extended Version," "Cover Version," etc). Covers, fan edits, and theme songs especially can still need a manual tweak, which is what the review step is for.
- 320kbps was used for conversions since that's the technical maximum for mp3.
