# Borrowed Gravity

A 3D space game you play with **one key: Shift**.

You are a spark drifting through a dark sky. You can't steer. Hold **Shift** near a planet
to borrow its gravity, and let go to be pulled. A live path shows where you'll go if you
let go *now*. Fly into cold stars to kindle them (there, Shift pumps light instead) and
relight five constellations.

See **[GAME_DESIGN.md](GAME_DESIGN.md)** for the full design: mechanics, mode-switch rules,
the win condition and the alternatives I considered.

## Play

```bash
npm install
npm run build          # → dist/borrowed-gravity.html  (single file, double-click to play)
```

or, while developing:

```bash
npm run dev            # http://localhost:8000  (rebuilds on reload)
```

## Controls

| Situation | Shift does |
|---|---|
| **Flight** (cyan) | hold = borrow gravity from the body whose dashed ring you're inside · release = get pulled |
| **Kindle** (amber) | hold = pump light into the star · release inside the amber band = ignite |
| **Locked** (grey banner + countdown) | nothing. Every switch between functions goes through this 1.7–3 s gap |
| Menus | tap = next · hold = choose |

- **Esc / P** pauses. These are system keys, not game controls.
- On touch screens, a press anywhere acts as Shift.
- **Sound:** browsers only allow audio after a click, and a Shift press alone doesn't
  count. Click the small ♪ pill once (bottom right) to turn sound on.
- On Windows, pressing Shift 5 times opens the *Sticky Keys* prompt. Turn that shortcut
  off under *Settings → Accessibility → Keyboard* before playing.

## Reading the screen

- **Bright dashed path**: where you go if you let go now. A **red end** means impact; an
  **amber ring** means you'll reach a cold star.
- **Faint path**: where you go if you keep holding until the charge is full.
- **Dashed cyan ring**: a body's gravity field. You can only borrow inside it.
- **Amber chevron beam on a cold star**: the direction the star throws you after kindling.
- **Light bar**: drains as you fly. Kindling refills it. Crashing or getting lost costs light.
