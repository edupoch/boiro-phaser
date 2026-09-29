// Descarga y guarda en memoria los PNG de los chunks HD (~30 MB en total), sin decodificarlos
// ni subirlos a la GPU. SpriteLod pide cada chunk con load(): si el blob ya está, no hay red.
// En segundo plano se descargan los demás, de los más cercanos a la cámara a los más lejanos,
// solo mientras SpriteLod no esté esperando nada (para no competir con la carga bajo demanda).

type BlobItem = {
    key: string;
    url: string;
    // Centro del chunk en el mundo, para ordenar la descarga en segundo plano.
    x: number;
    y: number;
};

export type HdBlobStoreOptions = {
    // Descargas simultáneas en segundo plano (las bajo demanda no tienen este límite).
    concurrency?: number;
    // Espera desde start() hasta la primera descarga en segundo plano (ms).
    startDelay?: number;
    // Cada cuánto se reordena lo pendiente según la posición de la cámara (ms).
    resortInterval?: number;
};

export class HdBlobStore
{
    private readonly options: Required<HdBlobStoreOptions>;
    private readonly items = new Map<string, BlobItem>();
    private readonly blobs = new Map<string, Blob>();
    private readonly inflight = new Map<string, Promise<Blob>>();
    // Claves que fallaron en segundo plano: se dejan para la carga bajo demanda.
    private readonly failed = new Set<string>();
    private pending: BlobItem[] = [];
    private backgroundInflight = 0;
    private startAt = Infinity;
    private lastSort = -Infinity;
    private totalBytes = 0;
    private enabled = true;
    private urlSuffix = '';

    constructor (options: HdBlobStoreOptions = {})
    {
        this.options = {
            concurrency: 2,
            startDelay: 3000,
            resortInterval: 1000,
            ...options,
        };
    }

    add (key: string, url: string, x: number, y: number): void
    {
        if (!this.items.has(key)) {
            this.items.set(key, { key, url, x, y });
        }
    }

    // Arranca la descarga en segundo plano tras startDelay, salvo que el usuario pida ahorrar datos.
    start (): void
    {
        const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
        if (connection?.saveData) {
            return;
        }

        this.startAt = performance.now() + this.options.startDelay;
    }

    get (key: string): Blob | undefined
    {
        return this.blobs.get(key);
    }

    // Blob del chunk: el guardado, la descarga que ya esté en curso o una nueva.
    load (key: string): Promise<Blob>
    {
        const blob = this.blobs.get(key);
        if (blob) {
            return Promise.resolve(blob);
        }

        return this.inflight.get(key) ?? this.fetch(this.items.get(key)!);
    }

    // Llamado cada frame. Con busy, no se empiezan descargas nuevas en segundo plano.
    update (busy: boolean, centerX: number, centerY: number): void
    {
        const now = performance.now();
        if (!this.enabled || busy || now < this.startAt) {
            return;
        }

        if (now - this.lastSort > this.options.resortInterval) {
            this.lastSort = now;
            this.pending = [...this.items.values()]
                .filter((item) => !this.blobs.has(item.key) && !this.inflight.has(item.key) && !this.failed.has(item.key))
                .sort((a, b) => Math.hypot(a.x - centerX, a.y - centerY) - Math.hypot(b.x - centerX, b.y - centerY));
        }

        while (this.backgroundInflight < this.options.concurrency && this.pending.length > 0) {
            const item = this.pending.shift()!;
            if (this.blobs.has(item.key) || this.inflight.has(item.key)) {
                continue;
            }

            this.backgroundInflight += 1;
            this.fetch(item)
                .catch(() => this.failed.add(item.key))
                .finally(() => {
                    this.backgroundInflight -= 1;
                });
        }
    }

    private fetch (item: BlobItem): Promise<Blob>
    {
        const promise = fetch(`${item.url}${this.urlSuffix}`)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.blob();
            })
            .then((blob) => {
                this.blobs.set(item.key, blob);
                this.totalBytes += blob.size;
                return blob;
            })
            .finally(() => {
                this.inflight.delete(item.key);
            });

        this.inflight.set(item.key, promise);
        return promise;
    }

    // Para el benchmark: vacía lo descargado y activa o pausa la descarga en segundo plano.
    reset (clear: boolean, enabled: boolean, urlSuffix: string): void
    {
        if (clear) {
            this.blobs.clear();
            this.failed.clear();
            this.totalBytes = 0;
        }

        this.enabled = enabled;
        this.urlSuffix = urlSuffix;
        this.lastSort = -Infinity;
    }

    setEnabled (enabled: boolean): void
    {
        this.enabled = enabled;
    }

    getStats (): { blobs: number; total: number; megabytes: number; failed: number }
    {
        return {
            blobs: this.blobs.size,
            total: this.items.size,
            megabytes: Math.round(this.totalBytes / (1024 * 1024) * 10) / 10,
            failed: this.failed.size,
        };
    }

    destroy (): void
    {
        this.enabled = false;
        this.pending = [];
        this.blobs.clear();
        this.items.clear();
    }
}
