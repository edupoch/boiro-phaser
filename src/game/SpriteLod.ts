import * as Phaser from 'phaser';

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
    // Chunks que se piden a la vez al loader.
    maxConcurrentLoads?: number;
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
            updateInterval: 100,
            ...options,
        };

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
    }

    update (time: number): void
    {
        const camera = this.scene.cameras.main;

        // La transformación de los Container HD se copia cada frame para seguir las animaciones.
        for (const entry of this.entries) {
            if (entry.hdActive && entry.hdContainer) {
                this.syncContainer(entry);
            }
        }

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
        let added = false;

        while (this.inflight < this.options.maxConcurrentLoads && this.queue.length > 0) {
            const { chunk } = this.queue.shift()!;
            this.queuedKeys.delete(chunk.key);
            this.textures.set(chunk.key, { status: 'loading', bytes: 0, lastUsed: this.scene.time.now });
            this.pendingFrames.set(chunk.key, chunk.frame);
            this.scene.load.image(chunk.key, `${this.options.basePath}${chunk.file}`);
            this.inflight += 1;
            added = true;
        }

        if (added && !this.scene.load.isLoading()) {
            this.scene.load.start();
        }
    }

    private handleFileComplete (key: string, type: string): void
    {
        const state = this.textures.get(key);
        if (type !== 'image' || !state) {
            return;
        }

        this.inflight -= 1;
        const texture = this.scene.textures.get(key);
        const frame = this.pendingFrames.get(key)!;
        this.pendingFrames.delete(key);

        // Texturas potencia de 2 => Phaser usaría REPEAT y el borde se mezclaría con el lado opuesto.
        texture.setWrap(Phaser.Textures.WrapMode.CLAMP_TO_EDGE, Phaser.Textures.WrapMode.CLAMP_TO_EDGE);
        texture.add(HD_FRAME, 0, frame.x, frame.y, frame.w, frame.h);

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

        console.warn(`[SpriteLod] No se pudo cargar ${file.url}`);
        this.inflight -= 1;
        state.status = 'error';
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
            this.textures.delete(key);
            this.totalBytes -= state.bytes;
        }
    }

    getStats (): { enabled: boolean; textures: number; megabytes: number; loading: number; queued: number }
    {
        return {
            enabled: this.hdEnabled,
            textures: [...this.textures.values()].filter((state) => state.status === 'ready').length,
            megabytes: Math.round(this.totalBytes / (1024 * 1024)),
            loading: this.inflight,
            queued: this.queue.length,
        };
    }

    destroy (): void
    {
        this.scene.load.off(Phaser.Loader.Events.FILE_COMPLETE, this.handleFileComplete, this);
        this.scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleFileError, this);

        for (const key of this.textures.keys()) {
            if (this.scene.textures.exists(key)) {
                this.scene.textures.remove(key);
            }
        }

        this.textures.clear();
        this.entries.length = 0;
    }
}
