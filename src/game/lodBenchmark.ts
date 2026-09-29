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
    // Zoom al que va la cámara (con el zoom suavizado, el actual va por detrás).
    getZoomTarget: () => number;
    // Cancela el zoom suavizado en curso antes de colocar la cámara.
    stopZoom: () => void;
    zoomAtScreen: (screenX: number, screenY: number, deltaY: number) => void;
    clampCameraScroll: () => void;
    // Sin console.table (la batería muestra un resumen al final).
    quiet?: boolean;
};

const waitHelpers = (scene: Phaser.Scene) => {
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
    return { wait, waitUntil };
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
    const { wait, waitUntil } = waitHelpers(scene);

    // Punto de partida: nada en carga, sin HD y con toda la escena a la vista.
    await waitUntil(() => lod.getStats().loading === 0, 30000);
    options.stopZoom();
    camera.setZoom(options.minZoom);
    camera.centerOn(target.x, target.y);
    options.clampCameraScroll();
    await wait(300);
    lod.resetForBenchmark(options.bustCache, options.keepBlobs);
    await wait(500);

    const transitionsBefore = lod.getTransitionCount();

    while (options.getZoomTarget() < scenario.zoom - 1e-3) {
        camera.preRender();
        const screenX = (target.x - camera.worldView.x) * camera.zoom;
        const screenY = (target.y - camera.worldView.y) * camera.zoom;
        // El último clic se recorta para terminar justo en el zoom del escenario.
        const deltaY = Math.max(-100, -Math.log(scenario.zoom / options.getZoomTarget()) / 0.008);
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
    if (!options.quiet) {
        console.table(result);
    }
    return result;
};

export type LodSuiteOptions = Omit<LodBenchmarkOptions, 'name' | 'bustCache' | 'keepBlobs' | 'quiet'> & {
    // Repeticiones de cada escenario en cada configuración.
    repeats: number;
};

// Recorre el mapa a zoom 2 en tres pasadas horizontales, con la HD precargada, para ver cómo se
// comporta la caché con un presupuesto dado: pico de memoria, peor frame y frames lentos.
const runPanTest = async (scene: Phaser.Scene, lod: SpriteLod, options: LodSuiteOptions, budgetMb: number) =>
{
    const camera = scene.cameras.main;
    const { wait, waitUntil } = waitHelpers(scene);
    const worldWidth = 6804;
    const worldHeight = 3742.2;
    const speed = 900; // unidades del mundo por segundo

    await waitUntil(() => lod.getStats().loading === 0, 30000);
    lod.setDebugOptions({ budgetBytes: budgetMb * 1024 * 1024 });
    lod.resetForBenchmark(false, true);
    options.stopZoom();
    camera.setZoom(2);

    let peakMb = 0;
    let worstFrame = 0;
    let slowFrames = 0;
    let frames = 0;
    const onUpdate = () => {
        const delta = scene.game.loop.rawDelta;
        frames += 1;
        worstFrame = Math.max(worstFrame, delta);
        if (delta > 100) {
            slowFrames += 1;
        }
        peakMb = Math.max(peakMb, lod.getStats().megabytes);
    };

    const rows = [0.2, 0.5, 0.8];
    camera.centerOn(0, worldHeight * rows[0]);
    options.clampCameraScroll();
    await wait(1500);
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

    const start = performance.now();
    for (let row = 0; row < rows.length; row += 1) {
        const leftToRight = row % 2 === 0;
        let x = leftToRight ? 0 : worldWidth;
        let last = performance.now();
        while (leftToRight ? x < worldWidth : x > 0) {
            await wait(16);
            const now = performance.now();
            x += (leftToRight ? 1 : -1) * speed * (now - last) / 1000;
            last = now;
            camera.centerOn(x, worldHeight * rows[row]);
            options.clampCameraScroll();
        }
    }

    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    const final = lod.getStats();

    return {
        presupuestoMb: budgetMb,
        duracionS: Math.round((performance.now() - start) / 100) / 10,
        picoMb: peakMb,
        finalMb: final.megabytes,
        peorFrameMs: Math.round(worstFrame),
        framesLentos: slowFrames,
        frames,
    };
};

const environment = (scene: Phaser.Scene, lod: SpriteLod) =>
{
    const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const gl = renderer.gl;
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    const options = lod.getDebugOptions();

    return {
        navegador: navigator.userAgent,
        gpu: gl ? gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'canvas',
        maxTexture: gl?.getParameter(gl.MAX_TEXTURE_SIZE),
        pantalla: `${screen.width}x${screen.height}`,
        juego: `${scene.scale.width}x${scene.scale.height}`,
        dpr: devicePixelRatio,
        presupuestoMb: Math.round(options.budgetBytes / (1024 * 1024)),
        subidasPorFrame: options.maxUploadsPerFrame,
        msSubidaPorFrame: options.uploadBudgetMs,
    };
};

// Batería completa para medir en otro equipo con un solo comando: espera a la precarga, pasa los
// tres escenarios en cuatro configuraciones, prueba la caché con dos presupuestos y devuelve un JSON.
export const runLodSuite = async (
    scene: Phaser.Scene,
    lod: SpriteLod,
    options: LodSuiteOptions,
): Promise<string> =>
{
    const { wait, waitUntil } = waitHelpers(scene);
    const initial = lod.getDebugOptions();
    const log = (message: string) => console.log(`%c[lodSuite] ${message}`, 'color:#0a7');

    log('Esperando a que termine la precarga de la HD…');
    let lastLogged = -1;
    await waitUntil(() => {
        const { blobs, total } = lod.getStats().blobs;
        const tenth = Math.floor(10 * blobs / total);
        if (tenth !== lastLogged) {
            lastLogged = tenth;
            log(`Precarga: ${blobs}/${total}`);
        }
        return blobs === total;
    }, 600000);

    const configs: { name: string; debug: Parameters<SpriteLod['setDebugOptions']>[0]; keepBlobs: boolean }[] = [
        { name: 'todo', debug: { useZoomIntent: true, useImageBitmap: true }, keepBlobs: true },
        { name: 'sinIntencion', debug: { useZoomIntent: false, useImageBitmap: true }, keepBlobs: true },
        { name: 'loader', debug: { useZoomIntent: true, useImageBitmap: false }, keepBlobs: true },
        // La última, porque vacía los blobs precargados.
        { name: 'sinPrecarga', debug: { useZoomIntent: true, useImageBitmap: true }, keepBlobs: false },
    ];

    const runs: Record<string, unknown>[] = [];
    const pans = [];
    for (const config of configs) {
        // La prueba de caché va antes de la configuración sin precarga, mientras la HD sigue precargada.
        if (!config.keepBlobs) {
            lod.setDebugOptions({ useZoomIntent: true, useImageBitmap: true });
            for (const budgetMb of [768, 384]) {
                log(`Recorrido del mapa a zoom 2 con presupuesto de ${budgetMb} MB…`);
                pans.push(await runPanTest(scene, lod, options, budgetMb));
            }
        }

        lod.setDebugOptions({ ...config.debug, budgetBytes: initial.budgetBytes });
        for (const name of Object.keys(SCENARIOS)) {
            for (let i = 0; i < options.repeats; i += 1) {
                log(`${config.name} · ${name} (${i + 1}/${options.repeats})`);
                const result = await runLodBenchmark(scene, lod, {
                    ...options,
                    name,
                    bustCache: true,
                    keepBlobs: config.keepBlobs,
                    quiet: true,
                });
                runs.push({ config: config.name, ...result });
                await wait(300);
            }
        }
    }

    lod.setDebugOptions({
        useZoomIntent: initial.useZoomIntent,
        useImageBitmap: initial.useImageBitmap,
        budgetBytes: initial.budgetBytes,
    });

    const keys = ['hastaHdMs', 'peorFrameMs', 'subidasEnPeorFrame', 'msSubidaEnPeorFrame', 'chunks', 'redP50', 'procesoP50', 'subidaP50', 'subidaP95', 'memoriaMb', 'timeout'];
    const compact = runs.map((run) => ({
        config: run.config,
        escenario: run.escenario,
        ...Object.fromEntries(keys.map((key) => [key, run[key]])),
    }));

    console.table(compact);
    console.table(pans);

    const json = JSON.stringify({ equipo: environment(scene, lod), escenarios: compact, recorridos: pans });
    log('Listo. Si lo lanzaste con copy(await __lodSuite()), el resultado ya está en el portapapeles; si no, copia la línea siguiente (clic derecho → Copiar mensaje) y pégala en el chat:');
    console.log(json);
    return json;
};
