#!/usr/bin/env python3
"""Turn raw voice takes into the Spellblade's voice: a hardened battlemage heard through his helm.

    python3 tools/audio/knight_voice.py ~/Desktop/knight-takes            # every take in a folder
    python3 tools/audio/knight_voice.py effort-1.m4a hurt-2.m4a --semitones -2

Name each take after its line (effort, hurt, death, sorcery, dash, victory; a number or anything after a dash or
space is ignored, and a few aliases work: grunt, pain, die, spell, breath, laugh...). Any format macOS can read works
(Voice Memos .m4a, QuickTime .m4a/.mov, .wav, .aiff, .mp3).

Each take is trimmed, pitched down (a phase vocoder: same length, deeper and bigger), given a chest and a helm (EQ
and the tight reflections inside a great helm), gently distorted, loudness-matched, and written to
client/assets/voice as AAC (.m4a) with a small WAV fallback; manifest.json lists what exists. The echo off the castle
walls is added live in the game (it follows where you stand), so --preview also writes a version with that echo to
listen to here.

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

LINES = ('effort', 'hurt', 'death', 'sorcery', 'dash', 'victory')
ALIASES = {
    'grunt': 'effort', 'swing': 'effort', 'attack': 'effort', 'heave': 'effort', 'strike': 'effort',
    'pain': 'hurt', 'hit': 'hurt', 'ow': 'hurt', 'ouch': 'hurt',
    'die': 'death', 'dying': 'death', 'dead': 'death',
    'spell': 'sorcery', 'cast': 'sorcery', 'fireball': 'sorcery',
    'breath': 'dash', 'huff': 'dash', 'exhale': 'dash',
    'win': 'victory', 'laugh': 'victory', 'cheer': 'victory', 'triumph': 'victory',
}

# per line: how far down, how hard the grit, how loud
PRESETS = {
    'effort': {'semitones': -2.5, 'drive': 2.4, 'rms_db': -15},
    'hurt': {'semitones': -2.5, 'drive': 2.2, 'rms_db': -15},
    'death': {'semitones': -3.0, 'drive': 2.0, 'rms_db': -15},
    'sorcery': {'semitones': -2.0, 'drive': 3.0, 'rms_db': -13},
    'dash': {'semitones': -2.5, 'drive': 1.6, 'rms_db': -19},
    'victory': {'semitones': -2.5, 'drive': 2.2, 'rms_db': -15},
}


# --- reading and writing ------------------------------------------------------------------------------------------

def load_any(path):
    """Any audio file macOS can read -> mono float32 at 48 kHz (decoded by afconvert)."""
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = os.path.join(tmp, 'take.wav')
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', f'LEI16@{SR}', '-c', '1', path, wav_path], check=True, capture_output=True)
        with wave.open(wav_path) as w:
            data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
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


def helm(x, sr):
    """The inside of a great helm: two reflections a millimetre or two of air away, and its boxy resonance."""
    out = x.copy()
    for delay_ms, gain in ((1.1, 0.3), (2.3, 0.18), (3.7, 0.08)):
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


def with_echo(x, sr, echo='wall'):
    """Roughly what the game adds: repeats off the walls that darken, and a stone courtyard behind them."""
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

def line_for(path):
    stem = os.path.splitext(os.path.basename(path))[0].lower()
    word = re.split(r'[^a-z]+', stem)[0]
    if word in LINES:
        return word
    return ALIASES.get(word)


def write_manifest():
    lines = {}
    for name in sorted(os.listdir(OUT_DIR)):
        match = re.fullmatch(r'([a-z]+)-(\d+)\.m4a', name)
        if not match:
            continue
        line, number = match.group(1), int(match.group(2))
        meta_path = os.path.join(OUT_DIR, f'{line}-{number}.json')
        meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
        lines.setdefault(line, []).append({'file': f'{line}-{number}', **meta})
    manifest = {'version': 1, 'lines': {line: sorted(takes, key=lambda t: t['file']) for line, takes in lines.items()}}
    with open(os.path.join(OUT_DIR, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    return manifest


def clear_line(line):
    for name in os.listdir(OUT_DIR):
        if re.fullmatch(rf'{line}-\d+\.(m4a|wav|json)', name):
            os.remove(os.path.join(OUT_DIR, name))


def publish(line, takes, preview_dir=None, echo='wall'):
    """Write processed takes of one line (replacing its earlier ones)."""
    clear_line(line)
    for number, x in enumerate(takes, start=1):
        base = os.path.join(OUT_DIR, f'{line}-{number}')
        full_wav = base + '.full.wav'
        save_wav(full_wav, x)
        encode_m4a(full_wav, base + '.m4a')
        # a small fallback for a browser that cannot decode AAC
        save_wav(base + '.wav', resample(x, int(len(x) * 22050 / SR)), sr=22050)
        os.remove(full_wav)
        with open(base + '.json', 'w') as f:
            json.dump({'seconds': round(len(x) / SR, 2)}, f)
        if preview_dir:
            save_wav(os.path.join(preview_dir, f'{line}-{number}-with-echo.wav'), with_echo(x, SR, echo))
        print(f'  {line}-{number}: {len(x) / SR:.2f}s, peak {db(np.max(np.abs(x))):.1f} dBFS')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('inputs', nargs='*', help='takes, or folders of takes')
    parser.add_argument('--semitones', type=float, help='pitch change (default per line, about -2.5)')
    parser.add_argument('--drive', type=float, help='distortion drive (default per line, about 2.2)')
    parser.add_argument('--preview', action='store_true', help='also write versions with the in-game echo to artifacts/voice-preview')
    args = parser.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    preview_dir = os.path.join(ROOT, 'artifacts', 'voice-preview') if args.preview else None
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)

    files = []
    for item in args.inputs:
        if os.path.isdir(item):
            files += [os.path.join(item, name) for name in sorted(os.listdir(item)) if not name.startswith('.')]
        else:
            files.append(item)
    by_line = {}
    for path in files:
        line = line_for(path)
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
        print(f'{line}: {len(paths)} take(s)')
        takes = [knight(load_any(path), SR, preset) for path in paths]
        publish(line, takes, preview_dir=preview_dir, echo='shout' if line in ('sorcery', 'victory') else 'wall')

    manifest = write_manifest()
    print('manifest:', ', '.join(f'{line} ({len(takes)})' for line, takes in manifest['lines'].items()) or 'no lines yet')


if __name__ == '__main__':
    main()
