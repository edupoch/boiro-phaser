// Modo xogo: arrastre frente a toque, partida completa con 1 error y derrota.
import {
    SCREENSHOTS,
    activeTab,
    dialogText,
    findSprite,
    hudText,
    pressDialogButton,
    realClick,
    sleep,
    tapSprite,
} from './helpers.mjs';

// Acierta objetivos hasta que sale el modal final. Devuelve su texto (o null si se atasca).
const playToEnd = async (page, check) => {
    let tried = [];

    for (let step = 0; step < 80; step += 1) {
        const target = await findSprite(page, 'objective', tried);

        if (!target) {
            check('quedan objetivos que se pueden pulsar', false, await hudText(page));
            return null;
        }

        tried.push(target.label);
        const text = await tapSprite(page, target);

        if (!text) {
            // Ficha ya llena para ese objetivo: no penaliza ni abre modal.
            continue;
        }

        if (/Completaches o xogo/.test(text)) {
            return text;
        }

        if (/Pasar ao nivel/.test(text)) {
            const nextLevel = text.match(/Pasar ao nivel (\d)/)[1];
            await page.screenshot({ path: `${SCREENSHOTS}game-fin-nivel-${Number(nextLevel) - 1}.png` });
            await pressDialogButton(page, 'Pasar ao nivel');
            check(`la pestaña pasa a Xogo ${nextLevel}/3`, (await activeTab(page)) === `Xogo ${nextLevel}/3`, await activeTab(page));
            tried = [];
            continue;
        }

        await pressDialogButton(page, 'Continuar xogando');
    }

    return null;
};

export const name = 'modo xogo';

export const run = async (page, check) => {
    await realClick(page, '#btn-comezamos');

    const first = await findSprite(page, 'objective');
    const scrollBefore = await page.evaluate(() => window.__spriteLod.scene.cameras.main.scrollX);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i += 1) {
        await page.mouse.move(first.x + i * 8, first.y + i * 3);
        await sleep(16);
    }
    await page.mouse.up();
    await sleep(300);
    const scrollAfter = await page.evaluate(() => window.__spriteLod.scene.cameras.main.scrollX);
    check('arrastrar empezando sobre un objeto mueve el mapa y no lo pulsa',
        (await dialogText(page)) === null && scrollAfter !== scrollBefore);

    const decoy = await findSprite(page, 'decoy');
    check('un señuelo es un error', /Obxecto incorrecto! \/ Quédanche 4 intentos/.test((await tapSprite(page, decoy)) ?? ''));
    await pressDialogButton(page, 'Continuar xogando');

    const final = await playToEnd(page, check);
    await page.screenshot({ path: `${SCREENSHOTS}game-final.png` });
    check('final con "1 erro" y el resumen por empresa',
        /^Completaches o xogo con 1 erro! \/ Xa sabes máis da nosa empresa ca nós :\) \/ (Rotogal|Egalsa|JJ Chicolino|Oziona) \//.test(final ?? ''), final);

    await pressDialogButton(page, 'Explorar o mapa');
    check('"Explorar o mapa" pasa a exploración', (await activeTab(page)) === 'Exploración' && (await dialogText(page)) === null);

    // Derrota: 5 señuelos seguidos.
    await realClick(page, '#hud nav button', 'Inicio');
    await realClick(page, '#btn-comezamos');
    const expected = ['Quédanche 4 intentos', 'Quédanche 3 intentos', 'Quédanche 2 intentos', 'Quédache 1 intento'];
    const used = [];

    for (const message of expected) {
        const sprite = await findSprite(page, 'decoy', used);
        used.push(sprite.label);
        check(message, ((await tapSprite(page, sprite)) ?? '').includes(message));
        await pressDialogButton(page, 'Continuar xogando');
    }

    const last = await findSprite(page, 'decoy', used);
    const lost = await tapSprite(page, last);
    await page.screenshot({ path: `${SCREENSHOTS}game-perdiches.png` });
    check('al 5.º error, "Perdiches!"', lost === 'Perdiches! / Esgotaches todos os intentos / Volver a xogar / Explorar o mapa', lost);

    await pressDialogButton(page, 'Volver a xogar');
    const restarted = await tapSprite(page, await findSprite(page, 'decoy'));
    check('"Volver a xogar" empieza con los intentos completos', (restarted ?? '').includes('Quédanche 4 intentos'), restarted);
};
