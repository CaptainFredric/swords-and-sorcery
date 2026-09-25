import shutil, time, json, sys
from gradio_client import Client, handle_file
tag, img, res_, steps = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
c = Client("tencent/Hunyuan3D-2mv", verbose=False)
t = time.time()
res = c.predict(caption=None, image=None, mv_image_front=handle_file(img), mv_image_back=None, mv_image_left=None, mv_image_right=None,
                steps=steps, guidance_scale=5.0, seed=1234, octree_resolution=res_, check_box_rembg=True, num_chunks=8000,
                randomize_seed=False, api_name="/shape_generation")
p = res[0] if isinstance(res[0], str) else res[0].get("value")
out = f"artifacts/concept3d/gen/{tag}.glb"
shutil.copy(p, out); print("SAVED", out, round(time.time() - t, 1), "s faces", res[2].get("number_of_faces"))
