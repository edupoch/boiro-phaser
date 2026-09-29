import * as Phaser from 'phaser';

import { SpriteLod } from './SpriteLod';

// Benchmark del LOD (GameScene lo importa bajo demanda solo con LOD_DEBUG).
// Desde zoom mínimo sobre un sprite, simula clics de rueda de ratón (deltaY -100 cada 100 ms)
// hasta el zoom del escenario y mide el tiempo hasta tener la HD de la vista completa.

const SCENARIOS: Record<string, { label: string; zoom: number }> = {
    padel: { label: 'P_del__g815__g815', zoom: 2.5 },
    faro: { label: 'Mar__ob_faro__g923', zoom: 2 },
    mar: { label: 'Mar__barco__g1283', zoom: 1.2 },
};

export type LodBenchmarkOptions = {
    name: string;
    // Añade un parámetro a las URL para que la red no se sirva desde la caché HTTP.
    bustCache: boolean;
    // Conserva los blobs precargados (medir con precarga) en vez de vaciarlos (medir sin precarga).
    keepBlobs: boolean;
    minZoom: number;
    getObject: (label: string) => { x: number; y: number } | undefined;
    zoomAtScreen: (screenX: number, screenY: number, deltaY: number) => void;
    clampCameraScroll: () => void;
};

export const runLodBenchmark = async (
    scene: Phaser.Scene,
    lod: SpriteLod,
    options: LodBenchmarkOptions,
): Promise<Record<string, unknown>> =>
{
    const scenario = SCENARIOS[options.name];
    const target = scenario && options.getObject(scenario.label);

    if (!scenario || !target) {
        throw new Error(`Escenario desconocido: ${options.name}. Disponibles: ${Object.keys(SCENARIOS).join(', ')}`);
    }

    const camera = scene.cameras.main;
    const wait = (ms: number) => new Promise((resolve) => scene.time.delayedCall(ms, resolve));
    const waitUntil = async (condition: () => boolean, timeoutMs: number) => {
        const start = performance.now();
        while (!condition()) {
            if (performance.now() - start > timeoutMs) {
                return false;
            }
            await wait(16);
        }
        return true;
    };

    // Punto de partida: nada en carga, sin HD y con toda la escena a la vista.
    await waitUntil(() => lod.getStats().loading === 0, 30000);
    camera.setZoom(options.minZoom);
    camera.centerOn(target.x, target.y);
    options.clampCameraScroll();
    await wait(300);
    lod.resetForBenchmark(options.bustCache, options.keepBlobs);
    await wait(500);

    const transitionsBefore = lod.getTransitionCount();

    while (camera.zoom < scenario.zoom - 1e-3) {
        camera.preRender();
        const screenX = (target.x - camera.worldView.x) * camera.zoom;
        const screenY = (target.y - camera.worldView.y) * camera.zoom;
        // El último clic se recorta para terminar justo en el zoom del escenario.
        const deltaY = Math.max(-100, -Math.log(scenario.zoom / camera.zoom) / 0.008);
        options.zoomAtScreen(screenX, screenY, deltaY);
        await wait(100);
    }

    await waitUntil(() => lod.getTransitionCount() > transitionsBefore, 35000);
    lod.endBenchmark();

    const stats = lod.getStats();
    const result = {
        escenario: options.name,
        precarga: options.keepBlobs,
        zoom: scenario.zoom,
        hastaHdMs: stats.lastTransition?.ms,
        peorFrameMs: stats.lastTransition?.worstFrame,
        subidasEnPeorFrame: stats.lastTransition?.worstFrameUploads,
        msSubidaEnPeorFrame: stats.lastTransition?.worstFrameUploadMs,
        timeout: stats.lastTransition?.timedOut ?? true,
        chunks: stats.network?.count,
        redP50: stats.network?.p50,
        redP95: stats.network?.p95,
        procesoP50: stats.process?.p50,
        procesoP95: stats.process?.p95,
        subidaP50: stats.upload?.p50,
        subidaP95: stats.upload?.p95,
        memoriaMb: stats.megabytes,
    };
    console.table(result);
    return result;
};
