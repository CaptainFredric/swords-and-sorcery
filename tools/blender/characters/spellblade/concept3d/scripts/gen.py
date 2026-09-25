import shutil, time, json, sys
from gradio_client import Client, handle_file
tag, front, back, left, right = sys.argv[1:6]
res_ = int(sys.argv[6]) if len(sys.argv) > 6 else 256
mv = "artifacts/concept3d/mv/"
f = lambda n: handle_file(mv + n) if n != "-" else None
c = Client("tencent/Hunyuan3D-2mv", verbose=False)
t = time.time()
res = c.predict(caption=None, image=None, mv_image_front=f(front), mv_image_back=f(back), mv_image_left=f(left), mv_image_right=f(right),
                steps=int(sys.argv[7]) if len(sys.argv) > 7 else 5, guidance_scale=5.0, seed=1234, octree_resolution=res_, check_box_rembg=True, num_chunks=8000,
                randomize_seed=False, api_name="/shape_generation")
print("seconds", round(time.time() - t, 1))
p = res[0] if isinstance(res[0], str) else res[0].get("value")
out = f"artifacts/concept3d/gen/{tag}{p[p.rfind('.'):]}"
shutil.copy(p, out); print("SAVED", out)
print("STATS", json.dumps(res[2])[:400])
