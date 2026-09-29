import * as Phaser from 'phaser';

import { HdBlobStore } from './HdBlobStore';

// Nivel de detalle (LOD) de los sprites.
//
// Los atlas a 1x están siempre cargados. Con zoom alto, cada sprite visible cambia a su versión HD
// (rasterizada a hdScale en utils/split.js), troceada en chunks que se cargan bajo demanda solo
// para la zona visible y se liberan por LRU cuando superan el presupuesto de memoria.
//
// - Sprites de un chunk (la mayoría, incluidos los objetos interactivos): se cambia la textura del
//   mismo Image, así que input, animaciones y profundidad no se ven afectados.
// - Sprites de varios chunks: un Container con los chunks copia la transformación del objeto base
//   cada frame y se dibuja justo encima de él; el base se oculta mientras la HD está completa.
//
// Los PNG se descargan a través de HdBlobStore, que además los precarga todos en segundo plano
// (solo los bytes, sin decodificar), así que al hacer zoom la red normalmente ya no interviene.
// Se decodifican con createImageBitmap (fuera del hilo principal) y se suben a la GPU poco a poco
// (uploadBudgetMs por frame), para que la llegada de la HD no congele el juego en equipos lentos.

export type HdChunk = {
    key: string;
    file: string;
    // Posición y tamaño en unidades del mundo, relativos a los bounds del sprite.
    x: number;
    y: number;
    width: number;
    height: number;
    // Zona útil dentro de la textura (el resto es solape con los chunks vecinos o relleno).
    frame: { x: number; y: number; w: number; h: number };
};

type Rect = { x: number; y: number; width: number; height: number };

export type LodObject = Phaser.GameObjects.Image | Phaser.GameObjects.Container;

type LodEntry = {
    object: LodObject;
    bounds: Rect;
    chunks: HdChunk[];
    // Escala del objeto base a su tamaño normal (sin tweens); solo se usa con el Container HD.
    baseScaleX: number;
    baseScaleY: number;
    // Textura a 1x para volver desde la HD (solo sprites de un chunk).
    baseTexture?: { key: string; frame: string };
    hdContainer?: Phaser.GameObjects.Container;
    hdActive: boolean;
};

type TextureState = {
    status: 'loading' | 'ready' | 'error';
    bytes: number;
    lastUsed: number;
};

const HD_FRAME = 'hd';

// Métricas de latencia de la HD y herramientas de depuración: siempre en desarrollo y, en producción,
// solo con ?lodDebug en la URL (para medir en otros equipos desde GitHub Pages).
export const LOD_DEBUG = import.meta.env.DEV || new URLSearchParams(window.location.search).has('lodDebug');
const METRICS = LOD_DEBUG;
const MAX_SAMPLES = 2000;
// Un acercamiento que no llega a activar la HD se descarta tras este tiempo sin rueda.
const TRANSITION_IDLE_MS = 1500;
const TRANSITION_TIMEOUT_MS = 30000;

type LoadTiming = { requested: number; blobReady?: number; upload?: number };

type Transition = {
    start: number;
    lastInput: number;
    worstFrame: number;
    // Subidas a la GPU que cayeron en el peor frame y su coste síncrono total.
    worstFrameUploads: number;
    worstFrameUploadMs: number;
};

export type TransitionResult = {
    ms: number;
    worstFrame: number;
    worstFrameUploads: number;
    worstFrameUploadMs: number;
    timedOut: boolean;
};

type Summary = { count: number; p50: number; p95: number; max: number };

const summarize = (samples: number[]): Summary => {
    if (samples.length === 0) {
        return { count: 0, p50: 0, p95: 0, max: 0 };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    const round = (value: number) => Math.round(value * 10) / 10;

    return { count: sorted.length, p50: round(at(0.5)), p95: round(at(0.95)), max: round(sorted[sorted.length - 1]) };
};

const pushSample = (samples: number[], value: number): void => {
    samples.push(value);
    if (samples.length > MAX_SAMPLES) {
        samples.shift();
    }
};

const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;

const expand = (rect: Rect, marginX: number, marginY: number): Rect => ({
    x: rect.x - marginX,
    y: rect.y - marginY,
    width: rect.width + marginX * 2,
    height: rect.height + marginY * 2,
});

// Phaser 4 sube las texturas con UNPACK_FLIP_Y y UNPACK_PREMULTIPLY_ALPHA, pero WebGL ignora ambos
// con ImageBitmap: hay que pedirlos al decodificar.
const BITMAP_OPTIONS: ImageBitmapOptions = { imageOrientation: 'flipY', premultiplyAlpha: 'premultiply' };

// Comprueba una vez que el navegador respeta imageOrientation (si no, la HD saldría volteada):
// un bitmap de 1×2 con rojo arriba y azul abajo debe quedar con el azul arriba.
const checkBitmapSupport = async (): Promise<boolean> => {
    if (typeof createImageBitmap !== 'function') {
        return false;
    }

    try {
        const source = document.createElement('canvas');
        source.width = 1;
        source.height = 2;
        const sourceContext = source.getContext('2d')!;
        sourceContext.fillStyle = '#ff0000';
        sourceContext.fillRect(0, 0, 1, 1);
        sourceContext.fillStyle = '#0000ff';
        sourceContext.fillRect(0, 1, 1, 1);

        const bitmap = await createImageBitmap(source, BITMAP_OPTIONS);
        const target = document.createElement('canvas');
        target.width = 1;
        target.height = 2;
        const targetContext = target.getContext('2d')!;
        targetContext.drawImage(bitmap, 0, 0);
        bitmap.close();

        const [red, , blue] = targetContext.getImageData(0, 0, 1, 1).data;
        return blue > red;
    } catch {
        return false;
    }
};

const chunkRect = (entry: LodEntry, chunk: HdChunk): Rect => ({
    x: entry.bounds.x + chunk.x,
    y: entry.bounds.y + chunk.y,
    width: chunk.width,
    height: chunk.height,
});

export type SpriteLodOptions = {
    basePath: string;
    // Zoom a partir del que se activa la HD y por debajo del que se desactiva (histéresis).
    enterZoom?: number;
    exitZoom?: number;
    // Margen de precarga alrededor de la vista, en fracción del tamaño de la vista.
    prefetchMargin?: number;
    // Margen en unidades del mundo para que las animaciones (±20) no dejen ver el hueco.
    visibleMargin?: number;
    // Memoria máxima de texturas HD (incluye mipmaps) antes de liberar las menos usadas.
    budgetBytes?: number;
    // Fracción del presupuesto que se conserva en caché mientras la HD está desactivada.
    idleBudgetRatio?: number;
    // Chunks que se piden (descarga + decodificación) a la vez.
    maxConcurrentLoads?: number;
    // Subidas a la GPU por frame: al menos una y, mientras no se pase de uploadBudgetMs,
    // hasta maxUploadsPerFrame. En equipos lentos sale una por frame; en rápidos, varias.
    maxUploadsPerFrame?: number;
    uploadBudgetMs?: number;
    // false: decodifica y sube con el loader de Phaser, en el hilo principal (para comparar).
    useImageBitmap?: boolean;
    // Cada cuánto se recalcula qué chunks hacen falta (ms).
    updateInterval?: number;
};

export class SpriteLod
{
    private readonly scene: Phaser.Scene;
    private readonly options: Required<SpriteLodOptions>;
    private readonly entries: LodEntry[] = [];
    private readonly textures = new Map<string, TextureState>();
    private readonly queue: { chunk: HdChunk }[] = [];
    private readonly queuedKeys = new Set<string>();
    // Frame útil de cada chunk en carga, para crearlo en la textura al terminar.
    private readonly pendingFrames = new Map<string, HdChunk['frame']>();
    private hdEnabled = false;
    private totalBytes = 0;
    private lastUpdate = -Infinity;
    private dirty = true;
    private inflight = 0;
    private readonly blobs = new HdBlobStore();
    // Object URL de cada chunk en carga, para revocarlo al terminar.
    private readonly objectUrls = new Map<string, string>();
    private destroyed = false;
    private readonly bitmapSupport: Promise<boolean>;
    // Chunks ya decodificados esperando su turno para subir a la GPU.
    private readonly uploadQueue: { key: string; bitmap: ImageBitmap }[] = [];
    // Bitmap de cada textura HD subida (Phaser lo conserva como fuente); se cierra al liberarla.
    private readonly bitmaps = new Map<string, ImageBitmap>();
    // Subidas desde el último frame, para atribuir los frames largos.
    private frameUploads = 0;
    private frameUploadMs = 0;
    private readonly timings = new Map<string, LoadTiming>();
    private readonly samples = { network: [] as number[], process: [] as number[], upload: [] as number[] };
    private transition: Transition | null = null;
    private lastTransition: TransitionResult | null = null;
    private transitionCount = 0;

    constructor (scene: Phaser.Scene, options: SpriteLodOptions)
    {
        this.scene = scene;
        this.options = {
            enterZoom: 1.05,
            exitZoom: 0.95,
            prefetchMargin: 0.25,
            visibleMargin: 32,
            budgetBytes: 768 * 1024 * 1024,
            idleBudgetRatio: 0.25,
            maxConcurrentLoads: 6,
            maxUploadsPerFrame: 4,
            uploadBudgetMs: 4,
            useImageBitmap: true,
            updateInterval: 100,
            ...options,
        };

        this.bitmapSupport = this.options.useImageBitmap ? checkBitmapSupport() : Promise.resolve(false);
        if (METRICS && this.options.useImageBitmap) {
            this.bitmapSupport.then((supported) => {
                if (!supported) {
                    console.warn('[SpriteLod] createImageBitmap no disponible o sin imageOrientation: se usa el loader');
                }
            });
        }

        scene.load.on(Phaser.Loader.Events.FILE_COMPLETE, this.handleFileComplete, this);
        scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleFileError, this);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    }

    register (object: LodObject, bounds: Rect, chunks: HdChunk[] | undefined): void
    {
        if (!chunks || chunks.length === 0) {
            return;
        }

        const entry: LodEntry = {
            object,
            bounds,
            chunks,
            baseScaleX: object.scaleX,
            baseScaleY: object.scaleY,
            hdActive: false,
        };

        if (chunks.length === 1 && object instanceof Phaser.GameObjects.Image) {
            entry.baseTexture = { key: object.texture.key, frame: object.frame.name };
        }

        this.entries.push(entry);

        for (const chunk of chunks) {
            this.blobs.add(
                chunk.key,
                `${this.options.basePath}${chunk.file}`,
                bounds.x + chunk.x + chunk.width / 2,
                bounds.y + chunk.y + chunk.height / 2,
            );
        }
    }

    // Empieza a descargar en segundo plano todos los chunks registrados.
    startBackgroundDownload (): void
    {
        this.blobs.start();
    }

    update (time: number): void
    {
        const camera = this.scene.cameras.main;

        this.blobs.update(this.inflight > 0 || this.queue.length > 0, camera.midPoint.x, camera.midPoint.y);

        // La transformación de los Container HD se copia cada frame para seguir las animaciones.
        for (const entry of this.entries) {
            if (entry.hdActive && entry.hdContainer) {
                this.syncContainer(entry);
            }
        }

        if (METRICS && this.transition) {
            // rawDelta es la duración del frame anterior, que incluye las subidas contadas desde entonces.
            const delta = this.scene.game.loop.rawDelta;
            if (delta > this.transition.worstFrame) {
                this.transition.worstFrame = delta;
                this.transition.worstFrameUploads = this.frameUploads;
                this.transition.worstFrameUploadMs = this.frameUploadMs;
            }
        }
        this.frameUploads = 0;
        this.frameUploadMs = 0;

        this.processUploads();

        if (!this.dirty && time - this.lastUpdate < this.options.updateInterval) {
            return;
        }

        this.lastUpdate = time;
        this.dirty = false;

        if (this.hdEnabled ? camera.zoom < this.options.exitZoom : camera.zoom >= this.options.enterZoom) {
            this.hdEnabled = !this.hdEnabled;
        }

        if (!this.hdEnabled) {
            this.queue.length = 0;
            this.queuedKeys.clear();
            for (const entry of this.entries) {
                this.setHdActive(entry, false);
            }
            // Sin HD en pantalla solo guardamos una caché pequeña para volver a acercar rápido.
            this.evict(new Set(), this.options.budgetBytes * this.options.idleBudgetRatio);
            if (METRICS && this.transition && performance.now() - this.transition.lastInput > TRANSITION_IDLE_MS) {
                this.transition = null;
            }
            return;
        }

        const view = camera.worldView;
        const visibleRect = expand(view, this.options.visibleMargin, this.options.visibleMargin);
        const neededRect = expand(
            view,
            view.width * this.options.prefetchMargin,
            view.height * this.options.prefetchMargin,
        );
        const neededKeys = new Set<string>();
        let allVisibleReady = true;

        for (const entry of this.entries) {
            if (!intersects(entry.bounds, neededRect)) {
                this.setHdActive(entry, false);
                continue;
            }

            let complete = true;
            let anyVisible = false;

            for (const chunk of entry.chunks) {
                const rect = chunkRect(entry, chunk);

                if (intersects(rect, neededRect)) {
                    neededKeys.add(chunk.key);
                    this.request(chunk);
                }

                if (intersects(rect, visibleRect)) {
                    anyVisible = true;
                    if (this.textures.get(chunk.key)?.status !== 'ready') {
                        complete = false;
                    }
                }
            }

            this.setHdActive(entry, anyVisible && complete);

            if (METRICS && anyVisible && !entry.hdActive && !this.hasError(entry)) {
                allVisibleReady = false;
            }
        }

        if (METRICS && this.transition) {
            this.checkTransition(allVisibleReady);
        }

        for (const key of neededKeys) {
            const state = this.textures.get(key);
            if (state) {
                state.lastUsed = time;
            }
        }

        // Lo que ya no está en la zona necesaria no se sigue pidiendo.
        for (let i = this.queue.length - 1; i >= 0; i -= 1) {
            if (!neededKeys.has(this.queue[i].chunk.key)) {
                this.queuedKeys.delete(this.queue[i].chunk.key);
                this.queue.splice(i, 1);
            }
        }

        this.pumpQueue();
        this.evict(neededKeys, this.options.budgetBytes);
    }

    private request (chunk: HdChunk): void
    {
        if (this.textures.has(chunk.key) || this.queuedKeys.has(chunk.key)) {
            return;
        }

        this.queuedKeys.add(chunk.key);
        this.queue.push({ chunk });
    }

    private pumpQueue (): void
    {
        while (this.inflight < this.options.maxConcurrentLoads && this.queue.length > 0) {
            const { chunk } = this.queue.shift()!;
            this.queuedKeys.delete(chunk.key);
            this.textures.set(chunk.key, { status: 'loading', bytes: 0, lastUsed: this.scene.time.now });
            this.pendingFrames.set(chunk.key, chunk.frame);
            this.inflight += 1;
            if (METRICS) {
                this.timings.set(chunk.key, { requested: performance.now() });
            }

            this.blobs.load(chunk.key).then(
                (blob) => this.loadTexture(chunk.key, blob),
                () => this.failLoad(chunk.key, chunk.file),
            );
        }
    }

    // Con el blob ya en memoria: se decodifica fuera del hilo principal y se encola para subir.
    private loadTexture (key: string, blob: Blob): void
    {
        if (this.destroyed) {
            return;
        }

        if (METRICS) {
            const timing = this.timings.get(key);
            if (timing) {
                timing.blobReady = performance.now();
            }
        }

        this.bitmapSupport
            .then((supported) => {
                if (!supported) {
                    throw new Error('ImageBitmap no soportado');
                }
                return createImageBitmap(blob, BITMAP_OPTIONS);
            })
            .then(
                (bitmap) => {
                    if (this.destroyed || this.textures.get(key)?.status !== 'loading') {
                        bitmap.close();
                        return;
                    }
                    this.uploadQueue.push({ key, bitmap });
                },
                () => this.loadTextureWithLoader(key, blob),
            );
    }

    // Sube a la GPU texturas decodificadas dentro del presupuesto de tiempo del frame.
    private processUploads (): void
    {
        const frameStart = performance.now();

        for (let i = 0; i < this.options.maxUploadsPerFrame && this.uploadQueue.length > 0; i += 1) {
            if (i > 0 && performance.now() - frameStart >= this.options.uploadBudgetMs) {
                break;
            }

            const { key, bitmap } = this.uploadQueue.shift()!;
            const start = performance.now();
            // Phaser acepta cualquier fuente con width/height que texImage2D admita.
            this.scene.textures.addImage(key, bitmap as unknown as HTMLImageElement);
            const upload = performance.now() - start;
            this.bitmaps.set(key, bitmap);
            this.recordUpload(key, upload);
            this.finishTexture(key);
        }
    }

    private recordUpload (key: string, upload: number): void
    {
        this.frameUploads += 1;
        this.frameUploadMs += upload;
        const timing = this.timings.get(key);
        if (timing) {
            timing.upload = upload;
        }
    }

    // Alternativa sin createImageBitmap: el loader de Phaser decodifica y sube en el hilo principal.
    private loadTextureWithLoader (key: string, blob: Blob): void
    {
        if (this.destroyed) {
            return;
        }

        const url = URL.createObjectURL(blob);
        this.objectUrls.set(key, url);
        const file = new Phaser.Loader.FileTypes.ImageFile(this.scene.load, key, url);
        if (METRICS) {
            this.instrument(file);
        }
        this.scene.load.addFile(file);

        if (!this.scene.load.isLoading()) {
            this.scene.load.start();
        }
    }

    private failLoad (key: string, path: string): void
    {
        if (this.destroyed) {
            return;
        }

        const state = this.textures.get(key);
        console.warn(`[SpriteLod] No se pudo cargar ${path}`);
        this.inflight -= 1;
        if (state) {
            state.status = 'error';
        }
        this.pendingFrames.delete(key);
        this.timings.delete(key);
        this.pumpQueue();
    }

    private closeBitmap (key: string): void
    {
        this.bitmaps.get(key)?.close();
        this.bitmaps.delete(key);
    }

    private revokeObjectUrl (key: string): void
    {
        const url = this.objectUrls.get(key);
        if (url) {
            URL.revokeObjectURL(url);
            this.objectUrls.delete(key);
        }
    }

    private handleFileComplete (key: string, type: string): void
    {
        if (type !== 'image' || !this.textures.has(key)) {
            return;
        }

        this.revokeObjectUrl(key);
        this.finishTexture(key);
    }

    // La textura ya está en la GPU: se configura y se pone a disposición de los sprites.
    private finishTexture (key: string): void
    {
        const state = this.textures.get(key)!;
        this.inflight -= 1;
        const texture = this.scene.textures.get(key);
        const frame = this.pendingFrames.get(key)!;
        this.pendingFrames.delete(key);

        // Texturas potencia de 2 => Phaser usaría REPEAT y el borde se mezclaría con el lado opuesto.
        texture.setWrap(Phaser.Textures.WrapMode.CLAMP_TO_EDGE, Phaser.Textures.WrapMode.CLAMP_TO_EDGE);
        texture.add(HD_FRAME, 0, frame.x, frame.y, frame.w, frame.h);

        if (METRICS) {
            this.recordTiming(key);
        }

        const source = texture.source[0];
        state.status = 'ready';
        state.bytes = Math.round(source.width * source.height * 4 * (4 / 3));
        this.totalBytes += state.bytes;
        this.dirty = true;

        for (const entry of this.entries) {
            if (entry.hdContainer && entry.chunks.some((chunk) => chunk.key === key)) {
                this.addChunkImage(entry, entry.chunks.find((chunk) => chunk.key === key)!);
            }
        }

        this.pumpQueue();
    }

    private handleFileError (file: Phaser.Loader.File): void
    {
        const state = this.textures.get(file.key);
        if (!state) {
            return;
        }

        console.warn(`[SpriteLod] No se pudo decodificar ${file.key}`);
        this.inflight -= 1;
        this.revokeObjectUrl(file.key);
        state.status = 'error';
        this.timings.delete(file.key);
        this.pendingFrames.delete(file.key);
        this.pumpQueue();
    }

    private setHdActive (entry: LodEntry, active: boolean): void
    {
        if (entry.hdActive === active) {
            return;
        }

        const { object } = entry;

        if (entry.baseTexture && object instanceof Phaser.GameObjects.Image) {
            // Durante el muelle del hover las escalas del tween son absolutas: esperamos a que acabe.
            if (object.getData('springAnimating')) {
                return;
            }

            const chunk = entry.chunks[0];
            const previousWidth = object.frame.realWidth;
            const previousHeight = object.frame.realHeight;

            if (active) {
                object.setTexture(chunk.key, HD_FRAME);
            } else {
                object.setTexture(entry.baseTexture.key, entry.baseTexture.frame);
            }

            // Mantiene el tamaño en pantalla (y cualquier escala relativa aplicada por animaciones).
            object.setScale(
                object.scaleX * (previousWidth / object.frame.realWidth),
                object.scaleY * (previousHeight / object.frame.realHeight),
            );
            entry.hdActive = active;
            return;
        }

        if (active) {
            this.ensureContainer(entry);
            this.syncContainer(entry);
        }

        entry.hdContainer?.setVisible(active);
        object.setVisible(!active);
        entry.hdActive = active;
    }

    private ensureContainer (entry: LodEntry): void
    {
        if (entry.hdContainer) {
            return;
        }

        const container = this.scene.add.container(0, 0).setVisible(false);
        entry.hdContainer = container;

        // Justo a continuación del objeto base en la lista de dibujado, para respetar el orden de capas.
        // (moveAbove no sirve: no mueve nada si el Container ya está por encima, aunque sea al final.)
        container.setDepth(entry.object.depth);
        const displayList = this.scene.children;
        displayList.moveTo(container, displayList.getIndex(entry.object) + 1);

        for (const chunk of entry.chunks) {
            if (this.textures.get(chunk.key)?.status === 'ready') {
                this.addChunkImage(entry, chunk);
            }
        }

        this.forwardInput(entry);
    }

    // Un objeto oculto no recibe input en Phaser: si el base es interactivo, el Container HD
    // recibe los eventos en la misma área y los reenvía al base, donde están los handlers.
    private forwardInput (entry: LodEntry): void
    {
        const { object } = entry;
        const container = entry.hdContainer!;

        if (!object.input) {
            return;
        }

        const { width, height } = entry.bounds;
        const { originX, originY } = this.getOrigin(entry);
        // Las coordenadas locales de un Container se desplazan por su displayOrigin (mitad del tamaño).
        container.setSize(width, height);
        container.setInteractive(
            new Phaser.Geom.Rectangle((0.5 - originX) * width, (0.5 - originY) * height, width, height),
            Phaser.Geom.Rectangle.Contains,
        );
        container.input!.cursor = object.input.cursor;

        for (const eventName of ['pointerdown', 'pointerup', 'pointerover', 'pointerout', 'pointermove']) {
            container.on(eventName, (...args: unknown[]) => object.emit(eventName, ...args));
        }
    }

    private addChunkImage (entry: LodEntry, chunk: HdChunk): void
    {
        const container = entry.hdContainer!;
        if (container.getByName(chunk.key)) {
            return;
        }

        const { originX, originY } = this.getOrigin(entry);
        const image = this.scene.add.image(
            chunk.x - originX * entry.bounds.width,
            chunk.y - originY * entry.bounds.height,
            chunk.key,
            HD_FRAME,
        )
            .setOrigin(0, 0)
            .setDisplaySize(chunk.width, chunk.height)
            .setName(chunk.key);
        container.add(image);
    }

    private removeChunkImage (entry: LodEntry, key: string): void
    {
        const image = entry.hdContainer?.getByName(key);
        image?.destroy();
    }

    // Origen normalizado del objeto base: el de la imagen, o el pivote fijado con setPivot en los Container.
    private getOrigin (entry: LodEntry): { originX: number; originY: number }
    {
        const { object } = entry;

        if (object instanceof Phaser.GameObjects.Image) {
            return { originX: object.originX, originY: object.originY };
        }

        return {
            originX: (object.getData('pivotX') as number | undefined) ?? 0.5,
            originY: (object.getData('pivotY') as number | undefined) ?? 0.5,
        };
    }

    private syncContainer (entry: LodEntry): void
    {
        const container = entry.hdContainer!;
        const { object } = entry;

        container.setPosition(object.x, object.y);
        container.setRotation(object.rotation);
        container.setScale(object.scaleX / entry.baseScaleX, object.scaleY / entry.baseScaleY);
        container.setAlpha(object.alpha);

        if (container.depth !== object.depth) {
            container.setDepth(object.depth);
        }
    }

    // Libera las texturas HD menos usadas mientras se supere el presupuesto, sin tocar las necesarias.
    private evict (neededKeys: Set<string>, budgetBytes: number): void
    {
        if (this.totalBytes <= budgetBytes) {
            return;
        }

        const candidates = [...this.textures.entries()]
            .filter(([key, state]) => state.status === 'ready' && !neededKeys.has(key))
            .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

        for (const [key, state] of candidates) {
            if (this.totalBytes <= budgetBytes) {
                break;
            }

            for (const entry of this.entries) {
                if (!entry.chunks.some((chunk) => chunk.key === key)) {
                    continue;
                }

                this.setHdActive(entry, false);
                if (entry.hdActive) {
                    // No se pudo desactivar (animación en curso): lo dejamos para la próxima vuelta.
                    state.lastUsed = this.scene.time.now;
                    continue;
                }

                this.removeChunkImage(entry, key);
            }

            if (this.entries.some((entry) => entry.hdActive && entry.chunks.some((chunk) => chunk.key === key))) {
                continue;
            }

            this.scene.textures.remove(key);
            this.closeBitmap(key);
            this.textures.delete(key);
            this.totalBytes -= state.bytes;
        }
    }

    // --- Métricas (solo en desarrollo) ---

    // Marca el inicio de un gesto de acercamiento; el tiempo hasta HD completa se mide desde el primero.
    beginTransition (): void
    {
        if (!METRICS) {
            return;
        }

        const now = performance.now();
        if (this.transition) {
            this.transition.lastInput = now;
        } else {
            this.transition = { start: now, lastInput: now, worstFrame: 0, worstFrameUploads: 0, worstFrameUploadMs: 0 };
        }
        this.dirty = true;
    }

    private checkTransition (allVisibleReady: boolean): void
    {
        const transition = this.transition!;
        const elapsed = performance.now() - transition.start;
        const timedOut = elapsed > TRANSITION_TIMEOUT_MS;

        // Con la cola vacía y nada en vuelo, lo visible no va a cambiar hasta que se mueva la cámara.
        if (!(allVisibleReady && this.inflight === 0 && this.queue.length === 0) && !timedOut) {
            return;
        }

        this.lastTransition = {
            ms: Math.round(elapsed),
            worstFrame: Math.round(transition.worstFrame),
            worstFrameUploads: transition.worstFrameUploads,
            worstFrameUploadMs: Math.round(transition.worstFrameUploadMs),
            timedOut,
        };
        this.transitionCount += 1;
        this.transition = null;
    }

    private hasError (entry: LodEntry): boolean
    {
        return entry.chunks.some((chunk) => this.textures.get(chunk.key)?.status === 'error');
    }

    // Mide la parte síncrona de añadir la textura: creación del Image decodificado en WebGL,
    // texImage2D y generateMipmap (Phaser 4 sube la textura en el constructor de TextureSource).
    private instrument (file: Phaser.Loader.FileTypes.ImageFile): void
    {
        const addToCache = file.addToCache;
        file.addToCache = () => {
            const start = performance.now();
            addToCache.call(file);
            this.recordUpload(file.key, performance.now() - start);
        };
    }

    private recordTiming (key: string): void
    {
        const timing = this.timings.get(key);
        this.timings.delete(key);
        if (!timing || timing.blobReady === undefined || timing.upload === undefined) {
            return;
        }

        const complete = performance.now();
        // Red: hasta tener el blob (casi 0 si ya estaba precargado).
        pushSample(this.samples.network, timing.blobReady - timing.requested);
        // Proceso: espera al loader y del blob al Image listo para subir
        // (la decodificación puede ocurrir aquí o dentro de texImage2D).
        pushSample(this.samples.process, complete - timing.blobReady - timing.upload);
        pushSample(this.samples.upload, timing.upload);
    }

    // Vuelve al estado inicial para el benchmark: sin texturas HD ni métricas previas.
    // Con keepBlobs se conserva lo precargado (medir con precarga); si no, se vacía y la descarga
    // en segundo plano se pausa hasta endBenchmark() (medir sin precarga).
    resetForBenchmark (bustCache: boolean, keepBlobs: boolean): void
    {
        if (!METRICS) {
            return;
        }

        this.queue.length = 0;
        this.queuedKeys.clear();
        this.evict(new Set(), 0);

        for (const [key, state] of this.textures) {
            if (state.status === 'error') {
                this.textures.delete(key);
            }
        }

        this.samples.network.length = 0;
        this.samples.process.length = 0;
        this.samples.upload.length = 0;
        this.transition = null;
        this.lastTransition = null;
        this.blobs.reset(!keepBlobs, keepBlobs, bustCache ? `?bench=${Date.now()}` : '');
        this.dirty = true;
    }

    endBenchmark (): void
    {
        this.blobs.setEnabled(true);
    }

    getTransitionCount (): number
    {
        return this.transitionCount;
    }

    getStats (): {
        enabled: boolean;
        textures: number;
        megabytes: number;
        loading: number;
        queued: number;
        network?: Summary;
        process?: Summary;
        upload?: Summary;
        lastTransition?: TransitionResult | null;
        blobs: ReturnType<HdBlobStore['getStats']>;
    }
    {
        const stats = {
            enabled: this.hdEnabled,
            textures: [...this.textures.values()].filter((state) => state.status === 'ready').length,
            megabytes: Math.round(this.totalBytes / (1024 * 1024)),
            loading: this.inflight,
            queued: this.queue.length,
            blobs: this.blobs.getStats(),
        };

        if (!METRICS) {
            return stats;
        }

        return {
            ...stats,
            network: summarize(this.samples.network),
            process: summarize(this.samples.process),
            upload: summarize(this.samples.upload),
            lastTransition: this.lastTransition,
        };
    }

    destroy (): void
    {
        this.scene.load.off(Phaser.Loader.Events.FILE_COMPLETE, this.handleFileComplete, this);
        this.scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleFileError, this);
        this.destroyed = true;
        this.blobs.destroy();
        for (const { bitmap } of this.uploadQueue) {
            bitmap.close();
        }
        this.uploadQueue.length = 0;
        for (const key of [...this.objectUrls.keys()]) {
            this.revokeObjectUrl(key);
        }

        for (const key of this.textures.keys()) {
            if (this.scene.textures.exists(key)) {
                this.scene.textures.remove(key);
            }
            this.closeBitmap(key);
        }

        this.textures.clear();
        this.entries.length = 0;
    }
}
