// ==UserScript==
// @name         Showdown Suite (Merged)
// @namespace    showdown-qol-suite
// @version      1.2.0
// @description  All-in-one: custom music player, QoL shortcuts/avatar/room filter, teambuilder folders, battle/replay/OTS tools, OTS Pokepaste export modifier, adjustable text size, rainbow menu buttons.
// @author       You
// @match        https://play.pokemonshowdown.com/*
// @match        https://psim.us/*
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
	'use strict';

	// Every Showdown application global (app, Storage, BattleFormats,
	// BattleSound, BattleScene, UserPopup, OptionsPopup, TeamPopup,
	// PromptPopup, BattleLog, Config, Dex, ReplayUploadedPopup, ...) goes
	// through `win` everywhere in this file, since GM_openInTab (used
	// below for Teambuilder Mode) forces Violentmonkey to sandbox the
	// whole script, meaning bare `window` isn't the page's real window.
	// Standard web-platform globals (document, MutationObserver, Audio,
	// Node, Date) don't need this - they're equally available in the
	// sandbox. jQuery ($) is left bare throughout, since it works fine
	// unprefixed under this same sandboxing.
	var win = unsafeWindow;

	// macOS's Option key (reported as altKey) is heavily used by the OS
	// itself to produce special/accented characters when combined with
	// letter keys, so Mac shortcuts here use Cmd alone rather than
	// Ctrl+Alt - matching what Mac users expect for app-level shortcuts
	// anyway. The one exception is Teambuilder (see the 't' case below),
	// since Cmd+T alone collides with the browser's "new tab"
	// shortcut.
	var IS_MAC = /Mac/.test(navigator.platform);
	function isShortcutModifier(e) {
		return IS_MAC ? e.metaKey : (e.ctrlKey && e.altKey);
	}
	var SHORTCUT_LABEL = IS_MAC ? 'Cmd' : 'Ctrl+Alt';

	// ============================================================
	// CONFIG - things you'd actually want to edit by hand.
	// Everything else (OTS mode, auto-copy/close replay, Battle/Teambuilder
	// Mode, quick-links toggle, away-on-teambuilder) is already editable
	// from Showdown's own Options popup and persists in localStorage -
	// no need to touch the script for any of that.
	// ============================================================

	// Your own trainer sprite. Applied on the home screen, userbar, your
	// name popup, in battle, and in the Bo3 "Best-of-3" progress display.
	var CUSTOM_AVATAR_URL = 'https://play.pokemonshowdown.com/sprites/trainers/steven-masters2.png';

	// Room list filter (QoL section) - only these rooms show when the
	// "Show more rooms" toggle is off. Room names are matched
	// lowercase/alphanumeric-only, so e.g. "The Happy Place" -> "thehappyplace".
	var ALLOWED_ROOMS = new Set([
		'lobby',
		'tournaments',
		'help',
		'vgc',
		'champions',
		'thehappyplace',
		'mafia',
		'wifi',
	]);

	// Custom Music track list. Empty by default - this is meant to be
	// populated with YOUR OWN hosted mp3s, not shipped with someone else's
	// music library. The companion "Showdown Music Uploader" tool in this
	// same repo handles converting/cleaning/uploading your own files and
	// hands you back entries in exactly this format - just paste them in
	// here.
	var MUSIC_TRACKS = [
		// 'https://raw.githubusercontent.com/your-username/your-repo/refs/heads/main/your-folder/Example%20Song.mp3',
	];

	// ============================================================
	// CUSTOM MUSIC
	// ============================================================
	(function () {
		// No-repeat shuffle pool
		var pool = MUSIC_TRACKS.slice();
		var played = new Set();

		// Manual override state, driven by the music picker window (Ctrl+Alt+M).
		// loopTrack: if set, pickTrack() always returns this track instead of shuffling.
		// forcedNext: one-shot override used when the picker is opened before any
		// battle music is active yet, so there's nothing to switch immediately -
		// this arms the choice for whenever loadBgm() is next called.
		var loopTrack = null;
		var forcedNext = null;

		var pickTrack = function () {
			// MUSIC_TRACKS is empty until you add your own tracks above -
			// without this check, an empty pool would silently return
			// undefined and audio.src would just fail quietly.
			if (MUSIC_TRACKS.length === 0) {
				win.__cmCurrentTrack = null;
				return null;
			}
			var track;
			if (loopTrack) {
				track = loopTrack;
			} else if (forcedNext) {
				track = forcedNext;
				forcedNext = null;
			} else {
				if (pool.length === 0) {
					pool = MUSIC_TRACKS.slice();
					played.clear();
				}
				var idx = Math.floor(Math.random() * pool.length);
				track = pool.splice(idx, 1)[0];
				played.add(track);
			}
			win.__cmCurrentTrack = track;
			return track;
		};

		// Turns a track URL into a clean display name for the picker list, e.g.
		// ".../08.%20Coldplay%20-%20A%20Sky%20Full%20of%20Stars.mp3" -> "Coldplay - A Sky Full of Stars"
		var getTrackName = function (url) {
			try {
				var decoded = decodeURIComponent(url);
				var filename = decoded.substring(decoded.lastIndexOf('/') + 1);
				return filename.replace(/\.mp3$/i, '').replace(/^\d+[.\s-]+/, '');
			} catch (e) {
				return url;
			}
		};

		// Immediately switches the currently playing track. loop=true keeps
		// replaying this exact track (via pickTrack's loopTrack check) until the
		// user picks something else or clicks "Resume Shuffle". loop=false plays it
		// once and resumes normal shuffling afterward. If no battle music is active
		// yet, arms it as the next track instead of switching anything right now.
		// Checks for a currently-open, unfinished battle room specifically,
		// rather than just whether __cmActiveAudio exists - that element
		// persists across battles, so its mere existence doesn't tell you
		// whether one is happening right now.
		function isInActiveBattle() {
			if (!win.app || !win.app.rooms) return false;
			return Object.values(win.app.rooms).some(function (r) {
				return r && r.type === 'battle' && !r.battleEnded;
			});
		}

		function playTrackNow(url, loop) {
			loopTrack = loop ? url : null;
			if (isInActiveBattle() && win.__cmActiveAudio) {
				win.__cmCurrentTrack = url;
				win.__cmActiveAudio.src = url;
				win.__cmActiveAudio.currentTime = 0;
				if (win.__cmGetVolume) win.__cmActiveAudio.volume = win.__cmGetVolume();
				win.__cmActiveAudio.play().catch(function () {});
			} else {
				// Not in a battle right now - arm this as the track for
				// whenever the next battle's music actually starts, rather
				// than playing anything audible immediately.
				forcedNext = url;
			}
		}

		function resumeShuffle() {
			loopTrack = null;
			forcedNext = null;
		}

		// Arrow key volume control
		document.addEventListener('keydown', function (e) {
			if (e.ctrlKey || e.altKey || e.metaKey) return;
			var slider = document.querySelector('input[name=musicvolume]');
			if (!slider) return;
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				slider.value = Math.min(100, parseInt(slider.value) + 1);
				slider.dispatchEvent(new Event('input', { bubbles: true }));
			} else if (e.key === 'ArrowDown') {
				e.preventDefault();
				slider.value = Math.max(0, parseInt(slider.value) - 1);
				slider.dispatchEvent(new Event('input', { bubbles: true }));
			}
		});

		var injectVolumeLabel = function () {
			var sliders = [
				{ name: 'effectvolume', id: 'cm-effect-pct' },
				{ name: 'musicvolume', id: 'cm-music-pct' },
				{ name: 'notifvolume', id: 'cm-notif-pct' },
			];
			for (var i = 0; i < sliders.length; i++) {
				var name = sliders[i].name, id = sliders[i].id;
				var slider = document.querySelector('input[name=' + name + ']');
				if (!slider || document.getElementById(id)) continue;
				var label = document.createElement('span');
				label.id = id;
				label.style.cssText = 'font-size:11px; color:#c0c0d0; margin-left:6px; vertical-align:middle; position:relative; top:-2px;';
				label.textContent = slider.value + '%';
				slider.after(label);
				slider.addEventListener('input', function () {
					this.nextSibling && (this.nextSibling.textContent = this.value + '%');
				});
			}
		};

		setInterval(function () { injectVolumeLabel(); }, 500);

		// ---------- Now Playing widget (always visible while in a battle) ----------
		// Anchored to `.battle-controls-container`, which is present in all three of
		// Showdown's battle layouts (regular/side-by-side, two-panel, and phone
		// top-and-bottom) regardless of whose turn it is - unlike the timer button,
		// which only renders during your own decision window. Styled to match
		// Showdown's own dark-theme button chips (same colors/border/shadow as the
		// timer button next to it).

		function buildNowPlayingStyles() {
			if (document.getElementById('cm-nowplaying-style')) return;
			var style = document.createElement('style');
			style.id = 'cm-nowplaying-style';
			style.textContent =
				'#cm-nowplaying {' +
				'    position: fixed;' +
				'    z-index: 9999;' +
				'    background: #2b2c31;' +
				'    background: linear-gradient(to bottom, #393d46, #2b2c31);' +
				'    border: 1px solid #34373b;' +
				'    border-radius: 5px;' +
				'    box-shadow: 0.5px 1px 2px rgba(255,255,255,0.45), inset 0.5px 1px 1px rgba(255,255,255,0.5);' +
				'    color: #F9F9F9;' +
				'    font-family: Verdana, Helvetica, Arial, sans-serif;' +
				'    font-size: 11px;' +
				'    padding: 3px 8px;' +
				'    white-space: nowrap;' +
				'    pointer-events: none;' +
				'}';
			document.head.appendChild(style);
		}

		// .switchcontrols/.switchmenu wrap the Team section, but their own bounding
		// rect doesn't tightly hug the actual button row. Instead, measure the real
		// rendered <button> elements inside .switchmenu directly - their combined
		// bounds are exact regardless of any wrapper's own box model.
		function getVisibleSwitchMenu() {
			var candidates = document.querySelectorAll('.switchmenu');
			for (var i = 0; i < candidates.length; i++) {
				if (candidates[i].offsetParent !== null) return candidates[i];
			}
			return null;
		}

		function getSwitchRowBounds() {
			var menu = getVisibleSwitchMenu();
			if (!menu) return null;
			var buttons = menu.querySelectorAll('button');
			var maxBottom = -Infinity;
			var minLeft = Infinity;
			for (var i = 0; i < buttons.length; i++) {
				var r = buttons[i].getBoundingClientRect();
				if (r.width === 0 && r.height === 0) continue;
				if (r.bottom > maxBottom) maxBottom = r.bottom;
				if (r.left < minLeft) minLeft = r.left;
			}
			if (maxBottom === -Infinity) return null;
			return { bottom: maxBottom, left: minLeft };
		}

		// Fallback chain for battle states where the switch row isn't on screen at
		// all (waiting on the opponent, spectating, team preview).
		var CM_ANCHOR_SELECTORS = [
			'.switchcontrols',
			'.megaevo-box',
			'.battle-controls-container',
			'.battle-controls',
			'.movecontrols',
			'.shiftcontrols',
			'[data-href="battletimer"]',
			'.battle-log',
		];

		function findBattleAnchor() {
			for (var s = 0; s < CM_ANCHOR_SELECTORS.length; s++) {
				var candidates = document.querySelectorAll(CM_ANCHOR_SELECTORS[s]);
				for (var i = 0; i < candidates.length; i++) {
					if (candidates[i].offsetParent !== null) return candidates[i];
				}
			}
			return null;
		}

		function ensureNowPlayingWidget() {
			var switchRow = getSwitchRowBounds();
			var top, left;

			if (switchRow) {
				top = switchRow.bottom + 6;
				left = switchRow.left;
			} else {
				var anchor = findBattleAnchor();
				if (!anchor) {
					var existing = document.getElementById('cm-nowplaying');
					if (existing) existing.remove();
					return;
				}
				var rect = anchor.getBoundingClientRect();
				top = rect.bottom + 6;
				left = rect.left;
			}

			var widget = document.getElementById('cm-nowplaying');
			if (!widget) {
				buildNowPlayingStyles();
				widget = document.createElement('div');
				widget.id = 'cm-nowplaying';
				document.body.appendChild(widget);
			}

			widget.style.top = top + 'px';
			widget.style.left = left + 'px';

			var name = win.__cmCurrentTrack ? getTrackName(win.__cmCurrentTrack) : 'Not playing';
			var text = '\u266A ' + name;
			if (widget.textContent !== text) widget.textContent = text;
		}

		setInterval(ensureNowPlayingWidget, 100);

		// ---------- Music picker window (Ctrl+Alt+M to open/close) ----------

		function buildPickerStyles() {
			if (document.getElementById('cm-picker-style')) return;
			var style = document.createElement('style');
			style.id = 'cm-picker-style';
			style.textContent =
				'#cm-picker-overlay {' +
				'    position: fixed; inset: 0; background: rgba(0,0,0,0.5);' +
				'    z-index: 10000; display: flex; align-items: center; justify-content: center;' +
				'}' +
				'#cm-picker-modal {' +
				'    background: #1e1e2e; border: 1px solid #4a4a6a; border-radius: 8px;' +
				'    width: 420px; max-height: 70vh; display: flex; flex-direction: column;' +
				'    font-family: \'Segoe UI\', sans-serif; color: #d0d0e0; box-shadow: 0 4px 24px rgba(0,0,0,0.45);' +
				'    overflow: hidden;' +
				'}' +
				'#cm-picker-header {' +
				'    display: flex; align-items: center; justify-content: space-between;' +
				'    padding: 10px 14px; border-bottom: 1px solid #33334a; font-size: 13px; font-weight: 600;' +
				'}' +
				'#cm-picker-close {' +
				'    background: none; border: none; color: #a0a0c0; font-size: 16px; cursor: pointer; line-height: 1;' +
				'}' +
				'#cm-picker-close:hover { color: #fff; }' +
				'#cm-picker-toolbar {' +
				'    display: flex; gap: 8px; padding: 8px 14px; border-bottom: 1px solid #33334a;' +
				'}' +
				'#cm-picker-filter {' +
				'    flex: 1; background: #14141f; border: 1px solid #4a4a6a; border-radius: 4px;' +
				'    color: #d0d0e0; padding: 4px 8px; font-size: 12px; outline: none; min-width: 0;' +
				'}' +
				'#cm-picker-resume {' +
				'    background: #33334a; border: 1px solid #4a4a6a; border-radius: 4px;' +
				'    color: #d0d0e0; font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap;' +
				'}' +
				'#cm-picker-resume:hover { background: #43436a; }' +
				'#cm-picker-list { overflow-y: auto; padding: 4px 0; }' +
				'#cm-picker-list::-webkit-scrollbar { width: 8px; }' +
				'#cm-picker-list::-webkit-scrollbar-thumb { background: #4a4a6a; border-radius: 4px; }' +
				'.cm-picker-row {' +
				'    display: flex; align-items: center; gap: 8px; padding: 6px 14px; font-size: 12px;' +
				'}' +
				'.cm-picker-row:hover { background: #262638; }' +
				'.cm-picker-row.cm-row-looping { background: #2c2c46; }' +
				'.cm-picker-name { flex: 1; overflow-wrap: break-word; white-space: normal; }' +
				'.cm-picker-row button {' +
				'    background: #33334a; border: 1px solid #4a4a6a; border-radius: 4px;' +
				'    color: #d0d0e0; font-size: 11px; padding: 3px 8px; cursor: pointer; flex-shrink: 0;' +
				'}' +
				'.cm-picker-row button:hover { background: #a0a0ff; color: #1e1e2e; }' +
				'.cm-picker-row .cm-loop-btn.cm-loop-active { background: #a0a0ff; color: #1e1e2e; }';
			document.head.appendChild(style);
		}

		function closePicker() {
			var overlay = document.getElementById('cm-picker-overlay');
			if (overlay) overlay.remove();
		}

		function clearRowHighlights(list) {
			list.querySelectorAll('.cm-picker-row').forEach(function (r) { r.classList.remove('cm-row-looping'); });
			list.querySelectorAll('.cm-loop-btn').forEach(function (b) {
				b.classList.remove('cm-loop-active');
				b.textContent = 'Loop';
			});
		}

		function openPicker() {
			// Ctrl+Alt+M toggles: if it's already open, close it instead of rebuilding.
			if (document.getElementById('cm-picker-overlay')) {
				closePicker();
				return;
			}
			buildPickerStyles();

			var overlay = document.createElement('div');
			overlay.id = 'cm-picker-overlay';
			overlay.addEventListener('mousedown', function (e) {
				if (e.target === overlay) closePicker();
			});

			var modal = document.createElement('div');
			modal.id = 'cm-picker-modal';
			modal.addEventListener('mousedown', function (e) { e.stopPropagation(); });
			modal.innerHTML =
				'<div id="cm-picker-header">' +
				'    <span>&#9834; Choose Music</span>' +
				'    <button id="cm-picker-close">&times;</button>' +
				'</div>' +
				'<div id="cm-picker-toolbar">' +
				'    <input type="text" id="cm-picker-filter" placeholder="Filter tracks...">' +
				'    <button id="cm-picker-resume">Resume Shuffle</button>' +
				'</div>' +
				'<div id="cm-picker-list"></div>';
			overlay.appendChild(modal);
			document.body.appendChild(overlay);

			var list = modal.querySelector('#cm-picker-list');

			if (MUSIC_TRACKS.length === 0) {
				var emptyMsg = document.createElement('div');
				emptyMsg.style.cssText = 'padding:16px 14px;color:#888;font-size:12px;line-height:1.5;';
				emptyMsg.textContent = 'No tracks added yet - add your own mp3 URLs to the MUSIC_TRACKS array at the top of the script (the Showdown Music Uploader tool can build this list for you).';
				list.appendChild(emptyMsg);
			}

			var sortedTracks = MUSIC_TRACKS.slice().sort(function (a, b) { return getTrackName(a).localeCompare(getTrackName(b)); });
			sortedTracks.forEach(function (url) {
				var name = getTrackName(url);
				var isLooping = loopTrack === url;
				var row = document.createElement('div');
				row.className = 'cm-picker-row' + (isLooping ? ' cm-row-looping' : '');
				row.dataset.name = name.toLowerCase();
				row.innerHTML =
					'<span class="cm-picker-name">' + name + '</span>' +
					'<button class="cm-play-btn">Play</button>' +
					'<button class="cm-loop-btn' + (isLooping ? ' cm-loop-active' : '') + '">' + (isLooping ? 'Looping' : 'Loop') + '</button>';
				row.querySelector('.cm-play-btn').addEventListener('click', function () {
					playTrackNow(url, false);
					clearRowHighlights(list);
				});
				row.querySelector('.cm-loop-btn').addEventListener('click', function (e) {
					playTrackNow(url, true);
					clearRowHighlights(list);
					row.classList.add('cm-row-looping');
					e.currentTarget.classList.add('cm-loop-active');
					e.currentTarget.textContent = 'Looping';
				});
				list.appendChild(row);
			});

			modal.querySelector('#cm-picker-close').addEventListener('click', closePicker);
			modal.querySelector('#cm-picker-resume').addEventListener('click', function () {
				resumeShuffle();
				clearRowHighlights(list);
			});

			var filterInput = modal.querySelector('#cm-picker-filter');
			filterInput.addEventListener('input', function () {
				var q = filterInput.value.toLowerCase();
				list.querySelectorAll('.cm-picker-row').forEach(function (r) {
					r.style.display = r.dataset.name.indexOf(q) !== -1 ? '' : 'none';
				});
			});
			filterInput.focus();
		}
		win.__cmOpenMusicPicker = openPicker; // exposed so the QoL cheatsheet section below can toggle it too if needed

		// Ctrl+Alt+M opens/closes the picker; Escape closes it if it's open.
		document.addEventListener('keydown', function (e) {
			if (isShortcutModifier(e) && e.key.toLowerCase() === 'm') {
				e.preventDefault();
				openPicker();
			} else if (e.key === 'Escape') {
				var filterInput = document.getElementById('cm-picker-filter');
				if (filterInput && document.activeElement === filterInput && filterInput.value) {
					filterInput.value = '';
					filterInput.dispatchEvent(new Event('input', { bubbles: true }));
				} else {
					closePicker();
				}
			}
		});

		var tryInit = function () {
			if (!win.BattleSound || typeof win.BattleSound.loadBgm !== 'function') return false;
			if (win.BattleSound.__customMusicApplied) return true;

			// Runs via win.eval (== unsafeWindow.eval) so this patch lands on
			// the page's real BattleSound object - Showdown's own code
			// needs to see the patched loadBgm on the actual object it
			// already holds a reference to. Everything inside this
			// template string executes in that real page context, so bare
			// BattleSound/window references in here are correct as
			// written and don't need win. prefixing themselves.
			win.eval(
				"const getVolume = () => {\n" +
				"    if (BattleSound.muted) return 0;\n" +
				"    return BattleSound.bgmVolume / 100;\n" +
				"};\n" +
				"window.__cmGetVolume = getVolume;\n" +
				"\n" +
				"const createAudioSound = function(url) {\n" +
				"    const buildAudio = (trackUrl) => {\n" +
				"        const a = new Audio(trackUrl);\n" +
				"        a.loop = false;\n" +
				"        a.volume = getVolume();\n" +
				"        a.crossOrigin = 'anonymous';\n" +
				"        window.__cmActiveAudio = a;\n" +
				"        return a;\n" +
				"    };\n" +
				"\n" +
				"    let audio = buildAudio(url);\n" +
				"\n" +
				"    audio.addEventListener('ended', () => {\n" +
				"        const nextTrack = window.__cmPickTrack();\n" +
				"        if (!nextTrack) return;\n" +
				"        audio.src = nextTrack;\n" +
				"        audio.volume = getVolume();\n" +
				"        audio.play().catch(() => {});\n" +
				"    });\n" +
				"\n" +
				"    const syncVolume = () => { if (audio) audio.volume = getVolume(); };\n" +
				"    const volInterval = setInterval(syncVolume, 500);\n" +
				"\n" +
				"    const retryOnInteraction = () => {\n" +
				"        audio.play().catch(() => {});\n" +
				"        document.removeEventListener('click', retryOnInteraction);\n" +
				"        document.removeEventListener('keydown', retryOnInteraction);\n" +
				"    };\n" +
				"\n" +
				"    return {\n" +
				"        audio: audio, position: 0, paused: true, volume: 30,\n" +
				"        ensureAudio: function(forceNew) {\n" +
				"            if (!this.audio || forceNew || !this.audio.src) {\n" +
				"                try { if (this.audio) this.audio.pause(); } catch(e) {}\n" +
				"                const nt = window.__cmPickTrack();\n" +
				"                if (!nt) return this.audio;\n" +
				"                this.audio = buildAudio(nt);\n" +
				"                this.audio.addEventListener('ended', () => {\n" +
				"                    const nextTrack = window.__cmPickTrack();\n" +
				"                    if (!nextTrack) return;\n" +
				"                    this.audio.src = nextTrack;\n" +
				"                    this.audio.volume = getVolume();\n" +
				"                    this.audio.play().catch(() => {});\n" +
				"                });\n" +
				"            }\n" +
				"            return this.audio;\n" +
				"        },\n" +
				"        play: function() {\n" +
				"            this.audio.volume = getVolume();\n" +
				"            const p = this.audio.play();\n" +
				"            if (p && typeof p.then === 'function') {\n" +
				"                p.then(() => { this.paused = false; }).catch(() => {\n" +
				"                    const r = this.ensureAudio(true);\n" +
				"                    r.play().catch(() => {\n" +
				"                        document.addEventListener('click', retryOnInteraction, { once: true });\n" +
				"                        document.addEventListener('keydown', retryOnInteraction, { once: true });\n" +
				"                    });\n" +
				"                });\n" +
				"            }\n" +
				"        },\n" +
				"        pause: function() { this.audio.pause(); this.paused = true; },\n" +
				"        stop: function() { this.audio.pause(); this.audio.currentTime = 0; this.paused = true; this.position = 0; },\n" +
				"        destroy: function() {\n" +
				"            try { this.audio.pause(); } catch(e) {}\n" +
				"            clearInterval(volInterval);\n" +
				"            this.paused = true; this.position = 0;\n" +
				"        },\n" +
				"        resume: function() {\n" +
				"            this.audio.volume = getVolume();\n" +
				"            const p = this.audio.play();\n" +
				"            if (p && typeof p.then === 'function') p.then(() => { this.paused = false; }).catch(() => {});\n" +
				"        },\n" +
				"        setPosition: function(pos) { this.position = pos; try { this.audio.currentTime = pos / 1000; } catch(e) {} },\n" +
				"        onposition: function(pos, cb) {\n" +
				"            const i = setInterval(() => { if (this.audio.currentTime * 1000 >= pos) { clearInterval(i); cb.call(this, pos); } }, 100);\n" +
				"        }\n" +
				"    };\n" +
				"};\n" +
				"\n" +
				"BattleSound.loadBgm = function(url, loopstart, loopend) {\n" +
				"    this.bgmCache = this.bgmCache || {};\n" +
				"    const track = window.__cmPickTrack();\n" +
				"    if (!track) return this.bgmCache[url] = { audio: null, play(){}, pause(){}, stop(){}, destroy(){}, resume(){}, setPosition(){}, onposition(){}, paused: true, position: 0 };\n" +
				"    this.bgmCache[url] = createAudioSound(track);\n" +
				"    return this.bgmCache[url];\n" +
				"};\n" +
				"\n" +
				"BattleSound.__customMusicApplied = true;\n"
			);

			// Expose pickTrack to the eval'd context
			win.__cmPickTrack = pickTrack;

			return true;
		};

		var tries = 0;
		var musicTimer = setInterval(function () {
			tries++;
			if (tryInit() || tries >= 100) clearInterval(musicTimer);
		}, 100);
	})();

	// ============================================================
	// SHOWDOWN QoL
	// ============================================================
	(function () {
		// ─── AUTO-CLOSE NEWS POPUP ───
		var closeNews = function () {
			var newsWindow = document.querySelector('.pm-window.news-embed');
			if (newsWindow) {
				var closeBtn = newsWindow.querySelector('.closebutton');
				if (closeBtn) closeBtn.click();
			}
		};
		setTimeout(closeNews, 1000);
		setTimeout(closeNews, 2000);
		setTimeout(closeNews, 4000);

		// ─── AUTO-CLOSE PROXY-LOCK POPUP ───
		// This renders via Showdown's generic Popup class (className: 'ps-popup'),
		// the same class the Move to Folder section's folder picker uses - so this
		// checks the popup's actual message text before clicking anything, rather
		// than matching on .ps-popup alone, to avoid ever touching an unrelated
		// popup that happens to share that class.
		var PROXY_LOCK_TEXT = 'locked due to being a proxy';
		var closeProxyLockPopup = function () {
			document.querySelectorAll('.ps-popup').forEach(function (popup) {
				if (popup.textContent && popup.textContent.indexOf(PROXY_LOCK_TEXT) !== -1) {
					var closeBtn = popup.querySelector('button[name="close"]');
					if (closeBtn) closeBtn.click();
				}
			});
		};
		new MutationObserver(closeProxyLockPopup).observe(document.body, { childList: true, subtree: true });
		closeProxyLockPopup();

		// ─── SAVE & RESTORE LAST FORMAT + TEAM ───
		var FORMAT_KEY = 'qol_last_format';
		var TEAM_INDEX_KEY = 'qol_last_team_index';
		var TEAM_FORMAT_KEY = 'qol_last_team_format';

		var restoreFormatAndTeam = function () {
			var savedFormat = localStorage.getItem(FORMAT_KEY);
			var savedTeamIndex = localStorage.getItem(TEAM_INDEX_KEY);
			var savedTeamFormat = localStorage.getItem(TEAM_FORMAT_KEY);
			if (!savedFormat) return false;
			if (!win.app || !win.app.rooms || !win.app.rooms['']) return false;
			if (!win.BattleFormats || !win.BattleFormats[savedFormat]) return false;
			if (!win.Storage || !win.Storage.teams) return false;

			var room = win.app.rooms[''];

			room.curFormat = savedFormat;
			room.curTeamIndex = savedTeamIndex !== null ? +savedTeamIndex : -1;
			room.curTeamFormat = savedTeamFormat || '';

			var formatBtn = document.querySelector('button[name=format]');
			var teamBtn = document.querySelector('button[name=team]');
			if (formatBtn) formatBtn.outerHTML = room.renderFormats(savedFormat);
			if (teamBtn) teamBtn.outerHTML = room.renderTeams(savedFormat, room.curTeamIndex >= 0 ? room.curTeamIndex : undefined);

			return true;
		};

		var watchFormatAndTeam = function () {
			if (!win.app || !win.app.rooms || !win.app.rooms['']) return false;
			var room = win.app.rooms[''];

			var _curFormat = room.curFormat;
			Object.defineProperty(room, 'curFormat', {
				get: function () { return _curFormat; },
				set: function (val) { _curFormat = val; if (val) localStorage.setItem(FORMAT_KEY, val); },
				configurable: true
			});

			var _curTeamIndex = room.curTeamIndex;
			Object.defineProperty(room, 'curTeamIndex', {
				get: function () { return _curTeamIndex; },
				set: function (val) { _curTeamIndex = val; if (val >= 0) localStorage.setItem(TEAM_INDEX_KEY, val); },
				configurable: true
			});

			var _curTeamFormat = room.curTeamFormat;
			Object.defineProperty(room, 'curTeamFormat', {
				get: function () { return _curTeamFormat; },
				set: function (val) { _curTeamFormat = val; if (val) localStorage.setItem(TEAM_FORMAT_KEY, val); },
				configurable: true
			});

			if (_curFormat) localStorage.setItem(FORMAT_KEY, _curFormat);
			return true;
		};

		var initFormatTracking = setInterval(function () {
			if (!win.app || !win.app.rooms || !win.app.rooms['']) return;
			if (!win.BattleFormats || !win.Storage || !win.Storage.teams) return;
			restoreFormatAndTeam();
			watchFormatAndTeam();
			setTimeout(restoreFormatAndTeam, 500);
			setTimeout(restoreFormatAndTeam, 1500);
			clearInterval(initFormatTracking);
		}, 300);

		// ─── SHORTCUTS CHEATSHEET — press ` to show/hide ───
		var createCheatsheet = function () {
			if (document.getElementById('qol-cheatsheet')) return document.getElementById('qol-cheatsheet');

			var sheet = document.createElement('div');
			sheet.id = 'qol-cheatsheet';
			sheet.className = 'ps-popup';
			sheet.style.cssText = [
				'display:none',
				'position:fixed',
				'top:50%',
				'left:50%',
				'transform:translate(-50%,-50%)',
				'z-index:99999',
				'padding:6px 12px 10px',
				'min-width:260px',
			].join(';');

			var rows = [
				[SHORTCUT_LABEL + '+H', 'Home'],
				[SHORTCUT_LABEL + '+B', 'Battles tab'],
				[(IS_MAC ? 'Cmd+Option' : 'Ctrl+Alt') + '+T', 'Teambuilder'],
				[SHORTCUT_LABEL + '+L', 'Ladder'],
				[SHORTCUT_LABEL + '+F', 'Find battle'],
				[SHORTCUT_LABEL + '+M', 'Music picker'],
				[SHORTCUT_LABEL + '+=/-/0', 'Text size'],
				['\u2190 \u2192', 'Cycle tabs'],
				['\u2191 \u2193', 'Music volume'],
				['F', 'Ladder stats (current format)'],
				['` (backtick)', 'Show/hide this'],
			];

			var html = '<ul class="popupmenu">';
			html += '<li><h3>\u2328 Keyboard Shortcuts</h3></li>';
			rows.forEach(function (pair) {
				html += '<li style="display:flex;justify-content:space-between;gap:16px;padding:1px 0;">'
					+ '<span style="color:#777;">' + pair[0] + '</span>'
					+ '<span>' + pair[1] + '</span>'
					+ '</li>';
			});
			html += '</ul>';
			sheet.innerHTML = html;

			document.body.appendChild(sheet);

			document.addEventListener('click', function (e) {
				if (sheet.style.display !== 'none' && !sheet.contains(e.target)) {
					sheet.style.display = 'none';
				}
			});

			return sheet;
		};

		var cheatsheet;
		window.addEventListener('load', function () { cheatsheet = createCheatsheet(); });

		// ─── KEYBOARD SHORTCUTS & TAB NAVIGATION ───
		// Track which room was last focused for accurate arrow key navigation
		(function trackLastFocused() {
			if (!win.app || !win.app.focusRoom) { setTimeout(trackLastFocused, 300); return; }
			if (win.app._qolFocusTracked) return;
			win.app._qolFocusTracked = true;
			document.addEventListener('click', function (e) {
				var tab = e.target && e.target.closest && e.target.closest('.roomtab');
				if (!tab) return;
				var href = tab.getAttribute('href') || '';
				var id = href.replace(/^\//, '');
				if (win.app.rooms && id in win.app.rooms) win.app._qolLastFocused = win.app.rooms[id];
			}, true);
		})();
		// Make body focusable so we can redirect focus away from buttons
		if (!document.body.hasAttribute('tabindex')) document.body.setAttribute('tabindex', '-1');

		// Remove battle buttons from the arrow-key focus cycle by setting tabindex="-1"
		function disableFocusOnRoomButtons() {
			document.querySelectorAll('.ps-room button, .ps-room-opaque button, .ps-popup button')
				.forEach(function (btn) {
					if (!btn.classList.contains('roomtab')) {
						btn.setAttribute('tabindex', '-1');
					}
				});
		}
		new MutationObserver(function (mutations) {
			var shouldRun = mutations.some(function (m) { return m.addedNodes.length > 0; });
			if (shouldRun) disableFocusOnRoomButtons();
		}).observe(document.body, { childList: true, subtree: true });
		disableFocusOnRoomButtons();

		window.addEventListener('keydown', function (e) {
			var tag = document.activeElement.tagName.toLowerCase();
			var soundsOpen = !!document.querySelector('input[name=musicvolume]');

			if (e.key === '`') {
				e.preventDefault();
				if (!cheatsheet) cheatsheet = createCheatsheet();
				cheatsheet.style.display = cheatsheet.style.display === 'none' ? 'block' : 'none';
				return;
			}

			if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
				var hasContent = tag === 'textarea' && document.activeElement.value.length > 0;
				if (!soundsOpen && !hasContent) {
					e.preventDefault();
					e.stopImmediatePropagation();
					if (document.activeElement && document.activeElement !== document.body) {
						document.activeElement.blur();
					}
					document.body.focus();
					var tabs = Array.from(document.querySelectorAll('.maintabbar .roomtab'));
					if (!tabs.length) return;
					if (!win.app) return;

					var activeRoom = win.app._qolLastFocused || win.app.curRoom;
					var activeId = activeRoom ? activeRoom.id : '';

					var curIdx = tabs.findIndex(function (t) {
						var href = t.getAttribute('href') || '';
						return href === '/' + activeId || href.endsWith('/' + activeId) || (activeId === '' && (href === '/' || href === ''));
					});
					if (curIdx === -1) curIdx = tabs.findIndex(function (t) { return t.classList.contains('cur'); });
					if (curIdx === -1) curIdx = 0;

					var nextIdx = e.key === 'ArrowLeft'
						? (curIdx <= 0 ? tabs.length - 1 : curIdx - 1)
						: (curIdx >= tabs.length - 1 ? 0 : curIdx + 1);
					tabs[nextIdx].click();
					return;
				}
			}

			// Teambuilder needs e.code, not e.key - on Mac, holding Option
			// changes what character a letter key produces (Option+T types
			// "†" on a US layout, not "t"), so e.key.toLowerCase() === 't'
			// would never match once Option is also held. e.code reports
			// the physical key position regardless of any such
			// modifier-driven character substitution.
			if (e.code === 'KeyT' && (IS_MAC ? (e.metaKey && e.altKey) : (e.ctrlKey && e.altKey))) {
				e.preventDefault();
				if (win.app) win.app.tryJoinRoom('teambuilder');
				return;
			}

			if (isShortcutModifier(e)) {
				switch (e.key.toLowerCase()) {
					case 'h': e.preventDefault(); if (win.app) win.app.focusRoom(''); break;
					case 'b': e.preventDefault(); if (win.app) win.app.tryJoinRoom('battles'); break;
					case 'l': e.preventDefault(); if (win.app) win.app.tryJoinRoom('ladder'); break;
					case 'f':
						e.preventDefault();
						var searchBtn = document.querySelector('.battleform button[name=search]');
						if (searchBtn) searchBtn.click();
						break;
					// Ctrl+Alt+M (music picker) is handled by the Custom Music section above.
					// Ctrl+Alt+=/-/0 (text size) is handled by the Text Size section below.
				}
			}
		}, true);

		// ─── CUSTOM AVATAR ───
		var applyCustomAvatar = function () {
			if (!CUSTOM_AVATAR_URL) return;

			var replaceSprites = function () {
				// Home screen: <img class="trainersprite yours"> — .yours = the logged-in user only
				document.querySelectorAll('img.trainersprite.yours').forEach(function (img) {
					if (img.src !== CUSTOM_AVATAR_URL) img.src = CUSTOM_AVATAR_URL;
				});

				// Userbar avatar (top-right corner of the page)
				document.querySelectorAll('.userbar img.trainersprite').forEach(function (img) {
					if (img.src !== CUSTOM_AVATAR_URL) img.src = CUSTOM_AVATAR_URL;
				});

				// UserPopup (clicking your name) — img.trainersprite.yours inside ps-popup
				document.querySelectorAll('.ps-popup img.trainersprite.yours, .ps-overlay img.trainersprite.yours').forEach(function (img) {
					if (img.src !== CUSTOM_AVATAR_URL) img.src = CUSTOM_AVATAR_URL;
				});

				// Bo3 tracker room ("Best-of-3" progress display): its trainer
				// sprites are plain <img class="trainersprite"> tags embedded
				// directly in fieldhtml, not rendered through the battle-scene
				// canvas the block below handles - and neither one carries a
				// .yours class, since both players show side by side there.
				// Which one is "mine" isn't reliably determined by side or the
				// flip transform (whichever name comes first in the room title
				// sits on the left and gets flipped, regardless of who that
				// is), so it's matched by column position against your own
				// name in the row above instead. Note: an opponent whose
				// avatar hasn't resolved yet server-side will show as
				// unknownf.png regardless of this code - that's normal, not a bug.
				var myName = win.app && win.app.user && win.app.user.get('name');
				if (myName) {
					document.querySelectorAll('img.trainersprite').forEach(function (img) {
						if (img.classList.contains('yours')) return; // handled above already
						var cell = img.closest('td');
						var spriteRow = img.closest('tr');
						var table = img.closest('table');
						if (!cell || !spriteRow || !table) return;
						var cellIndex = Array.from(spriteRow.children).indexOf(cell);
						if (cellIndex === -1) return;
						var rows = Array.from(table.querySelectorAll('tr'));
						var spriteRowIndex = rows.indexOf(spriteRow);
						if (spriteRowIndex <= 0) return;
						var nameCell = rows[spriteRowIndex - 1].children[cellIndex];
						var strong = nameCell && nameCell.querySelector('strong');
						if (!strong || strong.textContent.trim() !== myName) return;
						if (img.src !== CUSTOM_AVATAR_URL) img.src = CUSTOM_AVATAR_URL;
					});
				}

				// Battle scene: .trainer-near is always the player's side (leftbar).
				if (win.app && win.app.rooms) {
					Object.values(win.app.rooms).forEach(function (room) {
						if (!room || !room.battle || !room.request) return;
						var scene = room.battle.scene;
						var leftbar = scene && scene.$leftbar && scene.$leftbar[0];
						if (!leftbar) return;
						leftbar.querySelectorAll('.trainersprite').forEach(function (div) {
							var url = 'url(' + CUSTOM_AVATAR_URL + ')';
							if (div.style.backgroundImage !== url) {
								div.style.backgroundImage = url;
							}
						});
					});
				}
			};

			replaceSprites();

			var patchBattleSceneProto = function () {
				if (!win.BattleScene || win.BattleScene.prototype._qolAvatarHooked) return;
				win.BattleScene.prototype._qolAvatarHooked = true;
				var orig = win.BattleScene.prototype.updateLeftSidebar;
				win.BattleScene.prototype.updateLeftSidebar = function () {
					orig.call(this);
					if (!this.battle || !this.$leftbar) return;
					var b = this.battle;
					var room = win.app && win.app.rooms && win.app.rooms[b.roomid];
					if (!room || !room.request) return;
					this.$leftbar[0].querySelectorAll('.trainersprite').forEach(function (div) {
						div.style.backgroundImage = 'url(' + CUSTOM_AVATAR_URL + ')';
					});
				};
			};

			var protoObserver = new MutationObserver(function () {
				if (win.BattleScene) { patchBattleSceneProto(); protoObserver.disconnect(); }
			});
			protoObserver.observe(document.body, { childList: true, subtree: true });
			patchBattleSceneProto();

			// Patch UserPopup and OptionsPopup so avatar is replaced immediately after they render.
			// IMPORTANT: only replace when the popup belongs to the logged-in user.
			// UserPopup.data.userid identifies whose popup it is; OptionsPopup is always "yours".
			function patchPopupAvatar(PopupClass) {
				if (!PopupClass || PopupClass.prototype._qolAvatarPatched) return;
				PopupClass.prototype._qolAvatarPatched = true;
				var origUpdate = PopupClass.prototype.update;
				PopupClass.prototype.update = function (data) {
					origUpdate.call(this, data);
					var myUserid = win.app && win.app.user && win.app.user.get('userid');
					var popupUserid = this.data && this.data.userid;
					if (popupUserid && myUserid && popupUserid !== myUserid) return;
					this.$el.find('img.trainersprite').each(function () {
						if (this.src !== CUSTOM_AVATAR_URL) this.src = CUSTOM_AVATAR_URL;
					});
				};
			}
			(function tryPatchPopups() {
				if (win.UserPopup) patchPopupAvatar(win.UserPopup);
				if (win.OptionsPopup) patchPopupAvatar(win.OptionsPopup);
				if (!win.UserPopup || !win.OptionsPopup) setTimeout(tryPatchPopups, 300);
			})();

			var observer = new MutationObserver(replaceSprites);
			observer.observe(document.body, { childList: true, subtree: true });
		};

		applyCustomAvatar();

		// ─── ROOM LIST FILTER — only show allowed rooms ───
		var toRoomID = function (name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, ''); };

		var roomFilterEnabled = true;

		var filterRoomList = function () {
			document.querySelectorAll('.roomlist > div').forEach(function (div) {
				var strong = div.querySelector('strong');
				if (!strong) return;
				var title = Array.from(strong.childNodes)
					.filter(function (n) { return n.nodeType === Node.TEXT_NODE; })
					.map(function (n) { return n.textContent.trim(); })
					.join('');
				var id = toRoomID(title);
				if (id) div.style.display = (!roomFilterEnabled || ALLOWED_ROOMS.has(id)) ? '' : 'none';
			});

			// rooms-psplchatrooms is the rotating single-room "spotlight" callout
			// (e.g. "Ladder Spotlight"), which is safe to hide entirely since it's
			// never one of the individually-allowed rooms above. The main "Chat
			// rooms" header (rooms-chatrooms) is deliberately NOT targeted here -
			// it legitimately labels the curated allowed-room list beneath it.
			document.querySelectorAll('h2.rooms-psplchatrooms').forEach(function (h) {
				var hide = roomFilterEnabled;
				h.style.display = hide ? 'none' : '';
				var el = h.nextElementSibling;
				while (el && el.tagName !== 'H2') {
					el.style.display = hide ? 'none' : '';
					el = el.nextElementSibling;
				}
			});
		};

		var hookToggleMoreRooms = function () {
			var tb = win.app && win.app.rooms && win.app.rooms['rooms'];
			if (!tb || typeof tb.toggleMoreRooms !== 'function' || tb._qolHooked) return;
			tb._qolHooked = true;
			var orig = tb.toggleMoreRooms.bind(tb);
			tb.toggleMoreRooms = function () {
				orig();
				roomFilterEnabled = !this.showMoreRooms;
				filterRoomList();
			};
		};

		var roomListObserver = new MutationObserver(function () {
			hookToggleMoreRooms();
			filterRoomList();
		});
		var observeRoomList = function () {
			document.querySelectorAll('.roomlist').forEach(function (el) {
				roomListObserver.observe(el, { childList: true });
			});
			hookToggleMoreRooms();
			filterRoomList();
		};

		new MutationObserver(function () {
			if (document.querySelector('.roomlist')) observeRoomList();
		}).observe(document.body, { childList: true, subtree: true });
	})();

	// ============================================================
	// SHOWDOWN MOVE TO FOLDER
	// ============================================================
	(function () {
		var PREFS_KEY = 'ps-folder-ui';

		// ─── prefs ───
		function getPrefs() {
			var v = win.Storage.prefs(PREFS_KEY);
			return (v && typeof v === 'object') ? v : { pins: [] };
		}
		function savePrefs(p) { win.Storage.prefs(PREFS_KEY, p); }
		function getPinned() { return getPrefs().pins || []; }
		function isPinned(name) { return getPinned().indexOf(name) !== -1; }
		function togglePin(name) {
			var p = getPrefs(); p.pins = p.pins || [];
			var idx = p.pins.indexOf(name);
			if (idx === -1) p.pins.push(name); else p.pins.splice(idx, 1);
			savePrefs(p);
		}

		// ─── folder helpers ───
		function getNamedFolders() {
			var seen = {}, folders = [];
			var teams = win.Storage && win.Storage.teams || [];
			for (var i = 0; i < teams.length; i++) {
				var f = teams[i] && teams[i].folder;
				if (f && !seen[f]) { seen[f] = true; folders.push(f); }
			}
			return folders.sort();
		}

		function getAllFolderPaths() {
			var seen = {}, all = [];
			(win.Storage && win.Storage.teams || []).forEach(function (t) {
				if (!t || !t.folder) return;
				var parts = t.folder.split('/');
				for (var j = 1; j <= parts.length; j++) {
					var path = parts.slice(0, j).join('/');
					if (!seen[path]) { seen[path] = true; all.push(path); }
				}
			});
			return all.sort();
		}

		function folderDisplayName(path) {
			var parts = path.split('/');
			return parts[parts.length - 1];
		}

		function folderDepth(path) {
			return path.split('/').length - 1;
		}

		function getChildFolders(parentPath) {
			var all = getAllFolderPaths();
			return all.filter(function (p) {
				if (parentPath === '') {
					return p.indexOf('/') === -1;
				}
				if (!p.startsWith(parentPath + '/')) return false;
				var rest = p.slice(parentPath.length + 1);
				return rest.indexOf('/') === -1;
			});
		}

		function getCurrentTeam() {
			var tb = win.app && win.app.rooms && win.app.rooms['teambuilder'];
			return tb && tb.curTeam || null;
		}

		function moveToFolder(team, folderName) {
			var teamName = team.name;
			var prevFolder = team.folder;
			team.folder = folderName;
			win.Storage.saveTeam(team);
			win.app.user.trigger('saveteams');
			setTimeout(function () {
				var userid = win.app.user.get('userid');
				if (!userid || !win.app.rooms || !win.app.rooms['']) return;
				var msg = folderName
					? 'Moved \u201c' + teamName + '\u201d to folder: ' + folderName
					: 'Removed \u201c' + teamName + '\u201d from folder: ' + prevFolder;
				if (win.app.rooms[''].send) win.app.rooms[''].send('/pm ' + userid + ', ' + msg);
				if (win.app.rooms[''].notifyOnce) win.app.rooms[''].notifyOnce('Folder update', msg, 'folder-move');
			}, 100);
		}

		function esc(s) {
			return win.BattleLog ? win.BattleLog.escapeHTML(s)
				: s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		}

		// ─── patch updateFolderList to show subfolders ───
		function patchUpdateFolderList() {
			var tb = win.app.rooms && win.app.rooms['teambuilder'];
			if (!tb || typeof tb.updateFolderList !== 'function') return;
			if (tb.__psFolderListPatched) return;
			tb.__psFolderListPatched = true;

			var origUpdateFolderList = tb.updateFolderList.bind(tb);
			var origUpdateTeamList = tb.updateTeamList.bind(tb);

			var origUpdateTeamView = tb.updateTeamView && tb.updateTeamView.bind(tb);
			if (origUpdateTeamView) {
				tb.updateTeamView = function () {
					origUpdateTeamView.apply(this, arguments);
					injectButton(this);
				};
			}

			tb.updateFolderList = function () {
				origUpdateFolderList.apply(this, arguments);
				enhanceSidebar();
				injectSubfolderRows(this);
				injectFolderHeaderPin();
			};

			tb.updateTeamList = function (resetScroll) {
				origUpdateTeamList.apply(this, arguments);
				enhanceTeamList(this);
			};
		}

		// Showdown may keep a stale/hidden teampane around from a previous room
		// instance after closing and reopening the tab. offsetParent is null
		// for anything under display:none, so this finds the one actually on
		// screen instead of whichever comes first in DOM order.
		function getVisibleTeampane() {
			var candidates = document.querySelectorAll('.teampane');
			for (var i = 0; i < candidates.length; i++) {
				if (candidates[i].offsetParent !== null) return candidates[i];
			}
			return null;
		}

		function enhanceTeamList(tb) {
			var teampane = getVisibleTeampane();
			if (!teampane) { injectSubfolderNav(tb); injectFolderHeaderPin(); return; }

			var curFolder = (tb && tb.curFolder) || '';

			if (curFolder.slice(-1) === '/') {
				var folderPath = curFolder.slice(0, -1);
				if (folderPath && folderPath.indexOf('/') !== -1) {
					var h2 = teampane.querySelector('h2');
					if (h2) {
						var parts = folderPath.split('/');
						var label = folderDisplayName(folderPath);
						var breadcrumb = parts.slice(0, -1).map(function (p, idx) {
							var ancestorPath = parts.slice(0, idx + 1).join('/');
							return '<a href="#" class="ps-breadcrumb" data-folder="' + esc(ancestorPath + '/') + '" style="color:#6af;text-decoration:none;">' + esc(p) + '</a>';
						}).join(' <span style="color:#aaa">›</span> ');
						var renameBtn = h2.querySelector('button[name="renameFolder"]');
						var deleteBtn = h2.querySelector('button[name="promptDeleteFolder"]');
						var btnHtml = (renameBtn ? renameBtn.outerHTML : '') + ' ' + (deleteBtn ? deleteBtn.outerHTML : '');
						h2.innerHTML = '<i class="fa fa-folder-open"></i> ' +
							(breadcrumb ? breadcrumb + ' <span style="color:#aaa">›</span> ' : '') +
							'<strong>' + esc(label) + '</strong> ' + btnHtml;
						h2.querySelectorAll('.ps-breadcrumb').forEach(function (a) {
							a.addEventListener('click', function (e) {
								e.preventDefault(); e.stopPropagation();
								if (tb && tb.selectFolder) tb.selectFolder(a.getAttribute('data-folder'));
							});
						});
					}
				}
			}

			var teamlist = teampane.querySelector('ul.teamlist');
			if (teamlist) {
				if (curFolder.slice(-1) === '/') {
					Array.prototype.slice.call(teamlist.querySelectorAll('li')).forEach(function (li) {
						var teamDiv = li.querySelector('.team');
						if (!teamDiv) return;
						var idx = parseInt(teamDiv.getAttribute('data-value'));
						if (isNaN(idx)) return;
						var team = (win.Storage.teams || [])[idx];
						if (!team) return;
						var teamFolder = team.folder || '';
						if (!teamFolder) return;

						var folderBase = curFolder.slice(0, -1);
						for (var n = teamDiv.firstChild; n; n = n.nextSibling) {
							if (n.nodeType === 3 && n.textContent.indexOf(teamFolder + '/') >= 0) {
								if (teamFolder !== folderBase) {
									var subLabel = teamFolder.slice(folderBase.length + 1);
									n.textContent = n.textContent.replace(teamFolder + '/', '');
									var indent = document.createElement('span');
									indent.style.cssText = 'color:#aaa;font-size:9px;margin-right:4px;';
									indent.textContent = '└ ' + subLabel + '/';
									teamDiv.insertBefore(indent, teamDiv.firstChild);
								} else {
									n.textContent = n.textContent.replace(teamFolder + '/', '');
								}
								break;
							}
						}
					});
				} else {
					// All-teams view: regroup - unfoldered teams first (no header),
					// then pinned folder(s) grouped together (pin order), then
					// everything else, one header per folder, alphabetical.
					try {
						teamlist.querySelectorAll('.ps-folder-group-header, .ps-nofolder-header').forEach(function (h) {
							h.parentNode.removeChild(h);
						});

						var items = [];
						Array.prototype.slice.call(teamlist.querySelectorAll('li')).forEach(function (li) {
							var teamDiv = li.querySelector('.team');
							if (!teamDiv) return;
							var idx = parseInt(teamDiv.getAttribute('data-value'));
							if (isNaN(idx)) return;
							var team = (win.Storage.teams || [])[idx];
							if (!team) return;
							items.push({ li: li, teamDiv: teamDiv, teamFolder: team.folder || '' });
						});

						var unfoldered = items.filter(function (it) { return !it.teamFolder; });
						var foldered = items.filter(function (it) { return it.teamFolder; });

						var byFolder = {}, folderOrder = [];
						foldered.forEach(function (it) {
							if (!byFolder[it.teamFolder]) { byFolder[it.teamFolder] = []; folderOrder.push(it.teamFolder); }
							byFolder[it.teamFolder].push(it);
						});

						var pins = getPinned().filter(function (p) { return byFolder[p]; });
						var others = folderOrder.filter(function (f) { return pins.indexOf(f) === -1; }).sort();
						var orderedFolders = pins.concat(others);

						var stripPrefix = function (it) {
							for (var n = it.teamDiv.firstChild; n; n = n.nextSibling) {
								if (n.nodeType === 3 && n.textContent.indexOf(it.teamFolder + '/') >= 0) {
									n.textContent = n.textContent.replace(it.teamFolder + '/', '');
									break;
								}
							}
						};

						var frag = document.createDocumentFragment();
						orderedFolders.forEach(function (folderName) {
							var depth = folderDepth(folderName);
							var header = document.createElement('li');
							header.className = 'ps-folder-group-header';
							header.style.cssText = 'list-style:none;padding:4px 8px 2px ' + (8 + depth * 12) + 'px;color:#9ab;font-size:9pt;border-top:1px solid rgba(255,255,255,.08);margin-top:4px;cursor:pointer;';
							header.innerHTML = '<i class="fa fa-folder-o" style="margin-right:4px;"></i>' + esc(folderDisplayName(folderName));
							if (depth > 0) {
								header.innerHTML = '<span style="color:#aaa;font-size:9px;">└ </span>' + header.innerHTML;
							}
							header.title = 'Open folder ' + folderName;
							header.addEventListener('click', function () {
								if (tb && tb.selectFolder) tb.selectFolder(folderName + '/');
							});
							frag.appendChild(header);
							byFolder[folderName].forEach(function (it) {
								stripPrefix(it);
								frag.appendChild(it.li);
							});
						});
						if (unfoldered.length && orderedFolders.length) {
							var noFolderLabel = document.createElement('li');
							noFolderLabel.className = 'ps-nofolder-header';
							noFolderLabel.style.cssText = 'list-style:none;padding:4px 8px 2px 8px;color:#9ab;font-size:9pt;border-top:1px solid rgba(255,255,255,.08);margin-top:4px;cursor:pointer;';
							noFolderLabel.innerHTML = '<i class="fa fa-minus" style="margin-right:4px;"></i>No Folder';
							noFolderLabel.title = 'Show only teams with no folder';
							noFolderLabel.addEventListener('click', function () {
								if (tb && tb.selectFolder) tb.selectFolder('/');
							});
							frag.appendChild(noFolderLabel);
						}
						unfoldered.forEach(function (it) { frag.appendChild(it.li); });
						teamlist.appendChild(frag);
					} catch (err) {
						console.error('[Showdown Suite / Move to Folder] enhanceTeamList grouping failed:', err);
					}
				}
			}

			injectSubfolderNav(tb);
			injectFolderHeaderPin();
		}

		function injectSubfolderRows(tb) {
			var folderpane = getVisibleFolderpane();
			if (!folderpane) return;
			var folderlist = folderpane.querySelector('.folderlist');
			if (!folderlist) return;

			folderlist.querySelectorAll('.ps-subfolder-row').forEach(function (el) {
				el.parentNode.removeChild(el);
			});

			var allPaths = getAllFolderPaths();
			var subPaths = allPaths.filter(function (p) { return p.indexOf('/') !== -1; });
			if (!subPaths.length) return;

			if (!document.getElementById('ps-subfolder-style')) {
				var style = document.createElement('style');
				style.id = 'ps-subfolder-style';
				style.textContent = [
					'.ps-subfolder-row > .selectFolder { padding-left: 20px !important; }',
					'.ps-subfolder-row > .selectFolder .ps-sub-indent { color: #aaa; margin-right: 3px; font-size: 9px; }',
					'.ps-pin-header .selectFolder {',
					'  font-weight:bold; color:#557 !important;',
					'  cursor:default !important;',
					'  background:#c7d3dc !important;',
					'  pointer-events:none !important;',
					'}',
				].join('\n');
				document.head.appendChild(style);
			}

			subPaths.forEach(function (subPath) {
				var parts = subPath.split('/');
				var parentPath = parts.slice(0, -1).join('/');
				var parentDataVal = parentPath + '/';
				var parentEl = null;
				var selectFolderEls = folderlist.querySelectorAll('.selectFolder');
				for (var i = 0; i < selectFolderEls.length; i++) {
					if (selectFolderEls[i].getAttribute('data-value') === parentDataVal) { parentEl = selectFolderEls[i]; break; }
				}
				if (!parentEl) return;
				var parentRow = parentEl.parentNode;
				while (parentRow && !parentRow.classList.contains('folder')) parentRow = parentRow.parentNode;
				if (!parentRow) return;

				var isCur = tb && tb.curFolder === (subPath + '/');
				var dataVal = subPath + '/';

				var subRow = document.createElement('div');
				subRow.className = 'folder ps-subfolder-row' + (isCur ? ' cur' : '');

				var innerHTML = isCur
					? '<div class="folderhack3"><div class="folderhack1"></div><div class="folderhack2"></div>' +
					  '<div class="selectFolder" data-value="' + esc(dataVal) + '">' +
					  '<span class="ps-sub-indent">└</span><i class="fa fa-folder-open"></i> ' + esc(folderDisplayName(subPath)) +
					  '</div></div>'
					: '<div class="selectFolder" data-value="' + esc(dataVal) + '">' +
					  '<span class="ps-sub-indent">└</span><i class="fa fa-folder-o"></i> ' + esc(folderDisplayName(subPath)) +
					  '</div>';
				subRow.innerHTML = innerHTML;

				var insertAfterEl = parentRow;
				var next = parentRow.nextSibling;
				while (next && next.classList && next.classList.contains('ps-subfolder-row')) {
					var nextSub = next.dataset && next.dataset.psSubfolder || '';
					if (!nextSub.startsWith(parentPath + '/')) break;
					insertAfterEl = next;
					next = next.nextSibling;
				}
				subRow.dataset.psSubfolder = subPath;
				if (insertAfterEl.nextSibling) {
					folderlist.insertBefore(subRow, insertAfterEl.nextSibling);
				} else {
					folderlist.appendChild(subRow);
				}
			});
		}

		function injectSubfolderNav(tb) {
			var teampane = getVisibleTeampane();
			if (!teampane) return;

			var existing = teampane.querySelector('.ps-subfolder-nav');
			if (existing) existing.parentNode.removeChild(existing);

			if (!tb || !tb.curFolder || tb.curFolder.slice(-1) !== '/') return;
			var parentFolder = tb.curFolder.slice(0, -1);
			if (!parentFolder) return;

			var children = getChildFolders(parentFolder);
			if (!children.length) return;

			var nav = document.createElement('p');
			nav.className = 'ps-subfolder-nav';
			nav.style.cssText = 'margin:4px 12px 8px;';

			children.forEach(function (childPath) {
				var btn = document.createElement('button');
				btn.className = 'button';
				btn.style.cssText = 'margin:2px 4px 2px 0;font-size:9pt;';
				btn.innerHTML = '<i class="fa fa-folder-o"></i> ' + esc(folderDisplayName(childPath));
				btn.addEventListener('click', function () {
					if (tb.selectFolder) tb.selectFolder(childPath + '/');
				});
				nav.appendChild(btn);
			});

			var h2 = teampane.querySelector('h2');
			if (h2 && h2.nextSibling) {
				teampane.insertBefore(nav, h2.nextSibling);
			} else {
				teampane.insertBefore(nav, teampane.firstChild);
			}
		}

		function injectFolderHeaderPin() {
			var teampane = getVisibleTeampane();
			if (!teampane) return;
			var removeBtn = teampane.querySelector('h2 button[name="promptDeleteFolder"]');
			if (!removeBtn || removeBtn.parentNode.querySelector('.ps-header-pin')) return;
			var tb = win.app.rooms && win.app.rooms['teambuilder'];
			var folderName = tb && tb.curFolder && tb.curFolder.slice(-1) === '/'
				? tb.curFolder.slice(0, -1) : null;
			if (!folderName) return;
			var pinned = isPinned(folderName);
			var btn = document.createElement('button');
			btn.className = 'button small ps-header-pin';
			btn.style.marginLeft = '5px';
			btn.title = pinned ? 'Unpin folder from sidebar' : 'Pin folder to top of sidebar';
			btn.innerHTML = '<i class="fa fa-thumb-tack"></i> ' + (pinned ? 'Unpin' : 'Pin');
			if (pinned) btn.style.color = '#e8a000';
			btn.addEventListener('click', function (e) {
				e.stopPropagation();
				togglePin(folderName);
				if (tb && tb.updateFolderList) tb.updateFolderList();
				var existing = teampane.querySelector('h2 .ps-header-pin');
				if (existing) existing.parentNode.removeChild(existing);
				injectFolderHeaderPin();
			});
			removeBtn.insertAdjacentElement('afterend', btn);
		}

		// Same category of bug as getVisibleTeampane - a stale/hidden folderpane
		// from a previous room instance could otherwise get grabbed instead of
		// the one actually on screen.
		function getVisibleFolderpane() {
			var candidates = document.querySelectorAll('.folderpane');
			for (var i = 0; i < candidates.length; i++) {
				if (candidates[i].offsetParent !== null) return candidates[i];
			}
			return null;
		}

		function enhanceSidebar() {
			var folderpane = getVisibleFolderpane();
			if (!folderpane) return;
			var folderlist = folderpane.querySelector('.folderlist');
			if (!folderlist) return;

			var namedRows = [];
			folderlist.querySelectorAll('.folder').forEach(function (div) {
				if (div.classList.contains('ps-subfolder-row')) return;
				var sf = div.querySelector('.selectFolder');
				if (!sf) return;
				var val = sf.getAttribute('data-value');
				if (val && val !== '/' && val.slice(-1) === '/') {
					namedRows.push({ div: div, name: val.slice(0, -1) });
				}
			});

			var pins = getPinned().filter(function (p) {
				return namedRows.some(function (r) { return r.name === p; });
			});
			if (!pins.length) return;

			folderlist.querySelectorAll('.ps-pin-header').forEach(function (el) { el.parentNode.removeChild(el); });

			var allRow = null;
			Array.prototype.forEach.call(folderlist.children, function (child) {
				var sf = child.querySelector('.selectFolder');
				if (sf && sf.getAttribute('data-value') === 'all') allRow = child;
			});

			function insertAfter(newNode, ref) {
				if (ref && ref.nextSibling) folderlist.insertBefore(newNode, ref.nextSibling);
				else folderlist.appendChild(newNode);
			}

			function getSubRowsFor(parentName) {
				var subs = [];
				folderlist.querySelectorAll('.ps-subfolder-row').forEach(function (el) {
					var sub = el.dataset && el.dataset.psSubfolder || '';
					if (sub.startsWith(parentName + '/')) subs.push(el);
				});
				return subs;
			}

			var pinHeader = document.createElement('div');
			pinHeader.className = 'folder ps-pin-header';
			var pinSf = document.createElement('div');
			pinSf.className = 'selectFolder';
			pinSf.innerHTML = '<i class="fa fa-thumb-tack" style="color:#e8a000"></i> Pinned';
			pinHeader.appendChild(pinSf);

			var anchor = allRow;
			insertAfter(pinHeader, anchor);
			anchor = pinHeader;

			pins.forEach(function (name) {
				var row = namedRows.find(function (r) { return r.name === name; });
				if (!row) return;
				insertAfter(row.div, anchor);
				anchor = row.div;
				getSubRowsFor(name).forEach(function (subRow) {
					insertAfter(subRow, anchor);
					anchor = subRow;
				});
			});
		}

		// ─── dropdown ───
		function closeDropdown() {
			var el = document.getElementById('ps-folder-picker');
			if (el) el.parentNode.removeChild(el);
		}

		function showFolderReorganizer(folderPath, anchorEl) {
			closeDropdown();
			var folderName = folderDisplayName(folderPath);
			var allPaths = getAllFolderPaths();

			var popup = document.createElement('div');
			popup.id = 'ps-folder-picker';
			popup.className = 'ps-popup';
			popup.style.cssText = 'position:fixed;z-index:99999;padding:5px 8px;min-width:240px;max-height:60vh;overflow-y:auto;';

			var ul = document.createElement('ul');
			ul.className = 'popupmenu';

			var titleLi = document.createElement('li');
			var h3 = document.createElement('h3');
			h3.textContent = 'Move folder \u201c' + folderName + '\u201d into\u2026';
			titleLi.appendChild(h3);
			ul.appendChild(titleLi);

			function applyMove(newPath) {
				if (newPath === folderPath) return;
				(win.Storage.teams || []).forEach(function (t) {
					if (!t) return;
					if (t.folder === folderPath) {
						t.folder = newPath;
					} else if (t.folder && t.folder.startsWith(folderPath + '/')) {
						t.folder = newPath + t.folder.slice(folderPath.length);
					}
				});
				win.Storage.saveAllTeams();
				win.app.user.trigger('saveteams');
				var tb = win.app.rooms && win.app.rooms['teambuilder'];
				if (tb && tb.updateFolderList) tb.updateFolderList();
			}

			function addOption(label, icon, newPath, disabled) {
				var li = document.createElement('li');
				var btn = document.createElement('button');
				btn.className = 'button';
				btn.style.cssText = 'display:block;width:100%;text-align:left;margin:1px 0;font-size:9pt;' + (disabled ? 'opacity:0.4;' : '');
				btn.innerHTML = '<i class="fa ' + icon + '"></i> ' + esc(label);
				if (disabled) {
					btn.disabled = true;
				} else {
					btn.addEventListener('click', function (e) {
						e.stopPropagation();
						closeDropdown();
						applyMove(newPath);
					});
				}
				li.appendChild(btn);
				ul.appendChild(li);
			}

			var isAlreadyTopLevel = folderPath.indexOf('/') === -1;
			addOption('(Top level) — make \u201c' + folderName + '\u201d a main folder', 'fa-home',
				folderName, isAlreadyTopLevel);

			var sep = document.createElement('li');
			sep.style.cssText = 'border-top:1px solid #bbb;margin:3px -8px;';
			ul.appendChild(sep);

			var validParents = allPaths.filter(function (p) {
				if (p === folderPath) return false;
				if (p.startsWith(folderPath + '/')) return false;
				return true;
			});

			if (validParents.length) {
				validParents.forEach(function (parentPath) {
					var depth = folderDepth(parentPath);
					var indent = '\u00a0'.repeat(depth * 2);
					var wouldBe = parentPath + '/' + folderName;
					var alreadyThere = folderPath === wouldBe;
					addOption(indent + folderDisplayName(parentPath) + ' \u203a ' + folderName,
						depth > 0 ? 'fa-folder-o' : 'fa-folder',
						wouldBe, alreadyThere);
				});
			} else {
				var noLi = document.createElement('li');
				noLi.style.cssText = 'color:#888;font-size:8pt;padding:2px 4px;';
				noLi.textContent = 'No other folders to move into.';
				ul.appendChild(noLi);
			}

			popup.appendChild(ul);
			document.body.appendChild(popup);

			var rect = anchorEl.getBoundingClientRect();
			popup.style.top = (rect.bottom + 4) + 'px';
			popup.style.left = rect.left + 'px';
			requestAnimationFrame(function () {
				var r = popup.getBoundingClientRect();
				if (r.right > window.innerWidth - 8)
					popup.style.left = Math.max(8, rect.right - popup.offsetWidth) + 'px';
			});
		}

		function showFolderPicker(anchorEl) {
			closeDropdown();
			var team = getCurrentTeam();
			if (!team) return;

			var allPaths = getAllFolderPaths();
			var pins = getPinned();
			var pinnedFolders = pins.filter(function (p) { return allPaths.indexOf(p) !== -1; });

			var popup = document.createElement('div');
			popup.id = 'ps-folder-picker';
			popup.className = 'ps-popup';
			popup.style.cssText = 'position:fixed;z-index:99999;padding:5px 8px;min-width:240px;max-height:60vh;overflow-y:auto;';

			var ul = document.createElement('ul');
			ul.className = 'popupmenu';

			function addHeader(text) {
				var li = document.createElement('li');
				var h3 = document.createElement('h3');
				h3.textContent = text;
				li.appendChild(h3);
				ul.appendChild(li);
			}

			function addSep() {
				var li = document.createElement('li');
				li.style.cssText = 'border-top:1px solid #bbb;margin:3px -8px;';
				ul.appendChild(li);
			}

			function addFolderItem(folderPath) {
				var isCurrent = team.folder === folderPath;
				var pinned = isPinned(folderPath);
				var depth = folderDepth(folderPath);
				var label = folderDisplayName(folderPath);
				var indent = depth * 14;

				var li = document.createElement('li');
				li.style.cssText = 'display:flex;align-items:center;gap:2px;';

				var moveBtn = document.createElement('button');
				moveBtn.className = 'option';
				moveBtn.style.cssText = 'flex:1;text-align:left;padding-left:' + (6 + indent) + 'px;' +
					(isCurrent ? 'opacity:0.5;cursor:default;' : '');
				var treePfx = depth > 0 ? '<span style="color:#aaa;margin-right:2px;font-size:9px;">└</span>' : '';
				var ico = isCurrent ? 'fa-folder-open-o' : 'fa-folder-o';
				moveBtn.innerHTML = treePfx + '<i class="fa ' + ico + '"></i> ' + esc(label) +
					(isCurrent ? ' <small>(current)</small>' : '');
				if (!isCurrent) {
					moveBtn.addEventListener('click', function (e) {
						closeDropdown(); moveToFolder(team, folderPath);
					});
				} else { moveBtn.disabled = true; }

				var openBtn = document.createElement('button');
				openBtn.className = 'button';
				openBtn.title = 'Open folder';
				openBtn.style.cssText = 'padding:2px 6px;font-size:9pt;';
				openBtn.innerHTML = '<i class="fa fa-arrow-right"></i>';
				openBtn.addEventListener('click', function (e) {
					e.stopPropagation();
					closeDropdown();
					var tb = win.app.rooms && win.app.rooms['teambuilder'];
					if (!tb) return;
					if (tb.curTeam && tb.back) tb.back();
					if (tb.selectFolder) tb.selectFolder(folderPath + '/');
				});

				var subBtn = document.createElement('button');
				subBtn.className = 'button';
				subBtn.title = 'New subfolder inside \u201c' + folderPath + '\u201d';
				subBtn.style.cssText = 'padding:2px 6px;font-size:9pt;';
				subBtn.innerHTML = '<i class="fa fa-folder-o"></i><sup style="font-size:7px;vertical-align:top;">+</sup>';
				subBtn.addEventListener('click', function (e) {
					e.stopPropagation();
					closeDropdown();
					win.app.addPopup(win.PromptPopup, {
						message: 'New subfolder inside \u201c' + folderPath + '\u201d:',
						button: 'Create & move here',
						sourceEl: anchorEl,
						callback: function (name) {
							if (!name) return;
							name = name.replace(/\//g, '').trim();
							if (!name) return;
							moveToFolder(team, folderPath + '/' + name);
						},
					});
				});

				var renameBtn = document.createElement('button');
				renameBtn.className = 'button';
				renameBtn.title = 'Move folder \u201c' + folderPath + '\u201d to top-level or inside another folder';
				renameBtn.style.cssText = 'padding:2px 6px;font-size:9pt;';
				renameBtn.innerHTML = '<i class="fa fa-sitemap"></i>';
				renameBtn.addEventListener('click', function (e) {
					e.stopPropagation();
					var popup = document.getElementById('ps-folder-picker');
					if (popup) popup.parentNode.removeChild(popup);
					showFolderReorganizer(folderPath, anchorEl);
				});

				var pinBtn = document.createElement('button');
				pinBtn.className = 'button';
				pinBtn.title = pinned ? 'Unpin from top' : 'Pin to top';
				pinBtn.style.cssText = 'padding:2px 6px;font-size:9pt;color:' + (pinned ? '#e8a000' : '');
				pinBtn.innerHTML = '<i class="fa fa-thumb-tack"></i>';
				pinBtn.addEventListener('click', function (e) {
					e.stopPropagation();
					togglePin(folderPath);
					var tb = win.app.rooms && win.app.rooms['teambuilder'];
					if (tb && tb.updateFolderList) tb.updateFolderList();
					closeDropdown();
					showFolderPicker(anchorEl);
				});

				li.appendChild(moveBtn);
				li.appendChild(subBtn);
				li.appendChild(renameBtn);
				li.appendChild(openBtn);
				li.appendChild(pinBtn);
				ul.appendChild(li);
			}

			if (pinnedFolders.length) {
				addHeader('Pinned');
				pinnedFolders.forEach(addFolderItem);
				if (allPaths.length) addSep();
			}
			if (allPaths.length) {
				if (pinnedFolders.length) addHeader('All Folders');
				allPaths.forEach(addFolderItem);
			} else {
				var emptyLi = document.createElement('li');
				emptyLi.style.cssText = 'color:#888;padding:2px 4px;font-size:8pt;';
				emptyLi.textContent = 'No named folders yet.';
				ul.appendChild(emptyLi);
			}

			addSep();

			if (team.folder) {
				var curParts = team.folder.split('/');
				if (curParts.length > 1) {
					var parentPath = curParts.slice(0, -1).join('/');
					var moveUpLi = document.createElement('li');
					var moveUpBtn = document.createElement('button');
					moveUpBtn.className = 'option';
					moveUpBtn.innerHTML = '<i class="fa fa-arrow-up"></i> Move up to \u201c' + esc(parentPath) + '\u201d';
					moveUpBtn.addEventListener('click', function (e) {
						closeDropdown(); moveToFolder(team, parentPath);
					});
					moveUpLi.appendChild(moveUpBtn);
					ul.appendChild(moveUpLi);
				}

				var removeLi = document.createElement('li');
				var removeBtn = document.createElement('button');
				removeBtn.className = 'option';
				removeBtn.innerHTML = '<i class="fa fa-times"></i> Remove from folder';
				removeBtn.addEventListener('click', function (e) {
					closeDropdown(); moveToFolder(team, '');
				});
				removeLi.appendChild(removeBtn);
				ul.appendChild(removeLi);
			}

			var newLi = document.createElement('li');
			var newBtn = document.createElement('button');
			newBtn.className = 'option';
			newBtn.innerHTML = '<i class="fa fa-plus"></i> New folder\u2026';
			newBtn.addEventListener('click', function (e) {
				closeDropdown();
				win.app.addPopup(win.PromptPopup, {
					message: 'Folder name (use / for subfolders, e.g. VGC/2026):',
					button: 'Move to folder',
					sourceEl: anchorEl,
					callback: function (name) {
						if (!name) return;
						name = name.replace(/^\/+|\/+$/, '').replace(/\/+/g, '/').trim();
						if (!name) return;
						moveToFolder(team, name);
					},
				});
			});
			newLi.appendChild(newBtn);
			ul.appendChild(newLi);

			popup.appendChild(ul);
			document.body.appendChild(popup);

			var rect = anchorEl.getBoundingClientRect();
			popup.style.top = (rect.bottom + 4) + 'px';
			popup.style.left = rect.left + 'px';
			requestAnimationFrame(function () {
				var r = popup.getBoundingClientRect();
				if (r.right > window.innerWidth - 8)
					popup.style.left = Math.max(8, rect.right - popup.offsetWidth) + 'px';
			});
		}

		document.addEventListener('click', function (e) {
			var el = document.getElementById('ps-folder-picker');
			if (el && !el.contains(e.target)) closeDropdown();
		});

		// ─── editor button ───
		function injectButton(tb) {
			var validateBtn = document.querySelector('li.format-select button[name="validate"]');
			if (!validateBtn) return;
			if (document.getElementById('ps-move-folder-btn')) return;
			var btn = document.createElement('button');
			btn.id = 'ps-move-folder-btn';
			btn.className = 'button';
			btn.title = 'Move to folder';
			btn.innerHTML = '<i class="fa fa-folder"></i> Folder';
			btn.addEventListener('click', function (e) {
				e.stopPropagation();
				var tbRoom = win.app && win.app.rooms && win.app.rooms['teambuilder'];
				if (!tbRoom || !tbRoom.curTeam) return;
				showFolderPicker(btn);
			});
			validateBtn.insertAdjacentElement('afterend', btn);
		}

		// ─── TeamPopup patch ───
		var teamPopupPatched = false;

		function patchTeamPopup() {
			if (teamPopupPatched) return;
			if (!win.TeamPopup) return;
			teamPopupPatched = true;

			var origInit = win.TeamPopup.prototype.initialize;
			win.TeamPopup.prototype.initialize = function (data) {
				origInit.call(this, data);

				var popup = this.$el[0] || this.el;
				if (!popup) return;

				popup.querySelectorAll('button[name="selectFolder"]').forEach(function (btn) {
					var val = btn.value;
					if (!val || val === '(No Folder)') return;
					var depth = val.split('/').length - 1;
					var label = folderDisplayName(val);
					var indent = depth * 10;
					var icon = btn.querySelector('i');
					var iconHtml = icon ? icon.outerHTML : '<i class="fa fa-folder-open" style="margin-right:7px;margin-left:4px;"></i>';
					var prefix = depth > 0
						? '<span style="color:#aaa;font-size:9px;margin-left:' + (indent - 4) + 'px;margin-right:3px;">└</span>'
						: '';
					btn.innerHTML = prefix + iconHtml + esc(label);
					if (depth > 0) {
						btn.style.paddingLeft = (4 + indent) + 'px';
					}
				});
			};
		}

		function tryPatchTeamPopup() {
			if (win.TeamPopup) {
				patchTeamPopup();
			} else {
				setTimeout(tryPatchTeamPopup, 500);
			}
		}

		function startObservingFolders() {
			if (!win.Storage || !win.app) { setTimeout(startObservingFolders, 300); return; }

			function tryPatch() {
				patchUpdateFolderList();
				var tbNow = win.app.rooms && win.app.rooms['teambuilder'];
				if (getVisibleFolderpane()) {
					enhanceSidebar();
					injectSubfolderRows(tbNow);
				}
				if (getVisibleTeampane()) {
					enhanceTeamList(tbNow);
				}
				injectFolderHeaderPin();
			}
			tryPatch();
			injectButton();
			tryPatchTeamPopup();

			new MutationObserver(function () {
				if (document.querySelector('li.format-select button[name="validate"]')) injectButton();
				var tb = win.app.rooms && win.app.rooms['teambuilder'];
				if (!tb || !tb.__psFolderListPatched) tryPatch();
			}).observe(document.body, { childList: true, subtree: true });
		}

		startObservingFolders();
	})();

	// ============================================================
	// SHOWDOWN BATTLE UPDATE
	// ============================================================
	(function () {
		var PREFS_KEY = 'qol2-settings';

		function getQolPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch (e) { return {}; } }
		function setQolPref(key, val) { var p = getQolPrefs(); p[key] = val; localStorage.setItem(PREFS_KEY, JSON.stringify(p)); }
		function getQolPref(key, def) { var p = getQolPrefs(); return (key in p) ? p[key] : def; }

		// ─── OptionsPopup patch ───
		function patchOptionsPopup() {
			if (!win.OptionsPopup || OptionsPopup.prototype._qolPatched) return;
			OptionsPopup.prototype._qolPatched = true;
			var origUpdate = OptionsPopup.prototype.update;
			OptionsPopup.prototype.update = function () {
				origUpdate.call(this);
				var self = this;

				if (!self.$el.find('.qol2-close-btn').length) {
					self.$el.prepend('<div style="text-align:right;margin-bottom:2px;"><button name="close" class="closebutton qol2-close-btn" tabindex="-1" aria-label="Close"><i class="fa fa-times-circle"></i></button></div>');
				}

				if (!document.getElementById('qol2-settings-style')) {
					var st = document.createElement('style'); st.id = 'qol2-settings-style';
					st.textContent = '.qol2-section-header{cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between;padding-right:4px;}.qol2-section-header:hover strong{text-decoration:underline;}.qol2-section-chevron{font-size:10px;color:#888;}.qol2-section-body.collapsed{display:none;}';
					document.head.appendChild(st);
				}

				var $el = self.$el;

				$el.find('p > strong').each(function () {
					var $h = $(this).parent(), sn = $(this).text().trim(), sk = 'section-' + sn.toLowerCase().replace(/\s+/g, '-'), c = getQolPref(sk, false);
					var $b = $('<div class="qol2-section-body' + (c ? ' collapsed' : '') + '"></div>');
					var $n = $h.next();
					while ($n.length && $n[0].tagName !== 'HR') { var $c = $n; $n = $n.next(); $b.append($c); }
					$h.addClass('qol2-section-header');
					var $cv = $('<span class="qol2-section-chevron">' + (c ? '&#9654;' : '&#9660;') + '</span>');
					$h.append($cv); $h.after($b);
					$h.on('click', function () { var ic = $b.hasClass('collapsed'); $b.toggleClass('collapsed', !ic); $cv.html(ic ? '&#9660;' : '&#9654;'); setQolPref(sk, !ic); });
				});

				var $lastHr = $el.find('hr').last();

				var otsVal = getQolPref('ots', 'ask');
				$lastHr.before($([
					'<hr /><p class="qol2-section-header" id="qol2-battle-header"><strong>Battle</strong><span class="qol2-section-chevron">&#9660;</span></p>',
					'<div class="qol2-section-body" id="qol2-battle-body">',
					'<p><label class="optlabel">Open Team Sheets:<select name="qol2-ots" class="button">',
					'<option value="ask"' + (otsVal === 'ask' ? ' selected' : '') + '>Ask me each time</option>',
					'<option value="accept"' + (otsVal === 'accept' ? ' selected' : '') + '>Always accept</option>',
					'<option value="reject"' + (otsVal === 'reject' ? ' selected' : '') + '>Always reject</option>',
					'</select></label></p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-autocopyreplay"' + (getQolPref('autocopyreplay', false) ? ' checked' : '') + ' /> Auto-copy replay link when battle ends</label></p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-autoclosebattle"' + (getQolPref('autoclosebattle', false) ? ' checked' : '') + ' /> Auto-close battle after replay link is copied</label></p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-closeforfeit"' + (getQolPref('closeforfeit', true) ? ' checked' : '') + ' /> Close battle after forfeiting</label></p>',
					'</div>',
				].join('')));

				var $bH = $el.find('#qol2-battle-header'), $bB = $el.find('#qol2-battle-body'), $bC = $bH.find('.qol2-section-chevron');
				if (getQolPref('section-battle', false)) { $bB.addClass('collapsed'); $bC.html('&#9654;'); }
				$bH.on('click', function () { var c = $bB.hasClass('collapsed'); $bB.toggleClass('collapsed', !c); $bC.html(c ? '&#9660;' : '&#9654;'); setQolPref('section-battle', !c); });
				$el.find('select[name="qol2-ots"]').on('change', function () { setQolPref('ots', this.value); });
				$el.find('input[name="qol2-autocopyreplay"]').on('change', function () { setQolPref('autocopyreplay', this.checked); });
				$el.find('input[name="qol2-autoclosebattle"]').on('change', function () { setQolPref('autoclosebattle', this.checked); if (this.checked) setQolPref('closeforfeit', false); if (self.update) self.update(); });
				$el.find('input[name="qol2-closeforfeit"]').on('change', function () { setQolPref('closeforfeit', this.checked); if (this.checked) setQolPref('autoclosebattle', false); if (self.update) self.update(); });

				var bmA = battleMode !== 'off';
				var tbActive = tbMode;

				$lastHr.before($([
					'<hr /><p class="qol2-section-header" id="qol2-tb-header"><strong>Teambuilder</strong><span class="qol2-section-chevron">&#9660;</span></p>',
					'<div class="qol2-section-body" id="qol2-tb-body">',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-tbquicklinks"' + (getQolPref('tbquicklinks', false) ? ' checked' : '') + ' /> Show Pokémon quick-links in Teambuilder</label></p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-otsnature"' + (getQolPref('otsnature', true) ? ' checked' : '') + ' /> Include Nature in OTS Pokepaste export</label></p>',
					'</div>',
				].join('')));

				var $tbH = $el.find('#qol2-tb-header'), $tbB = $el.find('#qol2-tb-body'), $tbC = $tbH.find('.qol2-section-chevron');
				if (getQolPref('section-teambuilder', false)) { $tbB.addClass('collapsed'); $tbC.html('&#9654;'); }
				$tbH.on('click', function () { var c = $tbB.hasClass('collapsed'); $tbB.toggleClass('collapsed', !c); $tbC.html(c ? '&#9660;' : '&#9654;'); setQolPref('section-teambuilder', !c); });
				$el.find('input[name="qol2-tbquicklinks"]').on('change', function () {
					setQolPref('tbquicklinks', this.checked);
					if (this.checked) patchTeambuilderLinks();
				});
				$el.find('input[name="qol2-otsnature"]').on('change', function () {
					setQolPref('otsnature', this.checked);
				});

				$lastHr.before($([
					'<hr /><p class="qol2-section-header" id="qol2-modes-header"><strong>Modes</strong><span class="qol2-section-chevron">&#9660;</span></p>',
					'<div class="qol2-section-body" id="qol2-modes-body">',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-defaultmode"' + ((battleMode === 'off' && !tbMode) ? ' checked' : '') + ' /> <strong>Default Mode</strong></label></p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-battlemode"' + (bmA ? ' checked' : '') + ' /> <strong>Battle Mode</strong></label></p>',
					'<div id="qol2-bm-opts" style="' + (bmA ? '' : 'display:none;') + 'margin-left:16px;">',
					'<p style="color:#777;font-size:8pt;margin:2px 0 4px;">Auto-searches your current format. Replays are copied and saved for export.</p>',
					(battleMode === 'active' || battleMode === 'paused' ? '<p><button class="button" name="qol2-bm-status" style="font-size:8pt;"><i class="fa fa-' + (battleMode === 'active' ? 'pause' : 'play') + '"></i> ' + (battleMode === 'active' ? 'Pause' : 'Resume') + '</button></p>' : ''),
					'</div>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-tbmode"' + (tbActive ? ' checked' : '') + ' /> <strong>Teambuilder Mode</strong></label></p>',
					'<div id="qol2-tb-opts" style="' + (tbActive ? '' : 'display:none;') + 'margin-left:16px;">',
					'<p style="color:#777;font-size:8pt;margin:2px 0 4px;">Opens Teambuilder, MunchStats, and the Nerd of Now damage calc.</p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-tb-away"' + (getQolPref('tb-away', false) ? ' checked' : '') + ' /> Set status to Away on start</label></p>',
					'</div>',
					'</div>',
				].join('')));

				var $mH = $el.find('#qol2-modes-header'), $mB = $el.find('#qol2-modes-body'), $mC = $mH.find('.qol2-section-chevron');
				if (getQolPref('section-modes', false)) { $mB.addClass('collapsed'); $mC.html('&#9654;'); }
				$mH.on('click', function () { var c = $mB.hasClass('collapsed'); $mB.toggleClass('collapsed', !c); $mC.html(c ? '&#9660;' : '&#9654;'); setQolPref('section-modes', !c); });
				$el.find('input[name="qol2-defaultmode"]').on('change', function () {
					if (this.checked) { if (battleMode !== 'off') bmEnd(); if (tbMode) tbEnd(); if (self.update) self.update(); }
					else { if (battleMode === 'off' && !tbMode) this.checked = true; }
				});
				$el.find('input[name="qol2-battlemode"]').on('change', function () { if (this.checked) bmStart(); else bmEnd(); if (self.update) self.update(); });
				$el.find('input[name="qol2-tbmode"]').on('change', function () {
					if (this.checked) { tbStart(); } else { tbEnd(); }
					if (self.update) self.update();
				});
				$el.find('input[name="qol2-tb-away"]').on('change', function () { setQolPref('tb-away', this.checked); });
				$el.find('button[name="qol2-bm-status"]').on('mousedown', function (e) {
					e.preventDefault(); var oc = self.close.bind(self); self.close = function () {};
					if (battleMode === 'active') { bmPause(); }
					else if (battleMode === 'paused') { battleMode = 'active'; renderBattleModeWidget(); bmTrySearch(); }
					self.close = oc; if (self.update) self.update();
				});
			};
		}

		// ─── OTS ───
		var patchedRooms = new Set();
		function patchBattleRoom(room) {
			if (!room || room.type !== 'battle' || patchedRooms.has(room.id)) return;
			patchedRooms.add(room.id);
			var orig = room.add.bind(room);
			room.add = function (data) {
				if (typeof data === 'string' && data.includes('|uhtml|') && data.toLowerCase().includes('openteamsheet') && data.toLowerCase().includes('acceptopenteamsheets')) {
					var ots = getQolPref('ots', 'ask');
					if (ots === 'accept') { room.send('/acceptopenteamsheets'); data = data.replace(/<button[\s\S]*?<\/button>/gi, '<em style="color:#888">(auto-accepted open team sheets)</em>'); }
					else if (ots === 'reject') { room.send('/rejectopenteamsheets'); data = data.replace(/<button[\s\S]*?<\/button>/gi, '<em style="color:#888">(auto-rejected open team sheets)</em>'); }
				}
				return orig(data);
			};
		}

		// ─── Battle Mode ───
		var battleMode = 'off', bmReplays = [], bmFormat = '', bmTeamIndex = null, bmBattleCount = 0;
		var bmBo3Series = {};

		function bmIsBo3Format(fmt) {
			if (!fmt) return false;
			return fmt.toLowerCase().indexOf('bo3') >= 0 || fmt.toLowerCase().indexOf('bestof') >= 0;
		}
		function bmRoomIsBo3(room) {
			if (!room) return false;
			if (bmIsBo3Format(bmFormat)) return true;
			if (room.id && (room.id.toLowerCase().indexOf('bo3') >= 0 || room.id.toLowerCase().indexOf('bestof') >= 0)) return true;
			return false;
		}

		function bmRoomFmt(roomId) {
			if (!roomId) return '';
			return roomId
				.replace(/^(?:battle|game(?:-bestof3)?)-/, '')
				.replace(/-[0-9a-f]{20,}$/, '')
				.replace(/-\d+.*$/, '');
		}

		// Reverse of bmFindTrackerRoomForBattle: given a tracker room, find any
		// currently-open real battle rooms (not the tracker itself) that belong to
		// the same series by format match. Needed because the tracker room's own
		// end-of-series signal can arrive and get handled (closing the tracker)
		// well before the last game's own battle room finishes its slower,
		// independent replay-save-and-close flow - once the tracker is gone,
		// that flow has nothing left to look up and silently does nothing.
		function bmFindOpenBattleRoomsForTracker(trackerRoom) {
			if (!win.app || !win.app.rooms || !trackerRoom) return [];
			var fmt = bmRoomFmt(trackerRoom.id);
			return Object.values(app.rooms).filter(function (r) {
				if (!r || !r.id || r === trackerRoom) return false;
				if (r.type !== 'battle') return false;
				if (r.id.indexOf('game-') === 0) return false;
				if (fmt && bmRoomFmt(r.id) === fmt) return true;
				return r.id.toLowerCase().indexOf('bestof') >= 0;
			});
		}

		function bmFindTrackerRoomForBattle(battleRoom) {
			if (!win.app || !win.app.rooms) return null;
			var fmt = bmRoomFmt(battleRoom && battleRoom.id);
			var candidates = Object.values(app.rooms).filter(function (r) {
				if (!r || !r.id || r === battleRoom) return false;
				if (!r.id.startsWith('game-')) return false;
				if (fmt && bmRoomFmt(r.id) === fmt) return true;
				if (r.id.toLowerCase().indexOf('bestof') >= 0) return true;
				return false;
			});
			if (!candidates.length) return null;
			var active = candidates.find(function (r) {
				return !bmBo3Series[r.id] || !bmBo3Series[r.id].done;
			});
			return active || candidates[candidates.length - 1];
		}

		function bmGetSeries(trackerRoom) {
			if (!trackerRoom) return null;
			if (!bmBo3Series[trackerRoom.id]) {
				bmBo3Series[trackerRoom.id] = {
					wins: {}, games: [], trackerRoomId: trackerRoom.id,
					done: false, gameCount: 0
				};
			}
			return bmBo3Series[trackerRoom.id];
		}

		function bmRecordGame(trackerRoom, battleRoom, replayUrl) {
			var series = bmGetSeries(trackerRoom);
			if (!series || series.done) return;

			var battleId = battleRoom && battleRoom.id;
			var existingGame = battleId && series.games.find(function (g) { return g.battleId === battleId; });
			if (existingGame) {
				if (replayUrl && !existingGame.url) existingGame.url = replayUrl;
				return;
			}

			series.gameCount++;

			var winner = '';
			if (battleRoom && battleRoom.battle) {
				var b = battleRoom.battle;
				var sq = b.stepQueue || [];
				for (var qi = 0; qi < sq.length; qi++) {
					if (sq[qi] && sq[qi].substr(0, 5) === '|win|') { winner = sq[qi].substr(5); break; }
				}
				if (!winner && b.p1 && b.p2) {
					var myName = (win.app && app.user && app.user.get('name')) || '';
					if (b.p1.name && b.p1.name !== myName) winner = b.p1.name;
					else if (b.p2.name) winner = b.p2.name;
				}
			}
			if (winner) series.wins[winner] = (series.wins[winner] || 0) + 1;
			series.games.push({ game: series.gameCount, battleId: battleId || '', url: replayUrl || '', winner: winner || '' });

			var seriesDone = Object.values(series.wins).some(function (w) { return w >= 2; });
			if (seriesDone) {
				series.done = true;
				series.games.forEach(function (g) { if (g.url && bmReplays.indexOf(g.url) === -1) bmReplays.push(g.url); });

				setTimeout(function () {
					if (battleRoom && typeof battleRoom.close === 'function') battleRoom.close();
					bmFindOpenBattleRoomsForTracker(trackerRoom).forEach(function (br) {
						if (typeof br.close === 'function') br.close();
					});
					if (trackerRoom && typeof trackerRoom.close === 'function') trackerRoom.close();
					app.focusRoom('');
				}, 150);

				if (battleMode === 'active' || battleMode === 'paused') {
					bmBattleCount++;
					renderBattleModeWidget();
					if (battleMode === 'active') setTimeout(function () { bmTrySearch(); }, 1500);
				} else {
					bmAutoDownloadSeries(series);
				}
			} else {
				setTimeout(function () {
					if (battleRoom && typeof battleRoom.close === 'function') battleRoom.close();
					app.focusRoom(trackerRoom.id);
					bmClickReady(trackerRoom);
				}, 200);
				var prevId = battleRoom.id;
				var pollStart = Date.now();
				var nextRoomId = null;
				var nextRoomSaved = false;
				var pollNextRoom = setInterval(function () {
					if (Date.now() - pollStart > 120000) { clearInterval(pollNextRoom); return; }
					if (!app.rooms) return;
					Object.values(app.rooms).forEach(function (r) {
						if (!r || r.type !== 'battle' || r.id === prevId || !bmRoomIsBo3(r)) return;
						patchBattleRoom(r);
						if (nextRoomId !== r.id) {
							nextRoomId = r.id;
							r._qol2ReplaySent = false;
							hookBattleEndReplay(r);
						}
						if (r.battle && r.battle.ended && !nextRoomSaved) {
							nextRoomSaved = true;
							clearInterval(pollNextRoom);
							if (!r._qol2ReplaySent) {
								r._qol2ReplaySent = true;
								patchUploadReplay();
								setTimeout(function () { if (r.saveReplay) r.saveReplay(); }, 1500);
							}
						}
					});
				}, 500);
			}
		}

		function bmClickReady(trackerRoom) {
			if (!trackerRoom) return;
			if (app.focusRoom) app.focusRoom(trackerRoom.id);
			var attempts = 0;
			function tryClick() {
				var el = (trackerRoom.$el && trackerRoom.$el[0]) || trackerRoom.el;
				if (el) {
					var btn = el.querySelector('button[value*="/confirmready"]');
					if (!btn) btn = el.querySelector('button[name="send"][value*="confirmready"]');
					if (!btn) {
						var all = el.querySelectorAll('button:not([disabled])');
						for (var i = 0; i < all.length; i++) {
							if (all[i].textContent.toLowerCase().indexOf('ready') >= 0) { btn = all[i]; break; }
						}
					}
					if (btn) { btn.click(); return; }
				}
				if (attempts >= 3 && trackerRoom.send) {
					trackerRoom.send('/msgroom ' + trackerRoom.id + ',/confirmready');
					return;
				}
				if (++attempts < 8) setTimeout(tryClick, 500);
			}
			setTimeout(tryClick, 600);
		}
		function bmFormatName() { return (win.BattleFormats && BattleFormats[bmFormat] && BattleFormats[bmFormat].name) || bmFormat; }
		function bmIsInBattle() {
			if (!win.app || !win.app.rooms) return false;
			if (Object.values(app.rooms).some(function (r) { return r && r.type === 'battle' && !r.battleEnded; })) return true;
			if (bmBo3WaitUntil && Date.now() < bmBo3WaitUntil) return true;
			return false;
		}
		var bmBo3WaitUntil = 0;

		function updateBattleModeWidgetVisibility() {
			var w = document.getElementById('qol2-bm-widget');
			if (!w) return;
			var curRoom = win.app && win.app.curRoom;
			var curIsBattle = curRoom && curRoom.type === 'battle';
			w.style.display = curIsBattle ? 'none' : '';
		}

		function renderBattleModeWidget() {
			var w = document.getElementById('qol2-bm-widget');
			if (w && !document.body.contains(w)) { w.parentNode && w.parentNode.removeChild(w); w = null; }
			if (!w) {
				w = document.createElement('div');
				w.id = 'qol2-bm-widget';
				w.className = 'menugroup';
				w.style.cssText = 'background:rgba(0,0,0,.4);max-width:270px;';
				var target = document.querySelector('.activitymenu') || document.querySelector('.mainmenu') || document.body;
				target.appendChild(w);
			}
			var ip = battleMode === 'paused';
			var isBo3Widget = bmIsBo3Format(bmFormat);
			var seriesScoreHtml = '';
			if (isBo3Widget) {
				var activeSeries = Object.values(bmBo3Series).filter(function (s) { return !s.done && s.gameCount > 0; });
				if (activeSeries.length) {
					var s = activeSeries[activeSeries.length - 1];
					var scoreEntries = Object.entries(s.wins);
					if (scoreEntries.length) {
						seriesScoreHtml = '<p style="text-align:center;color:rgba(255,255,255,.85);font-size:9pt;margin:0 0 5px;">'
							+ '<strong>Game ' + s.gameCount + '</strong>: '
							+ scoreEntries.map(function (e) { return e[0] + ' ' + e[1]; }).join(' – ') + '</p>';
					}
				}
			}
			var html = '<p style="text-align:center;color:white;font-size:10pt;margin:4px 0 6px;">'
				+ '<i class="fa fa-play-circle' + (ip ? '' : ' fa-spin') + '" style="color:' + (ip ? '#aaa' : '#5fa') + ';margin-right:5px;"></i>'
				+ '<strong>Battle Mode</strong></p>'
				+ '<p style="text-align:center;color:rgba(255,255,255,.7);font-size:8pt;margin:0 0 6px;">'
				+ bmFormatName() + '<br/>'
				+ bmBattleCount + (isBo3Widget ? ' series' : ' battle') + (bmBattleCount !== 1 ? 's' : '') + ' &nbsp;|&nbsp; ' + bmReplays.length + ' replay' + (bmReplays.length !== 1 ? 's' : '') + ' saved</p>'
				+ seriesScoreHtml;
			html += '<p><button class="button" id="qol2-bm-' + (ip ? 'resume' : 'pause') + '" style="display:block;margin:0 auto 4px;width:180px;"><i class="fa fa-' + (ip ? 'play' : 'pause') + '"></i> ' + (ip ? 'Resume' : 'Pause') + '</button></p>';
			html += '<p><button class="button" id="qol2-bm-end" style="display:block;margin:0 auto 4px;width:180px;"><i class="fa fa-stop"></i> End Battle Mode</button></p>';
			if (bmReplays.length) html += '<p><button class="button" id="qol2-bm-export" style="display:block;margin:0 auto;width:180px;"><i class="fa fa-download"></i> Export Replays (' + bmReplays.length + ')</button></p>';
			w.innerHTML = html;
			updateBattleModeWidgetVisibility();
			var pb = document.getElementById('qol2-bm-pause'), rb = document.getElementById('qol2-bm-resume'), eb = document.getElementById('qol2-bm-end'), xb = document.getElementById('qol2-bm-export');
			if (pb) pb.addEventListener('mousedown', function (e) { e.preventDefault(); bmPause(); });
			if (rb) rb.addEventListener('mousedown', function (e) { e.preventDefault(); battleMode = 'active'; renderBattleModeWidget(); bmTrySearch(); });
			if (eb) eb.addEventListener('mousedown', function (e) { e.preventDefault(); bmEnd(); });
			if (xb) xb.addEventListener('mousedown', function (e) { e.preventDefault(); bmExportReplays(); });
		}

		function removeBattleModeWidget() { var w = document.getElementById('qol2-bm-widget'); if (w) w.parentNode.removeChild(w); }

		function bmStart() {
			var room = win.app && win.app.rooms && app.rooms['']; if (!room) return;
			bmFormat = room.curFormat || (document.querySelector('button[name=format]') || {}).value || '';
			bmTeamIndex = room.curTeamIndex != null ? room.curTeamIndex : '';
			battleMode = 'active'; bmReplays = []; bmBattleCount = 0; bmBo3Series = {};
			renderBattleModeWidget(); bmTrySearch();
		}

		function bmPause() {
			battleMode = 'paused';
			renderBattleModeWidget();
			var room = win.app && win.app.rooms && app.rooms[''];
			if (!room) return;
			if (!bmIsInBattle() && room.cancelSearch) room.cancelSearch();
		}

		function bmEnd() {
			battleMode = 'off'; removeBattleModeWidget();
			var room = win.app && win.app.rooms && app.rooms[''];
			if (room && room.searching && room.cancelSearch) room.cancelSearch();
		}

		function bmTrySearch() {
			if (battleMode !== 'active') return;
			var room = win.app && win.app.rooms && app.rooms['']; if (!room || !bmFormat) return;
			if (room.searching && (!$.isArray(room.searching) || room.searching.length)) return;
			if (Object.values(app.rooms).some(function (r) { return r && r.type === 'battle' && !r.battleEnded; })) return;
			var $btn = $('.mainmenu button.big[name=search]');
			if ($btn.length && !$btn.hasClass('disabled')) { $btn[0].click(); return; }
			if (room.search) { var fb = $('.mainmenu button.big')[0]; if (fb) room.search(null, fb); }
		}

		function downloadTxt(filename, text) {
			var a = document.createElement('a');
			a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		}

		function bmAutoDownloadSeries(series) {
			if (!series || !series.games.length) return;
			var now = new Date();
			var date = now.toISOString().slice(0, 10);
			var time = now.toTimeString().slice(0, 8).replace(/:/g, '-');
			var fmt = bmFormatName() || 'Bo3';
			var myName = (win.app && app.user && app.user.get('name')) || '';
			var players = Object.keys(series.wins);
			var opponent = players.find(function (p) { return p.toLowerCase() !== myName.toLowerCase(); }) || '';
			var fslug = fmt.replace(/[^a-z0-9]+/gi, '-') || 'bo3';
			var oSlug = opponent.replace(/[^a-z0-9]+/gi, '-');
			var fname = fslug + (oSlug ? '-vs-' + oSlug : '') + '-' + date + '-' + time + '.txt';
			var sorted = Object.entries(series.wins).sort(function (a, b) { return b[1] - a[1]; });
			var scoreLine = sorted.map(function (e) { return e[0] + ' ' + e[1]; }).join(' - ');
			var lines = [
				'Bo3 Series Replays',
				'Format: ' + fmt,
				'Date: ' + date,
				'Score: ' + scoreLine,
				''
			];
			series.games.forEach(function (g) {
				lines.push('Game ' + g.game + (g.winner ? ' (' + g.winner + ' wins)' : '') + ': ' + g.url);
			});
			lines.push('');
			downloadTxt(fname, lines.join('\n'));
		}

		function bmExportReplays() {
			if (!bmReplays.length) return;
			var date = new Date().toISOString().slice(0, 10);
			var fmt = bmFormatName();
			var fname = (fmt.replace(/[^a-z0-9]+/gi, '-') || 'battles') + '-' + date + '.txt';
			var isBo3 = bmIsBo3Format(bmFormat);
			var lines = ['Battle Mode Replays', 'Format: ' + fmt, 'Date: ' + date];
			if (isBo3) {
				lines.push('Series: ' + bmBattleCount, '');
				var seriesArr = Object.values(bmBo3Series).filter(function (s) { return s.done && s.games.length; });
				if (seriesArr.length) {
					seriesArr.forEach(function (s, si) {
						var sorted = Object.entries(s.wins).sort(function (a, b) { return b[1] - a[1]; });
						var score = sorted.map(function (e) { return e[0] + ' ' + e[1]; }).join(' - ');
						lines.push('Series ' + (si + 1) + ': ' + score);
						s.games.forEach(function (g) {
							lines.push('  Game ' + g.game + (g.winner ? ' (' + g.winner + ' wins)' : '') + ': ' + g.url);
						});
						lines.push('');
					});
				} else {
					lines.push('');
					bmReplays.forEach(function (u) { lines.push(u); });
					lines.push('');
				}
			} else {
				lines.push('Battles: ' + bmBattleCount, '');
				bmReplays.forEach(function (u) { lines.push(u); });
				lines.push('');
			}
			downloadTxt(fname, lines.join('\n'));
		}

		var bmHookedRooms = new Set();

		// ─── Teambuilder Mode ───
		var tbMode = false, tbMunchTab = null, tbCalcTab = null, tbLastOpenedFormat = '';

		function tbStart() {
			if (battleMode !== 'off') bmEnd();
			tbMode = true;
			tbLastOpenedFormat = '';
			if (getQolPref('tb-away', false) && win.app) app.send('/away');
			if (win.app) app.tryJoinRoom('teambuilder');
			var calcUrl = 'https://nerd-of-now.github.io/NCP-VGC-Damage-Calculator/';
			tbCalcTab = GM_openInTab(calcUrl, { active: false, insert: true });
			tbWatchForFormat();
		}

		function tbWatchForFormat() {
			if (!tbMode) return;
			var tbRoom = win.app && win.app.rooms && app.rooms['teambuilder'];
			var fmt = tbRoom && tbRoom.curTeam && tbRoom.curTeam.format && tbRoom.curTeam.format.trim();
			if (fmt && !/^gen\d+$/.test(fmt) && fmt !== tbLastOpenedFormat) {
				tbLastOpenedFormat = fmt;
				try { if (tbMunchTab && tbMunchTab.close) tbMunchTab.close(); } catch (e) {}
				tbMunchTab = GM_openInTab('https://munchstats.com/' + fmt + '/', { active: false, insert: true });
			}
			setTimeout(tbWatchForFormat, 500);
		}

		function tbEnd() {
			tbMode = false;
			try { if (tbMunchTab && tbMunchTab.close) tbMunchTab.close(); } catch (e) {}
			try { if (tbCalcTab && tbCalcTab.close) tbCalcTab.close(); } catch (e) {}
			tbMunchTab = null; tbCalcTab = null;
			if (getQolPref('tb-away', false) && win.app) app.send('/back');
			if (win.app && app.focusRoom) app.focusRoom('');
		}

		function hookBattleModeRoom(room) {
			if (!room || room.type !== 'battle' || bmHookedRooms.has(room.id)) return;
			bmHookedRooms.add(room.id);
			// Same ambiguity as hookBattleEndReplay: the Bo3 tracker room shares
			// type==='battle' with real battles client-side. Its own end-of-series
			// signal is already handled directly in hookBattleEndReplay, so skip it
			// here entirely rather than risk double-counting it as a regular battle.
			var isTrackerRoom = room.id && room.id.indexOf('game-') === 0;
			var orig = room.add.bind(room);
			room.add = function (data) {
				var r = orig(data);
				if (isTrackerRoom) return r;
				if ((battleMode === 'active' || battleMode === 'paused') && room.battle && room.battle.ended && !room._qol2BmEndFired) {
					room._qol2BmEndFired = true;
					var isBo3 = bmRoomIsBo3(room);
					if (isBo3) {
						bmBo3WaitUntil = Date.now() + 5000;
						setTimeout(function () {
							bmBo3WaitUntil = 0;
						}, 5000);
					} else {
						bmBattleCount++;
						renderBattleModeWidget();
						if (battleMode === 'active') { setTimeout(function () { bmTrySearch(); }, 1500); }
					}
				}
				return r;
			};
		}

		// ─── Pokémon Quick-Links in Teambuilder ───
		function exportSetToShowdownText(set) {
			var text = '';
			if (set.name && set.name !== set.species) {
				text += set.name + ' (' + set.species + ')';
			} else {
				text += set.species;
			}
			if (set.gender === 'M') text += ' (M)';
			if (set.gender === 'F') text += ' (F)';
			if (set.item) text += ' @ ' + set.item;
			text += '\n';
			if (set.ability) text += 'Ability: ' + set.ability + '\n';
			if (set.level && set.level !== 100) text += 'Level: ' + set.level + '\n';
			if (set.shiny) text += 'Shiny: Yes\n';
			if (set.teraType) text += 'Tera Type: ' + set.teraType + '\n';
			var evs = set.evs || {};
			var evParts = [];
			['hp', 'atk', 'def', 'spa', 'spd', 'spe'].forEach(function (s) {
				var label = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' }[s];
				if (evs[s]) evParts.push(evs[s] + ' ' + label);
			});
			if (evParts.length) text += 'EVs: ' + evParts.join(' / ') + '\n';
			if (set.nature) text += set.nature + ' Nature\n';
			var ivs = set.ivs || {};
			var ivParts = [];
			['hp', 'atk', 'def', 'spa', 'spd', 'spe'].forEach(function (s) {
				var label = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' }[s];
				if (ivs[s] != null && ivs[s] !== 31) ivParts.push(ivs[s] + ' ' + label);
			});
			if (ivParts.length) text += 'IVs: ' + ivParts.join(' / ') + '\n';
			(set.moves || []).forEach(function (move) { if (move) text += '- ' + move + '\n'; });
			return text;
		}

		var _qol2TbInterval = null;
		function patchTeambuilderLinks() {
			if (_qol2TbInterval) return;
			_qol2TbInterval = setInterval(function () {
				if (!getQolPref('tbquicklinks', false)) return;
				var tbRoom = win.app && app.rooms && app.rooms['teambuilder'];
				if (!tbRoom || !tbRoom.curSet || !tbRoom.curSet.species) return;
				var el = tbRoom.el || (tbRoom.$el && tbRoom.$el[0]);
				if (!el) return;
				var menus = el.querySelectorAll('.setmenu');
				var menu = null;
				for (var i = 0; i < menus.length; i++) {
					if (menus[i].querySelector('button[name=copySet]')) { menu = menus[i]; break; }
				}
				if (!menu) return;
				if (menu.querySelector('#qol2-tb-links')) return;
				injectQuickLinks(menu, tbRoom.curSet, tbRoom.curTeam);
			}, 300);
		}

		function injectQuickLinks(menu, set, curTeam) {
			var species = set.species;
			var baseSpecies = (win.Dex && win.Dex.species) ? win.Dex.species.get(species).baseSpecies : species.split('-')[0];
			var nameId = baseSpecies.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
			var teamName = curTeam ? (curTeam.name || '') : '';
			var fmt = curTeam ? (curTeam.format || '') : '';

			var serebiiUrl = 'https://www.serebii.net/pokedex-champions/' + nameId + '/';
			var munchUrl = 'https://munchstats.com/' + (fmt ? fmt + '/1760/' + encodeURIComponent(species) : '');
			var calcUrl = 'https://nerd-of-now.github.io/NCP-VGC-Damage-Calculator/';
			var setExport = exportSetToShowdownText(set);
			if (teamName) setExport = '=== ' + teamName + ' ===\n' + setExport;

			var wrap = document.createElement('span');
			wrap.id = 'qol2-tb-links';
			wrap.style.cssText = 'display:inline-flex;gap:3px;vertical-align:middle;';

			function makeBtn(label, faviconUrl, onClick) {
				var b = document.createElement('button');
				b.className = 'button';
				b.style.cssText = 'font-size:9pt;padding:1px 6px;display:inline-flex;align-items:center;gap:4px;';
				var img = document.createElement('img');
				img.src = faviconUrl;
				img.style.cssText = 'width:14px;height:14px;vertical-align:middle;image-rendering:auto;';
				img.onerror = function () { this.style.display = 'none'; };
				var txt = document.createTextNode(' ' + label);
				b.appendChild(img);
				b.appendChild(txt);
				b.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
				return b;
			}

			wrap.appendChild(makeBtn('Serebii', 'https://favicon.im/serebii.net', function () { GM_openInTab(serebiiUrl, { active: true, insert: true }); }));
			wrap.appendChild(makeBtn('MunchStats', 'https://favicon.im/munchstats.com', function () { GM_openInTab(munchUrl, { active: true, insert: true }); }));
			wrap.appendChild(makeBtn('NCP Calc+Copy', 'https://favicon.im/nimbasacitypost.com', function () {
				var payload = encodeURIComponent(JSON.stringify({
					set: setExport,
					teamName: teamName,
					species: species
				}));
				GM_openInTab(calcUrl + '#qol2=' + payload, { active: true, insert: true });
			}));

			var firstBtn = menu.querySelector('button');
			if (firstBtn) {
				menu.insertBefore(wrap, firstBtn);
			} else {
				menu.appendChild(wrap);
			}
		}

		(function hookFocusRoom() {
			if (!win.app || !app.focusRoom) { setTimeout(hookFocusRoom, 300); return; }
			if (app._qol2FocusHooked) return;
			app._qol2FocusHooked = true;
			var origFocus = app.focusRoom.bind(app);
			app.focusRoom = function () {
				var r = origFocus.apply(this, arguments);
				if (battleMode !== 'off') setTimeout(updateBattleModeWidgetVisibility, 50);
				if (arguments[0] === 'teambuilder' && getQolPref('tbquicklinks', false)) {
					patchTeambuilderLinks();
				}
				return r;
			};
		})();
		new MutationObserver(function () { if (battleMode !== 'off') updateBattleModeWidgetVisibility(); }).observe(document.body, { childList: true, subtree: false });

		// Auto-click "Visit external site" on Showdown's external link warning popup
		new MutationObserver(function (mutations) {
			if (!tbMode) return;
			mutations.forEach(function (m) {
				m.addedNodes.forEach(function (node) {
					if (node.nodeType !== 1) return;
					var buttons = node.querySelectorAll ? node.querySelectorAll('button, .button') : [];
					for (var i = 0; i < buttons.length; i++) {
						if (/visit external/i.test(buttons[i].textContent)) { buttons[i].click(); return; }
					}
				});
			});
		}).observe(document.body, { childList: true, subtree: true });

		// ─── Auto-join VGC ───
		(function tryAutoJoin() { if (!win.app || !app.user || !app.user.get('named')) { setTimeout(tryAutoJoin, 500); return; } if (!app.rooms['vgc']) app.tryJoinRoom('vgc'); })();

		// ─── Save Tab Order ───
		var TAB_ORDER_KEY = 'qol2-tab-order';
		function saveTabOrder() { if (!app.roomList) return; localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(app.roomList.map(function (r) { return r.id; }))); }
		function restoreTabOrder() {
			if (!app.roomList) return;
			try {
				var s = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || '[]'); if (!s.length) return;
				app.roomList.sort(function (a, b) { var ai = s.indexOf(a.id), bi = s.indexOf(b.id); if (ai === -1) return 1; if (bi === -1) return -1; return ai - bi; });
				if (app.topbar) app.topbar.updateTabbar();
			} catch (e) {}
		}
		function patchTabOrder() {
			if (!app.topbar || app.topbar._qol2TabOrderHooked) return;
			app.topbar._qol2TabOrderHooked = true;
			var orig = app.topbar.dragEndRoom.bind(app.topbar);
			app.topbar.dragEndRoom = function (e) { orig(e); saveTabOrder(); };
			restoreTabOrder();
		}

		// ─── Search Timer ───
		var SEARCH_TIMEOUT = 60, searchTimerInterval = null, searchTimerSeconds = 0;
		function stopSearchTimer() { if (searchTimerInterval) { clearInterval(searchTimerInterval); searchTimerInterval = null; } $('#qol2-search-timer').remove(); }
		function startSearchTimer() {
			stopSearchTimer(); searchTimerSeconds = SEARCH_TIMEOUT;
			var $b = $('.mainmenu button.big'); if (!$b.length) return;
			var $t = $('<p id="qol2-search-timer" style="margin:0;font-size:9pt;color:white;text-shadow:0 1px 0 black;"></p>');
			$b.closest('p').after($t);
			function tick() {
				var $ti = $('#qol2-search-timer'); if (!$ti.length) { stopSearchTimer(); return; }
				var room = win.app && win.app.rooms && app.rooms[''];
				if (!room || !room.searching || ($.isArray(room.searching) && !room.searching.length)) { stopSearchTimer(); return; }
				searchTimerSeconds--;
				if (searchTimerSeconds <= 0) { stopSearchTimer(); if (room.cancelSearch) room.cancelSearch(); return; }
				var pct = (searchTimerSeconds / SEARCH_TIMEOUT) * 100, color = pct > 50 ? 'white' : pct > 25 ? '#f8c000' : '#ff6060';
				$ti.html('<small style="color:' + color + ';text-shadow:0 1px 0 black;">Cancelling in ' + searchTimerSeconds + 's</small>');
			}
			tick(); searchTimerInterval = setInterval(tick, 1000);
		}
		function patchSearchTimer() {
			var room = win.app && win.app.rooms && app.rooms['']; if (!room || room._qol2SearchTimerHooked) return;
			room._qol2SearchTimerHooked = true;
			var orig = room.updateSearch.bind(room);
			room.updateSearch = function (data) {
				var was = !!(this.searching && (!$.isArray(this.searching) || this.searching.length));
				orig(data);
				var is = !!(this.searching && (!$.isArray(this.searching) || this.searching.length));
				if (!was && is) setTimeout(startSearchTimer, 100); else if (was && !is) stopSearchTimer();
			};
		}

		// ─── Away Mode ───
		function patchUserbar() {
			if (!win.UserPopup || UserPopup.prototype._qol2AwayHooked) return;
			UserPopup.prototype._qol2AwayHooked = true;
			var origUpdate = UserPopup.prototype.update;
			UserPopup.prototype.update = function (data) {
				origUpdate.call(this, data);
				if (!this.data || this.data.userid !== app.user.get('userid')) return;
				var self = this, away = !!app.user.get('away');
				var $a = $('<button class="button" name="qol2away" style="' + (away ? 'color:#e8a000;font-weight:bold;' : '') + '"><i class="fa fa-moon-o"></i> Away</button>');
				var $b = $('<button class="button" name="qol2back" style="' + (!away ? 'color:#e8a000;font-weight:bold;' : '') + '"><i class="fa fa-sun-o"></i> Back</button>');
				var oc = self.close.bind(self);
				self.qol2away = function () { if (!app.user.get('away')) app.send('/away'); setTimeout(function () { self.update(); }, 300); self.close = oc; };
				self.qol2back = function () { if (app.user.get('away')) app.send('/back'); setTimeout(function () { self.update(); }, 300); self.close = oc; };
				$a.on('mousedown', function () { self.close = function () {}; });
				$b.on('mousedown', function () { self.close = function () {}; });
				if (!self.$el.find('.qol2-user-close').length) self.$el.prepend('<div style="text-align:right;margin-bottom:2px;"><button name="close" class="closebutton qol2-user-close" tabindex="-1" aria-label="Close"><i class="fa fa-times-circle"></i></button></div>');
				var $hr = this.$el.find('hr').first();
				if ($hr.length) $hr.before($(' '), $a, $(' '), $b);
			};
		}

		// ─── Forfeit close ───
		function patchForfeitPopup() {
			if (!win.ForfeitPopup || ForfeitPopup.prototype._qol2ForfeitHooked) return;
			ForfeitPopup.prototype._qol2ForfeitHooked = true;
			var oi = ForfeitPopup.prototype.initialize;
			ForfeitPopup.prototype.initialize = function (data) { oi.call(this, data); var cb = this.$('input[name=closeroom]')[0]; if (cb) cb.checked = getQolPref('closeforfeit', true); };
		}
		(function t() { if (win.ForfeitPopup) patchForfeitPopup(); else setTimeout(t, 500); })();

		// ─── Auto Replay ───
		function patchUploadReplay() {
			if (app._qol2ReplayHooked) return;
			app._qol2ReplayHooked = true;
			var orig = app.addPopup.bind(app);
			app.addPopup = function (type, data) {
				var popup = orig(type, data);

				var url = null;

				if (data && data.htmlMessage) {
					var hm = data.htmlMessage;
					var hm1 = hm.match(/href="(https?:\/\/replay\.pokemonshowdown\.com\/[\w-]+)"/);
					var hm2 = hm.match(/value="(https?:\/\/replay\.pokemonshowdown\.com\/[\w-]+)"/);
					var hm3 = hm.match(/(https?:\/\/replay\.pokemonshowdown\.com\/[\w-]+)/);
					url = (hm1 && hm1[1]) || (hm2 && hm2[1]) || (hm3 && hm3[1]) || null;
				}
				if (!url && type === win.ReplayUploadedPopup && data && data.id) {
					var replayHost = (win.Config && Config.routes && Config.routes.replays) || 'replay.pokemonshowdown.com';
					url = 'https://' + replayHost + '/' + data.id;
				}
				if (!url && app._qol2PendingReplayUrl) {
					url = app._qol2PendingReplayUrl;
				}
				app._qol2PendingReplayUrl = null;

				if (!url) {
					return popup;
				}

				var isBo3 = bmIsBo3Format(bmFormat) || url.toLowerCase().indexOf('bo3') >= 0;

				// ── Find the battle room ──
				// Bo3: room ID contains the format slug which also appears in the replay URL.
				// Bo1: the replay ID (numeric) differs from the matchmaking ID in the room ID,
				//      so substring match fails. Fall back to most-recently-ended battle room.
				var battleRoom = null;
				if (app.rooms) {
					var rid = url.replace(/^https?:\/\/[^/]+\//, '');
					var _battleCandidates = Object.values(app.rooms).filter(function (r) { return r && r.type === 'battle'; });
					battleRoom = _battleCandidates.find(function (r) { return r.id && r.id.indexOf(rid) >= 0; }) || null;
					if (!battleRoom) {
						battleRoom = _battleCandidates
							.filter(function (r) { return r.battleEnded; })
							.sort(function (a, b) { return (b._qol2EndedAt || 0) - (a._qol2EndedAt || 0); })[0] || null;
					}
					if (!battleRoom) battleRoom = _battleCandidates[0] || null;
				}

				// ── Battle Mode ──
				if (battleMode === 'active' || battleMode === 'paused') {
					copyToClipboard(url);
					app.closePopup();
					if (isBo3) {
						var trackerRoom = bmFindTrackerRoomForBattle(battleRoom);
						bmBo3WaitUntil = 0;
						bmRecordGame(trackerRoom, battleRoom, url);
					} else {
						if (bmReplays.indexOf(url) === -1) bmReplays.push(url);
						renderBattleModeWidget();
						if (battleRoom && typeof battleRoom.close === 'function') battleRoom.close();
						app.focusRoom('');
						setTimeout(function () { if (battleMode === 'active') bmTrySearch(); }, 1500);
					}
					return popup;
				}

				// ── Default Mode ──
				var doCopy = getQolPref('autocopyreplay', false);
				var doClose = getQolPref('autoclosebattle', false);

				if (isBo3) {
					if (doCopy) copyToClipboard(url);
					app.closePopup();
					var trackerRoom2 = bmFindTrackerRoomForBattle(battleRoom);
					bmRecordGame(trackerRoom2, battleRoom, url);
					return popup;
				}

				if (!doCopy && !doClose) return popup;

				if (doCopy) copyToClipboard(url);

				if (doClose) {
					app.closePopup();
					// Give the person a real chance to actually see the result
					// (final board state, win/loss message) before the room
					// disappears.
					setTimeout(function () {
						var br = battleRoom;
						if (!br && app.rooms) Object.values(app.rooms).forEach(function (r) {
							if (r && r.type === 'battle' && r.battleEnded) br = r;
						});
						if (br && typeof br.close === 'function') br.close();
						app.focusRoom('');
					}, 2000);
				}
				return popup;
			};
		}

		function copyToClipboard(text) {
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(text).catch(function () {
					try {
						var inp = document.createElement('input');
						inp.value = text;
						inp.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
						document.body.appendChild(inp);
						inp.select();
						document.execCommand('copy');
						document.body.removeChild(inp);
					} catch (e) {}
				});
			} else {
				try {
					var inp = document.createElement('input');
					inp.value = text;
					inp.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
					document.body.appendChild(inp);
					inp.select();
					document.execCommand('copy');
					document.body.removeChild(inp);
				} catch (e) {}
			}
		}

		var replayHookedRooms = new Set();
		function hookBattleEndReplay(room) {
			if (!room || room.type !== 'battle' || replayHookedRooms.has(room.id)) return;
			replayHookedRooms.add(room.id);
			// Bo3 tracker rooms (game-bestof3-...) are instantiated client-side as
			// the exact same BattleRoom class as real battles, so room.type==='battle'
			// is true for both and can't distinguish them. The id prefix can.
			var isTrackerRoom = room.id && room.id.indexOf('game-') === 0;
			var orig = room.add.bind(room);
			room.add = function (data) {
				var r = orig(data);
				var battleJustEnded = false;
				if (room.battle && room.battle.ended) { battleJustEnded = true; }
				if (!battleJustEnded && typeof data === 'string') {
					// |tie is a substring of |tier| (sent at the start of every
					// battle to announce the format) - match complete protocol
					// lines only, not a substring anywhere in the data.
					var lines = data.split('\n');
					for (var li = 0; li < lines.length; li++) {
						if (lines[li].substr(0, 5) === '|win|') { battleJustEnded = true; break; }
						if (lines[li] === '|tie') { battleJustEnded = true; break; }
					}
				}
				if (battleJustEnded && !room._qol2EndedAt) room._qol2EndedAt = Date.now();

				if (isTrackerRoom) {
					if (battleJustEnded && !room._qol2SeriesEndCheckScheduled) {
						room._qol2SeriesEndCheckScheduled = true;
						// Give the normal per-game path (last game's own battle
						// room, which independently schedules its saveReplay()
						// ~2s after its |win| line) a chance to finish first -
						// that path correctly captures the replay URL via
						// bmRecordGame. This only actually does anything for the
						// case it's meant for: the series ending via forfeit/
						// inactivity between games, with no battle room ever
						// created for a "next game" to begin with.
						setTimeout(function () {
							var series = bmGetSeries(room);
							if (series && !series.done) {
								series.done = true;
								series.games.forEach(function (g) { if (g.url && bmReplays.indexOf(g.url) === -1) bmReplays.push(g.url); });
								bmFindOpenBattleRoomsForTracker(room).forEach(function (br) {
									if (typeof br.close === 'function') br.close();
								});
								setTimeout(function () {
									if (typeof room.close === 'function') room.close();
									app.focusRoom('');
								}, 150);
								if (battleMode === 'active' || battleMode === 'paused') {
									bmBattleCount++;
									renderBattleModeWidget();
									if (battleMode === 'active') setTimeout(function () { bmTrySearch(); }, 1500);
								} else {
									bmAutoDownloadSeries(series);
								}
							}
						}, 3000);
					}
					return r;
				}

				if (battleJustEnded && !room._qol2ReplaySent) {
					var needSave = getQolPref('autocopyreplay', false)
						|| getQolPref('autoclosebattle', false)
						|| (battleMode === 'active' || battleMode === 'paused')
						|| bmRoomIsBo3(room);
					if (needSave) {
						room._qol2ReplaySent = true;
						patchUploadReplay();
						setTimeout(function () { if (room.saveReplay) room.saveReplay(); }, 2000);
					}
				}
				return r;
			};
		}

		// ─── Ladder Stats (F key) ───
		function escHtml(s) { return win.BattleLog ? BattleLog.escapeHTML(String(s)) : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
		function closeStatsWidget() { var w = document.getElementById('qol2-stats-widget'); if (w) w.parentNode.removeChild(w); }
		function renderStatsWidget(fid, fname, rating) {
			closeStatsWidget();
			var w = document.createElement('div'); w.id = 'qol2-stats-widget'; w.className = 'ps-popup';
			w.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;padding:6px 12px 10px;min-width:260px;';
			var html = '<ul class="popupmenu"><li style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;"><h3 style="margin:0;">' + escHtml(fname) + '</h3><button class="closebutton" id="qol2-stats-close" tabindex="-1"><i class="fa fa-times-circle"></i></button></li>';
			function row(l, v) { return '<li style="display:flex;justify-content:space-between;gap:20px;padding:2px 0;"><span style="color:#777;">' + l + '</span><span style="text-align:right;">' + v + '</span></li>'; }
			if (!rating) { html += row('Stats', '<em>No data for this format</em>'); }
			else { var rw = rating.w || 0, rl = rating.l || 0, tot = rw + rl; html += row('Elo', '<strong>' + Math.round(rating.elo) + '</strong>'); html += row('GXE', rating.gxe != null ? rating.gxe.toFixed(1) + '%' : '—'); html += row('Glicko', rating.rpr != null ? Math.round(rating.rpr) + ' \u00b1 ' + Math.round(rating.rprd) : '—'); html += row('W / L', rw + ' / ' + rl); html += row('Win %', tot > 0 ? (rw / tot * 100).toFixed(1) + '%' : '—'); }
			html += '</ul>'; w.innerHTML = html; document.body.appendChild(w);
			document.getElementById('qol2-stats-close').addEventListener('click', closeStatsWidget);
			setTimeout(function () { document.addEventListener('click', function oo(e) { var w = document.getElementById('qol2-stats-widget'); if (w && !w.contains(e.target)) { closeStatsWidget(); document.removeEventListener('click', oo); } }); }, 0);
		}
		function showStatsWidget() {
			if (document.getElementById('qol2-stats-widget')) { closeStatsWidget(); return; }
			var fid = ((win.app && win.app.rooms && app.rooms['']) ? app.rooms[''].curFormat : null) || (document.querySelector('button[name=format]') || {}).value;
			if (!fid) return;
			var uid = win.app && win.app.user && app.user.get('userid'); if (!uid) return;
			var fn = (win.BattleFormats && BattleFormats[fid]) ? BattleFormats[fid].name : fid;
			renderStatsWidget(fid, fn, undefined);
			var ul = document.querySelector('#qol2-stats-widget .popupmenu');
			if (ul) { var li = document.createElement('li'); li.style.cssText = 'color:#888;font-style:italic;padding:2px 0;'; li.textContent = 'Loading...'; ul.appendChild(li); }
			fetch('https://pokemonshowdown.com/users/' + encodeURIComponent(uid) + '.json')
				.then(function (r) { return r.json(); })
				.then(function (d) { renderStatsWidget(fid, fn, d.ratings && d.ratings[fid] || null); })
				.catch(function () { renderStatsWidget(fid, fn, null); });
		}
		document.addEventListener('keydown', function (e) {
			if (e.key.toLowerCase() !== 'f') return;
			if (e.ctrlKey || e.altKey || e.metaKey) return;
			var t = document.activeElement.tagName.toLowerCase();
			if (t === 'input' || t === 'textarea' || document.activeElement.isContentEditable) return;
			e.preventDefault(); showStatsWidget();
		});

		// ─── init ───
		function startObservingBattle() {
			if (!win.app || !win.OptionsPopup) { setTimeout(startObservingBattle, 300); return; }
			patchOptionsPopup();
			(function tt() { if (app.topbar && app.topbar.dragEndRoom) { patchTabOrder(); setTimeout(restoreTabOrder, 3000); } else setTimeout(tt, 300); })();
			(function ts() { var r = win.app && win.app.rooms && app.rooms['']; if (r && r.updateSearch) patchSearchTimer(); else setTimeout(ts, 500); })();
			(function tu() { if (win.UserPopup) patchUserbar(); else setTimeout(tu, 500); })();
			patchUploadReplay();
			// Second layer: intercept raw socket messages to catch |popup||html| before sanitizeHTML
			if (!app._qol2ReceiveHooked && typeof app.receive === 'function') {
				app._qol2ReceiveHooked = true;
				var origReceive = app.receive.bind(app);
				app.receive = function (rawData) {
					if (rawData && rawData.indexOf('|popup|') >= 0 && rawData.indexOf('replay.pokemonshowdown.com') >= 0) {
						var lines = rawData.split('\n');
						for (var li2 = 0; li2 < lines.length; li2++) {
							var line2 = lines[li2];
							if (line2.indexOf('|popup|') >= 0) {
								var rm = line2.match(/https?:\/\/replay\.pokemonshowdown\.com\/([\w-]+)/);
								if (rm) { app._qol2PendingReplayUrl = 'https://replay.pokemonshowdown.com/' + rm[1]; }
							}
						}
					}
					return origReceive(rawData);
				};
			}
			if (getQolPref('tbquicklinks', false)) {
				(function tryTb() {
					if (win.TeambuilderRoom) { patchTeambuilderLinks(); }
					else setTimeout(tryTb, 300);
				})();
			}

			function patchAll() {
				if (!app.rooms) return;
				Object.values(app.rooms).forEach(function (room) {
					if (room && room.type === 'battle') { patchBattleRoom(room); hookBattleEndReplay(room); hookBattleModeRoom(room); }
				});
			}
			patchAll();
			if (!app._qol2OtsHooked && typeof app.addRoom === 'function') {
				app._qol2OtsHooked = true;
				var oa = app.addRoom.bind(app);
				app.addRoom = function () {
					var room = oa.apply(this, arguments);
					if (room && room.type === 'battle') { patchBattleRoom(room); hookBattleEndReplay(room); hookBattleModeRoom(room); }
					return room;
				};
			}
			new MutationObserver(patchAll).observe(document.body, { childList: true, subtree: true });
		}

		startObservingBattle();
	})();

	// ============================================================
	// OTS POKEPASTE MODIFIER
	// ============================================================
	// Changes what "Upload to PokePaste (Open Team Sheet)" actually
	// uploads: reverts any Mega Pokemon to its base forme (still holding
	// the mega stone) with ability-correction, omits Shiny status, and
	// optionally includes Nature (toggle lives in Options -> Teambuilder,
	// "Include Nature in OTS Pokepaste export" - some tournaments still use
	// the older no-nature teamsheet convention, so this defaults to on but
	// is easy to turn off).
	(function () {
		var OTS_PREFS_KEY = 'qol2-settings';
		function otsIncludeNature() {
			try {
				var p = JSON.parse(localStorage.getItem(OTS_PREFS_KEY) || '{}');
				return 'otsnature' in p ? p.otsnature : true;
			} catch (e) {
				return true;
			}
		}

		function exportSetForOTS(set) {
			var text = '';
			if (set.name && set.name !== set.species) {
				text += set.name + ' (' + set.species + ')';
			} else {
				text += set.species;
			}
			if (set.gender === 'M') text += ' (M)';
			if (set.gender === 'F') text += ' (F)';
			if (set.item) text += ' @ ' + set.item;
			text += '  \n';
			if (set.ability) text += 'Ability: ' + set.ability + '  \n';
			if (set.level && set.level !== 100) text += 'Level: ' + set.level + '  \n';
			if (typeof set.happiness === 'number' && set.happiness !== 255 && !isNaN(set.happiness)) {
				text += 'Happiness: ' + set.happiness + '  \n';
			}
			if (set.pokeball) text += 'Pokeball: ' + set.pokeball + '  \n';
			if (set.hpType) text += 'Hidden Power: ' + set.hpType + '  \n';
			if (typeof set.dynamaxLevel === 'number' && set.dynamaxLevel !== 10 && !isNaN(set.dynamaxLevel)) {
				text += 'Dynamax Level: ' + set.dynamaxLevel + '  \n';
			}
			if (set.gigantamax) text += 'Gigantamax: Yes  \n';
			if (set.teraType) text += 'Tera Type: ' + set.teraType + '  \n';
			// Nature is the one field gated by the toggle - everything else
			// about "hide stats" (no EVs, no IVs) always applies.
			if (set.nature && otsIncludeNature()) text += set.nature + ' Nature  \n';
			var moves = set.moves || [];
			for (var i = 0; i < moves.length; i++) {
				var move = moves[i];
				if (move.substr(0, 13) === 'Hidden Power ') {
					move = move.substr(0, 13) + '[' + move.substr(13) + ']';
				}
				if (move) text += '- ' + move + '  \n';
			}
			text += '\n';
			return text;
		}

		var SLOT_LABELS = { '0': '', '1': '', 'H': ' (Hidden)', 'S': ' (Special/Event)' };

		function resolveBaseAbility(currentAbility, baseAbilities, pokemonLabel, baseSpeciesName) {
			var validAbilities = [];
			var labeledOptions = [];
			for (var key in baseAbilities) {
				if (!baseAbilities[key]) continue;
				validAbilities.push(baseAbilities[key]);
				labeledOptions.push(baseAbilities[key] + (SLOT_LABELS[key] || ''));
			}

			if (validAbilities.indexOf(currentAbility) !== -1) {
				return currentAbility;
			}

			var defaultAbility = baseAbilities['0'];
			var lines = [
				pokemonLabel + '\u2019s ability (' + currentAbility + ') isn\u2019t available on base ' + baseSpeciesName + '.',
				'Choose one for the exported sheet:',
			];
			for (var i = 0; i < labeledOptions.length; i++) {
				lines.push('  ' + (i + 1) + '. ' + labeledOptions[i]);
			}
			lines.push('Type a number, or leave blank to default to ' + defaultAbility + ':');

			var answer = window.prompt(lines.join('\n'));
			if (answer === null || answer.trim() === '') {
				return defaultAbility;
			}
			var idx = parseInt(answer.trim(), 10);
			if (!isNaN(idx) && idx >= 1 && idx <= validAbilities.length) {
				return validAbilities[idx - 1];
			}
			return defaultAbility;
		}

		function prepareOTSTeam(sets) {
			return sets.map(function (set) {
				var copy = {};
				for (var k in set) copy[k] = set[k];

				var species = win.Dex && win.Dex.species && win.Dex.species.get(copy.species);
				if (species && species.isMega) {
					var base = win.Dex.species.get(species.baseSpecies);
					var label = copy.name && copy.name !== copy.species ? copy.name : copy.species;
					copy.ability = resolveBaseAbility(copy.ability, base.abilities, label, base.name);
					if (copy.name === copy.species) {
						copy.name = base.name;
					}
					copy.species = base.name;
				}
				return copy;
			});
		}

		function buildOTSExportText(sets) {
			var prepared = prepareOTSTeam(sets);
			var text = '';
			for (var i = 0; i < prepared.length; i++) {
				text += exportSetForOTS(prepared[i]);
			}
			return text;
		}

		function patchTeambuilder(tb) {
			if (!tb || tb._otsModPatched) return;
			tb._otsModPatched = true;
			var orig = tb.pokepasteExport.bind(tb);
			tb.pokepasteExport = function (type) {
				if (type !== 'openteamsheet') {
					return orig(type);
				}

				var team = buildOTSExportText(this.curSetList);
				if (!team || !team.trim()) {
					return win.app.addPopupMessage('Add a Pokémon to your team before uploading it!');
				}
				document.getElementById('pasteData').value = team;
				document.getElementById('pasteTitle').value = this.curTeam.name + ' (OTS)';
				document.getElementById('pasteAuthor').value = win.app.user.get('name');
				if (this.curTeam.format !== 'gen9') {
					document.getElementById('pasteNotes').value = 'Format: ' + this.curTeam.format;
				}
				document.getElementById('pokepasteForm').submit();
			};
		}

		function tryPatch() {
			var tb = win.app && win.app.rooms && win.app.rooms['teambuilder'];
			if (tb) patchTeambuilder(tb);
		}

		setInterval(tryPatch, 500);
		new MutationObserver(tryPatch).observe(document.body, { childList: true, subtree: true });
	})();

	// ============================================================
	// TEXT SIZE
	// ============================================================
	// Showdown has no built-in setting for this. Scales
	// .chat-log/.battle-log/.chat/.notice specifically (the actual
	// message-text containers/classes), not the whole page, so buttons/UI
	// chrome stay their normal size. Anchored to Showdown's own real base
	// sizes (9pt for .chat/.notice, 8pt for .chat small) rather than a
	// bare percentage, so 100% exactly matches Showdown's native look
	// with no drift.
	(function () {
		var STORAGE_KEY = 'qol-textsize';
		var MIN_SIZE = 80;
		var MAX_SIZE = 200;
		var STEP = 10;
		var DEFAULT_SIZE = 100;
		var BASE_PT = 9;
		var BASE_SMALL_PT = 8;

		function getSize() {
			var stored = parseInt(localStorage.getItem(STORAGE_KEY), 10);
			return isNaN(stored) ? DEFAULT_SIZE : stored;
		}

		function buildStyleTag() {
			var style = document.getElementById('qol-textsize-style');
			if (!style) {
				style = document.createElement('style');
				style.id = 'qol-textsize-style';
				document.head.appendChild(style);
			}
			return style;
		}

		function applySize(size) {
			var scale = size / 100;
			buildStyleTag().textContent =
				'.chat-log, .battle-log, .chat, .notice { font-size: ' + (BASE_PT * scale).toFixed(2) + 'pt !important; }\n' +
				'.chat small { font-size: ' + (BASE_SMALL_PT * scale).toFixed(2) + 'pt !important; }';
			localStorage.setItem(STORAGE_KEY, size);
		}

		function showIndicator(size) {
			var el = document.getElementById('qol-textsize-indicator');
			if (!el) {
				el = document.createElement('div');
				el.id = 'qol-textsize-indicator';
				el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);' +
					'z-index:99999;padding:6px 14px;border-radius:6px;background:#2b2c31;' +
					'color:#fff;font-family:Verdana,Helvetica,Arial,sans-serif;font-size:13px;' +
					'box-shadow:0 2px 8px rgba(0,0,0,.5);pointer-events:none;';
				document.body.appendChild(el);
			}
			el.textContent = 'Text size: ' + size + '%';
			el.style.opacity = '1';
			el.style.transition = 'none';
			clearTimeout(el._hideTimer);
			el._hideTimer = setTimeout(function () {
				el.style.transition = 'opacity 0.4s';
				el.style.opacity = '0';
			}, 1000);
		}

		applySize(getSize());

		document.addEventListener('keydown', function (e) {
			if (!isShortcutModifier(e)) return;
			var size = getSize();
			if (e.key === '=' || e.key === '+') {
				e.preventDefault();
				size = Math.min(MAX_SIZE, size + STEP);
			} else if (e.key === '-' || e.key === '_') {
				e.preventDefault();
				size = Math.max(MIN_SIZE, size - STEP);
			} else if (e.key === '0') {
				e.preventDefault();
				size = DEFAULT_SIZE;
			} else {
				return;
			}
			applySize(size);
			showIndicator(size);
		});
	})();

	// ============================================================
	// RAINBOW BUTTON COLORS
	// ============================================================
	GM_addStyle(`
  /* ── 1. Battle!  —  Red  (0°)  —  text: black ── */
  .button.mainmenu1 {
    background: linear-gradient(to bottom, #e46b6b, #ba2020) !important;
    border-color: #821616 !important;
    color: #000 !important;
    text-shadow: none !important;
  }
  .button.mainmenu1:hover  { background: linear-gradient(to bottom, #df4d4d, #a41d1d) !important; }
  .button.mainmenu1:active { background: linear-gradient(to bottom, #ba2020, #e46b6b) !important; }

  /* ── 2. Teambuilder  —  Orange  (30°)  —  text: black ── */
  .button.mainmenu2 {
    background: linear-gradient(to bottom, #e4a86b, #ba6d20) !important;
    border-color: #824c16 !important;
    color: #000 !important;
    text-shadow: none !important;
  }
  .button.mainmenu2:hover  { background: linear-gradient(to bottom, #df964d, #a4601d) !important; }
  .button.mainmenu2:active { background: linear-gradient(to bottom, #ba6d20, #e4a86b) !important; }

  /* ── 3. Ladder  —  Yellow  (60°)  —  text: black ── */
  .button.mainmenu3 {
    background: linear-gradient(to bottom, #e4e46b, #bebe21) !important;
    border-color: #868617 !important;
    color: #000 !important;
    text-shadow: none !important;
  }
  .button.mainmenu3:hover  { background: linear-gradient(to bottom, #dfdf4d, #a9a91d) !important; }
  .button.mainmenu3:active { background: linear-gradient(to bottom, #bebe21, #e4e46b) !important; }

  /* ── 4. Tournaments  —  Green  (120°)  —  text: black ── */
  .button.mainmenu4 {
    background: linear-gradient(to bottom, #5ae15a, #1ead1e) !important;
    border-color: #147514 !important;
    color: #000 !important;
    text-shadow: none !important;
  }
  .button.mainmenu4:hover  { background: linear-gradient(to bottom, #3bdc3b, #1a971a) !important; }
  .button.mainmenu4:active { background: linear-gradient(to bottom, #1ead1e, #5ae15a) !important; }

  /* ── 5. Watch a battle  —  Light Blue  (200°)  —  text: black ── */
  /* Tournaments = .mainmenu4 alone, Watch a battle = .mainmenu4.onlineonly */
  .button.mainmenu4.onlineonly {
    background: linear-gradient(to bottom, #8ecceb, #37a5db) !important;
    border-color: #1f80b1 !important;
    color: #000 !important;
    text-shadow: none !important;
  }
  .button.mainmenu4.onlineonly:hover  { background: linear-gradient(to bottom, #6fbee5, #259ad4) !important; }
  .button.mainmenu4.onlineonly:active { background: linear-gradient(to bottom, #37a5db, #8ecceb) !important; }

  /* ── 6. Find a user  —  Blue  (240°)  —  text: white ── */
  .button.mainmenu5 {
    background: linear-gradient(to bottom, #5a5ae1, #1e1ead) !important;
    border-color: #141475 !important;
    color: #fff !important;
    text-shadow: 0 1px 2px rgba(0,0,0,0.5) !important;
  }
  .button.mainmenu5:hover  { background: linear-gradient(to bottom, #3b3bdc, #1a1a97) !important; }
  .button.mainmenu5:active { background: linear-gradient(to bottom, #1e1ead, #5a5ae1) !important; }

  /* ── 7. Friends  —  Violet  (270°)  —  text: white ── */
  .button.mainmenu6 {
    background: linear-gradient(to bottom, #9e5ae1, #651ead) !important;
    border-color: #441475 !important;
    color: #fff !important;
    text-shadow: 0 1px 2px rgba(0,0,0,0.5) !important;
  }
  .button.mainmenu6:hover  { background: linear-gradient(to bottom, #8c3bdc, #591a97) !important; }
  .button.mainmenu6:active { background: linear-gradient(to bottom, #651ead, #9e5ae1) !important; }

  /* ── 8. Info & Resources  —  Magenta  (300°)  —  text: black ── */
  .button.mainmenu7 {
    background: linear-gradient(to bottom, #e15ae1, #ad1ead) !important;
    border-color: #751475 !important;
    color: #000 !important;
    text-shadow: none !important;
  }
  .button.mainmenu7:hover  { background: linear-gradient(to bottom, #dc3bdc, #971a97) !important; }
  .button.mainmenu7:active { background: linear-gradient(to bottom, #ad1ead, #e15ae1) !important; }

  /* ── Disabled state: restore Showdown's native muted look ──
     mainmenu1, 4, 5, and 6 can all render with .disabled before the user
     is logged in (Watch a battle, Find a user, Friends, and Join chat /
     Join lobby chat in the right menu - the last of which shares the
     mainmenu1 class with Battle!). Without this, they'd show full rainbow
     colors while actually non-functional. mainmenu2, 3, and 7 never
     render disabled, so they're left out on purpose. */
  .button.mainmenu1.disabled,
  .button.mainmenu4.disabled,
  .button.mainmenu5.disabled,
  .button.mainmenu6.disabled {
    background: #EEEEEE !important;
    border-color: #CCCCCC !important;
    color: #999 !important;
    text-shadow: none !important;
  }
`);

	console.log('[Showdown Suite] v1.2.0 loaded - Music, QoL, Move to Folder, Battle Update, OTS Pokepaste Modifier, Text Size, Rainbow Buttons.');
})();
