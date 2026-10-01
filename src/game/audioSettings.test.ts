import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_VOLUMES,
    getVolumes,
    reloadVolumes,
    setVolume,
    subscribeVolumes,
} from './audioSettings.ts';

const memoryStorage = () => {
    const data = new Map<string, string>();
    return {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
    };
};

afterEach(() => {
    vi.unstubAllGlobals();
    reloadVolumes();
});

describe('audioSettings', () => {
    it('sin localStorage usa los valores por defecto', () => {
        vi.stubGlobal('localStorage', undefined);
        reloadVolumes();

        expect(getVolumes()).toEqual(DEFAULT_VOLUMES);
    });

    it('si localStorage lanza, usa los valores por defecto y setVolume sigue funcionando', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('bloqueado'); },
            setItem: () => { throw new Error('bloqueado'); },
        });
        reloadVolumes();

        expect(getVolumes()).toEqual(DEFAULT_VOLUMES);
        setVolume('ambient', 0.3);
        expect(getVolumes().ambient).toBe(0.3);
    });

    it('guarda, recupera y limita a 0–1', () => {
        vi.stubGlobal('localStorage', memoryStorage());
        reloadVolumes();

        setVolume('effects', 0.25);
        setVolume('music', 7);
        reloadVolumes();

        expect(getVolumes()).toEqual({ ambient: 1, effects: 0.25, music: 1 });
    });

    it('ignora valores guardados que no son números', () => {
        const storage = memoryStorage();
        storage.setItem('boiro.audio', JSON.stringify({ ambient: 'alto', effects: 0.5 }));
        vi.stubGlobal('localStorage', storage);
        reloadVolumes();

        expect(getVolumes()).toEqual({ ambient: 1, effects: 0.5, music: 1 });
    });

    it('avisa a los suscriptores', () => {
        vi.stubGlobal('localStorage', memoryStorage());
        const listener = vi.fn();
        const unsubscribe = subscribeVolumes(listener);

        setVolume('ambient', 0.5);
        unsubscribe();
        setVolume('ambient', 0.6);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0][0].ambient).toBe(0.5);
    });
});
