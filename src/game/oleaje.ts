// Oleaje de la orilla (docs/ideas/oleaje-orilla.md). Las capas de agua y espuma no se desplazan
// sino que se escalan (siempre ≥ 1) desde un pivote dentro del agua: todos los bordes se alejan
// de él, así que la orilla avanza hacia la arena, la diagonal del muelle se mete bajo el muro y
// los bordes inferior e izquierdo salen del mundo. Así no se abren rendijas sin tocar el SVG.
export const OLEAJE = {
    // Duración de una ola completa (subida y retirada).
    PERIODO_MS: 8000,
    // Escala máxima por encima de 1. La orilla está a 2000-2700 unidades del pivote, así que
    // 0,015 la mueve unas 30-40 unidades.
    AMPLITUD: 0.015,
    // Parte del ciclo que dura la subida; el agua tarda más en retirarse.
    SUBIDA: 0.4,
    // Retraso de la espuma respecto al agua (un cuarto del periodo): al retirarse el agua,
    // la franja blanca de arena mojada se queda un momento antes de seguirla.
    RETRASO_MS: 2000,
    // Justo debajo de la esquina donde la playa se junta con el muro (2426, 1185), en unidades del
    // mundo. Así esa esquina sube bajo el muro en vez de deslizarse por la diagonal hacia la arena,
    // que es lo que pasaba con un pivote sobre la propia diagonal.
    PIVOTE: { x: 2426, y: 3500 },
};

export type OleajeConfig = typeof OLEAJE;

// Escala de la capa en el instante `t` (ms): 1 en reposo, al principio de cada ciclo, y
// 1 + AMPLITUD en el pico. Dos medios cosenos de distinta duración, sin saltos de velocidad.
export const oleaje = (t: number, config: OleajeConfig = OLEAJE): number => {
    const { PERIODO_MS, AMPLITUD, SUBIDA } = config;
    const fase = (((t % PERIODO_MS) + PERIODO_MS) % PERIODO_MS) / PERIODO_MS;
    const forma = fase < SUBIDA
        ? (1 - Math.cos(Math.PI * fase / SUBIDA)) / 2
        : (1 + Math.cos(Math.PI * (fase - SUBIDA) / (1 - SUBIDA))) / 2;

    return 1 + AMPLITUD * forma;
};

// Escala de la espuma: la misma ola que el agua, RETRASO_MS después.
export const espuma = (t: number, config: OleajeConfig = OLEAJE): number => oleaje(t - config.RETRASO_MS, config);
