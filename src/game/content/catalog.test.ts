import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config.ts';
import {
    CLUES,
    COMPANIES,
    COMPANY_IDS,
    ENTRIES,
    entryIdsForCompany,
    getEntry,
    spriteCountForEntry,
    totalForEntries,
} from './catalog.ts';
import { spriteCountByToken } from './sprites.ts';
import { plural, TEXTS } from './texts.ts';

describe('catálogo', () => {
    it('cada token de ficha existe en el atlas', () => {
        const missing = ENTRIES.flatMap((entry) => entry.spriteTokens)
            .filter((token) => !spriteCountByToken.has(token));

        expect(missing).toEqual([]);
    });

    it('ningún token está en dos fichas', () => {
        const tokens = ENTRIES.flatMap((entry) => entry.spriteTokens);

        expect(new Set(tokens).size).toBe(tokens.length);
    });

    it('los ids de ficha son únicos y cada ficha tiene sprites', () => {
        expect(new Set(ENTRIES.map((entry) => entry.id)).size).toBe(ENTRIES.length);

        ENTRIES.forEach((entry) => expect(spriteCountForEntry(entry), entry.id).toBeGreaterThan(0));
    });

    it('los textos ya están limpios', () => {
        ENTRIES.forEach((entry) => {
            expect(entry.text, entry.id).not.toMatch(/sabías que|atopáchelo/i);
            expect(entry.headline, entry.id).not.toBe('');
        });
    });

    it('cada pista apunta a fichas existentes y pide al menos 2 objetos', () => {
        CLUES.forEach((clue) => {
            clue.entryIds.forEach((id) => expect(getEntry(id), `${clue.id} → ${id}`).toBeDefined());
            expect(totalForEntries(clue.entryIds), clue.id).toBeGreaterThanOrEqual(2);
        });
    });

    it('cada empresa tiene color', () => {
        COMPANY_IDS.forEach((id) => expect(COMPANIES[id].color, id).toMatch(/^#[0-9a-f]{6}$/i));
    });

    it('la configuración se puede cumplir con el catálogo', () => {
        expect(GAME_CONFIG.level1Types).toBeLessThanOrEqual(ENTRIES.length);
        expect(GAME_CONFIG.level2Clues).toBeLessThanOrEqual(CLUES.length);

        const playableCompanies = COMPANY_IDS.filter((id) =>
            totalForEntries(entryIdsForCompany(id)) >= GAME_CONFIG.level3MinObjects);

        expect(playableCompanies.length).toBeGreaterThan(0);
    });
});

describe('textos', () => {
    it('plural', () => {
        expect(plural(1, 'erro', 'erros')).toBe('1 erro');
        expect(plural(0, 'erro', 'erros')).toBe('0 erros');
        expect(TEXTS.won.title(1)).toBe('Completaches o xogo con 1 erro!');
        expect(TEXTS.wrong.attemptsLeft(1)).toBe('Quédache 1 intento');
        expect(TEXTS.wrong.attemptsLeft(3)).toBe('Quédanche 3 intentos');
    });
});
