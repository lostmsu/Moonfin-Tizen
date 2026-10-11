import {isTizen} from '../platform';
import {getServerUrl, getUserId} from '../services/jellyfinApi';
import {giveControllerToGame, keepScreenOn} from '../services/video';
import {needsLegacyCore} from './emulatorLegacy';
import {resetLegacyGamePage, takeLegacyGameReturn} from './legacyGameReset';

jest.mock('../platform', () => ({isTizen: jest.fn()}));
jest.mock('../services/jellyfinApi', () => ({getServerUrl: jest.fn(), getUserId: jest.fn()}));
jest.mock('../services/video', () => ({giveControllerToGame: jest.fn(), keepScreenOn: jest.fn()}));
jest.mock('./emulatorLegacy', () => ({needsLegacyCore: jest.fn()}));

const context = {library: {Id: 'lib', Name: 'Games'}, game: {id: 'rom', token: 'never-store'}, system: {id: 'NES', name: 'NES'}};
beforeEach(() => {
	window.sessionStorage.clear();
	isTizen.mockReturnValue(true);
	needsLegacyCore.mockReturnValue(true);
	getServerUrl.mockReturnValue('http://server');
	getUserId.mockReturnValue('one');
});

test('reloads legacy Tizen and restores only one-shot, non-playing navigation', () => {
	const reload = jest.fn();
	expect(resetLegacyGamePage(context, reload)).toBe(true);
	expect(reload).toHaveBeenCalledTimes(1);
	expect(giveControllerToGame).toHaveBeenCalledWith(false);
	expect(keepScreenOn).toHaveBeenCalledWith(false);
	expect(keepScreenOn.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]);
	expect(window.sessionStorage.getItem('moonfin_game_return')).not.toContain('never-store');
	expect(takeLegacyGameReturn()).toEqual({library: context.library, gameId: 'rom', system: context.system});
	expect(takeLegacyGameReturn()).toBeNull();
});

test('does not reset modern Tizen or other platforms', () => {
	const reload = jest.fn();
	needsLegacyCore.mockReturnValue(false);
	expect(resetLegacyGamePage(context, reload)).toBe(false);
	needsLegacyCore.mockReturnValue(true);
	isTizen.mockReturnValue(false);
	expect(resetLegacyGamePage(context, reload)).toBe(false);
	expect(reload).not.toHaveBeenCalled();
});

test('does not restore across accounts or servers', () => {
	resetLegacyGamePage(context, jest.fn());
	getUserId.mockReturnValue('two');
	expect(takeLegacyGameReturn()).toBeNull();
	getUserId.mockReturnValue('one');
	resetLegacyGamePage(context, jest.fn());
	getServerUrl.mockReturnValue('http://other');
	expect(takeLegacyGameReturn()).toBeNull();
});

test('drops expired, malformed and incomplete markers', () => {
	const now = jest.spyOn(Date, 'now');
	now.mockReturnValue(1000);
	resetLegacyGamePage(context, jest.fn());
	now.mockReturnValue(302000);
	expect(takeLegacyGameReturn()).toBeNull();
	now.mockRestore();
	window.sessionStorage.setItem('moonfin_game_return', '{invalid');
	expect(takeLegacyGameReturn()).toBeNull();
	resetLegacyGamePage({library: {}, game: {}}, jest.fn());
	expect(takeLegacyGameReturn()).toBeNull();
});

test('releases RAM even if session storage is unavailable', () => {
	const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('unavailable'); });
	const reload = jest.fn();
	try {
		expect(resetLegacyGamePage(context, reload)).toBe(true);
		expect(reload).toHaveBeenCalled();
	} finally { set.mockRestore(); }
});
