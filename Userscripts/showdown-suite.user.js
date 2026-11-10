// ==UserScript==
// @name         Showdown Suite (Merged)
// @namespace    showdown-qol-suite
// @version      1.5.15
// @description  All-in-one: custom music player, QoL shortcuts/avatar/room filter, teambuilder folders, battle/replay/OTS tools, OTS Pokepaste export modifier, adjustable text size, rainbow menu buttons.
// @author       Volcano08
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
	// since Cmd+T alone collides with browser's "new tab"
	// shortcut.
	var IS_MAC = /Mac/.test(navigator.platform);
	function isShortcutModifier(e) {
		return IS_MAC ? e.metaKey : (e.ctrlKey && e.altKey);
	}
	var SHORTCUT_LABEL = IS_MAC ? 'Cmd' : 'Ctrl+Alt';

	// ============================================================
	// CONFIG - editable settings.
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

	// Custom Music track list. Empty by default - populate with your own
	// hosted mp3s. The companion "Showdown Music Uploader" tool in the
	// repo converts/cleans/uploads audio files and generates entries in
	// this exact format to paste in.
	var MUSIC_TRACKS = [
];

	// Showdown's own built-in battle music. Included in the shuffle pool by
	// default alongside MUSIC_TRACKS; toggle in Options -> Music.
	var SHOWDOWN_DEFAULT_TRACKS = [
		'https://play.pokemonshowdown.com/audio/bw-rival.mp3',
		'https://play.pokemonshowdown.com/audio/bw-subway-trainer.mp3',
		'https://play.pokemonshowdown.com/audio/bw-trainer.mp3',
		'https://play.pokemonshowdown.com/audio/bw2-homika-dogars.mp3',
		'https://play.pokemonshowdown.com/audio/bw2-kanto-gym-leader.mp3',
		'https://play.pokemonshowdown.com/audio/bw2-rival.mp3',
		'https://play.pokemonshowdown.com/audio/colosseum-miror-b.mp3',
		'https://play.pokemonshowdown.com/audio/dpp-rival.mp3',
		'https://play.pokemonshowdown.com/audio/dpp-trainer.mp3',
		'https://play.pokemonshowdown.com/audio/hgss-johto-trainer.mp3',
		'https://play.pokemonshowdown.com/audio/hgss-kanto-trainer.mp3',
		'https://play.pokemonshowdown.com/audio/oras-rival.mp3',
		'https://play.pokemonshowdown.com/audio/oras-trainer.mp3',
		'https://play.pokemonshowdown.com/audio/sm-rival.mp3',
		'https://play.pokemonshowdown.com/audio/sm-trainer.mp3',
		'https://play.pokemonshowdown.com/audio/spl-elite4.mp3',
		'https://play.pokemonshowdown.com/audio/xd-miror-b.mp3',
		'https://play.pokemonshowdown.com/audio/xy-rival.mp3',
		'https://play.pokemonshowdown.com/audio/xy-trainer.mp3',
	];

	// Friendly display names for the default tracks above - their raw
	// filenames (e.g. "bw2-homika-dogars") don't follow the "Artist - Song"
	// convention getTrackName() otherwise parses, so this maps each one
	// explicitly instead. Keyed by filename (without the .mp3 extension).
	var SHOWDOWN_DEFAULT_TRACK_NAMES = {
		'bw-rival': 'Rival Battle (Black & White)',
		'bw-subway-trainer': 'Battle Subway Trainer (Black & White)',
		'bw-trainer': 'Trainer Battle (Black & White)',
		'bw2-homika-dogars': 'Roxie, Gym Leader Battle (Black 2 & White 2)',
		'bw2-kanto-gym-leader': 'Kanto Gym Leader Battle (Black 2 & White 2)',
		'bw2-rival': 'Rival Battle (Black 2 & White 2)',
		'colosseum-miror-b': 'Miror B. Battle (Pokémon Colosseum)',
		'dpp-rival': 'Rival Battle (Diamond, Pearl & Platinum)',
		'dpp-trainer': 'Trainer Battle (Diamond, Pearl & Platinum)',
		'hgss-johto-trainer': 'Johto Trainer Battle (HeartGold & SoulSilver)',
		'hgss-kanto-trainer': 'Kanto Trainer Battle (HeartGold & SoulSilver)',
		'oras-rival': 'Rival Battle (Omega Ruby & Alpha Sapphire)',
		'oras-trainer': 'Trainer Battle (Omega Ruby & Alpha Sapphire)',
		'sm-rival': 'Rival Battle (Sun & Moon)',
		'sm-trainer': 'Trainer Battle (Sun & Moon)',
		'spl-elite4': 'Elite Four Battle (Smogon Premier League)',
		'xd-miror-b': 'Miror B. Battle (Pokémon XD: Gale of Darkness)',
		'xy-rival': 'Rival Battle (X & Y)',
		'xy-trainer': 'Trainer Battle (X & Y)',
	};

	// ============================================================
	// CUSTOM MUSIC
	// ============================================================
	(function () {
		var QOL2_KEY = 'qol2-settings';
		function getQol2Prefs() { try { return JSON.parse(localStorage.getItem(QOL2_KEY) || '{}'); } catch (e) { return {}; } }
		// Can't turn off Showdown's own music if there's nothing else to
		// fall back on - MUSIC_TRACKS being empty forces this on regardless
		// of the saved preference.
		function includeShowdownBgm() {
			if (MUSIC_TRACKS.length === 0) return true;
			var p = getQol2Prefs();
			return 'includeShowdownBgm' in p ? p.includeShowdownBgm : true;
		}
		function getActiveTracks() {
			return includeShowdownBgm() ? SHOWDOWN_DEFAULT_TRACKS.concat(MUSIC_TRACKS) : MUSIC_TRACKS.slice();
		}

		// No-repeat shuffle pool
		var pool = getActiveTracks();
		var played = new Set();

		// Manual override state, driven by the music picker window (Ctrl+Alt+M).
		// loopTrack: if set, pickTrack() always returns this track instead of shuffling.
		// forcedNext: one-shot override used when the picker is opened before any
		// battle music is active yet, so there's nothing to switch immediately -
		// this arms the choice for whenever loadBgm() is next called.
		var loopTrack = null;
		var forcedNext = null;

		var pickTrack = function () {
			var activeTracks = getActiveTracks();
			// activeTracks is empty only if MUSIC_TRACKS is empty AND the
			// Showdown-default toggle is off - but that toggle can't
			// actually be turned off while MUSIC_TRACKS is empty, so this
			// only fires if something else has gone wrong. Guards against
			// it anyway rather than letting audio.src silently fail.
			if (activeTracks.length === 0) {
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
					pool = activeTracks.slice();
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
				var stem = filename.replace(/\.mp3$/i, '');
				if (SHOWDOWN_DEFAULT_TRACK_NAMES[stem]) return SHOWDOWN_DEFAULT_TRACK_NAMES[stem];
				return stem.replace(/^\d+[.\s-]+/, '');
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
		// persists across battles, so its mere existence doesn't indicate
		// whether one is happening right now.
		function isInActiveBattle() {
			if (!win.app || !win.app.rooms) return false;
			return Object.values(win.app.rooms).some(function (r) {
				return r && r.type === 'battle' && !r.battleEnded;
			});
		}

		// New-client counterpart of isInActiveBattle() above (left untouched).
		// PS.rooms entries have no native "battle ended" flag the way old
		// client's room.battleEnded is - that's filled in by this script's own
		// patchBattleRoomProtocolNewClient() handleLine hook (installed
		// unconditionally at load, not behind any QoL preference) stamping
		// room._qol2EndedAt once a |win|/|tie| protocol line arrives. Mirrors
		// bmIsInBattleNewClient() elsewhere in this file, which solved this
		// exact old-client-only-detection gap for the Battle Mode feature.
		// Without this, isInActiveBattle() alone always returns false on the
		// new client (win.app doesn't exist there), so playTrackNow() below
		// never took its immediate-switch branch - clicking Play/Loop during
		// a new-client battle silently armed forcedNext for "next battle"
		// instead of switching the music that's actually playing right now.
		function isInActiveBattleNewClient() {
			if (!win.PS || !win.PS.rooms) return false;
			return Object.values(win.PS.rooms).some(function (r) {
				return r && r.classType === 'battle' && !r._qol2EndedAt;
			});
		}

		function playTrackNow(url, loop) {
			loopTrack = loop ? url : null;
			if ((isInActiveBattle() || isInActiveBattleNewClient()) && win.__cmActiveAudio) {
				win.__cmCurrentTrack = url;
				win.__cmActiveAudio.src = url;
				win.__cmActiveAudio.currentTime = 0;
				if (win.__cmGetVolume) win.__cmActiveAudio.volume = win.__cmGetVolume();
				win.__cmActiveAudio.play().catch(function () {});
			} else {
				// Not in a battle right now - arm this as the track for
				// whenever the next battle's music starts, rather
				// than playing anything audible immediately.
				forcedNext = url;
			}
		}

		function resumeShuffle() {
			loopTrack = null;
			forcedNext = null;
		}

		// Tracks whichever scrollable panel (room list, chat log, etc) the
		// cursor is currently over, so Arrow Up/Down can scroll it directly -
		// checked here rather than a separate listener so it can take
		// priority over the volume control below without both firing at once.
		var hoveredScrollable = null;
		document.addEventListener('mouseover', function (e) {
			var el = e.target;
			while (el && el !== document.body) {
				if (el.scrollHeight > el.clientHeight + 1) {
					hoveredScrollable = el;
					return;
				}
				el = el.parentElement;
			}
			hoveredScrollable = null;
		});

		// Arrow key volume control (and scrollable-panel scrolling, see above)
		document.addEventListener('keydown', function (e) {
			if (e.ctrlKey || e.altKey || e.metaKey) return;
			if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && hoveredScrollable) {
				e.preventDefault();
				hoveredScrollable.scrollTop += (e.key === 'ArrowUp' ? -48 : 48);
				return;
			}
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
		// rect doesn't tightly hug the actual button row. Instead, measure the
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
			// #cm-picker-modal uses Showdown's own .ps-popup class for its
			// background/border/shadow (confirmed against the real, live
			// client.css - it has its own light/dark variants, so this
			// matches whichever theme is active automatically). Showdown
			// has no single universal button/input look to inherit from
			// though - .menugroup .button, .tabbar .button, and
			// .popupmenu .button are all separately-defined, context-
			// scoped rules with their own values. The button/input rules
			// below are copied directly from .menugroup .button and
			// .select/.team in that same file, since that's the fullest,
			// most complete version of each found there.
			style.textContent =
				'#cm-picker-overlay {' +
				'    position: fixed; inset: 0; z-index: 10000;' +
				'    display: flex; align-items: center; justify-content: center;' +
				'}' +
				'#cm-picker-modal {' +
				'    width: 420px; max-height: 70vh; display: flex; flex-direction: column;' +
				'    overflow: hidden; padding: 0;' +
				'}' +
				'#cm-picker-header {' +
				'    display: flex; align-items: center; justify-content: space-between;' +
				'    padding: 5px 8px; margin: 0;' +
				'}' +
				'#cm-picker-toolbar {' +
				'    display: flex; gap: 6px; padding: 0 8px 5px;' +
				'}' +
				'#cm-picker-list { overflow-y: auto; margin: 0; padding: 0 0 5px; }' +
				'.cm-picker-row {' +
				'    display: flex; align-items: center; gap: 6px; padding: 3px 8px;' +
				'}' +
				'.cm-picker-name { flex: 1; overflow-wrap: break-word; white-space: normal; }' +
				// Input field, copied from .select/.team (light theme)
				'#cm-picker-filter {' +
				'    flex: 1; min-width: 0; font: inherit; padding: 2px 5px;' +
				'    border-radius: 4px; border: 1px solid #888888;' +
				'    background: linear-gradient(to bottom, #edf2f8, #d7e3ec);' +
				'    box-shadow: inset 0 1px 0 #ffffff; color: black; box-sizing: border-box;' +
				'}' +
				// Dark-theme input override, copied from .dark .select/.team
				'.dark #cm-picker-filter {' +
				'    border-color: #000000; box-shadow: none; color: black;' +
				'    background: linear-gradient(to bottom, rgba(227,239,251,.85), rgba(118,128,140,.85));' +
				'}' +
				// Buttons, copied from .menugroup .button (no dark-theme
				// override exists for this one in the real stylesheet -
				// it's a colored button meant to look the same either way)
				'#cm-picker-modal button {' +
				'    font-size: 11px; padding: 3px 8px; cursor: pointer; flex-shrink: 0;' +
				'    box-sizing: border-box; border-radius: 3px;' +
				'    color: #FFFFFF; border: solid 1px hsl(210,40%,40%);' +
				'    background: linear-gradient(to bottom, hsl(210,40%,72%), hsl(210,40%,52%));' +
				'    text-shadow: 0 -1px 0 hsl(210,40%,10%);' +
				'    box-shadow: 0 1px 2px rgba(0,0,0,.2), inset 0 1px 1px rgba(255,255,255,.8);' +
				'}' +
				'#cm-picker-modal button:hover {' +
				'    background: linear-gradient(to bottom, hsl(210,40%,62%), hsl(210,40%,42%));' +
				'    border-color: hsl(210,40%,21%);' +
				'}' +
				'#cm-picker-modal button:active {' +
				'    background: linear-gradient(to bottom, hsl(210,40%,42%), hsl(210,40%,58%));' +
				'    border-color: hsl(210,40%,21%);' +
				'    box-shadow: 0 1px 2px rgba(0,0,0,.2), inset 0 -1px 1px rgba(255,255,255,.3), inset 0 1px 1px rgba(0,0,0,.4);' +
				'}' +
				'#cm-picker-close { font-size: 14px; line-height: 1; padding: 2px 6px; }' +
				'#cm-picker-resume { white-space: nowrap; }' +
				'.cm-picker-row button { flex-shrink: 0; }';
				'.cm-picker-row button { flex-shrink: 0; }';
			document.head.appendChild(style);
		}

		function closePicker() {
			var overlay = document.getElementById('cm-picker-overlay');
			if (overlay) overlay.remove();
		}

		function clearRowHighlights(list) {
			list.querySelectorAll('.cm-picker-name').forEach(function (n) { n.style.fontWeight = ''; });
			list.querySelectorAll('.cm-loop-btn').forEach(function (b) { b.textContent = 'Loop'; });
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
			modal.className = 'ps-popup';
			modal.addEventListener('mousedown', function (e) { e.stopPropagation(); });
			modal.innerHTML =
				'<p id="cm-picker-header">' +
				'    <strong>&#9834; Choose Music</strong>' +
				'    <button id="cm-picker-close">&times;</button>' +
				'</p>' +
				'<p id="cm-picker-toolbar">' +
				'    <input type="text" id="cm-picker-filter" placeholder="Filter tracks...">' +
				'    <button id="cm-picker-resume">Resume Shuffle</button>' +
				'</p>' +
				'<ul class="popupmenu" id="cm-picker-list"></ul>';
			overlay.appendChild(modal);
			document.body.appendChild(overlay);

			var list = modal.querySelector('#cm-picker-list');
			var activeTracks = getActiveTracks();

			if (activeTracks.length === 0) {
				var emptyMsg = document.createElement('li');
				emptyMsg.style.cssText = 'padding:12px 10px;font-style:italic;opacity:0.7;';
				emptyMsg.textContent = 'No tracks added yet. Add your own mp3 URLs to the MUSIC_TRACKS array at the top of the script (the Showdown Music Uploader tool can build this list for you), or enable Showdown\'s default music in Options -> Music.';
				list.appendChild(emptyMsg);
			}

			var sortedTracks = activeTracks.slice().sort(function (a, b) { return getTrackName(a).localeCompare(getTrackName(b)); });
			sortedTracks.forEach(function (url) {
				var name = getTrackName(url);
				var isLooping = loopTrack === url;
				var row = document.createElement('li');
				row.className = 'cm-picker-row';
				row.dataset.name = name.toLowerCase();
				row.innerHTML =
					'<span class="cm-picker-name"' + (isLooping ? ' style="font-weight:bold;"' : '') + '>' + name + '</span>' +
					'<button class="cm-play-btn">Play</button>' +
					'<button class="cm-loop-btn">' + (isLooping ? 'Looping' : 'Loop') + '</button>';
				row.querySelector('.cm-play-btn').addEventListener('click', function () {
					playTrackNow(url, false);
					clearRowHighlights(list);
				});
				row.querySelector('.cm-loop-btn').addEventListener('click', function (e) {
					playTrackNow(url, true);
					clearRowHighlights(list);
					row.querySelector('.cm-picker-name').style.fontWeight = 'bold';
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
				"const origLoadBgm = BattleSound.loadBgm.bind(BattleSound);\n" +
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
				"    if (!track) return this.bgmCache[url] = origLoadBgm(url, loopstart, loopend);\n" +
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
		// Old client renders News as a .pm-window.news-embed popup with a
		// .closebutton. The new client's News is a totally different UI
		// paradigm - a dockable "mini-window" (same mechanism as a
		// minimized battle/chat room) rather than a popup overlay - but it
		// still carries a .closebutton in its own header
		// (renderMiniRooms() in panel-mainmenu.tsx), tagged with
		// data-roomid="news" since NewsPanel.id is 'news'. Trying the old
		// selector first and falling back to the new one covers both
		// without needing to branch on win.app/win.PS at all.
		var closeNews = function () {
			var newsWindow = document.querySelector('.pm-window.news-embed') || document.querySelector('.mini-window[data-roomid="news"]');
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
					// The new client's PopupPanel (what PS.alert() - the
					// mechanism behind any plain server |popup| message -
					// renders) has no button[name="close"] at all for a
					// plain message-only alert like this one: just an "OK"
					// button (type="submit", no name). Falling back to that
					// covers the new client; it's only ever reached once
					// the popup is already confirmed by its text to be the
					// right one, so there's no risk of it matching some
					// unrelated submit button elsewhere.
					var closeBtn = popup.querySelector('button[name="close"]') || popup.querySelector('button[type="submit"]');
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

		// ─── SAVE & RESTORE LAST FORMAT + TEAM (NEW CLIENT) ───
		// New client identifies a saved team by its own stable string
		// key (team.key), not an array index like the old client's
		// curTeamIndex, so it gets its own storage key rather than
		// reusing TEAM_INDEX_KEY/TEAM_FORMAT_KEY. FORMAT_KEY is shared
		// across both clients since it's just a plain format string.
		var NEWCLIENT_TEAM_KEY = 'qol_last_team_key';
		var newClientFormatTeamWatcherAdded = false;

		var findHomeRoomEl = function () {
			// The home/main-menu room's container always has id
			// "room-" (PSPanelWrapper renders id=`room-${room.id}`
			// and the home room's id is the empty string). This is
			// also what keeps us from ever matching a format/team
			// button that belongs to an open teambuilder panel
			// instead - those use the same "formatselect"/
			// "teamselect" classes, but live under a container whose
			// room id is never empty.
			return document.getElementById('room-');
		};

		var findSearchFormatButton = function () {
			var home = findHomeRoomEl();
			if (!home) return null;
			return home.querySelector('button[name="format"].formatselect:not([disabled])');
		};

		var findSearchTeamButton = function () {
			var home = findHomeRoomEl();
			if (!home) return null;
			return home.querySelector('button[name="team"].teamselect:not([disabled])');
		};

		var setButtonValueAndFireChange = function (btn, value) {
			if (!btn || btn.value === value) return false;
			btn.value = value;
			// FormatDropdown/TeamDropdown's change handler reads
			// this.base.value directly, so a real dispatched change
			// event triggers it exactly like a genuine selection.
			btn.dispatchEvent(new Event('change', { bubbles: true }));
			return true;
		};

		var FMT_LOG = '[Showdown Suite: FormatRestore]';

		// Showdown's own format-picker popup (FormatDropdownPanel in
		// panel-teamdropdown.tsx) sets its option buttons' values to the
		// format's pretty display NAME (e.g. "[Gen 9 Champions] VGC 2026
		// Reg M-C"), not its clean BattleFormats-keyed id (e.g.
		// "gen9championsvgc2026regmc") - unlike its own team picker
		// (TeamBox), which correctly uses the stable team.key. That
		// pretty name is exactly the string our change listener below
		// captures off the button's real .value and saves to
		// localStorage, so savedFormat can legitimately BE a pretty
		// name - confirmed from a real user's console log, it routinely
		// is for any server/section with custom-named formats. Showdown's
		// own code treats this as totally normal and always re-normalizes
		// a dropdown's raw value before using it as a lookup key
		// (FormatDropdownPanel.render()'s own `curFormat` computation,
		// and PS.teams.teambuilderFormat()) via toID(), so we mirror that
		// exact algorithm here - lowercase, strip everything but a-z0-9 -
		// rather than comparing the raw string straight against
		// win.BattleFormats, which always missed for any non-default
		// format chosen through the normal popup flow and silently
		// aborted the ENTIRE restore (format AND team, since team
		// restoration is nested inside this same function). This
		// normalization is ONLY for the existence check just below;
		// savedFormat itself stays completely raw everywhere else (the
		// button value, the reassert check, the log line, localStorage),
		// matching exactly what a real interactive selection produces
		// and what FormatDropdown/TeamForm already expect to receive.
		// It's also a safe no-op for anyone whose saved value was
		// already a clean id, since toID() of an already-clean id is
		// just itself, unchanged.
		var qolToID = function (text) {
			return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '');
		};

		var restoreFormatAndTeamNewClient = function () {
			if (!win.PS) return false;
			var savedFormat = localStorage.getItem(FORMAT_KEY);
			if (!savedFormat) return false;
			if (!win.BattleFormats || !win.BattleFormats[qolToID(savedFormat)]) {
				return false;
			}

			var formatBtn = findSearchFormatButton();
			if (!formatBtn) return false;

			var changedFormat = setButtonValueAndFireChange(formatBtn, savedFormat);

			var applyTeam = function () {
				var savedTeamKey = localStorage.getItem(NEWCLIENT_TEAM_KEY);
				if (!savedTeamKey) return;
				var teamBtn = findSearchTeamButton();
				if (!teamBtn) return;
				setButtonValueAndFireChange(teamBtn, savedTeamKey);
			};

			// FormatDropdown's own change handler (which our dispatched
			// event above triggers whenever changedFormat is true)
			// schedules a deferred self-re-render of just itself. When
			// that re-render runs, it reads `this.format = this.props.format
			// || this.format || ...` - and since its enclosing TeamForm
			// never actually re-renders from any of this (TeamForm.format
			// is updated as a plain field, with nothing calling
			// setState/forceUpdate on TeamForm itself), FormatDropdown's
			// `props.format` is still the stale value from the very
			// first mount. That stale truthy prop wins the `||` chain
			// and silently reverts the button's displayed format back to
			// the default, even though the format we actually want is
			// correctly sitting in TeamForm.format (and is what a real
			// search would submit) the whole time - it's only the
			// visible button that gets clobbered back.
			// That deferred re-render is a Promise microtask (confirmed
			// against the actual js/lib/preact.min.js Showdown ships,
			// not just the latest npm package), so it has always
			// already run by the time a setTimeout(fn, 0) callback
			// fires - which is the right moment to put the display back
			// on, deliberately with a plain assignment and no
			// re-dispatched 'change' event, since dispatching again
			// would just trigger the same self-clobbering re-render a
			// second time. Extra passes further out guard against a
			// slow login/reconnect sequence (or anything else) landing
			// an unrelated re-render in this same window; they're cheap
			// no-ops whenever the display is already correct.
			var reassertFormat = function () {
				if (formatBtn && formatBtn.value !== savedFormat) {
					formatBtn.value = savedFormat;
				}
			};

			// The team button's own choices (and its default selection)
			// depend on whichever format is currently selected, so if we
			// just changed the format, give its re-render a tick to
			// settle before touching the team button - otherwise we'd
			// be applying the saved team key against the OLD format's
			// team list.
			if (changedFormat) {
				setTimeout(function () { applyTeam(); reassertFormat(); }, 0);
			} else {
				applyTeam();
			}
			setTimeout(reassertFormat, 200);
			setTimeout(reassertFormat, 1000);

			return true;
		};

		var watchFormatAndTeamNewClient = function () {
			if (newClientFormatTeamWatcherAdded) return true;
			newClientFormatTeamWatcherAdded = true;

			// There's no settable room-model property to intercept
			// on the new client (unlike old client's curFormat/
			// curTeamIndex/curTeamFormat), so instead we listen for
			// the same native change events the dropdowns themselves
			// fire, scoped to the home room so we never pick up a
			// teambuilder panel's own format/team selectors.
			document.addEventListener('change', function (e) {
				var t = e.target;
				if (!t || !t.classList || !t.name) return;
				var home = findHomeRoomEl();
				if (!home || !home.contains(t)) return;
				if (t.name === 'format' && t.classList.contains('formatselect')) {
					if (t.value) {
						localStorage.setItem(FORMAT_KEY, t.value);
					}
				} else if (t.name === 'team' && t.classList.contains('teamselect')) {
					if (t.value) {
						localStorage.setItem(NEWCLIENT_TEAM_KEY, t.value);
					}
				}
			}, true);

			// Safety net: the listener above only captures an ACTIVE
			// selection made during this session. If the format/team
			// shown was already sitting there from earlier (e.g. a
			// long-lived tab that never fired a fresh change event this
			// session, or any other reason the picker's value didn't
			// come from a 'change' event we saw), nothing above would
			// ever have saved it, and a reload would fall back to the
			// defaults even though "last used" clearly wasn't empty.
			// Reading the buttons' actual current values directly as
			// the page goes away guarantees whatever was really on
			// screen gets saved, independent of how it got there.
			var saveCurrentFormatAndTeam = function () {
				var formatBtn = findSearchFormatButton();
				if (formatBtn && formatBtn.value) localStorage.setItem(FORMAT_KEY, formatBtn.value);
				var teamBtn = findSearchTeamButton();
				if (teamBtn && teamBtn.value) localStorage.setItem(NEWCLIENT_TEAM_KEY, teamBtn.value);
			};
			window.addEventListener('beforeunload', saveCurrentFormatAndTeam);
			window.addEventListener('pagehide', saveCurrentFormatAndTeam);

			return true;
		};

		var initFormatTrackingNewClient = setInterval(function () {
			if (!win.PS || !win.BattleFormats) return;
			if (!findSearchFormatButton()) return;
			restoreFormatAndTeamNewClient();
			watchFormatAndTeamNewClient();
			setTimeout(restoreFormatAndTeamNewClient, 500);
			setTimeout(restoreFormatAndTeamNewClient, 1500);
			setTimeout(restoreFormatAndTeamNewClient, 3000);
			clearInterval(initFormatTrackingNewClient);
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
		// (old client only - new client's own win.PS.room is already kept
		// accurate by PS itself, used directly in the arrow-key handler
		// below, so this tracker has nothing to do there; bail out for
		// good once win.PS shows up instead of retrying forever).
		(function trackLastFocused() {
			if (win.PS) return;
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
				// Being focused on a text-type input at all (like the
				// Pokemon search box) should take priority for cursor
				// movement, regardless of whether it currently has
				// content - unlike the chat textarea case above, where
				// only non-empty content blocks tab-cycling.
				var inputType = tag === 'input' ? (document.activeElement.type || 'text').toLowerCase() : '';
				var isTextInputField = tag === 'input' && ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].indexOf(inputType) !== -1;
				if (!soundsOpen && !hasContent && !isTextInputField) {
					e.preventDefault();
					e.stopImmediatePropagation();
					if (document.activeElement && document.activeElement !== document.body) {
						document.activeElement.blur();
					}
					document.body.focus();
					var tabs = Array.from(document.querySelectorAll('.maintabbar .roomtab'));
					if (!tabs.length) return;
					if (!win.app && !win.PS) return;

					// New (Preact) client: .maintabbar/.roomtab markup and
					// the href="/<roomid>" shape are both unchanged
					// (confirmed directly in panel-topbar.tsx), so the
					// tab-finding/click logic below needs no changes at
					// all - the only old-client-specific part was getting
					// the currently-focused room. win.PS.room is PS's own
					// actively-maintained "current room" field (updated on
					// every focus change, including popups/room-close
					// fallbacks), so unlike old client's app.curRoom it
					// doesn't need a separate _qolLastFocused click-tracker
					// to stay accurate.
					var activeRoom = win.app ? (win.app._qolLastFocused || win.app.curRoom) : win.PS.room;
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
				// New (Preact) client: same idea, different global -
				// win.app doesn't exist there at all, win.PS.join() is
				// its tryJoinRoom (joins the room if not already open,
				// then focuses it either way).
				if (win.app) win.app.tryJoinRoom('teambuilder');
				else if (win.PS) win.PS.join('teambuilder');
				return;
			}

			if (isShortcutModifier(e)) {
				switch (e.key.toLowerCase()) {
					case 'h': e.preventDefault(); if (win.app) win.app.focusRoom(''); else if (win.PS) win.PS.focusRoom(''); break;
					case 'b': e.preventDefault(); if (win.app) win.app.tryJoinRoom('battles'); else if (win.PS) win.PS.join('battles'); break;
					case 'l': e.preventDefault(); if (win.app) win.app.tryJoinRoom('ladder'); else if (win.PS) win.PS.join('ladder'); break;
					case 'f':
						e.preventDefault();
						// Old client's clickable Battle! button is
						// button[name=search] inside .battleform - neither
						// of those exist on the new client, where the
						// equivalent is a plain type="submit" button
						// (clicking it submits the enclosing <form
						// onSubmit={submitSearch}>, same as a real click,
						// using whatever format is currently selected).
						// It's scoped to .mainmenu1.mainmenu.big - the one
						// combination of classes this specific button uses
						// anywhere in the client - so this can't accidentally
						// match some unrelated submit button elsewhere.
						var searchBtn = document.querySelector('.battleform button[name=search]') || document.querySelector('.mainmenu1.mainmenu.big.button[type="submit"]');
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

			// The modern (Preact) client - what play.pokemonshowdown.com
			// actually serves by default, and what's in every screenshot
			// we've debugged against - exposes everything through the
			// global `PS` object (PS.user, PS.rooms). `win.app` is the old
			// Backbone client's global and is simply undefined on the new
			// client, which is why the two lookups below silently did
			// nothing in battle/Bo3: `win.app && ...` short-circuited to
			// false every time, with no error to notice. Checking PS first
			// and falling back to `app` fixes the new client while still
			// working if the legacy client (index-old.html/
			// testclient-old.html) is ever loaded instead.
			var getMyName = function () {
				if (win.PS && win.PS.user) return win.PS.user.name;
				if (win.app && win.app.user) return win.app.user.get('name');
				return null;
			};
			var getAllRooms = function () {
				if (win.PS && win.PS.rooms) return Object.values(win.PS.rooms);
				if (win.app && win.app.rooms) return Object.values(win.app.rooms);
				return [];
			};
			var getRoomById = function (roomid) {
				if (win.PS && win.PS.rooms) return win.PS.rooms[roomid];
				if (win.app && win.app.rooms) return win.app.rooms[roomid];
				return null;
			};

			var replaceSprites = function () {
				// Home screen: <img class="trainersprite yours"> (.yours = the logged-in user only)
				document.querySelectorAll('img.trainersprite.yours').forEach(function (img) {
					if (img.src !== CUSTOM_AVATAR_URL) img.src = CUSTOM_AVATAR_URL;
				});

				// Userbar avatar (top-right corner of the page)
				document.querySelectorAll('.userbar img.trainersprite').forEach(function (img) {
					if (img.src !== CUSTOM_AVATAR_URL) img.src = CUSTOM_AVATAR_URL;
				});

				// UserPopup (clicking your name): img.trainersprite.yours inside ps-popup
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
				// name in the row above instead. An opponent whose avatar
				// hasn't resolved yet server-side will show as unknownf.png
				// regardless of this code.
				var myName = getMyName();
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
				var _rooms = getAllRooms();
				if (_rooms.length) {
					_rooms.forEach(function (room) {
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
					var room = getRoomById(b.roomid);
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

		// New client's Rooms panel was redesigned (search box +
		// section dropdown) and dropped the old toggle button
		// entirely, so we add our own. Anchored right after the <p>
		// that wraps input[name="roomsearch"] - that element is
		// always rendered regardless of search/filter state, unlike
		// the individual .roomlist section divs further down, which
		// come and go depending on what's been searched for.
		var ensureShowMoreRoomsButton = function () {
			if (win.app) return; // old client already has its own native button
			if (document.getElementById('qol2-showmorerooms')) return;
			var searchInput = document.querySelector('input[name="roomsearch"]');
			if (!searchInput) return;
			var anchor = searchInput.closest('p');
			if (!anchor) return;

			var wrap = document.createElement('p');
			var btn = document.createElement('button');
			btn.className = 'button';
			btn.id = 'qol2-showmorerooms';
			btn.textContent = roomFilterEnabled ? 'Show more rooms' : 'Hide more rooms';
			btn.addEventListener('click', function () {
				roomFilterEnabled = !roomFilterEnabled;
				btn.textContent = roomFilterEnabled ? 'Show more rooms' : 'Hide more rooms';
				filterRoomList();
			});
			wrap.appendChild(btn);

			anchor.insertAdjacentElement('afterend', wrap);
		};

		var roomListObserver = new MutationObserver(function () {
			hookToggleMoreRooms();
			filterRoomList();
			ensureShowMoreRoomsButton();
		});
		var observeRoomList = function () {
			document.querySelectorAll('.roomlist').forEach(function (el) {
				roomListObserver.observe(el, { childList: true });
			});
			hookToggleMoreRooms();
			filterRoomList();
			ensureShowMoreRoomsButton();
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
					// everything else, one header per folder, alphabetical order.
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

						var allPaths = getAllFolderPaths();
						var pins = getPinned().filter(function (p) { return byFolder[p] || allPaths.indexOf(p) !== -1; });

						// A pin can be an implicit parent (no teams
						// directly in it, e.g. everything lives one level
						// deeper in a subfolder) - its genuine child
						// folders (which do have teams) get grouped
						// directly underneath it here, rather than left
						// to appear separately, later, among the
						// alphabetically-sorted "others".
						var pinnedChildren = {};
						pins.forEach(function (p) {
							pinnedChildren[p] = folderOrder.filter(function (f) { return f !== p && f.indexOf(p + '/') === 0; });
						});
						var allPinnedChildNames = [].concat.apply([], pins.map(function (p) { return pinnedChildren[p]; }));

						var others = folderOrder.filter(function (f) { return pins.indexOf(f) === -1 && allPinnedChildNames.indexOf(f) === -1; }).sort();
						var orderedFolders = [];
						pins.forEach(function (p) {
							orderedFolders.push(p);
							orderedFolders = orderedFolders.concat(pinnedChildren[p]);
						});
						orderedFolders = orderedFolders.concat(others);

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
							if (byFolder[folderName]) {
								byFolder[folderName].forEach(function (it) {
									stripPrefix(it);
									frag.appendChild(it.li);
								});
							}
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
				return namedRows.some(function (r) { return r.name === p; }) || getAllFolderPaths().indexOf(p) !== -1;
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
				var rowDiv;
				if (row) {
					rowDiv = row.div;
				} else {
					// Implicit parent - e.g. every team under this
					// folder actually lives in a subfolder of it, so
					// Showdown's own native list (which only ever
					// creates rows for teams' exact, complete folder
					// strings) never creates a row for the parent
					// itself. Built here matching the same shape as a
					// regular row, with the data-value Showdown's own
					// delegated click handling already expects.
					rowDiv = document.createElement('div');
					rowDiv.className = 'folder';
					var sf = document.createElement('div');
					sf.className = 'selectFolder';
					sf.setAttribute('data-value', name + '/');
					sf.innerHTML = '<i class="fa fa-folder-o"></i> ' + esc(folderDisplayName(name));
					rowDiv.appendChild(sf);
				}
				insertAfter(rowDiv, anchor);
				anchor = rowDiv;
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

			// Whole-team LabMaus lookup, right next to Folder. Confirmed
			// URL structure: labmaus.net/teams/discover?regulation=...
			// &pokemon_filter=[{"pokemon":"Species","item":"Item"},...].
			// The regulation string (e.g. "Regulation Set M-B") is a
			// best-effort guess from Showdown's internal format id
			// (...regmb -> "Regulation Set M-B") - not independently
			// confirmed against the live site beyond the one example
			// URL provided, since the site blocks automated fetching.
			if (document.getElementById('qol2-labmaus-team-btn')) return;
			var labmausTeamBtn = document.createElement('button');
			labmausTeamBtn.id = 'qol2-labmaus-team-btn';
			labmausTeamBtn.className = 'button';
			labmausTeamBtn.title = 'Find similar teams on LabMaus';
			var labmausTeamIcon = document.createElement('img');
			labmausTeamIcon.src = 'https://favicon.im/labmaus.net';
			labmausTeamIcon.style.cssText = 'width:14px;height:14px;vertical-align:middle;image-rendering:auto;margin-right:4px;';
			labmausTeamIcon.onerror = function () { this.style.display = 'none'; };
			labmausTeamBtn.appendChild(labmausTeamIcon);
			labmausTeamBtn.appendChild(document.createTextNode('LabMaus Team'));
			labmausTeamBtn.addEventListener('click', function (e) {
				e.stopPropagation();
				var tbRoom = win.app && win.app.rooms && win.app.rooms['teambuilder'];
				if (!tbRoom || !tbRoom.curSetList) return;
				var pokemonFilter = tbRoom.curSetList.filter(function (set) { return set && set.species; }).map(function (set) {
					var speciesData = (win.Dex && win.Dex.species) ? win.Dex.species.get(set.species) : null;
					// Mega-evolved formes (Charizard-Mega-Y, etc) are
					// stored as the already-evolved forme name in
					// curSetList, but LabMaus's own team submissions use
					// the base species name with the mega stone as the
					// item - confirmed directly against the working
					// example (plain "Charizard" + "Charizardite Y").
					var speciesName = (speciesData && speciesData.isMega && speciesData.baseSpecies) ? speciesData.baseSpecies : set.species;
					// Floette-Eternal is a special case: it's the
					// canonical forme name itself (the only Floette
					// variant that can mega-evolve at all), not a
					// "-Mega"-suffixed name like Charizard-Mega-Y, so its
					// own formeid doesn't contain "mega" and the general
					// isMega check above never catches it. Confirmed
					// directly: the working example needs plain
					// "Floette" + "Floettite", same pattern as Charizard.
					if (String(set.species).toLowerCase().replace(/[^a-z]/g, '') === 'floetteeternal') speciesName = 'Floette';
					// The gender symbol is only needed when a genuine
					// alternate-gender counterpart species actually exists
					// to disambiguate from (Basculegion and Basculegion-F
					// both exist as separate, selectable species) - not
					// simply whenever a species happens to be gender-locked.
					// Floette (all color variants) is genuinely female-only
					// in the real games, same as its whole Flabébé/Florges
					// line, with no male counterpart existing at all, so
					// there's nothing to disambiguate and the symbol was
					// wrongly appearing despite being factually accurate
					// (checking gender-locked status alone isn't the right
					// signal; checking for a genuine counterpart is).
					var finalSpeciesData = (speciesName === set.species) ? speciesData : ((win.Dex && win.Dex.species) ? win.Dex.species.get(speciesName) : null);
					if (finalSpeciesData && finalSpeciesData.gender) {
						var baseId = speciesName.toLowerCase().replace(/[^a-z0-9]/g, '');
						var counterpart = (win.Dex && win.Dex.species) ? win.Dex.species.get(baseId + 'f') : null;
						// Confirmed directly: species.get() on a genuinely
						// nonexistent id (e.g. "floettef") silently falls
						// back to the closest real match (plain "floette"
						// itself, with exists:true) rather than returning
						// {exists:false} - checking exists alone isn't
						// enough. Comparing the returned entry's own id
						// against what was actually queried for correctly
						// distinguishes a genuine distinct species
						// (Basculegion-F, id genuinely "basculegionf") from
						// a fallback to something else entirely.
						if (counterpart && counterpart.exists && counterpart.id === baseId + 'f') {
							speciesName += finalSpeciesData.gender === 'M' ? ' \u2642' : ' \u2640';
						}
					}
					var entry = { pokemon: speciesName };
					if (set.item) entry.item = set.item;
					return entry;
				});
				var formatId = (tbRoom.curTeam && tbRoom.curTeam.format) || '';
				var regMatch = /reg([a-z]+)$/i.exec(formatId);
				var regulation = regMatch ? 'Regulation Set ' + regMatch[1].toUpperCase().split('').join('-') : '';

				// Confirmed required: omitting date_range entirely was
				// the actual cause of "no teams matching" (not the
				// pokemon_filter or regulation, which were already
				// correct) - LabMaus's own search appears to need an
				// explicit range rather than defaulting to all-time.
				// Rolling 14-day window, matching the confirmed working
				// example's span (2026-08-18 to 2026-09-01), computed
				// fresh from today rather than hardcoded.
				function toDateStr(d) {
					return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
				}
				var today = new Date();
				var twoWeeksAgo = new Date(today);
				twoWeeksAgo.setDate(today.getDate() - 14);
				var dateRange = toDateStr(twoWeeksAgo) + ' to ' + toDateStr(today);

				var params = new URLSearchParams();
				params.set('date_range', dateRange);
				if (regulation) params.set('regulation', regulation);
				params.set('pokemon_filter', JSON.stringify(pokemonFilter));
				GM_openInTab('https://labmaus.net/teams/discover?' + params.toString(), { active: true, insert: true });
			});
			btn.insertAdjacentElement('afterend', labmausTeamBtn);
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

			// Storage.whenTeamsLoaded is Showdown's own, canonical load
			// tracker for exactly this: it fires the callback once teams
			// have genuinely finished loading (or immediately, if
			// already loaded by this point). This replaces an earlier,
			// much more fragile approach that tried to guess the right
			// moment via MutationObserver retries.
			if (win.Storage.whenTeamsLoaded) {
				win.Storage.whenTeamsLoaded(function () {
					if (getVisibleFolderpane()) enhanceSidebar();
					var tb = win.app.rooms && win.app.rooms['teambuilder'];
					if (tb && getVisibleTeampane()) enhanceTeamList(tb);
				});
			} else {
			}

			// Extra check: does Storage.teams keep changing well after
			// whenTeamsLoaded fired? If so, that tracker isn't actually
			// the complete signal I assumed it was.
			setTimeout(function () {
			}, 3000);

			new MutationObserver(function () {
				if (document.querySelector('li.format-select button[name="validate"]')) injectButton();
				var tb = win.app.rooms && win.app.rooms['teambuilder'];
				if (!tb || !tb.__psFolderListPatched) tryPatch();
			}).observe(document.body, { childList: true, subtree: true });
		}

		startObservingFolders();
	})();

	// ============================================================
	// SHOWDOWN MOVE TO FOLDER - new (Preact) client
	// ============================================================
	// Mirrors the section above, function-for-function, targeting the
	// newer Preact Teambuilder (room "teambuilder" -> panel-teambuilder.tsx
	// for the folder/team list, room "team-<key>" -> panel-teambuilder-team.tsx
	// for a single open team) instead of the jQuery one. Kept fully
	// separate rather than merged into the functions above, matching
	// this file's own convention of self-contained sections - and
	// because the two clients differ enough (teams keyed by team.key
	// instead of array index, no PromptPopup/Storage globals, no
	// li.format-select/.setmenu wrapper) that sharing code would mean
	// client-detection branches scattered through nearly every function
	// anyway. Pins are stored under the same PREFS_KEY, so a folder
	// pinned on one client stays pinned on the other.
	//
	// Full parity with the old-client version above: pinning, per-team
	// folder assignment (including creating a new subfolder), the
	// sidebar/team-list subfolder display, the "Open folder" and "move
	// this folder into another folder" reorganizer per-team dropdown
	// actions, the child-folder quick-nav shown inside a subfolder's own
	// team list, the ancestor breadcrumb shown in a nested subfolder's
	// own header, and the folder-divider headers grouping the flat "All
	// teams" list are all here.
	(function () {
		function isNewClient() { return !!(win.PS && win.PS.rooms); }

		var PREFS_KEY = 'ps-folder-ui';

		// PS.prefs.set(key, val) writes into PS.prefs.storage[key] (the
		// plain object that actually gets JSON.stringify'd to the
		// "showdown_prefs" localStorage entry) AND mirrors it onto
		// PS.prefs[key] directly, so reading PS.prefs[key] looks right
		// for the rest of the current session. But on the NEXT page
		// load, PSPrefs's constructor reloads "showdown_prefs" and only
		// copies back the handful of keys it already knows about as
		// named class fields (PSPrefsDefaults) - an arbitrary custom
		// key like ours never gets re-mirrored onto the top level, even
		// though it's sitting right there in .storage the whole time.
		// So PS.prefs[PREFS_KEY] silently goes back to undefined after
		// every reload while the real data survives untouched in
		// PS.prefs.storage[PREFS_KEY] - which is why pins "worked" all
		// session but reset on refresh. Reading from .storage directly
		// is correct in both cases (immediately after .set(), and after
		// a fresh reload), so that's the only place to read from.
		function getPrefs() {
			if (!win.PS.prefs) return { pins: [] };
			var v = win.PS.prefs.storage && win.PS.prefs.storage[PREFS_KEY];
			return (v && typeof v === 'object') ? v : { pins: [] };
		}
		function savePrefs(p) { if (win.PS.prefs && win.PS.prefs.set) win.PS.prefs.set(PREFS_KEY, p); }
		function getPinned() { return getPrefs().pins || []; }
		function isPinned(name) { return getPinned().indexOf(name) !== -1; }
		function togglePin(name) {
			var p = getPrefs(); p.pins = p.pins || [];
			var idx = p.pins.indexOf(name);
			if (idx === -1) p.pins.push(name); else p.pins.splice(idx, 1);
			savePrefs(p);
		}

		function getAllTeams() { return (win.PS.teams && win.PS.teams.list) || []; }
		function saveTeams() { if (win.PS.teams && win.PS.teams.save) win.PS.teams.save(); }

		function getAllFolderPaths() {
			var seen = {}, all = [];
			getAllTeams().forEach(function (t) {
				if (!t || !t.folder) return;
				var parts = t.folder.split('/');
				for (var j = 1; j <= parts.length; j++) {
					var path = parts.slice(0, j).join('/');
					if (!seen[path]) { seen[path] = true; all.push(path); }
				}
			});
			return all.sort();
		}
		function folderDisplayName(path) { var parts = path.split('/'); return parts[parts.length - 1]; }
		function folderDepth(path) { return path.split('/').length - 1; }
		function getChildFolders(parentPath) {
			var all = getAllFolderPaths();
			return all.filter(function (p) {
				if (parentPath === '') return p.indexOf('/') === -1;
				if (!p.startsWith(parentPath + '/')) return false;
				return p.slice(parentPath.length + 1).indexOf('/') === -1;
			});
		}
		function esc(s) {
			return win.BattleLog ? win.BattleLog.escapeHTML(s)
				: String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		}

		function getOverviewRoom() { return win.PS.rooms['teambuilder']; }
		function getCurrentTeamRoom() {
			var room = win.PS.room;
			return (room && room.id && room.id.indexOf('team-') === 0) ? room : null;
		}
		function refreshOverview() {
			var room = getOverviewRoom();
			if (room && typeof room.update === 'function') room.update(null);
		}

		function moveToFolder(team, folderName) {
			var teamName = team.name;
			var prevFolder = team.folder;
			team.folder = folderName;
			saveTeams();
			var home = win.PS.rooms[''];
			var userid = win.PS.user && win.PS.user.userid;
			if (home && userid && typeof home.send === 'function') {
				var msg = folderName
					? 'Moved “' + teamName + '” to folder: ' + folderName
					: 'Removed “' + teamName + '” from folder: ' + prevFolder;
				home.send('/pm ' + userid + ', ' + msg);
				// Old client's own version of this (above) follows the
				// self-PM with an explicit notifyOnce() call, and that's
				// not redundant decoration - it's load-bearing. A
				// message's own highlight/notify path (handleHighlight in
				// panel-chat.tsx) explicitly bails out whenever the
				// sender is yourself ('if (userid === PS.user.userid)
				// return false;', confirmed directly in the new client's
				// own source), so a self-PM never lights up anything on
				// its own, on either client - sending it was never going
				// to be enough by itself. This new-client port only ever
				// sent the PM and never added the matching notify() call,
				// so nothing ever told the Home tab to highlight.
				// room.notify() (PSRoom.prototype.notify, client-main.ts)
				// already skips notifying when you're currently looking
				// right at this room - the same "don't bother, you'd see
				// it directly" behavior old client's notifyOnce's
				// once=true gives - so no extra focus-checking is needed
				// here to match it.
				if (typeof home.notify === 'function') {
					home.notify({ title: 'Folder update', body: msg, id: 'folder-move' });
				}
			}
			refreshOverview();
			var teamRoom = getCurrentTeamRoom();
			if (teamRoom && typeof teamRoom.update === 'function') teamRoom.update(null);
		}

		// ─── sidebar (.folderpane .folderlist) ───
		function getVisibleFolderpane() {
			var candidates = document.querySelectorAll('#room-teambuilder .folderpane');
			for (var i = 0; i < candidates.length; i++) {
				if (candidates[i].offsetParent !== null) return candidates[i];
			}
			return null;
		}

		function getSubRowsFor(folderlist, parentName) {
			var subs = [];
			folderlist.querySelectorAll('.ps-subfolder-row').forEach(function (el) {
				var sub = el.dataset && el.dataset.psSubfolder || '';
				if (sub.startsWith(parentName + '/')) subs.push(el);
			});
			return subs;
		}

		// Builds a synthetic sidebar row for one subfolder path, matching
		// the real .folder/.selectFolder markup panel-teambuilder.tsx
		// itself renders (button, not div, for the clickable part) so
		// Showdown's own delegated click handling on .folderlist (which
		// checks elem.className === 'selectFolder' via normal DOM event
		// bubbling) picks it up exactly like a native row.
		function makeFolderRow(dataVal, label, isCur, indent) {
			var row = document.createElement('div');
			row.className = 'folder ps-subfolder-row' + (isCur ? ' cur' : '');
			var icon = isCur ? 'fa-folder-open' : 'fa-folder-o';
			var indentHtml = indent ? '<span class="ps-sub-indent">└</span>' : '';
			var innerHtml = '<button class="selectFolder" data-value="' + esc(dataVal) + '">' +
				indentHtml + '<i class="fa ' + icon + '"></i> ' + esc(label) + '</button>';
			if (isCur) {
				row.innerHTML = '<div class="folderhack3"><div class="folderhack1"></div><div class="folderhack2"></div>' + innerHtml + '</div>';
			} else {
				row.innerHTML = innerHtml;
			}
			return row;
		}

		function injectSubfolderRowsNew(folderlist) {
			folderlist.querySelectorAll('.ps-subfolder-row').forEach(function (el) { el.parentNode.removeChild(el); });

			var allPaths = getAllFolderPaths();
			var subPaths = allPaths.filter(function (p) { return p.indexOf('/') !== -1; });
			if (!subPaths.length) return;

			var room = getOverviewRoom();
			var curFolder = (room && room.curFolder) || '';

			if (!document.getElementById('ps-subfolder-style')) {
				var style = document.createElement('style');
				style.id = 'ps-subfolder-style';
				style.textContent = [
					'.ps-subfolder-row > .selectFolder { padding-left: 20px !important; }',
					'.ps-subfolder-row > .selectFolder .ps-sub-indent { color: #aaa; margin-right: 3px; font-size: 9px; }',
					'.ps-pin-header .selectFolder { font-weight:bold; color:#557 !important; cursor:default !important; background:#c7d3dc !important; pointer-events:none !important; }',
				].join('\n');
				document.head.appendChild(style);
			}

			subPaths.forEach(function (subPath) {
				var parts = subPath.split('/');
				var parentPath = parts.slice(0, -1).join('/');
				var parentDataVal = parentPath + '/';
				var parentBtn = null;
				folderlist.querySelectorAll('.selectFolder').forEach(function (btn) {
					if (btn.getAttribute('data-value') === parentDataVal) parentBtn = btn;
				});
				if (!parentBtn) return;
				var parentRow = parentBtn.closest('.folder');
				if (!parentRow) return;

				var isCur = curFolder === (subPath + '/');
				var subRow = makeFolderRow(subPath + '/', folderDisplayName(subPath), isCur, true);
				subRow.dataset.psSubfolder = subPath;

				var insertAfterEl = parentRow;
				var next = parentRow.nextSibling;
				while (next && next.classList && next.classList.contains('ps-subfolder-row')) {
					var nextSub = (next.dataset && next.dataset.psSubfolder) || '';
					if (!nextSub.startsWith(parentPath + '/')) break;
					insertAfterEl = next;
					next = next.nextSibling;
				}
				if (insertAfterEl.nextSibling) folderlist.insertBefore(subRow, insertAfterEl.nextSibling);
				else folderlist.appendChild(subRow);
			});
		}

		function enhanceSidebarNew() {
			var folderpane = getVisibleFolderpane();
			if (!folderpane) return;
			var folderlist = folderpane.querySelector('.folderlist');
			if (!folderlist) return;

			injectSubfolderRowsNew(folderlist);

			var namedRows = [];
			folderlist.querySelectorAll('.selectFolder').forEach(function (btn) {
				if (btn.closest('.ps-subfolder-row')) return;
				var val = btn.getAttribute('data-value');
				if (val && val !== '/' && val.slice(-1) === '/') {
					namedRows.push({ row: btn.closest('.folder'), name: val.slice(0, -1) });
				}
			});

			var pins = getPinned().filter(function (p) {
				return namedRows.some(function (r) { return r.name === p; }) || getAllFolderPaths().indexOf(p) !== -1;
			});

			folderlist.querySelectorAll('.ps-pin-header').forEach(function (el) { el.parentNode.removeChild(el); });
			if (!pins.length) return;

			// "All teams" is data-value="" in the new client (was "all" in
			// the old one) - the very first folder row.
			var allRow = null;
			folderlist.querySelectorAll('.selectFolder').forEach(function (btn) {
				if (btn.getAttribute('data-value') === '') allRow = btn.closest('.folder');
			});

			function insertAfter(newNode, ref) {
				if (ref && ref.nextSibling) folderlist.insertBefore(newNode, ref.nextSibling);
				else folderlist.appendChild(newNode);
			}

			var pinHeader = document.createElement('div');
			pinHeader.className = 'folder ps-pin-header';
			pinHeader.innerHTML = '<div class="selectFolder"><i class="fa fa-thumb-tack" style="color:#e8a000"></i> Pinned</div>';

			var anchor = allRow;
			insertAfter(pinHeader, anchor);
			anchor = pinHeader;

			pins.forEach(function (name) {
				var row = namedRows.find(function (r) { return r.name === name; });
				var rowDiv = row ? row.row : makeFolderRow(name + '/', folderDisplayName(name), false, false);
				insertAfter(rowDiv, anchor);
				anchor = rowDiv;
				getSubRowsFor(folderlist, name).forEach(function (subRow) {
					insertAfter(subRow, anchor);
					anchor = subRow;
				});
			});
		}

		// ─── team list (.teampane ul.teamlist) ───
		function getVisibleTeampane() {
			var candidates = document.querySelectorAll('#room-teambuilder .teampane');
			for (var i = 0; i < candidates.length; i++) {
				if (candidates[i].offsetParent !== null) return candidates[i];
			}
			return null;
		}

		function enhanceTeamListNew() {
			var teampane = getVisibleTeampane();
			if (!teampane) return;
			var teamlist = teampane.querySelector('ul.teamlist');
			if (!teamlist) return;

			teamlist.querySelectorAll('.ps-folder-group-header, .ps-nofolder-header').forEach(function (h) { h.parentNode.removeChild(h); });

			var room = getOverviewRoom();
			var curFolder = (room && room.curFolder) || '';
			// Only regroup the flat "all teams" view (curFolder === '')
			// with folder-divider headers - a single open folder/format
			// is already exactly what Showdown itself chose to show.
			if (curFolder !== '') return;

			function navigateTo(folderValue) {
				var r = getOverviewRoom();
				if (!r) return;
				r.curFolder = folderValue;
				if (typeof r.resetExport === 'function') r.resetExport();
				if (typeof r.update === 'function') r.update(null);
			}

			var items = [];
			teamlist.querySelectorAll('li[data-teamkey]').forEach(function (li) {
				var key = li.getAttribute('data-teamkey');
				var team = win.PS.teams.byKey[key];
				if (!team) return;
				items.push({ li: li, teamFolder: team.folder || '' });
			});

			var unfoldered = items.filter(function (it) { return !it.teamFolder; });
			var foldered = items.filter(function (it) { return it.teamFolder; });
			if (!foldered.length) return; // nothing to group - leave Showdown's own order alone

			var byFolder = {}, folderOrder = [];
			foldered.forEach(function (it) {
				if (!byFolder[it.teamFolder]) { byFolder[it.teamFolder] = []; folderOrder.push(it.teamFolder); }
				byFolder[it.teamFolder].push(it);
			});

			var allPaths = getAllFolderPaths();
			var pins = getPinned().filter(function (p) { return byFolder[p] || allPaths.indexOf(p) !== -1; });

			// A pin can be an implicit parent (no teams directly in it,
			// e.g. everything lives one level deeper in a subfolder) -
			// its genuine child folders (which do have teams) get
			// grouped directly underneath it here, rather than left to
			// appear separately, later, among the alphabetically-sorted
			// "others".
			var pinnedChildren = {};
			pins.forEach(function (p) {
				pinnedChildren[p] = folderOrder.filter(function (f) { return f !== p && f.indexOf(p + '/') === 0; });
			});
			var allPinnedChildNames = [].concat.apply([], pins.map(function (p) { return pinnedChildren[p]; }));

			var others = folderOrder.filter(function (f) { return pins.indexOf(f) === -1 && allPinnedChildNames.indexOf(f) === -1; }).sort();
			var orderedFolders = [];
			pins.forEach(function (p) {
				orderedFolders.push(p);
				orderedFolders = orderedFolders.concat(pinnedChildren[p]);
			});
			orderedFolders = orderedFolders.concat(others);

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
				if (isPinned(folderName)) {
					header.innerHTML += ' <i class="fa fa-thumb-tack" style="color:#e8a000;font-size:8px;margin-left:4px;" title="Pinned"></i>';
				}
				header.title = 'Open folder ' + folderName;
				header.addEventListener('click', function () { navigateTo(folderName + '/'); });
				frag.appendChild(header);
				(byFolder[folderName] || []).forEach(function (it) { frag.appendChild(it.li); });
			});
			if (unfoldered.length && orderedFolders.length) {
				var noFolderLabel = document.createElement('li');
				noFolderLabel.className = 'ps-nofolder-header';
				noFolderLabel.style.cssText = 'list-style:none;padding:4px 8px 2px 8px;color:#9ab;font-size:9pt;border-top:1px solid rgba(255,255,255,.08);margin-top:4px;cursor:pointer;';
				noFolderLabel.innerHTML = '<i class="fa fa-minus" style="margin-right:4px;"></i>No Folder';
				noFolderLabel.title = 'Show only teams with no folder';
				noFolderLabel.addEventListener('click', function () { navigateTo('/'); });
				frag.appendChild(noFolderLabel);
			}
			unfoldered.forEach(function (it) { frag.appendChild(it.li); });
			teamlist.appendChild(frag);
		}

		// ─── pin button next to Rename/Remove in an open folder's <h2> ───
		function injectFolderHeaderPinNew() {
			var teampane = getVisibleTeampane();
			if (!teampane) return;
			var h2 = teampane.querySelector('h2');
			if (!h2) return;
			// Rename+Remove only render together for a genuine named
			// folder (not the all-teams/uncategorized/format-folder
			// headers) - the fa-times icon is unique to Remove there.
			var removeIcon = h2.querySelector('.fa-times');
			var removeBtn = removeIcon && removeIcon.closest('button');
			if (!removeBtn) {
				var existing = h2.querySelector('.ps-header-pin');
				if (existing) existing.parentNode.removeChild(existing);
				return;
			}
			if (h2.querySelector('.ps-header-pin')) return;

			var room = getOverviewRoom();
			var folderName = (room && room.curFolder && room.curFolder.slice(-1) === '/') ? room.curFolder.slice(0, -1) : null;
			if (!folderName) return;

			var pinned = isPinned(folderName);
			var btn = document.createElement('button');
			btn.className = 'button small ps-header-pin';
			btn.style.marginLeft = '5px';
			btn.title = pinned ? 'Unpin folder from sidebar' : 'Pin folder to top of sidebar';
			btn.innerHTML = '<i class="fa fa-thumb-tack"></i> ' + (pinned ? 'Unpin' : 'Pin');
			if (pinned) btn.style.color = '#e8a000';
			btn.addEventListener('click', function (e) {
				e.stopPropagation(); e.preventDefault();
				togglePin(folderName);
				refreshOverview();
			});
			removeBtn.insertAdjacentElement('afterend', btn);
		}

		// ─── child-folder quick-nav shown inside a subfolder's own team list ───
		function injectSubfolderNavNew() {
			var teampane = getVisibleTeampane();
			if (!teampane) return;

			var existing = teampane.querySelector('.ps-subfolder-nav');
			if (existing) existing.parentNode.removeChild(existing);

			var room = getOverviewRoom();
			var curFolder = (room && room.curFolder) || '';
			if (curFolder.slice(-1) !== '/') return;
			var parentFolder = curFolder.slice(0, -1);
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
				btn.addEventListener('click', function (e) {
					e.stopPropagation();
					var r = getOverviewRoom();
					if (!r) return;
					r.curFolder = childPath + '/';
					if (typeof r.resetExport === 'function') r.resetExport();
					if (typeof r.update === 'function') r.update(null);
				});
				nav.appendChild(btn);
			});

			var h2 = teampane.querySelector('h2');
			if (h2) {
				h2.insertAdjacentElement('afterend', nav);
			} else {
				teampane.insertBefore(nav, teampane.firstChild);
			}
		}

		// ─── ancestor breadcrumb in a nested subfolder's own <h2> ───
		// Showdown's native header just prints the whole path as flat text
		// ("VGC/2026") - this makes each ancestor segment clickable. Rather
		// than overwriting the native, Preact-owned title span's innerHTML
		// (risky: Preact keeps its own references to those exact child
		// nodes and a future re-render could misbehave if they're replaced
		// out from under it - see the caution already given to sidebar/
		// team-list work above), this only ever hides that native span via
		// a plain style property Preact itself never sets, and adds a
		// brand new sibling span next to it - the same "add a sibling,
		// don't rewrite Preact's own children" approach used everywhere
		// else in this file.
		function injectFolderBreadcrumbNew() {
			var teampane = getVisibleTeampane();
			if (!teampane) return;
			var h2 = teampane.querySelector('h2');
			if (!h2) return;
			var titleSpan = h2.querySelector('.teambuilder-folder-title');

			var existingBar = h2.querySelector('.ps-breadcrumb-bar');
			if (existingBar) existingBar.parentNode.removeChild(existingBar);

			var room = getOverviewRoom();
			var curFolder = (room && room.curFolder) || '';
			var folderPath = (curFolder.slice(-1) === '/') ? curFolder.slice(0, -1) : '';
			var isNestedSubfolder = !!folderPath && folderPath.indexOf('/') !== -1;

			if (titleSpan) titleSpan.style.display = isNestedSubfolder ? 'none' : '';
			if (!isNestedSubfolder || !titleSpan) return;

			if (!document.getElementById('ps-breadcrumb-style')) {
				var style = document.createElement('style');
				style.id = 'ps-breadcrumb-style';
				style.textContent = '.ps-breadcrumb{color:#6af;text-decoration:none;}\n.ps-bc-sep{color:#aaa;}';
				document.head.appendChild(style);
			}

			var countEl = titleSpan.querySelector('small');
			var countHtml = countEl ? countEl.outerHTML : '';
			var parts = folderPath.split('/');
			var label = folderDisplayName(folderPath);
			var breadcrumbLinks = parts.slice(0, -1).map(function (p, idx) {
				var ancestorPath = parts.slice(0, idx + 1).join('/');
				return '<a href="#" class="ps-breadcrumb" data-folder="' + esc(ancestorPath + '/') + '">' + esc(p) + '</a>';
			}).join(' <span class="ps-bc-sep">›</span> ');

			var bar = document.createElement('span');
			bar.className = 'teambuilder-folder-title ps-breadcrumb-bar';
			bar.innerHTML = '<i class="fa fa-folder-open" aria-hidden></i> ' + breadcrumbLinks +
				' <span class="ps-bc-sep">›</span> <strong>' + esc(label) + '</strong> ' + countHtml;
			titleSpan.insertAdjacentElement('afterend', bar);

			bar.querySelectorAll('.ps-breadcrumb').forEach(function (a) {
				a.addEventListener('click', function (e) {
					e.preventDefault(); e.stopPropagation();
					var r = getOverviewRoom();
					if (!r) return;
					r.curFolder = a.getAttribute('data-folder');
					if (typeof r.resetExport === 'function') r.resetExport();
					if (typeof r.update === 'function') r.update(null);
				});
			});
		}

		// ─── per-team "Folder" quick-move dropdown + LabMaus Team button ───
		function closeDropdown() {
			var el = document.getElementById('ps-folder-picker');
			if (el) el.parentNode.removeChild(el);
		}
		document.addEventListener('click', function (e) {
			var el = document.getElementById('ps-folder-picker');
			if (el && !el.contains(e.target)) closeDropdown();
		});

		function positionPopup(popup, anchorEl) {
			var rect = anchorEl.getBoundingClientRect();
			popup.style.top = (rect.bottom + 4) + 'px';
			popup.style.left = rect.left + 'px';
			requestAnimationFrame(function () {
				var r = popup.getBoundingClientRect();
				if (r.right > window.innerWidth - 8) popup.style.left = Math.max(8, rect.right - popup.offsetWidth) + 'px';
			});
		}

		function showFolderReorganizerNew(folderPath, anchorEl) {
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
			h3.textContent = 'Move folder “' + folderName + '” into…';
			titleLi.appendChild(h3);
			ul.appendChild(titleLi);

			function applyMove(newPath) {
				if (newPath === folderPath) return;
				getAllTeams().forEach(function (t) {
					if (!t) return;
					if (t.folder === folderPath) {
						t.folder = newPath;
					} else if (t.folder && t.folder.startsWith(folderPath + '/')) {
						t.folder = newPath + t.folder.slice(folderPath.length);
					}
				});
				saveTeams();
				refreshOverview();
				var teamRoom = getCurrentTeamRoom();
				if (teamRoom && typeof teamRoom.update === 'function') teamRoom.update(null);
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
			addOption('(Top level) — make “' + folderName + '” a main folder', 'fa-home',
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
					var indent = ' '.repeat(depth * 2);
					var wouldBe = parentPath + '/' + folderName;
					var alreadyThere = folderPath === wouldBe;
					addOption(indent + folderDisplayName(parentPath) + ' › ' + folderName,
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
			positionPopup(popup, anchorEl);
		}

		function showFolderPickerNew(anchorEl, team) {
			closeDropdown();
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
				var li = document.createElement('li'); var h3 = document.createElement('h3');
				h3.textContent = text; li.appendChild(h3); ul.appendChild(li);
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

				var li = document.createElement('li');
				li.style.cssText = 'display:flex;align-items:center;gap:2px;';

				var moveBtn = document.createElement('button');
				moveBtn.className = 'option';
				moveBtn.style.cssText = 'flex:1;text-align:left;padding-left:' + (6 + depth * 14) + 'px;' + (isCurrent ? 'opacity:0.5;cursor:default;' : '');
				var treePfx = depth > 0 ? '<span style="color:#aaa;margin-right:2px;font-size:9px;">└</span>' : '';
				var ico = isCurrent ? 'fa-folder-open-o' : 'fa-folder-o';
				moveBtn.innerHTML = treePfx + '<i class="fa ' + ico + '"></i> ' + esc(label) + (isCurrent ? ' <small>(current)</small>' : '');
				if (!isCurrent) moveBtn.addEventListener('click', function () { closeDropdown(); moveToFolder(team, folderPath); });
				else moveBtn.disabled = true;

				var subBtn = document.createElement('button');
				subBtn.className = 'button'; subBtn.title = 'New subfolder inside “' + folderPath + '”';
				subBtn.style.cssText = 'padding:2px 6px;font-size:9pt;';
				subBtn.innerHTML = '<i class="fa fa-folder-o"></i><sup style="font-size:7px;vertical-align:top;">+</sup>';
				subBtn.addEventListener('click', function (e) {
					e.stopPropagation(); closeDropdown();
					win.PS.prompt('New subfolder inside “' + folderPath + '”:', { okButton: 'Create & move here', parentElem: anchorEl }).then(function (name) {
						if (!name) return;
						name = name.replace(/\//g, '').trim();
						if (!name) return;
						moveToFolder(team, folderPath + '/' + name);
					});
				});

				var renameBtn = document.createElement('button');
				renameBtn.className = 'button';
				renameBtn.title = 'Move folder “' + folderPath + '” to top-level or inside another folder';
				renameBtn.style.cssText = 'padding:2px 6px;font-size:9pt;';
				renameBtn.innerHTML = '<i class="fa fa-sitemap"></i>';
				renameBtn.addEventListener('click', function (e) {
					e.stopPropagation();
					closeDropdown();
					showFolderReorganizerNew(folderPath, anchorEl);
				});

				var openBtn = document.createElement('button');
				openBtn.className = 'button';
				openBtn.title = 'Open folder';
				openBtn.style.cssText = 'padding:2px 6px;font-size:9pt;';
				openBtn.innerHTML = '<i class="fa fa-arrow-right"></i>';
				openBtn.addEventListener('click', function (e) {
					e.stopPropagation();
					closeDropdown();
					var overviewRoom = getOverviewRoom();
					if (!overviewRoom) return;
					overviewRoom.curFolder = folderPath + '/';
					if (typeof overviewRoom.resetExport === 'function') overviewRoom.resetExport();
					if (win.PS.join) win.PS.join('teambuilder');
					if (typeof overviewRoom.update === 'function') overviewRoom.update(null);
				});

				var pinBtn = document.createElement('button');
				pinBtn.className = 'button'; pinBtn.title = pinned ? 'Unpin from top' : 'Pin to top';
				pinBtn.style.cssText = 'padding:2px 6px;font-size:9pt;color:' + (pinned ? '#e8a000' : '');
				pinBtn.innerHTML = '<i class="fa fa-thumb-tack"></i>';
				pinBtn.addEventListener('click', function (e) {
					e.stopPropagation(); togglePin(folderPath); refreshOverview();
					closeDropdown(); showFolderPickerNew(anchorEl, team);
				});

				li.appendChild(moveBtn); li.appendChild(subBtn); li.appendChild(renameBtn); li.appendChild(openBtn); li.appendChild(pinBtn);
				ul.appendChild(li);
			}

			if (pinnedFolders.length) { addHeader('Pinned'); pinnedFolders.forEach(addFolderItem); if (allPaths.length) addSep(); }
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
					var moveUpLi = document.createElement('li'); var moveUpBtn = document.createElement('button');
					moveUpBtn.className = 'option';
					moveUpBtn.innerHTML = '<i class="fa fa-arrow-up"></i> Move up to “' + esc(parentPath) + '”';
					moveUpBtn.addEventListener('click', function () { closeDropdown(); moveToFolder(team, parentPath); });
					moveUpLi.appendChild(moveUpBtn); ul.appendChild(moveUpLi);
				}
				var removeLi = document.createElement('li'); var removeBtn = document.createElement('button');
				removeBtn.className = 'option';
				removeBtn.innerHTML = '<i class="fa fa-times"></i> Remove from folder';
				removeBtn.addEventListener('click', function () { closeDropdown(); moveToFolder(team, ''); });
				removeLi.appendChild(removeBtn); ul.appendChild(removeLi);
			}

			var newLi = document.createElement('li'); var newBtn = document.createElement('button');
			newBtn.className = 'option';
			newBtn.innerHTML = '<i class="fa fa-plus"></i> New folder…';
			newBtn.addEventListener('click', function () {
				closeDropdown();
				win.PS.prompt('Folder name (use / for subfolders, e.g. VGC/2026):', { okButton: 'Move to folder', parentElem: anchorEl }).then(function (name) {
					if (!name) return;
					name = name.replace(/^\/+|\/+$/, '').replace(/\/+/g, '/').trim();
					if (!name) return;
					moveToFolder(team, name);
				});
			});
			newLi.appendChild(newBtn); ul.appendChild(newLi);

			popup.appendChild(ul);
			document.body.appendChild(popup);
			positionPopup(popup, anchorEl);
		}

		function injectButtonNew() {
			var teamRoom = getCurrentTeamRoom();
			if (!teamRoom) return;
			var el = document.getElementById('room-' + teamRoom.id);
			if (!el) return;
			var backLink = el.querySelector('.team-pad a.button[href="teambuilder"]');
			if (!backLink) return;
			if (document.getElementById('ps-move-folder-btn')) return;

			var team = (typeof teamRoom.getTeam === 'function') ? teamRoom.getTeam() : teamRoom.team;
			if (!team) return;

			var btn = document.createElement('button');
			btn.id = 'ps-move-folder-btn';
			btn.className = 'button';
			btn.title = 'Move to folder';
			btn.innerHTML = '<i class="fa fa-folder"></i> Folder';
			btn.addEventListener('click', function (e) {
				e.stopPropagation();
				var t = (typeof teamRoom.getTeam === 'function') ? teamRoom.getTeam() : teamRoom.team;
				if (!t) return;
				showFolderPickerNew(btn, t);
			});
			backLink.insertAdjacentElement('afterend', btn);

			if (document.getElementById('qol2-labmaus-team-btn')) return;
			var labmausTeamBtn = document.createElement('button');
			labmausTeamBtn.id = 'qol2-labmaus-team-btn';
			labmausTeamBtn.className = 'button';
			labmausTeamBtn.title = 'Find similar teams on LabMaus';
			var labmausTeamIcon = document.createElement('img');
			labmausTeamIcon.src = 'https://favicon.im/labmaus.net';
			labmausTeamIcon.style.cssText = 'width:14px;height:14px;vertical-align:middle;image-rendering:auto;margin-right:4px;';
			labmausTeamIcon.onerror = function () { this.style.display = 'none'; };
			labmausTeamBtn.appendChild(labmausTeamIcon);
			labmausTeamBtn.appendChild(document.createTextNode('LabMaus Team'));
			labmausTeamBtn.addEventListener('click', function (e) {
				e.stopPropagation();
				var t = (typeof teamRoom.getTeam === 'function') ? teamRoom.getTeam() : teamRoom.team;
				var editor = teamRoom.editor;
				if (!t || !editor || !editor.sets) return;
				var pokemonFilter = editor.sets.filter(function (set) { return set && set.species; }).map(function (set) {
					var speciesData = (win.Dex && win.Dex.species) ? win.Dex.species.get(set.species) : null;
					var speciesName = (speciesData && speciesData.isMega && speciesData.baseSpecies) ? speciesData.baseSpecies : set.species;
					if (String(set.species).toLowerCase().replace(/[^a-z]/g, '') === 'floetteeternal') speciesName = 'Floette';
					var finalSpeciesData = (speciesName === set.species) ? speciesData : ((win.Dex && win.Dex.species) ? win.Dex.species.get(speciesName) : null);
					if (finalSpeciesData && finalSpeciesData.gender) {
						var baseId = speciesName.toLowerCase().replace(/[^a-z0-9]/g, '');
						var counterpart = (win.Dex && win.Dex.species) ? win.Dex.species.get(baseId + 'f') : null;
						if (counterpart && counterpart.exists && counterpart.id === baseId + 'f') {
							speciesName += finalSpeciesData.gender === 'M' ? ' ♂' : ' ♀';
						}
					}
					var entry = { pokemon: speciesName };
					if (set.item) entry.item = set.item;
					return entry;
				});
				var formatId = t.format || '';
				var regMatch = /reg([a-z]+)$/i.exec(formatId);
				var regulation = regMatch ? 'Regulation Set ' + regMatch[1].toUpperCase().split('').join('-') : '';
				function toDateStr(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
				var today = new Date(); var twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(today.getDate() - 14);
				var dateRange = toDateStr(twoWeeksAgo) + ' to ' + toDateStr(today);
				var params = new URLSearchParams();
				params.set('date_range', dateRange);
				if (regulation) params.set('regulation', regulation);
				params.set('pokemon_filter', JSON.stringify(pokemonFilter));
				GM_openInTab('https://labmaus.net/teams/discover?' + params.toString(), { active: true, insert: true });
			});
			btn.insertAdjacentElement('afterend', labmausTeamBtn);
		}

		// ─── driving it all: re-run on every Preact re-render, guarded
		// against reacting to our own DOM insertions (an earlier version
		// of the old-client pin fix crashed the tab this way - see Move
		// to Folder above - by observing a subtree before it finishes its
		// own unconditional rebuild and catching its own mutation) ───
		var applying = false;
		function runOverviewEnhancements() {
			if (applying) return;
			applying = true;
			try {
				enhanceSidebarNew();
				enhanceTeamListNew();
				injectFolderHeaderPinNew();
				injectSubfolderNavNew();
				injectFolderBreadcrumbNew();
			} catch (err) {
				console.error('[Showdown Suite / Move to Folder, new client] enhancement pass failed:', err);
			} finally {
				setTimeout(function () { applying = false; }, 0);
			}
		}

		var observedOverviewEl = null, overviewObserver = null;
		var observedTeamEl = null, teamObserver = null;

		function tick() {
			if (!isNewClient()) return;

			var overviewEl = document.getElementById('room-teambuilder');
			if (overviewEl && overviewEl !== observedOverviewEl) {
				if (overviewObserver) overviewObserver.disconnect();
				observedOverviewEl = overviewEl;
				overviewObserver = new MutationObserver(runOverviewEnhancements);
				overviewObserver.observe(overviewEl, { childList: true, subtree: true });
			}
			if (overviewEl) runOverviewEnhancements();

			var teamRoom = getCurrentTeamRoom();
			if (teamRoom) {
				var teamEl = document.getElementById('room-' + teamRoom.id);
				if (teamEl && teamEl !== observedTeamEl) {
					if (teamObserver) teamObserver.disconnect();
					observedTeamEl = teamEl;
					teamObserver = new MutationObserver(function () {
						if (applying) return;
						applying = true;
						try { injectButtonNew(); } catch (err) { console.error('[Showdown Suite / Move to Folder, new client] injectButtonNew failed:', err); }
						finally { setTimeout(function () { applying = false; }, 0); }
					});
					teamObserver.observe(teamEl, { childList: true, subtree: true });
				}
				if (teamEl) injectButtonNew();
			}
		}

		setInterval(tick, 500);
		tick();
	})();

	// ============================================================
	// ADVANCED POKEMON SEARCH
	// ============================================================
	// Adds JS-style boolean operators (&&, ||, !, parentheses for
	// grouping) and stat comparisons (Spe > 100, Atk >= 125, etc) to the
	// Pokemon search box. A + button next to the box adds additional
	// condition rows (operator dropdown + term field, where ! still
	// works as a prefix on the term itself for negation) rather than
	// requiring the whole expression to be typed by hand. Only
	// activates when the resulting query actually contains this syntax
	// - Showdown's own, existing search is completely untouched
	// otherwise. Works by overwriting the live search object's own
	// resultSet/results directly, matching whichever of Showdown's two
	// internal search implementations is actually present, so
	// Showdown's own table rendering, tier grouping, and stat columns
	// handle everything, completely unmodified.
	(function () {
		var STAT_NAMES = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
		var COMPARISON_OPS = ['>=', '<=', '==', '=', '>', '<'];

		// TEMPORARY DIAGNOSTIC - safe to remove once the "chip takes a
		// second to appear" report is resolved. The first version of this
		// watched the WHOLE page (subtree:true from document.documentElement)
		// for any added node merely CONTAINING a .dexlist-filters
		// descendant - in a busy chat room (hundreds of users, constant
		// join/leave churn), that's far too broad: some unrelated, larger
		// panel getting rebuilt elsewhere on the page can easily contain
		// the already-rendered chip as a left-over descendant, which that
		// check couldn't tell apart from the chip actually being newly
		// created. That's what produced a bogus ~22-SECOND reading
		// (confirmed impossible - Preact's own render scheduling is a
		// same-tick microtask, not requestAnimationFrame or
		// requestIdleCallback, per the bundled preact.min.js) instead of
		// measuring the real thing. Fixed by watching only the exact
		// .dexlist element the chip actually gets written into (found
		// fresh relative to the input box, not the whole document), for a
		// direct child being added (no subtree needed - updateDOM() in
		// battle-searchresults.tsx writes the filter <li> straight into
		// the UL via innerHTML, not nested in a wrapper) - and the
		// observer is created fresh per commit and torn down right after
		// it fires (or after 5s if it never does), so it can't accumulate
		// stale state across searches either.
		function watchForChipAppearing(inputEl, commitStart) {
			if (typeof MutationObserver === 'undefined') return;
			var editorRoot = inputEl.closest ? inputEl.closest('.team-focus-editor') : null;
			var list = (editorRoot || document).querySelector('.dexlist');
			if (!list) {
				return;
			}
			var obs = new MutationObserver(function (mutations) {
				for (var i = 0; i < mutations.length; i++) {
					var added = mutations[i].addedNodes;
					for (var j = 0; j < added.length; j++) {
						var node = added[j];
						if (node.nodeType === 1 && node.classList && node.classList.contains('dexlist-filters')) {
							var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
							obs.disconnect();
							return;
						}
					}
				}
			});
			obs.observe(list, { childList: true });
			setTimeout(function () { obs.disconnect(); }, 5000);
		}

		// The real getQolPref/setQolPref live in the separate "Showdown
		// Battle Update" section's own IIFE, which - unlike what was
		// assumed - is a genuinely separate scope from this section's,
		// not part of one shared top-level scope. Sibling IIFEs can't
		// see each other's local functions regardless of file order, so
		// reaching across for getQolPref throws a ReferenceError. This
		// reads directly from the same underlying localStorage key
		// ('qol2-settings') instead, self-contained within this
		// section's own scope, matching exactly what the real
		// getQolPref('advancedSearch', true) call does.
		function isAdvancedSearchEnabled() {
			try {
				var p = JSON.parse(localStorage.getItem('qol2-settings') || '{}');
				return ('advancedSearch' in p) ? p.advancedSearch : true;
			} catch (e) { return true; }
		}

		function hideIllegalMonsEnabled() {
			try {
				var p = JSON.parse(localStorage.getItem('qol2-settings') || '{}');
				return ('hideIllegalMons' in p) ? p.hideIllegalMons : false;
			} catch (e) { return false; }
		}

		// Rather than reimplementing Showdown's own format-type/generation
		// detection and the nested, per-format overrideTier table lookup
		// (genuinely intricate - see getTier in battle-dex-search.ts),
		// this calls the live search object's own, already-correctly-
		// configured engine directly, matching exactly what Showdown's
		// own tier column displays for the pokemon currently selected
		// format. Fails open (treats as legal, i.e. doesn't filter it
		// out) if the engine or getTier isn't reachable for any reason -
		// a missed filter is a minor inconvenience, but breaking the
		// whole search over this would not be.
		function isLegalForCurrentFormat(liveSearch, speciesId) {
			try {
				var engine = liveSearch.engine || liveSearch.typedSearch;
				if (!engine || typeof engine.getTier !== 'function') {
					return true;
				}
				var species = win.Dex.species.get(speciesId);
				var tier = engine.getTier(species);
				return ['Illegal', 'Unreleased'].indexOf(tier) === -1;
			} catch (e) {
				return true;
			}
		}

		// Showdown groups result rows under tier-header rows (shape:
		// ['header', 'OU'], ['header', 'Illegal results'], etc, per
		// renderRow's 'header' case). Filtering out illegal pokemon rows
		// only ever removes the pokemon rows themselves - if that
		// leaves a header with nothing grouped underneath it (either
		// the array ends right after it, or another header immediately
		// follows), the now-empty header row is left behind untouched.
		// This strips any header row that isn't immediately followed by
		// at least one real content row.
		function removeOrphanedHeaders(rows) {
			return rows.filter(function (row, i) {
				if (!Array.isArray(row) || row[0] !== 'header') return true;
				var next = rows[i + 1];
				return !!(next && Array.isArray(next) && next[0] !== 'header');
			});
		}

		function tokenize(query) {
			var pattern = /\s*(&&|\|\||!|\(|\)|>=|<=|==|=|>|<|[a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)*)\s*/g;
			var tokens = [];
			var match, lastIndex = 0;
			while ((match = pattern.exec(query)) !== null) {
				if (match.index !== lastIndex) return null;
				tokens.push(match[1]);
				lastIndex = pattern.lastIndex;
			}
			if (lastIndex !== query.length) return null;
			return tokens;
		}

		function parseTokens(tokens) {
			var pos = 0;
			function peek() { return tokens[pos]; }
			function next() { return tokens[pos++]; }
			function parseOr() {
				var left = parseAnd();
				while (peek() === '||') { next(); left = { type: 'or', left: left, right: parseAnd() }; }
				return left;
			}
			function parseAnd() {
				var left = parseNot();
				while (peek() === '&&') { next(); left = { type: 'and', left: left, right: parseNot() }; }
				return left;
			}
			function parseNot() {
				if (peek() === '!') { next(); return { type: 'not', operand: parseNot() }; }
				return parseAtom();
			}
			function parseAtom() {
				if (peek() === '(') {
					next();
					var expr = parseOr();
					if (next() !== ')') throw new Error('mismatched parens');
					return expr;
				}
				var word = next();
				if (word === undefined) throw new Error('unexpected end');
				if (STAT_NAMES.indexOf(word.toLowerCase()) !== -1 && COMPARISON_OPS.indexOf(peek()) !== -1) {
					var op = next();
					var num = parseInt(next(), 10);
					if (isNaN(num)) throw new Error('expected number');
					return { type: 'stat', stat: word.toLowerCase(), op: op, value: num };
				}
				return { type: 'word', value: word };
			}
			var result = parseOr();
			if (pos !== tokens.length) throw new Error('unexpected trailing token');
			return result;
		}

		// Walks the learnset chain through pre-evolutions/battle-only
		// forms/alternate formes (e.g. Charizard's learnset references
		// Charmeleon's, which references Charmander's), matching the
		// core chain-walking Showdown's own source uses. This is a
		// simplified, "can this species learn this move at all"
		// check - it doesn't replicate the full, format-specific
		// generation-letter/tradebacks/egg-move-only nuance the real
		// client's canLearn() does, since the goal here is a general
		// learnset check, not exact per-format legality.
		var learnsetChainCache = {};
		function getLearnsetChain(speciesId) {
			if (learnsetChainCache[speciesId]) return learnsetChainCache[speciesId];
			var table = win.BattleTeambuilderTable;
			var chain = [];
			if (table && table.learnsets) {
				var currentId = speciesId;
				var seen = {};
				while (currentId && !seen[currentId]) {
					seen[currentId] = true;
					if (table.learnsets[currentId]) chain.push(table.learnsets[currentId]);
					var species = win.Dex.species.get(currentId);
					if (!species || !species.exists) break;
					var next = species.battleOnly || species.changesFrom || species.prevo;
					currentId = next ? String(next).toLowerCase().replace(/[^a-z0-9]/g, '') : null;
				}
			}
			learnsetChainCache[speciesId] = chain;
			return chain;
		}

		function canLearnMove(speciesId, moveId) {
			// The chip/results still visibly lagged a beat after the
			// data-cache prewarm because of a second, separate cost: for a
			// term like "fire" that ISN'T a type or ability match,
			// evaluateNode falls through to here for literally every
			// non-matching species in the dex (900+ of them) - and
			// getLearnsetChain() below walks that species' full evolution
			// chain (with its own Dex.species.get() calls) the first time
			// anything checks it against ANY word, cached per-species
			// afterward but cold for virtually the whole dex on a
			// session's first word-based query. Since "fire" was never a
			// real move to begin with, every one of those chain-walks was
			// wasted work. window.BattleMovedex (the same raw move table
			// Showdown's own search reads - confirmed in
			// battle-dex-search.ts) is a plain id lookup, so bailing out
			// here when moveId isn't even a known move skips the
			// expensive chain-walk entirely for type/ability terms (the
			// overwhelming majority of queries), while a genuine move-name
			// term (e.g. "fakeout") still falls through to the real check
			// exactly as before.
			if (!win.BattleMovedex || !(moveId in win.BattleMovedex)) return false;
			var chain = getLearnsetChain(speciesId);
			return chain.some(function (learnset) { return moveId in learnset; });
		}

		function evaluateNode(node, data) {
			switch (node.type) {
				case 'or': return evaluateNode(node.left, data) || evaluateNode(node.right, data);
				case 'and': return evaluateNode(node.left, data) && evaluateNode(node.right, data);
				case 'not': return !evaluateNode(node.operand, data);
				case 'stat':
					var actual = data.baseStats[node.stat];
					switch (node.op) {
						case '>': return actual > node.value;
						case '<': return actual < node.value;
						case '>=': return actual >= node.value;
						case '<=': return actual <= node.value;
						case '==': case '=': return actual === node.value;
					}
					return false;
				case 'word':
					var w = node.value.toLowerCase().replace(/[^a-z0-9]/g, '');
					// "Mega" and "Gmax" are special-cased as form filters
					// rather than treated as literal type/ability/move
					// lookups, since neither is a real type, ability, or
					// move name.
					if (w === 'mega') return data.isMega;
					if (w === 'gmax') return data.isGmax;
					var typeMatch = data.types.some(function (t) { return t.toLowerCase().replace(/[^a-z0-9]/g, '') === w; });
					if (typeMatch) return true;
					var abilityMatch = data.abilities.some(function (a) { return a.toLowerCase().replace(/[^a-z0-9]/g, '') === w; });
					if (abilityMatch) return true;
					// Falls back to checking whether this species can
					// learn a move by this name (e.g. "Fake Out") -
					// only reached when the term didn't match a type
					// or ability, since walking the learnset chain is
					// more work than a simple comparison.
					return canLearnMove(data.id, w);
			}
			return false;
		}

		function looksLikeAdvancedQuery(query) {
			if (/&&|\|\||!/.test(query)) return true;
			if (new RegExp('\\b(' + STAT_NAMES.join('|') + ')\\s*(>=|<=|==|=|>|<)').test(query.toLowerCase())) return true;
			var trimmed = query.trim().toLowerCase();
			if (trimmed === 'mega' || trimmed === 'gmax') return true;
			return false;
		}

		function getAllPokemonData() {
			var dex = win.Dex;
			var pokedex = win.BattlePokedex || {};
			var results = [];
			Object.keys(pokedex).forEach(function (id) {
				try {
					var species = dex.species.get(id);
					if (!species || !species.exists || species.num < 1) return;
					var abilityTable = species.abilities || {};
					var abilities = Object.keys(abilityTable).map(function (k) { return abilityTable[k]; });
					results.push({
						id: id,
						name: species.name,
						types: species.types || [],
						abilities: abilities,
						baseStats: species.baseStats || {},
						isMega: !!species.isMega,
						// Gmax forms are distinct dex entries whose ids
						// consistently end in "gmax" (e.g. "charizardgmax",
						// confirmed directly against the real dex ids),
						// unlike canGigantamax, which instead marks the
						// base form as merely having a Gmax form available.
						isGmax: /gmax$/.test(id),
					});
				} catch (e) {}
			});
			return results;
		}

		var cachedPokemonData = null;
		function getCachedPokemonData() {
			if (!cachedPokemonData) cachedPokemonData = getAllPokemonData();
			return cachedPokemonData;
		}

		// The multi-second pause before a committed search appears traces
		// back to here, not to anything added for the display fix above:
		// Dex.species.get() (battle-dex.ts) constructs a real Species
		// object the FIRST time anything asks for a given id, memoizing it
		// back into window.BattlePokedex itself so every later call for
		// that same id is cheap - but getAllPokemonData() above is the
		// first thing to ever ask for EVERY id in the entire dex (1000+
		// entries, including every alternate forme) all at once, and
		// without this, that one-time construction cost for the whole
		// dex was happening synchronously inside the user's own Enter
		// keypress on their very first advanced search of a session.
		// Pre-warming it here, idly, as soon as Dex/BattlePokedex exist
		// (long before the user has finished typing an actual query),
		// means runSearch() almost always finds cachedPokemonData already
		// populated and returns instantly, the same way it already does
		// for every search after the first.
		function prewarmPokemonDataCache() {
			if (cachedPokemonData) return;
			if (!win.Dex || !win.BattlePokedex) {
				setTimeout(prewarmPokemonDataCache, 500);
				return;
			}
			if (typeof requestIdleCallback === 'function') {
				requestIdleCallback(function () { getCachedPokemonData(); }, { timeout: 5000 });
			} else {
				setTimeout(function () { getCachedPokemonData(); }, 1000);
			}
		}
		prewarmPokemonDataCache();

		// The team-editor context exposes a newer, Preact-based search
		// object as win.editor.search; the standalone dex-browser table
		// (the sortable one with tier headers and stat columns) exposes
		// an older, jQuery-based one directly as win.search. Both are
		// confirmed, deliberate debug exposures in Showdown's own client
		// code - this handles whichever shape is actually present.
		function getLiveSearch() {
			if (win.editor && win.editor.search) {
				return win.editor.search;
			}
			if (win.search) {
				return win.search;
			}
			return null;
		}

		function applyResultsToLiveSearch(liveSearch, matchingRows, query) {
			// Older, jQuery-based Search class: renders directly into a
			// DOM element via resultSet + updateScroll(forceAdd), not a
			// virtual-DOM re-render.
			if (typeof liveSearch.updateScroll === 'function' && 'resultSet' in liveSearch) {
				liveSearch.resultSet = matchingRows;
				liveSearch.q = query;
				liveSearch.renderedIndex = 0;
				liveSearch.renderingDone = false;
				liveSearch.updateScroll(true);
				return;
			}
			// Newer, Preact-based DexSearch class.
			if ('results' in liveSearch) {
				liveSearch.results = matchingRows;
				if (liveSearch.resultsComponent && typeof liveSearch.resultsComponent.forceUpdate === 'function') {
					liveSearch.resultsComponent.forceUpdate();
				} else {
				}
				return;
			}
		}

		// Showdown's own PSSearchResults component (battle-searchresults.tsx)
		// does NOT treat an 'html' row as raw HTML - escapeHTML() runs on it
		// first, and only <em>/<strong> get selectively un-escaped back to
		// real tags afterward. The old client's jQuery-based results view has
		// no such restriction (that's why the chipHtml string below, used
		// for the old client only, has always rendered fine there) - but on
		// the new client, any other tag (our <button>/<i> included) comes
		// back out as literal, visible escaped text, which is exactly the
		// broken "raw HTML" look that got reported. Separately, a flat
		// alphabetical list was never how a *normal* committed search looks
		// there either - native results group matched Pokemon under
		// tier-header bars with a "Sort: Name/Types/..." row on top (see the
		// reference "Psychic" search), none of which a flat ['pokemon', id]
		// list produces.
		//
		// Both are fixed by using the exact same two mechanisms native
		// search itself uses, so a committed advanced query renders
		// pixel-for-pixel like a normal one:
		//  - the filter chip comes from search.filters, a plain data array
		//    PSSearchResults.renderFiltersHTML() reads directly and renders
		//    itself (it's not a row inside results at all - confirmed in
		//    battle-searchresults.tsx). addFilter() only ever accepts its
		//    own hardcoded native filter types (type/move/ability/egggroup/
		//    tier for Pokemon search), so an 'advanced' entry is written to
		//    search.filters directly instead; getSearchDisplayName() falls
		//    back to showing a name verbatim for any type it doesn't
		//    recognize, filter()'s switch likewise just falls through
		//    unmatched (leaving every row visible), and removeFilter() only
		//    ever compares entries with a plain join(':') string-equality
		//    check - so the chip's native x button correctly clears it back
		//    to an unfiltered view with no extra code needed here.
		//  - the tier headers and "Sort:" row come from the live engine's
		//    own baseResults/baseIllegalResults (built by DexSearch.
		//    getResults() in battle-dex-search.ts from a large, per-format
		//    tier/banlist table), narrowed down to just the matched species
		//    with the same adjacent-empty-header collapsing getResults()
		//    itself does - reusing Showdown's real tier data and format
		//    legality instead of re-deriving any of it by hand here.
		function buildTierGroupedRows(engine, matchingIds, includeIllegal) {
			// Lazily compute + cache on the engine itself, exactly mirroring
			// DexSearch.getResults()'s own lazy-init of these two fields, so
			// this stays a one-time cost per format (the same cache
			// Showdown's own rendering would otherwise build and reuse
			// anyway) and so illegalLabel()'s native "Illegal" row
			// annotation (reading engine.illegalReasons) works on our rows
			// exactly like it does on a normal search's.
			if (!engine.baseResults) engine.baseResults = engine.getBaseResults();
			if (!engine.baseIllegalResults) {
				var legalityFilter = {};
				engine.baseResults.forEach(function (result) {
					if (result[0] === engine.searchType) legalityFilter[result[1]] = 1;
				});
				engine.baseIllegalResults = [];
				engine.illegalReasons = {};
				var table = engine.getTable();
				for (var id in table) {
					if (!(id in legalityFilter)) {
						engine.baseIllegalResults.push([engine.searchType, id]);
						engine.illegalReasons[id] = 'Illegal';
					}
				}
			}

			function collapseEmptyHeaders(rows) {
				var out = [];
				rows.forEach(function (row) {
					if (out.length && row[0] === 'header' && out[out.length - 1][0] === 'header') {
						out[out.length - 1] = row;
					} else {
						out.push(row);
					}
				});
				if (out.length && out[out.length - 1][0] === 'header') out.pop();
				return out;
			}

			var legalMatches = collapseEmptyHeaders(engine.baseResults.filter(function (row) {
				return row[0] !== 'pokemon' || matchingIds[row[1]];
			}));

			var rows = [engine.sortRow || ['sortpokemon', '']].concat(legalMatches);

			if (includeIllegal) {
				var illegalMatches = engine.baseIllegalResults.filter(function (row) {
					return matchingIds[row[1]];
				});
				if (illegalMatches.length) {
					rows = rows.concat([['header', 'Illegal results']], illegalMatches);
				}
			}

			return rows;
		}

		function runSearch(inputEl, commitAsFilter) {
			var __t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
			var query = inputEl.value;
			if (!looksLikeAdvancedQuery(query)) {
				return;
			}
			var liveSearch = getLiveSearch();
			if (!liveSearch) {
				return;
			}
			var tokens = tokenize(query);
			if (!tokens) {
				return;
			}
			var tree;
			try {
				tree = parseTokens(tokens);
			} catch (err) {
				return;
			}
			var allMons = getCachedPokemonData();
			var matchingMons = allMons.filter(function (mon) {
				try { return evaluateNode(tree, mon); } catch (e) {
					return false;
				}
			});

			// Old (jQuery) client: Search's own results view has no
			// tier-header/sort-row concept at all - a flat, alphabetical
			// list (with the hand-built chipHtml 'html' row, which that
			// engine renders raw/unescaped) has always been its correct,
			// normal shape, so this path is untouched.
			var isOldClientSearch = typeof liveSearch.updateScroll === 'function' && 'resultSet' in liveSearch;
			if (isOldClientSearch) {
				var oldClientMons = matchingMons;
				if (hideIllegalMonsEnabled()) {
					oldClientMons = oldClientMons.filter(function (mon) { return isLegalForCurrentFormat(liveSearch, mon.id); });
				}
				var oldClientRows = oldClientMons.sort(function (a, b) { return a.name.localeCompare(b.name); })
					.map(function (mon) { return ['pokemon', mon.id]; });
				if (commitAsFilter) {
					// Same 'html' row-type Showdown's own filter chips use
					// (e.g. "Filters: Water x"), so it renders identically -
					// then clear the input, matching how a committed native
					// filter empties the search box.
					var chipHtml = '<p>Filters: <button class="filter">' + query + ' <i class="fa fa-times-circle"></i></button></p>';
					oldClientRows = [['html', chipHtml]].concat(oldClientRows);
					inputEl.value = '';
				}
				applyResultsToLiveSearch(liveSearch, oldClientRows, query);
				return;
			}

			// New (Preact) client: build a results list shaped exactly like
			// a normal native one (see the long comment above
			// buildTierGroupedRows for why) and commit via search.filters
			// instead of a results row.
			var engine = liveSearch.typedSearch;
			if (!engine || typeof engine.getBaseResults !== 'function') {
				return;
			}
			var includeIllegal = !hideIllegalMonsEnabled();
			var matchingIds = {};
			matchingMons.forEach(function (mon) { matchingIds[mon.id] = true; });

			var newClientRows;
			try {
				newClientRows = buildTierGroupedRows(engine, matchingIds, includeIllegal);
			} catch (e) {
				newClientRows = matchingMons.sort(function (a, b) { return a.name.localeCompare(b.name); })
					.map(function (mon) { return ['pokemon', mon.id]; });
			}

			if (commitAsFilter) {
				// Replaced wholesale rather than appended to any
				// pre-existing native filters: this feature's results have
				// never been intersected with other active filters (the
				// whole dex is always what gets matched against), so
				// leaving an old filter chip on screen next to this one
				// would show it as if it were still narrowing the list,
				// when it no longer has any effect on what's actually
				// displayed.
				liveSearch.filters = [['advanced', query]];
				liveSearch.query = '';
				liveSearch.sortCol = null;
				liveSearch.reverseSort = false;
				inputEl.value = '';
				watchForChipAppearing(inputEl, __t0);
			}
			var __tBeforeApply = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
			applyResultsToLiveSearch(liveSearch, newClientRows, query);
			var __tAfterApply = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
		}

		// ─── locating the right input/results-list on either client ───
		// Old client: one single, always-visible input literally named
		// "pokemon" is the only Pokemon search box there is - no separate
		// zoomed mode exists at all.
		//
		// New (Preact) client: that same inline "pokemon" field is only
		// ever a short, inert-looking preview - the instant it's focused
		// (confirmed in battle-team-editor.tsx's openFocusTextbox/
		// changeFocus), the whole set editor swaps into a zoomed
		// "team-focus-editor" view and keyboard focus moves to a
		// SEPARATE, shared search box literally named "value" (the same
		// one the Ability/Item/Move fields also use once *they're*
		// focused instead - there's only ever one at a time). So typing
		// an advanced query on the new client never touches
		// input[name="pokemon"] at all, which is why every listener
		// below that only checked for that name never fired there.
		// editor.innerFocus.type tells us which field is actually being
		// served right now, same signal already used by the click
		// handler further down for liveSearch.typedSearch.searchType.
		function isPokemonSearchBox(el) {
			if (!el || !el.matches) return false;
			if (el.matches('input[name="pokemon"]')) return true;
			if (el.matches('input[name="value"]') && win.editor && win.editor.innerFocus && win.editor.innerFocus.type === 'pokemon') return true;
			return false;
		}

		// Same idea for finding the box to insert a clicked suggestion
		// into (see insertIntoQuery below) - on the new client that's the
		// zoomed-in "value" box when it's genuinely serving Pokemon
		// search, falling back to the old client's literal "pokemon"
		// input otherwise.
		function getActivePokemonSearchInput() {
			if (win.editor && win.editor.innerFocus && win.editor.innerFocus.type === 'pokemon') {
				var valueEl = document.querySelector('input[name="value"]');
				if (valueEl) return valueEl;
			}
			return document.querySelector('input[name="pokemon"]');
		}

		// Confirms a clicked suggestion link actually came from a
		// search-results list, the way liveSearch.el.contains(...) did
		// for the old jQuery Search class. The new DexSearch class has no
		// .el of its own at all (it's a plain data/engine object, not a
		// view - confirmed directly in battle-dex-search.ts), so
		// liveSearch.el.contains(...) was silently false on every single
		// click there, permanently bailing out of this whole handler.
		// PSSearchResults (battle-searchresults.tsx) is what actually
		// renders these links, always inside one of these classes.
		function isSearchResultClick(liveSearch, entryEl) {
			if (liveSearch.el) return liveSearch.el.contains(entryEl);
			return !!entryEl.closest('.set-searchresults, .searchresults, .dexlist');
		}

		// ---- Inserting into the query instead of committing immediately ----
		// Rather than building our own suggestion dropdown, this lets
		// Showdown's own native autocomplete show completely normally -
		// clicking one of its suggestions (type, ability, pokemon, etc,
		// rendered as <a data-entry="type|Water"> within the results
		// area) gets redirected to insert that name into the search box
		// at the current trailing-term position, instead of Showdown's
		// normal behavior of immediately committing it as a filter.
		// Native arrow-key/Tab/Escape navigation within Showdown's own
		// list is left completely untouched, since there's no custom
		// dropdown of ours to navigate anymore.
		function getTrailingTermInfo(fullValue) {
			// The trailing word-run has to accept the exact same shape
			// tokenize()'s own word alternative does
			// ([a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)*, wrapped here in an outer
			// `?` so "nothing typed yet right after an operator" still
			// matches too) - a bare [a-zA-Z0-9]* cannot match a multi-word
			// term like "Fake Out" at all, since the embedded space isn't
			// in that character class. With the old pattern, the moment a
			// second term's own name contained a space, this returned
			// null for every keystroke from that space onward (nothing
			// left to isolate), which made the caller (the keyup handler
			// below) block native autocomplete entirely instead of
			// isolating-and-restoring it - so the suggestion list just
			// froze at whatever it last showed and never caught up to
			// the new term, exactly like the term after the separator
			// wasn't being typed at all. tokenize()/parseTokens()/
			// evaluateNode() never had this bug - a committed search
			// (Enter) already matched both terms correctly - this only
			// ever broke the live, uncommitted preview and the
			// click-a-suggestion-to-insert path (insertIntoQuery), both
			// of which call this same function.
			var match = /(?:&&|\|\||\(|^)(\s*)(!?)(\s*)((?:[a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)*)?)$/.exec(fullValue);
			if (!match) return null;
			return { partial: match[4], matchStart: match.index + match[0].length - match[4].length };
		}

		function replaceTrailingTerm(fullValue, info, newWord) {
			return fullValue.slice(0, info.matchStart) + newWord;
		}

		function insertIntoQuery(inputEl, name) {
			var info = getTrailingTermInfo(inputEl.value) || { matchStart: inputEl.value.length };
			inputEl.value = replaceTrailingTerm(inputEl.value, info, name);
			inputEl.focus();
		}

		document.addEventListener('click', function (e) {
			if (!isAdvancedSearchEnabled()) return;
			var entryEl = e.target.closest ? e.target.closest('a[data-entry]') : null;
			if (!entryEl) return;
			var liveSearch = getLiveSearch();
			if (!liveSearch || !isSearchResultClick(liveSearch, entryEl)) return;
			var inputEl = getActivePokemonSearchInput();
			if (!inputEl) return;
			// win.search is a single, shared global that Showdown
			// reassigns whenever a different search-powered field
			// (Ability, Moves, Item) gets activated - without checking
			// that this specific live search instance is genuinely tied
			// to the Pokemon-name box (via its own $inputEl), clicking a
			// suggestion in one of those other fields was incorrectly
			// redirected into the Pokemon search box instead of that
			// field's own native behavior.
			var boundInputEl = liveSearch.$inputEl && liveSearch.$inputEl[0];
			var isWrongField;
			if (liveSearch.$inputEl) {
				// Old jQuery Search class (win.search): compare against
				// the specific input element it's bound to, as above.
				isWrongField = (boundInputEl !== inputEl);
			} else if (liveSearch.typedSearch) {
				// New/shared DexSearch engine (win.editor.search, used by
				// the Preact team editor): it has no $inputEl to compare
				// against at all - each field (Pokemon/Ability/Item/Move)
				// is instead its own real <input name="..."> element, and
				// the search engine tracks which one it's currently
				// serving via typedSearch.searchType directly. Same
				// shared-instance ambiguity as the jQuery case, just a
				// different signal to read it from.
				isWrongField = (liveSearch.typedSearch.searchType !== 'pokemon');
			} else {
				// Unrecognized shape - matches the old behavior of never
				// having blocked on this check before it existed: don't
				// block, just let the click through as a query insertion.
				isWrongField = false;
			}
			if (isWrongField) {
				return;
			}
			var entryParts = entryEl.dataset.entry.split('|');
			// A specific Pokémon name is a selection (add this mon),
			// not a reusable filter condition like a type or ability -
			// clicking one should use Showdown's own default behavior
			// completely untouched, not get inserted into the query.
			if (entryParts[0] === 'pokemon') {
				return;
			}
			var displayName = entryParts[1];
			if (!displayName) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			insertIntoQuery(inputEl, displayName);
		}, true);

		// Once the query contains our syntax, Showdown's own native
		// handling for this input is blocked/redirected (via
		// stopImmediatePropagation in the capturing phase) rather than
		// left running alongside ours - letting both run and betting on
		// timing to make ours win is exactly what caused the earlier
		// event-phase and stopPropagation bugs. Normal typing (before any
		// special syntax appears) is completely unaffected either way.
		document.addEventListener('input', function (e) {
			if (!isAdvancedSearchEnabled()) return;
			var el = e.target;
			if (!isPokemonSearchBox(el)) return;
			var isAdvanced = looksLikeAdvancedQuery(el.value);
			if (!isAdvanced) return;

			// Old client's own live refresh comes from the separate
			// keyup-based chartKeyUp handler further down (isolate/
			// restore happens there instead, on the literal "pokemon"
			// box only) - blocking 'input' outright here just silences a
			// second, redundant native search-on-input path alongside
			// it for that client, and has always worked correctly left
			// exactly as-is.
			if (el.matches('input[name="pokemon"]')) {
				e.stopImmediatePropagation();
				return;
			}

			// New (Preact) client's live refresh runs ENTIRELY off this
			// same 'input' event - TeamEditor.updateSearch, wired via
			// onInput={this.updateSearch} in battle-team-editor.tsx,
			// reads ev.currentTarget.value directly and has no competing
			// keyup-driven path the way old client does. Unconditionally
			// blocking 'input' here (as this used to do for both clients
			// alike) left the new client's search results frozen at
			// whatever they last showed the instant the query first
			// became "advanced" - not just while a space-containing
			// second term was present, since nothing ever isolated or
			// restored anything on this path before. The <input> itself
			// has no Preact value= binding (confirmed in the source -
			// it's uncontrolled), so, exactly like the old client's
			// keyup fix below, it's safe to temporarily swap in just the
			// trailing term being typed, let this same event carry on
			// (no stopImmediatePropagation in this branch) so Preact's
			// own updateSearch/search.find runs and renders against that
			// term alone, then restore the full expression right after.
			var info = getTrailingTermInfo(el.value);
			if (!info) {
				e.stopImmediatePropagation();
				return;
			}
			var fullValue = el.value;
			el.value = info.partial;
			setTimeout(function () {
				el.value = fullValue;
			}, 0);
		}, true);

		// On Enter: commits the current expression as a persistent
		// filter chip. Only intercepts Enter specifically - Showdown's
		// own native arrow-key/Tab/Escape navigation through its own
		// autocomplete list is left completely untouched, since we no
		// longer have a custom dropdown of our own to navigate.
		//
		// This runs on keydown, not keyup: Showdown's own native
		// Enter-handling clears the input (.val('').select()) during
		// its own keydown phase, before a keyup-based listener would
		// ever get a chance to read the value.
		var justHandledByUs = false;
		document.addEventListener('keydown', function (e) {
			if (!isAdvancedSearchEnabled()) return;
			if (e.key !== 'Enter') return;
			var el = e.target;
			if (!isPokemonSearchBox(el)) return;
			var isAdvanced = looksLikeAdvancedQuery(el.value);
			if (!isAdvanced) {
				return;
			}
			e.preventDefault();
			e.stopImmediatePropagation();
			justHandledByUs = true;
			runSearch(el, true);
		}, true);

		// Showdown has a separate native keyup handler (chartKeyUp) that
		// re-runs its own search based on the input's raw current value
		// on every keyup - since that native search can only ever
		// meaningfully operate on a single, literal term (it has no
		// concept of boolean expressions), letting it see the whole
		// compound string once our syntax is present fuzzy-matches the
		// wrong thing (e.g. "Water Compaction" while typing
		// "water&&competitive"). Rather than blocking it outright
		// (which would lose native autocomplete for every term after
		// the first), this temporarily isolates just the current,
		// trailing term in the input's value right before Showdown's
		// own handler reads it - letting its native autocomplete
		// correctly run against just that term - then restores the
		// full, visible expression right after, once native handling
		// has had its turn (via setTimeout, so it runs after the
		// current, synchronous event-dispatch cycle completes).
		//
		// Deliberately still old-client-only (checks the literal
		// "pokemon" name directly, not isPokemonSearchBox): the native
		// behavior this works around - Showdown re-searching on every
		// keyup via chartKeyUp - doesn't exist on the new client at all,
		// which instead re-searches on the "value" box's own input event
		// (already fully blocked by the input listener above once
		// advanced syntax appears). Nothing on the new client ever reads
		// mid-keystroke, so there's nothing here for it to isolate
		// against; matching it would just be a harmless no-op.
		document.addEventListener('keyup', function (e) {
			if (!isAdvancedSearchEnabled()) return;
			var el = e.target;
			if (!el.matches || !el.matches('input[name="pokemon"]')) return;

			if (justHandledByUs) {
				justHandledByUs = false;
				e.preventDefault();
				e.stopImmediatePropagation();
				return;
			}

			var isAdvanced = looksLikeAdvancedQuery(el.value);
			if (!isAdvanced) return; // normal, single-term typing - Showdown's native autocomplete already works correctly as-is

			var info = getTrailingTermInfo(el.value);
			if (!info) {
				// Nothing isolatable right now (e.g. right after an
				// operator with nothing typed yet) - block native
				// handling entirely for this instant, since there's no
				// meaningful term to autocomplete against anyway.
				e.stopImmediatePropagation();
				return;
			}

			var fullValue = el.value;
			el.value = info.partial;
			setTimeout(function () {
				el.value = fullValue;
			}, 0);
		}, true);

		// Independent of the advanced-search syntax entirely: a plain,
		// single-term query (e.g. just "drizzle") never enters our own
		// runSearch pipeline at all, since Showdown's native search
		// handles it completely on its own - so the hideIllegalMons
		// filtering integrated into runSearch never gets a chance to
		// apply there. This runs on every keyup regardless, and - only
		// when the setting is on - post-filters whatever results are
		// currently showing (native or ours) after they've been
		// computed, via the same setTimeout-after-current-cycle
		// approach used above.
		document.addEventListener('keyup', function (e) {
			if (!hideIllegalMonsEnabled()) return;
			var el = e.target;
			if (!isPokemonSearchBox(el)) return;
			setTimeout(function () {
				var liveSearch = getLiveSearch();
				if (!liveSearch) return;
				if (typeof liveSearch.updateScroll === 'function' && Array.isArray(liveSearch.resultSet)) {
					var rows = liveSearch.resultSet;
					var filtered = removeOrphanedHeaders(rows.filter(function (row) {
						return !Array.isArray(row) || row[0] !== 'pokemon' || isLegalForCurrentFormat(liveSearch, row[1]);
					}));
					if (filtered.length !== rows.length) {
						liveSearch.resultSet = filtered;
						liveSearch.renderedIndex = 0;
						liveSearch.renderingDone = false;
						liveSearch.updateScroll(true);
					}
					return;
				}
				if (Array.isArray(liveSearch.results)) {
					var rows2 = liveSearch.results;
					var filtered2 = removeOrphanedHeaders(rows2.filter(function (row) {
						return !Array.isArray(row) || row[0] !== 'pokemon' || isLegalForCurrentFormat(liveSearch, row[1]);
					}));
					if (filtered2.length !== rows2.length) {
						liveSearch.results = filtered2;
						if (liveSearch.resultsComponent && typeof liveSearch.resultsComponent.forceUpdate === 'function') {
							liveSearch.resultsComponent.forceUpdate();
						}
					}
				}
			}, 0);
		}, true);
	})();

	// ============================================================
	// TEAMBUILDER SET-PANEL BUTTON CLEANUP
	// ============================================================
	// New (Preact) client note: this whole feature is old-client-only by
	// nature, not just by implementation. The new client's per-Pokemon
	// set editor (battle-team-editor.tsx) has no .setmenu/copySet-style
	// action row at all - copy/delete/move live at the per-team-member
	// level there (editor.copySet/deleteSet/moveSet, its own separate
	// buttons unrelated to these names) and import/export is a whole-team
	// action on the overview screen instead. There's nothing to hide on
	// the new client, so the lookup below (which is entirely
	// app.rooms['teambuilder']/Storage-based) already no-ops there safely
	// without needing a client check of its own.
	//
	// Hides Copy, Import/Export, Move, and Delete specifically on the
	// same set panel where the Teambuilder quick-links feature (further
	// below, a separate section/scope) adds its Serebii/MunchStats/NCP
	// buttons - not on every .setmenu on the page, since Teambuilder can
	// show several at once (one per team member) and only this one
	// specific one should be affected. Deliberately self-contained
	// (duplicating the same element-finding approach patchTeambuilderLinks
	// uses) rather than calling into that other section's function,
	// since sections here are genuinely separate scopes - a function
	// defined in one is not reachable from another.
	// "Stats" on this panel is a <label>, not a button, so it's
	// untouched either way.
	//
	// Uses unsafeWindow (not plain window) since userscripts run in an
	// isolated JS context - plain window here is not the same object
	// the page's own scripts (including Showdown's app) set properties
	// on, confirmed directly against the live environment.
	//
	// A MutationObserver re-applies this instantly whenever Showdown
	// re-renders the panel, rather than polling on a fixed interval -
	// polling left a brief flash of the buttons visible each time you
	// switched between team members, confirmed directly in testing.
	(function () {
		var observedEl = null;
		var observer = null;

		// Self-contained (matching the same reasoning as isAdvancedSearchEnabled
		// elsewhere) since getQolPref lives in a different section's own,
		// separate scope and genuinely isn't reachable from here.
		function isQuickLinksEnabled() {
			try {
				var p = JSON.parse(localStorage.getItem('qol2-settings') || '{}');
				return ('tbquicklinks' in p) ? p.tbquicklinks : false;
			} catch (e) { return false; }
		}

		function hideSetMenuButtons() {
			var tbRoom = unsafeWindow.app && unsafeWindow.app.rooms && unsafeWindow.app.rooms['teambuilder'];
			if (!tbRoom) return;
			var el = tbRoom.el || (tbRoom.$el && tbRoom.$el[0]);
			if (!el) return;

			if (el !== observedEl) {
				if (observer) observer.disconnect();
				observedEl = el;
				observer = new MutationObserver(hideSetMenuButtons);
				observer.observe(el, { childList: true, subtree: true });
			}

			// Matches the same guard patchTeambuilderLinks uses: only
			// once a specific Pokemon is expanded into full detail (not
			// the compact, all-members-stacked overview), since that's
			// the only context quick-links itself ever activates in -
			// confirmed directly against the live environment that the
			// two are genuinely different rendering contexts.
			if (!tbRoom.curSet || !tbRoom.curSet.species) return;

			var menus = el.querySelectorAll('.setmenu');
			var menu = null;
			for (var i = 0; i < menus.length; i++) {
				if (menus[i].querySelector('button[name="copySet"]')) { menu = menus[i]; break; }
			}
			if (!menu) return;

			// Only hide these native buttons when quick-links are
			// themselves enabled - otherwise nothing is taking their
			// place, so hiding them would just leave an empty gap with
			// no useful controls at all. Actively restores them (not
			// just skips hiding) so turning the setting off mid-session
			// immediately brings back whatever was already hidden.
			var quickLinksOn = isQuickLinksEnabled();
			['copySet', 'importSet', 'moveSet', 'deleteSet'].forEach(function (name) {
				var btn = menu.querySelector('button[name="' + name + '"]');
				if (!btn) return;
				if (quickLinksOn) {
					if (btn.style.display !== 'none') btn.style.display = 'none';
				} else {
					if (btn.style.display === 'none') btn.style.display = '';
				}
			});
		}

		// Retries until the teambuilder room exists at all (e.g. before
		// Teambuilder has ever been opened) - once found, the observer
		// attached above takes over for instant reaction to every
		// subsequent re-render, so this interval no longer needs to be
		// frequent.
		setInterval(hideSetMenuButtons, 1000);
		hideSetMenuButtons();
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

				var musicTracksEmpty = MUSIC_TRACKS.length === 0;
				$lastHr.before($([
					'<hr /><p class="qol2-section-header" id="qol2-music-header"><strong>Music</strong><span class="qol2-section-chevron">&#9660;</span></p>',
					'<div class="qol2-section-body" id="qol2-music-body">',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-showdownbgm"' + (musicTracksEmpty || getQolPref('includeShowdownBgm', true) ? ' checked' : '') + (musicTracksEmpty ? ' disabled' : '') + ' /> Include Showdown\'s default battle music</label></p>',
					musicTracksEmpty ? '<p style="color:#777;font-size:8pt;margin:2px 0 4px;">Can\'t be turned off while MUSIC_TRACKS is empty - there\'d be nothing else to play.</p>' : '',
					'</div>',
				].join('')));

				var $muH = $el.find('#qol2-music-header'), $muB = $el.find('#qol2-music-body'), $muC = $muH.find('.qol2-section-chevron');
				if (getQolPref('section-music', false)) { $muB.addClass('collapsed'); $muC.html('&#9654;'); }
				$muH.on('click', function () { var c = $muB.hasClass('collapsed'); $muB.toggleClass('collapsed', !c); $muC.html(c ? '&#9660;' : '&#9654;'); setQolPref('section-music', !c); });
				$el.find('input[name="qol2-showdownbgm"]').on('change', function () {
					setQolPref('includeShowdownBgm', this.checked);
				});

				$lastHr.before($([
					'<hr /><p class="qol2-section-header" id="qol2-tb-header"><strong>Teambuilder</strong><span class="qol2-section-chevron">&#9660;</span></p>',
					'<div class="qol2-section-body" id="qol2-tb-body">',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-tbquicklinks"' + (getQolPref('tbquicklinks', false) ? ' checked' : '') + ' /> Show Pokémon quick-links in Teambuilder</label></p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-otsnature"' + (getQolPref('otsnature', true) ? ' checked' : '') + ' /> Include Nature in OTS Pokepaste export</label></p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-advsearch"' + (getQolPref('advancedSearch', true) ? ' checked' : '') + ' /> Use advanced Teambuilder search (boolean logic, stat filters, Mega/Gmax)</label></p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-hideillegal"' + (getQolPref('hideIllegalMons', false) ? ' checked' : '') + ' /> Hide Pokémon illegal in the current format from advanced search results</label></p>',
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
				$el.find('input[name="qol2-advsearch"]').on('change', function () {
					setQolPref('advancedSearch', this.checked);
				});
				$el.find('input[name="qol2-hideillegal"]').on('change', function () {
					setQolPref('hideIllegalMons', this.checked);
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

		// ─── OptionsPanel patch (new client) ───
		// The new Preact client's Options popup is a different component
		// entirely (OptionsPanel in panel-popups.tsx), registered via
		// PS.addRoomType() - which is how it ends up reachable here as
		// win.PS.roomTypes['options'], even though it's never assigned to
		// a window global of its own. There's no win.OptionsPopup on this
		// client, and the whole startObservingBattle() bootstrap above is
		// gated behind win.app, so none of this ever ran there - that's
		// why the custom sections just didn't appear.
		//
		// Preact fully regenerates this panel's DOM from render() on every
		// update, but its diffing only ever touches nodes it created
		// itself - plain DOM nodes inserted by us are invisible to it and
		// never get cleaned up. That's the opposite problem from the
		// jQuery popup above (whose update() replaces everything, so it
		// mostly doesn't need to worry about leftovers): here we have to
		// explicitly guard against inserting a second copy on every
		// re-render ourselves.
		function ensureQolSettingsStyle() {
			if (!document.getElementById('qol2-settings-style')) {
				var st = document.createElement('style'); st.id = 'qol2-settings-style';
				st.textContent = '.qol2-section-header{cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between;padding-right:4px;}.qol2-section-header:hover strong{text-decoration:underline;}.qol2-section-chevron{font-size:10px;color:#888;}.qol2-section-body.collapsed{display:none;}' +
					// Native new-client section headers (General/Appearance/Chat)
					// are plain <h3> text, not <p><strong>, so they can't share the
					// chevron-span markup the custom sections above use (appending
					// a real element inside an <h3> that Preact still thinks has
					// only a single text child is exactly the kind of DOM mutation
					// that's risky to make stick - see wireNativeSectionCollapse).
					// A CSS-only ::after chevron sidesteps that: it never touches
					// the h3's own children, so there's nothing for Preact's
					// diffing to disagree with.
					'.qol2-native-section-header{cursor:pointer;user-select:none;}.qol2-native-section-header:hover{text-decoration:underline;}.qol2-native-section-header::after{content:\'\\25BC\';display:inline-block;margin-left:6px;font-size:10px;color:#888;text-decoration:none;}.qol2-native-section-header.collapsed::after{content:\'\\25B6\';}';
				document.head.appendChild(st);
			}
		}

		// Collapse state is keyed off the section's title, same as the old
		// client's own version does (it reads the rendered <strong> text) -
		// matching that exactly means a section collapsed on one client
		// stays collapsed on the other, since both read/write the same
		// qol2-settings localStorage key.
		function qolSectionPrefKey(title) { return 'section-' + title.toLowerCase().replace(/\s+/g, '-'); }

		function buildQolSectionHTML(id, title, bodyHtml) {
			var collapsed = getQolPref(qolSectionPrefKey(title), false);
			return '<hr /><p class="qol2-section-header" id="qol2-' + id + '-header"><strong>' + title + '</strong><span class="qol2-section-chevron">' + (collapsed ? '&#9654;' : '&#9660;') + '</span></p>' +
				'<div class="qol2-section-body' + (collapsed ? ' collapsed' : '') + '" id="qol2-' + id + '-body">' + bodyHtml + '</div>';
		}

		function wireQolSectionToggle(root, id, title) {
			var header = root.querySelector('#qol2-' + id + '-header');
			var body = root.querySelector('#qol2-' + id + '-body');
			if (!header || !body || header._qolWired) return;
			header._qolWired = true;
			var sk = qolSectionPrefKey(title);
			var chevron = header.querySelector('.qol2-section-chevron');
			header.addEventListener('click', function () {
				var isCollapsed = body.classList.contains('collapsed');
				body.classList.toggle('collapsed', !isCollapsed);
				if (chevron) chevron.innerHTML = isCollapsed ? '&#9660;' : '&#9654;';
				setQolPref(sk, !isCollapsed);
			});
		}

		// Makes the NATIVE sections (General/Appearance/Chat) collapsible too,
		// matching the old client's own patchOptionsPopup - which doesn't just
		// add custom sections, it wraps EVERY <p><strong> header it finds,
		// native ones included. The new client renders its native headers as
		// bare <h3>text</h3> rather than <p><strong>, so this needs its own,
		// more careful version: unlike the custom sections (which are built
		// from scratch as plain HTML, so wrapping them in a real container is
		// risk-free), these <p> elements between one <h3> and the next <hr>
		// are nodes Preact itself created and is still tracking. Moving them
		// into a new wrapper div would reparent nodes out from under Preact's
		// own bookkeeping, and the next re-render could try to move them back
		// (or worse) since Preact diffs by comparing its old vnode tree to the
		// new one, not by reading what's actually in the live DOM.
		// So instead of moving anything, this only ever does two kinds of
		// change Preact's diffing is guaranteed to leave alone because they're
		// never part of what it compares old-vnode-props to new-vnode-props
		// for on these elements: adding a CSS class (these elements have no
		// native class prop of their own) and setting inline style.display
		// directly (same - none of them carry a native style prop either).
		// Both survive indefinitely because Preact only ever re-applies a DOM
		// prop when its OWN tracked value for it changed between renders -
		// since it never set class/style here to begin with, it has nothing
		// to compare and never touches what we've added.
		function wireNativeSectionCollapse(root) {
			var headers = root.querySelectorAll('h3');
			for (var i = 0; i < headers.length; i++) {
				// Delegated to its own function (rather than a closure built
				// directly in this loop body) specifically so each header's
				// click handler closes over its OWN members/sk - a `var`
				// declared inside a for-loop body is scoped to the whole
				// function, not per-iteration, so three closures built
				// directly in this loop would all end up sharing a single
				// `members`/`sk` (whatever the last iteration left them as).
				// That would make every header's chevron flip independently
				// while all of them actually hid/showed and persisted
				// whichever section was wired last.
				wireOneNativeHeader(headers[i]);
			}
		}

		function wireOneNativeHeader(h3) {
			if (h3.classList.contains('qol2-native-section-header')) return;
			var title = h3.textContent.trim();
			if (!title) return;
			var members = [];
			var node = h3.nextElementSibling;
			while (node && node.tagName !== 'HR') { members.push(node); node = node.nextElementSibling; }
			if (!members.length) return;
			h3.classList.add('qol2-native-section-header');
			var sk = qolSectionPrefKey(title);
			if (getQolPref(sk, false)) {
				h3.classList.add('collapsed');
				members.forEach(function (m) { m.style.display = 'none'; });
			}
			h3.addEventListener('click', function () {
				var isCollapsed = h3.classList.toggle('collapsed');
				members.forEach(function (m) { m.style.display = isCollapsed ? 'none' : ''; });
				setQolPref(sk, isCollapsed);
			});
		}

		function injectQolOptionsNewClient(panel) {
			var root = panel.base;
			if (!root || root.querySelector('#qol2-newclient-sections')) return;
			ensureQolSettingsStyle();

			// The old/new client switcher ("This is the new client." / Default
			// dropdown / "Use old client temporarily") is Showdown's own
			// native <div class="construction"> block (confirmed directly
			// from panel-popups.tsx's OptionsPanel), sitting between the
			// General and Appearance <h3> sections with no header of its own -
			// which is exactly why wireNativeSectionCollapse below always
			// skips it (it only ever looks at <h3> elements, and nothing
			// precedes this one). Giving it a synthetic <h3> right before it
			// is all that's needed to make it collapsible by that exact same
			// mechanism: wireNativeSectionCollapse's very next pass over the
			// DOM iterates EVERY <h3> it finds regardless of who created it,
			// so it picks this new one up, walks forward, and finds the
			// construction div as its one and only member (the next element
			// is the <hr> leading into Appearance, exactly where that walk is
			// supposed to stop) - no new collapse logic needed at all.
			var constructionDiv = root.querySelector('.construction');
			if (constructionDiv && !root.querySelector('#qol2-client-switcher-header')) {
				constructionDiv.insertAdjacentHTML('beforebegin', '<h3 id="qol2-client-switcher-header">Client</h3>');
			}
			wireNativeSectionCollapse(root);

			var otsVal = getQolPref('ots', 'ask');
			var musicTracksEmpty = MUSIC_TRACKS.length === 0;
			var modeVal = (battleMode === 'active' || battleMode === 'paused') ? 'battle' : (tbMode ? 'teambuilder' : 'default');

			var html = '<div id="qol2-newclient-sections">' +
				buildQolSectionHTML('battle', 'Battle', [
					'<p><label class="optlabel">Open Team Sheets:<select name="qol2-ots" class="select">',
					'<option value="ask"' + (otsVal === 'ask' ? ' selected' : '') + '>Ask me each time</option>',
					'<option value="accept"' + (otsVal === 'accept' ? ' selected' : '') + '>Always accept</option>',
					'<option value="reject"' + (otsVal === 'reject' ? ' selected' : '') + '>Always reject</option>',
					'</select></label></p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-autocopyreplay"' + (getQolPref('autocopyreplay', false) ? ' checked' : '') + ' /> Auto-copy replay link when battle ends</label></p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-autoclosebattle"' + (getQolPref('autoclosebattle', false) ? ' checked' : '') + ' /> Auto-close battle after replay link is copied</label></p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-closeforfeit"' + (getQolPref('closeforfeit', true) ? ' checked' : '') + ' /> Close battle after forfeiting</label></p>',
				].join('')) +
				buildQolSectionHTML('music', 'Music', [
					'<p><label class="checkbox"><input type="checkbox" name="qol2-showdownbgm"' + (musicTracksEmpty || getQolPref('includeShowdownBgm', true) ? ' checked' : '') + (musicTracksEmpty ? ' disabled' : '') + ' /> Include Showdown\'s default battle music</label></p>',
					musicTracksEmpty ? '<p style="color:#777;font-size:8pt;margin:2px 0 4px;">Can\'t be turned off while MUSIC_TRACKS is empty - there\'d be nothing else to play.</p>' : '',
				].join('')) +
				buildQolSectionHTML('tb', 'Teambuilder', [
					'<p><label class="checkbox"><input type="checkbox" name="qol2-tbquicklinks"' + (getQolPref('tbquicklinks', false) ? ' checked' : '') + ' /> Show Pokémon quick-links in Teambuilder</label></p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-otsnature"' + (getQolPref('otsnature', true) ? ' checked' : '') + ' /> Include Nature in OTS Pokepaste export</label></p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-advsearch"' + (getQolPref('advancedSearch', true) ? ' checked' : '') + ' /> Use advanced Teambuilder search (boolean logic, stat filters, Mega/Gmax)</label></p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-hideillegal"' + (getQolPref('hideIllegalMons', false) ? ' checked' : '') + ' /> Hide Pokémon illegal in the current format from advanced search results</label></p>',
				].join('')) +
				buildQolSectionHTML('modes', 'Modes', [
					'<p><label class="checkbox"><input type="radio" name="qol2-mode" value="default"' + (modeVal === 'default' ? ' checked' : '') + ' /> <strong>Default Mode</strong></label></p>',
					'<p><label class="checkbox"><input type="radio" name="qol2-mode" value="battle"' + (modeVal === 'battle' ? ' checked' : '') + ' /> <strong>Battle Mode</strong></label></p>',
					'<div id="qol2-bm-opts-new" style="margin-left:16px;' + (modeVal === 'battle' ? '' : 'display:none;') + '">',
					'<p style="color:#777;font-size:8pt;margin:2px 0 4px;">Auto-searches your current format. Replays are copied and saved for export.</p>',
					'<p><button type="button" class="button" name="qol2-bm-status-new" style="font-size:8pt;">' + (battleMode === 'active' ? '<i class="fa fa-pause"></i> Pause' : '<i class="fa fa-play"></i> Resume') + '</button></p>',
					'</div>',
					'<p><label class="checkbox"><input type="radio" name="qol2-mode" value="teambuilder"' + (modeVal === 'teambuilder' ? ' checked' : '') + ' /> <strong>Teambuilder Mode</strong></label></p>',
					'<div id="qol2-tb-opts-new" style="margin-left:16px;' + (modeVal === 'teambuilder' ? '' : 'display:none;') + '">',
					'<p style="color:#777;font-size:8pt;margin:2px 0 4px;">Opens Teambuilder, MunchStats, and the Nerd of Now damage calc.</p>',
					'<p><label class="checkbox"><input type="checkbox" name="qol2-tb-away"' + (getQolPref('tb-away', false) ? ' checked' : '') + ' /> Set status to Away on start</label></p>',
					'</div>',
				].join('')) +
				'</div>';

			// Mirrors the old client's placement: just before the LAST
			// <hr>, i.e. between the native options and the final
			// login/logout button bar.
			var hrs = root.querySelectorAll('hr');
			var lastHr = hrs.length ? hrs[hrs.length - 1] : null;
			if (lastHr) lastHr.insertAdjacentHTML('beforebegin', html);
			else root.insertAdjacentHTML('beforeend', html);

			// The new client's modal popups (OptionsPanel included) have
			// no close button of their own - they're dismissed via the
			// backdrop or Escape - so add the same "X" the old client
			// gets. data-cmd is Showdown's own declarative command
			// attribute, handled by delegated click listening higher up
			// the tree, so a plain button carrying it works the same
			// whether Preact or innerHTML created it.
			if (!root.querySelector('.qol2-close-btn')) {
				root.insertAdjacentHTML('afterbegin', '<div style="text-align:right;margin-bottom:2px;"><button name="close" class="closebutton qol2-close-btn" data-cmd="/close" tabindex="-1" aria-label="Close"><i class="fa fa-times-circle"></i></button></div>');
			}

			[['battle', 'Battle'], ['music', 'Music'], ['tb', 'Teambuilder'], ['modes', 'Modes']].forEach(function (pair) {
				wireQolSectionToggle(root, pair[0], pair[1]);
			});

			var q = function (sel) { return root.querySelector(sel); };
			var otsSelect = q('select[name="qol2-ots"]');
			if (otsSelect) otsSelect.addEventListener('change', function () { setQolPref('ots', this.value); });
			var autocopyEl = q('input[name="qol2-autocopyreplay"]');
			if (autocopyEl) autocopyEl.addEventListener('change', function () { setQolPref('autocopyreplay', this.checked); });
			var autocloseEl = q('input[name="qol2-autoclosebattle"]');
			if (autocloseEl) autocloseEl.addEventListener('change', function () {
				setQolPref('autoclosebattle', this.checked);
				if (this.checked) { setQolPref('closeforfeit', false); var cf = q('input[name="qol2-closeforfeit"]'); if (cf) cf.checked = false; }
			});
			var closeforfeitEl = q('input[name="qol2-closeforfeit"]');
			if (closeforfeitEl) closeforfeitEl.addEventListener('change', function () {
				setQolPref('closeforfeit', this.checked);
				if (this.checked) { setQolPref('autoclosebattle', false); var ac = q('input[name="qol2-autoclosebattle"]'); if (ac) ac.checked = false; }
			});
			var bgmEl = q('input[name="qol2-showdownbgm"]');
			if (bgmEl) bgmEl.addEventListener('change', function () { setQolPref('includeShowdownBgm', this.checked); });
			var qlEl = q('input[name="qol2-tbquicklinks"]');
			if (qlEl) qlEl.addEventListener('change', function () { setQolPref('tbquicklinks', this.checked); });
			var natureEl = q('input[name="qol2-otsnature"]');
			if (natureEl) natureEl.addEventListener('change', function () { setQolPref('otsnature', this.checked); });
			var advEl = q('input[name="qol2-advsearch"]');
			if (advEl) advEl.addEventListener('change', function () { setQolPref('advancedSearch', this.checked); });
			var hideEl = q('input[name="qol2-hideillegal"]');
			if (hideEl) hideEl.addEventListener('change', function () { setQolPref('hideIllegalMons', this.checked); });

			// Real radio inputs (rather than old client's three independent
			// checkboxes) so mutual exclusivity is enforced by the browser
			// itself: this section only ever renders once (the idempotency
			// guard at the top of this function), so there's no re-render to
			// recompute which one should be checked after a change the way
			// old client's own patchOptionsPopup does - sibling state has to
			// be kept in sync by hand instead, exactly like the
			// autoclosebattle/closeforfeit pair above already does.
			var modeRadios = root.querySelectorAll('input[name="qol2-mode"]');
			for (var mi = 0; mi < modeRadios.length; mi++) {
				modeRadios[mi].addEventListener('change', function () {
					if (!this.checked) return;
					if (this.value === 'default') {
						if (battleMode !== 'off') bmEndNewClient();
						if (tbMode) tbEndNewClient();
					} else if (this.value === 'battle') {
						bmStartNewClient();
					} else if (this.value === 'teambuilder') {
						tbStartNewClient();
					}
					// bmStartNewClient() can fail synchronously (the team-validation
					// guard in bmTrySearchNewClient calling bmEndNewClient() right
					// back) when the current format needs a team and none is
					// available - reflect what ACTUALLY ended up running rather than
					// blindly trusting which radio was clicked, so the panel doesn't
					// keep showing "Battle Mode is running" after a failed start.
					var curModeVal = (battleMode === 'active' || battleMode === 'paused') ? 'battle' : (tbMode ? 'teambuilder' : 'default');
					if (curModeVal !== this.value) {
						var fallbackRadio = q('input[name="qol2-mode"][value="' + curModeVal + '"]');
						if (fallbackRadio) fallbackRadio.checked = true;
					}
					var bmOptsDiv = q('#qol2-bm-opts-new');
					var tbOptsDiv = q('#qol2-tb-opts-new');
					var statusBtn = q('button[name="qol2-bm-status-new"]');
					if (bmOptsDiv) bmOptsDiv.style.display = (curModeVal === 'battle') ? '' : 'none';
					if (tbOptsDiv) tbOptsDiv.style.display = (curModeVal === 'teambuilder') ? '' : 'none';
					if (statusBtn) statusBtn.innerHTML = '<i class="fa fa-pause"></i> Pause';
				});
			}
			var bmStatusBtnNew = q('button[name="qol2-bm-status-new"]');
			if (bmStatusBtnNew) bmStatusBtnNew.addEventListener('mousedown', function (e) {
				e.preventDefault();
				if (battleMode === 'active') {
					bmPauseNewClient();
					this.innerHTML = '<i class="fa fa-play"></i> Resume';
				} else if (battleMode === 'paused') {
					battleMode = 'active'; renderBattleModeWidgetNewClient(); bmTrySearchNewClient();
					this.innerHTML = '<i class="fa fa-pause"></i> Pause';
				}
			});
			var tbAwayElNew = q('input[name="qol2-tb-away"]');
			if (tbAwayElNew) tbAwayElNew.addEventListener('change', function () { setQolPref('tb-away', this.checked); });
		}

		function patchOptionsPanelNewClient() {
			var RoomType = win.PS && win.PS.roomTypes && win.PS.roomTypes['options'];
			if (!RoomType || RoomType.prototype._qolPatchedNewClient) return;
			RoomType.prototype._qolPatchedNewClient = true;
			var origMount = RoomType.prototype.componentDidMount;
			var origUpdate = RoomType.prototype.componentDidUpdate;
			RoomType.prototype.componentDidMount = function () {
				if (origMount) origMount.call(this);
				injectQolOptionsNewClient(this);
			};
			RoomType.prototype.componentDidUpdate = function () {
				if (origUpdate) origUpdate.call(this);
				injectQolOptionsNewClient(this);
			};
		}
		(function tryPatchOptionsPanelNewClient() {
			if (win.PS && win.PS.roomTypes && win.PS.roomTypes['options']) patchOptionsPanelNewClient();
			else setTimeout(tryPatchOptionsPanelNewClient, 300);
		})();

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
		// the same series by format match. Needed because the tracker room's
		// end-of-series signal can arrive and get handled (closing the tracker)
		// well before the last game's battle room finishes its slower,
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

		// ─── Battle Mode (new client) ───
		// Reuses battleMode/bmReplays/bmFormat/bmBattleCount/bmBo3Series/
		// bmBo3WaitUntil as-is: exactly one client is ever active in a given
		// page load, so there's no risk of the two clients' Battle Mode
		// state colliding. bmTeamIndex (old client's array-index team
		// reference) doesn't carry over though - the new client identifies
		// a saved team by its own stable team.key string, so that gets its
		// own variable instead of reusing/repurposing the old one.
		// Likewise bmRoomFmt/bmIsBo3Format/bmRoomIsBo3/bmGetSeries/
		// bmFormatName/downloadTxt/bmExportReplays above are pure logic with
		// no win.app references at all, so they're called directly rather
		// than duplicated.
		var bmTeamKey = '';

		// The new client has no persistent "currently selected format/team"
		// model field the way old client's home room does (room.curFormat/
		// curTeamIndex) - that selection only lives in the TeamForm Preact
		// component instance, which isn't reachable from outside. The live
		// DOM buttons (same ones the format/team-restore feature already
		// reads/writes) are the most direct stand-in, with this script's own
		// localStorage cache (also already maintained by that same feature)
		// as a fallback for the rare case the home room isn't mounted.
		function bmReadCurrentFormatAndTeamNewClient() {
			var home = document.getElementById('room-');
			var formatBtn = home && home.querySelector('button[name="format"]');
			var teamBtn = home && home.querySelector('button[name="team"]');
			var format = (formatBtn && formatBtn.value) || localStorage.getItem('qol_last_format') || '';
			var teamKey = (teamBtn && teamBtn.value) || localStorage.getItem('qol_last_team_key') || '';
			return { format: format, teamKey: teamKey };
		}

		function bmIsInBattleNewClient() {
			if (win.PS && win.PS.rooms && Object.values(win.PS.rooms).some(function (r) { return r && r.classType === 'battle' && !r._qol2EndedAt; })) return true;
			if (bmBo3WaitUntil && Date.now() < bmBo3WaitUntil) return true;
			return false;
		}

		function updateBattleModeWidgetVisibilityNewClient() {
			var w = document.getElementById('qol2-bm-widget-new');
			if (!w) return;
			var curRoom = win.PS && win.PS.room;
			var curIsBattle = curRoom && curRoom.classType === 'battle';
			w.style.display = curIsBattle ? 'none' : '';
		}

		// Old client anchors this widget inside .activitymenu/.mainmenu -
		// the new client's real equivalent is the Home room's own
		// ".mainmenu-mini-windows" container, the exact box the News popup
		// lives in (and still does, right alongside this one). Since this
		// script runs ON the real page, the page's own already-loaded
		// client2.css already knows how to style ".mini-window"/
		// ".mini-window-header"/".readable-bg" (light/dark-aware, proper
		// borders and corner radii) - building REAL markup with those exact
		// classes gets that styling for free, and the container's own CSS
		// already handles stacking multiple mini-windows via plain block
		// flow, so there's no positioning math to duplicate here either.
		// Falls back to the old fixed corner box only if that container
		// genuinely can't be found (e.g. this fires before the Home room
		// has mounted at all) so Battle Mode never ends up with no visible
		// UI whatsoever.
		// A distinct id (-new suffix, also on every button inside it) keeps
		// this completely clear of old client's own #qol2-bm-widget and the
		// unconditional MutationObserver further down this file that drives
		// IT: that observer calls the old updateBattleModeWidgetVisibility,
		// which reads win.app.curRoom - always undefined on the new client,
		// which would force this widget visible even mid-battle if it ever
		// found this one by sharing the same id.
		function findMiniWindowsContainerNewClient() {
			var home = document.getElementById('room-');
			return (home && home.querySelector('.mainmenu-mini-windows')) || null;
		}

		function renderBattleModeWidgetNewClient() {
			var w = document.getElementById('qol2-bm-widget-new');
			if (w && !document.contains(w)) { w.parentNode && w.parentNode.removeChild(w); w = null; }
			if (!w) { w = document.createElement('div'); w.id = 'qol2-bm-widget-new'; }

			var ip = battleMode === 'paused';
			var isBo3Widget = bmIsBo3Format(bmFormat);
			var seriesScoreHtml = '';
			if (isBo3Widget) {
				var activeSeries = Object.values(bmBo3Series).filter(function (s) { return !s.done && s.gameCount > 0; });
				if (activeSeries.length) {
					var s = activeSeries[activeSeries.length - 1];
					var scoreEntries = Object.entries(s.wins);
					if (scoreEntries.length) {
						seriesScoreHtml = '<p style="text-align:center;font-size:9pt;margin:0 0 5px;opacity:.85;">'
							+ '<strong>Game ' + s.gameCount + '</strong>: '
							+ scoreEntries.map(function (e) { return e[0] + ' ' + e[1]; }).join(' – ') + '</p>';
					}
				}
			}
			// Deliberately no explicit text color on any of this - it's
			// shared between both the mini-window body (which supplies its
			// own light/dark-aware color via .readable-bg) and the fixed
			// fallback box below (which sets one explicit color on its own
			// outer wrapper instead), so the exact same markup reads
			// correctly either way purely through normal CSS inheritance.
			var bodyHtml = '<p style="text-align:center;font-size:10pt;margin:4px 0 6px;">'
				+ '<i class="fa fa-play-circle' + (ip ? '' : ' fa-spin') + '" style="color:' + (ip ? '#aaa' : '#5fa') + ';margin-right:5px;"></i>'
				+ '<strong>Battle Mode</strong></p>'
				+ '<p style="text-align:center;font-size:8pt;margin:0 0 6px;opacity:.8;">'
				+ bmFormatName() + '<br/>'
				// "series" doesn't pluralize in English (unlike "battle"/
				// "battles") - old client's own widget has the same '+s'
				// applied unconditionally, which is a pre-existing cosmetic
				// quirk left untouched there, but there's no reason to copy
				// it into new code being written fresh right now.
				+ bmBattleCount + (isBo3Widget ? ' series' : ' battle' + (bmBattleCount !== 1 ? 's' : '')) + ' &nbsp;|&nbsp; ' + bmReplays.length + ' replay' + (bmReplays.length !== 1 ? 's' : '') + ' saved</p>'
				+ seriesScoreHtml;
			bodyHtml += '<p><button class="button" id="qol2-bm-pause-new" style="display:' + (ip ? 'none' : 'block') + ';margin:0 auto 4px;width:100%;max-width:220px;"><i class="fa fa-pause"></i> Pause</button>'
				+ '<button class="button" id="qol2-bm-resume-new" style="display:' + (ip ? 'block' : 'none') + ';margin:0 auto 4px;width:100%;max-width:220px;"><i class="fa fa-play"></i> Resume</button></p>';
			bodyHtml += '<p><button class="button" id="qol2-bm-end-new" style="display:block;margin:0 auto 4px;width:100%;max-width:220px;"><i class="fa fa-stop"></i> End Battle Mode</button></p>';
			if (bmReplays.length) bodyHtml += '<p><button class="button" id="qol2-bm-export-new" style="display:block;margin:0 auto;width:100%;max-width:220px;"><i class="fa fa-download"></i> Export Replays (' + bmReplays.length + ')</button></p>';

			var container = findMiniWindowsContainerNewClient();
			if (container) {
				w.className = 'mini-window';
				w.removeAttribute('style');
				w.innerHTML = '<h3 class="mini-window-header">'
					+ '<button class="closebutton" id="qol2-bm-headerclose-new" tabindex="-1" aria-label="End Battle Mode"><i class="fa fa-times-circle"></i></button>'
					+ 'Battle Mode</h3>'
					+ '<div class="mini-window-contents ps-room-light mini-window-flex"><div class="readable-bg" style="padding:8px 10px;">' + bodyHtml + '</div></div>';
				if (w.parentNode !== container) container.appendChild(w);
			} else {
				w.className = 'menugroup';
				w.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:30;background:rgba(0,0,0,.75);color:#eee;max-width:270px;border-radius:3px;padding:2px;box-shadow:0 2px 8px rgba(0,0,0,.4);';
				w.innerHTML = bodyHtml;
				if (w.parentNode !== document.body) document.body.appendChild(w);
			}
			updateBattleModeWidgetVisibilityNewClient();
			var pb = document.getElementById('qol2-bm-pause-new'), rb = document.getElementById('qol2-bm-resume-new'), eb = document.getElementById('qol2-bm-end-new'), xb = document.getElementById('qol2-bm-export-new'), hcb = document.getElementById('qol2-bm-headerclose-new');
			if (pb) pb.addEventListener('mousedown', function (e) { e.preventDefault(); bmPauseNewClient(); });
			if (rb) rb.addEventListener('mousedown', function (e) { e.preventDefault(); battleMode = 'active'; renderBattleModeWidgetNewClient(); bmTrySearchNewClient(); });
			if (eb) eb.addEventListener('mousedown', function (e) { e.preventDefault(); bmEndNewClient(); });
			if (xb) xb.addEventListener('mousedown', function (e) { e.preventDefault(); bmExportReplays(); });
			if (hcb) hcb.addEventListener('mousedown', function (e) { e.preventDefault(); bmEndNewClient(); });
		}

		function removeBattleModeWidgetNewClient() { var w = document.getElementById('qol2-bm-widget-new'); if (w) w.parentNode.removeChild(w); }

		function bmStartNewClient() {
			if (tbMode) tbEndNewClient();
			var cur = bmReadCurrentFormatAndTeamNewClient();
			bmFormat = cur.format;
			bmTeamKey = cur.teamKey;
			battleMode = 'active'; bmReplays = []; bmBattleCount = 0; bmBo3Series = {};
			renderBattleModeWidgetNewClient();
			bmTrySearchNewClient();
		}

		function bmPauseNewClient() {
			battleMode = 'paused';
			renderBattleModeWidgetNewClient();
			if (win.PS && win.PS.mainmenu && !bmIsInBattleNewClient()) win.PS.mainmenu.cancelSearch();
		}

		function bmEndNewClient() {
			battleMode = 'off'; removeBattleModeWidgetNewClient();
			if (win.PS && win.PS.mainmenu && win.PS.mainmenu.searchingFormat()) win.PS.mainmenu.cancelSearch();
		}

		function bmTrySearchNewClient() {
			if (battleMode !== 'active') return;
			if (!win.PS || !win.PS.mainmenu || !bmFormat) return;
			if (win.PS.mainmenu.searchingFormat()) return;
			if (bmIsInBattleNewClient()) return;
			var team = bmTeamKey && win.PS.teams && win.PS.teams.byKey ? win.PS.teams.byKey[bmTeamKey] : undefined;
			var teambuilderFormat = (win.PS.teams && win.PS.teams.teambuilderFormat) ? win.PS.teams.teambuilderFormat(bmFormat) : bmFormat;
			if (!team && !(win.BattleFormats && win.BattleFormats[teambuilderFormat] && win.BattleFormats[teambuilderFormat].team)) {
				// Mirrors TeamForm.submit()'s own validation, which startSearch()
				// itself skips entirely since it's meant to be called only after
				// that check already passed - calling it directly here bypasses
				// that safety net, so without this Battle Mode would otherwise
				// just keep quietly retrying the same invalid search forever.
				bmEndNewClient();
				win.PS.alert('Battle Mode needs a team for ' + bmFormatName() + ' - go build one in the Teambuilder, then start Battle Mode again.');
				return;
			}
			win.PS.teams.loadTeam(team).then(function () {
				win.PS.mainmenu.startSearch(bmFormat, team);
			});
		}

		function bmAutoDownloadSeriesNewClient(series) {
			if (!series || !series.games.length) return;
			var now = new Date();
			var date = now.toISOString().slice(0, 10);
			var time = now.toTimeString().slice(0, 8).replace(/:/g, '-');
			var fmt = bmFormatName() || 'Bo3';
			var myName = (win.PS && win.PS.user && win.PS.user.name) || '';
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

		function bmFindTrackerRoomForBattleNewClient(battleRoom) {
			if (!win.PS || !win.PS.rooms) return null;
			var fmt = bmRoomFmt(battleRoom && battleRoom.id);
			var candidates = Object.values(win.PS.rooms).filter(function (r) {
				if (!r || !r.id || r === battleRoom) return false;
				if (r.id.indexOf('game-') !== 0) return false;
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

		function bmFindOpenBattleRoomsForTrackerNewClient(trackerRoom) {
			if (!win.PS || !win.PS.rooms || !trackerRoom) return [];
			var fmt = bmRoomFmt(trackerRoom.id);
			return Object.values(win.PS.rooms).filter(function (r) {
				if (!r || !r.id || r === trackerRoom) return false;
				if (r.classType !== 'battle') return false;
				if (r.id.indexOf('game-') === 0) return false;
				if (fmt && bmRoomFmt(r.id) === fmt) return true;
				return r.id.toLowerCase().indexOf('bestof') >= 0;
			});
		}

		// The DOM-button-hunting old client does in bmClickReady (plus its
		// raw /msgroom fallback) is working around Backbone's send() not
		// reliably scoping to a background room. The new client's send()
		// has no such ambiguity: PSRoom.sendDirect always transmits
		// `${this.id}|${msg}`, so a direct send already targets this exact
		// tracker room regardless of what's currently focused.
		function bmClickReadyNewClient(trackerRoom) {
			if (!trackerRoom) return;
			win.PS.focusRoom(trackerRoom.id);
			setTimeout(function () { trackerRoom.send('/confirmready'); }, 600);
		}

		function bmRecordGameNewClient(trackerRoom, battleRoom, replayUrl) {
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
					var myName = (win.PS && win.PS.user && win.PS.user.name) || '';
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
					if (battleRoom) win.PS.leave(battleRoom.id);
					bmFindOpenBattleRoomsForTrackerNewClient(trackerRoom).forEach(function (br) { win.PS.leave(br.id); });
					if (trackerRoom) win.PS.leave(trackerRoom.id);
					win.PS.focusRoom('');
				}, 150);

				if (battleMode === 'active' || battleMode === 'paused') {
					bmBattleCount++;
					renderBattleModeWidgetNewClient();
					if (battleMode === 'active') setTimeout(function () { bmTrySearchNewClient(); }, 1500);
				} else {
					bmAutoDownloadSeriesNewClient(series);
				}
			} else {
				setTimeout(function () {
					if (battleRoom) win.PS.leave(battleRoom.id);
					bmClickReadyNewClient(trackerRoom);
				}, 200);
			}
		}

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
			// type==='battle' with real battles client-side. Its end-of-series
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

		// ─── Teambuilder Mode (new client) ───
		// Reuses tbMode/tbMunchTab/tbCalcTab/tbLastOpenedFormat as-is - same
		// one-client-per-page-load reasoning as Battle Mode above. MunchStats
		// and the NCP calc are real browser tabs either way (GM_openInTab,
		// identical regardless of client), so the only client-specific
		// pieces are joining the in-app Teambuilder room, finding which
		// format is currently being edited, and the away-while-active
		// toggle.
		function tbStartNewClient() {
			if (battleMode !== 'off') bmEndNewClient();
			tbMode = true;
			tbLastOpenedFormat = '';
			if (getQolPref('tb-away', false) && win.PS) win.PS.send('/away');
			if (win.PS) win.PS.join('teambuilder');
			var calcUrl = 'https://nerd-of-now.github.io/NCP-VGC-Damage-Calculator/';
			tbCalcTab = GM_openInTab(calcUrl, { active: false, insert: true });
			tbWatchForFormatNewClient();
		}

		// Old client's single-page Teambuilder reactively tracks whichever
		// team its one view currently has open (tbRoom.curTeam.format). The
		// new client opens each team as its own separate team-<key> room/
		// panel instead, so "whichever format you're editing" becomes
		// "whichever team-* room is currently focused" - win.PS.room is the
		// direct equivalent of old client's app.curRoom used elsewhere in
		// this file, and TeamRoom.team.format is set from the team's own
		// data the moment that room is created (panel-teambuilder-team.tsx).
		function tbWatchForFormatNewClient() {
			if (!tbMode) return;
			var curRoom = win.PS && win.PS.room;
			var fmt = (curRoom && curRoom.id && curRoom.id.indexOf('team-') === 0 && curRoom.team && curRoom.team.format || '').trim();
			if (fmt && !/^gen\d+$/.test(fmt) && fmt !== tbLastOpenedFormat) {
				tbLastOpenedFormat = fmt;
				try { if (tbMunchTab && tbMunchTab.close) tbMunchTab.close(); } catch (e) {}
				tbMunchTab = GM_openInTab('https://munchstats.com/' + fmt + '/', { active: false, insert: true });
			}
			setTimeout(tbWatchForFormatNewClient, 500);
		}

		function tbEndNewClient() {
			tbMode = false;
			try { if (tbMunchTab && tbMunchTab.close) tbMunchTab.close(); } catch (e) {}
			try { if (tbCalcTab && tbCalcTab.close) tbCalcTab.close(); } catch (e) {}
			tbMunchTab = null; tbCalcTab = null;
			if (getQolPref('tb-away', false) && win.PS) win.PS.send('/back');
			if (win.PS) win.PS.focusRoom('');
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
				if (menu.parentNode && menu.parentNode.querySelector('#qol2-tb-links')) return;
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

			// Confirmed pattern: labmaus.net/pokemon/{nationalDexNumber}
			// (e.g. /pokemon/445 is Garchomp, matching its actual
			// National Dex number) - computed from the species' own
			// num, not baseSpecies, since National Dex numbers are
			// shared across formes of the same species anyway.
			var natDexNum = (win.Dex && win.Dex.species) ? win.Dex.species.get(species).num : null;
			var labmausUrl = natDexNum ? 'https://labmaus.net/pokemon/' + natDexNum : 'https://labmaus.net/';

			// A separate sibling using Showdown's own native
			// .setmenu-left class (already used elsewhere, e.g. the
			// "Undo Delete" button) rather than inserting into the
			// original, right-aligned .setmenu - keeps these pinned to
			// the left edge independently, leaving the right side of
			// the panel free.
			var wrap = document.createElement('div');
			wrap.id = 'qol2-tb-links';
			wrap.className = 'setmenu setmenu-left';
			// .setmenu-left's native left:5px sits at the panel's raw
			// edge, crowding the sprite/nickname area - overriding to
			// 130px instead, matching the original .setmenu's own left
			// offset (confirmed in the source CSS), so these start
			// right where the button-row area actually begins.
			wrap.style.cssText = 'display:inline-flex;gap:3px;left:130px;';

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
			wrap.appendChild(makeBtn('LabMaus', 'https://favicon.im/labmaus.net', function () { GM_openInTab(labmausUrl, { active: true, insert: true }); }));
			wrap.appendChild(makeBtn('NCP Calc+Copy', 'https://favicon.im/nimbasacitypost.com', function () {
				var payload = encodeURIComponent(JSON.stringify({
					set: setExport,
					teamName: teamName,
					species: species
				}));
				GM_openInTab(calcUrl + '#qol2=' + payload, { active: true, insert: true });
			}));

			if (menu.parentNode) menu.parentNode.insertBefore(wrap, menu);
		}

		// ─── Pokémon Quick-Links, new (Preact) client ───
		// Showdown's newer, shared per-Pokemon set editor (the same
		// TeamEditorState/DexSearch engine Advanced Search's
		// getLiveSearch() already detects via win.editor) renders every
		// Pokemon's set via the same renderSet() method in two different
		// places: the compact, multi-Pokemon roster list (each one a
		// <div class="set-form" data-set-index> directly under
		// .set-list, no EV/IV editor shown) and, only once you click into
		// one specific Pokemon, a single zoomed-in <div
		// class="team-focus-editor"> wrapping that one set-form plus its
		// EV/IV/nature StatForm underneath. Confirmed directly in
		// battle-team-editor.tsx (renderInnerFocus/.team-focus-editor
		// vs. the plain .set-list rendering) - no .setmenu/curSet the way
		// the old client's own Teambuilder room has. This mirrors
		// injectQuickLinks above exactly (same URLs, same
		// exportSetToShowdownText call, same button-building helper
		// duplicated locally per this file's own convention of keeping
		// each function self-contained), just anchored to that different
		// container and reading the set from editor.sets[i] instead of
		// tbRoom.curSet. Only scanning inside .team-focus-editor (below)
		// is deliberate: the roster list shouldn't get a links row under
		// every single team member, only the one Pokemon currently
		// zoomed into for editing.
		// THE REAL BUG (confirmed in teambuilder.css, reproduced in a real
		// browser): `.set-searchresults` - the dex/ability/item/move
		// search-results panel shown under the search box in every
		// isSearchMode focus view - is hardcoded as
		// `position:absolute;top:230px` (NOT relative to the actual
		// rendered height of the tabbar+form+searchbox stacked above it).
		// Native Showdown gets away with this because that content's
		// natural height always comes out to ~230px on its own, so a
		// measured/flexible top was never needed. Our quick-links row adds
		// real height inside that SAME normal-flow content (intentionally -
		// see injectQuickLinksNew below), which pushes the search BOX down
		// but does nothing to this hardcoded 230px, since Showdown's CSS
		// has no idea our row exists. The result: `.set-searchresults`
		// (which has its own opaque background - teambuilder.css's
		// `.searchresults, .team-focus-editor { background:... }` rule)
		// still starts exactly where it always did and visually covers
		// however much of the now-pushed-down search box falls below that
		// old boundary - this is the actual mechanism behind "the search
		// box looks hidden"/"the mon blocks it", for species/ability/item/
		// move search alike (they all share this one panel).
		//
		// Showdown already has its own precedent for nudging this exact
		// value: `top: calc(230px + var(--teameditor-mobile-height-offset,
		// 0))`, used by its own "zoom out forms" mobile-scaling feature
		// (battle-team-editor.tsx, updateMobileScale). We deliberately do
		// NOT set that shared variable ourselves (it's written elsewhere,
		// on a different/outer element, for that unrelated feature, and
		// stomping it could fight with mobile zoom-out for anyone using
		// both) - instead we set `.set-searchresults`'s own inline `top`
		// directly, referencing that same variable inside our own calc()
		// so the two adjustments still add together correctly if a user
		// somehow has both active, while composing to plain native 230px
		// (plus nothing) when neither does.
		function adjustSearchResultsOffsetNew(setFormEl, extraPx) {
			var focusEditorEl = setFormEl.closest('.team-focus-editor');
			if (!focusEditorEl) return;
			var resultsEl = focusEditorEl.querySelector('.set-searchresults');
			// stats/details/import views render StatForm/DetailsForm/
			// SetImportForm instead (confirmed in renderInnerFocus) - those
			// sit in normal flow with no hardcoded offset of their own, so
			// there's nothing to adjust and nothing broken for them either
			// (matches the user never reporting those as affected).
			if (!resultsEl) return;
			if (extraPx > 0) {
				resultsEl.style.top = 'calc(230px + var(--teameditor-mobile-height-offset, 0px) + ' + extraPx + 'px)';
			} else {
				resultsEl.style.removeProperty('top');
			}
		}

		function injectQuickLinksNew(setFormEl, set, curTeam) {
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

			var natDexNum = (win.Dex && win.Dex.species) ? win.Dex.species.get(species).num : null;
			var labmausUrl = natDexNum ? 'https://labmaus.net/pokemon/' + natDexNum : 'https://labmaus.net/';

			var wrap = document.createElement('div');
			wrap.id = 'qol2-tb-links';
			wrap.setAttribute('data-qol2-species', species);
			// Deliberately NOT 'setmenu setmenu-left' here (unlike
			// injectQuickLinks above, the old-client version, where those
			// are correct). client.css defines both classes as
			// position:absolute;top:5px;left:5px (confirmed in
			// client.css) - that's the right spot in the OLD client's
			// own .setmenu-anchored layout, but in the new client's
			// .set-form (position:relative) that same top:5px;left:5px
			// lands directly on top of .set-nickname (itself
			// position:absolute;top:5px;left:-5px - see teambuilder.css),
			// which is what was making this row visually overlap/block
			// the nickname field (confirmed by rendering the real CSS).
			// Leaving className unset keeps this row in normal document
			// flow, right after .set-nickname, matching the anchoring
			// below.
			// flex-wrap:wrap + max-width/box-sizing are defensive: with 4
			// buttons (icon+label each) this row is wide enough that an
			// unusually narrow effective width (small window, page zoom,
			// mobile-ish layout) could otherwise push it past .set-form's
			// own right edge instead of wrapping to a 2nd line - still
			// never overlapping the table above it (normal flow, see
			// above), but tidier than letting it run wide.
			wrap.style.cssText = 'display:inline-flex;flex-wrap:wrap;gap:3px;margin:4px 0;max-width:100%;box-sizing:border-box;';

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
			wrap.appendChild(makeBtn('LabMaus', 'https://favicon.im/labmaus.net', function () { GM_openInTab(labmausUrl, { active: true, insert: true }); }));
			wrap.appendChild(makeBtn('NCP Calc+Copy', 'https://favicon.im/nimbasacitypost.com', function () {
				var payload = encodeURIComponent(JSON.stringify({
					set: setExport,
					teamName: teamName,
					species: species
				}));
				GM_openInTab(calcUrl + '#qol2=' + payload, { active: true, insert: true });
			}));

			// Anchored after the nickname field (the last thing rendered
			// inside .set-form) rather than trying to sit inline with the
			// ability/item table cells - keeps the injected row from
			// disturbing that table's own layout.
			var nicknameEl = setFormEl.querySelector('.set-nickname');
			if (nicknameEl) nicknameEl.insertAdjacentElement('afterend', wrap);
			else setFormEl.appendChild(wrap);
		}

		var _qol2TbIntervalNew = null;
		function patchTeambuilderLinksNew() {
			if (_qol2TbIntervalNew) return;
			_qol2TbIntervalNew = setInterval(function () {
				if (!win.PS || !win.PS.rooms) return; // old client - handled by patchTeambuilderLinks above
				var room = win.PS.room;
				if (!room || !room.id || room.id.indexOf('team-') !== 0) return;
				var editor = room.editor;
				if (!editor || !editor.sets) return;
				var el = document.getElementById('room-' + room.id);
				if (!el) return;
				// Checked per-tick (not just once before even looking at the
				// DOM) so turning the preference off mid-session is treated
				// exactly like every slot suddenly having nothing to show -
				// the same cleanup path below removes any existing row AND
				// undoes its .set-searchresults offset, instead of leaving a
				// stale row (and a stale push-down) sitting there until the
				// user happens to navigate away and back.
				var enabled = getQolPref('tbquicklinks', false);
				var team = (enabled && typeof room.getTeam === 'function') ? room.getTeam() : null;
				// Scoped to .team-focus-editor only - see the comment
				// above. The roster list's own .set-form rows (outside
				// team-focus-editor) are deliberately left untouched.
				el.querySelectorAll('.team-focus-editor .set-form[data-set-index]').forEach(function (setFormEl) {
					var idx = parseInt(setFormEl.getAttribute('data-set-index'), 10);
					var set = enabled ? editor.sets[idx] : null;
					// Defensive: querySelectorAll (not just the first match)
					// in case more than one copy of this script ended up
					// active at once (e.g. installed twice in the userscript
					// manager) and each inserted its own #qol2-tb-links here -
					// duplicate ids don't throw, they just make a plain
					// querySelector/getElementById pick whichever is first in
					// document order and silently ignore the rest, which
					// would otherwise let extra copies pile up forever since
					// neither instance's poll would ever see the other's node
					// as "the" existing one to validate or clean up.
					var existingAll = setFormEl.querySelectorAll('#qol2-tb-links');
					var existing = existingAll[0] || null;
					for (var dupeIdx = 1; dupeIdx < existingAll.length; dupeIdx++) existingAll[dupeIdx].remove();
					if (existing) {
						// Preact reuses this same .set-form DOM node across a
						// focus switch (it isn't unmounted just because a
						// different/empty slot is now focused), so a links row
						// built for the PREVIOUS species can linger here even
						// though it's now wrong (or the slot is now empty).
						if (!set || !set.species || existing.getAttribute('data-qol2-species') !== set.species) {
							existing.remove();
							existing = null;
						}
					}
					if (!existing && set && set.species) {
						injectQuickLinksNew(setFormEl, set, team);
						existing = setFormEl.querySelector('#qol2-tb-links');
					}
					// Re-applied every tick (idempotent, cheap) rather than
					// only right after injecting a fresh row - Preact can
					// re-render .set-searchresults with its own brand new DOM
					// node (e.g. switching between ability/item/move search
					// for the same Pokemon all land on a new PSSearchResults
					// render) without touching .set-form or our row at all,
					// which would otherwise silently drop this adjustment
					// until something ELSE happened to re-trigger it.
					if (existing) {
						var wrapCs = getComputedStyle(existing);
						var extraPx = existing.getBoundingClientRect().height +
							(parseFloat(wrapCs.marginTop) || 0) + (parseFloat(wrapCs.marginBottom) || 0);
						adjustSearchResultsOffsetNew(setFormEl, extraPx);
					} else {
						adjustSearchResultsOffsetNew(setFormEl, 0);
					}
				});
			}, 300);
		}
		patchTeambuilderLinksNew();

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
		(function tryAutoJoin() {
			if (win.app) {
				if (!app.user || !app.user.get('named')) { setTimeout(tryAutoJoin, 500); return; }
				if (!app.rooms['vgc']) app.tryJoinRoom('vgc');
			} else if (win.PS) {
				if (!win.PS.user || !win.PS.user.named) { setTimeout(tryAutoJoin, 500); return; }
				if (!win.PS.rooms['vgc']) win.PS.join('vgc');
			} else {
				setTimeout(tryAutoJoin, 500);
			}
		})();

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

		// ─── Save Tab Order (new client) ───
		// New client has no dedicated drag-end hook like old client's
		// topbar.dragEndRoom - instead every reorder (drag-and-drop or
		// otherwise) funnels through the single PS.dragOnto(room,
		// location, index) method, so patching that one spot covers
		// drags to either side of the tabbar. leftRoomList[0] is
		// always the home room and can never be dragged (PS.dragOnto
		// itself refuses to move it), so it's kept pinned rather than
		// sorted along with the rest.
		var TAB_ORDER_KEY_NEW = 'qol2-tab-order-new';
		function saveTabOrderNewClient() {
			if (!win.PS) return;
			var order = ([]).concat(win.PS.leftRoomList || [], win.PS.rightRoomList || []);
			localStorage.setItem(TAB_ORDER_KEY_NEW, JSON.stringify(order));
		}
		function restoreTabOrderNewClient() {
			if (!win.PS) return;
			try {
				var saved = JSON.parse(localStorage.getItem(TAB_ORDER_KEY_NEW) || '[]');
				if (!saved.length) return;
				var sortFn = function (a, b) {
					var ai = saved.indexOf(a), bi = saved.indexOf(b);
					if (ai === -1) return 1;
					if (bi === -1) return -1;
					return ai - bi;
				};
				if (win.PS.leftRoomList && win.PS.leftRoomList.length > 1) {
					var home = win.PS.leftRoomList[0];
					var restL = win.PS.leftRoomList.slice(1).sort(sortFn);
					win.PS.leftRoomList.length = 0;
					win.PS.leftRoomList.push(home);
					for (var i = 0; i < restL.length; i++) win.PS.leftRoomList.push(restL[i]);
				}
				if (win.PS.rightRoomList) win.PS.rightRoomList.sort(sortFn);
				win.PS.update();
			} catch (e) {}
		}
		function patchTabOrderNewClient() {
			if (!win.PS || typeof win.PS.dragOnto !== 'function' || win.PS._qol2DragPatched) return;
			win.PS._qol2DragPatched = true;
			var orig = win.PS.dragOnto.bind(win.PS);
			win.PS.dragOnto = function () {
				var result = orig.apply(this, arguments);
				saveTabOrderNewClient();
				return result;
			};
		}
		(function tryPatchTabOrderNewClient() {
			if (win.PS && typeof win.PS.dragOnto === 'function') {
				patchTabOrderNewClient();
				setTimeout(restoreTabOrderNewClient, 3000);
			} else {
				setTimeout(tryPatchTabOrderNewClient, 300);
			}
		})();

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

		// ─── Search Timer (new client) ───
		// PS.mainmenu.searchCountdown is a *different* native 3-second
		// "about to send your search" countdown, not this feature (the
		// "give up after 60s of no match" cancel timer) - so this only
		// starts once that's finished and searchingFormat() is still
		// true (meaning the /search was actually sent and we're now
		// genuinely waiting on the server).
		var SEARCH_TIMEOUT_NEW = 60, searchTimerIntervalNew = null, searchTimerSecondsNew = 0;
		function stopSearchTimerNew() {
			if (searchTimerIntervalNew) { clearInterval(searchTimerIntervalNew); searchTimerIntervalNew = null; }
			var el = document.getElementById('qol2-search-timer-new');
			if (el && el.parentNode) el.parentNode.removeChild(el);
		}
		function findSearchTimerAnchorNew() {
			var home = document.getElementById('room-');
			if (!home) return null;
			return home.querySelector('.mainmenu1.mainmenu.big.button[disabled]');
		}
		function startSearchTimerNew() {
			stopSearchTimerNew();
			searchTimerSecondsNew = SEARCH_TIMEOUT_NEW;
			var anchor = findSearchTimerAnchorNew();
			if (!anchor || !anchor.parentNode) return;
			var p = document.createElement('p');
			p.id = 'qol2-search-timer-new';
			anchor.parentNode.insertBefore(p, anchor.nextSibling);
			function tick() {
				var el = document.getElementById('qol2-search-timer-new');
				var stillSearching = win.PS && win.PS.mainmenu && win.PS.mainmenu.searchingFormat() && !win.PS.mainmenu.searchCountdown;
				if (!el || !stillSearching) { stopSearchTimerNew(); return; }
				searchTimerSecondsNew--;
				if (searchTimerSecondsNew <= 0) {
					stopSearchTimerNew();
					win.PS.mainmenu.cancelSearch();
					win.PS.update();
					return;
				}
				var pct = (searchTimerSecondsNew / SEARCH_TIMEOUT_NEW) * 100;
				var color = pct > 50 ? '#fff' : pct > 25 ? '#f8c000' : '#ff6060';
				el.innerHTML = '<small style="color:' + color + ';">Cancelling in ' + searchTimerSecondsNew + 's</small>';
			}
			tick();
			searchTimerIntervalNew = setInterval(tick, 1000);
		}
		function watchSearchTimerNew() {
			if (win._qol2SearchTimerWatching) return;
			win._qol2SearchTimerWatching = true;
			var was = false;
			setInterval(function () {
				if (!win.PS || !win.PS.mainmenu) return;
				var is = !!(win.PS.mainmenu.searchingFormat() && !win.PS.mainmenu.searchCountdown);
				if (!was && is) startSearchTimerNew();
				else if (was && !is) stopSearchTimerNew();
				was = is;
			}, 300);
		}
		watchSearchTimerNew();

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

		// ─── Away Mode (new client) ───
		// The new client's own-profile popup (UserPanel) has no Away/Back
		// toggle at all - just a free-text status editor (StatusEditor) - so
		// unlike the old client's version above, there's no existing
		// live-highlighted state to extend. Deliberately not trying to mirror
		// that live highlighting here: it depends on PS.mainmenu's
		// userdetailsCache, which is populated asynchronously (a /cmd
		// userdetails query fired from UserRoom's own constructor) and can
		// be stale or briefly empty right when this panel first mounts.
		// Plain, unstyled action buttons avoid that timing fragility
		// entirely while still doing the one thing that matters: sending
		// /away or /back.
		function injectAwayBackNewClient(panel) {
			var root = panel.base;
			if (!root) return;
			var room = panel.props && panel.props.room;
			if (!room || !room.userid || !win.PS.user || room.userid !== win.PS.user.userid) return;
			if (root.querySelector('.qol2-awayback')) return;
			var details = root.querySelector('.userdetails');
			if (!details) return;
			details.insertAdjacentHTML('afterend', '<p class="buttonbar qol2-awayback">' +
				'<button class="button" data-cmd="/away"><i class="fa fa-moon-o"></i> Away</button> ' +
				'<button class="button" data-cmd="/back"><i class="fa fa-sun-o"></i> Back</button>' +
				'</p>');
		}
		function patchUserPanelNewClient() {
			var RoomType = win.PS && win.PS.roomTypes && win.PS.roomTypes['user'];
			if (!RoomType || RoomType.prototype._qol2AwayPatched) return;
			RoomType.prototype._qol2AwayPatched = true;
			var origMount = RoomType.prototype.componentDidMount;
			var origUpdate = RoomType.prototype.componentDidUpdate;
			RoomType.prototype.componentDidMount = function () {
				if (origMount) origMount.call(this);
				injectAwayBackNewClient(this);
			};
			RoomType.prototype.componentDidUpdate = function () {
				if (origUpdate) origUpdate.call(this);
				injectAwayBackNewClient(this);
			};
		}
		(function tryPatchUserPanelNewClient() {
			if (win.PS && win.PS.roomTypes && win.PS.roomTypes['user']) patchUserPanelNewClient();
			else setTimeout(tryPatchUserPanelNewClient, 300);
		})();

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
					// Give the person a chance to see the result
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
						// Give the normal per-game path (last game's battle
						// room, which independently schedules its saveReplay()
						// ~2s after its |win| line) a chance to finish first -
						// that path correctly captures the replay URL via
						// bmRecordGame. This only does anything for the
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

		// ─── OTS / forfeit-close / auto-replay (new client) ───
		// Unlike the old client (which intercepts room.add(rawString) and
		// scans the raw text), the new client hands BattleRoom.handleLine(args)
		// pre-parsed protocol lines, so there's no text to scan - just
		// args[0] to switch on. Three old-client features converge on this
		// one override because all three keys (OTS offer, forfeit detection,
		// battle-end) are protocol lines seen here first:
		//  - args[0]==='uhtml' carrying the open-team-sheets prompt (server
		//    source: data/rulesets.ts, box name "otsrequest", buttons whose
		//    value attributes literally contain "acceptopenteamsheets" /
		//    "openteamsheet" - same substring check as old client, just
		//    against args[2] instead of the raw line).
		//  - args[0]==='win'/'tie' is both "the battle ended" (to auto-fire
		//    /savereplay, mirroring hookBattleEndReplay's needSave logic
		//    above) and "maybe time to auto-close" (if this client just sent
		//    /forfeit itself - see the send() patch below - or if
		//    auto-closing after a copied replay is desired; the actual close
		//    for the replay case happens from the PS.alert patch instead,
		//    once the replay URL is known).
		// Mutating args[2] in place for the uhtml case is safe and sufficient:
		// receiveBatch builds the chat-log line via '|' + args.join('|') AFTER
		// handleLine returns, using this same args array reference, so the
		// edited HTML flows through to battle-log.ts's changeUhtml() exactly
		// like the pre-edited original.
		function patchBattleRoomProtocolNewClient() {
			var RoomType = win.PS && win.PS.roomTypes && win.PS.roomTypes['battle'];
			var BattleRoomModel = RoomType && RoomType.Model;
			if (!BattleRoomModel || BattleRoomModel.prototype._qol2ProtocolPatched) return;
			BattleRoomModel.prototype._qol2ProtocolPatched = true;

			// Self-forfeit detection has to happen at the point this client
			// sends the command, not by scanning incoming "X forfeited."
			// chat text - that message is broadcast to BOTH players, and
			// closeforfeit (mirroring old client's ForfeitPopup checkbox) is
			// only ever about auto-closing YOUR OWN room after YOU forfeit,
			// never the opponent's. Every forfeit path (the "[Forfeit]" and
			// "[Forfeit and close]" buttons' /inopener /forfeit, as well as
			// typing /forfeit manually) ends up calling room.send() directly
			// on this exact battle room instance.
			var origSend = BattleRoomModel.prototype.send;
			BattleRoomModel.prototype.send = function (text) {
				if (typeof text === 'string' && /^\/forfeit(\s|$)/.test(text)) {
					this._qol2SelfForfeited = true;
				}
				return origSend.apply(this, arguments);
			};

			var origHandleLine = BattleRoomModel.prototype.handleLine;
			BattleRoomModel.prototype.handleLine = function (args) {
				if (args[0] === 'uhtml' && typeof args[2] === 'string') {
					var lower = args[2].toLowerCase();
					if (lower.indexOf('openteamsheet') >= 0 && lower.indexOf('acceptopenteamsheets') >= 0) {
						var ots = getQolPref('ots', 'ask');
						if (ots === 'accept') {
							this.send('/acceptopenteamsheets');
							args[2] = args[2].replace(/<button[\s\S]*?<\/button>/gi, '<em style="color:#888">(auto-accepted open team sheets)</em>');
						} else if (ots === 'reject') {
							this.send('/rejectopenteamsheets');
							args[2] = args[2].replace(/<button[\s\S]*?<\/button>/gi, '<em style="color:#888">(auto-rejected open team sheets)</em>');
						}
					}
				} else if (args[0] === 'win' || args[0] === 'tie') {
					if (!this._qol2EndedAt) this._qol2EndedAt = Date.now();
					var self = this;
					// game-* tracker rooms share this exact class (BattlePanel's
					// routes cover both 'battle-*' and 'game-*'), but they aren't
					// real battles - no replay of their own to save, no forfeit
					// of their own to close for. Their own win/tie is handled
					// separately below, as a backup series-end signal only.
					var isTrackerRoomNew = this.id && this.id.indexOf('game-') === 0;

					if (!isTrackerRoomNew) {
						var needSaveNew = getQolPref('autocopyreplay', false) || getQolPref('autoclosebattle', false)
							|| battleMode === 'active' || battleMode === 'paused' || bmRoomIsBo3(this);
						if (needSaveNew && !this._qol2ReplaySentNew) {
							this._qol2ReplaySentNew = true;
							setTimeout(function () { self.send('/savereplay'); }, 2000);
						}
						if (this._qol2SelfForfeited && getQolPref('closeforfeit', true) && !this._qol2ForfeitCloseScheduled) {
							this._qol2ForfeitCloseScheduled = true;
							var roomid = this.id;
							setTimeout(function () {
								win.PS.leave(roomid);
								win.PS.focusRoom('');
							}, 500);
						}
						// Battle Mode bookkeeping, mirroring hookBattleModeRoom:
						// a plain battle increments the count and re-triggers the
						// search loop directly; a Bo3 game instead opens a short
						// "still kind of in battle" window, since the real
						// per-series accounting (and the eventual re-search) is
						// driven by bmRecordGame via the replay-URL/PS.alert path
						// once the actual series result is known.
						if ((battleMode === 'active' || battleMode === 'paused') && !this._qol2BmEndFired) {
							this._qol2BmEndFired = true;
							if (bmRoomIsBo3(this)) {
								bmBo3WaitUntil = Date.now() + 5000;
								setTimeout(function () { bmBo3WaitUntil = 0; }, 5000);
							} else {
								bmBattleCount++;
								renderBattleModeWidgetNewClient();
								if (battleMode === 'active') setTimeout(function () { bmTrySearchNewClient(); }, 1500);
							}
						}
					} else if (!this._qol2SeriesEndCheckScheduled) {
						// Backup path only: the normal per-game route (bmRecordGame,
						// triggered per game as each replay URL becomes available)
						// already marks the series done once someone reaches 2 wins.
						// This only ever does anything when the series ended some
						// OTHER way - forfeit or inactivity between games - with no
						// winning game's own win/tie to drive that path. The delay
						// gives that normal path a chance to finish first so this
						// doesn't double-handle a series that's already wrapping up.
						this._qol2SeriesEndCheckScheduled = true;
						setTimeout(function () {
							var series = bmGetSeries(self);
							if (series && !series.done) {
								series.done = true;
								series.games.forEach(function (g) { if (g.url && bmReplays.indexOf(g.url) === -1) bmReplays.push(g.url); });
								bmFindOpenBattleRoomsForTrackerNewClient(self).forEach(function (br) { win.PS.leave(br.id); });
								setTimeout(function () {
									win.PS.leave(self.id);
									win.PS.focusRoom('');
								}, 150);
								if (battleMode === 'active' || battleMode === 'paused') {
									bmBattleCount++;
									renderBattleModeWidgetNewClient();
									if (battleMode === 'active') setTimeout(function () { bmTrySearchNewClient(); }, 1500);
								} else {
									bmAutoDownloadSeriesNewClient(series);
								}
							}
						}, 3000);
					}
				}
				return origHandleLine.call(this, args);
			};
		}
		(function tryPatchBattleRoomProtocolNewClient() {
			var RoomType = win.PS && win.PS.roomTypes && win.PS.roomTypes['battle'];
			if (RoomType && RoomType.Model) patchBattleRoomProtocolNewClient();
			else setTimeout(tryPatchBattleRoomProtocolNewClient, 300);
		})();

		// Replay-link popups arrive for the new client exactly like every
		// other server |popup| message (routed through PS.alert - see
		// panel-mainmenu.tsx's case 'popup') since, unlike the old client,
		// there's no separate client-side upload/response path to hook: new
		// client never does a client-side replay upload at all, it just
		// waits for the server's popup response to /savereplay. That makes
		// PS.alert the single correct interception point for both
		// auto-copying the URL and (if enabled) silently closing the battle
		// instead of ever showing the popup - mirroring old client's own
		// app.addPopup/app.closePopup pairing one level up the stack.
		function findBattleRoomForReplayUrlNewClient(url) {
			if (!win.PS || !win.PS.rooms) return null;
			var rid = url.replace(/^https?:\/\/[^/]+\//, '');
			var candidates = Object.values(win.PS.rooms).filter(function (r) { return r && r.classType === 'battle'; });
			var room = candidates.find(function (r) { return r.id && r.id.indexOf(rid) >= 0; });
			if (!room) {
				room = candidates
					.filter(function (r) { return r._qol2EndedAt; })
					.sort(function (a, b) { return (b._qol2EndedAt || 0) - (a._qol2EndedAt || 0); })[0];
			}
			if (!room) room = candidates[0];
			return room || null;
		}
		function patchAlertNewClient() {
			if (!win.PS || typeof win.PS.alert !== 'function' || win.PS._qol2AlertPatched) return;
			win.PS._qol2AlertPatched = true;
			var origAlert = win.PS.alert.bind(win.PS);
			win.PS.alert = function (message, opts) {
				var m = typeof message === 'string' && message.match(/(https?:\/\/replay\.pokemonshowdown\.com\/[\w-]+)/);
				var url = m && m[1];
				if (url) {
					var isBo3New = bmIsBo3Format(bmFormat) || url.toLowerCase().indexOf('bo3') >= 0;
					var battleRoomForUrl = findBattleRoomForReplayUrlNewClient(url);

					// Battle Mode (active or paused): always copies, always
					// suppresses the popup, and either feeds a Bo3 series or
					// moves straight to the next search - mirrors old client's
					// patchUploadReplay exactly, including copying even when the
					// autocopyreplay toggle is off (Battle Mode's own replay
					// export is the point, not that per-battle setting).
					if (battleMode === 'active' || battleMode === 'paused') {
						copyToClipboard(url);
						if (isBo3New) {
							bmBo3WaitUntil = 0;
							bmRecordGameNewClient(bmFindTrackerRoomForBattleNewClient(battleRoomForUrl), battleRoomForUrl, url);
						} else {
							if (bmReplays.indexOf(url) === -1) bmReplays.push(url);
							renderBattleModeWidgetNewClient();
							if (battleRoomForUrl) win.PS.leave(battleRoomForUrl.id);
							win.PS.focusRoom('');
							setTimeout(function () { if (battleMode === 'active') bmTrySearchNewClient(); }, 1500);
						}
						return;
					}

					// Bo3 outside Battle Mode: still bundles the series into one
					// tracked set of replays instead of 2-3 separate popups,
					// same as old client (a Bo3 match can happen from normal
					// matchmaking too, not just inside Battle Mode).
					if (isBo3New) {
						if (getQolPref('autocopyreplay', false)) copyToClipboard(url);
						bmRecordGameNewClient(bmFindTrackerRoomForBattleNewClient(battleRoomForUrl), battleRoomForUrl, url);
						return;
					}

					var doCopy = getQolPref('autocopyreplay', false);
					var doClose = getQolPref('autoclosebattle', false);
					if (doCopy) copyToClipboard(url);
					if (doClose) {
						if (battleRoomForUrl) {
							var roomid = battleRoomForUrl.id;
							setTimeout(function () {
								win.PS.leave(roomid);
								win.PS.focusRoom('');
							}, 2000);
						}
						return; // mirrors old client's app.closePopup(): never shown
					}
				}
				return origAlert(message, opts);
			};
		}
		(function tryPatchAlertNewClient() {
			if (win.PS && typeof win.PS.alert === 'function') patchAlertNewClient();
			else setTimeout(tryPatchAlertNewClient, 300);
		})();

		// Keeps the Battle Mode widget (if any) hidden while actually
		// looking at a battle, mirroring old client's hookFocusRoom. Scoped
		// to win.PS._qol2FocusPatched (an own property on this specific
		// singleton) rather than a prototype flag, since PS.focusRoom is a
		// plain instance method, not shared across multiple rooms the way
		// BattleRoom.prototype.send/handleLine are above.
		(function tryPatchFocusRoomNewClient() {
			if (!win.PS || typeof win.PS.focusRoom !== 'function') { setTimeout(tryPatchFocusRoomNewClient, 300); return; }
			if (win.PS._qol2FocusPatched) return;
			win.PS._qol2FocusPatched = true;
			var origFocusRoom = win.PS.focusRoom.bind(win.PS);
			win.PS.focusRoom = function () {
				var r = origFocusRoom.apply(this, arguments);
				if (battleMode !== 'off') setTimeout(updateBattleModeWidgetVisibilityNewClient, 50);
				return r;
			};
		})();
		// Backup for any visibility-relevant DOM change focusRoom() doesn't
		// itself trigger, same defensive pairing old client uses.
		new MutationObserver(function () { if (battleMode !== 'off') updateBattleModeWidgetVisibilityNewClient(); }).observe(document.body, { childList: true, subtree: false });

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
			var rawFid = ((win.app && win.app.rooms && app.rooms['']) ? app.rooms[''].curFormat : null) || (document.querySelector('button[name=format]') || {}).value;
			if (!rawFid) return;
			// New client's button[name="format"].value is the format's pretty
			// display name ("[Gen 9 Champions] VGC 2026 Reg M-C"), not its
			// clean BattleFormats-keyed id ("gen9championsvgc2026regmc") -
			// the same FormatDropdownPanel quirk the format/team persistence
			// restore elsewhere in this script already normalizes for via
			// toID()-style lowercase+strip. Old client's room.curFormat is
			// already a clean id, and that normalization is a no-op on an
			// already-clean id, so it's applied unconditionally rather than
			// branching on which client this came from. Without it, the
			// BattleFormats lookup below silently falls back to the raw
			// (already-pretty) string for display - so the popup's title
			// still looks completely correct - while the ratings lookup has
			// no such fallback and just as silently renders "No data for
			// this format" even when real ladder data exists.
			var fid = String(rawFid).toLowerCase().replace(/[^a-z0-9]+/g, '');
			var uid = (win.app && win.app.user && app.user.get('userid')) || (win.PS && win.PS.user && win.PS.user.userid); if (!uid) return;
			var fn = (win.BattleFormats && BattleFormats[fid]) ? BattleFormats[fid].name : rawFid;
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
	// OTS POKEPASTE MODIFIER (+ PokePaste export, new client)
	// ============================================================
	// Old client natively renders "Upload to PokePaste" / "Upload to
	// PokePaste (Open Team Sheet)" buttons (oldclient/client-teambuilder.js,
	// Teambuilder.pokepasteExport) inside the Import/Export tab. This
	// section changes what the OTS (Open Team Sheet) variant actually
	// uploads on EITHER client: reverts any Mega Pokemon to its base
	// forme (still holding the mega stone) with ability-correction, omits
	// Shiny status, and optionally includes Nature (toggle lives in
	// Options -> Teambuilder, "Include Nature in OTS Pokepaste export" -
	// some tournaments still use the older no-nature teamsheet
	// convention, so this defaults to on but is easy to turn off).
	//
	// The new (Preact) client has NO pokepaste buttons of any kind in its
	// own Import/Export tab (battle-team-editor.tsx's TeamTextbox renders
	// just a lone [Copy] button) - confirmed it only ever uses pokepaste
	// URLs for IMPORTING a team, never for exporting one. The new-client
	// section below (after the old-client patch) ports both buttons over,
	// reusing buildOTSExportText()/otsIncludeNature() as-is: editor.sets
	// there is built from the same shared Teams.PokemonSet shape
	// (species/ability/item/moves/nature/evs/ivs/etc, confirmed directly
	// from battle-teams.ts) that old client's curSetList uses, so the
	// exact same OTS transformation logic applies unmodified.
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

		// ─── PokePaste export (new client) ───
		// No old-client form to borrow (it only exists at all once/if the
		// old-client Teambuilder room has actually been constructed this
		// session), so this builds its own equivalent hidden form rather
		// than depending on oldclient/client-teambuilder.js's
		// #pokepasteForm existing in the DOM.
		var pokepasteFormNew = null;
		function qolPokepasteFormNew() {
			if (pokepasteFormNew && document.body.contains(pokepasteFormNew)) return pokepasteFormNew;
			var form = document.createElement('form');
			form.id = 'qol2-pokepaste-form-new';
			form.method = 'post';
			form.action = 'https://pokepast.es/create';
			form.target = '_blank';
			form.style.display = 'none';
			['title', 'paste', 'author', 'notes'].forEach(function (field) {
				var input = document.createElement('input');
				input.type = 'hidden';
				input.name = field;
				input.id = 'qol2-paste-' + field + '-new';
				form.appendChild(input);
			});
			document.body.appendChild(form);
			pokepasteFormNew = form;
			return form;
		}

		function submitPokepasteNew(team, text, isOTS) {
			if (!text || !text.trim()) {
				if (win.PS && win.PS.alert) win.PS.alert('Add a Pokémon to your team before uploading it!');
				return;
			}
			var form = qolPokepasteFormNew();
			document.getElementById('qol2-paste-title-new').value = (team && team.name ? team.name : 'Team') + (isOTS ? ' (OTS)' : '');
			document.getElementById('qol2-paste-paste-new').value = text;
			document.getElementById('qol2-paste-author-new').value = (win.PS && win.PS.user && win.PS.user.name) || '';
			// Mirrors the old client's own condition exactly: 'gen9' bare is
			// the no-specific-format placeholder, not a real tier, so it's
			// not worth a notes line.
			document.getElementById('qol2-paste-notes-new').value = (team && team.format && team.format !== 'gen9') ? ('Format: ' + team.format) : '';
			form.submit();
		}

		// Anchored to .teameditor-text's previous sibling <p> (confirmed
		// directly from battle-team-editor.tsx's TeamTextbox.render(): the
		// lone [Copy] button's <p> is always immediately followed by
		// <div class="teameditor-text"><textarea class="teamtextbox">...)
		// rather than any class on the [Copy] button itself, which is just
		// a bare "button" - far too generic to match on safely. Presence
		// of .teameditor-text also doubles as "the Import/Export sub-tab
		// is the one currently showing" (TeamTextbox only mounts when it
		// is), so nothing extra is needed to detect that.
		function injectPokepasteButtonsNewClient() {
			if (!win.PS || !win.PS.room) return;
			var room = win.PS.room;
			if (!room.id || room.id.indexOf('team-') !== 0) return;
			var editor = room.editor;
			if (!editor || !editor.sets) return;
			var roomEl = document.getElementById('room-' + room.id);
			if (!roomEl) return;
			var teamEditorText = roomEl.querySelector('.teameditor-text');
			if (!teamEditorText) return;
			var p = teamEditorText.previousElementSibling;
			if (!p || p.tagName !== 'P' || p.querySelector('.qol2-pokepaste-btn-new')) return;

			var team = (typeof room.getTeam === 'function') ? room.getTeam() : room.team;
			// Open Team Sheets are a VGC-specific convention - matches the
			// old client's own .includes('vgc') gate exactly. team.format
			// is already toID-normalized (lowercase/alphanumeric-only) by
			// the time it reaches here (confirmed from client-main.ts's
			// TeamRoom.setFormat), so a plain substring check is enough.
			var isVgc = !!(team && team.format && team.format.indexOf('vgc') !== -1);

			function makeBtn(label) {
				var b = document.createElement('button');
				b.type = 'button';
				b.className = 'button qol2-pokepaste-btn-new';
				b.style.marginLeft = '4px';
				b.innerHTML = '<i class="fa fa-upload" aria-hidden="true"></i> ' + label;
				return b;
			}

			var plainBtn = makeBtn('Upload to PokePaste');
			plainBtn.addEventListener('click', function () {
				// Reads the textarea's live DOM value directly, same as the
				// native [Copy] button (copyAll) does - whatever's on screen,
				// including any in-progress manual edits, is exactly what
				// gets uploaded.
				var textarea = teamEditorText.querySelector('.teamtextbox');
				submitPokepasteNew(team, textarea ? textarea.value : '', false);
			});
			p.appendChild(plainBtn);

			if (isVgc) {
				var otsBtn = makeBtn('Upload to PokePaste (Open Team Sheet)');
				otsBtn.addEventListener('click', function () {
					// editor.sets is read live at click time (not cached at
					// injection time) so it reflects any edits made since -
					// see submitPokepasteNew's caller comment above.
					submitPokepasteNew(team, buildOTSExportText(editor.sets), true);
				});
				p.appendChild(otsBtn);
			}
		}
		setInterval(injectPokepasteButtonsNewClient, 300);
	})();

	// ============================================================
	// TEXT SIZE
	// ============================================================
	// Showdown has no built-in setting for this. Scales
	// .chat-log/.battle-log/.chat/.notice specifically (the actual
	// message-text containers/classes), not the whole page, so buttons/UI
	// chrome stay their normal size. Anchored to Showdown's own base
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

	// ─── Close buttons for popups that don't have one ───
	// Confirmed directly against the real new-client source
	// (panel-popups.tsx): every 'popup'-location room is rendered by the
	// generic PSPanelWrapper as a bare <div class="ps-popup"
	// id="room-<roomid>">, with no close control of its own - closing is
	// normally click-outside or Escape only. Neither UserPanel (routes
	// 'user-*' / 'viewuser-*' / 'users' - this is what renders your own
	// name popup, someone else's, and the online-users list, since they're
	// all the same component) nor VolumePanel (route 'volume') render a
	// close button in their own markup, confirmed by reading both render()
	// methods - that's not a client bug, it's just genuinely missing.
	// .closebutton itself carries no position/placement CSS of its own
	// (confirmed in client2.css - every native use of it relies on
	// surrounding flex/tab layout for placement, which these two popups'
	// content doesn't have), so this positions its own copy with absolute
	// coordinates against .ps-popup instead, which is already
	// position:absolute itself - simpler and less invasive than restyling
	// either popup's internal layout to add a flex header row.
	(function () {
		function isTargetPopup(el) {
			if (!el || !el.classList || !el.classList.contains('ps-popup')) return false;
			var id = el.id || '';
			// "user-"/"viewuser-" (not "useroptions-", the separate "..."
			// menu popup - that one's a different component, out of scope
			// here) and the exact "users" (online-users list) id.
			return id === 'room-volume' || id === 'room-users' || /^room-(user|viewuser)-/.test(id);
		}
		function addCloseButton(el) {
			if (el.querySelector(':scope > .qol2-popup-close')) return;
			var btn = document.createElement('button');
			btn.className = 'closebutton qol2-popup-close';
			btn.setAttribute('aria-label', 'Close');
			btn.tabIndex = -1;
			btn.style.cssText = 'position:absolute;top:4px;right:4px;z-index:5;font-size:16px;line-height:1;';
			btn.innerHTML = '<i class="fa fa-times-circle" aria-hidden="true"></i>';
			btn.addEventListener('click', function (e) {
				e.preventDefault();
				e.stopPropagation();
				var roomId = el.id.replace(/^room-/, '');
				if (win.PS && typeof win.PS.leave === 'function') win.PS.leave(roomId);
				else el.style.display = 'none'; // defensive fallback, should never be needed
			});
			el.appendChild(btn);
		}
		function scan(root) {
			if (!root || root.nodeType !== 1) return;
			if (isTargetPopup(root)) addCloseButton(root);
			if (!root.querySelectorAll) return;
			var found = root.querySelectorAll('.ps-popup[id]');
			for (var i = 0; i < found.length; i++) {
				if (isTargetPopup(found[i])) addCloseButton(found[i]);
			}
		}
		new MutationObserver(function (mutations) {
			for (var i = 0; i < mutations.length; i++) {
				var added = mutations[i].addedNodes;
				for (var j = 0; j < added.length; j++) scan(added[j]);
			}
		}).observe(document.body, { childList: true, subtree: true });
		scan(document.body);
	})();

	console.log('[Showdown Suite] v1.5.15 (build: newclient-qol24) loaded - Music, QoL, Move to Folder, Battle Update, OTS Pokepaste Modifier, Text Size, Rainbow Buttons.');
})();