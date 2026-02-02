
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

    public generateTerrain(startY?: number, offsetX: number = 0, difficulty: number = 1): TerrainInstance {
        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        const totalPoints = 400; // Increased for better smoothness
        const gap = width / totalPoints;
        const points: { x: number, y: number }[] = [];

        // Choose hole position - SCALED UP
        const holeX = offsetX + Phaser.Math.Between(width * 0.7, width * 0.9);
        const holeWidth = 60; // Better balance for 15 radius ball
        const holeDepth = 140;

        // Spawn position
        const spawnX = offsetX + 100;
        const spawnFlatZone = 120;

        // Base height setup
        const targetBaseHeight = height / 2;
        let baseHeight = targetBaseHeight;
        const localSeedOffset = this.currentSeedOffset;

        // Difficulty scaling
        const amp1 = 40 * difficulty;
        const amp2 = 15 * difficulty;
        const freq1 = 0.05 * (1 + (difficulty - 1) * 0.1);
        const freq2 = 0.15 * (1 + (difficulty - 1) * 0.1);

        if (startY !== undefined) {
            const x0 = offsetX;
            const distToHole0 = Math.abs(x0 - holeX);
            const holeFlat0 = Math.min(1, (distToHole0 / (holeWidth * 3)) ** 2);
            const distToSpawn0 = Math.abs(x0 - spawnX);
            const spawnFlat0 = Math.min(1, (distToSpawn0 / spawnFlatZone) ** 2);
            const flat0 = Math.min(holeFlat0, spawnFlat0);

            const initialWave1 = Math.sin(localSeedOffset * freq1) * amp1 * flat0;
            const initialWave2 = Math.sin(localSeedOffset * freq2) * amp2 * flat0;
            baseHeight = startY - (initialWave1 + initialWave2);
        }

        // Normal terrain points creation
        for (let i = 0; i <= totalPoints; i++) {
            const x = offsetX + (i * gap);
            const globalI = localSeedOffset + i;

            const distanceToHole = Math.abs(x - holeX);
            const holeFlatZoneRadius = holeWidth * 1.5;
            const holeFlatMultiplier = Math.min(1, (distanceToHole / holeFlatZoneRadius) ** 2);

            const distanceToSpawn = Math.abs(x - spawnX);
            const spawnFlatMultiplier = Math.min(1, (distanceToSpawn / (spawnFlatZone / Math.sqrt(difficulty))) ** 2);
            const flatMultiplier = Math.min(holeFlatMultiplier, spawnFlatMultiplier);

            const wave1 = Math.sin(globalI * freq1) * amp1 * flatMultiplier;
            const wave2 = Math.sin(globalI * freq2) * amp2 * flatMultiplier;

            // Subtle Funnel effect: More natural slope
            const funnelRadius = holeWidth * 2.5;
            const funnelStrength = 20;
            const funnelAdjustment = distanceToHole < funnelRadius
                ? (1 - (distanceToHole / funnelRadius)) * funnelStrength
                : 0;

            let y = baseHeight + wave1 + wave2 + funnelAdjustment;

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
        const soilColors = [0x3E2723, 0x4E342E, 0x5D4037, 0x6D4C41, 0x795548];

        for (let j = soilColors.length - 1; j >= 0; j--) {
            const offset = (soilColors.length - 1 - j) * 60;
            graphics.fillStyle(soilColors[j], 1);
            graphics.beginPath();
            graphics.moveTo(offsetX - 2, height);
            graphics.lineTo(points[0].x - 2, points[0].y + offset);
            for (let i = 1; i < points.length; i++) {
                graphics.lineTo(points[i].x, points[i].y + offset);
            }
            graphics.lineTo(points[points.length - 1].x + 2, points[points.length - 1].y + offset);
            graphics.lineTo(offsetX + width + 2, height);
            graphics.closePath();
            graphics.fillPath();
        }

        const grassThickness = 45;
        graphics.fillStyle(0x8BC34A, 1);
        graphics.beginPath();
        graphics.moveTo(points[0].x - 2, points[0].y);
        for (let i = 1; i < points.length; i++) graphics.lineTo(points[i].x, points[i].y);
        graphics.lineTo(points[points.length - 1].x + 2, points[points.length - 1].y);
        graphics.lineTo(points[points.length - 1].x + 2, points[points.length - 1].y + grassThickness);
        for (let i = points.length - 1; i >= 0; i--) graphics.lineTo(points[i].x - 2, points[i].y + grassThickness);
        graphics.closePath();
        graphics.fillPath();

        graphics.lineStyle(6, 0x558B2F, 1);
        graphics.beginPath();
        graphics.moveTo(points[0].x - 2, points[0].y);
        for (let i = 1; i < points.length; i++) graphics.lineTo(points[i].x, points[i].y);
        graphics.strokePath();

        // Hole Visual
        graphics.fillStyle(0x000000, 1);
        graphics.fillRect(holeX - holeWidth / 2, holeY, holeWidth, holeDepth);
        graphics.fillStyle(0x8BC34A, 1);
        graphics.fillRect(holeX - holeWidth / 2 - 5, holeY - 4, holeWidth + 10, 8);

        // Physics
        const bodies: MatterJS.BodyType[] = [];
        const wallThickness = 30;

        // Hole Physics
        const holeSensor = this.scene.matter.add.rectangle(holeX, holeY + holeDepth / 2, holeWidth, holeDepth, {
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

            const seg = this.scene.matter.add.rectangle(physicsX, physicsY, segmentLength + 4, segmentThickness, {
                isStatic: true,
                angle: angle,
                friction: 0.005, // Much lower for sliding feel
                restitution: 0.1,
                label: 'terrain',
                chamfer: { radius: 6 } // Smoother transitions
            });
            bodies.push(seg);
        }

        return { points, graphics, bodies, holeSensor };
    }
}
