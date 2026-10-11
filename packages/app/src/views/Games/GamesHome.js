import {useState, useEffect, useCallback} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';

import * as gamesApi from '../../services/gamesApi';
import LoadingSpinner from '../../components/LoadingSpinner';
import Games from './Games';
import css from './Games.module.less';

const Button = Spottable('button');

const GamesHome = ({onSelectSystem, onSelectGame, onMediaHome, onSettings}) => {
	const [libraries, setLibraries] = useState(null);
	const [selected, setSelected] = useState(0);
	const [error, setError] = useState(false);
	useEffect(() => {
		let cancelled = false;
		gamesApi.getLibraries().then((libs) => {
			if (!cancelled) setLibraries((libs || []).map((lib) => ({Id: lib.id, Name: lib.name})));
		}).catch(() => { if (!cancelled) { setLibraries([]); setError(true); } });
		return () => { cancelled = true; };
	}, []);
	useEffect(() => {
		if (libraries?.length === 0) Spotlight.focus('games-media-home');
	}, [libraries]);
	const selectLibrary = useCallback((ev) => setSelected(Number(ev.currentTarget.dataset.library)), []);
	const actions = (
		<div className={css.homeActions}>
			{libraries?.length > 1 && libraries.map((library, index) => (
				<Button key={library.Id} className={css.homeButton} data-library={index}
					aria-pressed={selected === index} onClick={selectLibrary}>{library.Name}</Button>
			))}
			<Button className={css.homeButton} onClick={onMediaHome} spotlightId="games-media-home">{$L('Movies & TV')}</Button>
			<Button className={css.homeButton} onClick={onSettings}>{$L('Settings')}</Button>
		</div>
	);
	if (libraries?.length) {
		return (
		<Games key={libraries[selected]?.Id} library={libraries[selected]} isHome headerActions={actions}
			onSelectSystem={onSelectSystem} onSelectGame={onSelectGame} />
		);
	}
	return (
		<div className={css.root}>
			<div className={css.header}><h1 className={css.heading}>{$L('Games')}</h1>{actions}</div>
			<div className={css.center}>{libraries === null ? <LoadingSpinner /> : (
				<div className={css.message}>{error ? $L('Failed to load games') : $L('No games found.')}</div>
			)}</div>
		</div>
	);
};

export default GamesHome;
