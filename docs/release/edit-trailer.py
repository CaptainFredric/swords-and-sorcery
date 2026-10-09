"""Reproduce the trailer from the four original browser recordings.

Usage: python3 docs/release/edit-trailer.py --ffmpeg /path/to/ffmpeg
       --takes /path/to/takes --output /path/to/output
The original clips are packaged separately; no footage is generated here.
"""
import argparse
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--ffmpeg', required=True)
parser.add_argument('--takes', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--font', default='/System/Library/Fonts/Supplemental/Georgia.ttf')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
font = Path(args.font)
if not font.is_file():
    raise SystemExit('Supply an installed readable serif font with --font')

shots = [
    ('yard-take.webm', 0.1, 3.4, 'WELCOME TO CASTLEWARD'),
    ('melee-contact.webm', 0.0, 6.4, 'MEET THE BLADE'),
    ('fireball-contact.webm', 0.0, 5.5, 'ANSWER WITH SORCERY'),
    ('vortex-take.webm', 0.1, 8.2, 'BLAZING VORTEX'),
    ('yard-take.webm', 0.7, 3.3, 'SWORDS & SORCERY'),
]

def run(*arguments):
    subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', *map(str, arguments)], check=True)

for index, (source, start, duration, title) in enumerate(shots):
    if index == 4:
        text = (f"drawbox=x=0:y=0:w=iw:h=ih:color=0x17171b@0.70:t=fill,"
                f"drawtext=fontfile='{font}':text='{title}':fontsize=56:fontcolor=0xecc97f:x=(w-tw)/2:y=260,"
                f"drawtext=fontfile='{font}':text='Playable pre alpha · Free in your browser':fontsize=28:fontcolor=0xeadcb6:x=(w-tw)/2:y=350,"
                f"drawtext=fontfile='{font}':text='captainfredric.github.io/swords-and-sorcery':fontsize=24:fontcolor=0xeadcb6:x=(w-tw)/2:y=410")
    else:
        label = 'Live menu scene' if index == 0 else 'Actual gameplay · Practice Yard'
        text = (f"drawbox=x=28:y=590:w=620:h=104:color=0x17171b@0.75:t=fill,"
                f"drawtext=fontfile='{font}':text='{title}':fontsize=32:fontcolor=0xecc97f:x=48:y=610,"
                f"drawtext=fontfile='{font}':text='{label}':fontsize=19:fontcolor=0xeadcb6:x=48:y=654")
    run('-ss', start, '-i', args.takes / source, '-t', duration,
        '-vf', f'fps=30,scale=1280:720,setsar=1,{text},fade=t=in:st=0:d=0.12,fade=t=out:st={duration-0.15}:d=0.15',
        '-af', f'aresample=48000,afade=t=in:st=0:d=0.08,afade=t=out:st={duration-0.18}:d=0.18',
        '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', args.output / f'part-{index}.mp4')
concat = args.output / 'concat.txt'
concat.write_text(''.join(f"file 'part-{i}.mp4'\n" for i in range(len(shots))))
run('-f', 'concat', '-safe', '0', '-i', concat, '-c', 'copy', '-movflags', '+faststart', args.output / 'castleward-trailer.mp4')
(args.output / 'edit.json').write_text(json.dumps({'shots': shots, 'seconds': sum(s[2] for s in shots),
    'footage': 'Production renderer with actual game audio. Menu scene and local authoritative Practice Yard.',
    'omission': 'DOM HUD is outside the canvas recording. No AI footage or simulated combat poses.'}, indent=2) + '\n')
