import * as Phaser from 'phaser';

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

export class MainMenu extends Phaser.Scene
{
    background: Phaser.GameObjects.Image;
    logo: Phaser.GameObjects.Image;
    title: Phaser.GameObjects.Text;
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
            const fitWidthZoom = sceneWidth / worldWidth;
            const fitHeightZoom = sceneHeight / worldHeight;
            const minZoom = Math.max(fitWidthZoom, fitHeightZoom);
            const maxZoom = 2.5;
            const fitWorldZoom = Math.min(fitWidthZoom, fitHeightZoom);
            const initialZoom = Phaser.Math.Clamp(fitWorldZoom, minZoom, maxZoom);

            this.camera.setBounds(0, 0, worldWidth, worldHeight);
            this.camera.setZoom(initialZoom);

            const clampCameraScroll = () => {
                const visibleWidth = sceneWidth / this.camera.zoom;
                const visibleHeight = sceneHeight / this.camera.zoom;
                const maxScrollX = Math.max(0, worldWidth - visibleWidth);
                const maxScrollY = Math.max(0, worldHeight - visibleHeight);

                this.camera.scrollX = Phaser.Math.Clamp(this.camera.scrollX, 0, maxScrollX);
                this.camera.scrollY = Phaser.Math.Clamp(this.camera.scrollY, 0, maxScrollY);
            };

            const handlePointerMove = (pointer: Phaser.Input.Pointer) => {
                if (!pointer.isDown) {
                    return;
                }

                this.camera.scrollX -= (pointer.x - pointer.prevPosition.x) / this.camera.zoom;
                this.camera.scrollY -= (pointer.y - pointer.prevPosition.y) / this.camera.zoom;
                clampCameraScroll();
            };

            const handleWheel = (
                pointer: Phaser.Input.Pointer,
                _gameObjects: Phaser.GameObjects.GameObject[],
                _deltaX: number,
                deltaY: number,
            ) => {
                const zoomFactor = deltaY > 0 ? 0.9 : 1.1;
                const previousZoom = this.camera.zoom;
                const nextZoom = Phaser.Math.Clamp(this.camera.zoom * zoomFactor, minZoom, maxZoom);

                if (nextZoom === previousZoom) {
                    return;
                }

                const worldPointX = this.camera.scrollX + (pointer.x / previousZoom);
                const worldPointY = this.camera.scrollY + (pointer.y / previousZoom);

                this.camera.setZoom(nextZoom);
                this.camera.scrollX = worldPointX - (pointer.x / nextZoom);
                this.camera.scrollY = worldPointY - (pointer.y / nextZoom);
                clampCameraScroll();
            };

            this.input.on('pointermove', handlePointerMove);
            this.input.on('wheel', handleWheel);
            this.events.once('shutdown', () => {
                this.input.off('pointermove', handlePointerMove);
                this.input.off('wheel', handleWheel);
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

                // const swingAmplitude = Phaser.Math.FloatBetween(1.2, 2.8);
                // const swingDuration = Phaser.Math.Between(2200, 3800);
                // spriteImage.setAngle(Phaser.Math.FloatBetween(-swingAmplitude, swingAmplitude));

                // this.tweens.add({
                //     targets: spriteImage,
                //     angle: {
                //         from: -swingAmplitude,
                //         to: swingAmplitude
                //     },
                //     duration: swingDuration,
                //     ease: 'Sine.easeInOut',
                //     yoyo: true,
                //     repeat: -1,
                //     delay: Phaser.Math.Between(0, 900)
                // });
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
}
