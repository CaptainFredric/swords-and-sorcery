#!/usr/bin/env python3
"""Generate an audition comparison reel of raw vs processed audio for the 2026-11-23 Spellblade voice batch."""

import json
import math
import os
import subprocess
import tempfile
import wave
import numpy as np

SAMPLE_RATE = 22050

LINES = [
    "whyIsThisFire",
    "amIDreaming",
    "doNotStandInThat",
    "goodBurialSpot",
    "groundAngel",
    "markMyTerritory",
    "addToMyTally",
    "hitYouOverThere",
    "slashedAcrossVitalSpots",
    "roundAndRoundYouGo",
    "stayAwayForNow",
    "quiteATrip",
    "thisIsADisaster",
    "hillToDieOn",
    "silentTreatment",
    "waitIStabbedYouV1",
    "waitIStabbedYouV2",
    "crashSiteLookNice",
    "whirlLikeAWind",
    "notDeadYet",
    "dieOverThereOrHere",
    "noLongerMoving",
    "stopPretendingToWin",
    "constitutionReversal",
    "stubbedToe",
    "laughToScream"
]

def decode_audio_to_pcm(path, sample_rate=SAMPLE_RATE):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        cmd = [
            "/usr/bin/afconvert",
            "-f", "WAVE",
            "-d", "LEI16@22050",
            "-c", "1",
            path,
            tmp_path
        ]
        subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        with wave.open(tmp_path, "rb") as w:
            frames = w.getnframes()
            data = w.readframes(frames)
            audio = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
        return audio
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

def calc_levels(audio):
    if len(audio) == 0:
        return -99.0, -99.0
    peak = float(np.max(np.abs(audio)))
    peak_db = 20.0 * math.log10(max(peak, 1e-6))
    rms = float(np.sqrt(np.mean(audio ** 2)))
    rms_db = 20.0 * math.log10(max(rms, 1e-6))
    return rms_db, peak_db

def main():
    with open("tools/audio/voice-sources.json") as f:
        sources = json.load(f)
    with open("client/assets/voice/manifest.json") as f:
        manifest = json.load(f)

    # Get line declaration info via node helper
    proc = subprocess.run([
        "node", "-e",
        "import { voiceLine } from './client/game/sound/voiceLines.mjs';\n"
        "const ids = " + json.dumps(LINES) + ";\n"
        "const out = {};\n"
        "for (const id of ids) out[id] = voiceLine(id);\n"
        "console.log(JSON.stringify(out));\n"
    ], capture_output=True, text=True, check=True)
    declarations = json.loads(proc.stdout)

    reel_segments = []
    silence_short = np.zeros(int(SAMPLE_RATE * 0.35), dtype=np.float32)
    silence_gap = np.zeros(int(SAMPLE_RATE * 0.85), dtype=np.float32)

    stats = []

    print(f"Generating audition comparison reel for {len(LINES)} lines...")

    for idx, line_id in enumerate(LINES, start=1):
        decl = declarations[line_id]
        src_entries = sources[line_id]
        proc_manifest = manifest["lines"][line_id]

        print(f"[{idx:02d}/26] Processing {line_id}...")

        line_stat = {
            "num": idx,
            "id": line_id,
            "text": decl.get("text", ""),
            "title": decl.get("credits", {}).get("title", ""),
            "triggers": list(decl.get("triggers", {}).keys()),
            "priority": decl.get("priority", "normal"),
            "rarity": decl.get("rarity", 1.0),
            "cooldown": decl.get("cooldown", 0),
            "voice": decl.get("voice", {}),
            "takes": []
        }

        for take_idx, src_spec in enumerate(src_entries):
            # Parse window if present
            if ":" in src_spec and not os.path.exists(os.path.join("artifacts/voice-sources", src_spec)):
                filename, window = src_spec.split(":")
                t_start, t_end = map(float, window.split("-"))
            else:
                filename = src_spec
                t_start, t_end = None, None

            master_path = os.path.join("artifacts/voice-sources", filename)
            if not os.path.exists(master_path):
                master_path = os.path.join("tools/audio/inbox", filename)

            raw_audio = decode_audio_to_pcm(master_path)
            if t_start is not None and t_end is not None:
                i_start = int(t_start * SAMPLE_RATE)
                i_end = int(t_end * SAMPLE_RATE)
                raw_audio = raw_audio[i_start:i_end]

            raw_rms, raw_peak = calc_levels(raw_audio)
            raw_dur = len(raw_audio) / SAMPLE_RATE

            proc_file = proc_manifest[take_idx]["file"]
            proc_path = os.path.join("client/assets/voice", f"{proc_file}.wav")
            with wave.open(proc_path, "rb") as pw:
                p_frames = pw.getnframes()
                p_data = pw.readframes(p_frames)
                proc_audio = np.frombuffer(p_data, dtype=np.int16).astype(np.float32) / 32768.0

            proc_rms, proc_peak = calc_levels(proc_audio)
            proc_dur = len(proc_audio) / SAMPLE_RATE

            take_stat = {
                "file": proc_file,
                "raw_dur": round(raw_dur, 2),
                "raw_rms": round(raw_rms, 1),
                "raw_peak": round(raw_peak, 1),
                "proc_dur": round(proc_dur, 2),
                "proc_rms": round(proc_rms, 1),
                "proc_peak": round(proc_peak, 1),
            }
            line_stat["takes"].append(take_stat)

            # Append to reel: Raw -> silence -> Processed -> gap
            reel_segments.extend([raw_audio, silence_short, proc_audio, silence_gap])

        stats.append(line_stat)

    # Concatenate entire reel
    full_audio = np.concatenate(reel_segments)
    peak_val = np.max(np.abs(full_audio))
    if peak_val > 0.98:
        full_audio = full_audio * (0.98 / peak_val)

    pcm_16 = np.clip(full_audio * 32767.0, -32768.0, 32767.0).astype(np.int16)

    os.makedirs("artifacts", exist_ok=True)
    out_wav = "artifacts/audition-reel-20261123.wav"
    with wave.open(out_wav, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm_16.tobytes())

    total_dur = len(full_audio) / SAMPLE_RATE
    print(f"Audition reel written to {out_wav} (duration: {total_dur:.1f}s)")

    # Save stats to json for reporting
    with open("artifacts/voice-stats-20261123.json", "w") as f:
        json.dump(stats, f, indent=2)

    print("Audition stats written to artifacts/voice-stats-20261123.json")

if __name__ == "__main__":
    main()
