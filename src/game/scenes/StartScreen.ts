import { Scene } from 'phaser';

export class StartScreen extends Scene
{
    constructor ()
    {
        super('StartScreen');
    }

    create ()
    {
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        const startButtonElement = document.createElement('button');
        startButtonElement.type = 'button';
        startButtonElement.textContent = 'Comezar xogo';
        startButtonElement.className = 'rounded-2xl bg-amber-400 px-16 py-6 text-5xl font-extrabold text-white shadow-lg hover:bg-amber-300';

        this.add.dom(centerX, centerY, startButtonElement)
            .setOrigin(0.5)
            // El canvas va en píxeles físicos (ver renderScale.ts) y el contenedor DOM se reduce a tamaño
            // CSS, así que se compensa aquí. Con zoom de cámara Phaser descoloca los elementos DOM.
            .setScale(1 / this.scale.zoom)
            .setDepth(10);


        startButtonElement.addEventListener('click', () => {
            this.scene.start('Game');
        });
    }
}