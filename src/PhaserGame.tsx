import { forwardRef, useEffect, useLayoutEffect, useRef } from 'react';
import StartGame from './game/main';
import { EventBus } from './game/EventBus';
import { gameState } from './game/GameState';

export interface IRefPhaserGame
{
    game: Phaser.Game | null;
    scene: Phaser.Scene | null;
    gameState: typeof gameState;
}

interface IProps
{
    currentActiveScene?: (scene_instance: Phaser.Scene) => void
}

export const PhaserGame = forwardRef<IRefPhaserGame, IProps>(function PhaserGame({ currentActiveScene }, ref)
{
    const game = useRef<Phaser.Game | null>(null!);

    useLayoutEffect(() =>
    {
        if (game.current === null)
        {

            game.current = StartGame("game-container");

            if (typeof ref === 'function')
            {
                ref({ game: game.current, scene: null, gameState });
            } else if (ref)
            {
                ref.current = { game: game.current, scene: null, gameState };
            }

        }

        return () =>
        {
            if (game.current)
            {
                game.current.destroy(true);
                if (game.current !== null)
                {
                    game.current = null;
                }
            }
        }
    }, [ref]);

    useEffect(() =>
    {
        EventBus.on('current-scene-ready', (scene_instance: Phaser.Scene) =>
        {
            if (currentActiveScene && typeof currentActiveScene === 'function')
            {

                currentActiveScene(scene_instance);

            }

            if (typeof ref === 'function')
            {
                ref({ game: game.current, scene: scene_instance, gameState });
            } else if (ref)
            {
                ref.current = { game: game.current, scene: scene_instance, gameState };
            }
            
        });
        return () =>
        {
            EventBus.removeListener('current-scene-ready');
        }
    }, [currentActiveScene, ref]);

    return (
        <div id="game-container"></div>
    );

});
