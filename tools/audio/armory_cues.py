#!/usr/bin/env python3
"""Render the Armory's identity cues: one short sound for each spell and ultimate, played when its card is pressed.

Each cue is built offline from layered physical models, not one or two oscillators. Struck metal is many damped,
irregular modes with split pairs that beat; fire is turbulent band noise with a granular crackle; ice is a cluster of
tiny glassy pings, a fracture train of micro-clicks and a cold hiss; air is moving-band noise travelling across the
stereo field; rock is grit and a resonant thud. Each one borrows the acoustic family of its gameplay sound
(client/game/sound/soundRecipes.mjs): the Fireball's 300 -> 1400 Hz flame sweep and 3 kHz crackle, the Gale's falling
2.1 kHz -> 240 Hz rush and 4.2 kHz edge, the plate ratios of the game's armour, Sunder's anvil modes and the Vortex's
whoomph. They are related to those sounds, not copies of them.

    /usr/local/bin/python3 tools/audio/armory_cues.py            # render every cue into client/assets/armory/
    /usr/local/bin/python3 tools/audio/armory_cues.py steel      # one or more by id

Deterministic (each cue has its own seed), so a re-render gives the same files. Writes <id>.m4a (AAC) with a small
<id>.wav beside it, and manifest.json (each cue's file, seconds and channels). Needs numpy and macOS afconvert.
"""

import json
import os
import subprocess
import sys
import wave

import numpy as np

SR = 48000
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'client', 'assets', 'armory')

# the game's struck-plate ratios (soundRecipes.mjs PLATE) and Sunder's anvil (ANVIL: ratio, gain, decay)
PLATE = [1, 1.47, 2.09, 2.76, 3.93, 5.4]
ANVIL = [(1, 0.24, 1.6), (2.76, 0.2, 1.3), (5.4, 0.14, 1.0), (8.93, 0.08, 0.7), (13.34, 0.04, 0.45)]


# --- tools --------------------------------------------------------------------------------------------------------------

def frames(seconds):
    return int(round(seconds * SR))


def svf(x, kind, freq, q=0.707):
    """A state-variable filter (topology-preserving), `freq` a number or one value per sample: 'low', 'band', 'high'."""
    n = len(x)
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    g = np.tan(np.pi * np.clip(f, 10, SR * 0.45) / SR)
    k = 1.0 / q
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    out = np.empty(n)
    ic1 = ic2 = 0.0
    pick = {'low': 0, 'band': 1, 'high': 2}[kind]
    for i in range(n):
        v0 = x[i]
        v3 = v0 - ic2
        v1 = a1[i] * ic1 + a2[i] * v3
        v2 = ic2 + a2[i] * ic1 + a3[i] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[i] = v2 if pick == 0 else v1 if pick == 1 else v0 - k * v1 - v2
    return out


def sweep(n, start, end, shape='exp'):
    """A per-sample frequency path from `start` to `end` over n samples (exponential, as a pitch moves)."""
    u = np.linspace(0, 1, n)
    return start * (end / start) ** u if shape == 'exp' else start + (end - start) * u


def env(n, attack, decay, hold=0.0):
    """A strike's envelope: a quick rise over `attack`, a hold, then an exponential fall (to -60 dB over `decay`)."""
    t = np.arange(n) / SR
    rise = np.clip(t / max(attack, 1e-4), 0, 1) ** 0.6
    fall = np.where(t < attack + hold, 1.0, np.exp(-6.9 * (t - attack - hold) / max(decay, 1e-4)))
    return rise * fall


def turbulence(n, rng, rate=18.0, depth=0.5):
    """A flame's flutter: slow random amplitude movement around 1."""
    raw = svf(rng.standard_normal(n), 'low', rate, 0.6)
    raw /= np.max(np.abs(raw)) + 1e-9
    return 1 + depth * raw


def modes(n, partials, rng, attack=0.0006):
    """Struck modes: [(freq, gain, decay seconds)], each a decaying sine with its own phase, a hair of attack."""
    t = np.arange(n) / SR
    out = np.zeros(n)
    for freq, gain, decay in partials:
        if freq >= SR * 0.45:
            continue
        out += gain * np.sin(2 * np.pi * freq * t + rng.uniform(0, 2 * np.pi)) * np.exp(-6.9 * t / decay)
    return out * np.clip(t / attack, 0, 1)


def struck_plate(n, f0, rng, decay=0.2, gain=1.0, extra=4, damp=0.78, roll=0.7):
    """Armour plate struck: the game's plate ratios and a few higher irregular ones, every mode split in two a hair
    apart (the plate is not perfectly even, so it beats), the high modes dying first. A plate on a body, not a bell."""
    ratios = PLATE + [6.71, 8.12, 9.6, 11.3][:extra]
    partials = []
    for i, ratio in enumerate(ratios):
        freq = f0 * ratio * (1 + rng.uniform(-0.03, 0.03))
        g = gain * roll ** i * rng.uniform(0.7, 1.15)
        d = decay * damp ** i * rng.uniform(0.85, 1.15)
        partials += [(freq, g * 0.6, d), (freq * (1 + rng.uniform(0.003, 0.009)), g * 0.4, d * 0.9)]
    return modes(n, partials, rng)


def grain(rng, seconds, freq, q):
    """One short grain of filtered noise (a crackle, a pebble, a ring of mail)."""
    n = max(8, frames(seconds))
    burst = rng.standard_normal(n) * np.exp(-np.linspace(0, 6, n))
    return svf(burst, 'band', freq, q)


def place(out, sound, at, gain=1.0, pan=None):
    """Mix `sound` into `out` at `at` seconds (stereo `out` takes a pan: -1 left .. 1 right, or one value a sample)."""
    i = frames(at)
    if i >= out.shape[-1]:
        return
    s = sound[: out.shape[-1] - i] * gain
    if out.ndim == 1:
        out[i:i + len(s)] += s
    else:
        p = np.broadcast_to(np.asarray(0.0 if pan is None else pan, dtype=float), (len(sound),))[: len(s)]
        angle = (p + 1) * np.pi / 4
        out[0, i:i + len(s)] += s * np.cos(angle)
        out[1, i:i + len(s)] += s * np.sin(angle)


def room(x, rng, wet=0.1, seconds=0.32):
    """A little of the Armory's stone around it: a short, darkened, decaying room (applied per channel)."""
    n = frames(seconds)
    ir = rng.standard_normal(n) * np.exp(-6.9 * np.arange(n) / n)
    ir = svf(ir, 'low', 4200, 0.6)
    ir[: frames(0.006)] = 0
    ir /= np.sqrt(np.sum(ir ** 2))
    def one(c):
        size = len(c) + n
        tail = np.fft.irfft(np.fft.rfft(c, size) * np.fft.rfft(ir, size), size)[: len(c)]
        return c + wet * tail
    return one(x) if x.ndim == 1 else np.stack([one(c) for c in x])


def finish(x, low_cut=60, loud_db=-22.0, peak_db=-1.0):
    """High-pass the rumble away, fade the ends (no clicks), and set the level: the loudest 200 ms at `loud_db` (so
    the cues sit at one level beside each other), never peaking above `peak_db`."""
    channels = x if x.ndim > 1 else x[None]
    shaped = []
    for c in channels:
        c = svf(svf(c, 'high', low_cut, 0.707), 'high', low_cut, 0.707)
        fade = np.ones(len(c))
        fade[: frames(0.001)] = np.linspace(0, 1, frames(0.001))
        tail = frames(0.03)
        fade[-tail:] = np.linspace(1, 0, tail) ** 2
        shaped.append(c * fade)
    out = np.stack(shaped)
    mono = out.mean(0)
    k, hop = frames(0.2), frames(0.01)
    loudest = max(np.sqrt(np.mean(mono[i:i + k] ** 2)) for i in range(0, max(1, len(mono) - k), hop))
    out *= 10 ** (loud_db / 20) / (loudest + 1e-12)
    peak = np.max(np.abs(out))
    if peak > 10 ** (peak_db / 20):
        out *= 10 ** (peak_db / 20) / peak
    return out if x.ndim > 1 else out[0]


# --- the cues -------------------------------------------------------------------------------------------------------

def fireball(rng):
    """Dry ignition (a flick and a bright puff), a brief flame bloom (the Fireball's 300 -> 1400 Hz sweep, turbulent),
    and a tiny tail of embers (its 3 kHz crackle) thinning out. Warm and quick; nothing below the flame's own body."""
    n = frames(0.62)
    out = np.zeros(n)
    place(out, svf(rng.standard_normal(frames(0.003)), 'high', 3500, 0.7), 0.0, 0.5)
    m = frames(0.06)
    place(out, svf(rng.standard_normal(m), 'band', sweep(m, 1800, 3400), 1.2) * env(m, 0.002, 0.05), 0.002, 0.38)
    m = frames(0.42)
    bloom = svf(rng.standard_normal(m), 'band', sweep(m, 300, 1400), 1.1) * env(m, 0.035, 0.3, 0.02) * turbulence(m, rng, 22, 0.55)
    body = svf(rng.standard_normal(m), 'band', sweep(m, 650, 900), 0.7) * env(m, 0.03, 0.22) * turbulence(m, rng, 14, 0.4)
    place(out, bloom, 0.012, 1.0)
    place(out, body, 0.012, 0.75)
    m = frames(0.16)
    place(out, svf(rng.standard_normal(m), 'low', sweep(m, 700, 260), 0.8) * env(m, 0.012, 0.12), 0.01, 0.45)
    m = frames(0.28)
    place(out, svf(rng.standard_normal(m), 'high', 4000, 0.6) * env(m, 0.03, 0.22), 0.01, 0.08)
    for i in range(13):
        at = 0.09 + (i / 13) ** 1.3 * 0.46 + rng.uniform(0, 0.025)
        place(out, grain(rng, rng.uniform(0.0015, 0.004), 3000 * rng.uniform(0.7, 1.6), rng.uniform(3, 6)), at, 0.3 * (1 - i / 15) * rng.uniform(0.6, 1))
    return finish(room(out, rng, 0.08), low_cut=120)


def frostfire(rng):
    """Brittle crystalline onset (a cluster of tiny glassy pings, thickening), an icy crack as the arm snaps out (a hard
    snap and a fracture running through it), then a short cold hiss with a glassy sheen. Hard and high, with no warmth
    in it at all."""
    n = frames(0.62)
    out = np.zeros(n)
    # (the frost forming in the palm as the arm draws back: the pings thicken toward the crack)
    for _ in range(24):
        f = rng.uniform(1800, 6500)
        ping = modes(frames(0.1), [(f, 1, rng.uniform(0.01, 0.06)), (f * rng.uniform(1.37, 1.62), 0.5, rng.uniform(0.008, 0.035))], rng)
        place(out, ping, 0.11 * rng.uniform(0, 1) ** 0.6, rng.uniform(0.08, 0.2))
    crack = 0.11
    place(out, svf(rng.standard_normal(frames(0.003)), 'band', 3500, 0.5), crack, 1.4)
    gap, at = 0.006, crack + 0.003
    for i in range(13):
        place(out, svf(rng.standard_normal(frames(0.0006)), 'band', 2500, 0.8), at, 0.9 * 0.88 ** i)
        at += gap
        gap = max(0.0014, gap * 0.82)
    place(out, modes(frames(0.08), [(f, 0.2, rng.uniform(0.015, 0.04)) for f in rng.uniform(900, 1900, 5)], rng), crack + 0.001, 1.2)
    m = frames(0.5)
    hiss = svf(svf(rng.standard_normal(m), 'high', 3800, 0.7), 'low', 9500, 0.7) * env(m, 0.03, 0.38, 0.04)
    delay = int(SR / 3100)
    hiss[delay:] += 0.6 * hiss[:-delay]
    place(out, hiss, crack + 0.008, 0.3)
    place(out, svf(rng.standard_normal(m), 'band', 6200, 2.2) * env(m, 0.05, 0.22), crack + 0.018, 0.1)
    m = frames(0.04)
    place(out, svf(rng.standard_normal(m), 'low', 260, 0.8) * env(m, 0.001, 0.03), crack, 0.35)
    return finish(room(out, rng, 0.1), low_cut=180)


def gale(rng):
    """A soft intake of air (the Gale's rising 380 -> 950 Hz breath), then a clean outward whoosh travelling across the
    field: the Gale's falling 2.1 kHz -> 240 Hz rush, its 4.2 kHz edge, and the air left tumbling. Light and broad;
    nothing below the air itself."""
    n = frames(0.66)
    out = np.zeros((2, n))
    m = frames(0.22)
    swell = np.linspace(0, 1, m) ** 2.2
    intake = svf(rng.standard_normal(m), 'band', sweep(m, 380, 950), 0.9) * swell
    place(out, intake, 0.0, 0.5, pan=-0.35)
    place(out, svf(rng.standard_normal(m), 'high', 3000, 0.7) * swell, 0.0, 0.015, pan=-0.35)
    m = frames(0.44)
    shape = env(m, 0.025, 0.38, 0.02)
    centre = sweep(m, 2100, 260)
    rush = svf(rng.standard_normal(m), 'band', centre, 0.8) * shape
    edge = svf(rng.standard_normal(m), 'band', centre * 1.45, 2.0) * shape
    travel = np.linspace(-0.55, 0.75, m)
    place(out, rush, 0.19, 1.0, pan=travel)
    place(out, edge, 0.19, 0.35, pan=travel)
    k = frames(0.1)
    place(out, svf(rng.standard_normal(k), 'high', 4200, 0.7) * env(k, 0.003, 0.09), 0.19, 0.16, pan=travel[:k])
    k = frames(0.34)
    tumble = svf(rng.standard_normal(k), 'band', sweep(k, 700, 380), 1.1) * env(k, 0.05, 0.28) * turbulence(k, rng, 9, 0.5)
    place(out, tumble, 0.3, 0.25, pan=0.6)
    return finish(room(out, rng, 0.1), low_cut=180)


def steel(rng):
    """Plate hardening: two contacts. The first, the plates clamping (a hard metallic snap, the armour's own irregular
    plate modes, a shake of mail), the second a beat later and heavier (lower plate, the harness taking the weight).
    Damped and physical: no chime, no long ring, nothing coin-, bell- or sparkle-like."""
    n = frames(0.6)
    out = np.zeros(n)
    place(out, svf(rng.standard_normal(frames(0.0015)), 'band', 3000, 0.6), 0.0, 0.45)
    # (the game's Steel call: a CHINK near 1.85 kHz over a KLANG near 520 Hz, here as the plates themselves)
    place(out, struck_plate(frames(0.4), 1450, rng, decay=0.16, gain=0.36, extra=2, damp=0.8, roll=0.8), 0.0005)
    for _ in range(11):
        f = rng.uniform(2800, 6800)
        place(out, modes(frames(0.05), [(f, 1, rng.uniform(0.012, 0.035)), (f * 1.41, 0.5, 0.015)], rng), rng.uniform(0.004, 0.075), rng.uniform(0.02, 0.05))
    m = frames(0.05)
    place(out, svf(rng.standard_normal(m), 'band', 900, 1.2) * env(m, 0.002, 0.04), 0.0, 0.3)
    second = 0.088
    place(out, svf(rng.standard_normal(frames(0.002)), 'band', 2200, 0.6), second, 0.5)
    place(out, struck_plate(frames(0.5), 500, rng, decay=0.3, gain=0.42, extra=4, damp=0.8, roll=0.86), second + 0.0005)
    m = frames(0.12)
    thump = svf(rng.standard_normal(m), 'low', 300, 0.8) * env(m, 0.002, 0.07)
    knock = svf(rng.standard_normal(m), 'band', 150, 2.0) * env(m, 0.002, 0.09)
    place(out, thump, second, 0.5)
    place(out, knock, second, 0.6)
    return finish(room(out, rng, 0.12), low_cut=70)


def sunder(rng):
    """Weight first, ring second: a small shift of rock as the sword goes up (grit giving way), the heavy downward blow
    as it comes down at 0.42 s (a crack and a deep resonant thud, rubble falling after), then a short ring of iron on
    the anvil's own modes, quieter than the blow. No boom, no explosion."""
    n = frames(0.9)
    out = np.zeros(n)
    hit = 0.42
    # (the ground shifting under him as the sword goes up: grit loosening, a little more of it as the blow comes)
    for i in range(18):
        at = hit * (0.08 + 0.88 * (i / 18) ** 0.8) + rng.uniform(-0.01, 0.01)
        place(out, grain(rng, rng.uniform(0.002, 0.008), rng.uniform(700, 2600), rng.uniform(2, 4)), at, rng.uniform(0.12, 0.3) * (0.5 + 0.5 * i / 18))
    m = frames(0.3)
    place(out, svf(rng.standard_normal(m), 'band', 420, 1.4) * np.linspace(0, 1, m) ** 2, hit - 0.3, 0.18)
    place(out, svf(rng.standard_normal(frames(0.0012)), 'high', 2200, 0.7), hit, 0.55)
    m = frames(0.36)
    thud = svf(rng.standard_normal(m), 'low', sweep(m, 230, 55), 1.6) * env(m, 0.002, 0.26)
    place(out, thud, hit, 2.2)
    m = frames(0.2)
    place(out, svf(rng.standard_normal(m), 'low', 380, 0.7) * env(m, 0.002, 0.15), hit, 0.8)
    place(out, svf(rng.standard_normal(m), 'band', sweep(m, 850, 300), 1.3) * env(m, 0.002, 0.13), hit + 0.004, 0.5)
    for i in range(10):
        at = hit + 0.04 + (i / 10) ** 1.4 * 0.38 + rng.uniform(0, 0.02)
        place(out, grain(rng, rng.uniform(0.003, 0.01), rng.uniform(500, 2400), rng.uniform(2, 4)), at, 0.3 * (1 - i / 14))
    ring_at = hit + 0.035
    base = 285 * rng.uniform(0.98, 1.02)
    partials = [(base * r * rng.uniform(0.995, 1.005), g, d * 0.32) for r, g, d in ANVIL]
    partials += [(2150 * rng.uniform(0.98, 1.02), 0.1, 0.42), (3380 * rng.uniform(0.98, 1.02), 0.05, 0.3)]
    place(out, modes(frames(0.45), partials, rng, attack=0.004), ring_at, 0.55)
    return finish(room(out, rng, 0.12), low_cut=40)


def vortex(rng):
    """The fire catching (the Fireball's flame and the Vortex's whoomph, shorter), the burning blade passing round
    through the air twice (a rising-and-falling rush crossing the field, its edge whistling faintly), and a brief spit
    of hot metal and sparks. A compact flourish, not a tornado."""
    n = frames(0.76)
    out = np.zeros((2, n))
    m = frames(0.26)
    bloom = svf(rng.standard_normal(m), 'band', sweep(m, 300, 1400), 1.1) * env(m, 0.02, 0.2) * turbulence(m, rng, 22, 0.5)
    place(out, bloom, 0.0, 0.8, pan=0.1)
    place(out, svf(rng.standard_normal(m), 'low', sweep(m, 900, 220), 0.6) * env(m, 0.015, 0.2), 0.0, 0.5, pan=0.1)
    def blade_pass(at, length, pan_from, pan_to, gain):
        k = frames(length)
        u = np.linspace(0, 1, k)
        centre = 600 * (4.3 ** np.sin(np.pi * u)) * np.where(u > 0.5, 0.75 + 0.25 * (1 - u) * 2, 1)
        shape = np.sin(np.pi * u) ** 1.6
        rush = svf(rng.standard_normal(k), 'band', centre, 1.4) * shape
        whistle = svf(rng.standard_normal(k), 'band', centre * 2.1, 7.0) * shape
        place(out, rush, at, gain, pan=np.linspace(pan_from, pan_to, k))
        place(out, whistle, at, gain * 0.35, pan=np.linspace(pan_from, pan_to, k))
    blade_pass(0.14, 0.15, -0.7, 0.7, 0.9)
    blade_pass(0.34, 0.15, 0.7, -0.6, 0.62)
    for _ in range(8):
        place(out, grain(rng, rng.uniform(0.0006, 0.002), rng.uniform(4000, 8500), 3), rng.uniform(0.24, 0.46), rng.uniform(0.25, 0.5), pan=rng.uniform(-0.5, 0.5))
    place(out, modes(frames(0.08), [(3100, 0.5, 0.04), (4620, 0.3, 0.03), (6950, 0.15, 0.02)], rng), 0.26, 0.12, pan=0.2)
    k = frames(0.16)
    place(out, svf(rng.standard_normal(k), 'high', 5000, 0.7) * env(k, 0.005, 0.12), 0.25, 0.1, pan=0.0)
    for i in range(5):
        place(out, grain(rng, 0.002, 3000 * rng.uniform(0.8, 1.4), 4), 0.46 + i * 0.05 + rng.uniform(0, 0.02), 0.25 * (1 - i / 6), pan=rng.uniform(-0.3, 0.3))
    return finish(room(out, rng, 0.1), low_cut=110)


def chivalry(rng):
    """Spells & Chivalry: the blade drawn (steel hissing along the scabbard's throat, quicker as it comes: the game's
    unsheathe), a short clear note as it clears, then the guard set (a small plate clack and the arm braced behind
    it), with the gauntlet's breath under it. Steel and guard first; the sorcery only a breath."""
    n = frames(0.72)
    out = np.zeros(n)
    m = frames(0.3)
    u = np.linspace(0, 1, m)
    scrape = svf(rng.standard_normal(m), 'band', sweep(m, 1900, 4300), 3.0) * (0.2 + 0.8 * u ** 1.8)
    grit = 1 + 0.6 * svf(rng.standard_normal(m), 'low', 300, 0.7) / 0.05
    place(out, scrape * np.clip(grit, 0, 3), 0.0, 0.3)
    place(out, modes(m, [(1480, 0.1, 0.4), (1480 * 2.09, 0.05, 0.3)], rng, attack=0.2), 0.0, 0.25)
    clear = 0.3
    place(out, svf(rng.standard_normal(frames(0.002)), 'band', 3200, 0.6), clear, 0.25)
    place(out, modes(frames(0.4), [(1480, 0.4, 0.26), (1480 * 2.09, 0.2, 0.18), (1480 * 3.31, 0.1, 0.11), (1480 * 1.004, 0.25, 0.24)], rng), clear, 0.45)
    guard = 0.4
    place(out, svf(rng.standard_normal(frames(0.0015)), 'band', 2400, 0.6), guard, 0.4)
    place(out, struck_plate(frames(0.3), 640, rng, decay=0.11, gain=0.3, extra=2), guard)
    m = frames(0.1)
    place(out, svf(rng.standard_normal(m), 'band', 170, 2.0) * env(m, 0.002, 0.07), guard, 0.8)
    m = frames(0.3)
    place(out, svf(rng.standard_normal(m), 'band', 900, 4.0) * env(m, 0.08, 0.2) * turbulence(m, rng, 6, 0.3), guard, 0.08)
    return finish(room(out, rng, 0.12), low_cut=80)


CUES = {
    'fireball': (fireball, 11),
    'frostfire': (frostfire, 12),
    'gale': (gale, 13),
    'steel': (steel, 14),
    'sunder': (sunder, 15),
    'vortex': (vortex, 16),
    'chivalry': (chivalry, 17),
}


def write_wav(path, x):
    data = np.clip(x, -1, 1)
    channels = 1 if data.ndim == 1 else data.shape[0]
    pcm = (data.T if channels > 1 else data) * 32767
    with wave.open(path, 'wb') as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.astype('<i2').tobytes())


def main(ids):
    os.makedirs(OUT, exist_ok=True)
    manifest_path = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {'cues': {}}
    for cue_id in ids:
        build, seed = CUES[cue_id]
        x = build(np.random.default_rng(seed))
        wav_path = os.path.join(OUT, f'{cue_id}.wav')
        write_wav(wav_path, x)
        bitrate = '128000' if x.ndim > 1 else '96000'
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', bitrate, wav_path, os.path.join(OUT, f'{cue_id}.m4a')], check=True, capture_output=True)
        manifest['cues'][cue_id] = {'file': cue_id, 'seconds': round(x.shape[-1] / SR, 3), 'channels': 1 if x.ndim == 1 else 2}
        print(f'{cue_id}: {x.shape[-1] / SR:.2f} s, {"stereo" if x.ndim > 1 else "mono"}')
    manifest['cues'] = {k: manifest['cues'][k] for k in CUES if k in manifest['cues']}
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')


if __name__ == '__main__':
    wanted = sys.argv[1:] or list(CUES)
    unknown = [w for w in wanted if w not in CUES]
    if unknown:
        sys.exit(f'unknown cue: {", ".join(unknown)} (known: {", ".join(CUES)})')
    main(wanted)
