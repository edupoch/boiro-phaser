import { GameObjects, Scene } from 'phaser';

import { EventBus } from '../EventBus';

type SpriteBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type PositionedSprite = {
    label: string;
    file: string;
    bounds: SpriteBounds | null;
};

export class MainMenu extends Scene
{
    background: GameObjects.Image;
    logo: GameObjects.Image;
    title: GameObjects.Text;
    logoTween: Phaser.Tweens.Tween | null;
    camera: Phaser.Cameras.Scene2D.Camera;

    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        //this.background = this.add.image(512, 384, 'background');

        //this.logo = this.add.image(512, 300, 'logo').setDepth(100);

        this.camera = this.cameras.main;

        const positions = this.cache.json.get('positions') as PositionedSprite[];
        if (Array.isArray(positions)) {
            // Base artwork size from escena.svg viewBox.
            const sourceWidth = 6804;
            const sourceHeight = 3742.2;

            const sceneWidth = this.scale.width;
            const sceneHeight = this.scale.height;

            // const scaleX = sceneWidth / sourceWidth;
            // const scaleY = sceneHeight / sourceHeight;
            const scaleX = 1;
            const worldWidth = sourceWidth * scaleX;
            const worldHeight = sourceHeight * scaleX;

            this.camera.setBounds(0, 0, worldWidth, worldHeight);

            const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
            const updateCameraFromPointer = (pointer: Phaser.Input.Pointer) => {
                const maxScrollX = Math.max(0, worldWidth - sceneWidth);
                const maxScrollY = Math.max(0, worldHeight - sceneHeight);

                const pointerRatioX = clamp01(pointer.x / sceneWidth);
                const pointerRatioY = clamp01(pointer.y / sceneHeight);

                this.camera.scrollX = pointerRatioX * maxScrollX;
                this.camera.scrollY = pointerRatioY * maxScrollY;
            };

            this.input.on('pointermove', updateCameraFromPointer);
            this.events.once('shutdown', () => {
                this.input.off('pointermove', updateCameraFromPointer);
            });

            positions.forEach((sprite) => {
                if (!sprite.bounds || !sprite.file) {
                    return;
                }

                const bounds = sprite.bounds;
                const centerX = (bounds.x + bounds.width / 2) * scaleX;
                const centerY = (bounds.y + bounds.height / 2) * scaleX;

                const spriteImage = this.add.image(centerX, centerY, sprite.label).setDepth(50);
                spriteImage.setDisplaySize(bounds.width * scaleX, bounds.height * scaleX);
            });
        }

        // this.title = this.add.text(512, 460, 'Main Menu', {
        //     fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
        //     stroke: '#000000', strokeThickness: 8,
        //     align: 'center'
        // }).setOrigin(0.5).setDepth(100);

        EventBus.emit('current-scene-ready', this);
    }
    
    changeScene ()
    {
        if (this.logoTween)
        {
            this.logoTween.stop();
            this.logoTween = null;
        }

        this.scene.start('Game');
    }

    moveLogo (vueCallback: ({ x, y }: { x: number, y: number }) => void)
    {
        if (this.logoTween)
        {
            if (this.logoTween.isPlaying())
            {
                this.logoTween.pause();
            }
            else
            {
                this.logoTween.play();
            }
        } 
        else
        {
            this.logoTween = this.tweens.add({
                targets: this.logo,
                x: { value: 750, duration: 3000, ease: 'Back.easeInOut' },
                y: { value: 80, duration: 1500, ease: 'Sine.easeOut' },
                yoyo: true,
                repeat: -1,
                onUpdate: () => {
                    if (vueCallback)
                    {
                        vueCallback({
                            x: Math.floor(this.logo.x),
                            y: Math.floor(this.logo.y)
                        });
                    }
                }
            });
        }
    }
}
