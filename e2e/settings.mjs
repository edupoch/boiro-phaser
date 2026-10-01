// Axustes: los sliders cambian el volumen real de Phaser y se conservan al recargar.
import { SCREENSHOTS, clickTab, openGame, sleep } from './helpers.mjs';

const setSlider = (page, index, value) => page.evaluate((index, value) => {
    const input = document.querySelectorAll('#hud input[type=range]')[index];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
}, index, value);

// `volume` lee el AudioParam, que Chrome actualiza de forma asíncrona; el valor aplicado está en currentConfig.
const ambientVolume = (page) => page.evaluate(() => window.__spriteLod.scene.sound.get('praia').currentConfig.volume);

// Volumen con el que Phaser reproduce un efecto pedido desde React.
const sfxVolume = (page, key) => page.evaluate(async (key) => {
    const sound = window.__spriteLod.scene.sound;
    const play = sound.play.bind(sound);
    let volume = null;
    sound.play = (soundKey, config) => {
        if (soundKey === key) {
            volume = config?.volume ?? 1;
        }
        return play(soundKey, config);
    };
    const { EventBus } = await import('/src/game/EventBus.ts');
    EventBus.emit('play-sfx', key);
    sound.play = play;
    return volume;
}, key);

const close = (a, b) => Math.abs(a - b) < 1e-6;

export const name = 'axustes';

export const run = async (page, check) => {
    await clickTab(page, 'Axustes');
    const labels = await page.evaluate(() => [...document.querySelectorAll('#hud label')].map((label) => label.innerText.split('\n')[0]));
    check('3 sliders', labels.join(' | ') === 'Volume do son ambiente | Volume dos efectos de son | Volume da música', labels.join(' | '));
    check('praia empieza en 0.5', close(await ambientVolume(page), 0.5));

    await setSlider(page, 0, 20);
    check('ambiente al 20 → praia a 0.1 en el momento', close(await ambientVolume(page), 0.1));
    check('efectos al 100 → volumen 1', (await sfxVolume(page, 'success')) === 1);
    await setSlider(page, 1, 0);
    check('efectos a 0 → sin sonido', (await sfxVolume(page, 'success')) === 0);
    await setSlider(page, 2, 40);
    await page.screenshot({ path: `${SCREENSHOTS}settings.png` });

    const stored = await page.evaluate(() => localStorage.getItem('boiro.audio'));
    check('guardado en localStorage', stored === '{"ambient":0.2,"effects":0,"music":0.4}', stored);

    await openGame(page);
    await sleep(300);
    check('tras recargar, praia sigue en 0.1', close(await ambientVolume(page), 0.1));
    await clickTab(page, 'Axustes');
    const values = await page.evaluate(() => [...document.querySelectorAll('#hud input[type=range]')].map((input) => input.value).join(','));
    check('tras recargar, sliders en 20,0,40', values === '20,0,40', values);
};
