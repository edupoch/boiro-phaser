import { useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { GameScene } from './game/scenes/GameScene';
import ObjectFoundModal from './components/ObjectFoundModal';
import GameModal from './components/GameModal';

function App()
{
    //  References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [isGameScene, setIsGameScene] = useState(false);

    const changeScene = () => {

        if(phaserRef.current)
        {     
            const scene = phaserRef.current.scene as GameScene;
            
            if (scene)
            {
                scene.changeScene();
            }
        }
    }

    // Event emitted from the PhaserGame component
    const currentScene = (scene: Phaser.Scene) => {
        setIsGameScene(scene.scene.key === 'Game');
    }

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
            <ObjectFoundModal isOpen={false} onClose={() => console.log('Modal closed')} />
            {isGameScene && <GameModal />}
        </div>
    )
}

export default App
