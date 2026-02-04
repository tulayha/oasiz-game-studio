import Phaser from 'phaser';

export type SkinType = 'solid' | 'stripe' | 'target' | 'dot' | 'soccer' | 'tennis' | 'basketball' | 'bowling' | 'billiard';

export default class SkinManager {
    static drawBall(scene: Phaser.Scene, x: number, y: number, radius: number, color: number, skin: SkinType): Phaser.GameObjects.Container {
        const container = scene.add.container(x, y);

        // Base Circle
        const base = scene.add.circle(0, 0, radius, color);
        base.setStrokeStyle(2, 0x000000); // Standard border
        container.add(base);

        // Pattern
        const graphics = scene.add.graphics();
        container.add(graphics);

        switch (skin) {
            case 'stripe':
                graphics.fillStyle(0x000000, 0.2);
                graphics.fillRect(-radius, -4, radius * 2, 8);
                break;
            case 'target':
                graphics.fillStyle(0xffffff, 0.3);
                graphics.fillCircle(0, 0, radius * 0.6);
                graphics.fillStyle(0x000000, 0.3);
                graphics.fillCircle(0, 0, radius * 0.3);
                break;
            case 'dot':
                graphics.fillStyle(0x000000, 0.2);
                graphics.fillCircle(-6, -6, 3);
                graphics.fillCircle(6, 6, 3);
                graphics.fillCircle(6, -6, 3);
                graphics.fillCircle(-6, 6, 3);
                break;
            case 'soccer':
                graphics.fillStyle(0x000000, 0.8);
                // Simple hexagons representation
                graphics.fillCircle(0, 0, 5);
                graphics.fillCircle(-10, -5, 3);
                graphics.fillCircle(10, -5, 3);
                graphics.fillCircle(0, 10, 3);
                break;
            case 'tennis':
                // Tennis ball has curved white lines
                graphics.lineStyle(3, 0xffffff, 1);

                // Left curved line (like a "C" shape)
                const leftCurve = new Phaser.Curves.QuadraticBezier(
                    new Phaser.Math.Vector2(-radius * 0.5, -radius * 0.6),
                    new Phaser.Math.Vector2(-radius * 0.8, 0),
                    new Phaser.Math.Vector2(-radius * 0.5, radius * 0.6)
                );
                leftCurve.draw(graphics);

                // Right curved line (mirrored "C" shape)
                const rightCurve = new Phaser.Curves.QuadraticBezier(
                    new Phaser.Math.Vector2(radius * 0.5, -radius * 0.6),
                    new Phaser.Math.Vector2(radius * 0.8, 0),
                    new Phaser.Math.Vector2(radius * 0.5, radius * 0.6)
                );
                rightCurve.draw(graphics);
                break;
            case 'basketball':
                graphics.lineStyle(2, 0x000000, 0.6);

                // Horizontal Curve
                new Phaser.Curves.QuadraticBezier(
                    new Phaser.Math.Vector2(-radius, 0),
                    new Phaser.Math.Vector2(0, radius * 0.5),
                    new Phaser.Math.Vector2(radius, 0)
                ).draw(graphics);

                // Vertical Curve
                new Phaser.Curves.QuadraticBezier(
                    new Phaser.Math.Vector2(0, -radius),
                    new Phaser.Math.Vector2(radius * 0.3, 0),
                    new Phaser.Math.Vector2(0, radius)
                ).draw(graphics);

                // Right Side Curve
                new Phaser.Curves.QuadraticBezier(
                    new Phaser.Math.Vector2(radius * 0.3, -radius * 0.9),
                    new Phaser.Math.Vector2(radius * 0.9, 0),
                    new Phaser.Math.Vector2(radius * 0.3, radius * 0.9)
                ).draw(graphics);

                // Left Side Curve
                new Phaser.Curves.QuadraticBezier(
                    new Phaser.Math.Vector2(-radius * 0.3, -radius * 0.9),
                    new Phaser.Math.Vector2(-radius * 0.9, 0),
                    new Phaser.Math.Vector2(-radius * 0.3, radius * 0.9)
                ).draw(graphics);
                break;
            case 'bowling':
                // Bowling ball with finger holes
                graphics.fillStyle(0x000000, 0.3);
                // Three finger holes
                graphics.fillCircle(-4, -8, 3);
                graphics.fillCircle(4, -8, 3);
                graphics.fillCircle(0, 2, 3);
                break;
            case 'billiard':
                // 8-ball: white circle with black "8"
                graphics.fillStyle(0xffffff, 1);
                graphics.fillCircle(0, 0, radius * 0.5);

                // Black "8" text
                graphics.fillStyle(0x000000, 1);
                const text8 = scene.add.text(0, 0, '8', {
                    fontSize: `${radius * 0.8}px`,
                    color: '#000000',
                    fontFamily: 'Arial',
                    fontStyle: 'bold'
                }).setOrigin(0.5);
                container.add(text8);
                break;
            case 'solid':
            default:
                // No extra graphics
                break;
        }

        return container;
    }

    // Helper for Physics rendering (since Matter needs a display object)
    static createBallTexture(scene: Phaser.Scene, key: string, radius: number, color: number, skin: SkinType) {
        if (scene.textures.exists(key)) return;

        const graphics = scene.make.graphics({ x: 0, y: 0, add: false } as any);

        // Draw Base
        graphics.fillStyle(color, 1);
        graphics.fillCircle(radius, radius, radius);
        graphics.lineStyle(2, 0x000000, 1);
        graphics.strokeCircle(radius, radius, radius);

        // Draw Skin
        switch (skin) {
            case 'stripe':
                graphics.fillStyle(0x000000, 0.2);
                graphics.fillRect(0, radius - 4, radius * 2, 8);
                break;
            case 'target':
                graphics.fillStyle(0xffffff, 0.3);
                graphics.fillCircle(radius, radius, radius * 0.6);
                graphics.fillStyle(0x000000, 0.3);
                graphics.fillCircle(radius, radius, radius * 0.3);
                break;
            case 'dot':
                graphics.fillStyle(0x000000, 0.2);
                graphics.fillCircle(radius - 6, radius - 6, 3);
                graphics.fillCircle(radius + 6, radius + 6, 3);
                graphics.fillCircle(radius + 6, radius - 6, 3);
                graphics.fillCircle(radius - 6, radius + 6, 3);
                break;
            case 'soccer': // Soccer pattern
                graphics.fillStyle(0x000000, 0.8);
                graphics.fillCircle(radius, radius, 5);
                graphics.fillCircle(radius - 10, radius - 5, 3);
                graphics.fillCircle(radius + 10, radius - 5, 3);
                graphics.fillCircle(radius, radius + 10, 3);
                break;
            case 'tennis':
                // Tennis ball has curved white lines
                graphics.lineStyle(3, 0xffffff, 1);

                // Left curved line (like a "C" shape)
                const leftCurveTex = new Phaser.Curves.QuadraticBezier(
                    new Phaser.Math.Vector2(radius - radius * 0.5, radius - radius * 0.6),
                    new Phaser.Math.Vector2(radius - radius * 0.8, radius),
                    new Phaser.Math.Vector2(radius - radius * 0.5, radius + radius * 0.6)
                );
                leftCurveTex.draw(graphics);

                // Right curved line (mirrored "C" shape)
                const rightCurveTex = new Phaser.Curves.QuadraticBezier(
                    new Phaser.Math.Vector2(radius + radius * 0.5, radius - radius * 0.6),
                    new Phaser.Math.Vector2(radius + radius * 0.8, radius),
                    new Phaser.Math.Vector2(radius + radius * 0.5, radius + radius * 0.6)
                );
                rightCurveTex.draw(graphics);
                break;
            case 'basketball':
                graphics.lineStyle(2, 0x000000, 0.6);

                // Horizontal Curve
                new Phaser.Curves.QuadraticBezier(
                    new Phaser.Math.Vector2(0, radius),
                    new Phaser.Math.Vector2(radius, radius * 1.5),
                    new Phaser.Math.Vector2(radius * 2, radius)
                ).draw(graphics);

                // Vertical Curve
                new Phaser.Curves.QuadraticBezier(
                    new Phaser.Math.Vector2(radius, 0),
                    new Phaser.Math.Vector2(radius * 1.3, radius),
                    new Phaser.Math.Vector2(radius, radius * 2)
                ).draw(graphics);

                // Right Side Curve
                new Phaser.Curves.QuadraticBezier(
                    new Phaser.Math.Vector2(radius * 1.3, radius * 0.1),
                    new Phaser.Math.Vector2(radius * 1.9, radius),
                    new Phaser.Math.Vector2(radius * 1.3, radius * 1.9)
                ).draw(graphics);

                // Left Side Curve
                new Phaser.Curves.QuadraticBezier(
                    new Phaser.Math.Vector2(radius * 0.7, radius * 0.1),
                    new Phaser.Math.Vector2(radius * 0.1, radius),
                    new Phaser.Math.Vector2(radius * 0.7, radius * 1.9)
                ).draw(graphics);
                break;
            case 'bowling':
                // Bowling ball with finger holes
                graphics.fillStyle(0x000000, 0.3);
                // Three finger holes
                graphics.fillCircle(radius - 4, radius - 8, 3);
                graphics.fillCircle(radius + 4, radius - 8, 3);
                graphics.fillCircle(radius, radius + 2, 3);
                break;
            case 'billiard':
                // 8-ball: white circle with black "8"
                graphics.fillStyle(0xffffff, 1);
                graphics.fillCircle(radius, radius, radius * 0.5);

                // For texture generation, we'll draw the "8" as shapes instead of text
                graphics.fillStyle(0x000000, 1);
                // Draw "8" as two circles stacked
                graphics.strokeCircle(radius, radius - 5, 6);
                graphics.strokeCircle(radius, radius + 5, 6);
                graphics.lineStyle(3, 0x000000, 1);
                graphics.strokeCircle(radius, radius - 5, 5);
                graphics.strokeCircle(radius, radius + 5, 5);
                break;
        }

        graphics.generateTexture(key, radius * 2, radius * 2);
    }
}
