import { useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { MainMenu } from './game/scenes/MainMenu';
import ObjectFoundModal from './components/ObjectFoundModal';
import GameModal from './components/GameModal';

function App()
{
    //  References to the PhaserGame component (game and scene are exposed)
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [isMainMenuScene, setIsMainMenuScene] = useState(false);

    const changeScene = () => {

        if(phaserRef.current)
        {     
            const scene = phaserRef.current.scene as MainMenu;
            
            if (scene)
            {
                scene.changeScene();
            }
        }
    }

    // Event emitted from the PhaserGame component
    const currentScene = (scene: Phaser.Scene) => {
        setIsMainMenuScene(scene.scene.key === 'MainMenu');
    }

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
            <ObjectFoundModal isOpen={false} onClose={() => console.log('Modal closed')} />
            {isMainMenuScene && <GameModal />}
        </div>
    )
}

export default App
