import { Scene } from 'phaser';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        //  We loaded this image in our Boot Scene, so we can display it here
        //this.add.image(512, 384, 'background');

        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        this.add.text(centerX, centerY - 40, 'Cargando recursos...', {
            fontFamily: 'monospace',
            fontSize: '16px',
            color: '#028af8',
        }).setOrigin(0.5);

        //  A simple progress bar. This is the outline of the bar.
        this.add.rectangle(centerX, centerY, 468, 32).setStrokeStyle(1, 0x028af8);

        //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
        const bar = this.add.rectangle(centerX - 230, centerY, 4, 28, 0x028af8).setOrigin(0, 0.5);

        //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
        this.load.on('progress', (progress: number) => {

            //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
            bar.width = 4 + (455 * progress);

        });
    }

    preload ()
    {
        //  Load the assets for the game - Replace with your own assets
        this.load.setPath('assets');

        this.load.image('logo', 'logo.png');
        this.load.image('star', 'star.png');

        this.load.audio('praia', 'audio/praia.mp3');
        this.load.audio('hover_1', 'audio/hover_1.mp3');
        this.load.audio('hover_2', 'audio/hover_2.mp3');
        this.load.audio('hover_3', 'audio/hover_3.mp3');
        this.load.audio('hover_4', 'audio/hover_4.mp3');
        this.load.audio('click', 'audio/click.mp3');
        this.load.audio('success', 'audio/success.mp3');
        this.load.audio('error', 'audio/error.mp3');

        this.load.json('sprites-atlas-index', 'sprites/atlas-index.json');
    }

    create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        const atlasIndex = this.cache.json.get('sprites-atlas-index') as {
            atlases?: Array<{ key: string; image: string; data: string }>;
        } | undefined;
        const atlases = Array.isArray(atlasIndex?.atlases) ? atlasIndex.atlases : [];

        if (atlases.length === 0) {
            this.scene.start('StartScreen');
            return;
        }

        this.load.once('complete', () => {
            this.scene.start('StartScreen');
        });

        atlases.forEach((atlas) => {
            this.load.atlas(atlas.key, `sprites/${atlas.image}`, `sprites/${atlas.data}`);
        });

        this.load.start();
    }
}
