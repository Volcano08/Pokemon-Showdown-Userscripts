// ==UserScript==
// @name         NCP Calc Auto-Import
// @namespace    showdown-qol-suite
// @version      1.2
// @description  Auto-imports Pokémon sets from Showdown Teambuilder into the NCP VGC Damage Calculator
// @author       You
// @match        https://nerd-of-now.github.io/NCP-VGC-Damage-Calculator/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
	'use strict';

	// Read data from URL hash: #qol2=<encoded JSON>
	function getHashData() {
		var hash = window.location.hash;
		if (!hash || hash.indexOf('qol2=') === -1) return null;
		try {
			var encoded = hash.split('qol2=')[1];
			return JSON.parse(decodeURIComponent(encoded));
		} catch(e) {
			console.error('[NCP] Failed to parse hash data:', e);
			return null;
		}
	}

	function waitForCalc(cb) {
		if (typeof window.ALL_SETDEX_CUSTOM !== 'undefined' &&
		    typeof window.savecustom === 'function') {
			cb();
		} else {
			setTimeout(function () { waitForCalc(cb); }, 200);
		}
	}

	function getGen() {
		// Use the calc's gen variable directly (most reliable)
		if (typeof window.gen !== 'undefined') return window.gen;
		var genInput = document.querySelector('input[name="gen"]:checked');
		if (genInput) return parseFloat(genInput.value);
		return 9;
	}

	function findExistingSet(gen, species, spreadName) {
		var custom = window.ALL_SETDEX_CUSTOM;
		return !!(custom && custom[gen] && custom[gen][species] && spreadName in custom[gen][species]);
	}

	function getSpeciesFromPaste(paste) {
		var lines = paste.trim().split('\n');
		var firstLine = '';
		for (var i = 0; i < lines.length; i++) {
			var l = lines[i].trim();
			if (l && !l.startsWith('===')) { firstLine = l; break; }
		}
		firstLine = firstLine.replace(/@.*$/, '').trim();
		var match = firstLine.match(/\(([^)]+)\)\s*$/);
		if (match) return match[1].trim();
		return firstLine.replace(/\s*\([MFN]\)\s*$/, '').trim();
	}

	function stripTeamHeader(paste) {
		var lines = paste.trim().split('\n');
		for (var i = 0; i < lines.length; i++) {
			if (!lines[i].trim().startsWith('===') && lines[i].trim()) {
				return lines.slice(i).join('\n').trim();
			}
		}
		return paste.trim();
	}

	function showNotification(msg, type) {
		var existing = document.getElementById('qol2-ncp-note');
		if (existing) existing.parentNode.removeChild(existing);
		var colors = {
			success: { bg: '#1a4a1a', border: '#3a8a3a', text: '#aaffaa' },
			info:    { bg: '#1a2a4a', border: '#3a5a8a', text: '#aaccff' },
			error:   { bg: '#4a1a1a', border: '#8a3a3a', text: '#ffaaaa' },
		};
		var c = colors[type] || colors.info;
		var el = document.createElement('div');
		el.id = 'qol2-ncp-note';
		el.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;padding:10px 16px;border-radius:6px;border:1px solid '+c.border+';background:'+c.bg+';color:'+c.text+';font-size:13px;max-width:380px;box-shadow:0 2px 8px rgba(0,0,0,.6);cursor:pointer;line-height:1.4;';
		el.textContent = msg;
		el.addEventListener('click', function(){ el.parentNode && el.parentNode.removeChild(el); });
		document.body.appendChild(el);
		setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 6000);
	}

	function findSavedSpecies(gen, species, spreadName) {
		// Look for exact species+spreadName match first
		var custom = window.ALL_SETDEX_CUSTOM;
		if (!custom || !custom[gen]) return null;
		// Direct match
		if (custom[gen][species] && spreadName in custom[gen][species]) return species;
		// Check showdownToCalcFormes mappings (e.g. forme variants)
		var keys = Object.keys(custom[gen]);
		for (var i = 0; i < keys.length; i++) {
			// Only return a match if the key starts with our species name
			// (handles cases like "Tyranitar" -> "Tyranitar" but not "Excadrill")
			if (keys[i].indexOf(species) === 0 && custom[gen][keys[i]] && spreadName in custom[gen][keys[i]]) {
				return keys[i];
			}
		}
		return null;
	}

	function loadIntoPanel(species, teamName) {
		var setId = species + ' (' + teamName + ')';
		var script = document.createElement('script');
		script.textContent = '(function() {' +
			'var setId = ' + JSON.stringify(setId) + ';' +
			'var species = ' + JSON.stringify(species) + ';' +
			'var teamName = ' + JSON.stringify(teamName) + ';' +
			'function doLoad() {' +
				'setdexCustom = ALL_SETDEX_CUSTOM[gen];' +
				'if (!setdex[species] || !(teamName in setdex[species])) {' +
					'setTimeout(doLoad, 200); return;' +
				'}' +
				// The "Custom sets only" checkbox has its click handler
				// (loadSets, in switch_mode.js) that rebuilds the
				// .set-selector dropdown's actual option list based on
				// whichever dex (preset vs custom) is currently toggled.
				// jQuery's .prop("checked", true) only flips the visual
				// checkbox - it does not fire a click/change event, so that
				// rebuild would never run on a fresh page load (toggle off
				// by default), and loadPreset below could end up selecting
				// against options that don't actually include our set yet.
				// Call the same rebuild function directly instead of
				// relying on a synthetic click.
				'var $toggle = $("#p1 .set-toggle");' +
				'if (!$toggle.prop("checked")) {' +
					'$toggle.prop("checked", true);' +
					'if (typeof loadSets === "function") loadSets("#p1");' +
				'}' +
				// Use the calc's loadPreset which handles val + change + display
				'loadPreset("#p1", setId);' +
			'}' +
			'setTimeout(doLoad, 200);' +
		'})();';
		document.head.appendChild(script);
		document.head.removeChild(script);
	}

	function importSet(data) {
		var paste      = data.set || '';
		var teamName   = data.teamName || 'My Custom Set';
		var gen        = getGen();
		var species    = data.species || getSpeciesFromPaste(paste);
		var cleanPaste = stripTeamHeader(paste);

		console.log('[NCP] import: species='+species+' team='+teamName+' gen='+gen);

		// Clear the hash so it doesn't re-import on reload
		history.replaceState(null, '', window.location.pathname + window.location.search);

		var spreadNameEl = document.getElementById('spreadName');
		var customMonEl  = document.getElementById('customMon');
		if (!spreadNameEl || !customMonEl) {
			showNotification('Could not find the custom set form fields.', 'error');
			return;
		}

		try {
			var alreadyExists = findExistingSet(gen, species, teamName);

			if (!alreadyExists) {
				// Fill form and save, suppressing the alert("Set(s) saved.")
				spreadNameEl.value = teamName;
				customMonEl.value  = cleanPaste;
				var origAlert = window.alert;
				window.alert = function() {};
				window.savecustom();
				window.alert = origAlert;
				if (window.loadSetdexScript) window.loadSetdexScript();
			}

			// Always sync setdexCustom from ALL_SETDEX_CUSTOM[gen]
			if (window.ALL_SETDEX_CUSTOM && window.ALL_SETDEX_CUSTOM[gen]) {
				window.setdexCustom = window.ALL_SETDEX_CUSTOM[gen];
			}

			// Find the actual stored species key
			var actualSpecies = findSavedSpecies(gen, species, teamName) || species;
			console.log('[NCP] actualSpecies:', actualSpecies, 'in setdex:', actualSpecies in (window.setdex||{}), 'in setdexCustom:', window.setdexCustom && actualSpecies in window.setdexCustom);

			// Delay to ensure all async setdex updates have settled
			setTimeout(function() {
				loadIntoPanel(actualSpecies, teamName);
			}, 500);
			var msg = alreadyExists
				? '"' + teamName + '" loaded into left panel!'
				: '✓ Imported "' + teamName + '" (' + actualSpecies + ') and loaded into left panel!';
			showNotification(msg, alreadyExists ? 'info' : 'success');
		} catch(e) {
			console.error('[NCP] import failed:', e);
			showNotification('Import failed — check console.', 'error');
		}
	}

	var _imported = false;

	function run() {
		if (_imported) return;
		var data = getHashData();
		if (!data) return;
		_imported = true;
		waitForCalc(function(){ importSet(data); });
	}

	// Run after calc initializes
	setTimeout(run, 1500);

	console.log('[NCP Auto-Import] v1.2 loaded.');
})();
