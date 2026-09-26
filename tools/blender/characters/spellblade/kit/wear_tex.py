"""wear_tex.py outdir : tileable 256x256 wear textures (sRGB JPEG, near-white multipliers).
wear_metal: soft mottling, fine grain, light scratches, dark chips.  wear_matte: soft mottling + weave grain."""
import sys, math
import numpy as np
from PIL import Image

out = sys.argv[1]
N = 256
rng = np.random.default_rng(7)


def blur_wrap(a, sigma):
    """gaussian blur with wrap-around (tileable) via FFT."""
    f = np.fft.fftfreq(N)
    g = np.exp(-2 * (math.pi * sigma) ** 2 * (f[:, None] ** 2 + f[None, :] ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def norm(a): a = a - a.mean(); return a / (np.abs(a).max() + 1e-9)


def l2s(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)


mott = 0.6 * norm(blur_wrap(rng.normal(size=(N, N)), 14)) + 0.4 * norm(blur_wrap(rng.normal(size=(N, N)), 5))
grain = norm(blur_wrap(rng.normal(size=(N, N)), 0.7))
metal = 1.0 + 0.10 * mott + 0.035 * grain
# scratches: thin light strokes with wrap-around
for _ in range(55):
    x, y = rng.uniform(0, N, 2); ang = rng.uniform(0, math.pi); L = rng.uniform(8, 34); s = rng.uniform(0.10, 0.24)
    for t in np.linspace(0, L, int(L * 2)):
        xi = int(x + math.cos(ang) * t) % N; yi = int(y + math.sin(ang) * t) % N
        metal[yi, xi] += s; metal[(yi + 1) % N, xi] += s * 0.35
# chips: small dark spots
for _ in range(40):
    x, y = rng.integers(0, N, 2); r = rng.uniform(0.8, 2.6); d = rng.uniform(0.10, 0.25)
    yy, xx = np.mgrid[-4:5, -4:5]
    m = np.exp(-(xx ** 2 + yy ** 2) / (2 * r * r))
    for dy in range(-4, 5):
        for dx in range(-4, 5):
            metal[(y + dy) % N, (x + dx) % N] -= d * m[dy + 4, dx + 4]
metal = 0.80 * metal / np.percentile(metal, 60)     # surface ~0.80 so scratches can go lighter
matte = 1.0 + 0.06 * mott + 0.035 * norm(blur_wrap(rng.normal(size=(N, N)), 0.5))
matte = 0.88 * matte / np.percentile(matte, 60)
for name, a in (("wear_metal", metal), ("wear_matte", matte)):
    img = (l2s(np.clip(a, 0, 1)) * 255).astype(np.uint8)
    Image.fromarray(np.stack([img] * 3, -1)).save(f"{out}/{name}.jpg", quality=88)
    print("WEAR", name, "mean(lin)", round(float(np.clip(a, 0, 1).mean()), 3), "min", round(float(a.min()), 3))
