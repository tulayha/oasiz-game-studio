export type SeasonType = 'spring' | 'winter' | 'desert' | 'fall';
export type TimeType = 'day' | 'night' | 'sunset' | 'morning';

export interface ThemeColors {
    sky: number;
    groundTop: number;
    groundBottom: number;
    grass: number;
    clouds: number;
    mountains: number;
    mountainAlpha: number;
}

export default class ThemeManager {
    static getColors(season: SeasonType, time: TimeType): ThemeColors {
        const colors: ThemeColors = {
            sky: 0x81D4FA,
            groundTop: 0x8D6E63,
            groundBottom: 0x5D4037,
            grass: 0x8ac926,
            clouds: 0xffffff,
            mountains: 0x4A9099,
            mountainAlpha: 0.4
        };

        // 1. Season Adjustments (Ground & Grass)
        switch (season) {
            case 'winter':
                colors.grass = 0xDEE4E7; // Snow
                colors.groundTop = 0x90A4AE; // Frozen Earth
                colors.groundBottom = 0x546E7A;
                break;
            case 'desert':
                colors.grass = 0xE6C229; // Sand
                colors.groundTop = 0xD4A373; // Sandstone
                colors.groundBottom = 0xBC6C25;
                break;
            case 'fall':
                colors.grass = 0xDfb400; // Orange/Brown Grass
                colors.groundTop = 0x795548;
                colors.groundBottom = 0x4E342E;
                break;
            case 'spring':
            default:
                colors.grass = 0x8ac926;
                colors.groundTop = 0x6D4C41; // Standard Earth
                colors.groundBottom = 0x4E342E; // Darker Earth
                break;
        }

        // 2. Time Adjustments (Sky, Ambience, Tints)
        switch (time) {
            case 'night':
                colors.sky = 0x051024; // Deep Blue/Black
                colors.clouds = 0x455A64; // Dark Clouds
                colors.mountains = 0x263238; // Dark Silhouette
                colors.mountainAlpha = 0.8;
                // Dim the ground slightly for night logic if we were using lighting, 
                // but since these are flat colors, we might darken them manually or leave as is.
                break;
            case 'sunset':
                colors.sky = 0xFF7043; // Orange/Red
                colors.clouds = 0xFFCCBC; // Peach
                colors.mountains = 0x5D4037; // Brownish
                break;
            case 'morning':
                colors.sky = 0xFFF9C4; // Pale Yellow/Blue mix simulation
                // Let's use a nice pale blue-ish
                colors.sky = 0xE1F5FE;
                colors.clouds = 0xFFFFFF;
                colors.mountains = 0x90CAF9;
                break;
            case 'day':
            default:
                // Keep defaults
                break;
        }

        return colors;
    }
}
