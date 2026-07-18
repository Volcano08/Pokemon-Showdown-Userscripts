#!/usr/bin/env python3
"""
Showdown Music Uploader
========================
Pick a folder of audio files -> convert anything that isn't mp3 (max quality,
metadata preserved) -> clean up filenames -> review/edit them in the console
-> upload to GitHub -> get back a ready-to-paste JS array of
raw.githubusercontent.com links, in the same style used by the MUSIC_TRACKS
array in Showdown Suite.

Only the folder picker uses a GUI (a native OS dialog, which is reliable
everywhere) - the review/edit step, progress output, and results are all
plain console text/input, so there's no custom window that can fail to
appear or steal focus.

SETUP (one-time):
  1. pip install requests
  2. Install ffmpeg and make sure it's on your PATH (https://ffmpeg.org/download.html)
  3. Copy config.example.json to config.json and fill in your GitHub details
     (see README.md for what each field means and how to make a token).
  4. Run:  python music_uploader.py

Nothing here touches your original audio files - conversions are written
as new .mp3 files alongside the originals.
"""

import base64
import datetime
import json
import re
import subprocess
import sys
import time
import traceback
import tkinter as tk
import urllib.parse
from pathlib import Path
from tkinter import filedialog

import requests

CONFIG_PATH = Path(__file__).parent / "config.json"
SUPPORTED_EXTENSIONS = {".mp3", ".flac", ".m4a", ".wav", ".ogg", ".aac", ".wma"}

# When built into a onefile exe (PyInstaller), __file__ points at a temp
# extraction folder that's different every run, not wherever the .exe
# actually sits - sys.frozen is the standard way any code bundled this way
# can detect it and use sys.executable's location instead.
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent

CONFIG_PATH = BASE_DIR / "config.json"


# ============================================================
# LOGGER - prints every step to the console.
# ============================================================

class Logger:
    def log(self, msg, level="INFO", indent=0):
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        prefix = "  " * indent
        print(f"[{timestamp}] [{level}] {prefix}{msg}", flush=True)

    def stage(self, title):
        bar = "=" * 60
        self.log("")
        self.log(bar)
        self.log(title)
        self.log(bar)


LOGGER = Logger()


# ============================================================
# CONFIG
# ============================================================

def load_config():
    LOGGER.stage("STAGE: Loading configuration")
    LOGGER.log(f"Looking for config.json at: {CONFIG_PATH}")

    if not CONFIG_PATH.exists():
        LOGGER.log("config.json NOT found.", level="WARN")
        _write_config_template()
        LOGGER.log(f"Wrote a blank template to {CONFIG_PATH}", level="WARN")
        print(
            f"\nNo config.json found.\n"
            f"A template has been created at:\n{CONFIG_PATH}\n\n"
            f"Fill in your GitHub token, repo owner/name, branch, and target "
            f"folder, then run this script again."
        )
        sys.exit(1)

    LOGGER.log("config.json found, reading it...")
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = json.load(f)

    required = ["github_token", "repo_owner", "repo_name", "branch", "repo_folder"]
    missing = [k for k in required if not config.get(k)]
    if missing:
        LOGGER.log(f"Config is missing values for: {', '.join(missing)}", level="ERROR")
        print(f"\nconfig.json is missing values for: {', '.join(missing)}\n"
              f"Edit {CONFIG_PATH} and fill those in, then run again.")
        sys.exit(1)

    masked_token = ("*" * 6) + config["github_token"][-4:] if len(config["github_token"]) >= 4 else "****"
    LOGGER.log("Config loaded successfully:")
    LOGGER.log(f"repo:   {config['repo_owner']}/{config['repo_name']}", indent=1)
    LOGGER.log(f"branch: {config['branch']}", indent=1)
    LOGGER.log(f"folder: {config['repo_folder']}", indent=1)
    LOGGER.log(f"token:  {masked_token}  (masked - never logged in full)", indent=1)
    return config


def _write_config_template():
    template = {
        "github_token": "ghp_your_personal_access_token_here",
        "repo_owner": "your-github-username",
        "repo_name": "your-repo-name",
        "branch": "main",
        "repo_folder": "Showdown Music",
    }
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(template, f, indent=2)


# ============================================================
# FILENAME SANITIZATION
# ============================================================
# Best-effort, rule-based cleanup - strips known downloader watermarks,
# leading track numbers, and bracketed/parenthetical junk. This can't be
# perfect (there's no way to reliably tell "part of the title" from
# "descriptor" without an actual metadata lookup, and covers/theme songs
# often aren't in any database anyway) - that's what the review/edit step
# right after this is for.

KNOWN_WATERMARKS = [
    r"spotisaver",
    r"soundloaders?(?:\.app)?",
    r"ssyoutube",
    r"y2mate",
    r"yt2?mp3",
    r"snapsave",
    r"mp3juices?",
    r"320\s*kbps",
    r"high\s*quality",
    r"official\s*(music\s*)?video",
    r"official\s*audio",
    r"lyrics?\s*video",
    r"\bhq\b",
    r"\bhd\b",
]

JUNK_PHRASES = [
    r"extended\s+full\s+version",
    r"extended\s+version",
    r"full\s+version",
    r"official\s+version",
    r"cover\s+version",
    r"original\s+mix",
    r"remaster(?:ed)?(?:\s+\d{4})?",
    r"lyric\s+video",
]


def sanitize_filename(raw_name, verbose=True):
    """Cleans a filename down to (ideally) just artist/song. If verbose,
    logs every stage that actually changed something, including which exact
    watermark/junk pattern matched."""
    name = raw_name
    if verbose:
        LOGGER.log(f"Sanitizing: '{raw_name}'")

    before = name
    name = re.sub(r"\.(mp3|flac|m4a|wav|ogg|aac|wma)$", "", name, flags=re.IGNORECASE)
    if verbose and name != before:
        LOGGER.log(f"stripped file extension -> '{name}'", indent=1)

    before = name
    m = re.match(r"^\s*(\d+[\.\)\-\s]+)\s*", name)
    if m:
        name = name[m.end():]
        if verbose:
            LOGGER.log(f"stripped leading track number '{m.group(1).strip()}' -> '{name}'", indent=1)

    for pattern in KNOWN_WATERMARKS:
        before = name
        name = re.sub(pattern, "", name, flags=re.IGNORECASE)
        if verbose and name != before:
            LOGGER.log(f"stripped watermark matching /{pattern}/ -> '{name}'", indent=1)

    for pattern in JUNK_PHRASES:
        before = name
        name = re.sub(pattern, "", name, flags=re.IGNORECASE)
        if verbose and name != before:
            LOGGER.log(f"stripped descriptor phrase matching /{pattern}/ -> '{name}'", indent=1)

    for label, pattern in [("()", r"\([^)]*\)"), ("[]", r"\[[^\]]*\]"), ("{}", r"\{[^}]*\}")]:
        before = name
        name = re.sub(pattern, "", name)
        if verbose and name != before:
            LOGGER.log(f"stripped bracketed content {label} -> '{name}'", indent=1)

    before = name
    name = re.sub(r"\s+", " ", name)
    name = name.strip(" -_.")
    name = re.sub(r"\s*-\s*", " - ", name)
    name = name.strip()
    if verbose and name != before:
        LOGGER.log(f"normalized whitespace/dashes -> '{name}'", indent=1)

    if verbose:
        LOGGER.log(f"FINAL: '{name}'", indent=1)
    return name


# ============================================================
# AUDIO CONVERSION
# ============================================================

class FfmpegNotFoundError(Exception):
    pass


def convert_to_mp3(source_path):
    """Convert source_path to a 320kbps mp3 next to it, preserving metadata
    via ffmpeg's own tag mapping. Returns the new Path, or None on failure.
    Raises FfmpegNotFoundError specifically if ffmpeg itself can't be found."""
    dest_path = source_path.with_suffix(".mp3")
    LOGGER.log(f"Processing: {source_path.name}")
    LOGGER.log(f"source format: {source_path.suffix.lower().lstrip('.')}", indent=1)
    LOGGER.log(f"source size:   {source_path.stat().st_size:,} bytes", indent=1)

    if dest_path.exists():
        LOGGER.log(f"'{dest_path.name}' already exists - skipping conversion, reusing it", indent=1)
        return dest_path

    cmd = [
        "ffmpeg", "-y", "-i", str(source_path),
        "-map_metadata", "0",
        "-codec:a", "libmp3lame", "-b:a", "320k",
        "-id3v2_version", "3",
        str(dest_path),
    ]
    LOGGER.log(f"ffmpeg command: {' '.join(cmd)}", indent=1)
    LOGGER.log("running ffmpeg (this can take a moment for larger files)...", indent=1)

    start = time.time()
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError:
        LOGGER.log(
            "ffmpeg executable was not found. It needs to be installed and "
            "on your system PATH - see https://ffmpeg.org/download.html",
            level="ERROR", indent=1,
        )
        raise FfmpegNotFoundError(
            "ffmpeg is not installed or not on your PATH. Install it from "
            "https://ffmpeg.org/download.html and make sure the 'ffmpeg' "
            "command works from a terminal, then try again."
        )
    elapsed = time.time() - start

    if result.returncode != 0:
        LOGGER.log(f"ffmpeg FAILED after {elapsed:.1f}s (exit code {result.returncode})", level="ERROR", indent=1)
        LOGGER.log(f"stderr tail: {result.stderr[-500:]}", level="ERROR", indent=1)
        return None

    out_size = dest_path.stat().st_size if dest_path.exists() else 0
    LOGGER.log(f"ffmpeg finished in {elapsed:.1f}s - output: {out_size:,} bytes", indent=1)
    return dest_path


# ============================================================
# GITHUB UPLOAD
# ============================================================

def _api_url(config, remote_filename):
    folder = config["repo_folder"].strip("/")
    remote_path = f"{folder}/{remote_filename}" if folder else remote_filename
    quoted_path = urllib.parse.quote(remote_path)
    return f"https://api.github.com/repos/{config['repo_owner']}/{config['repo_name']}/contents/{quoted_path}"


def file_exists_on_github(config, remote_filename):
    url = _api_url(config, remote_filename)
    LOGGER.log(f"Checking GitHub for existing file: {remote_filename}", indent=1)
    LOGGER.log(f"GET {url}", indent=2)
    headers = {
        "Authorization": f"token {config['github_token']}",
        "Accept": "application/vnd.github+json",
    }
    resp = requests.get(url, headers=headers, params={"ref": config["branch"]})
    LOGGER.log(f"response status: {resp.status_code}", indent=2)
    exists = resp.status_code == 200
    LOGGER.log("already exists on GitHub" if exists else "not found - clear to upload", indent=2)
    return exists


def upload_to_github(config, local_path, remote_filename):
    LOGGER.log(f"Uploading: {local_path.name} -> {remote_filename}")

    if file_exists_on_github(config, remote_filename):
        LOGGER.log(f"SKIPPED - '{remote_filename}' already on GitHub", indent=1)
        return True

    url = _api_url(config, remote_filename)
    headers = {
        "Authorization": f"token {config['github_token']}",
        "Accept": "application/vnd.github+json",
    }

    file_size = local_path.stat().st_size
    LOGGER.log(f"reading local file ({file_size:,} bytes)...", indent=1)
    with open(local_path, "rb") as f:
        raw = f.read()
    LOGGER.log("encoding to base64...", indent=1)
    content_b64 = base64.b64encode(raw).decode("utf-8")
    LOGGER.log(f"encoded payload size: {len(content_b64):,} chars", indent=1)

    payload = {
        "message": f"Add {remote_filename}",
        "content": content_b64,
        "branch": config["branch"],
    }
    LOGGER.log(f"PUT {url}", indent=1)
    LOGGER.log("sending upload request to GitHub...", indent=1)
    start = time.time()
    resp = requests.put(url, headers=headers, json=payload)
    elapsed = time.time() - start
    LOGGER.log(f"response status: {resp.status_code} (took {elapsed:.1f}s)", indent=1)

    if resp.status_code not in (200, 201):
        LOGGER.log(f"UPLOAD FAILED: {resp.text[:400]}", level="ERROR", indent=1)
        return False

    try:
        sha = resp.json().get("content", {}).get("sha", "?")
        LOGGER.log(f"upload succeeded - commit blob sha: {sha}", indent=1)
    except Exception:
        LOGGER.log("upload succeeded", indent=1)
    return True


def build_raw_url(config, remote_filename):
    folder = config["repo_folder"].strip("/")
    parts = []
    if folder:
        parts.append(urllib.parse.quote(folder))
    parts.append(urllib.parse.quote(remote_filename))
    path = "/".join(parts)
    url = f"https://raw.githubusercontent.com/{config['repo_owner']}/{config['repo_name']}/refs/heads/{config['branch']}/{path}"
    LOGGER.log(f"built URL for '{remote_filename}':", indent=1)
    LOGGER.log(url, indent=2)
    return url


# ============================================================
# FOLDER SCAN
# ============================================================

def scan_folder(folder_path):
    LOGGER.stage("STAGE: Scanning folder for audio files")
    LOGGER.log(f"Folder: {folder_path}")
    folder = Path(folder_path)
    all_entries = sorted(folder.iterdir())
    LOGGER.log(f"{len(all_entries)} total entries in folder")

    files = []
    for p in all_entries:
        if not p.is_file():
            LOGGER.log(f"(skipping directory) {p.name}", indent=1)
            continue
        ext = p.suffix.lower()
        if ext in SUPPORTED_EXTENSIONS:
            LOGGER.log(f"FOUND: {p.name}  (format: {ext.lstrip('.')})", indent=1)
            files.append(p)
        else:
            LOGGER.log(f"(skipping unsupported format {ext or '(no extension)'}) {p.name}", indent=1)

    LOGGER.log(f"Scan complete: {len(files)} supported audio file(s) out of {len(all_entries)} entries")
    return files


# ============================================================
# CONSOLE - pick folder (native OS dialog - the one part of Tkinter
# confirmed working, so it stays)
# ============================================================

def pick_folder():
    root = tk.Tk()
    root.withdraw()
    folder = filedialog.askdirectory(title="Select folder with audio files")
    root.destroy()
    return folder


# ============================================================
# CONSOLE - review & edit
# ============================================================

def review_in_console(files_with_suggestions):
    """One file at a time: show the suggested name, let the person accept
    it (Enter), type a replacement, or type 's'/'skip' to exclude it.
    Ends with a full summary and a yes/no confirmation before moving on."""
    LOGGER.stage("STAGE: Review & edit")
    print(
        "For each file: press Enter to accept the suggested name, type a "
        "new name to replace it, or type 's' to skip/exclude that file.\n"
    )

    decisions = []  # (path, final_name or None if skipped)
    total = len(files_with_suggestions)
    for i, (path, suggestion) in enumerate(files_with_suggestions, 1):
        print(f"[{i}/{total}] {path.name}")
        answer = input(f"    Suggested: {suggestion}\n    > ").strip()
        if answer.lower() in ("s", "skip"):
            print("    -> skipped\n")
            decisions.append((path, None))
        elif answer == "":
            print(f"    -> using: {suggestion}\n")
            decisions.append((path, suggestion))
        else:
            print(f"    -> using: {answer}\n")
            decisions.append((path, answer))

    chosen = [(path, name) for path, name in decisions if name]
    skipped_count = len(decisions) - len(chosen)

    print("=" * 60)
    print(f"Summary: {len(chosen)} file(s) will be uploaded, {skipped_count} skipped.")
    for path, name in chosen:
        print(f"  - {name}.mp3   (from {path.name})")
    print("=" * 60)

    confirm = input("Proceed with upload? [Y/n]: ").strip().lower()
    if confirm not in ("", "y", "yes"):
        LOGGER.log("Upload cancelled by user at confirmation step.", level="WARN")
        return []

    LOGGER.stage("STAGE: Review complete")
    LOGGER.log(f"{len(chosen)} file(s) confirmed for upload, {skipped_count} skipped")
    for path, name in chosen:
        renamed_note = "" if name == sanitize_filename(path.name, verbose=False) else " (manually edited)"
        LOGGER.log(f"-> '{name}'{renamed_note}  [from {path.name}]", indent=1)

    return chosen


# ============================================================
# MAIN
# ============================================================

def format_as_js_array_entries(urls):
    return "\n".join(f"    '{url}'," for url in urls)


def run():
    LOGGER.stage("SHOWDOWN MUSIC UPLOADER - starting")

    config = load_config()

    LOGGER.stage("STAGE: Choose folder")
    folder = pick_folder()
    if not folder:
        LOGGER.log("No folder selected - exiting.", level="WARN")
        return
    LOGGER.log(f"Folder selected: {folder}")

    files = scan_folder(folder)
    if not files:
        LOGGER.log("No supported audio files found - exiting.", level="WARN")
        print("No supported audio files found in that folder.")
        return

    LOGGER.stage("STAGE: Converting non-mp3 files")
    working_files = []
    for i, f in enumerate(files, 1):
        LOGGER.log(f"[{i}/{len(files)}]")
        if f.suffix.lower() == ".mp3":
            LOGGER.log(f"'{f.name}' is already mp3 - no conversion needed", indent=1)
            working_files.append(f)
        else:
            converted = convert_to_mp3(f)
            if converted:
                working_files.append(converted)
            else:
                LOGGER.log(f"'{f.name}' will be excluded (conversion failed)", level="WARN", indent=1)
    LOGGER.log(f"Conversion stage complete: {len(working_files)}/{len(files)} file(s) ready")

    if not working_files:
        print("No files were available to upload after conversion.")
        return

    LOGGER.stage("STAGE: Sanitizing filenames")
    suggestions = [(f, sanitize_filename(f.name)) for f in working_files]

    chosen = review_in_console(suggestions)
    if not chosen:
        LOGGER.log("Nothing selected for upload - exiting.", level="WARN")
        return

    LOGGER.stage("STAGE: Uploading to GitHub")
    urls = []
    for i, (path, final_name) in enumerate(chosen, 1):
        LOGGER.log(f"[{i}/{len(chosen)}]")
        remote_filename = final_name + ".mp3"
        ok = upload_to_github(config, path, remote_filename)
        if ok:
            urls.append(build_raw_url(config, remote_filename))
        else:
            LOGGER.log(f"'{remote_filename}' will be excluded from the final list (upload failed)", level="WARN", indent=1)
    LOGGER.log(f"Upload stage complete: {len(urls)}/{len(chosen)} file(s) uploaded/confirmed")

    if not urls:
        print("No files were successfully uploaded.")
        return

    LOGGER.stage("STAGE: Generating output array")
    array_text = format_as_js_array_entries(urls)
    LOGGER.log(f"Generated {len(urls)} array entries.")

    out_path = BASE_DIR / "output_array.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(array_text + "\n")
    LOGGER.log(f"Also wrote the array to: {out_path}")

    LOGGER.stage("ALL DONE")
    print("\nPaste this into the MUSIC_TRACKS array in Showdown Suite:\n")
    print(array_text)
    print(f"\n(Also saved to {out_path} in case copying from the terminal is awkward.)")


def main():
    # Top-level safety net: if ANYTHING above raises, this catches it and
    # prints the full traceback, instead of the whole thing just vanishing.
    try:
        run()
    except FfmpegNotFoundError as e:
        LOGGER.log(str(e), level="ERROR")
        print(f"\nERROR: {e}")
    except Exception:
        tb = traceback.format_exc()
        LOGGER.log("UNHANDLED ERROR:", level="ERROR")
        LOGGER.log(tb, level="ERROR")
        print(f"\nSomething went wrong:\n{tb}")
    input("\nPress Enter to exit...")


if __name__ == "__main__":
    main()
