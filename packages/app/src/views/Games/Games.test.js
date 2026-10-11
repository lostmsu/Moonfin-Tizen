import {render, screen, fireEvent} from '@testing-library/react';
import * as gamesApi from '../../services/gamesApi';
import {readGameHistory} from '../../utils/gameHistory';
import Games from './Games';
import GamesHome from './GamesHome';

jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {Fragment: React.Fragment, jsxDEV: (type, props, key, staticChildren) => {
		const config = key === undefined ? props : {...props, key};
		return staticChildren && Array.isArray(props.children)
			? React.createElement(type, config, ...props.children)
			: React.createElement(type, config);
	}};
});
jest.mock('@enact/i18n/$L', () => (text) => text);
jest.mock('@enact/spotlight', () => ({focus: jest.fn()}));
jest.mock('@enact/spotlight/Spottable', () => (type) => {
	const React = require('react');
	return ({spotlightId, ...props}) => React.createElement(type, {...props, 'data-spotlight-id': spotlightId});
});
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => () => {
	const React = require('react');
	return ({children, className}) => React.createElement('div', {className}, children);
});
jest.mock('@enact/sandstone/Scroller', () => {
	const React = require('react');
	return ({children}) => React.createElement('div', {}, children);
});
jest.mock('../../components/GameCard', () => {
	const React = require('react');
	return ({game, onSelect}) => React.createElement('button', {onClick: () => onSelect(game)}, game.title);
});
jest.mock('../../components/GameSystemCard', () => {
	const React = require('react');
	return ({system, onSelect}) => React.createElement('button', {onClick: () => onSelect(system)}, system.name);
});
jest.mock('../../components/LoadingSpinner', () => () => null);
jest.mock('../../services/gamesApi', () => ({getLibraries: jest.fn(), getSystems: jest.fn(), getGames: jest.fn(), gameThumbUrl: jest.fn()}));
jest.mock('../../utils/gameHistory', () => ({
	...jest.requireActual('../../utils/gameHistory'), readGameHistory: jest.fn()
}));
jest.mock('../../services/jellyfinApi', () => ({getServerUrl: () => '', getUserId: () => ''}));
jest.mock('../../services/storage', () => ({}));

const library = {Id: 'roms', Name: 'My games'};
const mermaid = {id: 'mermaid', title: 'Little Mermaid', system: 'NES'};
const nesSystem = {id: 'NES', name: 'NES', gameCount: 1};
beforeEach(() => {
	jest.clearAllMocks();
	gamesApi.getLibraries.mockResolvedValue([{id: 'roms', name: 'My games'}]);
	gamesApi.getSystems.mockResolvedValue([nesSystem]);
	gamesApi.getGames.mockResolvedValue([mermaid]);
	readGameHistory.mockResolvedValue([{libraryId: 'roms', gameId: 'mermaid', playedAt: 10}]);
});

test('recent games open real game details while console tiles still open systems', async () => {
	const onGame = jest.fn();
	const onSystem = jest.fn();
	render(<Games library={library} onSelectGame={onGame} onSelectSystem={onSystem} />);
	await screen.findByText('Recently played');
	fireEvent.click(screen.getByText('Little Mermaid'));
	expect(onGame).toHaveBeenCalledWith(library, mermaid);
	fireEvent.click(screen.getByText('NES'));
	expect(onSystem).toHaveBeenCalledWith(library, nesSystem);
});

test('no history means no invented recently played row', async () => {
	readGameHistory.mockResolvedValue([]);
	render(<Games library={library} />);
	await screen.findByText('NES');
	expect(screen.queryByText('Recently played')).toBeNull();
});

test('game-first home retains media and settings navigation', async () => {
	const onMedia = jest.fn();
	const onSettings = jest.fn();
	render(<GamesHome onMediaHome={onMedia} onSettings={onSettings} />);
	await screen.findByText('NES');
	fireEvent.click(screen.getByText('Movies & TV'));
	fireEvent.click(screen.getByText('Settings'));
	expect(onMedia).toHaveBeenCalledTimes(1);
	expect(onSettings).toHaveBeenCalledTimes(1);
});

test('a missing plugin does not trap users away from their media', async () => {
	gamesApi.getLibraries.mockRejectedValue(new Error('404'));
	const onMedia = jest.fn();
	render(<GamesHome onMediaHome={onMedia} />);
	await screen.findByText('Failed to load games');
	fireEvent.click(screen.getByText('Movies & TV'));
	expect(onMedia).toHaveBeenCalledTimes(1);
});
