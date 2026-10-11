// Same-page launches grew the old TV WebView's RAM even after core shutdown.
// Give each game a fresh realm so exit can discard its resources together.
export const createEmulatorFrame = (selector) => {
	const host = document.querySelector(selector);
	if (!host) throw new Error('Game container not found');
	const frame = document.createElement('iframe');
	frame.setAttribute('data-moonfin-emulator', '');
	frame.setAttribute('title', 'Game');
	frame.style.cssText = 'width:100%;height:100%;border:0;display:block;';
	host.appendChild(frame);
	const child = frame.contentWindow;
	const doc = child.document;
	doc.open();
	doc.write('<!doctype html><html><head><style>html,body,#game{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style></head><body><div id="game"></div></body></html>');
	doc.close();
	const cloneKey = (target, ev) => {
		const copy = new target.KeyboardEvent(ev.type, {key: ev.key, code: ev.code, bubbles: true, cancelable: true, repeat: ev.repeat});
		Object.defineProperty(copy, 'keyCode', {value: ev.keyCode});
		Object.defineProperty(copy, 'which', {value: ev.which});
		copy.moonfinRelayed = true;
		return copy;
	};
	// Parent menus get first refusal. Keys they consume never reach the core;
	// game keys still work whether the native remote focuses the app or frame.
	const fromParent = (ev) => {
		if (!ev.moonfinRelayed && !ev.defaultPrevented) child.dispatchEvent(cloneKey(child, ev));
	};
	const fromChild = (ev) => {
		if (ev.moonfinRelayed) return;
		const copy = cloneKey(window, ev);
		window.dispatchEvent(copy);
		if (copy.defaultPrevented) {
			ev.preventDefault();
			ev.stopImmediatePropagation();
		}
	};
	['keydown', 'keyup'].forEach((type) => {
		window.addEventListener(type, fromParent);
		child.addEventListener(type, fromChild, true);
	});
	let released;
	return {window: child, document: doc, release: () => {
		if (released) return released;
		frame.removeAttribute('data-moonfin-emulator');
		['keydown', 'keyup'].forEach((type) => {
			window.removeEventListener(type, fromParent);
			child.removeEventListener(type, fromChild, true);
		});
		// EmulatorJS flushes SRAM and calls Module.abort one second after exit.
		// Normal Exit awaits this before navigating away and unmounting the host.
		released = new Promise((resolve) => setTimeout(() => { frame.remove(); resolve(); }, 1200));
		return released;
	}};
};
