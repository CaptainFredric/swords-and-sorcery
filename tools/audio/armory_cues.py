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


def finish(x, low_cut=60, loud_db=-16.0, peak_db=-1.0):
    """High-pass the rumble away, fade the ends (no clicks), and set the level: the loudest 200 ms at `loud_db` (so
    the cues sit at one level beside each other, clearly over the menu music), never peaking above `peak_db` (a soft
    knee takes the sharpest transients down rather than the whole cue)."""
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
    ceiling = 10 ** (peak_db / 20)
    knee = ceiling * 0.7
    over = np.abs(out) > knee
    out[over] = np.sign(out[over]) * (knee + (ceiling - knee) * np.tanh((np.abs(out[over]) - knee) / (ceiling - knee)))
    return out if x.ndim > 1 else out[0]


def pop(rng, freq, decay=0.012, gain=1.0):
    """One crisp crackle: a click and the tiny ring of what burst (a few close modes)."""
    n = frames(decay * 4 + 0.004)
    click = np.zeros(n)
    click[0], click[1] = 1.0, -0.6
    ring = modes(n, [(freq * r, g, decay * d) for r, g, d in ((1, 1, 1), (1.31, 0.6, 0.7), (1.83, 0.35, 0.5))], rng, attack=0.0002)
    return gain * (0.5 * svf(click, 'high', 1200, 0.7) + 0.8 * ring)


def flame(n, rng, centre, q=0.9, rate=35.0, depth=0.7):
    """Fire: noise through a moving band, its level fluttering fast and unevenly (the flame tearing at the air)."""
    return svf(rng.standard_normal(n), 'band', centre, q) * turbulence(n, rng, rate, depth)


def impact(rng, low=1000, high=6000, seconds=0.0018):
    """The instant two hard things meet: a burst of band-limited noise a millimetre long."""
    return svf(svf(rng.standard_normal(frames(seconds)), 'high', low, 0.7), 'low', high, 0.7)


def dense_plate(n, f0, rng, count=14, decay=0.2, gain=1.0, roll=0.9, split=0.012):
    """Armour plate, struck hard: many irregular modes (the game's plate ratios, and more between them), each split
    into a beating pair, the high ones dying first. Dense and short: a breastplate, not a bell."""
    ratios = [1, 1.47, 2.09, 2.76, 3.29, 3.93, 4.6, 5.4, 6.2, 6.71, 7.5, 8.12, 9.1, 9.6, 10.4, 11.3][:count]
    partials = []
    for i, ratio in enumerate(ratios):
        freq = f0 * ratio * (1 + rng.uniform(-0.04, 0.04))
        g = gain * roll ** i * rng.uniform(0.6, 1.2)
        d = decay * (0.9 ** i) * rng.uniform(0.7, 1.2)
        partials += [(freq, g * 0.55, d), (freq * (1 + rng.uniform(split * 0.3, split)), g * 0.45, d * 0.85)]
    return modes(n, partials, rng, attack=0.0003)


# --- the cues -------------------------------------------------------------------------------------------------------

def fireball(rng):
    """ignite -> flare -> ember. A dry `fwhk` (a flick of noise rising fast), the flame flaring up and tearing at the
    air (the Fireball's own 300 -> 1400 Hz flame, here quicker and brighter, its level fluttering), and a few crisp
    embers popping as it settles. Warm, quick, no boom."""
    n = frames(0.62)
    out = np.zeros(n)
    m = frames(0.05)
    place(out, impact(rng, 1500, 9000, 0.0012), 0.0, 0.7)
    place(out, svf(rng.standard_normal(m), 'band', sweep(m, 900, 4200), 1.0) * env(m, 0.002, 0.04), 0.0, 0.9)
    m = frames(0.36)
    u = np.linspace(0, 1, m)
    centre = 380 * (3.4 ** np.sin(np.pi * np.minimum(1, u * 1.6))) + 220
    place(out, flame(m, rng, centre, 0.8, 38, 0.75) * env(m, 0.025, 0.3, 0.03), 0.012, 1.25)
    place(out, flame(m, rng, sweep(m, 420, 760), 0.9, 30, 0.6) * env(m, 0.03, 0.24), 0.015, 0.7)
    place(out, flame(m, rng, sweep(m, 300, 1400), 1.1, 22, 0.5) * env(m, 0.03, 0.26), 0.012, 0.8)
    m = frames(0.16)
    place(out, svf(rng.standard_normal(m), 'low', sweep(m, 900, 300), 0.8) * env(m, 0.015, 0.12), 0.01, 0.6)
    for i in range(11):
        at = 0.16 + (i / 11) ** 1.2 * 0.4 + rng.uniform(0, 0.02)
        place(out, pop(rng, rng.uniform(1500, 4200), rng.uniform(0.006, 0.016)), at, 0.45 * (1 - i / 14) * rng.uniform(0.6, 1))
    return finish(room(out, rng, 0.08), low_cut=140)


def frostfire(rng):
    """tick ... crack -> fracture -> cold breath. A crystalline tick as the cold forms in the palm, then the hard crack
    as the arm snaps out (a snap with a glassy ring), the ice fracturing through it in irregular brittle clicks, and a
    short cold hiss sublimating away. Hard, irregular, high: nothing like the Fireball's flame."""
    n = frames(0.58)
    out = np.zeros(n)
    tick = modes(frames(0.05), [(rng.uniform(3800, 5200), 1, 0.012), (rng.uniform(6200, 7400), 0.6, 0.008)], rng, attack=0.0002)
    place(out, tick, 0.0, 0.3)
    place(out, impact(rng, 2500, 9000, 0.001), 0.0, 0.25)
    crack = 0.1
    place(out, impact(rng, 1500, 10000, 0.0025), crack, 2.2)
    glass = modes(frames(0.12), [(f, g, d) for f, g, d in zip(rng.uniform(2400, 7600, 6), (1, .8, .7, .5, .4, .3), (0.04, 0.03, 0.025, 0.02, 0.015, 0.012))], rng, attack=0.0002)
    place(out, glass, crack, 0.55)
    place(out, modes(frames(0.06), [(f, 0.2, 0.02) for f in rng.uniform(800, 1600, 4)], rng), crack, 1.0)
    at, gap = crack + 0.004, 0.003
    for i in range(22):
        click = impact(rng, 1800, 10000, rng.uniform(0.0003, 0.0008))
        ring = modes(frames(0.03), [(rng.uniform(2200, 9000), 1, rng.uniform(0.004, 0.014)), (rng.uniform(3000, 8000), 0.5, 0.006)], rng, attack=0.0001)
        place(out, click, at, 1.1 * 0.9 ** i * rng.uniform(0.5, 1))
        place(out, ring, at, 0.18 * 0.92 ** i)
        at += gap * rng.uniform(0.6, 1.8)
        gap = min(0.012, gap * 1.12)
    m = frames(0.42)
    centre = sweep(m, 7200, 4600)
    breath = svf(rng.standard_normal(m), 'band', centre, 1.1) * env(m, 0.04, 0.32, 0.02)
    delay = int(SR / 3100)
    breath[delay:] += 0.5 * breath[:-delay]
    place(out, breath, crack + 0.03, 0.55)
    return finish(room(out, rng, 0.09), low_cut=300)


def gale(rng):
    """inhale -> whoosh. A small suction (air drawn in, rising, the Gale's own breath), then a clean, broad rush pushed
    out across the field left to right (the Gale's falling rush and its edge), and the air flapping at the cloth as it
    goes. Light low end: moving air, not weather."""
    n = frames(0.64)
    out = np.zeros((2, n))
    m = frames(0.17)
    swell = np.linspace(0, 1, m) ** 2.4
    place(out, svf(rng.standard_normal(m), 'band', sweep(m, 450, 1700), 1.1) * swell, 0.0, 0.75, pan=-0.35)
    m = frames(0.42)
    shape = env(m, 0.015, 0.34, 0.03)
    travel = np.linspace(-0.6, 0.8, m)
    place(out, svf(rng.standard_normal(m), 'band', sweep(m, 3000, 420), 0.7) * shape, 0.15, 1.3, pan=travel)
    place(out, svf(rng.standard_normal(m), 'band', sweep(m, 1500, 320), 1.2) * shape * turbulence(m, rng, 14, 0.35), 0.15, 0.8, pan=travel)
    k = frames(0.08)
    place(out, svf(rng.standard_normal(k), 'band', 5200, 0.9) * env(k, 0.003, 0.07), 0.15, 0.35, pan=travel[:k])
    k = frames(0.16)
    flap = svf(rng.standard_normal(k), 'band', 520, 1.4) * (0.5 + 0.5 * np.sin(2 * np.pi * 24 * np.arange(k) / SR)) * env(k, 0.01, 0.14)
    place(out, flap, 0.44, 0.35, pan=0.7)
    return finish(room(out, rng, 0.08), low_cut=200)


def steel(rng):
    """CLAK -> clunk/ring. A hard plate-on-plate crack (a dense crash of irregular plate modes over the instant of
    contact), a second, lower contact as the harness seats home (a clunk with the body behind it), and a short dense
    ring that dies quickly. Lower, shorter and more physical than the spells: no chime, no coin, no bell."""
    n = frames(0.5)
    out = np.zeros(n)
    place(out, impact(rng, 900, 7000, 0.002), 0.0, 2.0)
    place(out, dense_plate(frames(0.4), 640, rng, count=16, decay=0.16, gain=0.6, roll=0.9), 0.0003)
    m = frames(0.06)
    place(out, svf(rng.standard_normal(m), 'band', 3200, 1.2) * env(m, 0.001, 0.04), 0.0, 0.7)
    second = 0.085
    place(out, impact(rng, 400, 3500, 0.0025), second, 2.0)
    place(out, dense_plate(frames(0.42), 330, rng, count=12, decay=0.22, gain=0.75, roll=0.88), second + 0.0003)
    m = frames(0.09)
    place(out, svf(rng.standard_normal(m), 'band', 260, 1.5) * env(m, 0.002, 0.06), second, 1.2)
    for _ in range(6):
        f = rng.uniform(2800, 6000)
        place(out, modes(frames(0.04), [(f, 1, rng.uniform(0.01, 0.025))], rng), second + rng.uniform(0.005, 0.06), 0.06)
    # (short and hard: measured over a fifth of a second it reads quieter than it sounds, so it is set a little higher)
    return finish(room(out, rng, 0.1), low_cut=120, loud_db=-13.5)


def sunder(rng):
    """grrk -> THUD -> gng. Grit and stone shifting as the sword goes up, one heavy blow as it comes down (0.42 s: a
    crack, then a deep thud with the stone giving under it), and straight after it an ugly, beating ring of iron on
    the anvil's modes. Weight first, metal second; nothing like an explosion."""
    n = frames(0.88)
    out = np.zeros(n)
    hit = 0.42
    for i in range(22):
        at = hit * (0.15 + 0.82 * (i / 22) ** 0.7) + rng.uniform(-0.01, 0.01)
        place(out, grain(rng, rng.uniform(0.002, 0.007), rng.uniform(600, 2400), rng.uniform(2, 4)), at, rng.uniform(0.15, 0.3) * (0.4 + 0.6 * i / 22))
    m = frames(0.28)
    place(out, svf(rng.standard_normal(m), 'band', 380, 1.2) * np.linspace(0, 1, m) ** 2, hit - 0.28, 0.3)
    place(out, impact(rng, 800, 5000, 0.002), hit, 1.0)
    m = frames(0.3)
    place(out, svf(rng.standard_normal(m), 'low', sweep(m, 180, 55), 1.8) * env(m, 0.002, 0.2), hit, 4.4)
    m = frames(0.18)
    place(out, svf(rng.standard_normal(m), 'band', sweep(m, 900, 300), 1.2) * env(m, 0.002, 0.12), hit + 0.002, 0.9)
    for i in range(12):
        at = hit + 0.03 + (i / 12) ** 1.4 * 0.32 + rng.uniform(0, 0.015)
        place(out, grain(rng, rng.uniform(0.003, 0.009), rng.uniform(500, 2200), rng.uniform(2, 4)), at, 0.4 * (1 - i / 14))
    base = 285 * rng.uniform(0.98, 1.02)
    partials = []
    for ratio, g, d in ANVIL:
        f = base * ratio * rng.uniform(0.995, 1.005)
        partials += [(f, g, d * 0.26), (f * 1.017, g * 0.8, d * 0.24)]
    partials += [(2150 * rng.uniform(0.98, 1.02), 0.12, 0.3), (2190, 0.1, 0.28), (3380, 0.06, 0.2)]
    ring = modes(frames(0.42), partials, rng, attack=0.003)
    ring = np.tanh(2.2 * ring / (np.max(np.abs(ring)) + 1e-9)) * np.max(np.abs(ring))
    place(out, ring, hit + 0.03, 0.75)
    return finish(room(out, rng, 0.12), low_cut=45)


def vortex(rng):
    """ignite -> WHRRSH -> spark. The fire catching on the blade (the Fireball's flame, quicker), one compact pass of
    the burning sword going round (a rush whose level and pitch turn as it goes, carried round the field), and a
    spit of hot metal and sparks at its end. A flourish, not a tornado."""
    n = frames(0.72)
    out = np.zeros((2, n))
    m = frames(0.2)
    place(out, impact(rng, 1500, 9000, 0.001), 0.0, 0.5, pan=0.0)
    place(out, flame(m, rng, sweep(m, 380, 1300), 0.8, 38, 0.7) * env(m, 0.02, 0.17), 0.0, 1.0, pan=0.0)
    m = frames(0.4)
    t = np.arange(m) / SR
    u = t / t[-1]
    turn = 0.55 + 0.45 * np.sin(2 * np.pi * 7.5 * t - np.pi / 2)
    centre = (650 + 2100 * np.sin(np.pi * u)) * (0.85 + 0.15 * turn)
    rush = svf(rng.standard_normal(m), 'band', centre, 1.3) * turn * np.sin(np.pi * u) ** 0.8
    whine = svf(rng.standard_normal(m), 'band', centre * 2.0, 6.0) * turn * np.sin(np.pi * u) ** 1.2
    around = np.sin(2 * np.pi * 2.6 * t - np.pi / 2) * 0.85
    place(out, rush + 0.5 * flame(m, rng, centre * 0.7, 1.0, 30, 0.6) * np.sin(np.pi * u), 0.11, 1.3, pan=around)
    place(out, whine, 0.11, 0.3, pan=around)
    spark = 0.44
    place(out, modes(frames(0.08), [(3100, 0.5, 0.035), (4620, 0.35, 0.025), (6950, 0.2, 0.018)], rng), spark, 0.3, pan=0.3)
    for _ in range(8):
        place(out, pop(rng, rng.uniform(3500, 7000), rng.uniform(0.004, 0.01)), spark + rng.uniform(0, 0.14), rng.uniform(0.3, 0.55), pan=rng.uniform(-0.5, 0.5))
    k = frames(0.14)
    place(out, svf(rng.standard_normal(k), 'high', 5200, 0.7) * env(k, 0.004, 0.11), spark, 0.18, pan=0.1)
    return finish(room(out, rng, 0.1), low_cut=130)


def chivalry(rng):
    """steel set -> magic catches -> brief resolve. The blade drawn (a short bright shing, the game's unsheathe) and
    the guard set (a small plate clack), a restrained arcane ignition warming under it, then a tiny resolving rise of
    two metal notes, a fifth apart. Ceremonial and competent: no fanfare, no sparkle, no choir."""
    n = frames(0.74)
    out = np.zeros(n)
    m = frames(0.13)
    u = np.linspace(0, 1, m)
    place(out, svf(rng.standard_normal(m), 'band', sweep(m, 2400, 5200), 3.0) * (0.2 + 0.8 * u ** 1.5), 0.0, 0.6)
    place(out, modes(frames(0.3), [(1480, 0.45, 0.2), (1480 * 1.004, 0.3, 0.19), (1480 * 2.09, 0.2, 0.12), (1480 * 3.31, 0.1, 0.07)], rng), 0.12, 0.55)
    place(out, impact(rng, 900, 6000, 0.0015), 0.17, 1.1)
    place(out, dense_plate(frames(0.25), 720, rng, count=8, decay=0.09, gain=0.4, roll=0.85), 0.1703)
    m = frames(0.08)
    place(out, svf(rng.standard_normal(m), 'band', 240, 1.5) * env(m, 0.002, 0.05), 0.17, 0.7)
    m = frames(0.4)
    t = np.arange(m) / SR
    glow = env(m, 0.07, 0.3, 0.05)
    hum = (0.6 * np.sin(2 * np.pi * 220 * t) + 0.4 * np.sin(2 * np.pi * 330 * t + 1.1)) * glow
    place(out, hum, 0.16, 0.18)
    place(out, svf(rng.standard_normal(m), 'band', 950, 4.0) * glow * turbulence(m, rng, 8, 0.3), 0.16, 0.5)
    for at, note in ((0.42, 1318.5), (0.53, 1975.5)):
        place(out, modes(frames(0.25), [(note, 0.5, 0.16), (note * 1.003, 0.3, 0.15), (note * 2.09, 0.12, 0.07)], rng), at, 0.42)
        place(out, impact(rng, 2500, 9000, 0.0008), at, 0.25)
    return finish(room(out, rng, 0.12), low_cut=110)


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
