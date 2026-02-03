# Perfect Drop - Professional Edition

A precision timing game with advanced game feel, polish, and professional-grade features.

## 🎮 Game Features

### Core Gameplay
- **Precision Timing**: Drop the ball at the perfect moment into a shrinking target
- **Progressive Difficulty**: 10 difficulty levels with increasing speed and smaller targets
- **Advanced Physics**: Smooth ball physics with rotation and realistic motion
- **Combo System**: Chain perfect landings for massive score multipliers
- **High Score Tracking**: Persistent stats and leaderboards

### 🎁 Power-Ups (6 Types)
- **⏱ Slow Motion**: Reduces gravity and slows time for easier precision
- **🛡 Shield**: Prevents difficulty increase for one landing
- **×2 Double Points**: Doubles all score gains
- **↔ Expand**: Temporarily increases target width
- **🧲 Magnet**: Attracts power-ups from further away
- **❤ Extra Life**: Instantly grants one additional life (max 5)

### 💖 Lives System
- **Start with 3 lives** - You can miss 3 times before game over
- **Earn lives** - Get +1 life every 5 perfect hits (max 5 lives)
- **Extra Life power-up** - Collect heart power-ups for instant life restoration
- **Endless gameplay** - Keep playing as long as you have lives
- **Progressive difficulty** - Game gets harder continuously, not in discrete levels

### 🏆 Achievements (20 Total)
Progressive achievement system with coin rewards:
- **Beginner**: First Drop (10 coins)
- **Skill**: Perfectionist, Master, Grandmaster (50-200 coins)
- **Combo**: Combo Master, King, God (50-300 coins)
- **Score**: High Scorer, Legend, Unstoppable, Immortal (50-500 coins)
- **Dedication**: Complete 50, 100, 500 drops (50-250 coins)
- **Power**: Collect 10, 50 power-ups (50-150 coins)
- **Flawless**: Land 10, 25 in a row (100-250 coins)
- **Wealth**: Earn 1000, 10000 total score (100-500 coins)

### ✨ Visual Effects (Professional Grade)
- **Animated Starfield**: 150 twinkling stars with parallax scrolling
- **Dynamic Background**: Color-shifting gradient responding to performance
- **Advanced Particles**: Rotating particles with physics simulation
- **Trail Effects**: Motion blur with size decay
- **Screen Shake**: Intensity-based camera shake
- **Flash Effects**: Color-coded feedback (gold/green/red)
- **Chromatic Aberration**: Post-processing effect on perfect hits
- **Vignette**: Dynamic vignette on miss
- **Floating Text**: Score popups and combo notifications
- **Glow Effects**: Shadows, glows, and highlights throughout
- **Target Pulse**: Reactive target animation on landing
- **Ball Rotation**: Physics-based ball spinning

### 🎵 Audio System (Procedural)
- **Web Audio API**: Real-time sound synthesis
- **Chord Progressions**: Musical feedback for achievements
- **Layered Sounds**: Multiple oscillators for rich audio
- **Dynamic Volume**: Context-aware audio levels
- **Sound Types**: Drop, perfect, good, miss, power-up, achievement, menu

### 📊 Stats & Progression
- **Persistent Storage**: All progress saved to localStorage
- **Comprehensive Stats**: Tracks drops, perfect hits, combos, power-ups
- **Coin System**: Earn coins based on performance
- **Achievement Rewards**: Bonus coins for unlocking achievements
- **High Score**: Personal best tracking
- **Max Combo**: Best combo streak saved

### 🎯 Game Feel Enhancements
- **Delta Time**: Frame-independent physics
- **Time Scale**: Slow-motion power-up affects all game speed
- **Pause System**: ESC key or visibility change auto-pauses
- **Difficulty Indicator**: Visual level display with bars
- **Power-Up Timer**: Progress bar showing active power-up duration
- **Responsive Design**: Adapts to all screen sizes
- **High DPI Support**: Pixel ratio scaling for crisp graphics
- **Performance Optimized**: Efficient rendering and updates

## Controls

### Desktop
- **Spacebar** or **Mouse Click**: Drop the ball / Start game / Restart
- **ESC**: Pause/Resume game
- **Settings Button** (top-right): Open settings modal

### Mobile
- **Tap anywhere**: Drop the ball / Start game / Restart
- **Settings Button** (top-right): Open settings modal

## 🎯 Scoring System

- **Perfect Landing** (center golden zone): 50 points × combo multiplier
- **Good Landing** (outer zone): 20 points
- **Combo Multiplier**: Each consecutive perfect landing adds 50% to multiplier
  - 2x combo = 1.5× multiplier
  - 5x combo = 3.5× multiplier
  - 10x combo = 6× multiplier
- **Power-Up Bonus**: Double points power-up multiplies all scores by 2
- **Coins**: Earn 1 coin per 10 points + bonus for high combos
- **Lives**: Start with 3, earn +1 every 5 perfect hits (max 5)

## 🎮 Gameplay Loop

1. **Drop the ball** - Time your drop to land in the target
2. **Build combos** - Chain perfect hits for massive multipliers
3. **Collect power-ups** - Strategic collection for advantages
4. **Earn lives** - Perfect hits reward you with extra chances
5. **Survive longer** - Difficulty increases continuously
6. **Beat high scores** - Compete with yourself for the best run

## 🎨 Professional Game Development Features

### Advanced Game Feel
- **Juice**: Every action has satisfying feedback
- **Polish**: Smooth animations and transitions
- **Responsive**: Instant feedback to player input
- **Predictable**: Consistent physics and behavior
- **Rewarding**: Clear progression and achievement

### Technical Excellence
- **Frame-Independent Physics**: Consistent gameplay at any framerate
- **Object Pooling**: Efficient particle management
- **Delta Time**: Smooth updates regardless of performance
- **High DPI**: Crisp rendering on retina displays
- **Performance**: Optimized rendering pipeline
- **Accessibility**: Clear visual feedback and readable text

### Code Quality
- **Single File**: All code in one maintainable file (~1000 lines)
- **Type Safety**: Full TypeScript implementation
- **Clean Architecture**: Organized into logical sections
- **Comments**: Well-documented code structure
- **Best Practices**: Professional game development patterns

---

**Built for Oasiz Game Studio**  
Version 2.0.0 - Professional Edition

### Core Mechanics
- **One-tap control**: Simple input, difficult mastery
- **Progressive difficulty**: Speed increases and target shrinks with each success
- **Combo system**: Perfect landings build a multiplier for higher scores
- **Power-up system**: Strategic collection for temporary advantages
- **Achievement system**: Long-term goals and milestones
- **Instant feedback**: Visual particles, screen shake, haptics, and sound effects

### Visual Feedback ("Juice")
- **Perfect landing**: Gold particles, success haptic, screen shake, gold flash, sound effect
- **Good landing**: Green particles, medium haptic, light shake, green flash, sound effect
- **Miss**: Red particles, error haptic, heavy shake, red flash, error sound
- **Combo indicator**: Displays current combo multiplier with golden text
- **Power-up collection**: Star burst particles and success sound
- **Achievement unlock**: Animated notification with icon and description
- **Background animation**: Color-shifting gradient based on performance
- **Trail effects**: Motion blur following the ball during drops
- **Starfield**: Parallax scrolling stars for depth

### Responsive Design
The game adapts to all screen sizes and orientations:
- Canvas fills 100% of viewport (mobile and desktop)
- HUD elements positioned with safe area offsets (45px desktop, 120px mobile)
- Settings button follows platform overlay guidelines
- Handles window resize events dynamically

## Settings

The game includes three persistent settings (saved to localStorage):
- **Music** 🎵: Background music toggle (coming soon)
- **Sound FX** 🔊: Game sound effects toggle (Web Audio API)
- **Haptics** 📳: Vibration feedback toggle (mobile)

All game progress is automatically saved:
- High score
- Total drops completed
- Perfect hits count
- Unlocked achievements

## Technical Details

### Architecture
- **Language**: TypeScript
- **Build**: Vite with single-file output
- **Canvas**: 2D rendering with gradient backgrounds
- **State Management**: Simple state machine (START → PLAYING → GAMEOVER)
- **Audio**: Web Audio API for procedural sound effects
- **Storage**: localStorage for settings and progress persistence

### Performance Optimizations
- Particle system with lifecycle management
- Object pooling for trails and particles
- Pre-calculated oscillation using sine wave
- Efficient collision detection
- No random values in render loop (all randomness pre-computed)
- Optimized canvas rendering with minimal state changes

### Platform Integration
- **Score Submission**: Calls `window.submitScore(score)` on game over
- **Haptic Feedback**: Calls `window.triggerHaptic(type)` for tactile feedback
  - `"light"`: UI interactions, ball drop
  - `"medium"`: Good landings
  - `"success"`: Perfect landings, combos, power-ups
  - `"error"`: Missed landings, game over

## 🎵 Audio System

The game uses the Web Audio API to generate procedural sound effects:
- **Drop sound**: 400Hz tone when ball is released
- **Perfect landing**: Dual-tone (800Hz + 1000Hz) success sound
- **Good landing**: 600Hz confirmation tone
- **Miss**: 200Hz error tone (sawtooth wave)
- **Power-up collection**: 1200Hz pickup sound
- **Achievement unlock**: Dual-tone celebration

All sounds respect the FX setting and can be toggled in the settings menu.

## Asset Placeholders

The game currently uses colored shapes and gradients. To add custom sprites:

1. **Ball**: Replace `drawBall()` method with sprite rendering
   - Current: White gradient circle with shadow
   - Suggested: 40x40px sprite with transparent background

2. **Target Platform**: Replace `drawTarget()` method
   - Current: White rectangle with golden center zone
   - Suggested: Platform sprite with visual depth/texture

3. **Background**: Replace gradient in `draw()` method
   - Current: Purple gradient (#667eea → #764ba2)
   - Suggested: Animated background or parallax layers

4. **Particles**: Modify `spawnParticles()` color arrays
   - Current: Solid color circles
   - Suggested: Star/sparkle sprites

## Build & Run

```bash
# Install dependencies
bun install

# Development server
bun run dev

# Production build
bun run build

# Type checking
bun run typecheck
```

## Game Balance

Current difficulty curve:
- **Starting gravity**: 0.6 pixels/frame²
- **Gravity increase**: +0.05 per successful landing
- **Starting target width**: 200px
- **Minimum target width**: 40px
- **Target shrink rate**: -0.5px per landing
- **Perfect zone**: 15% of target width (center golden area)
- **Combo timeout**: 60 frames (~1 second)
- **Power-up spawn**: Every 150 points
- **Power-up duration**: 180 frames (~3 seconds)

### Scoring
- **Perfect landing** (center zone): 50 points + (combo × 5)
- **Good landing** (outer zone): 20 points
- **Combo multiplier**: Builds with consecutive perfect landings
- **Double points power-up**: Multiplies all scores by 2

### Power-Up Effects
- **Slow Motion**: Reduces gravity by 50%
- **Shield**: Prevents one difficulty increase
- **Double Points**: 2× score multiplier
- **Expand Target**: Adds 50px to target width (max 300px)

## Future Enhancements

Potential features to add:
- Background music tracks
- More power-up types (magnet, time freeze, multi-ball)
- Customizable ball skins unlockable by achievements
- Global leaderboard integration
- Daily challenges with fixed difficulty curves
- Different game modes (zen mode, time attack, endless)
- More particle effects and visual polish
- Tutorial/onboarding for new players
- Statistics page (accuracy %, average combo, etc.)

---

**Built for Oasiz Game Studio**  
Version 2.0.0 - Enhanced Edition
