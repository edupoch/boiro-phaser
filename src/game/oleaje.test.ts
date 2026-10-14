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

// Sin variación entre olas, para probar la forma de una sola ola.
const fija = { ...OLEAJE, VARIACION: 0 };
const pico = (k: number) => oleaje((k + OLEAJE.SUBIDA) * PERIODO_MS);

describe('oleaje', () => {
    it('nunca baja de 1 ni pasa de la ola más alta posible', () => {
        for (const t of muestras(-PERIODO_MS, 3 * PERIODO_MS)) {
            const escala = oleaje(t);
            expect(escala).toBeGreaterThanOrEqual(1);
            expect(escala).toBeLessThanOrEqual(1 + AMPLITUD * (1 + OLEAJE.VARIACION) + 1e-12);
        }
    });

    it('empieza cada ciclo en reposo', () => {
        for (const k of [0, 1, 5, -2]) {
            expect(oleaje(k * PERIODO_MS)).toBeCloseTo(1, 12);
        }
    });

    it('sin variación, todas las olas son iguales', () => {
        for (const t of muestras(0, PERIODO_MS, 251)) {
            expect(oleaje(t + PERIODO_MS, fija)).toBeCloseTo(oleaje(t, fija), 12);
        }
    });

    it('sube en menos tiempo del que tarda en retirarse', () => {
        const tiempos = muestras(0, PERIODO_MS, 1);
        const cima = tiempos.reduce((mejor, t) => (oleaje(t, fija) > oleaje(mejor, fija) ? t : mejor), 0);

        expect(oleaje(cima, fija)).toBeCloseTo(1 + AMPLITUD, 6);
        expect(cima).toBeLessThan(PERIODO_MS - cima);
    });

    it('acepta otra configuración', () => {
        const config = { ...OLEAJE, AMPLITUD: 0 };

        expect(oleaje(PERIODO_MS / 3, config)).toBe(1);
    });
});

describe('amplitud por ola', () => {
    const olas = Array.from({ length: 200 }, (_, i) => i - 100);

    it('cada ola queda dentro de ±VARIACION de la amplitud', () => {
        for (const k of olas) {
            const altura = pico(k) - 1;
            expect(altura).toBeGreaterThanOrEqual(AMPLITUD * (1 - OLEAJE.VARIACION) - 1e-12);
            expect(altura).toBeLessThanOrEqual(AMPLITUD * (1 + OLEAJE.VARIACION) + 1e-12);
        }
    });

    it('no todas las olas son iguales, y varían en los dos sentidos', () => {
        const alturas = olas.map((k) => pico(k) - 1);

        expect(Math.min(...alturas)).toBeLessThan(AMPLITUD * 0.9);
        expect(Math.max(...alturas)).toBeGreaterThan(AMPLITUD * 1.1);
    });

    it('la misma ola tiene siempre la misma altura', () => {
        for (const k of [0, 3, -7]) {
            expect(pico(k)).toBe(pico(k));
            expect(oleaje(k * PERIODO_MS + 1234)).toBe(oleaje(k * PERIODO_MS + 1234));
        }
    });

    it('no salta al pasar de una ola a la siguiente', () => {
        for (const k of [1, 2, 10, -3]) {
            const antes = oleaje(k * PERIODO_MS - 0.001);
            const despues = oleaje(k * PERIODO_MS + 0.001);
            expect(Math.abs(despues - antes)).toBeLessThan(1e-9);
        }
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
