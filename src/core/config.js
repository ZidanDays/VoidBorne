'use strict';
/* =====================================================================
   VOIDBORNE — procedural universe in raw WebGL2 + Web Audio
   ---------------------------------------------------------------------
   TUNABLE CONSTANTS — edit freely
   ===================================================================== */
const CFG = {
  SEED: 1337, // overridden by #seed=NNNN in the URL
  WORLD_RADIUS: 5200, // soft boundary of the playable sphere
  PLANET_COUNT: 7, // 5–8 recommended
  ASTEROID_COUNT: 3200, // instanced belt rocks
  RING_ROCKS: 2600, // rocks in the ringed planet's ring
  MINNOW_SCHOOLS: 6, // boid flocks
  MINNOWS_PER_SCHOOL: 200, // 6×200 = 1200 small creatures
  WHALE_COUNT: 3,
  MEDUSA_COUNT: 36,
  WRECK_COUNT: 5, // derelict ships (wreck 0 is the explorable one)
  DEBRIS_PER_WRECK: 90,
  MAX_SPEED: 70, // m/s without boost
  BOOST_MULT: 4.0,
  THRUST: 60, // acceleration m/s²
  DRAG: 0.55, // per-second velocity damping
  LOOK_SENS: 0.0022,
  QUALITY: 'high', // 'low' | 'medium' | 'high' | 'ultra' (Phase 6B)  (render scale cap, bloom, sky bake size)
  BLOOM: true,
  TARGET_FRAME_MS: 17, // dynamic resolution scaler aims below this
  STAR_RADIUS: 230,
  MUSIC: true,
  // ---- added in Phase 1 ----
  NEBULA_INTENSITY: 0.55, // overall brightness of the baked nebula (0 = none, 1 = loud)
  GRADE_STRENGTH: 1.0, // 0..1 strength of the per-zone colour grading in the tonemap pass
  MIN_RENDER_SCALE: 0.7, // floor of the dynamic resolution scaler (fraction of canvas size)
  MOBILE_QUALITY: 'medium', // quality preset used on touch devices (unless #q= overrides)
  MOBILE_MSAA: 2, // MSAA samples on touch devices (desktop uses 4)
  MOBILE_DPR: 1.5, // devicePixelRatio cap on touch devices (desktop 2)
  BREACH_MARKER: true, // green marker lights + HUD hint at the explorable wreck's breach
  // ---- added in Phase 2 (each has a quality switch; 'low' disables or uses the cheap variant) ----
  VOLUMETRICS: true, // raymarched nebula pockets (monolith, station, one standalone)
  GODRAYS: true, // radial light shafts from the star in post
  TAA: true, // temporal anti-aliasing (jittered projection + reprojected history)
  PLANET_DISPLACEMENT: true, // vertex displacement from the surface heightfield (nearest planet gets the dense mesh)
  ATMO_SCATTER: true, // raymarched Rayleigh/Mie atmosphere shell (false = old rim glow)
  CREATURE_LIGHTS: 8, // number of nearest bioluminescent sources fed as point lights (0 = off)
  BAKE_AO: true, // bake vertex ambient occlusion into derelict and station hulls at load
  BLACK_HOLE: true, // rare landmark: lensing black hole with accretion disk
  PULSAR: true, // rare landmark: pulsar with two sweeping beams
  BH_GRAVITY: 1.6e5, // GM of the black hole (m³/s²) for the pull on the player; 0 = none
  // ---- added in Phase 3 (open world) ----
  SECTOR_SIZE: 60000, // edge length of one grid sector (m); the home system sits in sector (0,0,0)
  SECTOR_DENSITY: 0.55, // chance that a sector holds a star system
  SECTOR_LOAD: 24000, // generate a system when the player is closer than this to its star (m)
  SECTOR_UNLOAD: 34000, // release it beyond this distance (hysteresis vs SECTOR_LOAD)
  STAR_POINTS_RANGE: 3, // sectors (each axis) whose stars are drawn as distant points in the sky
  MAP_RANGE: 4, // sectors shown in each direction on the star map
  USE_WORKER: true, // generate sectors in a Web Worker (falls back to the main thread)
  UPLOAD_BUDGET_MS: 3, // GPU upload budget per frame for streamed meshes
  WARP_TIME: 3.2, // seconds for a warp jump
  AUTOPILOT_MARGIN: 60, // extra stand-off distance (m) where the autopilot stops
  MONOLITH_AWAKEN: 6, // discoveries needed before the Monolith reacts
  EVENT_MIN: 90,
  EVENT_MAX: 200, // seconds between random events (meteor shower, migration, stellar flare)
  SAVE: true, // persist discoveries, codex and settings in localStorage
  // ---- added in Phase 4 (audio, input, tools) ----
  HRTF: true, // HRTF spatial audio (false = equalpower); 'low' quality always uses equalpower
  AUDIO_WORKLET: true, // whale song + cosmic hiss synthesized in an AudioWorklet (falls back to the node graph)
  ZONE_MOOD: true, // drone and music shift by zone (star / belt / deep space / wreck / open space)
  GAMEPAD: true, // Gamepad API support (standard mapping)
  GP_DEADZONE: 0.15, // stick dead zone
  GP_LOOK_SPEED: 2.4, // rad/s at full right-stick deflection
  PHOTO_SPEED: 20, // photo-mode free camera speed (m/s; SHIFT ×6)
  RECORD_FPS: 60, // canvas.captureStream frame rate for clip recording
  RECORD_AUDIO: true, // include the game audio in recorded clips
  RECORD_BITRATE: 8000000, // video bits per second
  WAKE_LOCK: true, // keep the screen awake while playing (Screen Wake Lock API)
  // ---- added in Phase 5A (living world, playable interior) ----
  ECOLOGY: true, // whales hunt minnow schools (visual only), schools split and re-merge, medusae react to whales
  HUNT_RANGE: 900, // m: a whale notices a school within this distance of its path
  HUNT_SPEED: 9, // m/s: top speed of the hunting drift (slow and dignified, never a chase)
  HUNT_TIME: 45,
  HUNT_REST: 50, // s: length of a hunt, then rest before the next one
  FLEE_RADIUS: 140, // m (+40% of the whale's size): a school scatters when a whale gets this close
  FLEE_STRENGTH: 40, // flee acceleration of the split sub-groups
  FLEE_TIME: 6,
  MERGE_TIME: 8, // s: split-and-swirl phase, then gradual re-merge
  FLEE_COOLDOWN: 25, // s: after re-merging, a school ignores whales for this long
  MEDUSA_WHALE_RANGE: 350, // m: medusae brighten and pulse faster when a whale passes this close
  ECO_LOW_EVERY: 6, // on 'low' quality the ecology checks run every N frames
  INTERACT_RANGE: 7, // m: reach of the interact key (G) inside wreck 0
  LANG: 'auto', // 'auto' (from navigator.language) | 'en' | 'id'
  // ---- added in Phase 5B (exploration tools, suit feel) ----
  SCANNER: true, // hold V (touch: SCAN, gamepad: D-pad down) to scan the object under the crosshair
  SCAN_TIME: 1.0, // s of steady scanning before the data appears
  SCAN_RANGE: 2500, // m for ships, creatures and anomalies; planets, moons and stars use 12x this
  SCAN_LINGER: 5, // s the data panel stays up after the scan key is released
  VISOR: true, // helmet visor master switch (also a pause-menu checkbox); every effect below can be switched off
  VISOR_CURVE: 1.0, // glass curvature at the screen edges (0 = flat glass)
  VISOR_REFLECT: true, // faint reflection of the HUD in the glass ('low' quality: off)
  VISOR_FOG: true, // breath fog that builds up while the player is idle and clears when moving
  VISOR_FOG_DELAY: 6, // s without moving before the visor starts to fog
  VISOR_CRACKS: true, // faint cracks after a hard collision (off when reduced motion is on)
  VISOR_CRACK_SPEED: 40, // m/s impact speed that cracks the visor
  VISOR_CRACK_FADE: 150, // s for the cracks to fade away completely
  INTRO: true, // short opening sequence after BEGIN EXPLORATION (any key, click, tap or pad button skips it)
  INTRO_TIME: 5.0, // s
  DEBUG_OVERLAY: false, // start with the debug overlay open (toggle: backtick key ` )
  // ---- added in Phase 5C (accessibility, input, languages; every value below is also a pause-menu setting that is remembered) ----
  REDUCE_MOTION: 'auto', // 'auto' follows the system prefers-reduced-motion setting | true | false
  CAPTIONS: false, // small text captions for important sounds (whale song, beacon, doors, power, monolith…)
  CAPTION_TIME: 3.5, // s a caption stays on screen
  INVERT_Y: false, // invert vertical look for mouse, touch and gamepad
  SENS_MOUSE: 1,
  SENS_TOUCH: 1,
  SENS_PAD: 1, // look sensitivity multipliers (pause-menu sliders: 0.25-3)
  // ---- added in Phase 5D (gameplay options and audio depth; all OFF by default, each is a remembered pause-menu switch) ----
  GRAVITY: false, // planets and stars pull the player (orbits, slingshots); drag drops to GRAVITY_DRAG while it is on
  GRAVITY_STRENGTH: 1.0, // multiplier (pause-menu slider 0.25-3)
  GRAVITY_K: 0.02, // surface gravity per metre of body radius: a 100 m planet pulls 2 m/s² at its surface, falling off with 1/d²
  STAR_MASS: 6, // stars pull this many times harder than a planet of the same size
  GRAVITY_DRAG: 0, // velocity damping per second while gravity is on (0 = Newtonian: you keep your speed, thrust the other way to brake); inside a wreck DRAG always applies
  SURVIVAL: false, // oxygen + boost-energy bars; out of oxygen = gentle fade and respawn at the last safe point (no game over)
  O2_TIME: 480, // s of oxygen in a full tank
  O2_REFILL: 15, // s to refill near the station or inside a powered wreck section
  BOOST_ENERGY: 12, // s of continuous boost on a full charge
  BOOST_REGEN: 20, // s to recharge from empty
  BOOST_DEBRIS: false, // sparks and debris swept up when flying fast through debris fields ('low' quality: off)
  DEBRIS_SPEED: 60, // m/s above which debris gets swept up
  DOPPLER: false, // pitch shift of whale song, beacon pings, station/monolith hum… by relative velocity
  DOPPLER_C: 900, // m/s used as the 'speed of sound' for the shift (space has none: this is a feel value)
  DOPPLER_MAX: 4, // semitones: hard cap so the shift never sounds broken
  OCCLUSION: false, // muffle sounds when a planet, hull or large object lies between the source and you
  OCC_CUTOFF: 650, // Hz low-pass when fully occluded
  OCC_GAIN: 0.4, // gain when fully occluded
  OCC_EVERY: 6, // frames between occlusion tests ('low' quality: every 15 frames)
  // ---- added in Phase 6A (test tooling; only active when the URL asks for it, see core/det.js — the normal game is unchanged) ----
  DET_DT: 1 / 60, // ?det=1: every frame advances exactly this many seconds, whatever the real frame time
  DET_EPOCH: 1767225600000, // ?det=1: Date.now() starts at 2026-01-01 00:00 UTC and advances with the simulated time
  DET_RANDOM_SALT: 0x2545f491, // ?det=1 / ?seeded=1: Math.random becomes a seeded stream (seed XOR this salt)
  BENCH_SECONDS: 30, // debug build, ?bench: measured length of the scripted benchmark path (s); ?bench=N overrides
  BENCH_WARMUP: 3, // debug build, ?bench: seconds on the first shot before measuring (shader warm-up, streaming)
  // ---- added in Phase 6B (quality system, 'ultra', HD capture, comfort). low / medium / high look and cost as before; each 'ultra' item has its own switch ----
  SS_MAX: 1.5, // 'ultra': render-scale ceiling (supersampling above the canvas size); the dynamic scaler still lowers it, down to MIN_RENDER_SCALE
  MAX_DPR: 3, // 'ultra': devicePixelRatio cap (the other presets keep 2 on desktop and MOBILE_DPR on touch)
  ULTRA_MAX_PIXELS: 8.3e6, // 'ultra': cap of the internal render size in pixels (8.3e6 = about 3840x2160) so MSAA memory stays bounded
  ULTRA_ANISO: 8, // 'ultra': anisotropic filtering on the baked textures (EXT_texture_filter_anisotropic, clamped to the GPU maximum; 0 = off)
  ULTRA_SKY: 2048, // 'ultra': sky cubemap face size, mipmapped, baked a strip per frame (clamped to MAX_CUBE_MAP_TEXTURE_SIZE; 0 = keep the 1024 bake)
  ULTRA_TEXTURES: true, // 'ultra': baked hull panel atlas + detail-noise texture (mipmapped, baked a strip per frame); needed by ULTRA_HULLS/ULTRA_PLANETS detail
  ULTRA_TEX_SIZE: 1024, // side of those two textures (clamped to MAX_TEXTURE_SIZE)
  ULTRA_PLANETS: true, // 'ultra': extra surface octaves faded by pixel footprint (fwidth), finer per-fragment normals, GGX ocean/ice glints, denser LOD
  ULTRA_HULLS: true, // 'ultra': hull/station panel lines + greebles + GGX specular (shader) and one Phong-tessellation level (smoother curves); collision unchanged
  ULTRA_CREATURES: true, // 'ultra': tessellated (smoother) whale and medusa silhouettes, footprint-filtered whale sparkle
  ULTRA_STARS: true, // 'ultra': sky stars and point sprites drawn as point-spread blobs of at least ULTRA_POINT_MIN px with conserved brightness (no sub-pixel flicker)
  ULTRA_POINT_MIN: 1.8, // minimum star / point-sprite size in screen pixels for ULTRA_STARS
  ULTRA_VOL_STEPS: 40, // 'ultra': volumetric nebula ray-march steps (high: 28) at half resolution
  ULTRA_BUDGET_MS: 6, // ms per frame spent preparing 'ultra' (shader compiles, bakes, tessellation) until it is ready; the frame keeps the 'high' look meanwhile
  FRAGDEPTH_SCOPE: 'all', // 'all' = every mesh writes per-fragment log depth (as before) | 'large' = small additive creatures and meteors use vertex depth only (see README)
  PHOTO_SCALE: 2, // photo-mode PNG = this x the canvas size (pause menu 1-4; 1 = the old capture); tiled when it cannot be rendered in one piece
  PHOTO_MAX_SIDE: 8192, // longest side of a photo in pixels
  PHOTO_TILE: 2048, // largest tile side of a tiled capture (clamped to the GPU limits)
  PHOTO_ONEPASS_PIXELS: 9e6, // captures above this many pixels are tiled instead of rendered in one offscreen pass
  PHOTO_FRAMES: 8, // frames accumulated per capture (or per tile) when TAA is on; the scene is frozen in photo mode, so nothing ghosts
  AUTO_QUALITY: true, // first run on desktop only: measure ~AUTO_QUALITY_SECONDS of frames at 'high' and pick low / medium / high; never again unless asked
  AUTO_QUALITY_SECONDS: 4, // measured seconds (after 1 s of warm-up)
  AUTO_QUALITY_MS: [22, 36], // median frame time at 'high' (ms): below the first -> high, below the second -> medium, otherwise low
  TAA_MODE: 'auto', // 'auto' = the preset decides (low: off) | 'on' | 'off'; a pause-menu setting independent of the preset (TAA can ghost on small bright stars)
  FOV: 1.15, // vertical field of view in radians (pause-menu slider 50-100 degrees); the boost widening stays relative to it
  HORIZON_AID: false, // fixed reference aid: a thin artificial horizon of the home system's plane, with roll ticks
  ROLL_VIGNETTE: 'auto', // darken the screen edges while rolling or turning fast: 'auto' = only with reduce motion | true | false
  UI_SCALE: 1, // HUD and menu scale (pause-menu slider 0.75-1.5)
  // ---- added in Phase 6C (star variety and lighting). The home system is unchanged unless HOME_STAR_VARIETY is on ----
  STAR_VARIETY: true, // generated sectors: star classes (red dwarf, orange, yellow, white, blue giant, white dwarf, neutron star) and multiple stars; false = the old stars
  HOME_STAR_VARIETY: false, // also give the home star a class (look, light, size, voice); its planets, belt and everything else stay where they are; never multiple
  BINARY_CHANCE: 0.2, // chance that a generated system has more than one star
  TRINARY_SHARE: 0.12, // share of those that are triple (a close pair plus a distant third star): 0.2 x 0.12 = about 1 system in 40
  WIDE_SHARE: 0.3, // share of the binaries whose companion is distant (planets orbit the primary); the rest are close pairs the planets circle
  BINARY_PERIOD: [600, 1500], // s for one turn of a close pair around its centre of mass
  BINARY_CLEAR: 3.2, // planets of a close pair orbit beyond this many pair separations (circumbinary stability, Holman & Wiegert 1999: ~2-4)
  WIDE_DIST: [25000, 32000], // m from the primary to a distant companion (planets stay within 0.28 x this: stable S-type orbits)
  WIDE_LIGHT: 0.15, // light of a distant companion relative to its own intensity (it is far away; a faint second shadow)
  MAX_STARS: 3, // per-sector cap of stars (checked by tools/seed-test.mjs)
  STAR_LIGHTS: 2, // lights per object in the shaders (1 = only the primary; the second light costs one more lighting term per pixel)
  PLAUSIBILITY: 0.75, // soft preference: chance that an implausible living / lava / ice world is swapped for one that suits its distance (0 = off)
  HZ_BASE: 2400, // m: middle of the habitable band around a sun-like ('G') star; it scales with sqrt(luminosity)
  STAR_VOICE: true, // a quiet synthesized signature near a classed star (spatialized, captioned)
  STAR_VOICE_RANGE: 9000, // m from a classed star within which its voice plays
  SKY_CLASS_DOTS: false, // true = the distant dots of other systems show their class colour / size (+ a dot per distant companion); false = the pre-6C dots, so every view from home stays exactly as before
  // ---- added in Phase 6D (new planets and moons). The home system is not generated by the sector generator: it is unchanged ----
  PLANET_VARIETY: true, // generated sectors: new planet types, special moons and ring variety (false = exactly the 6C sectors)
  NEW_TYPES_SCALE: 1, // multiplies every chance of a new planet type / special moon (0.5 = half as many; see variantType in world/planet-types.js)
  RING_EXTRA: 0.03, // chance of a thin ring on a planet type that never had rings (gas giants keep their old 60%)
  PLUME_MOONS_MAX: 2, // per-sector cap of moons with plumes (volcanic moons, geyser moons)
  PLUME_PARTICLES: { low: 32, medium: 96, high: 160, ultra: 256 }, // particles per visible plume (one draw call each)
  PLUME_RANGE: 6000, // m: plumes further away are not drawn
  ROGUE_PLANETS: true, // rare starless sectors holding one dark rogue planet
  ROGUE_CHANCE: 0.03, // chance that an empty sector holds a rogue planet (never within one sector of home)
  ROGUE_STARLIGHT: 0.05, // light a rogue planet gets from the nearest star, relative to that star's own light
  PLANET_VOICE: true, // a quiet synthesized signature near the new planet types, rogue planets and plume moons (spatialized, captioned)
  PLANET_VOICE_RANGE: 4000, // m from the surface within which a planet's voice plays
  // ---- added in Phase 6E (small bodies and deep-space landmarks); none of it is placed in the home system ----
  COMETS: true, // comets on eccentric orbits in generated systems: irregular nucleus (solid), ion + dust tails (particles, not solid)
  COMET_CHANCE: 0.35, // chance that a system has a comet (a second one: a quarter of that)
  COMETS_MAX: 2, // per-sector cap
  COMET_PARTICLES: { low: 120, medium: 260, high: 420, ultra: 640 }, // tail particles per comet (ion + dust), one draw each
  COMET_RANGE: 40000, // m: tails further away are not drawn
  OUTER_BELT: true, // a sparse Kuiper-like belt of rocks beyond the last planet (the instanced rock machinery of the home belt)
  OUTER_BELT_CHANCE: 0.45, // chance per system
  OUTER_BELT_ROCKS: 1500, // rocks per belt (cap; 3 instanced draws)
  EDGE_DWARFS_MAX: 2, // dwarf planets inside an outer belt (cap per sector)
  GRAVEYARD: true, // a rare field of derelicts in the outskirts of a system, one or two of them enterable
  GRAVEYARD_CHANCE: 0.012, // chance per system, never within one sector of home (for scale: about 1 % of systems have a neutron star)
  GRAVEYARD_WRECKS: 10, // derelicts per graveyard (cap; plus GRAVEYARD_ENTER enterable hulls)
  GRAVEYARD_ENTER: 2, // enterable hulls per graveyard (1..2)
  RARE_LANDMARK: 0.35, // the global rare-landmark probability: chance that a block of LANDMARK_BLOCK^3 sectors holds one landmark
  LANDMARK_BLOCK: 4, // at most one landmark per block of 4 x 4 x 4 sectors (in a sector chosen by a hash of the block)
  LANDMARK_MIN_DIST: 3, // sectors (Chebyshev) from home: landmarks are always far from the start
  SNR: true, // supernova remnant: an expanding shell of glowing filaments around a neutron star, in an empty sector
  PLANETARY_NEBULA: true, // planetary nebula: a two-lobed glowing shell around a white dwarf, in an empty sector
  ANCIENT_RING: true, // megastructure: a broken segment of an ancient ring with ruins, around a system's star
  LANDMARK_VOICE: true, // synthesized signatures of comets, outer belts, graveyards, remnants, nebulae and the ring (captioned)
};
/* ===================================================================== */
