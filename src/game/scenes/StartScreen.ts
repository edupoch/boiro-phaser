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
        startButtonElement.textContent = 'Comezar';
        startButtonElement.className = 'mt-6 rounded-2xl bg-amber-400 px-8 py-3 text-lg font-extrabold text-white shadow-lg hover:bg-amber-300';

        this.add.dom(centerX, centerY, startButtonElement)
            .setOrigin(0.5)
            .setDepth(10);


        startButtonElement.addEventListener('click', () => {
            this.scene.start('Game');
        });
    }
}