import { describe, expect, it } from 'vitest';
import { OLEAJE, espuma, oleaje } from './oleaje.ts';

const { PERIODO_MS, AMPLITUD } = OLEAJE;
const muestras = (desde: number, hasta: number, paso = 37) => {
    const tiempos: number[] = [];
    for (let t = desde; t < hasta; t += paso) {
        tiempos.push(t);
    }
    return tiempos;
};

describe('oleaje', () => {
    it('nunca baja de 1 ni pasa de 1 + AMPLITUD', () => {
        for (const t of muestras(-PERIODO_MS, 3 * PERIODO_MS)) {
            const escala = oleaje(t);
            expect(escala).toBeGreaterThanOrEqual(1);
            expect(escala).toBeLessThanOrEqual(1 + AMPLITUD + 1e-12);
        }
    });

    it('empieza cada ciclo en reposo', () => {
        for (const k of [0, 1, 5, -2]) {
            expect(oleaje(k * PERIODO_MS)).toBeCloseTo(1, 12);
        }
    });

    it('es periódica', () => {
        for (const t of muestras(0, PERIODO_MS, 251)) {
            expect(oleaje(t + PERIODO_MS)).toBeCloseTo(oleaje(t), 12);
        }
    });

    it('sube en menos tiempo del que tarda en retirarse', () => {
        const tiempos = muestras(0, PERIODO_MS, 1);
        const pico = tiempos.reduce((mejor, t) => (oleaje(t) > oleaje(mejor) ? t : mejor), 0);

        expect(oleaje(pico)).toBeCloseTo(1 + AMPLITUD, 6);
        expect(pico).toBeLessThan(PERIODO_MS - pico);
    });

    it('acepta otra configuración', () => {
        const config = { ...OLEAJE, AMPLITUD: 0 };

        expect(oleaje(PERIODO_MS / 3, config)).toBe(1);
    });
});

describe('espuma', () => {
    it('repite la ola del agua un cuarto de ciclo después', () => {
        expect(OLEAJE.RETRASO_MS).toBe(PERIODO_MS / 4);

        for (const t of muestras(0, 2 * PERIODO_MS, 251)) {
            expect(espuma(t)).toBe(oleaje(t - OLEAJE.RETRASO_MS));
        }
    });

    it('sigue en reposo cuando el agua ya ha empezado a subir', () => {
        expect(oleaje(PERIODO_MS / 8)).toBeGreaterThan(1);
        expect(espuma(PERIODO_MS / 8)).toBeLessThan(oleaje(PERIODO_MS / 8));
    });
});
