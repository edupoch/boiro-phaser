import { useEffect, useReducer, useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import FichaModal from './components/FichaModal';
import GameMessages from './components/GameMessages';
import Hud, { type TabId } from './components/Hud';
import MessageModal from './components/MessageModal';
import { useIdleReset } from './components/useIdleReset';
import { TEXTS } from './game/content/texts';
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
    // Confirmación pendiente ("Seguro?"): no cambia las reglas, así que vive en React y no en el reducer.
    const [confirm, setConfirm] = useState<{ message: string; onYes: () => void } | null>(null);
    // Si la cámara se movió desde el último reinicio (lo avisa GameScene).
    const cameraMoved = useRef(false);

    // Event emitted from the PhaserGame component
    const currentScene = (scene: Phaser.Scene) => {
        setIsGameScene(scene.scene.key === 'Game');
    }

    useEffect(() => {
        const handleObjectClicked = (label: string) => dispatch({ type: 'tap', label });
        const handleGameReset = () => dispatch({ type: 'idleReset' });

        const handleCameraMoved = () => {
            cameraMoved.current = true;
        };

        EventBus.on('object-clicked', handleObjectClicked);
        EventBus.on('game-reset', handleGameReset);
        EventBus.on('camera-moved', handleCameraMoved);

        return () => {
            EventBus.removeListener('object-clicked', handleObjectClicked);
            EventBus.removeListener('game-reset', handleGameReset);
            EventBus.removeListener('camera-moved', handleCameraMoved);
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

    // Phaser activa los señuelos solo en el modo xogo.
    useEffect(() => {
        EventBus.emit('mode-changed', state.mode);
    }, [state.mode]);

    const startGame = () => {
        dispatch({ type: 'start', seed: newSeed() });
        setActiveTab('xogo');
    };

    const enterExplore = () => {
        dispatch({ type: 'enterExplore' });
        setActiveTab('exploracion');
    };

    const askConfirm = (message: string, onYes: () => void) => setConfirm({ message, onYes });

    const handleTabClick = (tab: TabId) => {
        playSfx('click');

        if (tab === 'xogo' && state.mode === 'idle') {
            startGame();
        } else if (tab === 'xogo' && state.mode === 'explore') {
            askConfirm(TEXTS.confirm.newGame, startGame);
        } else if (tab === 'exploracion' && state.mode === 'game') {
            askConfirm(TEXTS.confirm.loseProgress, enterExplore);
        } else if (tab === 'exploracion' && state.mode === 'idle') {
            enterExplore();
        } else {
            setActiveTab(tab);
        }
    };

    const handleStart = () => {
        playSfx('click');
        startGame();
    };

    const handleNextLevel = () => {
        dispatch({ type: 'nextLevel', seed: newSeed() });
        setActiveTab('xogo');
    };

    const handleRestart = () => {
        playSfx('click');
        askConfirm(TEXTS.confirm.loseProgress, startGame);
    };

    const idleCountdown = useIdleReset({
        hasSomethingToReset: () => isGameScene
            && (state.mode !== 'idle' || state.modal !== null || confirm !== null || activeTab !== 'inicio' || cameraMoved.current),
        onReset: () => {
            dispatch({ type: 'idleReset' });
            setConfirm(null);
            setActiveTab('inicio');
            cameraMoved.current = false;
            EventBus.emit('reset-camera');
        },
    });

    const modal = state.modal;

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
            {isGameScene && (
                <Hud
                    state={state}
                    activeTab={activeTab}
                    onTabClick={handleTabClick}
                    onStart={handleStart}
                    onContinue={() => handleTabClick('xogo')}
                    onRestart={handleRestart}
                />
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
                    onPlayAgain={startGame}
                    onExplore={enterExplore}
                />
            )}
            {confirm && (
                <MessageModal
                    title={TEXTS.confirm.title}
                    buttons={[
                        { label: TEXTS.confirm.yes, onClick: () => { setConfirm(null); confirm.onYes(); } },
                        { label: TEXTS.confirm.no, onClick: () => setConfirm(null), secondary: true },
                    ]}
                >
                    <p>{confirm.message}</p>
                </MessageModal>
            )}
            {idleCountdown !== null && (
                // Cualquier toque ya cuenta como actividad y cierra el aviso; el botón es solo el sitio obvio.
                <MessageModal title={TEXTS.idle.title} buttons={[{ label: TEXTS.idle.stay, onClick: () => undefined }]}>
                    <p>{TEXTS.idle.countdown(idleCountdown)}</p>
                </MessageModal>
            )}
        </div>
    )
}

export default App
