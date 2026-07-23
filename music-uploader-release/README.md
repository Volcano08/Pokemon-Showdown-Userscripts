# Showdown Music Uploader

This tool takes a folder of your own music files and puts them somewhere on the internet where the Showdown Suite userscript can play them during battles. It also cleans up messy filenames and converts anything that isn't already an mp3.

You don't need to know anything about coding, GitHub, or "the cloud" to use this - every step below is written assuming you're starting from zero. It'll take maybe 15-20 minutes to set up the first time. After that, adding more songs later takes a couple of minutes.

**Your original music files are never changed or deleted.** The tool only ever reads them and creates separate copies to upload.

## What you'll need, in order

1. A free GitHub account (this is where your music files will actually live online)
2. ffmpeg (a free program that converts audio files - only needed if any of your music isn't already in mp3 format)
3. This tool itself (already in your hands, since you're reading this)

Each of these gets its own walkthrough below. Do them in order.

---

## Part 1: Setting up GitHub

GitHub is a free website originally built for programmers to store code, but it works just as well for storing any files - including music - and giving each one a direct web link. That direct link is exactly what Showdown needs to play your music.

### Step 1: Make a GitHub account

Skip this if you already have one.

1. Go to https://github.com/signup
2. Enter an email, create a password, and pick a username (this username matters - you'll need it later, so pick something you'll remember)
3. Follow the verification steps GitHub asks for

### Step 2: Create a repository (a place to put your music)

A "repository" (or "repo" for short) is just GitHub's word for a project folder. You're going to make one specifically to hold your music files.

1. Once logged in, click the **+** icon in the top-right corner of any GitHub page, then **New repository**
2. Give it a name - anything works, like `showdown-music` or `my-battle-music`
3. Make sure **Public** is selected, not Private. This matters: public repos give you free, direct links to your files, which is the whole point. Private ones don't work the same way for this.
4. Click the green **Create repository** button at the bottom
5. You'll land on your new, empty repository's page. Note the name you gave it and your GitHub username (visible in the URL, like `github.com/yourusername/showdown-music`) - you'll need both of these in a few minutes.

### Step 3: Make a Personal Access Token (a special password just for this tool)

Think of this as a separate, limited password that lets this tool upload files to your repository on your behalf, without ever needing your actual GitHub account password. It can only do the one thing you allow it to do (upload files to that one repo) and nothing else.

1. Go to https://github.com/settings/tokens?type=beta and click **Generate new token**
2. Give it any name you'll recognize later, like "Music Uploader"
3. Set an expiration you're comfortable with (a year is a reasonable default - you can always make a new one later if it expires)
4. Under **Repository access**, choose **"Only select repositories"**, then pick the repo you just created in Step 2
5. Under **Permissions**, scroll to **Repository permissions**, find **Contents**, and change it from "No access" to **"Read and write"**. Leave everything else as "No access" - it doesn't need any other permissions.
6. Scroll down and click **Generate token**
7. **Copy the token immediately and save it somewhere.** GitHub only shows it to you this one time - if you navigate away without copying it, you'll have to make a new one.

It'll look like a long, random string starting with `github_pat_`. You'll paste this into a config file in Part 3 below.

---

## Part 2: Installing ffmpeg

ffmpeg is a free program that converts audio between formats. This tool uses it behind the scenes to turn any non-mp3 files (flac, m4a, wav, ogg, aac, wma) into mp3s automatically. If all your music is already in mp3 format, ffmpeg still needs to be installed for the tool to run, but it won't actually need to convert anything.

Pick whichever matches your computer:

**Windows**

Open a Command Prompt (press the Windows key, type `cmd`, press Enter), then run:

```
winget install --id=Gyan.FFmpeg -e
```

This handles everything automatically. Close and reopen your Command Prompt afterward for it to take effect.

If that command doesn't work (rare, usually only on older Windows versions), here's the manual route:
1. Download a build from https://www.gyan.dev/ffmpeg/builds/ (the "release full" or "release essentials" build under "release builds" is fine)
2. Extract the downloaded zip file, then move the extracted folder somewhere permanent, like `C:\ffmpeg`
3. Add it to your PATH (this tells Windows where to find it): press the Windows key, search "environment variables", open **Edit the system environment variables** → **Environment Variables** button → under "System variables" find **Path** → **Edit** → **New** → paste the full path to the folder (e.g. `C:\ffmpeg\bin`) → click OK on all the windows
4. Close and reopen your Command Prompt

**macOS**

Open the Terminal app (press Cmd+Space, type "Terminal", press Enter). If you don't already have Homebrew (a common tool for installing things on Mac), install it first by pasting the command shown on https://brew.sh/ into Terminal. Then run:

```
brew install ffmpeg
```

**Linux**

Open a terminal and use your distribution's package manager:

```
sudo apt install ffmpeg      # Debian, Ubuntu, and derivatives
sudo dnf install ffmpeg      # Fedora
sudo pacman -S ffmpeg        # Arch
```

**Double-check it worked (any OS)**

Close and reopen your terminal/Command Prompt, then run:

```
ffmpeg -version
```

If you see a version number printed, it worked. If you see something like "command not found," something in the steps above didn't take effect - try closing and reopening your terminal again, since that's the most common fix.

---

## Part 3: Setting up the config file

This is a small text file that tells the tool your GitHub username, your repo's name, and your token from Part 1 - so it knows exactly where to upload your music.

1. Inside the folder you downloaded, find `config.example.json`. Make a copy of it in the same folder, and rename the copy to `config.json` exactly (drop the word "example").
2. Open `config.json` in any plain text editor (Notepad on Windows, TextEdit on Mac both work fine) and fill in the four values:

| This field | Should be |
|---|---|
| `github_token` | The long token you copied in Part 1, Step 3 |
| `repo_owner` | Your GitHub username |
| `repo_name` | The name you gave your repo in Part 1, Step 2 |
| `branch` | Leave this as `main` unless you specifically changed it |
| `repo_folder` | Any folder name you want your music organized under, like `Showdown Music` - this gets created automatically |

3. Save the file.

**Keep this file private once it's filled in** - it has your token inside it, which is like a password. Don't email it to anyone or post it publicly.

(If you skip this step entirely, the tool will notice `config.json` is missing, create a template one for you automatically, and tell you to fill it in before continuing.)

---

## Part 4: Running the tool

This is the easiest part - no coding or typing commands required.

1. Double-click `music_uploader.exe` in the folder.
2. A window opens asking you to pick a folder - choose the folder on your computer where your music files are.
3. The tool works through your files automatically, converting anything that isn't already mp3 (you'll see progress printed on screen).
4. For each song, it suggests a cleaned-up name (stripping things like download-site watermarks and track numbers) and asks what you want to do:
   - **Press Enter** to accept the suggested name
   - **Type a new name** and press Enter to use that instead
   - **Type `s`** and press Enter to skip that file entirely
5. Once you've gone through every file, it shows you a summary of everything it's about to upload and asks you to confirm with a final yes/no.
6. It uploads everything, skipping any file that's already there from a previous run (so it's safe to re-run this later when you add new songs).
7. At the end, you'll see a list of links printed on screen - these also get saved to a file called `output_array.txt` in the same folder, so you don't have to worry about copying them before the window closes.

**What to do with those links:** open the Showdown Suite script and paste them into the `MUSIC_TRACKS` list near the top, exactly as they're printed. Full instructions for that part are in the Showdown Suite's own README.

If anything goes wrong at any point (including ffmpeg not being installed correctly), you'll get a plain-English error message explaining what happened, rather than the window just closing.

---

## Optional: running from source code instead of the .exe

Everything above assumes you're using `music_uploader.exe`, which is all most people need. The rest of this section is only relevant if you specifically don't want to run a prebuilt program and would rather run the original Python code yourself - which requires installing Python and is a bit more involved. Skip this entirely unless that specifically appeals to you.

1. Install Python from https://www.python.org/downloads/ if you don't have it already
2. Open a terminal/Command Prompt in this folder and run:
   ```
   pip install -r requirements.txt
   ```
3. Run the tool with:
   ```
   python music_uploader.py
   ```

Everything else (the config file, the steps the tool walks you through) works identically either way.

You can also build your own `.exe` from the source instead of using the one included in this release:

```
pip install pyinstaller
pyinstaller --onefile --console music_uploader.py
```

The result appears in a new `dist` folder. Two things worth knowing if you do this:
- Keep `config.json` sitting next to whichever `.exe` you actually run, not next to the `.py` file.
- Don't remove `--console` from that command - the whole review step (Part 4, step 4 above) happens through typed input, so a version built without a console window would have nowhere for you to type into.

---

## A couple of small notes

- The automatic filename cleanup is rule-based, not perfect. It handles common cases well, but covers, fan edits, and theme songs especially can still need a manual tweak - that's exactly what the rename option in Part 4 is for.
- Conversions are done at 320kbps, the highest quality mp3 supports.
