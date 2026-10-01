// Volúmenes que elige el personal del kiosko en Axustes. No son estado de partida: el reinicio no los toca
// y se guardan en localStorage (con try/catch, porque puede no estar disponible).

export type VolumeKey = 'ambient' | 'effects' | 'music';

export type Volumes = Readonly<Record<VolumeKey, number>>;

const STORAGE_KEY = 'boiro.audio';

export const DEFAULT_VOLUMES: Volumes = { ambient: 1, effects: 1, music: 1 };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const load = (): Volumes => {
    try {
        const stored = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? 'null') as Partial<Record<VolumeKey, unknown>> | null;
        const read = (key: VolumeKey): number =>
            (typeof stored?.[key] === 'number' ? clamp01(stored[key] as number) : DEFAULT_VOLUMES[key]);

        return { ambient: read('ambient'), effects: read('effects'), music: read('music') };
    } catch {
        return DEFAULT_VOLUMES;
    }
};

let volumes: Volumes = load();
const listeners = new Set<(volumes: Volumes) => void>();

export const getVolumes = (): Volumes => volumes;

export const setVolume = (key: VolumeKey, value: number): void => {
    volumes = { ...volumes, [key]: clamp01(value) };

    try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(volumes));
    } catch {
        // Sin almacenamiento el volumen se aplica igual, solo que no sobrevive a una recarga.
    }

    listeners.forEach((listener) => listener(volumes));
};

export const subscribeVolumes = (listener: (volumes: Volumes) => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

// Solo para tests: vuelve a leer del almacenamiento.
export const reloadVolumes = (): void => {
    volumes = load();
};
