import { useEffect, useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import ObjectFoundModal from './components/ObjectFoundModal';
import GameModal from './components/GameModal';
import { EventBus } from './game/EventBus';
import {
    createInitialGameSnapshot,
    markFoundInSnapshot,
    type GameStateSnapshot,
} from './game/GameState';

function App()
{
    //  References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [isGameScene, setIsGameScene] = useState(false);
    const [foundObjectName, setFoundObjectName] = useState('');
    const [isObjectFoundModalOpen, setIsObjectFoundModalOpen] = useState(false);
    const [gameSnapshot, setGameSnapshot] = useState<GameStateSnapshot>(() => createInitialGameSnapshot());

    // Event emitted from the PhaserGame component
    const currentScene = (scene: Phaser.Scene) => {
        setIsGameScene(scene.scene.key === 'Game');
    }

    useEffect(() => {
        const handleGameReset = () => {
            setGameSnapshot(createInitialGameSnapshot());
        };

        const handleObjectClicked = (targetKey: string) => {
            setGameSnapshot((previousSnapshot) => {
                const { snapshot, foundTarget } = markFoundInSnapshot(previousSnapshot, targetKey);

                if (foundTarget) {
                    setFoundObjectName(foundTarget.name);
                    setIsObjectFoundModalOpen(true);
                    EventBus.emit('object-found', foundTarget);
                }

                return snapshot;
            });
        };

        EventBus.on('game-reset', handleGameReset);
        EventBus.on('object-clicked', handleObjectClicked);

        return () => {
            EventBus.removeListener('game-reset', handleGameReset);
            EventBus.removeListener('object-clicked', handleObjectClicked);
        };
    }, []);

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
            <ObjectFoundModal
                isOpen={isObjectFoundModalOpen}
                objectName={foundObjectName}
                onClose={() => setIsObjectFoundModalOpen(false)}
            />
            {isGameScene && <GameModal gameSnapshot={gameSnapshot} />}
        </div>
    )
}

export default App
