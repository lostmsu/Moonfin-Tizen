import * as gamesApi from '../services/gamesApi';
import {getServerUrl, getUserId} from '../services/jellyfinApi';
import {getFromStorage, saveToStorage} from '../services/storage';

const MAX_HISTORY = 50;
const scope = () => `${getServerUrl() || ''}:${getUserId() || ''}`;
const storageKey = (owner) => `moonfin_game_history:${owner}`;
let recording = Promise.resolve();

// No titles, artwork or authentication in the history. Resolve each id against
// the current library so removed ROMs disappear, and changed metadata stays fresh.
export const mergeGameHistory = (...lists) => {
	const entries = new Map();
	lists.forEach((list) => (Array.isArray(list) ? list : []).forEach((entry) => {
		if (!entry || typeof entry.libraryId !== 'string' || typeof entry.gameId !== 'string' ||
			!Number.isFinite(entry.playedAt) || entry.playedAt <= 0) return;
		const key = `${entry.libraryId}:${entry.gameId}`;
		if (!entries.has(key) || entries.get(key).playedAt < entry.playedAt) {
			entries.set(key, {libraryId: entry.libraryId, gameId: entry.gameId, playedAt: entry.playedAt});
		}
	}));
	return [...entries.values()].sort((a, b) => b.playedAt - a.playedAt).slice(0, MAX_HISTORY);
};

export const recentGamesInLibrary = (entries, libraryId, games) => {
	const catalog = new Map((games || []).map((game) => [game.id, game]));
	return mergeGameHistory(entries).filter((entry) => entry.libraryId === libraryId && catalog.has(entry.gameId))
		.slice(0, 12).map((entry) => catalog.get(entry.gameId));
};

export const readGameHistory = async () => {
	const owner = scope();
	const [local, remote] = await Promise.all([
		getFromStorage(storageKey(owner), []).catch(() => []),
		gamesApi.getGameHistory().catch(() => [])
	]);
	return scope() === owner ? mergeGameHistory(local, remote) : [];
};

// Record only after the emulator's start event, not on click or failed boot.
// Keep a local fallback, serialize launches, and never overwrite the remote
// blob after an unsuccessful read. A server/account switch cancels old writes.
export const recordGamePlayed = (libraryId, gameId) => {
	const owner = scope();
	const played = {libraryId, gameId, playedAt: Date.now()};
	recording = recording.catch(() => {}).then(async () => {
		if (scope() !== owner) return;
		const key = storageKey(owner);
		const local = await getFromStorage(key, []).catch(() => []);
		const entries = mergeGameHistory(local, [played]);
		await saveToStorage(key, entries).catch(() => {});
		try {
			if (scope() !== owner) return;
			const remote = await gamesApi.getGameHistory();
			if (scope() !== owner) return;
			const merged = mergeGameHistory(entries, remote);
			await saveToStorage(key, merged).catch(() => {});
			if (scope() === owner) await gamesApi.putGameHistory(merged);
		} catch (e) { /* Keep the local history while the server is unavailable. */ }
	});
	return recording;
};
