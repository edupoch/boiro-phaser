// Tabla de modos del spec: pestañas, confirmaciones, ficha de exploración y señuelos según el modo.
import {
    SCREENSHOTS,
    activeTab,
    clickTab,
    dialogText,
    findSprite,
    hudText,
    interactiveCount,
    pressDialogButton,
    realClick,
    sleep,
    tapSprite,
} from './helpers.mjs';

export const name = 'modos y pestañas';

export const run = async (page, check) => {
    let decoys = await interactiveCount(page, 'decoy');
    const entries = await interactiveCount(page, 'entry');
    check('idle: señuelos desactivados', decoys.enabled === 0, `${decoys.enabled}/${decoys.total}`);
    check('idle: fichas activas', entries.enabled === entries.total, `${entries.enabled}/${entries.total}`);

    const ficha = await tapSprite(page, await findSprite(page, 'entry'));
    await page.screenshot({ path: `${SCREENSHOTS}modes-ficha-exploracion.png` });
    check('idle: ficha de exploración, sin titular', /^[^/]+ \/ SABÍAS QUE\.\.\. \/ .* \/ Fabricado por \/ .* \/ Continuar explorando$/.test(ficha ?? ''), ficha);
    await pressDialogButton(page, 'Continuar explorando');

    await clickTab(page, 'Exploración');
    check('idle → Exploración, sin confirmación', (await dialogText(page)) === null && (await activeTab(page)) === 'Exploración');

    await clickTab(page, 'Xogo');
    const confirmB = await dialogText(page);
    check('explore → Xogo pide la confirmación B', confirmB === 'Seguro? / Isto fará que comeces unha nova partida / Si / Non', confirmB);
    await page.mouse.click(800, 450);
    await sleep(300);
    check('con la confirmación abierta, el mapa no responde', (await dialogText(page)) === confirmB);
    await pressDialogButton(page, 'Non');
    check('"Non" no cambia nada', (await dialogText(page)) === null && (await activeTab(page)) === 'Exploración');

    await clickTab(page, 'Xogo');
    await pressDialogButton(page, 'Si');
    check('"Si" empieza el nivel 1', (await activeTab(page)) === 'Xogo 1/3');
    decoys = await interactiveCount(page, 'decoy');
    check('game: señuelos activos', decoys.enabled === decoys.total, `${decoys.enabled}/${decoys.total}`);

    await tapSprite(page, await findSprite(page, 'decoy'));
    await pressDialogButton(page, 'Continuar xogando');
    await clickTab(page, 'Inicio');
    const home = await hudText(page);
    check('game: Inicio muestra "Reiniciar xogo" y "Continuar xogando"', /Reiniciar xogo \/ Continuar xogando$/.test(home), home);
    await realClick(page, '#hud button', 'Continuar xogando');
    check('"Continuar xogando" abre la pestaña Xogo', (await activeTab(page)) === 'Xogo 1/3');

    await clickTab(page, 'Inicio');
    await realClick(page, '#hud button', 'Reiniciar xogo');
    check('"Reiniciar xogo" pide la confirmación A', (await dialogText(page)) === 'Seguro? / Isto fará que perdas todos os teus avances / Si / Non');
    await pressDialogButton(page, 'Non');
    check('"Non" conserva los errores', ((await tapSprite(page, await findSprite(page, 'decoy'))) ?? '').includes('Quédanche 3 intentos'));
    await pressDialogButton(page, 'Continuar xogando');

    await clickTab(page, 'Inicio');
    await realClick(page, '#hud button', 'Reiniciar xogo');
    await pressDialogButton(page, 'Si');
    check('"Si" reinicia en Xogo 1/3', (await activeTab(page)) === 'Xogo 1/3');
    check('tras reiniciar, intentos completos', ((await tapSprite(page, await findSprite(page, 'decoy'))) ?? '').includes('Quédanche 4 intentos'));
    await pressDialogButton(page, 'Continuar xogando');

    await clickTab(page, 'Exploración');
    check('game → Exploración pide la confirmación A', ((await dialogText(page)) ?? '').includes('perdas todos os teus avances'));
    await pressDialogButton(page, 'Non');
    check('"Non" sigue en la partida', (await hudText(page)).includes('Xogo 1/3'));
    await clickTab(page, 'Exploración');
    await pressDialogButton(page, 'Si');
    check('"Si" pasa a exploración', (await activeTab(page)) === 'Exploración' && (await hudText(page)).startsWith('Inicio / Xogo / Exploración / Podes explorar'));
    decoys = await interactiveCount(page, 'decoy');
    check('explore: señuelos desactivados', decoys.enabled === 0, `${decoys.enabled}/${decoys.total}`);
};
