import confetti from 'canvas-confetti';

const DURATION_MS = 5000;
// Por encima de los modales (z-[1000]); el canvas de confeti no recibe toques.
const DEFAULTS = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1100 };

const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

// Efecto "Fireworks" de canvas-confetti: ráfagas desde ambos lados que se van apagando.
// Devuelve una función que lo corta y borra el confeti que quede en pantalla.
export const launchFireworks = (): (() => void) => {
    const animationEnd = Date.now() + DURATION_MS;

    const interval = window.setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
            window.clearInterval(interval);
            return;
        }

        const particleCount = 50 * (timeLeft / DURATION_MS);
        // Las partículas caen, así que salen un poco por encima de un punto al azar.
        confetti({ ...DEFAULTS, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...DEFAULTS, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);

    return () => {
        window.clearInterval(interval);
        confetti.reset();
    };
};
