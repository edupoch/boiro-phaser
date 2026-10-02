// Utilidades comunes de las pruebas de navegador (clics reales sobre el canvas con puppeteer-core).
// Necesitan el servidor de desarrollo arrancado: usan __spriteLod (solo en DEV) e importan módulos de /src.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

export const BASE_URL = process.env.E2E_URL ?? 'http://localhost:8080/';
export const SCREENSHOTS = new URL('./screenshots/', import.meta.url).pathname;

const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    '/snap/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const launch = async () => {
    const executablePath = CHROME_CANDIDATES.find((path) => fs.existsSync(path));

    if (!executablePath) {
        throw new Error('No encuentro Chrome/Chromium: indica la ruta con CHROME_PATH=...');
    }

    fs.mkdirSync(SCREENSHOTS, { recursive: true });

    return puppeteer.launch({
        executablePath,
        headless: true,
        // WebGL por software para que Phaser funcione sin GPU.
        args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1600,900'],
        defaultViewport: { width: 1600, height: 900, deviceScaleFactor: Number(process.env.E2E_DPR ?? 1) },
    });
};

// Lleva la página hasta la escena del juego con la HUD visible. `query` se añade a la URL (p. ej. '?idleSeconds=3').
export const openGame = async (page, query = '') => {
    await page.goto(new URL(query, BASE_URL).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Comezar xogo')), { timeout: 120000 });
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Comezar xogo')).click());
    await page.waitForSelector('#hud', { timeout: 120000 });
    await page.waitForFunction(() => window.__spriteLod?.scene?.sound.get('praia'), { timeout: 120000 });
    await sleep(1000);
};

export const createChecker = () => {
    const result = { failures: 0 };
    result.check = (name, ok, detail = '') => {
        if (!ok) {
            result.failures += 1;
        }
        console.log(ok ? '    ✓' : '    ✗', name, detail ? `→ ${detail}` : '');
    };
    return result;
};

export const dialogText = (page) =>
    page.evaluate(() => document.querySelector('[role=dialog]')?.innerText.replace(/\n+/g, ' / ') ?? null);

export const hudText = (page) =>
    page.evaluate(() => document.querySelector('#hud').innerText.replace(/\n+/g, ' / '));

export const activeTab = (page) =>
    page.evaluate(() => [...document.querySelectorAll('#hud nav button')].find((b) => b.className.includes('scale-105'))?.textContent ?? '(axustes)');

// Clic de ratón real sobre un elemento (un .click() por JS no cuenta como actividad para el kiosko).
export const realClick = async (page, selector, text) => {
    const handle = await page.evaluateHandle((selector, text) =>
        [...document.querySelectorAll(selector)].find((element) =>
            !text || element.textContent.startsWith(text) || element.getAttribute('aria-label') === text), selector, text);
    const element = handle.asElement();

    if (!element) {
        throw new Error(`No encuentro ${selector} "${text ?? ''}"`);
    }

    await element.click();
    await sleep(250);
};

export const clickTab = (page, label) => realClick(page, '#hud nav button', label);

export const pressDialogButton = (page, label) => realClick(page, '[role=dialog] button', label);

// Busca un sprite pulsable, centra la cámara en un punto suyo que no tape otro objeto pulsable
// (los hit areas son rectángulos) y devuelve las coordenadas de pantalla.
// kind: 'entry' (con ficha), 'decoy' (señuelo) o 'objective' (de un objetivo abierto de la HUD).
export const findSprite = (page, kind, exclude = []) => page.evaluate(async (kind, exclude) => {
    const { CLUES, COMPANIES, COMPANY_IDS, ENTRIES, entryIdsForCompany, getEntry, getEntryForToken } = await import('/src/game/content/catalog.ts');
    const { spriteToken } = await import('/src/game/content/sprites.ts');
    const scene = window.__spriteLod.scene;

    let accepts = (token) => (kind === 'entry' ? Boolean(getEntryForToken(token)) : !getEntryForToken(token));

    if (kind === 'objective') {
        const entryIds = new Set();
        const openRows = [...document.querySelectorAll('#hud li')].filter((li) => !li.className.includes('bg-lime-100'));

        for (const li of openRows) {
            const chip = li.querySelector('span');
            const paragraphs = li.querySelectorAll('p');

            if (chip && chip.textContent !== '✓') {
                const company = COMPANY_IDS.find((id) => COMPANIES[id].name === chip.textContent);
                entryIdsForCompany(company).forEach((id) => entryIds.add(id));
            } else if (paragraphs.length === 2) {
                CLUES.find((clue) => clue.text === paragraphs[0].textContent).entryIds.forEach((id) => entryIds.add(id));
            } else {
                const name = paragraphs[0].textContent.replace(/^\d+\/\d+ /, '');
                const entry = ENTRIES.find((candidate) =>
                    candidate.plural === name || candidate.name.charAt(0).toLowerCase() + candidate.name.slice(1) === name);
                entryIds.add(entry.id);
            }
        }

        const tokens = new Set([...entryIds].flatMap((id) => getEntry(id).spriteTokens));
        accepts = (token) => tokens.has(token);
    }

    const label = [...scene.spriteImageMap.keys()].find((candidate) => {
        const token = spriteToken(candidate);
        return token && accepts(token) && !exclude.includes(candidate) && scene.spriteImageMap.get(candidate).input?.enabled;
    });

    if (!label) {
        return null;
    }

    const object = scene.spriteImageMap.get(label);
    const bounds = object.getBounds();
    const others = [...scene.spriteImageMap.values()]
        .filter((other) => other !== object && other.input?.enabled)
        .map((other) => other.getBounds());
    let pointX = bounds.centerX;
    let pointY = bounds.centerY;

    search: for (let i = 1; i < 10; i += 1) {
        for (let j = 1; j < 10; j += 1) {
            const x = bounds.x + (bounds.width * i) / 10;
            const y = bounds.y + (bounds.height * j) / 10;
            if (!others.some((other) => other.contains(x, y))) {
                pointX = x;
                pointY = y;
                break search;
            }
        }
    }

    // Con el zoom inicial (~0,24) un objeto ocupa pocos píxeles y el clic puede caer en el vecino, así que
    // se acerca la cámara como haría una persona. Cerca de los bordes del mundo el centrado queda limitado y
    // el punto puede caer bajo la HUD: entonces se prueba con más zoom.
    const camera = scene.cameras.main;
    const canvas = scene.game.canvas;
    const rect = canvas.getBoundingClientRect();
    let screen = null;

    for (const zoom of [1, 1.6, 2.4]) {
        // El zoom de la cámara va en píxeles físicos (ver src/game/renderScale.ts); estos valores, en CSS.
        camera.setZoom(Math.max(camera.zoom, zoom / scene.scale.zoom));
        camera.centerOn(pointX, pointY);
        // worldView solo se actualiza al renderizar: con frames lentos (HD subiendo) 120 ms no bastan.
        await new Promise((resolve) => setTimeout(resolve, 120));
        await new Promise((resolve) => scene.game.events.once('postrender', resolve));
        screen = {
            x: rect.left + (pointX - camera.worldView.x) * camera.zoom * (rect.width / scene.scale.width),
            y: rect.top + (pointY - camera.worldView.y) * camera.zoom * (rect.height / scene.scale.height),
        };
        if (document.elementFromPoint(screen.x, screen.y) === canvas) {
            break;
        }
    }

    return { label, ...screen };
}, kind, exclude);

// Toca un sprite con el ratón y devuelve el texto del modal que se abra (o null).
export const tapSprite = async (page, sprite) => {
    await page.mouse.click(sprite.x, sprite.y);
    await sleep(350);
    return dialogText(page);
};

// Cuántos sprites de un tipo son pulsables ahora mismo.
export const interactiveCount = (page, kind) => page.evaluate(async (kind) => {
    const { getEntryForToken } = await import('/src/game/content/catalog.ts');
    const { spriteToken } = await import('/src/game/content/sprites.ts');
    const scene = window.__spriteLod.scene;
    const objects = [...scene.spriteImageMap.entries()]
        .filter(([label]) => {
            const token = spriteToken(label);
            return token && (kind === 'entry' ? Boolean(getEntryForToken(token)) : !getEntryForToken(token));
        })
        .map(([, object]) => object);

    return { enabled: objects.filter((object) => object.input?.enabled).length, total: objects.length };
}, kind);
