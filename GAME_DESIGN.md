# Borrowed Gravity: game design

**A one-key game. The only control is Shift.**

You are a stray spark, a tiny comet drifting through a sky whose stars have gone cold.
You can't steer, thrust or brake. The only thing you can do is **borrow gravity**: hold
Shift near a world to load up its pull, then let go to spend it. You use that to fly from
cold star to cold star and relight them, one constellation at a time.

---

## 1. Core mechanic: FLIGHT mode (Shift = borrow gravity)

| Input | What happens |
|---|---|
| **No Shift** | No gravity at all. The spark drifts in a straight line at cruise speed. |
| **Hold Shift** inside a body's field (dashed cyan ring) | Charge rises from 0 to 100 % in about 1.25 s. Gravity motes stream from the body to you, a tether links you, and the field ring ripples inward. |
| **Release Shift** | The charge turns into a 0.9 s gravity pulse toward that body. The closer you are, the harder it pulls (slingshot). |

You don't choose a direction. **Where you are when you let go is the direction.**
- If you release while the planet is still *ahead*, you dive toward it (you might crash).
- If you release while it's *beside* you, you curve hard around it.
- If you release once it's *behind* you, you get pulled back and slowed.

So one key gives you two controls. *When* you let go sets the direction, and *how long*
you held sets the strength. Because you can choose when to start holding, both can be
aimed.

### The trajectory preview
While you hold Shift, a **bright animated path** shows exactly where you would go if
you let go right now. As you pass the body, that path swings around: this is the
"direction changes while passing by" effect. A **faint path** shows the result of
"keep holding until full, then let go".
- If the path ends in **red**, it hits something. Let go at another moment.
- If it ends in an **amber ring**, it reaches a cold star.

The preview runs the **same physics code** as the game, with the same fixed timestep, so
it never lies. The offline level checker uses that code too (see §8).

### Body types
| Body | Lends gravity | Feel |
|---|---|---|
| Rock / ice planet | normal rate | the bread-and-butter turn |
| Moon | fast, weak, wide field | small corrections |
| Gas giant | slow to charge, strong, ringed | big sweeping arcs, needs planning |
| Kindled star | normal; slightly larger burn radius | lighting a star opens new routes |
| Black hole | **very fast** (full in 0.5 s), huge pull, big lethal radius | tap, don't hold; 90°+ snaps |
| Cold star (ember) | **none** until kindled | a destination, not a tool |

---

## 2. Second function: KINDLE mode (Shift = pump light)

When the spark enters a cold star's **amber corona ring**, the star catches you in an
automatic orbit. You can't crash and you can't steer. Shift now does something
completely different, and it doesn't touch your body at all:

- **Hold** to pump light into the star. A needle climbs a ring gauge.
- **Release** while the needle is in the **amber band** and the star ignites. The thin
  white sliver in the middle of the band counts as *Perfect*.
- If you release too early or too late the gauge drains and you try again. Pushing past
  112 % overloads it.
- The star stays receptive for 6.5 s. If time runs out it *sputters alight* anyway, with
  no light reward. **A failed mini-game can never block a level.**

Then the star **throws you out along its exit beam**, the chevron beam you could see on
it the whole time. That makes every star both a checkpoint and a launch ramp. However
you arrive, you leave the same way, so mistakes don't compound from star to star.
(I added this after the level checker showed that "exit on your entry heading" made
small aiming errors soft-lock later legs.)

Later stars get narrower bands, faster needles and bands that wobble.

---

## 3. Mode-switch rules: never overlap, always a gap

These are the rules that keep the two functions of Shift from ever mixing:

1. **Shift never has two meanings at once.** The game is always in exactly one of
   FLIGHT, KINDLE or LOCK.
2. **Every change of meaning goes through LOCK.** That's 1.7 s going into kindle, and
   1.7–3.0 s coming out (it stretches while the star finishes throwing you). During LOCK,
   Shift does nothing. Pressing it shakes the keycap and plays a dull "locked" click,
   so the lock is obvious and harmless.
3. **No leaks between modes.** Leaving FLIGHT *vents* any charge with a visible puff and
   a hiss. It never fires it. If Shift is still held when a mode goes live, it's ignored
   until you release it and press again, and the keycap says *"Release Shift first"*.
4. **Triggers only fire in FLIGHT.** A corona can't start a kindle during a lock, and
   the levels keep stars far enough apart.
5. **Pausing or losing focus cancels a charge instead of firing it.** Resuming flight
   goes through a short lock again.

Each mode is signalled in six ways at once, so you can't miss a switch:

| Signal | FLIGHT | LOCK (gap) | KINDLE |
|---|---|---|---|
| Colour (HUD, keycap, spark, vignette) | cyan | grey, blinking dot | amber |
| Banner | — | big "FLIGHT"/"KINDLE" + countdown bar | — |
| Keycap label | *Borrow gravity* | *Locked* (dashed outline) | *Pump light* |
| Sound | low saw hum while charging | rising or falling 4-note cue, ticks | bright sine with vibrato |
| Camera | FPV chase cam behind the spark | blends between them | cinematic orbit view of the star |
| Centre of screen | trajectory paths | — | ring gauge |

---

## 4. Goal: relight the sky (and other options)

I agree that "get as far as possible" gets boring, so I chose a **finite, collectable
goal**:

> The night sky has **5 constellations**, each with 4–6 cold stars. Kindle every star in
> a constellation and its lines draw themselves across the sky. Relight all five and you
> win ("The sky remembers").

**Pressure without enemies: your Light.** Your spark is fading.

| Light event | Amount |
|---|---|
| Drifting in flight | −1.9 per s |
| Holding Shift (borrowing costs) | −0.9 per s extra |
| Kindle (good / perfect / sputter) | +20 / +32 / +6 |
| Crash | −25, then respawn at the last kindled star |
| Lost in the void (6.5 s away from every gravity field) | −15, then respawn |
| Light reaches 0 | constellation failed, try again |

Medals depend on the light left at the end: ★★★ at 60 or more, ★★ at 30 or more.
Time and perfect kindles are tracked for players who want to replay.

### Other win conditions I considered (all work with the same core)
1. **Gravity golf.** Every release is a stroke and each course has a par. This one is
   very readable and mixes well with the medals.
2. **Courier.** Carry a seed of light from a living star to a dead planet before it
   dims. Routes branch, and you choose between a safe long way and a risky slingshot.
3. **Photographer probe.** This leans into the FPV-drone idea. Fly-bys of rare
   phenomena switch Shift into a *camera* mode (hold to focus or zoom, release for the
   shutter), under the same lock rules. The score is the quality of the shot.
4. **Shepherd.** Gather lost moons and tow them home. Every borrow also tugs the moon
   behind you.
5. **Daily sky.** A seeded random constellation each day, with ghost replays of friends.

Of these, golf and the photographer would be my next additions (see §7).

---

## 5. Levels

| # | Constellation | Teaches | Stars |
|---|---|---|---|
| 1 | **The Lantern**, *First Light* | drifting, kindling, first borrow, vertical turns | 4 |
| 2 | **The Heron**, *Long Neck Down* | slow gas giants, diving downward | 5 |
| 3 | **Twin Wells**, *Two Giants, One Gap* | the target switching between two fields | 5 |
| 4 | **Event Horizon**, *Do Not Linger* | black holes: tap, don't hold | 5 |
| 5 | **The Sleeping Crown**, *Six Stars* | everything, including two borrows in one leg | 6 |

I built each level along real flight paths: I simulated an intended input and placed the
star where the spark actually goes. `npm run check-levels` then searches the input space
with the real physics (when to press × how long to hold, per leg) and proves that every
level can be completed. It also reports how forgiving each leg is.

---

## 6. Look, feel and sound

**Art direction: luminous, stylised, toon-shaded.** This game lives on its information
layer: paths, fields, rings and beams. That layer has to be crisp:
- *Super-realistic* would bury it, and it's heavy in a browser.
- *ASCII* reads well in 2D but loses the depth cues that 3D navigation needs.
- *Stylised* means toon-shaded planets with bright rims, additive glowing lines and
  bloom, on a deep starfield with soft nebulae. The paths and rings are the brightest
  things on screen.

**Camera: an FPV-drone chase cam.** It banks into turns, widens the field of view with
speed, narrows it slightly while charging (a held breath) and kicks it wide on release.
Dust streaks around the camera give a sense of speed in empty space. A cinematic orbit
camera takes over during KINDLE.

**Sound** is fully synthesised (no assets), with a soft ambient drone. Every mode has
its own timbre, and the switch cues rise (into kindle) or fall (back to flight).

---

## 7. Ideas for later
- **More Shift functions, all under the same lock rules:** a photo shutter, a tractor
  beam (tow a moon), a shield (Shift holds it up during solar-flare storms), and an
  orbit launcher (hold to spin up in orbit, release to launch on the tangent).
- **Moving gravity sources:** orbiting moons, binary stars, wandering comets. The
  preview already simulates whatever the physics does, so it would still be exact.
- **Repulsors** ("white holes") that push instead of pull, giving players a second
  steering verb.
- **Accessibility:** a "tap to start/stop charging" toggle for players who can't hold a
  key, and an optional slow-motion assist while charging.
- **Golf scoring, a level editor, daily seeds and ghost replays.**

## 8. Tech notes
- `src/physics.js` is pure and deterministic, with a fixed 120 Hz step. The game, the
  preview and the level checker all use it.
- `src/main.js` holds the mode state machine and the lock rules (§3).
- `src/world.js` contains the Three.js scene: toon planets, ember shader, black-hole
  disk, ribbons, particles and the camera rig.
- `src/hud.js`, `web/index.html` and `web/style.css` are the DOM HUD, gauge and menus.
  Menus are one-key too: *tap* = next, *hold* = choose.
- `tools/check-levels.mjs` is the solver and verifier. `tools/build.mjs` builds a single
  self-contained HTML file.
