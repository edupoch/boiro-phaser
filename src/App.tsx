import { useEffect, useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import ObjectFoundModal from './components/ObjectFoundModal';
import GameModal from './components/GameModal';
import { EventBus } from './game/EventBus';
import { FoundTargetResult } from './game/GameState';

function App()
{
    //  References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [isGameScene, setIsGameScene] = useState(false);
    const [foundObjectName, setFoundObjectName] = useState('');
    const [isObjectFoundModalOpen, setIsObjectFoundModalOpen] = useState(false);

    // Event emitted from the PhaserGame component
    const currentScene = (scene: Phaser.Scene) => {
        setIsGameScene(scene.scene.key === 'Game');
    }

    useEffect(() => {
        const handleObjectFound = (payload: FoundTargetResult) => {
            setFoundObjectName(payload.name);
            setIsObjectFoundModalOpen(true);
        };

        EventBus.on('object-found', handleObjectFound);

        return () => {
            EventBus.removeListener('object-found', handleObjectFound);
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
            {isGameScene && <GameModal />}
        </div>
    )
}

export default App
