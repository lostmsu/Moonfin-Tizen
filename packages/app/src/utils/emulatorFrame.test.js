import {createEmulatorFrame} from './emulatorFrame';

const key = (target, code) => {
	const ev = new target.KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, cancelable: true});
	Object.defineProperty(ev, 'keyCode', {value: code});
	Object.defineProperty(ev, 'which', {value: code});
	return ev;
};

beforeEach(() => { document.body.innerHTML = '<div id="game"></div>'; jest.useFakeTimers(); });
afterEach(() => { document.body.innerHTML = ''; jest.useRealTimers(); });

test('builds a disposable game document and forwards parent keys once', async () => {
	const frame = createEmulatorFrame('#game');
	expect(frame.window).not.toBe(window);
	expect(frame.document.querySelector('#game')).toBeTruthy();
	const received = jest.fn();
	frame.window.addEventListener('keydown', received);
	window.dispatchEvent(key(window, 40));
	expect(received).toHaveBeenCalledTimes(1);
	expect(received.mock.calls[0][0].keyCode).toBe(40);
	const released = frame.release();
	expect(frame.release()).toBe(released);
	jest.advanceTimersByTime(1200);
	await released;
	expect(document.querySelector('iframe')).toBeNull();
	window.dispatchEvent(key(window, 40));
	expect(received).toHaveBeenCalledTimes(1);
});

test('a menu consumes a native frame key before the emulator sees it', async () => {
	const frame = createEmulatorFrame('#game');
	const received = jest.fn();
	const menu = (event) => event.preventDefault();
	window.addEventListener('keydown', menu, true);
	frame.window.addEventListener('keydown', received);
	const ev = key(frame.window, 27);
	frame.window.dispatchEvent(ev);
	expect(ev.defaultPrevented).toBe(true);
	expect(received).not.toHaveBeenCalled();
	window.removeEventListener('keydown', menu, true);
	const released = frame.release();
	jest.advanceTimersByTime(1200);
	await released;
});
