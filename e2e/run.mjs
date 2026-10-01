// Pruebas de navegador del juego, con clics reales sobre el canvas.
//
//   1. Arranca el servidor de desarrollo:  npm run dev-nolog
//   2. En otra terminal:                     npm run test:e2e [game|modes|settings|idle]
//
// Variables: E2E_URL (por defecto http://localhost:8080/) y CHROME_PATH (si no encuentra Chrome/Chromium).
// Las capturas quedan en e2e/screenshots/.
import { createChecker, launch, openGame } from './helpers.mjs';
import * as game from './game.mjs';
import * as idle from './idle.mjs';
import * as modes from './modes.mjs';
import * as settings from './settings.mjs';

const ALL = { game, modes, settings, idle };
const selected = process.argv.slice(2);
const scenarios = Object.entries(ALL).filter(([key]) => selected.length === 0 || selected.includes(key));

const browser = await launch();
let failures = 0;

try {
    for (const [, scenario] of scenarios) {
        console.log(`\n${scenario.name}`);
        // Contexto nuevo por escenario: localStorage y estado de la partida limpios.
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        page.on('pageerror', (error) => console.log('    PAGEERROR', error.message));
        const scoped = createChecker();

        try {
            await openGame(page, scenario.query ?? '');
            await scenario.run(page, scoped.check);
        } catch (error) {
            scoped.check('el escenario termina sin excepciones', false, error.message);
        }

        failures += scoped.failures;
        await context.close();
    }
} finally {
    await browser.close();
}

console.log(failures ? `\n${failures} comprobaciones fallidas` : '\nTodo correcto');
process.exit(failures ? 1 : 0);
