#!/usr/bin/env python3
"""Install exact Argon handoff binaries from a local ZIP; never substitute fallback art."""
from pathlib import Path
import hashlib
import sys
import zipfile

FILES = {
    "so-fist-ication-elevating-ram.glb": ("client/assets/props/so-fist-ication/so-fist-ication-elevating-ram.glb", 6502480, "bab81d9861a80e8339bd7bb479e5f41770c6acdbec22d36eb94e262d986b0efd"),
    "so-fist-ication-detached-fist.glb": ("client/assets/props/so-fist-ication/so-fist-ication-detached-fist.glb", 214728, "5e7802eacdb8ff252a0f575a3ba002287a51e73fccbd6e2a22f89a1c957597e4"),
    "SoFist-elevating-ram-source.blend": ("assets/source/so-fist-ication/SoFist-elevating-ram-source.blend", 4006788, "f8481439b5429ed0aa00c0b53c8dbc869a7c0781e7e92160f7bd221aab5c2d9e"),
}
def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 scripts/install-so-fist-argon-assets.py /path/to/SO_FIST_ICATION_Elevating_Ram_Handoff_Bundle.zip")
    root = Path(__file__).resolve().parent.parent
    with zipfile.ZipFile(sys.argv[1]) as bundle:
        checked = []
        for source, (destination, length, digest) in FILES.items():
            data = bundle.read(source)
            if len(data) != length or hashlib.sha256(data).hexdigest() != digest:
                sys.exit(f"ERROR: {source} does not match the required asset contract; no files written")
            checked.append((root / destination, data))
    for destination, data in checked:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        print(f"Verified and installed {destination.relative_to(root)}")
    print("Run: node --test server/tests/so-fist-asset-contract.test.mjs")
    print("Then git add the three paths, commit, and push THIS correction branch; do not merge without acceptance.")
if __name__ == "__main__":
    main()
