// Renders the Siege Blades machine-selection pictures from the game's own machine renderers, so each card shows the
// model players actually drive: SO-FIST-ICATION, Bi-Bye-llista and Fight-and-Flight, each built by its real
// renderer from a fresh simulation state, under the menu's Castleward light, from the same three-quarter view and
// framing, on a transparent background with a soft contact shadow.
//
// Re-run after a machine's model changes:
//   npm start                                   (or any server for this checkout)
//   PLAYWRIGHT_MODULE=… node scripts/render-siege-machine-cards.mjs [http://127.0.0.1:3251] [client/assets/ui/siege-machines]
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const base = process.argv[2] ?? 'http://127.0.0.1:3251';
const outDir = path.resolve(process.argv[3] ?? new URL('../client/assets/ui/siege-machines', import.meta.url).pathname);
const WIDTH = 960, HEIGHT = 600;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${base}/?debug`);
  await page.waitForFunction(() => document.querySelector('#loading-veil')?.classList.contains('done'), null, { timeout: 60000 });
  const shots = await page.evaluate(async ({ WIDTH, HEIGHT }) => {
    const THREE = await import('three');
    const wire = await import('/shared/sim/wire.mjs');
    const { createSoFistication } = await import('/shared/sim/soFistication.mjs');
    const { createBiByeLlista } = await import('/shared/sim/biByeLlista.mjs');
    const { createFightFlight } = await import('/shared/sim/fightFlight.mjs');
    const { SoFisticationRenderer } = await import('/client/worlds/SoFisticationRenderer.mjs');
    const { BiByeLlistaRenderer } = await import('/client/worlds/BiByeLlistaRenderer.mjs');
    const { FightFlightRenderer } = await import('/client/worlds/FightFlightRenderer.mjs');
    const { CASTLEWARD_LIGHTING: light } = await import('/client/worlds/CastlewardRenderer.mjs');

    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(WIDTH, HEIGHT, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // a soft contact shadow under each machine, drawn once
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 256;
    const g = shadowCanvas.getContext('2d'), grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(0.6, 'rgba(0,0,0,0.22)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas); shadowTexture.colorSpace = THREE.SRGBColorSpace;

    const machines = {
      'so-fist-ication': (scene) => [new SoFisticationRenderer(scene), wire.serializeSoFistication(createSoFistication({ x: 0, y: 0, z: 0, heading: 0 })), 0],
      'bi-bye-llista': (scene) => [new BiByeLlistaRenderer(scene), wire.serializeBiByeLlista(createBiByeLlista({ x: 0, y: 0, z: 0, heading: 0 }), 0), 0],
      'fight-and-flight': (scene) => [new FightFlightRenderer(scene), wire.serializeFightFlight(createFightFlight({ x: 0, y: 0, z: 0, heading: 0 })), 0.35],
    };
    const out = {};
    for (const [id, make] of Object.entries(machines)) {
      const scene = new THREE.Scene();
      // (the menu's Castleward light, opened up a little: a showroom picture, not a dusk scene)
      scene.add(new THREE.HemisphereLight(light.hemisphere.skyColor, light.hemisphere.groundColor, light.hemisphere.intensity * 1.7));
      const sun = new THREE.DirectionalLight(light.sun.color, light.sun.intensity * 1.35);
      sun.position.set(-6, 10, -7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 40 }); sun.shadow.bias = -0.0004;
      scene.add(sun, sun.target);
      const fill = new THREE.DirectionalLight(0xc9d6ff, 0.55 * light.sun.intensity); fill.position.set(7, 4, 3); scene.add(fill);
      const rim = new THREE.DirectionalLight(0xffe2b8, 0.45 * light.sun.intensity); rim.position.set(4, 6, 9); scene.add(rim);
      const [machine, state, lift] = make(scene);
      state.y = lift; if (state.position) state.position.y = lift;
      const step = () => (id === 'fight-and-flight' ? machine.update(1, state, [], 1, [], null, null) : machine.update(1, state, []));
      // the renderers load their models asynchronously: wait until the group holds geometry
      for (let i = 0; i < 120; i += 1) {
        step(); await new Promise((r) => setTimeout(r, 100));
        const box = new THREE.Box3().setFromObject(machine.group ?? scene);
        if (!box.isEmpty() && (machine.model || machine.root || i > 40)) break;
      }
      for (let i = 0; i < 6; i += 1) { step(); await new Promise((r) => setTimeout(r, 50)); }
      const group = machine.group ?? scene;
      group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      // (bounds of what is drawn: the renderers keep hidden parts, such as a thrown fist or wreckage, about them)
      group.updateMatrixWorld(true);
      const box = new THREE.Box3();
      group.traverse((o) => {
        if (!o.isMesh) return;
        for (let p = o; p; p = p.parent) if (!p.visible) return;
        box.expandByObject(o, true);
      });
      const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
      const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
      contact.rotation.x = -Math.PI / 2; contact.position.set(centre.x, 0.005, centre.z); contact.scale.set(size.x * 1.35, size.z * 1.25, 1);
      scene.add(contact);
      // the same three-quarter view for each: from the front-left, a little above
      const camera = new THREE.PerspectiveCamera(24, WIDTH / HEIGHT, 0.1, 200);
      const direction = new THREE.Vector3(-0.78, 0.46, -1).normalize();
      // framed on the silhouette, not the box (a box's corners stand well off a machine in three-quarter view): its
      // visible vertices, sampled, projected; the view moved and turned until they fill 86 % of the frame, centred
      const points = [], v = new THREE.Vector3();
      group.traverse((o) => {
        if (!o.isMesh) return;
        for (let p = o; p; p = p.parent) if (!p.visible) return;
        const position = o.geometry.attributes.position, stride = Math.max(1, Math.floor(position.count / 400));
        for (let k = 0; k < position.count; k += stride) points.push(v.fromBufferAttribute(position, k).applyMatrix4(o.matrixWorld).clone());
      });
      const target = centre.clone();
      let distance = size.length() * 2.2;
      for (let pass = 0; pass < 8; pass += 1) {
        camera.position.copy(target).addScaledVector(direction, distance); camera.lookAt(target); camera.updateMatrixWorld(true);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const p of points) { const q = p.clone().project(camera); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
        // recentre: the silhouette's middle back to the middle of the frame, along the camera's own right and up
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance, halfW = halfH * camera.aspect;
        target.addScaledVector(right, ((x0 + x1) / 2) * halfW).addScaledVector(up, ((y0 + y1) / 2) * halfH);
        // and scale: the larger of its width and height to 86 % of the frame
        distance *= Math.max((x1 - x0) / 2, (y1 - y0) / 2) / 0.86;
      }
      camera.position.copy(target).addScaledVector(direction, distance); camera.lookAt(target);
      renderer.render(scene, camera);
      out[id] = { webp: canvas.toDataURL('image/webp', 0.86), size: size.toArray().map((v) => +v.toFixed(2)) };
      machine.dispose?.();
    }
    renderer.dispose();
    return out;
  }, { WIDTH, HEIGHT });
  await mkdir(outDir, { recursive: true });
  for (const [id, { webp, size }] of Object.entries(shots)) {
    const bytes = Buffer.from(webp.split(',')[1], 'base64');
    await writeFile(path.join(outDir, `${id}.webp`), bytes);
    console.log(`${id}.webp ${(bytes.length / 1024).toFixed(0)} KB  model ${size.join(' × ')} m`);
  }
} finally {
  await browser.close();
}
