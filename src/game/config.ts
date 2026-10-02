// Todos los números ajustables del juego. Cambiar aquí la dificultad o los tiempos del kiosko.
export const GAME_CONFIG = {
    // Tipos de objeto que hay que buscar en el nivel 1.
    level1Types: 2,
    // Pistas que hay que resolver en el nivel 2 (como mucho, las que haya en el catálogo).
    level2Clues: 2,
    // Unidades máximas que se piden de una misma ficha (p. ej. 3 de las 9 papeleiras).
    maxPerTarget: 3,
    // Intentos para toda la partida; no se reinician entre niveles.
    maxAttempts: 5,
    // Objetos mínimos que tiene que sumar una empresa para salir en el nivel 3.
    level3MinObjects: 3,
    // Segundos sin actividad antes de preguntar "Segues aí?".
    idleSeconds: 90,
    // Segundos de cuenta atrás del aviso antes de reiniciar.
    idleWarningSeconds: 15,
    // Movimiento máximo del puntero (px) para que cuente como toque y no como arrastre.
    tapMaxMovePx: 10,
    // Máximo de píxeles físicos por píxel CSS al dibujar (devicePixelRatio). Más nitidez en
    // pantallas con escalado a cambio de más píxeles que pintar.
    maxRenderScale: 2,
} as const;
