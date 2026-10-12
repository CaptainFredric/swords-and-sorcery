#!/usr/bin/env python3
"""Tutorial 1's three voices, from the creator's raw takes to the files the game plays.

    raw take (archived untouched)  ->  lossless master (24-bit WAV, 48 kHz)  ->  game-ready (AAC .m4a, MP3 fallback)

Nothing processed is ever a source: every run starts again from the raw takes. Three files say everything:

    tools/audio/tutorial-voice-chains.json   each character's treatment, every value of it, as named presets ('use'
                                             picks one; the others stay, so a treatment can be reverted by name)
    tools/audio/tutorial-voice-sources.json  each raw take (its archive name, its SHA-256), its character, the recording
                                             key it serves (or why none), and its own exceptions: a preset of its own,
                                             a pitch engine, a level, and repairs, each with its reason
    docs/tutorial-recording-plan.json        the keys and captions (the script's, never a transcript's)

and it writes:

    artifacts/tutorial-voice/masters/<speaker>/<key>-1.wav      the processed master, kept out of git
    client/assets/tutorial-voice/<speaker>/<key>-1.m4a (+ .mp3)  what the game loads
    client/assets/tutorial-voice/manifest.json                   key -> file, speaker, seconds, where the speech starts
    artifacts/tutorial-voice/qc.json                             every take's report: preset, engine, repairs, levels
    docs/tutorial-voice-manifest.md                              every raw take, one row each

    python3 tools/audio/tutorial_voice.py                        every take with a key
    python3 tools/audio/tutorial_voice.py --speaker rival        one character (after changing his preset)
    python3 tools/audio/tutorial_voice.py tutorial.us tutorial.jump-instruction    some takes
    python3 tools/audio/tutorial_voice.py --all                  also the unplaced, alternate and general takes (masters)
    python3 tools/audio/tutorial_voice.py --check                the sources against the archive and the plan

It needs numpy, scipy, praat-parselmouth, pedalboard, pyloudnorm and pyworld (tools/audio/requirements-tutorial-voice.txt).

Every take: 48 kHz; the recorder's broken final MP3 frame never decoded into the take; its repairs; the recorder's padding
trimmed (the performance kept); rumble off. Then its character's chain, every step of which a preset turns on and sets:
room removal, pause gate, expander, pitch (PSOLA, the established vocoder or Rubber Band, with a fallback when the
pitch cannot be followed), formants, EQ, the helm (its ring, reflections and grit, scaled together by helm.amount),
compression, de-essing, the room between words evened; then the character's level.
"""

import argparse
import copy
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import warnings

import numpy as np
import parselmouth
import pedalboard
import pyloudnorm
from parselmouth.praat import call
from pedalboard.io import AudioFile
from scipy.signal import resample_poly

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import knight_voice as kv  # noqa: E402  (the Spellblade's own building blocks: room removal, EQ, helm, dynamics, grit)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CHAINS = os.path.join(ROOT, 'tools', 'audio', 'tutorial-voice-chains.json')
SOURCES = os.path.join(ROOT, 'tools', 'audio', 'tutorial-voice-sources.json')
ARCHIVE = os.path.join(ROOT, 'artifacts', 'tutorial-voice', 'raw')
MASTERS = os.path.join(ROOT, 'artifacts', 'tutorial-voice', 'masters')
QC = os.path.join(ROOT, 'artifacts', 'tutorial-voice', 'qc.json')
GAME = os.path.join(ROOT, 'client', 'assets', 'tutorial-voice')
PLAN = os.path.join(ROOT, 'docs', 'tutorial-recording-plan.json')
TABLE = os.path.join(ROOT, 'docs', 'tutorial-voice-manifest.md')
SR = 48000


def read_raw(path):
    """A raw take, decoded (any format pedalboard reads: the MP3s, WAV, M4A), mono, at its own rate."""
    with AudioFile(path) as f:
        x = f.read(f.frames)
        return x.mean(axis=0).astype(np.float64), f.samplerate


MP3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
MP3_RATES = [44100, 48000, 32000, 0]


def mp3_damage(path, after=0.5):
    """Where a recording's MP3 stream stops being sound (seconds), or None: the recorder ends each take with a broken
    frame, and the frames after it reach back into a bit reservoir that no longer exists (a decoder's 'Header missing'
    and 'overread'). They decode as a garbled drop in level; nothing of the take is kept from there on. Only damage
    after `after` seconds counts (a take cut from a longer one can open on a reservoir reference, in its padding)."""
    if not path.lower().endswith('.mp3'):
        return None
    data = open(path, 'rb').read()
    i = 10 + ((data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9]) if data[:3] == b'ID3' else 0

    def frame(at):
        if at + 6 > len(data) or data[at] != 0xFF or (data[at + 1] & 0xFE) != 0xFA:
            return None
        kbps, rate = MP3_KBPS[data[at + 2] >> 4], MP3_RATES[(data[at + 2] >> 2) & 3]
        if not kbps or not rate:
            return None
        side = 4 + (0 if data[at + 1] & 1 else 2)
        return {'size': 144000 * kbps // rate + ((data[at + 2] >> 1) & 1), 'rate': rate,
                'reach': (data[at + side] << 1) | (data[at + side + 1] >> 7),
                'payload': 144000 * kbps // rate - side - (17 if (data[at + 3] >> 6) == 3 else 32)}

    count, reservoir = 0, 0
    while i < len(data) - 4:
        f = frame(i)
        whole = f and (i + f['size'] >= len(data) - 4 or frame(i + f['size']))
        t = count * 1152 / (f['rate'] if f else 44100)
        if not whole or f['reach'] > reservoir:
            if t >= after:
                return t
            if not whole:
                i += 1
                reservoir = 0
                continue
        reservoir = min(511, reservoir + max(0, f['payload']))
        count += 1
        i += f['size']
    return None


def to48(x, sr):
    if sr == SR:
        return x
    g = np.gcd(SR, int(sr))
    return resample_poly(x, SR // g, int(sr) // g)


def write_master(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with AudioFile(path, 'w', SR, 1, bit_depth=24) as f:
        f.write(x.astype(np.float32)[None, :])


def encode(master, base):
    """The game's files from the master: AAC (96 kbps) first, an MP3 for a browser that cannot decode it."""
    os.makedirs(os.path.dirname(base), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        pcm = os.path.join(tmp, 'take.wav')
        x, _ = read_raw(master)
        kv.save_wav(pcm, x)
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '96000', pcm, base + '.m4a'], check=True, capture_output=True)
        with AudioFile(base + '.mp3', 'w', SR, 1, quality='V4') as f:
            f.write(x.astype(np.float32)[None, :])


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


# --- shared blocks --------------------------------------------------------------------------------------------------

def levels(x, sr, ms=10):
    hop = int(sr * ms / 1000)
    n = len(x) // hop
    return 10 * np.log10(np.mean(x[:n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12), hop


def trim_bounds(x, sr, skip=0.12, below=38, over_room=14, breath_db=6, decay_db=6, back_max=0.4, fwd_max=0.35, pre=0.04, post=0.06):
    """The recorder's padding off, the performance kept: from just before the first sound that belongs to the line (an
    audible breath or a soft onset counts: frames `breath_db` over the room, running back at most `back_max` from the
    speech) to just after its last (its decay to within `decay_db` of the room, at most `fwd_max` on). The first
    `skip` seconds are never the line (the recorder's silent first frame, then its noise suppressor settling).

    The room is judged where it is: the recorder's suppressor leaves a steady hiss before the line and near-silence
    after it, so the lead-in is measured against the lead-in's own level and the run-out against the run-out's (a
    take's quietest frames would make the hiss before it look like a breath). Speech is sound held for 30 ms, so a
    lone click in the lead-in is not the line beginning. `pre` is generous enough for a breathy start ('How?', a soft
    'f' or 's' rising out of the room under any threshold) to keep its whole ramp."""
    lv, hop = levels(x, sr)
    k0 = int(skip * sr / hop)
    held = np.minimum(np.minimum(lv, np.roll(lv, -1)), np.roll(lv, -2))
    held[-2:] = lv[-2:]
    body = lv[k0:]
    room = np.percentile(body, 10)
    loud = np.where(held[k0:] > max(body.max() - below, room + 12))[0] + k0
    if not len(loud):
        return 0, len(x), {}
    lead = lv[k0:loud[0]]
    lead_room = float(np.median(lead)) if len(lead) >= 5 else room
    on = np.where(held[k0:] > max(body.max() - below, lead_room + over_room))[0] + k0
    first = on[0] if len(on) else loud[0]
    last = loud[-1]
    after = lv[last + 1:]
    tail_room = float(np.percentile(after, 20)) if len(after) >= 5 else room
    a = first
    while a - 1 >= k0 and lv[a - 1] > lead_room + breath_db and (first - (a - 1)) * hop / sr <= back_max:
        a -= 1
    b = last
    while b + 1 < len(lv) and lv[b + 1] > tail_room + decay_db and ((b + 1) - last) * hop / sr <= fwd_max:
        b += 1
    start, end = max(0, a * hop - int(pre * sr)), min(len(x), (b + 1) * hop + int(post * sr))
    return start, end, {'speech': [round(first * hop / sr, 3), round((last + 1) * hop / sr, 3)],
                        'kept': [round(start / sr, 3), round(end / sr, 3)],
                        'room_db': [round(lead_room, 1), round(tail_room, 1)]}


def fade(x, sr, fade_in=0.012, fade_out=0.03):
    x = x.copy()
    a, b = min(len(x), int(fade_in * sr)), min(len(x), int(fade_out * sr))
    x[:a] *= np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    x[len(x) - b:] *= np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return x


def highpass(x, hz):
    return pedalboard.Pedalboard([pedalboard.HighpassFilter(cutoff_frequency_hz=hz)])(x.astype(np.float32), SR).astype(np.float64)


def even_room(x, sr, open_db=-34, hold_ms=110, ratio=2.0, depth_db=18, step_ms=5, attack_ms=3, release_ms=60):
    """The room between and around the words sunk away (never more than `depth_db`), every frame within `hold_ms` of
    a word left exactly alone: a steady quiet between phrases, whatever the recorder's own gain was doing there."""
    hop = max(1, int(sr * step_ms / 1000))
    n = len(x) // hop + 1
    lv = np.array([10 * np.log10(np.mean(x[i * hop:(i + 1) * hop] ** 2) + 1e-12) if len(x[i * hop:(i + 1) * hop]) else -120 for i in range(n)])
    top = lv.max()
    hold = max(1, int(hold_ms / step_ms))
    near = np.convolve((lv > top + open_db).astype(float), np.ones(2 * hold + 1), mode='same') > 0
    target = np.where(near, 0.0, np.maximum(-depth_db, np.minimum(0, (lv - (top + open_db)) * (ratio - 1))))
    opening, closing = 1 - np.exp(-step_ms / attack_ms), 1 - np.exp(-step_ms / release_ms)
    gain_db = np.zeros(n)
    g = target[0]
    for i in range(n):
        g += (target[i] - g) * (opening if target[i] > g else closing)
        gain_db[i] = g
    return x * np.interp(np.arange(len(x)), np.arange(n) * hop + hop / 2, 10 ** (gain_db / 20))


def deess(x, sr, low=4800, max_cut_db=6.0, over_db=-14, n_fft=1024, hop=256):
    """Sibilance tamed only where it stands out: a frame whose 4.8 kHz-and-up is within `over_db` of the take's loud
    frames AND louder than its own 1-4 kHz has that band brought down (at most `max_cut_db`), eased in time and across
    the crossover, so ordinary consonants keep their edge."""
    X, window, length = kv.stft(x, n_fft, hop)
    freqs = np.fft.rfftfreq(n_fft, 1 / sr)
    p = np.abs(X) ** 2
    high = 10 * np.log10(p[:, freqs >= low].sum(axis=1) + 1e-12)
    mid = 10 * np.log10(p[:, (freqs >= 1000) & (freqs < 4000)].sum(axis=1) + 1e-12)
    loud = np.percentile(10 * np.log10(p.sum(axis=1) + 1e-12), 95)
    cut = np.clip(np.minimum(high - (loud + over_db), high - mid), 0, max_cut_db)
    letting_go = np.exp(-hop / sr / 0.04)
    eased = np.zeros_like(cut)
    held = 0.0
    for i, c in enumerate(cut):
        held = c if c > held else held * letting_go + c * (1 - letting_go)
        eased[i] = held
    ramp = np.clip((freqs - (low - 1200)) / 1200, 0, 1)
    out = kv.istft(X * 10 ** (-eased[:, None] * ramp[None, :] / 20), window, length, len(x), n_fft, hop)
    return out, round(float(eased.max()) if len(eased) else 0.0, 1)


def lufs(x, sr):
    """Integrated loudness (BS.1770), with the gating blocks shortened for a take under half a second."""
    meter = pyloudnorm.Meter(sr, block_size=min(0.4, max(0.1, len(x) / sr * 0.8)))
    return float(meter.integrated_loudness(x))


def level_to(x, sr, target, ceiling_db=-1.5):
    """Integrated loudness to `target`, then a soft ceiling under ceiling_db (true peak, measured 4x oversampled)."""
    out = x * 10 ** ((target - lufs(x, sr)) / 20)
    ceiling = 10 ** (ceiling_db / 20)
    knee = ceiling * 0.75
    over = np.abs(out) > knee
    out[over] = np.sign(out[over]) * (knee + (ceiling - knee) * np.tanh((np.abs(out[over]) - knee) / (ceiling - knee)))
    # (between the samples a waveform can still peak higher: what is left over comes off the whole take)
    peak = np.max(np.abs(resample_poly(out, 4, 1)))
    return out * min(1.0, ceiling / peak)


# --- pitch and formants ---------------------------------------------------------------------------------------------

def pitch_track(x, sr):
    snd = parselmouth.Sound(x, sampling_frequency=sr)
    return snd.to_pitch_ac(time_step=0.01, pitch_floor=60, pitch_ceiling=600, voicing_threshold=0.5).selected_array['frequency']


def contour_error(before, after, sr, semitones):
    """How far `after`'s pitch strays from `before`'s moved by `semitones`: the median offset (cents) and the share
    of frames voiced in both that are more than a semitone off it (%). The same take, same length: no alignment."""
    a, b = pitch_track(before, sr), pitch_track(after, sr)
    n = min(len(a), len(b))
    both = (a[:n] > 0) & (b[:n] > 0)
    if both.sum() < 5:
        return {'offset_cents': 0.0, 'gross_pct': 0.0}
    cents = 1200 * np.log2(b[:n][both] / a[:n][both]) - 100 * semitones
    offset = float(np.median(cents))
    return {'offset_cents': round(offset, 1), 'gross_pct': round(100 * float(np.mean(np.abs(cents - offset) > 100)), 1)}


def shift_psola(x, sr, semitones):
    """PSOLA (Praat): the pitch moved, the formants left exactly where they were by construction."""
    snd = parselmouth.Sound(x, sampling_frequency=sr)
    manipulation = call(snd, 'To Manipulation', 0.01, 70, 600)
    tier = call(manipulation, 'Extract pitch tier')
    call(tier, 'Multiply frequencies', snd.xmin, snd.xmax, 2 ** (semitones / 12))
    call([tier, manipulation], 'Replace pitch tier')
    y = call(manipulation, 'Get resynthesis (overlap-add)').values[0]
    return np.concatenate([y, np.zeros(max(0, len(x) - len(y)))])[:len(x)]


def shift_rubberband(x, sr, semitones):
    """Rubber Band (pedalboard), formants preserved: for a take whose pitch PSOLA cannot follow (a scream, a croak)."""
    y = pedalboard.time_stretch(x.astype(np.float32)[None, :], sr, stretch_factor=1.0, pitch_shift_in_semitones=semitones,
                                high_quality=True, transient_mode='crisp', preserve_formants=True)[0].astype(np.float64)
    return np.concatenate([y, np.zeros(max(0, len(x) - len(y)))])[:len(x)]


def warp_formants(x, sr, ratio, n_fft=2048, hop=256, lifter_ms=1.4, limit_db=10):
    """Formants moved by `ratio` (under 1: a longer vocal tract, more body), the harmonics (the pitch) left alone: each
    frame's spectral envelope divided out and replaced by the same envelope stretched along frequency."""
    X, window, length = kv.stft(x, n_fft, hop)
    envelope = kv.spectral_envelope(np.abs(X), int(sr * lifter_ms / 1000))
    bins = np.arange(X.shape[1])
    source = np.clip(bins / ratio, 0, X.shape[1] - 1)
    warped = np.array([np.interp(source, bins, e) for e in envelope])
    gain = np.log(np.clip(warped / np.maximum(envelope, 1e-12), 10 ** (-limit_db / 20), 10 ** (limit_db / 20)))
    gain[1:-1] = (gain[:-2] + 2 * gain[1:-1] + gain[2:]) / 4
    return kv.istft(X * np.exp(gain), window, length, len(x), n_fft, hop)


def read_chains():
    return json.load(open(CHAINS))


def preset_for(take, chains):
    """The settings a take is processed with: its character's preset in use (or the one it names), with its own
    exceptions on top. Returns (preset name, settings)."""
    role = chains['roles'][take['speaker']]
    own = take.get('chain', {})
    name = own.get('preset', role['use'])
    preset = copy.deepcopy(role['presets'][name])
    if own.get('pitchEngine'):
        preset['pitch'] = {**preset['pitch'], 'engine': own['pitchEngine'], 'fallback': []}
    if own.get('gainDb'):
        preset['gainDb'] = own['gainDb']
    return name, preset


# --- repairs: a take's own fixes, in its recording's seconds (sources: repairs) --------------------------------------
#   { kind: 'mend', span: [a, b], why }          a stretch the voice breaks in (a creak that a pitch change turns into
#                                                a stray note) resynthesized (WORLD) with the pitch and spectrum of the
#                                                steady voice either side, crossfaded into the take at both ends
#   { kind: 'release', extendSec, decayDb, why } the last word's breath continued past where the recorder cut it off,
#                                                decaying decayDb over extendSec, with the release's own spectrum

def world_analysis(x, period=5.0):
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        import pyworld
    f0, t = pyworld.harvest(x, SR, f0_floor=60, f0_ceil=500, frame_period=period)
    return pyworld, f0, t, pyworld.cheaptrick(x, f0, t, SR), pyworld.d4c(x, f0, t, SR)


def mend(x, span, fade_sec=0.025, period=5.0):
    pyworld, f0, t, sp, ap = world_analysis(x, period)
    before = np.searchsorted(t, span[0]) - 1
    while before > 0 and f0[before] <= 0:
        before -= 1
    after = np.searchsorted(t, span[1])
    while after < len(f0) - 1 and f0[after] <= 0:
        after += 1
    w = np.linspace(0, 1, after - before + 1)[:, None]
    f0, sp, ap = f0.copy(), sp.copy(), ap.copy()
    f0[before:after + 1] = np.exp(np.log(f0[before]) * (1 - w[:, 0]) + np.log(f0[after]) * w[:, 0])
    sp[before:after + 1] = np.exp(np.log(sp[before]) * (1 - w) + np.log(sp[after]) * w)
    ap[before:after + 1] = ap[before] * (1 - w) + ap[after] * w
    y = pyworld.synthesize(f0, sp, ap, SR, frame_period=period)
    y = np.concatenate([y, np.zeros(max(0, len(x) - len(y)))])[:len(x)]
    a, b, f = int(t[before] * SR), int(t[after] * SR), int(fade_sec * SR)
    g = np.zeros(len(x))
    g[a:b] = 1
    ramp = np.sin(np.linspace(0, np.pi / 2, f)) ** 2
    g[a - f:a], g[b:b + f] = ramp, ramp[::-1]
    return x * (1 - g) + y * g, [round(float(t[before]), 3), round(float(t[after]), 3)]


def release(x, extend_sec=0.08, decay_db=30, blend_sec=0.015, sample_sec=0.025, period=5.0):
    pyworld, f0, t, sp, ap = world_analysis(x, period)
    k = max(1, int(sample_sec * 1000 / period))
    last_sp = np.exp(np.mean(np.log(sp[-k - 1:-1]), axis=0))
    last_ap = np.mean(ap[-k - 1:-1], axis=0)
    n = int(extend_sec * 1000 / period) + 1
    fall = 10 ** (-decay_db * (np.arange(n) * period / 1000 / extend_sec) / 10)
    j = len(t) - int(blend_sec * 1000 / period) - 2
    y = pyworld.synthesize(np.concatenate([f0[j:], np.zeros(n)]), np.vstack([sp[j:], last_sp[None, :] * fall[:, None]]),
                           np.vstack([ap[j:], np.maximum(np.repeat(last_ap[None, :], n, 0), 0.9)]), SR, frame_period=period)
    start = int(t[j] * SR)
    f = len(x) - start
    w = np.sin(np.linspace(0, np.pi / 2, f)) ** 2
    return np.concatenate([x[:start], x[start:] * (1 - w) + y[:f] * w, y[f:]])


# --- the chain ------------------------------------------------------------------------------------------------------

def shift_pitch(x, pitch, report):
    """The pitch moved by pitch.semitones with the engine named, and if the result strays from the contour (more than
    contourLimitPct of voiced frames over a semitone off), by each fallback in turn: the best of them is kept."""
    engines = {'vocoder': lambda y, st: kv.pitch_shift(y, st, formants=1.0), 'psola': shift_psola, 'rubberband': shift_rubberband}
    best = None
    for name in [pitch['engine'], *pitch.get('fallback', [])]:
        y = engines[name](x, SR, pitch['semitones']) if name != 'vocoder' else engines[name](x, pitch['semitones'])
        error = contour_error(x, y, SR, pitch['semitones'])
        if best is None or error['gross_pct'] < best[2]['gross_pct']:
            best = (name, y, error)
        if error['gross_pct'] <= pitch.get('contourLimitPct', 8):
            break
    report['engine'], y, report['contour'] = best
    return y


def chain(x, p, report):
    """A character's treatment, every step of it set (or left out) by its preset, in this order."""
    room = p.get('room') or {}
    if room.get('dereverb'):
        x = kv.declip(x)
        measured = kv.room_decay(x, SR)
        t60 = min(room['t60MaxSec'], measured) if measured else room['t60MaxSec']
        x = kv.dereverb(x, SR, t60=max(0.3, t60), strength=room['strength'], floor_db=room['floorDb'])
        report['t60'] = round(float(t60), 2)
    if p.get('gate'):
        x = kv.gate_pauses(x, SR, open_db=p['gate']['openDb'], hold_ms=p['gate']['holdMs'])
    if p.get('expand'):
        x = kv.dynamics(x, SR, below_db=p['expand']['belowDb'], ratio=p['expand']['ratio'])
    if (p.get('pitch') or {}).get('semitones'):
        x = shift_pitch(x, p['pitch'], report)
    if p.get('formants') and p['formants'] != 1:
        before = x
        x = warp_formants(x, SR, p['formants'])
        if 'contour' not in report:
            report['contour'] = contour_error(before, x, SR, 0)
    helm = p.get('helm') or {}
    amount = helm.get('amount', 1.0)
    bands = [tuple(band) for band in p.get('eq', [])]
    if helm.get('ringDb'):
        bands.append(('bell', helm.get('ringHz', 1250), helm['ringDb'] * amount, 0.9))
    if bands:
        x = kv.equalize(x, SR, bands)
    if helm.get('reflections') and amount:
        x = kv.helm(x, SR, reflections=tuple((delay, gain * amount) for delay, gain in helm['reflections']))
    if p.get('compress'):
        c = p['compress']
        x = kv.dynamics(x, SR, above_db=c['aboveDb'], squeeze=c['ratio'], attack_ms=c['attackMs'], release_ms=c['releaseMs'])
    if helm.get('grit') and amount:
        x = kv.saturate(x, helm.get('drive', 1.6), wet=helm['grit'] * amount)
    if p.get('deess'):
        x, report['deessed_db'] = deess(x, SR, max_cut_db=p['deess']['maxCutDb'])
    if (p.get('expand') or {}).get('tailBelowDb') is not None:
        x = kv.dynamics(x, SR, below_db=p['expand']['tailBelowDb'], ratio=2.0)
    if p.get('gate'):
        x = kv.gate_pauses(x, SR, open_db=p['gate']['openDb'], hold_ms=p['gate']['holdMs'])
    if p.get('evenRoom'):
        x = even_room(x, SR, depth_db=24)
    return x


def prepare(raw, sr, path, take, preset, trim, report):
    """48 kHz, no DC, the recording's broken end never decoded into it, its repairs made, the recorder's padding off,
    rumble off (and for a character that wants it, the room between words evened)."""
    x = to48(raw, sr)
    x = x - np.mean(x)
    damaged = mp3_damage(path)
    if damaged is not None:
        x = x[:int(damaged * SR)]
    cut_at_damage = damaged is not None
    for fix in take.get('repairs', []):
        if fix['kind'] == 'mend':
            x, span = mend(x, fix['span'])
            report.setdefault('repairs', []).append({'mend': span})
        elif fix['kind'] == 'release':
            x = release(x, fix.get('extendSec', 0.08), fix.get('decayDb', 30))
            report.setdefault('repairs', []).append({'release': fix.get('extendSec', 0.08)})
            cut_at_damage = False
    start, end, bounds = trim_bounds(x, SR, skip=trim['skipSec'], below=trim['belowPeakDb'], over_room=trim['overRoomDb'],
                                     breath_db=trim['breathDb'], decay_db=trim['decayDb'], back_max=trim['backMaxSec'],
                                     fwd_max=trim['fwdMaxSec'], pre=trim['preSec'], post=trim['postSec'])
    report.update(bounds)
    if cut_at_damage and end >= len(x) - int(0.005 * SR):
        report['ends_at_damage'] = round(damaged, 3)
    y = fade(highpass(x[start:end], preset.get('highpassHz', 70)), SR, trim['fadeInSec'], trim['fadeOutSec'])
    report['raw_lufs'] = round(lufs(y, SR), 2)
    return even_room(y, SR) if preset.get('evenRoom') else y


def process(take, chains, medians):
    """One raw take -> its master (48 kHz float) and a report of everything done to it and measured."""
    path = os.path.join(ARCHIVE, take['raw'])
    raw, sr = read_raw(path)
    name, preset = preset_for(take, chains)
    report = {'preset': name}
    x = prepare(raw, sr, path, take, preset, chains['trim'], report)
    y = chain(x, preset, report)
    lv = chains['levels']
    keep = np.clip(lv['keepDynamics'] * (report['raw_lufs'] - medians[take['speaker']]), -lv['keepClampDb'], lv['keepClampDb'])
    report['lufs'] = round(preset['lufs'] + float(keep) + preset.get('gainDb', 0), 2)
    y = level_to(y, SR, report['lufs'], lv['ceilingDb'])
    report['seconds'] = round(len(y) / SR, 3)
    report['onset'] = round(report['speech'][0] - report['kept'][0], 3) if report.get('speech') else 0.0
    report['true_peak_db'] = round(20 * np.log10(np.max(np.abs(resample_poly(y, 4, 1))) + 1e-12), 2)
    return y, report


# --- the run --------------------------------------------------------------------------------------------------------

def plays(take):
    return bool(take.get('key')) and take.get('status') != 'alternate'


def role_medians(takes, chains):
    """Each character's usual loudness: the median of its played takes, trimmed and high-passed, before its chain."""
    values = {}
    for take in takes:
        if not plays(take):
            continue
        path = os.path.join(ARCHIVE, take['raw'])
        raw, sr = read_raw(path)
        report = {}
        prepare(raw, sr, path, {**take, 'repairs': []}, preset_for(take, chains)[1], chains['trim'], report)
        values.setdefault(take['speaker'], []).append(report['raw_lufs'])
    return {speaker: float(np.median(v)) for speaker, v in values.items()}


def destination(take):
    stem = os.path.basename(take['raw']).rsplit('.', 1)[0]
    if take.get('key'):
        if take.get('status') == 'alternate':
            return os.path.join(MASTERS, 'alternates', take['key'], stem + '.wav'), None
        game = f"{take['speaker']}/{take['key']}-1"
        return os.path.join(MASTERS, game + '.wav'), game
    return os.path.join(MASTERS, 'general' if take.get('status') == 'general' else 'unplaced', stem + '.wav'), None


def check(sources, chains):
    """The sources sound: every raw take archived and unchanged, every key a key of the plan and served once, every
    take's preset and repairs known."""
    plan = {p['key'] for p in json.load(open(PLAN))}
    errors, served = [], {}
    for take in sources['takes']:
        path = os.path.join(ARCHIVE, take['raw'])
        if not os.path.exists(path):
            errors.append(f"{take['raw']}: not in {os.path.relpath(ARCHIVE, ROOT)}")
        elif sha256(path) != take['sha256']:
            errors.append(f"{take['raw']}: changed since it was listed (SHA-256 differs)")
        role = chains['roles'].get(take['speaker'])
        if not role:
            errors.append(f"{take['raw']}: no chain for {take['speaker']}")
        elif take.get('chain', {}).get('preset') and take['chain']['preset'] not in role['presets']:
            errors.append(f"{take['raw']}: no preset {take['chain']['preset']} for {take['speaker']}")
        for fix in take.get('repairs', []):
            if fix.get('kind') not in ('mend', 'release') or not fix.get('why'):
                errors.append(f"{take['raw']}: a repair needs a known kind and its reason: {fix}")
        if take.get('key'):
            if take['key'] not in plan:
                errors.append(f"{take['raw']}: {take['key']} is not in the recording plan")
            if plays(take):
                served.setdefault(take['key'], []).append(take['raw'])
    errors += [f'{key}: served by several takes {raws}' for key, raws in served.items() if len(raws) > 1]
    return errors, sorted(plan - set(served))


def write_manifest(entries, keep):
    """The game's list: the takes just made, and those already there that still play (nothing stale left behind)."""
    os.makedirs(GAME, exist_ok=True)
    path = os.path.join(GAME, 'manifest.json')
    takes = json.load(open(path)).get('takes', {}) if os.path.exists(path) else {}
    takes = {key: entry for key, entry in takes.items() if key in keep}
    takes.update(entries)
    with open(path, 'w') as f:
        json.dump({'version': 1, 'takes': dict(sorted(takes.items()))}, f, indent=2)
        f.write('\n')


def write_table(sources, chains):
    """docs/tutorial-voice-manifest.md: every raw take, its character, its words, its key, its treatment, its files."""
    plan = {p['key']: p for p in json.load(open(PLAN))}
    game_path = os.path.join(GAME, 'manifest.json')
    game = json.load(open(game_path))['takes'] if os.path.exists(game_path) else {}
    cell = lambda text: str(text).replace('|', '\\|')
    rows = ['| Raw take | Character | Words | Key | Status | Treatment | Master | Game files |',
            '| --- | --- | --- | --- | --- | --- | --- | --- |']
    for take in sources['takes']:
        key = take.get('key')
        words = take.get('words') or (plan[key]['text'] if key in plan else '')
        name, _ = preset_for(take, chains)
        treatment = name + ''.join(f"; {fix['kind']}" for fix in take.get('repairs', [])) + (f"; {take['chain']['pitchEngine']}" if take.get('chain', {}).get('pitchEngine') else '')
        files = f"client/assets/tutorial-voice/{game[key]['file']}.m4a, .mp3" if key in game and plays(take) else ''
        status = take['status'] + (f": {take['note']}" if take.get('note') else '')
        rows.append(f"| {cell(take['raw'].split('/', 1)[1])} | {take['speaker']} | {cell(words)} | {key or ''} | {cell(status)} | {cell(treatment)} "
                    f"| {cell(os.path.relpath(destination(take)[0], ROOT))} | {files} |")
    missing = [k for k in plan if k not in {t.get('key') for t in sources['takes'] if plays(t)}]
    with open(TABLE, 'w') as f:
        f.write('# Tutorial 1 voice manifest\n\nGenerated by `tools/audio/tutorial_voice.py` from `tools/audio/tutorial-voice-sources.json` and '
                '`tools/audio/tutorial-voice-chains.json` (raw takes archived untouched in `artifacts/tutorial-voice/raw/<zip>/`; masters in '
                '`artifacts/tutorial-voice/masters/`, both kept out of git). Every raw take supplied is one row. Words: the script\'s caption, '
                'or for an intended or unplaced take the words it says.\n\n')
        f.write('\n'.join(rows) + '\n')
        if missing:
            f.write('\n## Keys with no take yet\n\n' + '\n'.join(f"- `{k}` ({plan[k]['speaker']}): {plan[k]['text']}" for k in missing) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('keys', nargs='*', help='only these recording keys (or raw names)')
    parser.add_argument('--speaker', choices=('spellblade', 'rival', 'narrator'), help='only this character')
    parser.add_argument('--all', action='store_true', help='also master the takes that do not play (unplaced, alternate, general)')
    parser.add_argument('--check', action='store_true', help='only check the sources')
    parser.add_argument('--table', action='store_true', help='only rewrite docs/tutorial-voice-manifest.md')
    args = parser.parse_args()
    chains, sources = read_chains(), json.load(open(SOURCES))
    errors, missing = check(sources, chains)
    for error in errors:
        print(f'WRONG: {error}', file=sys.stderr)
    if missing:
        print(f'No take yet for {len(missing)} key(s): {", ".join(missing)}')
    if args.check or errors:
        return 1 if errors else 0
    if args.table:
        write_table(sources, chains)
        return 0
    takes = [t for t in sources['takes'] if plays(t) or args.all]
    if args.speaker:
        takes = [t for t in takes if t['speaker'] == args.speaker]
    if args.keys:
        takes = [t for t in takes if t.get('key') in args.keys or t['raw'] in args.keys or os.path.basename(t['raw']) in args.keys]
    medians = role_medians(sources['takes'], chains)
    qc = json.load(open(QC)) if os.path.exists(QC) else {}
    qc['role_median_raw_lufs'] = {k: round(v, 2) for k, v in medians.items()}
    qc['takes'] = {raw: entry for raw, entry in qc.get('takes', {}).items() if raw in {t['raw'] for t in sources['takes']}}
    entries = {}
    for take in takes:
        y, report = process(take, chains, medians)
        master, stem = destination(take)
        write_master(master, y)
        if stem:
            encode(master, os.path.join(GAME, stem))
            entries[take['key']] = {'file': stem, 'speaker': take['speaker'], 'seconds': report['seconds'], 'onset': report['onset']}
        qc['takes'][take['raw']] = {'key': take.get('key'), 'speaker': take['speaker'], 'master': os.path.relpath(master, ROOT), **report}
        print(f"{(take.get('key') or os.path.basename(take['raw'])):38s} {take['speaker']:10s} {report['preset']:18s} {report['seconds']:5.2f}s "
              f"onset {report['onset']:.3f}s  {report['raw_lufs']:6.1f} -> {report['lufs']:6.1f} LUFS  tp {report['true_peak_db']:5.1f}"
              + (f"  {report['engine']}" if 'engine' in report else '') + (f" {report['contour']}" if 'contour' in report else '')
              + (f"  repairs {report['repairs']}" if report.get('repairs') else ''))
    write_manifest(entries, keep={t['key'] for t in sources['takes'] if plays(t)})
    os.makedirs(os.path.dirname(QC), exist_ok=True)
    with open(QC, 'w') as f:
        json.dump(qc, f, indent=1, default=float)
    write_table(sources, chains)
    return 0


if __name__ == '__main__':
    sys.exit(main())
