import { GAME_CONFIG } from './config';

// Píxeles físicos por píxel CSS a los que se dibuja el canvas. Phaser 4 no tiene en cuenta
// devicePixelRatio: con Scale.RESIZE el canvas mide lo mismo en píxeles CSS y el navegador lo
// estira en pantallas con escalado (4K al 150-200 %, Retina), así que todo sale borroso.
// Se puede forzar con ?renderScale=1 para comparar.
export const getRenderScale = (): number => {
    const forced = Number(new URLSearchParams(window.location.search).get('renderScale'));
    if (forced > 0) {
        return forced;
    }

    return Math.min(Math.max(window.devicePixelRatio || 1, 1), GAME_CONFIG.maxRenderScale);
};
