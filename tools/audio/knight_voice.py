#!/usr/bin/env python3
"""Turn raw voice takes into the Spellblade's voice: a hardened battlemage heard through his helm.

    python3 tools/audio/knight_voice.py ~/Desktop/knight-takes            # every take in a folder
    python3 tools/audio/knight_voice.py effort-1.m4a hurt-2.m4a --semitones -2
    python3 tools/audio/knight_voice.py master.wav:0.43-1.88 --line sorcery   # a window of a longer recording

Name each take after its line (effort, hurt, death, sorcery, dash, victory, defeat, magic-defeat, kill-taunt,
break-taunt; a number or anything after a dash or space is ignored, and a few aliases work: grunt, pain, die, spell,
breath, laugh...), or give --line (magicDefeat, killTaunt, ... as the game names them). Any format
macOS can read works (Voice Memos .m4a, QuickTime .m4a/.mov, .wav, .aiff, .mp3). A take may be a window of a longer
file: path:start-end in seconds.

The close helm (the standard chain, --profile close; see tools/audio/RECORDING.md for the reasons):
  1. declip     rebuild peaks the recorder flattened (a curve through each flat top, from the slopes either side)
  2. dereverb   take out the room it was recorded in: its late reverberation, predicted from the take's own decay,
                is subtracted band by band down to a gentle floor
  3. expand     a downward expander: what is left of the room between and after the words sinks away
  4. pitch      down (a phase vocoder: same length, deeper and bigger)
  5. EQ         proximity and chest, a little helm ring, clarity, the bite taken off (it is behind steel)
  6. helm       the tight reflections inside a great helm, a millimetre or two of air away
  7. compress   a shout is dense, not spiky
  8. grit       gentle saturation
  9. loudness   matched per line, peaks under -1 dBFS
Nothing of a castle is baked in: the game adds the courtyard's echo itself, and only for other knights (your own
voice is heard close, from inside the helm). --profile classic is the earlier chain (no declip, dereverb, expander
or compressor).

Each take is written to client/assets/voice as AAC (.m4a) with a small WAV fallback; manifest.json lists what exists.
--preview also writes a before/after pair to artifacts/voice-preview to listen to here.

Processing a line replaces all of its earlier takes.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import wave

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'client', 'assets', 'voice')
SR = 48000

LINES = ('effort', 'hurt', 'death', 'sorcery', 'dash', 'victory', 'defeat', 'magicDefeat', 'killTaunt', 'breakTaunt',
         'galeTaunt', 'steelBoast', 'fistEffort', 'fistThrow', 'fistKill', 'rebuttal')
ALIASES = {
    'grunt': 'effort', 'swing': 'effort', 'attack': 'effort', 'heave': 'effort', 'strike': 'effort',
    'pain': 'hurt', 'hit': 'hurt', 'ow': 'hurt', 'ouch': 'hurt',
    'die': 'death', 'dying': 'death', 'dead': 'death',
    'spell': 'sorcery', 'cast': 'sorcery', 'fireball': 'sorcery',
    'breath': 'dash', 'huff': 'dash', 'exhale': 'dash',
    'win': 'victory', 'laugh': 'victory', 'cheer': 'victory', 'triumph': 'victory',
    'hya': 'fistEffort', 'hiyah': 'fistEffort', 'hiyaah': 'fistEffort', 'punch': 'fistEffort',
    'gauntlet': 'fistThrow', 'sofisticated': 'fistKill', 'fistkill': 'fistKill',
}

# per line: how far down, how hard the grit, how loud (the close helm keeps the veteran's -4.5 semitones)
PRESETS = {
    'effort': {'semitones': -4.5, 'drive': 2.4, 'rms_db': -16},
    'hurt': {'semitones': -4.5, 'drive': 2.2, 'rms_db': -16},
    'death': {'semitones': -4.5, 'drive': 2.0, 'rms_db': -16},
    'sorcery': {'semitones': -4.5, 'drive': 2.5, 'rms_db': -15},
    'dash': {'semitones': -4.5, 'drive': 1.6, 'rms_db': -20},
    'victory': {'semitones': -4.5, 'drive': 2.2, 'rms_db': -16},
    # the spoken lines: a touch less grit than the cries, so every word lands
    'defeat': {'semitones': -4.5, 'drive': 2.2, 'rms_db': -16},
    'magicDefeat': {'semitones': -4.5, 'drive': 2.0, 'rms_db': -18},   # deadpan, not shouted
    'killTaunt': {'semitones': -4.5, 'drive': 2.2, 'rms_db': -16},
    'breakTaunt': {'semitones': -4.5, 'drive': 2.2, 'rms_db': -16},
    # "What did you say? Must have been the wind..." (the second half is an aside, spoken low: the expander is
    # eased so it keeps it)
    'galeTaunt': {'semitones': -4.5, 'drive': 2.0, 'rms_db': -17, 'expand_below_db': -42},
    # "My armor works now!"
    'steelBoast': {'semitones': -4.5, 'drive': 2.2, 'rms_db': -16},
    # the gauntlet: "HYA!" as it goes out (a cry, with the cries' grit), and three rare lines
    'fistEffort': {'semitones': -4.5, 'drive': 2.4, 'rms_db': -16},
    'fistThrow': {'semitones': -4.5, 'drive': 2.2, 'rms_db': -16},     # "I throw you my gauntlet."
    'fistKill': {'semitones': -4.5, 'drive': 2.0, 'rms_db': -17},      # "I am quite soFISTicated." (smug, not shouted)
    'rebuttal': {'semitones': -4.5, 'drive': 2.0, 'rms_db': -17},      # "I present my rebuttal."
}

# the close helm's room removal and dynamics (see close_helm)
CLOSE = {
    't60': 0.85,          # seconds: how long the recording room rings (estimated from each take, clamped to this)
    'strength': 1.6,      # how hard its late reverberation is subtracted
    'floor_db': -18,      # never more than this taken out of any band
    'expand_below_db': -30, 'expand_ratio': 2.5,
    'compress_db': -18, 'compress_ratio': 3.0,
}


# --- reading and writing ------------------------------------------------------------------------------------------

def load_any(path):
    """Any audio file macOS can read -> mono float32 at 48 kHz (decoded by afconvert). path:start-end takes a window."""
    window = None
    match = re.fullmatch(r'(.+):(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)', path)
    if match and not os.path.exists(path):
        path, window = match.group(1), (float(match.group(2)), float(match.group(3)))
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = os.path.join(tmp, 'take.wav')
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', f'LEI16@{SR}', '-c', '1', path, wav_path], check=True, capture_output=True)
        with wave.open(wav_path) as w:
            data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
    if window:
        data = data[int(window[0] * SR):int(window[1] * SR)]
    return data


def save_wav(path, x, sr=SR, channels=1):
    data = np.clip(x, -1, 1)
    pcm = (data * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def encode_m4a(wav_path, m4a_path):
    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '96000', wav_path, m4a_path], check=True, capture_output=True)


# --- signal tools -------------------------------------------------------------------------------------------------

def db(value):
    return 20 * np.log10(max(float(value), 1e-9))


def resample(x, length):
    """Band-limited resample to `length` samples (FFT)."""
    spectrum = np.fft.rfft(x)
    out = np.zeros(length // 2 + 1, dtype=complex)
    keep = min(len(spectrum), len(out))
    out[:keep] = spectrum[:keep]
    return np.fft.irfft(out, length) * (length / len(x))


def stretch(x, factor, n_fft=2048, hop=256):
    """Phase vocoder with identity phase locking: output is `factor` times as long, same pitch."""
    window = np.hanning(n_fft + 1)[:-1]
    pad = np.concatenate([np.zeros(n_fft), x, np.zeros(n_fft)])
    hop_a = hop / factor
    frames = int((len(pad) - n_fft) / hop_a)
    bins = np.arange(n_fft // 2 + 1)
    omega = 2 * np.pi * bins / n_fft
    out = np.zeros(frames * hop + n_fft)
    norm = np.zeros_like(out)
    last_phase = None
    synth_phase = None
    last_pos = 0
    for t in range(frames):
        pos = int(round(t * hop_a))
        frame = np.fft.rfft(pad[pos:pos + n_fft] * window)
        magnitude = np.abs(frame)
        phase = np.angle(frame)
        if last_phase is None:
            synth_phase = phase.copy()
        else:
            advance = omega * (pos - last_pos)
            delta = phase - last_phase - advance
            delta = (delta + np.pi) % (2 * np.pi) - np.pi
            true_freq = omega + delta / max(1, pos - last_pos)
            peak_phase = synth_phase + true_freq * hop
            # lock every bin to the phase of the spectral peak it belongs to (keeps the voice from going "phasey")
            peaks = np.where((magnitude[1:-1] > magnitude[:-2]) & (magnitude[1:-1] >= magnitude[2:]))[0] + 1
            if len(peaks):
                edges = (peaks[1:] + peaks[:-1]) / 2
                owner = peaks[np.searchsorted(edges, bins)]
                synth_phase = peak_phase[owner] + (phase - phase[owner])
            else:
                synth_phase = peak_phase
        last_phase = phase
        last_pos = pos
        chunk = np.fft.irfft(magnitude * np.exp(1j * synth_phase), n_fft) * window
        out[t * hop:t * hop + n_fft] += chunk
        norm[t * hop:t * hop + n_fft] += window ** 2
    out /= np.maximum(norm, 1e-3)
    start = int(n_fft * factor)
    return out[start:start + int(len(x) * factor)]


def pitch_shift(x, semitones):
    """Deeper (negative) or higher, same length: stretch in time, then resample back."""
    if abs(semitones) < 1e-3:
        return x
    ratio = 2 ** (semitones / 12)
    return resample(stretch(x, ratio), len(x))


def equalize(x, sr, bands):
    """Zero-phase EQ: multiply the spectrum by each band's magnitude curve (padded so nothing wraps around)."""
    pad = int(0.25 * sr)
    padded = np.concatenate([x, np.zeros(pad)])
    freqs = np.fft.rfftfreq(len(padded), 1 / sr)
    response = np.ones_like(freqs)
    safe = np.maximum(freqs, 1)
    for band in bands:
        kind = band[0]
        if kind == 'highpass':
            response /= np.sqrt(1 + (band[1] / safe) ** 4)
        elif kind == 'lowpass':
            response /= np.sqrt(1 + (safe / band[1]) ** 4)
        elif kind == 'bell':
            _, centre, gain_db, octaves = band
            response *= 10 ** (gain_db * np.exp(-(np.log2(safe / centre) ** 2) / (2 * (octaves / 2) ** 2)) / 20)
    return np.fft.irfft(np.fft.rfft(padded) * response, len(padded))[:len(x)]


def helm(x, sr, reflections=((1.1, 0.3), (2.3, 0.18), (3.7, 0.08))):
    """The inside of a great helm: two reflections a millimetre or two of air away, and its boxy resonance."""
    out = x.copy()
    for delay_ms, gain in reflections:
        d = int(sr * delay_ms / 1000)
        out[d:] += gain * x[:-d]
    return out


def saturate(x, drive, wet=0.55):
    peak = np.max(np.abs(x)) or 1
    unit = x / peak
    grit = np.tanh(drive * unit) / np.tanh(drive)
    return peak * ((1 - wet) * unit + wet * grit)


def frame_levels(x, sr, hop_ms=10):
    hop = int(sr * hop_ms / 1000)
    frames = len(x) // hop
    return np.array([np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2) + 1e-12) for i in range(frames)]), hop


def trim(x, sr, pre=0.03, post=0.14):
    levels, hop = frame_levels(x, sr)
    if not len(levels):
        return x
    threshold = max(np.max(levels) * 10 ** (-40 / 20), 10 ** (-55 / 20))
    active = np.where(levels > threshold)[0]
    if not len(active):
        return x
    start = max(0, active[0] * hop - int(pre * sr))
    end = min(len(x), (active[-1] + 1) * hop + int(post * sr))
    out = x[start:end].copy()
    fade_in = min(len(out), int(0.005 * sr))
    fade_out = min(len(out), int(0.04 * sr))
    out[:fade_in] *= np.linspace(0, 1, fade_in)
    out[-fade_out:] *= np.linspace(1, 0, fade_out)
    return out


def loudness(x, sr, rms_db):
    """Match the loudness of the voiced part, then keep the peaks under -1 dBFS with a soft knee."""
    levels, _ = frame_levels(x, sr)
    voiced = levels[levels > np.max(levels) * 0.1]
    current = np.sqrt(np.mean(voiced ** 2)) if len(voiced) else np.sqrt(np.mean(x ** 2))
    out = x * (10 ** (rms_db / 20) / max(current, 1e-9))
    ceiling = 10 ** (-1 / 20)
    over = np.abs(out) > ceiling * 0.8
    knee = ceiling * 0.8
    out[over] = np.sign(out[over]) * (knee + (ceiling - knee) * np.tanh((np.abs(out[over]) - knee) / (ceiling - knee)))
    return out


def knight(x, sr, preset):
    """The whole chain for one take."""
    x = x - np.mean(x)
    x = trim(x, sr)
    x = pitch_shift(x, preset['semitones'])
    x = equalize(x, sr, [
        ('highpass', 75),
        ('bell', 170, 3.0, 1.2),      # chest
        ('bell', 1250, 4.5, 0.9),     # the helm's boxy ring
        ('bell', 3200, -3.0, 1.5),    # take the bite off, it is behind steel
        ('lowpass', 7200),
    ])
    x = helm(x, sr)
    x = saturate(x, preset['drive'])
    return loudness(x, sr, preset['rms_db'])


# --- the close helm -------------------------------------------------------------------------------------------------

def declip(x, near=2.5 / 32768):
    """Rebuild peaks the recorder flattened: every run of three or more samples stuck at the take's own extreme gets
    a cubic through it, from the samples and slopes either side (only ever raising the flat top, never cutting it)."""
    out = x.copy()
    n = len(x)
    for sign, extreme in ((1, np.max(x)), (-1, np.min(x))):
        stuck = (x >= extreme - near) if sign > 0 else (x <= extreme + near)
        i = 0
        while i < n:
            if not stuck[i]:
                i += 1
                continue
            j = i
            while j + 1 < n and stuck[j + 1]:
                j += 1
            if j - i >= 2 and i >= 2 and j + 2 < n:
                a, b = i - 1, j + 1
                length = b - a
                m0, m1 = (x[a] - x[a - 1]) * length, (x[b + 1] - x[b]) * length
                t = np.arange(1, length) / length
                curve = ((2 * t ** 3 - 3 * t ** 2 + 1) * x[a] + (t ** 3 - 2 * t ** 2 + t) * m0
                         + (-2 * t ** 3 + 3 * t ** 2) * x[b] + (t ** 3 - t ** 2) * m1)
                out[a + 1:b] = np.where(sign * curve > sign * x[a + 1:b], curve, x[a + 1:b])
            i = j + 1
    return out


def room_decay(x, sr):
    """How long the room rings (T60, seconds), from how fast the take dies away after its last loud moment."""
    levels, hop = frame_levels(x, sr)
    if len(levels) < 10:
        return None
    levels_db = 20 * np.log10(levels)
    top = levels_db.max()
    last = np.where(levels_db > top - 20)[0][-1]
    tail = levels_db[last:]
    index = np.where((tail < top - 20) & (tail > top - 50))[0]
    if len(index) < 4:
        return None
    slope = np.polyfit(index * hop / sr, tail[index], 1)[0]
    return 60 / -slope if slope < 0 else None


def stft(x, n_fft=1024, hop=256):
    window = np.sqrt(np.hanning(n_fft + 1)[:-1])
    pad = np.concatenate([np.zeros(n_fft), x, np.zeros(n_fft)])
    frames = 1 + (len(pad) - n_fft) // hop
    spec = np.array([np.fft.rfft(pad[t * hop:t * hop + n_fft] * window) for t in range(frames)])
    return spec, window, len(pad)


def istft(spec, window, length, n, n_fft=1024, hop=256):
    out = np.zeros(length)
    norm = np.zeros(length)
    for t in range(len(spec)):
        out[t * hop:t * hop + n_fft] += np.fft.irfft(spec[t], n_fft) * window
        norm[t * hop:t * hop + n_fft] += window ** 2
    out /= np.maximum(norm, 1e-6)
    return out[n_fft:n_fft + n]


def dereverb(x, sr, t60=0.85, strength=1.35, floor_db=-16, early_ms=45, n_fft=1024, hop=256):
    """Take the recording room out (late-reverberation suppression, after Lebart et al.): the reverberant power in each
    band is predicted from the take `early_ms` earlier, decayed at the room's rate, and subtracted down to a floor;
    the gain is smoothed across neighbouring bands and closes more slowly than it opens, against watery artefacts."""
    spec, window, length = stft(x, n_fft, hop)
    power = np.abs(spec) ** 2
    smooth = power.copy()
    for t in range(1, len(smooth)):
        smooth[t] = 0.5 * smooth[t - 1] + 0.5 * power[t]
    lag = max(1, int(round(early_ms / 1000 * sr / hop)))
    decay = np.exp(-2 * (3 * np.log(10) / t60) * lag * hop / sr)
    late = np.zeros_like(smooth)
    late[lag:] = decay * smooth[:-lag]
    floor = 10 ** (floor_db / 10)
    gain = np.sqrt(np.maximum(1 - strength * late / np.maximum(smooth, 1e-14), floor))
    gain = (np.roll(gain, 1, axis=1) + 2 * gain + np.roll(gain, -1, axis=1)) / 4
    for t in range(1, len(gain)):
        closing = gain[t] < gain[t - 1]
        gain[t] = np.where(closing, 0.6 * gain[t - 1] + 0.4 * gain[t], gain[t])
    return istft(spec * gain, window, length, len(x), n_fft, hop)


def dynamics(x, sr, below_db=None, ratio=2.5, above_db=None, squeeze=3.0, attack_ms=3, release_ms=70, step_ms=2.5):
    """A downward expander (whatever falls `below_db` under the take's loudest moment sinks further) and/or a
    compressor (whatever rises above `above_db` under it is held back `squeeze` to one), on a smoothed level."""
    hop = max(1, int(sr * step_ms / 1000))
    frames = len(x) // hop + 1
    level_db = np.array([10 * np.log10(np.mean(x[i * hop:(i + 1) * hop] ** 2) + 1e-12) if len(x[i * hop:(i + 1) * hop]) else -120
                         for i in range(frames)])
    top = level_db.max()
    target = np.zeros(frames)
    if below_db is not None:
        target += np.minimum(0, (level_db - (top + below_db)) * (ratio - 1))
    if above_db is not None:
        target -= np.maximum(0, (level_db - (top + above_db)) * (1 - 1 / squeeze))
    attack = 1 - np.exp(-step_ms / attack_ms)
    release = 1 - np.exp(-step_ms / release_ms)
    gain_db = np.zeros(frames)
    g = target[0]
    for i in range(frames):
        g += (target[i] - g) * (attack if target[i] < g else release)
        gain_db[i] = g
    gain = np.interp(np.arange(len(x)), np.arange(frames) * hop + hop / 2, 10 ** (gain_db / 20))
    return x * gain


def close_helm(x, sr, preset, report=None):
    """The standard chain: the take's room out first, then the knight. See the module notes for each step."""
    x = x - np.mean(x)
    x = declip(x)
    x = trim(x, sr, pre=0.02, post=0.3)
    measured = room_decay(x, sr)
    t60 = min(CLOSE['t60'], measured) if measured else CLOSE['t60']
    x = dereverb(x, sr, t60=max(0.3, t60), strength=CLOSE['strength'], floor_db=CLOSE['floor_db'])
    x = dynamics(x, sr, below_db=preset.get('expand_below_db', CLOSE['expand_below_db']), ratio=CLOSE['expand_ratio'])
    x = trim(x, sr, pre=0.02, post=0.12)
    x = pitch_shift(x, preset['semitones'])
    x = equalize(x, sr, [
        ('highpass', 80),
        ('bell', 150, 3.5, 1.2),      # proximity: he is right here
        ('bell', 260, 1.5, 1.0),      # chest
        ('bell', 620, -1.5, 1.2),     # the recording room's boxiness
        ('bell', 1250, 1.0, 0.9),     # the helm's ring: a hint of it, no more
        ('bell', 2700, 1.5, 1.2),     # clarity: every word lands
        ('bell', 4500, -1.5, 1.5),    # a little of the bite taken off: behind steel, every consonant still there
        ('lowpass', 8000),
    ])
    # the helm's own reflections, well under the voice: the dry performance leads
    x = helm(x, sr, reflections=((1.1, 0.1), (2.3, 0.05), (3.7, 0.02)))
    x = dynamics(x, sr, above_db=CLOSE['compress_db'], squeeze=CLOSE['compress_ratio'], attack_ms=4, release_ms=80)
    x = saturate(x, preset['drive'])
    x = dynamics(x, sr, below_db=-36, ratio=2.0)
    if report is not None:
        report['t60'] = round(t60, 2)
    return loudness(x, sr, preset['rms_db'])


def with_echo(x, sr, echo='nearby'):
    """Roughly what the game adds: 'nearby' (another knight a few metres off: a touch of the stone courtyard, no echo, as
    the game plays it now), or the old 'wall'/'shout' repeats that darken, with the courtyard behind them."""
    if echo == 'nearby':
        rng = np.random.default_rng(3)
        t = np.arange(int(sr * 1.6)) / sr
        impulse = rng.standard_normal(len(t)) * (1 - t / 1.6) ** 2.4 * 0.02
        out = np.concatenate([x, np.zeros(int(sr * 1.2))])
        room = np.fft.irfft(np.fft.rfft(out, len(out) + len(impulse)) * np.fft.rfft(impulse, len(out) + len(impulse)))[:len(out)]
        mix = out + room * 0.15          # about a quarter of the old courtyard (0.5 below)
        return mix / max(1, np.max(np.abs(mix)) / 0.89)
    delay, feedback = {'wall': (0.2, 0.26), 'shout': (0.32, 0.46)}[echo]
    tail = int(sr * 2.5)
    out = np.concatenate([x, np.zeros(tail)])
    repeat = out.copy()
    d = int(sr * delay)
    wet = np.zeros_like(out)
    for k in range(1, 8):
        repeat = equalize(np.concatenate([np.zeros(d), repeat[:-d]]), sr, [('lowpass', 2600 - k * 150), ('highpass', 240)]) * (feedback if k > 1 else 0.8 * 0.5)
        wet += repeat
    rng = np.random.default_rng(3)
    t = np.arange(int(sr * 1.6)) / sr
    impulse = rng.standard_normal(len(t)) * (1 - t / 1.6) ** 2.4 * 0.02
    room = np.fft.irfft(np.fft.rfft(out, len(out) + len(impulse)) * np.fft.rfft(impulse, len(out) + len(impulse)))[:len(out)]
    mix = out + wet + room * 0.5
    return mix / max(1, np.max(np.abs(mix)) / 0.89)


# --- takes, lines and the manifest --------------------------------------------------------------------------------

def file_stem(line):
    """A line's file name: magicDefeat -> magic-defeat (magic-defeat-1.m4a, ...)."""
    return re.sub(r'[A-Z]', lambda m: '-' + m.group(0).lower(), line)


FILE_LINES = {file_stem(line): line for line in LINES}


def line_for(path):
    stem = os.path.splitext(os.path.basename(path))[0].lower()
    # the whole name without its number: magic-defeat-1, magicdefeat 2, kill_taunt-3 ...
    name = re.sub(r'[^a-z]', '', re.sub(r'[\s_-]*\d+$', '', stem))
    for line in LINES:
        if name == line.lower():
            return line
    word = re.split(r'[^a-z]+', stem)[0]
    if word in LINES:
        return word
    return ALIASES.get(word)


def write_manifest():
    path = os.path.join(OUT_DIR, 'manifest.json')
    existing = json.load(open(path)) if os.path.exists(path) else {}
    # lines this tool does not make (imported already processed) and the contact effects stay as they are
    kept = {line: takes for line, takes in existing.get('lines', {}).items() if line not in LINES}
    lines = {}
    for name in sorted(os.listdir(OUT_DIR)):
        match = re.fullmatch(r'([a-z-]+?)-(\d+)\.m4a', name)
        if not match or match.group(1) not in FILE_LINES:
            continue
        stem, number = match.group(1), int(match.group(2))
        meta_path = os.path.join(OUT_DIR, f'{stem}-{number}.json')
        meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
        lines.setdefault(FILE_LINES[stem], []).append({'file': f'{stem}-{number}', **meta})
    lines = {line: sorted(takes, key=lambda t: t['file']) for line, takes in lines.items()}
    manifest = {'version': 1, 'lines': {**kept, **lines}}
    if 'effects' in existing:
        manifest['effects'] = existing['effects']
    with open(path, 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    return manifest


def clear_line(line):
    for name in os.listdir(OUT_DIR):
        if re.fullmatch(rf'{file_stem(line)}-\d+\.(m4a|wav|json)', name):
            os.remove(os.path.join(OUT_DIR, name))


def publish(line, takes, preview_dir=None, echo='nearby', notes=None):
    """Write processed takes of one line (replacing its earlier ones)."""
    clear_line(line)
    for number, x in enumerate(takes, start=1):
        base = os.path.join(OUT_DIR, f'{file_stem(line)}-{number}')
        full_wav = base + '.full.wav'
        save_wav(full_wav, x)
        encode_m4a(full_wav, base + '.m4a')
        # a small fallback for a browser that cannot decode AAC
        save_wav(base + '.wav', resample(x, int(len(x) * 22050 / SR)), sr=22050)
        os.remove(full_wav)
        with open(base + '.json', 'w') as f:
            json.dump({'seconds': round(len(x) / SR, 2)}, f)
        if preview_dir:
            save_wav(os.path.join(preview_dir, f'{file_stem(line)}-{number}-nearby.wav'), with_echo(x, SR, echo))
        note = notes[number - 1] if notes else {}
        extra = f", room T60 {note['t60']}s taken out" if 't60' in note else ''
        print(f'  {file_stem(line)}-{number}: {len(x) / SR:.2f}s, peak {db(np.max(np.abs(x))):.1f} dBFS{extra}')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('inputs', nargs='*', help='takes, or folders of takes')
    parser.add_argument('--semitones', type=float, help='pitch change (default per line, about -2.5)')
    parser.add_argument('--drive', type=float, help='distortion drive (default per line, about 2.2)')
    parser.add_argument('--line', choices=LINES, help='the line every input is a take of (instead of reading file names)')
    parser.add_argument('--profile', choices=('close', 'classic'), default='close', help='the chain (default: close helm)')
    parser.add_argument('--preview', action='store_true', help='also write versions with the in-game echo to artifacts/voice-preview')
    args = parser.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    preview_dir = os.path.join(ROOT, 'artifacts', 'voice-preview') if args.preview else None
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)

    files = []
    for item in args.inputs:
        if os.path.isdir(item.split(':')[0]) and ':' not in item:
            files += [os.path.join(item, name) for name in sorted(os.listdir(item)) if not name.startswith('.')]
        else:
            files.append(item)
    by_line = {}
    for path in files:
        line = args.line or line_for(path)
        if not line:
            print(f'skipped {os.path.basename(path)}: name it after a line ({", ".join(LINES)})', file=sys.stderr)
            continue
        by_line.setdefault(line, []).append(path)
    for line, paths in by_line.items():
        preset = dict(PRESETS[line])
        if args.semitones is not None:
            preset['semitones'] = args.semitones
        if args.drive is not None:
            preset['drive'] = args.drive
        print(f'{line}: {len(paths)} take(s), {args.profile} chain')
        notes = [{} for _ in paths]
        if args.profile == 'close':
            takes = [close_helm(load_any(path), SR, preset, report=note) for path, note in zip(paths, notes)]
        else:
            takes = [knight(load_any(path), SR, preset) for path in paths]
        publish(line, takes, preview_dir=preview_dir, notes=notes)

    manifest = write_manifest()
    print('manifest:', ', '.join(f'{line} ({len(takes)})' for line, takes in manifest['lines'].items()) or 'no lines yet')


if __name__ == '__main__':
    main()
