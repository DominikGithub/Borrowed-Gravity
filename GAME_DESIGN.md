# Borrowed Gravity: game design

**A one-key game. The only control is Shift.**

You are a stray spark, a tiny comet drifting through a sky whose stars have gone cold.
You can't steer, thrust or brake. All you can do is **borrow gravity**: hold Shift near a
world to load its pull, then let go to spend it. Use that to travel from cold star to
cold star and relight them, one constellation at a time. Along the way, Shift takes on
other jobs: pumping light, spinning a sling, raising a shield and focusing a camera.
Every change of job is announced with a card, and the game waits until you tap Shift to
start it.

---

## 1. Core mechanic: FLIGHT (cyan): Shift borrows gravity

| Input | What happens |
|---|---|
| **No Shift** | No gravity at all. The spark drifts in a straight line at cruise speed. |
| **Hold Shift** inside a body's field (dashed cyan ring) | Charge rises from 0 to 100 % in about 1.25 s. Gravity motes stream from the body to you, a tether links you, and the field ring ripples. |
| **Release Shift** | The charge becomes a 0.9 s pulse toward that body (or *away* from it, for a white hole). The closer you are, the stronger the pulse. |

You don't choose a direction: **where you are when you let go is the direction.**
- Let go while the planet is still *ahead* and you dive toward it.
- Let go while it's *beside* you and you curve hard around it.
- Let go once it's *behind* you and you get pulled back.

That gives you two controls from one key. *When* you let go sets the direction, and *how
long* you held sets the strength.

**The preview.** While you hold, a bright animated path shows exactly where you'd go if
you let go now. You can watch it swing as you pass the body. A faint path shows "keep
holding until full, then let go". The colour at the end of the path tells you what
happens there:
- red: you'd crash
- amber: a cold star (kindle)
- violet: a spindle (sling)
- green: a storm (shield)
- pink: a sight to photograph (lens)

The preview runs **the same physics code** as the game. So does the level checker (§8).

### Bodies
| Body | Lends gravity | Feel |
|---|---|---|
| Rock / ice planet | normal | the bread-and-butter turn |
| Moon | fast, weak, wide field | small corrections |
| Gas giant | slow to charge, strong | big sweeping arcs |
| Kindled star | normal | lighting a star opens routes |
| Black hole | **very fast** (full charge in 0.5 s), huge pull | tap, don't hold: 90°+ snaps |
| **White hole** | **pushes** you away | a second steering verb: borrow from one side to go to the other |
| Cold star (ember) | none until kindled | a destination → KINDLE |
| Spindle star | none | a launcher → SLING |
| Flare storm | none | a hazard zone → SHIELD |
| Rare sight | none | an optional photo → LENS |

---

## 2. Shift's other functions

There's one rule for every special zone: **its ring is drawn in the colour of the mode
it switches Shift to.** If you see a violet ring ahead, you know Shift is about to
become the sling.

### KINDLE (amber): Shift pumps light (Shift doesn't touch the spark)
- **Trigger:** fly into a cold star's corona. The star catches you in an automatic orbit,
  so you can't crash.
- **Hold:** the needle climbs a ring gauge.
- **Release:** inside the **amber band** the star ignites. The white sliver in the middle
  counts as *Perfect*.
- **Misses:** releasing too soft or too hard drains the gauge, and you can try again.
- **Time limit:** after 6.5 s the star sputters alight anyway, so you can never get stuck
  here.
- **Exit:** the star throws you out along its **exit beam**, which you could see all
  along, so every star is a checkpoint.

### SLING (violet): Shift spins you up (the one way to aim anywhere)
- **Trigger:** enter a spindle star's ring. It catches you in a tight orbit.
- **The launch line:** a violet line shows exactly where you'd fly if you let go now,
  and it sweeps around as you orbit.
- **Tap:** launch now, along the line.
- **Hold:** you spin up. The launch gets faster (up to ×2), but the line also sweeps
  faster, which makes it harder to aim. That's the trade-off. Let go to launch.
- **Auto-release:** after 7 s the spindle lets go on its own.

### SHIELD (green): Shift raises a shield (Shift doesn't touch the spark)
- **Trigger:** enter a flare storm. You coast straight through it.
- **Warning:** a distant flare star throws bolts at you. Each one is announced by a red
  line and a **red ring that closes in on the spark**. When the ring meets the dashed
  green circle, the flare hits.
- **Hold:** the shield is up. It drains in about 2 s and recharges while it's lowered,
  so you raise it just in time instead of holding it the whole way.
- **Hits:** a flare that gets through costs light.

### LENS (pink): Shift focuses a camera (Shift doesn't touch the spark)
- **Trigger:** pass close to a rare sight (the Bloom, the Dancers, the Prism). The view
  becomes a **first-person drone camera**, and the spark slows to 42 % speed.
- **Hold:** focus. The whole screen is actually blurred until you hit the focus mark.
- **Release:** the shutter fires. Your score combines **sharpness** and **framing** (the
  camera sways, so wait for the sight to drift into the circle).
- **Rewards:** photos give 1–3 stars and a little light. They're kept in an album on the
  results screen and the sky map, and are an optional extra goal per level.

---

## 3. Mode-switch rules: never overlap, you start each mode

1. **Shift never has two meanings at once.** The game is always in exactly one mode.
2. **Every change of meaning goes through a READY card.**
   - A short hand-over plays first: the catch into an orbit or a straight coast
     (0.6 s), or the ride round a kindled star to its exit lane (up to 1.8 s).
   - Then **time holds** until you tap Shift. Waiting costs nothing: no light drains,
     the clock stops, and nothing can hit you.
   - The card says what Shift does next. The first three times each mode comes up,
     it also shows a small diagram and three steps.
   - A tap is accepted after a 0.6 s safety pause. A tap during that pause is kept
     and starts the mode as soon as the pause ends.
3. **No leaks.**
   - The start tap only starts the mode; it never acts in it.
   - Leaving FLIGHT *vents* any charge (with a visible puff); it never fires it.
   - If Shift is still held when a mode goes live, it's ignored until you release and
     press again ("Release Shift first").
4. **Zones only trigger in FLIGHT.** During locks and inside other modes they can't
   fire, and the level checker confirms no level depends on that.
   - A storm or sight you only graze at the edge doesn't switch modes at all.
5. **Pausing or losing focus cancels instead of firing.**

Each mode is signalled in several ways at once:

| | FLIGHT | KINDLE | SLING | SHIELD | LENS | READY |
|---|---|---|---|---|---|---|
| Colour (HUD, keycap, spark, vignette) | cyan | amber | violet | green | pink | the next mode's colour, darkened edges |
| Keycap label | Borrow gravity | Pump light | Tap = launch · hold = spin up | Raise shield | Focus · let go | Get ready → Tap to start (pulsing) |
| Camera | FPV chase | orbit cinematic | top-down over the orbit | FPV chase | first-person viewfinder | the next mode's camera; the scene holds still |
| Centre of screen | trajectory paths | ring gauge | launch line + orbit | closing warning rings | reticle + focus scale | card with how-to |
| Sound | low saw hum | bright sine | whirr that speeds up | soft chord hum | focus ticks + shutter | 4-note cue (unique per mode) |

### Finding the way
Bodies are listed in route order, so the game always knows the **next stop**: the next
cold star, or a spindle the route swings through. It gets a pulsing **NEXT** marker with
its distance, which becomes an arrow at the screen edge when it's out of view, and rings
ping out from it in the sky. Other cold stars show smaller, dimmer markers only while in
view.

---

## 4. Goal: relight the sky

> The night sky has **10 constellations**. Kindle every star in one and its lines draw
> across the sky. Relight all ten to win ("The sky remembers").

**Pressure without enemies: Light.**

| Light event | Amount |
|---|---|
| Flying (FLIGHT, SLING, SHIELD) | −1.9 per s |
| Holding Shift in flight | −0.9 per s extra |
| Kindle (good / perfect / sputter) | +20 / +32 / +6 |
| Photo | +6 to +20, by quality |
| Flare hit | −10 |
| Crash | −25, then respawn at the last kindled star |
| Lost in the void | −15, then respawn |

Medals depend on light left (★★★ at 60 or more, ★★ at 30 or more). Photos form a separate
album (◉ x/y per constellation).

### Other win conditions considered (not built)
Gravity golf (each release is a stroke, with a par), courier runs, a shepherd towing lost
moons, and a daily seeded sky with ghost replays.

---

## 5. Levels

| # | Constellation | Introduces | Stars |
|---|---|---|---|
| 1 | **The Lantern**, *First Light* | drifting, kindling, first borrow | 4 |
| 2 | **The Heron**, *Long Neck Down* | slow gas giants, diving | 5 |
| 3 | **Twin Wells**, *Two Giants, One Gap* | the target switching between fields | 5 |
| 4 | **Event Horizon**, *Do Not Linger* | black holes | 5 |
| 5 | **The Sleeping Crown**, *Six Stars* | everything so far | 6 |
| 6 | **The Spindle**, *Wind Up, Let Go* | SLING | 4 |
| 7 | **Solar Wind**, *Shields Up* | SHIELD storms, plus a sling | 4 |
| 8 | **Long Exposure**, *Hold Still* | LENS (2 photos) | 5 |
| 9 | **The Mirror**, *Push, Don't Pull* | white holes, plus sling and lens | 5 |
| 10 | **Every Light**, *The Whole Sky* | all five Shift functions in one level | 6 |

Every level is laid out along real flight paths. `npm run check-levels` then searches the
input space with the real physics, using the same mode and lock rules as the game:
- the press moment and hold length in flight
- the release moment and spin for each sling
- straight passes through storms and sights, followed by their locks

It proves every level can be completed and reports how forgiving each step is.

---

## 6. Look, feel and sound

**Luminous, stylised and toon-shaded.** Paths, rings and beams are the brightest things on
screen, because they carry the information. *Super-realistic* would bury that layer.
*ASCII* would lose the depth cues 3D needs.

**Camera:** an FPV-drone chase cam that banks into turns. Its field of view widens with
speed, narrows while you charge and kicks wide on release. Dust streaks give a sense of
speed. Each mode has its own camera (see §3).

**Sound** is fully synthesised. Each mode has its own voice, and its own 4-note cue when
Shift switches to it.

---

## 7. Ideas for later
- **Done:** the sling launcher, the shield, the photo lens and white holes.
- **Tractor (TOW):** Shift latches onto a lost moon and you tow it home. Every borrow
  also tugs the moon behind you.
- **Moving gravity sources:** orbiting moons, binary stars, wandering comets. The preview
  already simulates whatever the physics does.
- **Accessibility:** a "tap to start/stop holding" toggle for players who can't hold a
  key, and an optional slow-motion assist.
- **Golf scoring, a level editor, daily skies, ghost replays.**

## 8. Tech notes
- `src/physics.js`: the pure, deterministic simulation (fixed 120 Hz). It covers gravity,
  zones, the kindle orbit and the sling orbit. The game, the preview and the level
  checker all use it.
- `src/main.js`: the mode state machine and lock rules (§3).
- `src/world.js`: the Three.js scene and the per-mode camera rig.
- `src/hud.js`, `web/`: the DOM HUD, gauge, viewfinder and menus. Menus are one-key too:
  *tap* = next, *hold* = choose.
- `tools/check-levels.mjs`: the solver and verifier. `tools/build.mjs` builds the
  single-file game. `Dockerfile` serves it on :8000.
