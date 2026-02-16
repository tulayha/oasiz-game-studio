
export interface TerrainInstance {
    points: { x: number, y: number }[];
    graphics: Phaser.GameObjects.Graphics;
    bodies: MatterJS.BodyType[];
    holeSensor: MatterJS.BodyType;
}

export default class TerrainGenerator {
    private scene: Phaser.Scene;
    private currentSeedOffset: number = 0;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    public generateTerrain(startY?: number, offsetX: number = 0, difficulty: number = 1, theme: any = null, isPreview: boolean = false): TerrainInstance {
        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        const totalPoints = 80;
        const gap = width / totalPoints;
        const points: { x: number, y: number }[] = [];

        // Default Theme (Spring/Day) if not provided
        if (!theme) {
            theme = {
                sky: 0x81D4FA,
                groundTop: 0x6D4C41,
                groundBottom: 0x4E342E,
                grass: 0x8ac926,
            };
        }

        // Choose hole position - SCALED UP
        const holeX = offsetX + Phaser.Math.Between(width * 0.7, width * 0.9);
        const holeWidth = 45; // Smaller hole for more challenge
        const holeDepth = 100; // Shallower hole

        // Spawn position - moved right to avoid UI overlap
        const spawnX = offsetX + 250;
        const spawnFlatZone = 120;

        // Base height setup - positioned at 70% of screen height for more sky
        const targetBaseHeight = height * 0.7;
        let baseHeight = targetBaseHeight;
        const localSeedOffset = this.currentSeedOffset;

        // Significantly increased bumpiness as requested
        const amp1 = 90 * difficulty;
        const amp2 = 45 * difficulty; // More prominent secondary hills
        const amp3 = 15 * difficulty; // New roughness layer

        // Increased frequencies for more hills per screen
        const freq1 = 0.08; // Base wide unevenness
        const freq2 = 0.25; // Distinct hills
        const freq3 = 0.60; // Roughness/texture

        if (startY !== undefined) {
            const x0 = offsetX;
            const distToHole0 = Math.abs(x0 - holeX);
            const holeFlat0 = Math.min(1, (distToHole0 / (holeWidth * 3)) ** 2);
            const distToSpawn0 = Math.abs(x0 - spawnX);
            const spawnFlat0 = Math.min(1, (distToSpawn0 / spawnFlatZone) ** 2);
            const flat0 = Math.min(holeFlat0, spawnFlat0);

            const initialWave1 = Math.sin(localSeedOffset * freq1) * amp1 * flat0;
            const initialWave2 = Math.sin(localSeedOffset * freq2) * amp2 * flat0;
            const initialWave3 = Math.sin(localSeedOffset * freq3) * amp3 * flat0;

            // Calculate what the base height needs to be to match the startY
            baseHeight = startY - (initialWave1 + initialWave2 + initialWave3);
        }

        const startBaseHeight = baseHeight;

        // Normal terrain points creation
        for (let i = 0; i <= totalPoints; i++) {
            const x = offsetX + (i * gap);
            const globalI = localSeedOffset + i;

            // Interpolate base height back to target (center) to prevent infinite climbing
            // If we started high (because previous level ended high), we gently slope down
            const progress = i / totalPoints;
            const currentBaseHeight = startY !== undefined
                ? startBaseHeight * (1 - progress) + targetBaseHeight * progress
                : targetBaseHeight;

            const distanceToHole = Math.abs(x - holeX);
            const holeFlatZoneRadius = holeWidth * 3.5; // Slightly reduced flat zone for more challenge
            const holeFlatMultiplier = Math.min(1, (distanceToHole / holeFlatZoneRadius) ** 2);

            const distanceToSpawn = Math.abs(x - spawnX);
            const spawnFlatMultiplier = Math.min(1, (distanceToSpawn / (spawnFlatZone / Math.sqrt(difficulty))) ** 2);
            const flatMultiplier = Math.min(holeFlatMultiplier, spawnFlatMultiplier);

            const wave1 = Math.sin(globalI * freq1) * amp1 * flatMultiplier;
            const wave2 = Math.sin(globalI * freq2) * amp2 * flatMultiplier;
            const wave3 = Math.sin(globalI * freq3) * amp3 * flatMultiplier;

            // Valley effect: raised hills on both sides of the hole so ball rolls down into it.
            // The hole sits at the bottom of a valley formed by two "landcakes" (raised ridges).
            const valleyRadius = holeWidth * 8; // Total valley width
            const valleyDepth = 60; // How deep the valley is (positive = terrain goes UP on sides)
            let valleyAdjustment = 0;
            if (distanceToHole < valleyRadius) {
                // Valley profile: terrain is LOW at hole center, HIGH at valley edges
                // Uses cosine to create smooth raised ridges on both sides
                const valleyProgress = distanceToHole / valleyRadius; // 0 at hole, 1 at edge
                // Raise terrain on the sides, dip at center
                valleyAdjustment = -(Math.cos(valleyProgress * Math.PI) + 1) * 0.5 * valleyDepth;
                // valleyAdjustment is negative at edges (terrain goes UP) and 0 at center
            }

            // Force a hill at the end of the map
            const endZoneStart = totalPoints - 15;
            let endHillAdjustment = 0;
            if (i > endZoneStart) {
                const hillProgress = (i - endZoneStart) / 15; // 0 to 1
                // Quadratic rise to create a hill at the end (dy go up -> y go down)
                endHillAdjustment = -(hillProgress * hillProgress * 150);
            }

            let y = currentBaseHeight + wave1 + wave2 + wave3 + valleyAdjustment + endHillAdjustment;

            if (i === 0 && startY !== undefined) y = startY;

            points.push({ x, y });
        }

        this.currentSeedOffset += totalPoints;

        // Store positions
        const holePointIndex = points.findIndex(p => p.x >= holeX);
        const holeY = points[holePointIndex] ? points[holePointIndex].y : height / 2;
        const spawnPointIndex = points.findIndex(p => p.x >= spawnX);
        const spawnY = points[spawnPointIndex] ? points[spawnPointIndex].y : height / 2;

        this.scene.data.set('holeX', holeX);
        this.scene.data.set('holeY', holeY);
        this.scene.data.set('holeWidth', holeWidth);
        this.scene.data.set('holeDepth', holeDepth);
        this.scene.data.set('spawnX', spawnX);
        this.scene.data.set('spawnY', spawnY);

        // Visuals
        const graphics = this.scene.add.graphics();
        graphics.setDepth(5);

        // Dynamic Soil Colors based on theme.groundTop and theme.groundBottom
        // Interpolate between Top and Bottom for 5 layers
        const soilColors: number[] = [];
        const cTop = Phaser.Display.Color.IntegerToColor(theme.groundTop);
        const cBot = Phaser.Display.Color.IntegerToColor(theme.groundBottom);

        for (let k = 0; k < 5; k++) {
            const t = k / 4; // 0 to 1
            const r = cTop.red + (cBot.red - cTop.red) * t;
            const g = cTop.green + (cBot.green - cTop.green) * t;
            const b = cTop.blue + (cBot.blue - cTop.blue) * t;
            soilColors.push(Phaser.Display.Color.GetColor(r, g, b));
        }

        // Draw Soil Layers
        for (let j = soilColors.length - 1; j >= 0; j--) {
            const offset = (soilColors.length - 1 - j) * 40; // Tighter layers like the image
            graphics.fillStyle(soilColors[j], 1);
            graphics.beginPath();
            graphics.moveTo(offsetX - 2, height + 400); // Extend deeper
            graphics.lineTo(points[0].x - 2, points[0].y + offset);
            for (let i = 1; i < points.length; i++) {
                graphics.lineTo(points[i].x, points[i].y + offset);
            }
            graphics.lineTo(points[points.length - 1].x + 2, points[points.length - 1].y + offset);
            graphics.lineTo(offsetX + width + 2, height + 400);
            graphics.closePath();
            graphics.fillPath();
        }

        // Decorative rocks removed as requested


        const grassThickness = 35; // Thicker grass as seen in the image
        graphics.fillStyle(theme.grass, 1);
        graphics.beginPath();
        graphics.moveTo(points[0].x - 2, points[0].y);
        for (let i = 1; i < points.length; i++) graphics.lineTo(points[i].x, points[i].y);
        graphics.lineTo(points[points.length - 1].x + 2, points[points.length - 1].y);
        graphics.lineTo(points[points.length - 1].x + 2, points[points.length - 1].y + grassThickness);
        for (let i = points.length - 1; i >= 0; i--) graphics.lineTo(points[i].x - 2, points[i].y + grassThickness);
        graphics.closePath();
        graphics.fillPath();





        // Hole Visual
        graphics.fillStyle(0x000000, 1);
        graphics.fillRect(holeX - holeWidth / 2, holeY, holeWidth, holeDepth);
        graphics.fillStyle(theme.grass, 1);
        graphics.fillRect(holeX - holeWidth / 2 - 5, holeY - 4, holeWidth + 10, 8);

        graphics.fillRect(holeX - holeWidth / 2 - 5, holeY - 4, holeWidth + 10, 8);

        // Physics
        const bodies: MatterJS.BodyType[] = [];
        let holeSensor: any = null;

        if (!isPreview) {
            const wallThickness = 30;

            // Hole Physics
            holeSensor = this.scene.matter.add.rectangle(holeX, holeY + holeDepth / 2, holeWidth, holeDepth, {
                isStatic: true, isSensor: true, label: 'hole-sensor'
            });
            bodies.push(holeSensor);

            const leftWall = this.scene.matter.add.rectangle(holeX - holeWidth / 2 - wallThickness / 2, holeY + holeDepth / 2, wallThickness, holeDepth, {
                isStatic: true, friction: 0.1, label: 'hole-wall'
            });
            const rightWall = this.scene.matter.add.rectangle(holeX + holeWidth / 2 + wallThickness / 2, holeY + holeDepth / 2, wallThickness, holeDepth, {
                isStatic: true, friction: 0.1, label: 'hole-wall'
            });
            bodies.push(leftWall, rightWall);

            const holeBottom = this.scene.matter.add.rectangle(holeX, holeY + holeDepth + 30, holeWidth + wallThickness * 2, 40, {
                isStatic: true, friction: 0.1, label: 'hole-bottom'
            });
            bodies.push(holeBottom);

            // Terrain segments with massive thickness to prevent falling through
            const segmentThickness = 800;
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                const centerX = (p1.x + p2.x) / 2;

                // Skip hole area
                if (centerX >= holeX - holeWidth / 2 && centerX <= holeX + holeWidth / 2) continue;

                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const segmentLength = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);

                const centerY = (p1.y + p2.y) / 2;
                // Push the rectangle center DOWN so the top edge aligns with the points
                const offsetY = segmentThickness / 2;
                const physicsX = centerX - Math.sin(angle) * offsetY;
                const physicsY = centerY + Math.cos(angle) * offsetY;

                const seg = this.scene.matter.add.rectangle(physicsX, physicsY, segmentLength + 30, segmentThickness, {
                    isStatic: true,
                    angle: angle,
                    friction: 0.005,
                    frictionStatic: 0.01,  // Low static friction - prevents ball sticking on slopes
                    restitution: 0.05,     // Near-zero bounce - ball lands and rolls
                    label: 'terrain',
                    chamfer: { radius: 5 } // Rounded edges smooth segment transitions
                });
                bodies.push(seg);
            }
        }

        return { points, graphics, bodies, holeSensor };
    }
    public redraw(instance: TerrainInstance, theme: any) {
        if (!instance || !instance.graphics) return;

        const height = this.scene.scale.height;
        const points = instance.points;
        const graphics = instance.graphics;

        graphics.clear();
        graphics.setDepth(5);

        // Dynamic Soil Colors
        const soilColors: number[] = [];
        const cTop = Phaser.Display.Color.IntegerToColor(theme.groundTop);
        const cBot = Phaser.Display.Color.IntegerToColor(theme.groundBottom);

        for (let k = 0; k < 5; k++) {
            const t = k / 4;
            const r = cTop.red + (cBot.red - cTop.red) * t;
            const g = cTop.green + (cBot.green - cTop.green) * t;
            const b = cTop.blue + (cBot.blue - cTop.blue) * t;
            soilColors.push(Phaser.Display.Color.GetColor(r, g, b));
        }

        // Draw Soil Layers
        for (let j = soilColors.length - 1; j >= 0; j--) {
            const offset = (soilColors.length - 1 - j) * 40;
            graphics.fillStyle(soilColors[j], 1);
            graphics.beginPath();
            graphics.moveTo(points[0].x - 2, height + 400);
            graphics.lineTo(points[0].x - 2, points[0].y + offset);
            for (let i = 1; i < points.length; i++) {
                graphics.lineTo(points[i].x, points[i].y + offset);
            }
            graphics.lineTo(points[points.length - 1].x + 2, points[points.length - 1].y + offset);
            graphics.lineTo(points[points.length - 1].x + 2, height + 400);
            graphics.closePath();
            graphics.fillPath();
        }

        // Top Grass
        graphics.fillStyle(theme.grass, 1);
        graphics.beginPath();
        graphics.moveTo(points[0].x - 2, points[0].y);
        for (let i = 1; i < points.length; i++) graphics.lineTo(points[i].x, points[i].y);
        graphics.lineTo(points[points.length - 1].x + 2, points[points.length - 1].y);
        graphics.lineTo(points[points.length - 1].x + 2, points[points.length - 1].y + 35);
        for (let i = points.length - 1; i >= 0; i--) graphics.lineTo(points[i].x - 2, points[i].y + 35);
        graphics.closePath();
        graphics.fillPath();



        // Hole Visual
        const holeX = this.scene.data.get('holeX');
        const holeY = this.scene.data.get('holeY');
        const holeWidth = this.scene.data.get('holeWidth');
        const holeDepth = this.scene.data.get('holeDepth');

        if (holeX !== undefined) {
            graphics.fillStyle(0x000000, 1);
            graphics.fillRect(holeX - holeWidth / 2, holeY, holeWidth, holeDepth);
            graphics.fillStyle(theme.grass, 1);
            graphics.fillRect(holeX - holeWidth / 2 - 5, holeY - 4, holeWidth + 10, 8);
        }
    }
}
