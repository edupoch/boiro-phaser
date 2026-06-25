import { useEffect, useLayoutEffect, useRef, type Ref } from 'react';
import StartGame from './game/main';
import { EventBus } from './game/EventBus';

export interface IRefPhaserGame
{
    game: Phaser.Game | null;
    scene: Phaser.Scene | null;
}

interface IProps
{
    currentActiveScene?: (scene_instance: Phaser.Scene) => void
    ref?: Ref<IRefPhaserGame>;
}

const setPhaserGameRef = (
    ref: Ref<IRefPhaserGame> | undefined,
    value: IRefPhaserGame,
): void => {
    if (typeof ref === 'function') {
        ref(value);
        return;
    }

    if (ref) {
        ref.current = value;
    }
};

export function PhaserGame({ currentActiveScene, ref }: IProps)
{
    const game = useRef<Phaser.Game | null>(null!);

    useLayoutEffect(() =>
    {
        if (game.current === null)
        {

            game.current = StartGame("game-container");
            setPhaserGameRef(ref, { game: game.current, scene: null });

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
        const onCurrentSceneReady = (scene_instance: Phaser.Scene) =>
        {
            if (currentActiveScene && typeof currentActiveScene === 'function')
            {
                currentActiveScene(scene_instance);
            }

            setPhaserGameRef(ref, { game: game.current, scene: scene_instance });
        };

        EventBus.on('current-scene-ready', onCurrentSceneReady);

        return () =>
        {
            EventBus.removeListener('current-scene-ready', onCurrentSceneReady);
        }
    }, [currentActiveScene, ref]);

    return (
        <div id="game-container"></div>
    );
}
