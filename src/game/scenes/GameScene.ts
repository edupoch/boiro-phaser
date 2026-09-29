import * as Phaser from 'phaser';

import { EventBus } from '../EventBus';
import { HdChunk, LOD_DEBUG, SpriteLod } from '../SpriteLod';

type SpriteBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};

// Trozo de un sprite demasiado grande para un atlas; x/y son relativos a los bounds del sprite
// y, como los bounds, están en unidades del mundo.
type SpriteTile = SpriteBounds & {
    frame: string;
};

type PositionedSprite = {
    label: string;
    frame?: string;
    bounds: SpriteBounds | null;
    tiles?: SpriteTile[];
    hd?: HdChunk[];
    children?: PositionedSprite[];
    childen?: PositionedSprite[];
};

// Los sprites troceados en tiles se agrupan en un Container para animarse como una sola pieza.
type SpriteObject = Phaser.GameObjects.Image | Phaser.GameObjects.Container;

type AtlasData = {
    frameToAtlasKey?: Record<string, string>;
    sprites?: PositionedSprite[];
};

export class GameScene extends Phaser.Scene
{
    background: Phaser.GameObjects.Image;
    logo: Phaser.GameObjects.Image;
    title: Phaser.GameObjects.Text;
    logoTween: Phaser.Tweens.Tween | null;
    camera: Phaser.Cameras.Scene2D.Camera;

    private spriteTree: PositionedSprite[] = [];
    private spriteImageMap = new Map<string, SpriteObject>();
    private spriteLod: SpriteLod | null = null;

    constructor ()
    {
        super('Game');
    }

    create ()
    {
        //this.background = this.add.image(512, 384, 'background');

        //this.logo = this.add.image(512, 300, 'logo').setDepth(100);

        this.input.setDefaultCursor('grab');
        EventBus.emit('game-reset');

        this.sound.add('praia', { loop: true, volume: 0.5 }).play();

        this.camera = this.cameras.main;

        const atlasData = this.cache.json.get('sprites-atlas-index') as AtlasData | undefined;
        const frameToAtlasKey = atlasData?.frameToAtlasKey ?? {};
        const sprites = Array.isArray(atlasData?.sprites) ? atlasData.sprites : [];
        if (Array.isArray(sprites)) {
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

            const handlePointerDown = () => {
                this.input.setDefaultCursor('grabbing');
            };

            const handlePointerUp = () => {
                this.input.setDefaultCursor('grab');
            };

            // Zoom multiplicativo manteniendo fijo el punto del mundo que hay bajo (screenX, screenY).
            const zoomAtScreen = (screenX: number, screenY: number, deltaY: number) => {
                const zoomSensitivity = 0.008;
                const zoomFactor = Math.exp(-deltaY * zoomSensitivity);
                const previousZoom = this.camera.zoom;
                const nextZoom = Phaser.Math.Clamp(this.camera.zoom * zoomFactor, minZoom, maxZoom);

                if (nextZoom === previousZoom) {
                    return;
                }

                if (nextZoom > previousZoom) {
                    this.spriteLod?.beginTransition();
                }

                const worldPoint = this.camera.getWorldPoint(screenX, screenY);

                this.camera.setZoom(nextZoom);
                this.camera.preRender();

                const worldPointAfterZoom = this.camera.getWorldPoint(screenX, screenY);
                this.camera.scrollX += worldPoint.x - worldPointAfterZoom.x;
                this.camera.scrollY += worldPoint.y - worldPointAfterZoom.y;
                clampCameraScroll();
            };

            const handleWheel = (
                pointer: Phaser.Input.Pointer,
                _gameObjects: Phaser.GameObjects.GameObject[],
                _deltaX: number,
                deltaY: number,
            ) => {
                zoomAtScreen(pointer.x, pointer.y, deltaY);
            };

            this.input.on('pointermove', handlePointerMove);
            this.input.on('pointerdown', handlePointerDown);
            this.input.on('pointerup', handlePointerUp);
            this.input.on('wheel', handleWheel);
            // Con LOD_DEBUG, para comparar sin recompilar: ?lodBudget=384 (presupuesto HD en MB),
            // ?lodUploads=1 (máximo de subidas a la GPU por frame), ?lodDecoder=loader (decodificar con el loader)
            // y ?lodFade=300 (duración del fundido de entrada de la HD en ms; 0 lo desactiva).
            const debugParams = new URLSearchParams(LOD_DEBUG ? window.location.search : '');
            const budgetParam = Number(debugParams.get('lodBudget'));
            const uploadsParam = Number(debugParams.get('lodUploads'));
            const fadeParam = debugParams.get('lodFade');
            this.spriteLod = new SpriteLod(this, {
                basePath: 'assets/sprites/',
                ...(budgetParam > 0 ? { budgetBytes: budgetParam * 1024 * 1024 } : {}),
                ...(uploadsParam > 0 ? { maxUploadsPerFrame: uploadsParam } : {}),
                ...(debugParams.get('lodDecoder') === 'loader' ? { useImageBitmap: false } : {}),
                ...(fadeParam !== null && Number(fadeParam) >= 0 ? { fadeDuration: Number(fadeParam) } : {}),
            });

            if (LOD_DEBUG) {
                // Para depurar el LOD desde la consola: __spriteLod.getStats() y await __lodBench('padel')
                const debugWindow = window as unknown as { __spriteLod?: SpriteLod; __lodBench?: unknown };
                debugWindow.__spriteLod = this.spriteLod;
                const lod = this.spriteLod;
                debugWindow.__lodBench = async (
                    name: string = 'padel',
                    options: { bustCache?: boolean; keepBlobs?: boolean } = {},
                ) => {
                    const { runLodBenchmark } = await import('../lodBenchmark');
                    return runLodBenchmark(this, lod, {
                        name,
                        bustCache: options.bustCache ?? true,
                        keepBlobs: options.keepBlobs ?? false,
                        minZoom,
                        getObject: (label) => this.spriteImageMap.get(label),
                        zoomAtScreen,
                        clampCameraScroll,
                    });
                };
            }

            this.events.once('shutdown', () => {
                this.spriteLod = null;
                this.input.off('pointermove', handlePointerMove);
                this.input.off('pointerdown', handlePointerDown);
                this.input.off('pointerup', handlePointerUp);
                this.input.off('wheel', handleWheel);
            });

            const renderSpriteNode = (sprite: PositionedSprite) => {
                const nestedChildren = Array.isArray(sprite.children)
                    ? sprite.children
                    : (Array.isArray(sprite.childen) ? sprite.childen : []);

                if (nestedChildren.length > 0) {
                    nestedChildren.forEach(renderSpriteNode);
                    return;
                }

                if (!sprite.bounds || !sprite.label) {
                    return;
                }

                const bounds = sprite.bounds;
                const centerX = (bounds.x + bounds.width / 2) * scaleX;
                const centerY = (bounds.y + bounds.height / 2) * scaleX;
                const displayWidth = bounds.width * scaleX;
                const displayHeight = bounds.height * scaleX;

                let spriteImage: SpriteObject;

                if (Array.isArray(sprite.tiles)) {
                    const container = this.add.container(centerX, centerY)
                        .setSize(displayWidth, displayHeight)
                        .setDepth(50);

                    sprite.tiles.forEach((tile) => {
                        const tileAtlasKey = frameToAtlasKey[tile.frame];
                        if (!tileAtlasKey || !this.textures.exists(tileAtlasKey)) {
                            return;
                        }

                        const tileImage = this.add.image(
                            tile.x * scaleX - displayWidth / 2,
                            tile.y * scaleX - displayHeight / 2,
                            tileAtlasKey,
                            tile.frame,
                        )
                            .setOrigin(0, 0)
                            .setDisplaySize(tile.width * scaleX, tile.height * scaleX);
                        container.add(tileImage);
                    });

                    spriteImage = container;
                } else {
                    const frameKey = sprite.frame ?? sprite.label;
                    const atlasTextureKey = frameToAtlasKey[frameKey];

                    if (!atlasTextureKey || !this.textures.exists(atlasTextureKey)) {
                        return;
                    }

                    spriteImage = this.add.image(centerX, centerY, atlasTextureKey, frameKey)
                        .setDepth(50)
                        .setDisplaySize(displayWidth, displayHeight);
                }

                this.spriteImageMap.set(sprite.label, spriteImage);

                if (sprite.label.includes('_ob_')) {
                    spriteImage.setInteractive({ useHandCursor: true });
                    spriteImage.on('pointerdown', () => {
                        EventBus.emit('object-clicked', sprite.label);
                    });
                    spriteImage.on('pointerover', () => {

                        this.sound.play('hover_' + Phaser.Math.Between(1, 4), { volume: 0.25 });

                        if (spriteImage.getData('springAnimating')) {
                            return;
                        }

                        spriteImage.setData('springAnimating', true);

                        // La escala base depende de la textura activa (1x o HD), así que se lee al empezar.
                        const baseScaleX = spriteImage.scaleX;
                        const baseScaleY = spriteImage.scaleY;

                        this.tweens.chain({
                            targets: spriteImage,
                            tweens: [
                                {
                                    scaleX: baseScaleX * 1.08,
                                    scaleY: baseScaleY * 0.92,
                                    duration: 90,
                                    ease: 'Quad.out',
                                },
                                {
                                    scaleX: baseScaleX * 0.96,
                                    scaleY: baseScaleY * 1.06,
                                    duration: 120,
                                    ease: 'Sine.inOut',
                                },
                                {
                                    scaleX: baseScaleX * 1.02,
                                    scaleY: baseScaleY * 0.98,
                                    duration: 110,
                                    ease: 'Sine.inOut',
                                },
                                {
                                    scaleX: baseScaleX,
                                    scaleY: baseScaleY,
                                    duration: 130,
                                    ease: 'Back.out',
                                },
                            ],
                            onComplete: () => {
                                spriteImage.setData('springAnimating', false);
                            },
                        });
                    });
                }

                this.spriteLod?.register(spriteImage, bounds, sprite.hd);
            };

            this.spriteTree = sprites;
            sprites.forEach(renderSpriteNode);
            this.spriteLod?.startBackgroundDownload();

            this.animateElements([
                '*barca*', 
                '*velero*', 
                '*mono_flotador*', 
                '*kayaks*', 
                '*ob_boya*', 
                '*ob_faro*'
            ], (image) => {
                this.tweens.add({
                    targets: image,
                    y: image.y - 20,
                    duration: Phaser.Math.Between(2000, 4000),
                    ease: 'Sine.inOut',
                    yoyo: true,
                    repeat: -1,
                });
            });

            this.animateElements([
                '*barco*', 
                'Puerto__ob_bigbag__g23-5',
                'Puerto__ob_cubo__g1327-4-3',
                'Mar__ob_cuerda__g1630-5',
                'Mar__ob_pala__g62-3'
            ], (image) => {
                this.tweens.add({
                    targets: image,
                    y: image.y - 20,
                    duration: 3600,
                    ease: 'Sine.inOut',
                    yoyo: true,
                    repeat: -1,
                });
            });

            this.animateElements([
                '*mov_arbol*', 
                '*palmera*', 
                '*roble*', 
                '*arbol*',
                '*sombrilla*'
            ], (image) => {
                this.setPivot(image, 0.5, 1);
                image.y += image.displayHeight / 2;

                this.tweens.add({
                    targets: image,
                    angle: { from: -1, to: 1 },
                    duration: Phaser.Math.Between(2000, 4000),
                    ease: 'Sine.inOut',
                    yoyo: true,
                    repeat: -1,
                });
            });

            this.animateElements('gaviota', (image) => {
                this.tweens.add({
                    targets: image,
                    x: { from: image.x - 2000, to: image.x + 10000 },
                    y: { from: image.y - 1000, to: image.y + 5000 },
                    duration: 42000,
                    ease: 'Sine.inOut',
                    yoyo: false,
                    repeat: -1,
                });
            });

            
        }

        EventBus.emit('current-scene-ready', this);
    }
    
    // Equivalente a setOrigin para imágenes y para los Container de sprites troceados
    // (en estos se desplazan los tiles, porque un Container gira y escala alrededor de su posición).
    setPivot (object: SpriteObject, originX: number, originY: number): void
    {
        if (object instanceof Phaser.GameObjects.Image) {
            object.setOrigin(originX, originY);
            return;
        }

        const offsetX = (originX - 0.5) * object.width;
        const offsetY = (originY - 0.5) * object.height;
        // SpriteLod lo necesita para colocar los chunks HD con el mismo pivote.
        object.setData({ pivotX: originX, pivotY: originY });
        object.each((child: Phaser.GameObjects.Image) => {
            child.x -= offsetX;
            child.y -= offsetY;
        });
    }

    update (time: number): void
    {
        this.spriteLod?.update(time);
    }

    animateElements (label: string | string[], animFn: (image: SpriteObject) => void): void
    {
        const searchTerms = Array.isArray(label) ? label : [label];
        const regexPattern = /^\/(.+)\/([dgimsuvy]*)$/;
        const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matchers = searchTerms.map((term) => {
            if (!term) {
                return (_nodeLabel: string) => false;
            }

            const regexParts = term.match(regexPattern);
            if (regexParts) {
                try {
                    const compiledRegex = new RegExp(regexParts[1], regexParts[2]);
                    return (nodeLabel: string) => compiledRegex.test(nodeLabel);
                } catch {
                    return (nodeLabel: string) => nodeLabel === term;
                }
            }

            if (term.includes(
                '*') || term.includes('?')) {
                const wildcardRegex = new RegExp(
                    `^${escapeRegex(term).replace(/\\\*/g, '.*').replace(/\\\?/g, '.')}$`,
                );

                return (nodeLabel: string) => wildcardRegex.test(nodeLabel);
            }

            return (nodeLabel: string) => nodeLabel === term;
        });

        const collectLeafImages = (node: PositionedSprite, targetFound: boolean): void => {
            const nodeLabel = typeof node.label === 'string' ? node.label : '';
            const matched = targetFound || matchers.some((matchesLabel) => matchesLabel(nodeLabel));
            const children = Array.isArray(node.children)
                ? node.children
                : (Array.isArray(node.childen) ? node.childen : []);

            if (children.length > 0) {
                children.forEach((child) => collectLeafImages(child, matched));
                return;
            }

            if (matched && node.label) {
                const image = this.spriteImageMap.get(node.label);
                if (image) {
                    animFn(image);
                }
            }
        };

        this.spriteTree.forEach((root) => collectLeafImages(root, false));
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
