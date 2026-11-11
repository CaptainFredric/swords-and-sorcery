#!/usr/bin/env python3
"""Count the video frames really in a MediaRecorder WebM (no ffprobe needed): frames, span, mean fps, worst gap (ms).

    python3 scripts/webm-frames.py a.webm b.webm
"""
import sys


def vint(b, p, keep):
    first = b[p]
    n = 1
    while n <= 8 and not (first & (0x80 >> (n - 1))):
        n += 1
    v = first if keep else first & (0xFF >> n)
    for i in range(1, n):
        v = v * 256 + b[p + i]
    return v, n


def frames_of(path):
    b = open(path, 'rb').read()
    times, last = [], [0]

    def walk(p, end):
        while p < end - 2:
            ident, n = vint(b, p, True)
            p += n
            size, m = vint(b, p, False)
            p += m
            data_end = end if size == (1 << (7 * m)) - 1 else min(end, p + size)
            if ident in (0x18538067, 0x1F43B675, 0xA0):   # Segment, Cluster, BlockGroup
                walk(p, data_end)
            elif ident == 0xE7:                     # Cluster timecode
                last[0] = int.from_bytes(b[p:data_end], 'big')
            elif ident in (0xA3, 0xA1):             # SimpleBlock, Block
                _, t = vint(b, p, False)
                times.append(last[0] + int.from_bytes(b[p + t:p + t + 2], 'big', signed=True))
            p = data_end

    walk(0, len(b))
    return times


for name in sys.argv[1:]:
    t = frames_of(name)
    if len(t) < 2:
        print(name, 'no frames found')
        continue
    span = (max(t) - min(t)) / 1000
    worst = max(y - x for x, y in zip(t, t[1:]))
    print(f"{name.split('/')[-1]}: {len(t)} frames over {span:.2f}s = {len(t) / span:.1f} fps, worst gap {worst} ms")
