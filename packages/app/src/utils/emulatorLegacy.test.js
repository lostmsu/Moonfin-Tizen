import {TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder} from 'util';
import vm from 'vm';
import {needsLegacyCore, prepareLegacyRuntime, prepareLegacyWasm, patchLegacyEmulatorClass} from './emulatorLegacy';

jest.mock('@babel/standalone', () => ({transform: jest.fn((code) => ({code: code + ';/* translated */'}))}));

const samsungUA = 'Mozilla/5.0 (SMART-TV; Tizen 6.0) (KHTML, like Gecko) 76.0.3809.146/6.0 TV Safari/537.36';
const memory = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 5, 7, 1, 1, 128, 32, 128, 128, 2]);

test('recognizes Samsung Chromium and only enables the legacy path below 91', () => {
	expect(needsLegacyCore(samsungUA)).toBe(true);
	expect(needsLegacyCore('Chrome/68.0')).toBe(true);
	expect(needsLegacyCore('Chromium/90.0')).toBe(true);
	expect(needsLegacyCore('Chrome/91.0')).toBe(false);
	expect(needsLegacyCore('Chrome/120.0')).toBe(false);
	expect(needsLegacyCore('unknown')).toBe(false);
});

test('reduces only the known NES memory layout and never mutates cached bytes', () => {
	const reduced = prepareLegacyWasm(memory, 'fceumm');
	expect(reduced).not.toBe(memory);
	expect(reduced[13]).toBe(4);
	expect(memory[13]).toBe(32);
	expect(WebAssembly.validate(reduced)).toBe(true);
	expect(prepareLegacyWasm(reduced, 'fceumm')).toBe(reduced);
	expect(prepareLegacyWasm(memory, 'snes9x')).toBe(memory);
	expect(prepareLegacyWasm(new Uint8Array([0, 1]), 'fceumm')).toEqual(new Uint8Array([0, 1]));
	expect(prepareLegacyWasm(memory.slice(0, 14), 'fceumm')).toEqual(memory.slice(0, 14));
	const unknown = memory.slice();
	unknown[13] = 64;
	expect(prepareLegacyWasm(unknown, 'fceumm')).toBe(unknown);
	const binary = prepareLegacyWasm(memory.buffer, 'fceumm');
	expect(binary).toBeInstanceOf(ArrayBuffer);
	const instance = new WebAssembly.Instance(new WebAssembly.Module(reduced));
	// This fixture has no exported memory, but compiles/instantiates the same declaration.
	expect(instance).toBeInstanceOf(WebAssembly.Instance);
});

test('exports idempotent shutdown inside the core factory without app-scope helpers', () => {
	const source = 'Module["callMain"]=callMain;';
	const repaired = prepareLegacyRuntime(source, 'fceumm');
	expect(prepareLegacyRuntime(repaired, 'fceumm')).toBe(repaired);
	expect(prepareLegacyRuntime(source, 'snes9x')).toBe(source);
	expect(prepareLegacyRuntime('unknown', 'fceumm')).toBe('unknown');
	const context = {
		Module: {}, ABORT: false, callMain: () => {}, clearInterval: jest.fn(),
		Browser: {mainLoop: {pause: jest.fn()}}, JSEvents: {removeAllEventListeners: jest.fn()},
		AL: {contexts: {1: {interval: 15, audioCtx: {state: 'running', close: jest.fn(() => Promise.resolve())}}}},
		GL: {contexts: [null, {GLctx: {getExtension: () => ({loseContext: jest.fn()})}}], deleteContext: jest.fn()}
	};
	vm.runInNewContext(repaired, context);
	context.Module.abort();
	context.Module.abort();
	expect(context.ABORT).toBe(true);
	expect(context.Module.AL).toBe(context.AL);
	expect(context.Browser.mainLoop.pause).toHaveBeenCalledTimes(1);
	expect(context.JSEvents.removeAllEventListeners).toHaveBeenCalledTimes(1);
	expect(context.clearInterval).toHaveBeenCalledWith(15);
	expect(context.AL.contexts[1].audioCtx.close).toHaveBeenCalledTimes(1);
	expect(context.GL.deleteContext).toHaveBeenCalledTimes(1);
});

test('redirects all core archives/reports, keeps ROMs untouched, caches translation', async () => {
	Object.defineProperty(navigator, 'userAgent', {configurable: true, value: samsungUA});
	global.TextEncoder = NodeTextEncoder;
	global.TextDecoder = NodeTextDecoder;
	class Emulator {
		downloadFile (...args) { return args; }
		initGameCore (...args) { return args; }
		getCore () { return 'fceumm'; }
		startGameError () {}
	}
	patchLegacyEmulatorClass(Emulator);
	const wrapped = Emulator.prototype.initGameCore;
	patchLegacyEmulatorClass(Emulator);
	expect(Emulator.prototype.initGameCore).toBe(wrapped);
	const emu = new Emulator();
	const progress = () => {};
	const options = {responseType: 'arraybuffer'};
	for (const core of ['fceumm', 'snes9x', 'gambatte', 'mgba']) {
		expect(emu.downloadFile(`cores/reports/${core}.json`, progress, false, options))
			.toEqual([`https://cdn.emulatorjs.org/4.1.1/data/cores/reports/${core}.json`, progress, true, options]);
	}
	expect(emu.downloadFile('https://server/rom.nes', progress, true, options)[0]).toBe('https://server/rom.nes');
	const result = await emu.initGameCore('x?.y', memory, false);
	expect(new NodeTextDecoder().decode(result[0])).toContain('translated');
	expect(result[1][13]).toBe(4);
	await emu.initGameCore('x?.y', memory, false);
	expect(require('@babel/standalone').transform).toHaveBeenCalledTimes(1);
});
