import { useEffect, useReducer, useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import FichaModal from './components/FichaModal';
import GameMessages from './components/GameMessages';
import Hud, { type TabId } from './components/Hud';
import { EventBus } from './game/EventBus';
import { createInitialState, gameReducer, type Modal } from './game/play/gameReducer';
import { newSeed } from './game/play/rng';

const playSfx = (key: 'click' | 'success' | 'error') => EventBus.emit('play-sfx', key);

function App()
{
    //  References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [isGameScene, setIsGameScene] = useState(false);
    const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialState());
    const [activeTab, setActiveTab] = useState<TabId>('inicio');
    const previousModal = useRef<Modal | null>(null);

    // Event emitted from the PhaserGame component
    const currentScene = (scene: Phaser.Scene) => {
        setIsGameScene(scene.scene.key === 'Game');
    }

    useEffect(() => {
        const handleObjectClicked = (label: string) => dispatch({ type: 'tap', label });
        const handleGameReset = () => dispatch({ type: 'idleReset' });

        EventBus.on('object-clicked', handleObjectClicked);
        EventBus.on('game-reset', handleGameReset);

        return () => {
            EventBus.removeListener('object-clicked', handleObjectClicked);
            EventBus.removeListener('game-reset', handleGameReset);
        };
    }, []);

    // Los sonidos de acierto y error se derivan del modal que acaba de abrirse (el reducer no tiene efectos).
    useEffect(() => {
        const modal = state.modal;

        if (modal && modal !== previousModal.current) {
            if (modal.kind === 'won' || (modal.kind === 'ficha' && modal.variant !== 'explore')) {
                playSfx('success');
            } else if (modal.kind === 'wrong' || modal.kind === 'lost') {
                playSfx('error');
            }
        }

        previousModal.current = modal;
    }, [state.modal]);

    const startGame = () => {
        dispatch({ type: 'start', seed: newSeed() });
        setActiveTab('xogo');
    };

    const handleTabClick = (tab: TabId) => {
        playSfx('click');

        if (tab === 'xogo' && state.mode !== 'game') {
            startGame();
            return;
        }

        setActiveTab(tab);
    };

    const handleStart = () => {
        playSfx('click');
        startGame();
    };

    const handleNextLevel = () => {
        dispatch({ type: 'nextLevel', seed: newSeed() });
        setActiveTab('xogo');
    };

    const handlePlayAgain = () => {
        startGame();
    };

    const handleExplore = () => {
        dispatch({ type: 'enterExplore' });
        setActiveTab('exploracion');
    };

    const modal = state.modal;

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
            {isGameScene && (
                <Hud state={state} activeTab={activeTab} onTabClick={handleTabClick} onStart={handleStart} />
            )}
            {modal?.kind === 'ficha' && (
                <FichaModal
                    entryId={modal.entryId}
                    variant={modal.variant}
                    level={state.level}
                    onContinue={() => dispatch({ type: 'closeModal' })}
                    onNextLevel={handleNextLevel}
                />
            )}
            {(modal?.kind === 'wrong' || modal?.kind === 'lost' || modal?.kind === 'won') && (
                <GameMessages
                    state={state}
                    modal={modal}
                    onContinue={() => dispatch({ type: 'closeModal' })}
                    onPlayAgain={handlePlayAgain}
                    onExplore={handleExplore}
                />
            )}
        </div>
    )
}

export default App
