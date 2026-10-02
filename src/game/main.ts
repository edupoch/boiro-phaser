import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { GameScene } from './scenes/GameScene';
import { StartScreen } from './scenes/StartScreen';
import { WEBGL, Game, Scale } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { getRenderScale } from './renderScale';

const renderScale = getRenderScale();

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: WEBGL, // Obligatorio — mipmaps no funcionan en Canvas 2D
    antialias: true,
    mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
    // El canvas se dibuja a píxeles físicos y se muestra a tamaño CSS (zoom 1/renderScale), así que
    // las coordenadas de juego y del puntero van en píxeles físicos.
    width: Math.round(window.innerWidth * renderScale),
    height: Math.round(window.innerHeight * renderScale),
    parent: 'game-container',
    backgroundColor: '#e0f2fe',
    scale: {
        // RESIZE haría el canvas del tamaño CSS del contenedor; el redimensionado va en StartGame.
        mode: Scale.NONE,
        zoom: 1 / renderScale,
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

    const game = new Game({ ...config, parent });

    // Sustituye al redimensionado de Scale.RESIZE. Recalcula la escala porque devicePixelRatio
    // cambia con el zoom del navegador o al pasar la ventana a otra pantalla.
    const resize = () => {
        const scale = getRenderScale();
        game.scale.setZoom(1 / scale);
        game.scale.resize(Math.round(window.innerWidth * scale), Math.round(window.innerHeight * scale));
    };
    window.addEventListener('resize', resize);
    game.events.once('destroy', () => window.removeEventListener('resize', resize));

    return game;

}

export default StartGame;
