#!/usr/bin/env python3
"""Turn raw voice takes into the Spellblade's voice: a hardened battlemage heard through his helm.

This is the processing itself. The front door is `npm run voice` (tools/audio/voice-ingest.mjs): it reads each line's
declaration (client/game/sound/voiceLines.mjs), finds its recording in tools/audio/inbox/, and calls this with the
line's own settings. Used directly:

    python3 tools/audio/knight_voice.py --line lateLine ~/Desktop/GoingToBeLate.mp3
    python3 tools/audio/knight_voice.py --line sorcery master.wav:0.38-1.93 master.wav:3.15-4.71   # windows of a recording
    python3 tools/audio/knight_voice.py --line effort take-1.m4a take-2.m4a --drive 2.4 --rms-db -16

--line is the line's id as the game names it (lateLine: its files are late-line-1.m4a ...); without it, each file's own
name is read as its line (late-line-2.m4a, lateLine 2.wav). Any format macOS can read works (Voice Memos .m4a,
QuickTime .m4a/.mov, .wav, .aiff, .mp3). A take may be a window of a longer file: path:start-end in seconds.

The clear helm (the standard chain, --profile clear; see tools/audio/RECORDING.md for the reasons):
  1. declip     rebuild peaks the recorder flattened (a curve through each flat top, from the slopes either side)
  2. dereverb   take out the room it was recorded in: its late reverberation, predicted from the take's own decay,
                is subtracted band by band, gently (a hard hand leaves a watery warble)
  3. expand     a downward expander: what is left of the room between and after the words sinks away (the soft
                consonants kept; it opens ahead of a word, so a word after a pause keeps its start)
  4. pitch      two semitones down (a phase vocoder: same length), the voice's formants put back where they were, so
                every vowel stays the word it was
  5. EQ         a little chest, the mud taken out, a clear presence lift for the consonants
  6. helm       the faintest reflections of a great helm
  7. compress   a shout is dense, not spiky
  8. grit       a touch of saturation
  9. loudness   matched per line, peaks under -1 dBFS
Nothing of a castle is baked in: the game adds a touch of the courtyard itself, and only for other knights (your own
voice is heard close, from inside the helm). --profile close is the earlier, deeper chain (4.5 semitones down, the
formants going down with it: bigger, but players could not make out the words); --profile classic the one before it.

A line may also declare edits (--edits): small repairs in its recording's own seconds, made before and inside the
chain (a pause cut, a clearer word spliced in, a buried word lifted, a flat ending raised). See "edits" below.

A line subtitled a beat at a time (voiceLines.mjs `beats`) gives --beats: for each take, the seconds in its recording
where each later beat begins. The take's own clock is carried through every cut and trim, and where each beat falls in
the finished take is written beside it (its .json: "beats", the first at 0), for the subtitles to follow.

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

# how a take is processed unless its line says otherwise (voiceLines.mjs `voice`: the grit, the level, and an eased
# expander for a line with a soft tail)
DEFAULT_PRESET = {'drive': 2.0, 'rms_db': -17}

# how far down each chain takes the voice (semitones): the clear helm two, with the formants kept; the close helm
# took it 4.5 down, formants and all
PROFILE_SEMITONES = {'clear': -2.0, 'close': -4.5, 'classic': -4.5}

# the clear helm: the room taken out gently (a hard hand leaves a watery warble), the soft consonants kept, less grit,
# and a presence lift for the words (see clear_helm). Measured against the raw takes (STOI, how much of the speech's
# envelope survives): the close helm kept 0.70 of it on average, the clear helm 0.86.
CLEAR = {
    't60': 0.85, 'strength': 1.0, 'floor_db': -12,
    'expand_below_db': -42, 'expand_ratio': 2.0,
    'compress_db': -18, 'compress_ratio': 3.0,
    'grit': 0.3, 'drive_scale': 0.8,
    'tail_below_db': -46,
    'gate_open_db': -30, 'gate_hold_ms': 120,
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


def pitch_shift(x, semitones, formants=0.0, bend=None):
    """Deeper (negative) or higher, same length: stretch in time, then resample back. formants: how much of the
    voice's own spectral envelope to put back afterwards (1: all of it, so the vowels stay where they were). bend: a
    further change for each sample (semitones; an edit's rise), made in the same pass."""
    if bend is not None and np.any(np.abs(bend) > 1e-3):
        shifted = bend_shift(x, 2 ** ((semitones + bend) / 12))
    elif abs(semitones) < 1e-3:
        return x
    else:
        shifted = resample(stretch(x, 2 ** (semitones / 12)), len(x))
    return keep_formants(x, shifted, formants) if formants > 0 else shifted


def bend_shift(x, ratio, n_fft=2048, hop=256):
    """A pitch change that varies sample by sample (ratio: one for each), same length: the take stretched by the ratio
    where it is (a phase vocoder whose analysis keeps pace with it), then read back at that ratio."""
    n = len(x)
    pad = np.concatenate([np.zeros(n_fft), x, np.zeros(n_fft)])
    rates = np.concatenate([np.full(n_fft, ratio[0]), ratio, np.full(n_fft, ratio[-1])])
    # where each padded sample lands in the stretched take, and back
    landing = np.concatenate([[0.0], np.cumsum(rates)[:-1]])
    window = np.hanning(n_fft + 1)[:-1]
    bins = np.arange(n_fft // 2 + 1)
    omega = 2 * np.pi * bins / n_fft
    frames = int((landing[-1] - n_fft) / hop)
    out = np.zeros(frames * hop + n_fft)
    norm = np.zeros_like(out)
    last_phase = synth_phase = None
    last_pos = 0
    for t in range(frames):
        centre = np.interp(t * hop + n_fft / 2, landing, np.arange(len(pad)))
        pos = int(np.clip(round(centre - n_fft / 2), 0, len(pad) - n_fft))
        frame = np.fft.rfft(pad[pos:pos + n_fft] * window)
        magnitude = np.abs(frame)
        phase = np.angle(frame)
        if last_phase is None:
            synth_phase = phase.copy()
        else:
            delta = phase - last_phase - omega * (pos - last_pos)
            delta = (delta + np.pi) % (2 * np.pi) - np.pi
            true_freq = omega + delta / max(1, pos - last_pos)
            peak_phase = synth_phase + true_freq * hop
            peaks = np.where((magnitude[1:-1] > magnitude[:-2]) & (magnitude[1:-1] >= magnitude[2:]))[0] + 1
            if len(peaks):
                edges = (peaks[1:] + peaks[:-1]) / 2
                owner = peaks[np.searchsorted(edges, bins)]
                synth_phase = peak_phase[owner] + (phase - phase[owner])
            else:
                synth_phase = peak_phase
        last_phase = phase
        last_pos = pos
        out[t * hop:t * hop + n_fft] += np.fft.irfft(magnitude * np.exp(1j * synth_phase), n_fft) * window
        norm[t * hop:t * hop + n_fft] += window ** 2
    out /= np.maximum(norm, 1e-3)
    return read_cubic(out, landing[n_fft:n_fft + n])


def read_cubic(y, positions):
    """y read at fractional positions (Catmull-Rom)."""
    i = np.clip(np.floor(positions).astype(int), 0, len(y) - 1)
    f = positions - np.floor(positions)
    padded = np.concatenate([[y[0]], y, [y[-1], y[-1]]])
    p0, p1, p2, p3 = padded[i], padded[i + 1], padded[i + 2], padded[i + 3]
    return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)))


def spectral_envelope(magnitude, lifter):
    """Each frame's spectral envelope (its formants, without the harmonics): the low quefrencies of its cepstrum."""
    cepstrum = np.fft.irfft(np.log(np.maximum(magnitude, 1e-9)), axis=1)
    cepstrum[:, lifter:cepstrum.shape[1] - lifter + 1] = 0
    return np.exp(np.fft.rfft(cepstrum, axis=1).real)


def keep_formants(original, shifted, amount=1.0, n_fft=2048, hop=256, lifter_ms=1.6, limit_db=12):
    """Put the original's spectral envelope back on a pitch-shifted take (at most limit_db either way), smoothed over
    three frames so it cannot flutter: the pitch moves, the vowels do not."""
    X, window, length = stft(original, n_fft, hop)
    Y, _, _ = stft(shifted, n_fft, hop)
    count = min(len(X), len(Y))
    X, Y = X[:count], Y[:count]
    lifter = int(SR * lifter_ms / 1000)
    ratio = spectral_envelope(np.abs(X), lifter) / spectral_envelope(np.abs(Y), lifter)
    limit = 10 ** (limit_db / 20)
    ratio = np.log(np.clip(ratio, 1 / limit, limit) ** amount)
    ratio[1:-1] = (ratio[:-2] + 2 * ratio[1:-1] + ratio[2:]) / 4
    return istft(Y * np.exp(ratio), window, length, len(shifted), n_fft, hop)


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


def trim_range(x, sr, pre=0.03, post=0.14):
    """Where the take's sound begins and ends (samples), with `pre` and `post` seconds kept either side."""
    levels, hop = frame_levels(x, sr)
    if not len(levels):
        return 0, len(x)
    threshold = max(np.max(levels) * 10 ** (-40 / 20), 10 ** (-55 / 20))
    active = np.where(levels > threshold)[0]
    if not len(active):
        return 0, len(x)
    return max(0, active[0] * hop - int(pre * sr)), min(len(x), (active[-1] + 1) * hop + int(post * sr))


def trimmed(x, sr, track, pre, post, timeline=None):
    """trim(), with a take's edit curves (edit_take) and its clock (the recording's own seconds at every sample) cut
    to match."""
    start, end = trim_range(x, sr, pre, post)
    curves = {name: curve[start:end] for name, curve in track.items()} if track else None
    if timeline is None:
        return trim(x, sr, pre, post), curves
    return trim(x, sr, pre, post), curves, timeline[start:end]


def beats_in_take(timeline, sr, sources):
    """Where beats that begin at `sources` (the recording's own seconds) fall in the finished take: [0, ...] seconds."""
    return [0.0] + [round(float(np.searchsorted(timeline, source)) / sr, 3) for source in sources]


def trim(x, sr, pre=0.03, post=0.14):
    start, end = trim_range(x, sr, pre, post)
    out = x[start:end].copy()
    if not len(out):
        return x
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


# --- edits: small repairs to a take, in its own recording's seconds (voiceLines.mjs `voice.edits`) ------------------
#   { cut: [a, b] }                    that stretch taken out (a pause, dead air), the two sides crossfaded
#   { splice: [a, b], from: [c, d] }   that stretch replaced by c-d of the same recording (a clearer word), set against
#                                      the end of the stretch, silence before it
#   { lift: [a, b], db }               that stretch this much louder in the finished take, eased in and out
#   { rise: [a, b], semitones }        the pitch rising this far across that stretch (a flat ending made a question),
#                                      eased, then back over 60 ms; made inside the chain's own pitch change
#   { glide: [a, b], semitones }       the pitch starting this far off at a (eased in just before it) and gliding back
#                                      to its own by b: a word's onset lifted into a swoop (or, negative, dropped)
# Each may name its take (take: 2); the first otherwise.

LIFT_RAMP = 0.03    # seconds a lift eases in and out over
GLIDE_IN = 0.03     # seconds a glide eases in over, before its start
SPLICE_FADE = 0.008
CUT_FADE = 0.012


def edit_take(x, sr, edits, timeline=None):
    """A take's edits made: its cuts and splices at once; its rises and lifts as curves (semitones and dB for every
    sample) that ride along with the take, cut as it is trimmed, for the chain to apply where they belong. timeline:
    the take's clock, cut with it (returned too, when given)."""
    t = np.arange(len(x)) / sr
    bend = np.zeros(len(x))
    lift = np.zeros(len(x))
    for edit in edits:
        if 'rise' in edit:
            a, b = edit['rise']
            s = np.clip((t - a) / max(b - a, 1e-3), 0, 1)
            back = np.clip((t - b) / 0.06, 0, 1)
            bend += edit['semitones'] * s * s * (3 - 2 * s) * (1 - back)
        if 'glide' in edit:
            a, b = edit['glide']
            s = np.clip((t - a) / max(b - a, 1e-3), 0, 1)
            into = np.clip((t - (a - GLIDE_IN)) / GLIDE_IN, 0, 1)
            bend += edit['semitones'] * (1 - s * s * (3 - 2 * s)) * into * into * (3 - 2 * into)
        if 'lift' in edit:
            a, b = edit['lift']
            inside = np.clip(np.minimum(t - (a - LIFT_RAMP), (b + LIFT_RAMP) - t) / LIFT_RAMP, 0, 1)
            lift += edit['db'] * (0.5 - 0.5 * np.cos(np.pi * inside))
    # (every splice's word taken from the recording as it was, before anything is moved)
    pieces = {i: x[int(e['from'][0] * sr):int(e['from'][1] * sr)].copy() for i, e in enumerate(edits) if 'splice' in e}
    out = x.copy()
    # the latest first, so each edit's times are still the recording's own
    span = lambda edit: edit.get('cut') or edit.get('splice') or [-1]
    for i, edit in sorted(enumerate(edits), key=lambda item: -span(item[1])[0]):
        if 'splice' in edit:
            out = splice(out, sr, edit['splice'], pieces[i])
        elif 'cut' in edit:
            a, b = (int(round(v * sr)) for v in edit['cut'])
            out = cut(out, sr, a, b)
            bend = np.concatenate([bend[:a], bend[b:]])
            lift = np.concatenate([lift[:a], lift[b:]])
            if timeline is not None:
                timeline = np.concatenate([timeline[:a], timeline[b:]])
    if timeline is not None:
        return out, {'bend': bend, 'lift': lift}, timeline
    return out, {'bend': bend, 'lift': lift}


def cut(x, sr, a, b):
    """x without samples a..b, the two sides crossfaded (equal power: what is cut is pause, room or rustle)."""
    n = min(int(CUT_FADE * sr), a, len(x) - b)
    angle = np.linspace(0, np.pi / 2, n)
    joint = x[a:a + n] * np.cos(angle) + x[b:b + n] * np.sin(angle)
    return np.concatenate([x[:a], joint, x[b + n:]])


def splice(x, sr, span, piece):
    """x with span (seconds) replaced by piece, set against the span's end (silence before it), every edge faded."""
    a, b = int(round(span[0] * sr)), int(round(span[1] * sr))
    n = int(SPLICE_FADE * sr)
    piece = piece[:b - a].copy()
    piece[:n] *= np.sin(np.linspace(0, np.pi / 2, n)) ** 2
    piece[-n:] *= np.cos(np.linspace(0, np.pi / 2, n)) ** 2
    out = x.copy()
    out[a - n:a] *= np.cos(np.linspace(0, np.pi / 2, n)) ** 2
    out[b:b + n] *= np.sin(np.linspace(0, np.pi / 2, n)) ** 2
    out[a:b] = 0
    out[b - len(piece):b] = piece
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


def dynamics(x, sr, below_db=None, ratio=2.5, above_db=None, squeeze=3.0, attack_ms=3, release_ms=70, step_ms=2.5,
             lookahead_ms=12):
    """A downward expander (whatever falls `below_db` under the take's loudest moment sinks further) and/or a
    compressor (whatever rises above `above_db` under it is held back `squeeze` to one), on a smoothed level.
    Each moves as its job needs: the compressor clamps at once (attack) and lets go slowly (release); the expander opens
    at once, a little ahead of the sound (lookahead), and closes slowly behind it. (It once opened at the release's
    pace: a word after a pause lost its first fifth of a second, 5-7 dB down: "One:", "Two:", "There.")"""
    hop = max(1, int(sr * step_ms / 1000))
    frames = len(x) // hop + 1
    level_db = np.array([10 * np.log10(np.mean(x[i * hop:(i + 1) * hop] ** 2) + 1e-12) if len(x[i * hop:(i + 1) * hop]) else -120
                         for i in range(frames)])
    top = level_db.max()
    fast = 1 - np.exp(-step_ms / attack_ms)
    slow = 1 - np.exp(-step_ms / release_ms)

    def follow(target, quick_when_rising):
        out = np.zeros(frames)
        g = target[0]
        for i in range(frames):
            rising = target[i] > g
            g += (target[i] - g) * (fast if rising == quick_when_rising else slow)
            out[i] = g
        return out

    gain_db = np.zeros(frames)
    if below_db is not None:
        target = np.minimum(0, (level_db - (top + below_db)) * (ratio - 1))
        ahead = max(0, int(round(lookahead_ms / step_ms)))
        if ahead:
            padded = np.concatenate([target, np.full(ahead, target[-1])])
            target = np.max(np.stack([padded[k:k + frames] for k in range(ahead + 1)]), axis=0)
        gain_db += follow(target, quick_when_rising=True)
    if above_db is not None:
        target = -np.maximum(0, (level_db - (top + above_db)) * (1 - 1 / squeeze))
        gain_db += follow(target, quick_when_rising=False)
    gain = np.interp(np.arange(len(x)), np.arange(frames) * hop + hop / 2, 10 ** (gain_db / 20))
    return x * gain


def gate_pauses(x, sr, open_db=-30, hold_ms=120, ratio=2.5, step_ms=5, attack_ms=3, release_ms=40):
    """Silence the pauses, not the consonants: whatever lies more than `hold_ms` from anything within `open_db` of the
    take's loudest moment (lead-ins, gaps between phrases, the room after the last word) is expanded down as the
    close helm's expander did, `ratio` to one below `open_db`; everything near the words is left alone, so a soft
    "s", "f" or the release of a final "t" survives."""
    hop = max(1, int(sr * step_ms / 1000))
    frames = len(x) // hop + 1
    level_db = np.array([10 * np.log10(np.mean(x[i * hop:(i + 1) * hop] ** 2) + 1e-12) if len(x[i * hop:(i + 1) * hop]) else -120
                         for i in range(frames)])
    top = level_db.max()
    loud = level_db > top + open_db
    hold = max(1, int(hold_ms / step_ms))
    near = np.convolve(loud.astype(float), np.ones(2 * hold + 1), mode='same') > 0
    target = np.where(near, 0.0, np.minimum(0, (level_db - (top + open_db)) * (ratio - 1)))
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


def clear_helm(x, sr, preset, report=None, track=None, timeline=None, beats=None):
    """The standard chain: the take's room out (gently), then the knight, every word left clear. See the module notes.
    track: the take's edit curves (edit_take), applied where they belong. beats: where its later beats begin in the
    recording (seconds; timeline: the take's clock, the recording's seconds at each sample), placed in the finished
    take (report['beats'])."""
    x = x - np.mean(x)
    x = declip(x)
    if beats:
        timeline = np.arange(len(x)) / sr if timeline is None else timeline
        x, track, timeline = trimmed(x, sr, track, pre=0.02, post=0.3, timeline=timeline)
    else:
        x, track = trimmed(x, sr, track, pre=0.02, post=0.3)
    measured = room_decay(x, sr)
    t60 = min(CLEAR['t60'], measured) if measured else CLEAR['t60']
    x = dereverb(x, sr, t60=max(0.3, t60), strength=CLEAR['strength'], floor_db=CLEAR['floor_db'])
    # the pauses silenced (the room between phrases and around the words), the soft consonants near the words kept
    x = gate_pauses(x, sr, open_db=CLEAR['gate_open_db'], hold_ms=CLEAR['gate_hold_ms'])
    x = dynamics(x, sr, below_db=min(preset.get('expand_below_db', CLEAR['expand_below_db']), CLEAR['expand_below_db']),
                 ratio=CLEAR['expand_ratio'])
    if beats:
        x, track, timeline = trimmed(x, sr, track, pre=0.02, post=0.12, timeline=timeline)
        if report is not None:
            report['beats'] = beats_in_take(timeline, sr, beats)
    else:
        x, track = trimmed(x, sr, track, pre=0.02, post=0.12)
    # (a line that must carry weight goes further down, and lets its formants follow part of the way: a bigger chest
    # and helm behind the same words; `formants` 1 keeps them exactly where they were. An edit's rise rides on it.)
    x = pitch_shift(x, preset['semitones'], formants=preset.get('formants', 1.0), bend=track['bend'] if track else None)
    chest = preset.get('chest', 0.0)
    x = equalize(x, sr, [
        ('highpass', 85),
        ('bell', 150, 2.0 + chest, 1.2),        # proximity, without the boom that buries words
        ('bell', 260, 1.0 + 0.6 * chest, 1.0),  # chest
        ('bell', 420, -1.5, 1.0),     # the mud
        ('bell', 620, -1.0, 1.2),     # the recording room's boxiness
        ('bell', 1250, 0.5, 0.9),     # the helm's ring: a hint
        # presence: the consonants, every word lands (more of it when the formants went down: the words stay clear)
        ('bell', 2600, 3.0 + 3.0 * (1 - preset.get('formants', 1.0)), 1.4),
        ('bell', 5000, 1.0, 1.5),     # air
        ('lowpass', 11000),
    ])
    # the helm's own reflections, barely there: the dry performance leads
    x = helm(x, sr, reflections=((1.1, 0.06), (2.3, 0.03), (3.7, 0.01)))
    x = dynamics(x, sr, above_db=CLEAR['compress_db'], squeeze=CLEAR['compress_ratio'], attack_ms=4, release_ms=80)
    x = saturate(x, preset['drive'] * CLEAR['drive_scale'], wet=CLEAR['grit'])
    x = dynamics(x, sr, below_db=CLEAR['tail_below_db'], ratio=2.0)
    x = gate_pauses(x, sr, open_db=CLEAR['gate_open_db'], hold_ms=CLEAR['gate_hold_ms'])
    # (an edit's lift: a buried word brought up in the finished take, so it lands exactly as much louder as asked)
    if track is not None and np.any(track['lift']):
        x = x * 10 ** (track['lift'] / 20)
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


def line_of_stem(stem):
    """The line a file stem belongs to: magic-defeat -> magicDefeat."""
    return re.sub(r'-([a-z0-9])', lambda m: m.group(1).upper(), stem)


def line_for(path):
    """The line a take's own name says it is: late-line-2.m4a, lateLine 2.wav, late_line.mp3 -> lateLine."""
    stem = os.path.splitext(os.path.basename(path.split(':')[0]))[0]
    stem = re.sub(r'[\s_-]*\d+$', '', stem)
    words = [w for w in re.split(r'[^A-Za-z0-9]+', re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', stem)) if w]
    if not words:
        return None
    return words[0].lower() + ''.join(w[:1].upper() + w[1:].lower() for w in words[1:])


def write_manifest():
    """What is recorded, from the takes that are really there (every <line>-<n>.m4a in the voice folder)."""
    path = os.path.join(OUT_DIR, 'manifest.json')
    existing = json.load(open(path)) if os.path.exists(path) else {}
    lines = {}
    for name in sorted(os.listdir(OUT_DIR)):
        match = re.fullmatch(r'([a-z0-9-]+?)-(\d+)\.m4a', name)
        if not match:
            continue
        stem, number = match.group(1), int(match.group(2))
        meta_path = os.path.join(OUT_DIR, f'{stem}-{number}.json')
        meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
        lines.setdefault(line_of_stem(stem), []).append({'file': f'{stem}-{number}', **meta})
    lines = {line: sorted(takes, key=lambda t: int(t['file'].rsplit('-', 1)[1])) for line, takes in sorted(lines.items())}
    manifest = {'version': 1, 'lines': lines}
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
        note = notes[number - 1] if notes else {}
        with open(base + '.json', 'w') as f:
            json.dump({'seconds': round(len(x) / SR, 2), **({'beats': note['beats']} if note.get('beats') else {})}, f)
        if preview_dir:
            save_wav(os.path.join(preview_dir, f'{file_stem(line)}-{number}-nearby.wav'), with_echo(x, SR, echo))
        extra = f", room T60 {note['t60']}s taken out" if 't60' in note else ''
        extra += f", {note['edits']} edit(s)" if note.get('edits') else ''
        extra += f", beats at {', '.join(f'{b:.2f}' for b in note['beats'])}s" if note.get('beats') else ''
        print(f'  {file_stem(line)}-{number}: {len(x) / SR:.2f}s, peak {db(np.max(np.abs(x))):.1f} dBFS{extra}')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('inputs', nargs='*', help='takes, or folders of takes')
    parser.add_argument('--line', help='the line every input is a take of, as the game names it (lateLine); otherwise each file name is read')
    parser.add_argument('--semitones', type=float, help='pitch change (default: the profile\'s, -2 for the clear helm)')
    parser.add_argument('--drive', type=float, help='distortion drive (default 2.0)')
    parser.add_argument('--rms-db', type=float, help='the level the take is matched to (default -17 dB RMS)')
    parser.add_argument('--expand-below-db', type=float, help='ease the expander for a line with a soft tail (for example -42)')
    parser.add_argument('--formants', type=float, help='how much of the voice\'s own formants to keep after the pitch change (default 1: all; 0.6 lets them follow part of the way down: bigger)')
    parser.add_argument('--chest', type=float, help='extra chest and body, in dB (default 0)')
    parser.add_argument('--edits', help='the take\'s repairs, as JSON (see "edits" above): cuts, splices, lifts, rises')
    parser.add_argument('--beats', help='where each later beat of each take begins in its recording, as JSON: [[s, ...] or null, ...] one per take')
    parser.add_argument('--profile', choices=('clear', 'close', 'classic'), default='clear', help='the chain (default: clear helm)')
    parser.add_argument('--preview', action='store_true', help='also write versions with the in-game echo to artifacts/voice-preview')
    parser.add_argument('--manifest-only', action='store_true', help='only rewrite manifest.json from the takes that are there')
    args = parser.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    if args.line and not re.fullmatch(r'[a-z][A-Za-z0-9]*', args.line):
        parser.error(f'--line {args.line}: a line is named in camelCase (lateLine)')
    preview_dir = os.path.join(ROOT, 'artifacts', 'voice-preview') if args.preview else None
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)

    files = []
    for item in ([] if args.manifest_only else args.inputs):
        if os.path.isdir(item.split(':')[0]) and ':' not in item:
            files += [os.path.join(item, name) for name in sorted(os.listdir(item)) if not name.startswith('.')]
        else:
            files.append(item)
    by_line = {}
    for path in files:
        line = args.line or line_for(path)
        if not line:
            print(f'skipped {os.path.basename(path)}: name it after its line, or give --line', file=sys.stderr)
            continue
        by_line.setdefault(line, []).append(path)
    for line, paths in by_line.items():
        preset = {'semitones': PROFILE_SEMITONES[args.profile], **DEFAULT_PRESET}
        if args.semitones is not None:
            preset['semitones'] = args.semitones
        if args.drive is not None:
            preset['drive'] = args.drive
        if args.rms_db is not None:
            preset['rms_db'] = args.rms_db
        if args.expand_below_db is not None:
            preset['expand_below_db'] = args.expand_below_db
        if args.formants is not None:
            preset['formants'] = args.formants
        if args.chest is not None:
            preset['chest'] = args.chest
        print(f'{line}: {len(paths)} take(s), {args.profile} chain')
        notes = [{} for _ in paths]
        edits = json.loads(args.edits) if args.edits else []
        if edits and args.profile != 'clear':
            parser.error('edits are made in the clear chain only')
        beats = json.loads(args.beats) if args.beats else []
        if beats and args.profile != 'clear':
            parser.error('beats are placed in the clear chain only')
        if args.profile == 'clear':
            takes = []
            for number, (path, note) in enumerate(zip(paths, notes), start=1):
                x, track, timeline = load_any(path), None, None
                mine = [edit for edit in edits if edit.get('take', 1) == number]
                placed = beats[number - 1] if number - 1 < len(beats) else None
                if mine:
                    if placed:
                        x, track, timeline = edit_take(x, SR, mine, timeline=np.arange(len(x)) / SR)
                    else:
                        x, track = edit_take(x, SR, mine)
                    note['edits'] = len(mine)
                takes.append(clear_helm(x, SR, preset, report=note, track=track, timeline=timeline, beats=placed))
        elif args.profile == 'close':
            takes = [close_helm(load_any(path), SR, preset, report=note) for path, note in zip(paths, notes)]
        else:
            takes = [knight(load_any(path), SR, preset) for path in paths]
        publish(line, takes, preview_dir=preview_dir, notes=notes)

    manifest = write_manifest()
    print('manifest:', ', '.join(f'{line} ({len(takes)})' for line, takes in manifest['lines'].items()) or 'no lines yet')


if __name__ == '__main__':
    main()
