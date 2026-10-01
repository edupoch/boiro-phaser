// Kiosko: aviso "Segues aí?" y reinicio por inactividad, con los tiempos acortados por URL.
import { SCREENSHOTS, clickTab, dialogText, findSprite, hudText, realClick, sleep, tapSprite } from './helpers.mjs';

const IDLE = 3;
const WARNING = 3;

const camera = (page) => page.evaluate(() => {
    const main = window.__spriteLod.scene.cameras.main;
    return JSON.stringify({ zoom: main.zoom.toFixed(4), x: main.scrollX.toFixed(1), y: main.scrollY.toFixed(1) });
});

export const name = 'inactividad';

export const query = `?idleSeconds=${IDLE}&idleWarningSeconds=${WARNING}`;

export const run = async (page, check) => {
    const initialCamera = await camera(page);

    await sleep((IDLE + WARNING + 1) * 1000);
    check('con todo en el estado inicial no hay aviso', (await dialogText(page)) === null);

    await realClick(page, '#btn-comezamos');
    await page.mouse.move(900, 400);
    await page.mouse.down();
    for (let i = 1; i <= 10; i += 1) {
        await page.mouse.move(900 - i * 20, 400 - i * 10);
        await sleep(16);
    }
    await page.mouse.up();
    await page.mouse.wheel({ deltaY: -200 });
    await sleep(600);
    check('la cámara se ha movido', (await camera(page)) !== initialCamera);

    await sleep((IDLE + 0.8) * 1000);
    const warning = await dialogText(page);
    await page.screenshot({ path: `${SCREENSHOTS}idle-segues-ai.png` });
    check('aviso "Segues aí?" con cuenta atrás', /^Segues aí\? \/ Volvemos ao inicio en \d s \/ Sigo aquí$/.test(warning ?? ''), warning);
    await page.mouse.move(1010, 310);
    await sleep(400);
    check('la actividad cierra el aviso y conserva la partida', (await dialogText(page)) === null && (await hudText(page)).includes('Xogo 1/3'));

    await sleep((IDLE + WARNING + 1) * 1000);
    const home = await hudText(page);
    check('sin respuesta: sin modales y en Inicio', (await dialogText(page)) === null && /^Inicio \/ Xogo \/ Exploración .*Comecemos!$/.test(home), home);
    check('sin respuesta: cámara inicial', (await camera(page)) === initialCamera, await camera(page));

    await clickTab(page, 'Exploración');
    const ficha = await tapSprite(page, await findSprite(page, 'entry'));
    check('ficha abierta en exploración', (ficha ?? '').endsWith('Continuar explorando'));
    await sleep((IDLE + WARNING + 1) * 1000);
    check('también se reinicia con una ficha abierta', (await dialogText(page)) === null && (await hudText(page)).endsWith('Comecemos!'));
};
