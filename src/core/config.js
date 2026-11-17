'use strict';
/* =====================================================================
   VOIDBORNE — procedural universe in raw WebGL2 + Web Audio
   ---------------------------------------------------------------------
   TUNABLE CONSTANTS — edit freely
   ===================================================================== */
const CFG={
  SEED:1337,              // overridden by #seed=NNNN in the URL
  WORLD_RADIUS:5200,      // soft boundary of the playable sphere
  PLANET_COUNT:7,         // 5–8 recommended
  ASTEROID_COUNT:3200,    // instanced belt rocks
  RING_ROCKS:2600,        // rocks in the ringed planet's ring
  MINNOW_SCHOOLS:6,       // boid flocks
  MINNOWS_PER_SCHOOL:200, // 6×200 = 1200 small creatures
  WHALE_COUNT:3,
  MEDUSA_COUNT:36,
  WRECK_COUNT:5,          // derelict ships (wreck 0 is the explorable one)
  DEBRIS_PER_WRECK:90,
  MAX_SPEED:70,           // m/s without boost
  BOOST_MULT:4.0,
  THRUST:60,              // acceleration m/s²
  DRAG:0.55,              // per-second velocity damping
  LOOK_SENS:0.0022,
  QUALITY:'high',         // 'low' | 'medium' | 'high'  (render scale cap, bloom, sky bake size)
  BLOOM:true,
  TARGET_FRAME_MS:17,     // dynamic resolution scaler aims below this
  STAR_RADIUS:230,
  MUSIC:true,
  // ---- added in Phase 1 ----
  NEBULA_INTENSITY:0.55,  // overall brightness of the baked nebula (0 = none, 1 = loud)
  GRADE_STRENGTH:1.0,     // 0..1 strength of the per-zone colour grading in the tonemap pass
  MIN_RENDER_SCALE:0.7,   // floor of the dynamic resolution scaler (fraction of canvas size)
  MOBILE_QUALITY:'medium',// quality preset used on touch devices (unless #q= overrides)
  MOBILE_MSAA:2,          // MSAA samples on touch devices (desktop uses 4)
  MOBILE_DPR:1.5,         // devicePixelRatio cap on touch devices (desktop 2)
  BREACH_MARKER:true,     // green marker lights + HUD hint at the explorable wreck's breach
  // ---- added in Phase 2 (each has a quality switch; 'low' disables or uses the cheap variant) ----
  VOLUMETRICS:true,       // raymarched nebula pockets (monolith, station, one standalone)
  GODRAYS:true,           // radial light shafts from the star in post
  TAA:true,               // temporal anti-aliasing (jittered projection + reprojected history)
  PLANET_DISPLACEMENT:true,// vertex displacement from the surface heightfield (nearest planet gets the dense mesh)
  ATMO_SCATTER:true,      // raymarched Rayleigh/Mie atmosphere shell (false = old rim glow)
  CREATURE_LIGHTS:8,      // number of nearest bioluminescent sources fed as point lights (0 = off)
  BAKE_AO:true,           // bake vertex ambient occlusion into derelict and station hulls at load
  BLACK_HOLE:true,        // rare landmark: lensing black hole with accretion disk
  PULSAR:true,            // rare landmark: pulsar with two sweeping beams
  BH_GRAVITY:1.6e5,       // GM of the black hole (m³/s²) for the pull on the player; 0 = none
  // ---- added in Phase 3 (open world) ----
  SECTOR_SIZE:60000,      // edge length of one grid sector (m); the home system sits in sector (0,0,0)
  SECTOR_DENSITY:0.55,    // chance that a sector holds a star system
  SECTOR_LOAD:24000,      // generate a system when the player is closer than this to its star (m)
  SECTOR_UNLOAD:34000,    // release it beyond this distance (hysteresis vs SECTOR_LOAD)
  STAR_POINTS_RANGE:3,    // sectors (each axis) whose stars are drawn as distant points in the sky
  MAP_RANGE:4,            // sectors shown in each direction on the star map
  USE_WORKER:true,        // generate sectors in a Web Worker (falls back to the main thread)
  UPLOAD_BUDGET_MS:3,     // GPU upload budget per frame for streamed meshes
  WARP_TIME:3.2,          // seconds for a warp jump
  AUTOPILOT_MARGIN:60,    // extra stand-off distance (m) where the autopilot stops
  MONOLITH_AWAKEN:6,      // discoveries needed before the Monolith reacts
  EVENT_MIN:90,EVENT_MAX:200, // seconds between random events (meteor shower, migration, stellar flare)
  SAVE:true,              // persist discoveries, codex and settings in localStorage
  // ---- added in Phase 4 (audio, input, tools) ----
  HRTF:true,              // HRTF spatial audio (false = equalpower); 'low' quality always uses equalpower
  AUDIO_WORKLET:true,     // whale song + cosmic hiss synthesized in an AudioWorklet (falls back to the node graph)
  ZONE_MOOD:true,         // drone and music shift by zone (star / belt / deep space / wreck / open space)
  GAMEPAD:true,           // Gamepad API support (standard mapping)
  GP_DEADZONE:0.15,       // stick dead zone
  GP_LOOK_SPEED:2.4,      // rad/s at full right-stick deflection
  PHOTO_SPEED:20,         // photo-mode free camera speed (m/s; SHIFT ×6)
  RECORD_FPS:60,          // canvas.captureStream frame rate for clip recording
  RECORD_AUDIO:true,      // include the game audio in recorded clips
  RECORD_BITRATE:8000000, // video bits per second
  WAKE_LOCK:true,         // keep the screen awake while playing (Screen Wake Lock API)
  // ---- added in Phase 5A (living world, playable interior) ----
  ECOLOGY:true,           // whales hunt minnow schools (visual only), schools split and re-merge, medusae react to whales
  HUNT_RANGE:900,         // m: a whale notices a school within this distance of its path
  HUNT_SPEED:9,           // m/s: top speed of the hunting drift (slow and dignified, never a chase)
  HUNT_TIME:45,HUNT_REST:50, // s: length of a hunt, then rest before the next one
  FLEE_RADIUS:140,        // m (+40% of the whale's size): a school scatters when a whale gets this close
  FLEE_STRENGTH:40,       // flee acceleration of the split sub-groups
  FLEE_TIME:6,MERGE_TIME:8, // s: split-and-swirl phase, then gradual re-merge
  FLEE_COOLDOWN:25,       // s: after re-merging, a school ignores whales for this long
  MEDUSA_WHALE_RANGE:350, // m: medusae brighten and pulse faster when a whale passes this close
  ECO_LOW_EVERY:6,        // on 'low' quality the ecology checks run every N frames
  INTERACT_RANGE:7,       // m: reach of the interact key (G) inside wreck 0
  LANG:'auto',            // 'auto' (from navigator.language) | 'en' | 'id'
  // ---- added in Phase 5B (exploration tools, suit feel) ----
  SCANNER:true,           // hold V (touch: SCAN, gamepad: D-pad down) to scan the object under the crosshair
  SCAN_TIME:1.0,          // s of steady scanning before the data appears
  SCAN_RANGE:2500,        // m for ships, creatures and anomalies; planets, moons and stars use 12x this
  SCAN_LINGER:5,          // s the data panel stays up after the scan key is released
  VISOR:true,             // helmet visor master switch (also a pause-menu checkbox); every effect below can be switched off
  VISOR_CURVE:1.0,        // glass curvature at the screen edges (0 = flat glass)
  VISOR_REFLECT:true,     // faint reflection of the HUD in the glass ('low' quality: off)
  VISOR_FOG:true,         // breath fog that builds up while the player is idle and clears when moving
  VISOR_FOG_DELAY:6,      // s without moving before the visor starts to fog
  VISOR_CRACKS:true,      // faint cracks after a hard collision (off when reduced motion is on)
  VISOR_CRACK_SPEED:40,   // m/s impact speed that cracks the visor
  VISOR_CRACK_FADE:150,   // s for the cracks to fade away completely
  INTRO:true,             // short opening sequence after BEGIN EXPLORATION (any key, click, tap or pad button skips it)
  INTRO_TIME:5.0,         // s
  DEBUG_OVERLAY:false,    // start with the debug overlay open (toggle: backtick key ` )
  // ---- added in Phase 5C (accessibility, input, languages; every value below is also a pause-menu setting that is remembered) ----
  REDUCE_MOTION:'auto',   // 'auto' follows the system prefers-reduced-motion setting | true | false
  CAPTIONS:false,         // small text captions for important sounds (whale song, beacon, doors, power, monolith…)
  CAPTION_TIME:3.5,       // s a caption stays on screen
  INVERT_Y:false,         // invert vertical look for mouse, touch and gamepad
  SENS_MOUSE:1,SENS_TOUCH:1,SENS_PAD:1,  // look sensitivity multipliers (pause-menu sliders: 0.25-3)
  // ---- added in Phase 5D (gameplay options and audio depth; all OFF by default, each is a remembered pause-menu switch) ----
  GRAVITY:false,          // planets and stars pull the player (orbits, slingshots); drag drops to GRAVITY_DRAG while it is on
  GRAVITY_STRENGTH:1.0,   // multiplier (pause-menu slider 0.25-3)
  GRAVITY_K:0.02,         // surface gravity per metre of body radius: a 100 m planet pulls 2 m/s² at its surface, falling off with 1/d²
  STAR_MASS:6,            // stars pull this many times harder than a planet of the same size
  GRAVITY_DRAG:0,         // velocity damping per second while gravity is on (0 = Newtonian: you keep your speed, thrust the other way to brake); inside a wreck DRAG always applies
  SURVIVAL:false,         // oxygen + boost-energy bars; out of oxygen = gentle fade and respawn at the last safe point (no game over)
  O2_TIME:480,            // s of oxygen in a full tank
  O2_REFILL:15,           // s to refill near the station or inside a powered wreck section
  BOOST_ENERGY:12,        // s of continuous boost on a full charge
  BOOST_REGEN:20,         // s to recharge from empty
  BOOST_DEBRIS:false,     // sparks and debris swept up when flying fast through debris fields ('low' quality: off)
  DEBRIS_SPEED:60,        // m/s above which debris gets swept up
  DOPPLER:false,          // pitch shift of whale song, beacon pings, station/monolith hum… by relative velocity
  DOPPLER_C:900,          // m/s used as the 'speed of sound' for the shift (space has none: this is a feel value)
  DOPPLER_MAX:4,          // semitones: hard cap so the shift never sounds broken
  OCCLUSION:false,        // muffle sounds when a planet, hull or large object lies between the source and you
  OCC_CUTOFF:650,         // Hz low-pass when fully occluded
  OCC_GAIN:0.4,           // gain when fully occluded
  OCC_EVERY:6             // frames between occlusion tests ('low' quality: every 15 frames)
};
/* ===================================================================== */
