import {isTizen} from '../platform';
import {getServerUrl, getUserId} from '../services/jellyfinApi';
import {needsLegacyCore} from './emulatorLegacy';

const KEY = 'moonfin_game_return';
const scope = () => `${getServerUrl() || ''}:${getUserId() || ''}`;
const validId = (id) => typeof id === 'string' && id.length > 0 && id.length < 4096;

// On this old Tizen engine, removing the emulator frame and forcing JS GC did
// not release native RAM. A top-level page reload did (823 MiB -> 117 MiB).
// Remember only navigation IDs, never tokens, ROMs, saves or emulator objects.
export const resetLegacyGamePage = ({library, game, system}, reload = () => window.location.reload()) => {
	if (!isTizen() || !needsLegacyCore()) return false;
	try {
		window.sessionStorage.setItem(KEY, JSON.stringify({
			owner: scope(), expires: Date.now() + 300000,
			libraryId: library?.Id, libraryName: library?.Name,
			gameId: game?.id,
			system: system ? {id: system.id, name: system.name} : null
		}));
	} catch (e) { /* Reload still releases RAM; unavailable storage returns Home. */ }
	reload();
	return true;
};

// One-shot, short-lived and account/server scoped. Never resume gameplay.
export const takeLegacyGameReturn = () => {
	try {
		const raw = window.sessionStorage.getItem(KEY);
		window.sessionStorage.removeItem(KEY);
		if (!raw || raw.length > 16384) return null;
		const saved = JSON.parse(raw);
		if (saved.owner !== scope() || !Number.isFinite(saved.expires) || saved.expires < Date.now() ||
			!validId(saved.libraryId) || !validId(saved.gameId)) return null;
		return {
			library: {Id: saved.libraryId, Name: typeof saved.libraryName === 'string' ? saved.libraryName : ''},
			gameId: saved.gameId,
			system: validId(saved.system?.id) ? {id: saved.system.id, name: saved.system.name} : null
		};
	} catch (e) { return null; }
};
