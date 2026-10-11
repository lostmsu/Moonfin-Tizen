// Chromium 76 cannot run the current core's WASM interop. Keep the current
// EmulatorJS UI, but pin core archives AND build reports to the compatible set.
const CORE_ROOT = 'https://cdn.emulatorjs.org/4.1.1/data/';
let compiler;
let cachedSource;
let cachedTranslation;

export const needsLegacyCore = (ua = navigator.userAgent || '') => {
	const chrome = ua.match(/(?:Chrome|Chromium)\/([0-9]+)/) || ua.match(/like Gecko\)\s+([0-9]+)\./);
	return Boolean(chrome && Number(chrome[1]) < 91);
};

// Inserted inside the Emscripten factory. Keep this as ES5 source: serializing
// a bundled function would capture renamed variables or external Babel helpers.
const LEGACY_SHUTDOWN = `function shutdownLegacyModule() {
	if (Module.moonfinShutdownDone) return;
	Module.moonfinShutdownDone = true;
	ABORT = true;
	if (typeof Browser === 'object' && Browser.mainLoop) Browser.mainLoop.pause();
	if (typeof JSEvents === 'object') JSEvents.removeAllEventListeners();
	if (typeof AL === 'object' && AL.contexts) {
		Object.keys(AL.contexts).forEach(function (id) {
			var context = AL.contexts[id];
			if (!context) return;
			clearInterval(context.interval);
			if (context.audioCtx && context.audioCtx.state !== 'closed') {
				context.audioCtx.close().catch(function () {});
			}
		});
	}
	if (typeof GL === 'object' && GL.contexts) {
		GL.contexts.forEach(function (context, id) {
			if (!context) return;
			var lose = context.GLctx.getExtension('WEBGL_lose_context');
			if (lose) lose.loseContext();
			GL.deleteContext(id);
		});
	}
}`;

export const prepareLegacyRuntime = (source, core) => {
	const marker = 'Module["callMain"]=callMain;';
	if (core !== 'fceumm' || source.indexOf('Module["abort"]=') !== -1 || source.split(marker).length !== 2) return source;
	return source.replace(marker, marker + 'Module["AL"]=AL;Module["Browser"]=Browser;Module["GL"]=GL;Module["abort"]=' + LEGACY_SHUTDOWN + ';');
};

// The NES core unnecessarily starts at 256 MiB. Its allocator supports growth
// and the compiled data/stack fit in 32 MiB. Only rewrite the known declaration;
// leave other cores, unknown builds, maximum memory and cached bytes untouched.
export const prepareLegacyWasm = (wasm, core) => {
	if (core !== 'fceumm') return wasm;
	let bytes;
	if (wasm instanceof ArrayBuffer) bytes = new Uint8Array(wasm);
	else if (ArrayBuffer.isView(wasm)) bytes = new Uint8Array(wasm.buffer, wasm.byteOffset, wasm.byteLength);
	else return wasm;
	if (bytes.length < 8 || bytes[0] !== 0 || bytes[1] !== 97 || bytes[2] !== 115 || bytes[3] !== 109 ||
		bytes[4] !== 1 || bytes[5] !== 0 || bytes[6] !== 0 || bytes[7] !== 0) return wasm;
	let cursor = 8;
	const readUint = () => {
		let value = 0;
		for (let shift = 0; shift < 35 && cursor < bytes.length; shift += 7) {
			const byte = bytes[cursor++];
			value += (byte & 127) * Math.pow(2, shift);
			if (!(byte & 128)) return value;
		}
		throw new Error('Invalid WASM integer');
	};
	try {
		while (cursor < bytes.length) {
			const section = bytes[cursor++];
			const length = readUint();
			const end = cursor + length;
			if (end > bytes.length) return wasm;
			if (section === 5) {
				if (readUint() !== 1 || readUint() !== 1) return wasm;
				const minimumOffset = cursor;
				const minimum = readUint();
				const minimumEnd = cursor;
				const maximum = readUint();
				if (minimum !== 4096 || maximum !== 32768 || minimumEnd - minimumOffset !== 2 || cursor !== end) return wasm;
				const reduced = new Uint8Array(bytes);
				reduced[minimumOffset] = 128;
				reduced[minimumOffset + 1] = 4; // 512 pages = 32 MiB.
				return wasm instanceof ArrayBuffer ? reduced.buffer : reduced;
			}
			cursor = end;
		}
	} catch (e) { /* Unknown layouts retain their original bytes. */ }
	return wasm;
};

export const patchLegacyEmulatorClass = (Ctor) => {
	const proto = Ctor && Ctor.prototype;
	if (!needsLegacyCore() || !proto || proto.moonfinLegacyCompatibility) return;
	const download = proto.downloadFile;
	const initCore = proto.initGameCore;
	if (typeof download !== 'function' || typeof initCore !== 'function') return;
	proto.downloadFile = function (path, progress, absolute, options) {
		if (typeof path === 'string' && path.indexOf('cores/') === 0) {
			path = CORE_ROOT + path;
			absolute = true;
		}
		return download.call(this, path, progress, absolute, options);
	};
	proto.initGameCore = function (js, wasm, thread) {
		// Bundle the MIT-licensed translator locally, loading it only on old TVs.
		compiler = compiler || import('@babel/standalone');
		return compiler.then((babel) => {
			const core = this.getCore();
			const raw = typeof js === 'string' ? js : new TextDecoder().decode(js);
			const source = prepareLegacyRuntime(raw, core);
			if (source !== cachedSource) {
				cachedTranslation = babel.transform(source, {
					sourceType: 'script', babelrc: false, configFile: false, comments: false, compact: true,
					plugins: ['transform-optional-chaining', 'transform-nullish-coalescing-operator', 'transform-logical-assignment-operators']
				}).code;
				cachedSource = source;
			}
			return initCore.call(this, new TextEncoder().encode(cachedTranslation), prepareLegacyWasm(wasm, core), thread);
		}).catch((error) => {
			console.error('[Moonfin compatibility] Runtime translation failed: ' + error.message);
			this.startGameError('Could not load the TV-compatible emulator runtime.');
		});
	};
	proto.moonfinLegacyCompatibility = true;
};
