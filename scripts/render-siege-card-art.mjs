import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const playwrightPath = process.env.PLAYWRIGHT_MODULE || '/Users/erendiracisneros/plugins/live-web-observer/node_modules/playwright';
const { chromium } = require(playwrightPath);

const MACHINES = [
  {
    id: 'so-fist-ication',
    file: '/client/assets/props/so-fist-ication/so-fist-ication-elevating-ram.glb',
    yaw: Math.PI * 0.78,
    pitch: 0.32,
    distMul: 1.35,
    yOffset: 0.1,
  },
  {
    id: 'bi-bye-llista',
    file: '/client/assets/props/bibye-ballista/bi-bye-llista-v4.3.glb',
    yaw: -Math.PI * 0.28,
    pitch: 0.36,
    distMul: 1.3,
    yOffset: 0.05,
  },
  {
    id: 'fight-and-flight',
    file: '/client/assets/props/fight-and-flight/fight-and-flight-v30-sim19p5-dash.glb',
    yaw: -Math.PI * 0.25,
    pitch: 0.38,
    distMul: 1.35,
    yOffset: -0.1,
  },
];

async function main() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });

  console.log('Navigating to server at http://127.0.0.1:3001/?debug ...');
  await page.goto('http://127.0.0.1:3001/?debug', { waitUntil: 'domcontentloaded' });

  // Wait for Three.js and GLTFLoader to be usable in browser
  await page.waitForFunction(() => typeof window.__ssRuntime !== 'undefined' || typeof window.THREE !== 'undefined' || document.querySelector('#game-canvas'));

  const outDir = resolve('client/assets/props/siege-cards');
  await mkdir(outDir, { recursive: true });

  for (const config of MACHINES) {
    console.log(`Rendering card art for ${config.id}...`);
    const pngBase64 = await page.evaluate(async (cfg) => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');

      const width = 560;
      const height = 320;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;

      const scene = new THREE.Scene();

      // Atmospheric medieval studio lighting
      const ambient = new THREE.AmbientLight(0xdde3ea, 1.2);
      scene.add(ambient);

      const hemi = new THREE.HemisphereLight(0xfff1dc, 0x303848, 1.0);
      scene.add(hemi);

      // Key light - warm sunbeam
      const keyLight = new THREE.DirectionalLight(0xffeed6, 2.8);
      keyLight.position.set(5, 7, 6);
      scene.add(keyLight);

      // Rim light - cool blue metallic highlight from back-opposite
      const rimLight = new THREE.DirectionalLight(0x7ec6ff, 2.2);
      rimLight.position.set(-6, 4, -5);
      scene.add(rimLight);

      // Fill light - soft ground bounce
      const fillLight = new THREE.DirectionalLight(0xd99a64, 0.9);
      fillLight.position.set(0, -3, 3);
      scene.add(fillLight);

      const loader = new GLTFLoader();
      const gltf = await new Promise((resolve, reject) => {
        loader.load(cfg.file, resolve, undefined, reject);
      });

      const root = gltf.scene;
      scene.add(root);

      // Compute bounding box
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      // Center root at origin
      root.position.x -= center.x;
      root.position.y -= center.y - (cfg.yOffset || 0);
      root.position.z -= center.z;

      // Camera setup at 3/4 isometric perspective
      const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
      const dist = maxDim * (cfg.distMul || 1.3);
      const yaw = cfg.yaw;
      const pitch = cfg.pitch;

      camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * dist,
        Math.sin(pitch) * dist,
        Math.cos(yaw) * Math.cos(pitch) * dist
      );
      camera.lookAt(0, (cfg.yOffset || 0) * 0.5, 0);

      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      renderer.dispose();
      return dataUrl.split(',')[1];
    }, config);

    const filePath = resolve(outDir, `${config.id}.png`);
    await writeFile(filePath, Buffer.from(pngBase64, 'base64'));
    console.log(`Saved ${filePath}`);
  }

  await browser.close();
  console.log('Finished rendering card previews.');
}

main().catch((err) => {
  console.error('Error generating card previews:', err);
  process.exit(1);
});
