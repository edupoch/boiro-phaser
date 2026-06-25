import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { GameScene } from './scenes/GameScene';
import { StartScreen } from './scenes/StartScreen';
import { WEBGL, Game, Scale } from 'phaser';
import { Preloader } from './scenes/Preloader';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: WEBGL, // Obligatorio — mipmaps no funcionan en Canvas 2D
    antialias: true,
    mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    backgroundColor: '#e0f2fe',
    scale: {
        mode: Scale.RESIZE,
        autoCenter: Scale.CENTER_BOTH
    },
    dom: {
        createContainer: true,
    },
    scene: [
        Boot,
        Preloader,
        StartScreen,
        GameScene,
        GameOver
    ]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
