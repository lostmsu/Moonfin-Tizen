import * as gamesApi from '../services/gamesApi';
import {getFromStorage, saveToStorage} from '../services/storage';
import {mergeGameHistory, recentGamesInLibrary, readGameHistory, recordGamePlayed} from './gameHistory';

let mockUser = 'family';
jest.mock('../services/jellyfinApi', () => ({getServerUrl: () => 'http://server', getUserId: () => mockUser}));
jest.mock('../services/gamesApi', () => ({getGameHistory: jest.fn(), putGameHistory: jest.fn()}));
jest.mock('../services/storage', () => ({getFromStorage: jest.fn(), saveToStorage: jest.fn()}));

const entry = (gameId, playedAt, libraryId = 'nes') => ({libraryId, gameId, playedAt});
beforeEach(() => {
	jest.clearAllMocks();
	mockUser = 'family';
	getFromStorage.mockResolvedValue([]);
	saveToStorage.mockResolvedValue(true);
	gamesApi.getGameHistory.mockResolvedValue([]);
	gamesApi.putGameHistory.mockResolvedValue();
});

test('deduplicates by library/game, newest first, ignores invalid data and caps history', () => {
	expect(mergeGameHistory([entry('a', 10), entry('b', 20)], [entry('a', 30), entry('a', 40, 'snes'), null, {playedAt: 1}]))
		.toEqual([entry('a', 40, 'snes'), entry('a', 30), entry('b', 20)]);
	expect(mergeGameHistory(Array.from({length: 80}, (_, i) => entry(String(i), i + 1)))).toHaveLength(50);
});

test('resolves current metadata and drops removed games or other libraries', () => {
	const games = [{id: 'a', title: 'New title'}, {id: 'b', title: 'Second'}];
	expect(recentGamesInLibrary([entry('a', 5), entry('removed', 8), entry('b', 10), entry('a', 20, 'snes')], 'nes', games))
		.toEqual([games[1], games[0]]);
});

test('merges local and server history, retaining local fallback on network failure', async () => {
	getFromStorage.mockResolvedValue([entry('a', 10)]);
	gamesApi.getGameHistory.mockResolvedValue([entry('b', 20)]);
	await expect(readGameHistory()).resolves.toEqual([entry('b', 20), entry('a', 10)]);
	gamesApi.getGameHistory.mockRejectedValue(new Error('offline'));
	await expect(readGameHistory()).resolves.toEqual([entry('a', 10)]);
});

test('records a start in a scoped local key and merges remote entries before upload', async () => {
	gamesApi.getGameHistory.mockResolvedValue([entry('older', 10)]);
	await recordGamePlayed('nes', 'mermaid');
	expect(saveToStorage.mock.calls[0][0]).toBe('moonfin_game_history:http://server:family');
	expect(gamesApi.putGameHistory.mock.calls[0][0]).toEqual([
		{libraryId: 'nes', gameId: 'mermaid', playedAt: expect.any(Number)}, entry('older', 10)
	]);
});

test('a failed remote read never overwrites server history', async () => {
	gamesApi.getGameHistory.mockRejectedValue(new Error('offline'));
	await recordGamePlayed('nes', 'mermaid');
	expect(saveToStorage).toHaveBeenCalled();
	expect(gamesApi.putGameHistory).not.toHaveBeenCalled();
});

test('an account switch during a read cancels the upload', async () => {
	gamesApi.getGameHistory.mockImplementation(async () => { mockUser = 'other'; return []; });
	await recordGamePlayed('nes', 'mermaid');
	expect(gamesApi.putGameHistory).not.toHaveBeenCalled();
});
