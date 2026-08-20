import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.dirname(__dirname);
const outDir = path.join(root, 'docs', 'screenshots');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Load real sample images as base64
const sampleAnimePath = path.join(root, 'demo_samples', 'anime_art_sample.png');
const samplePortraitPath = path.join(root, 'demo_samples', 'vintage_portrait_sample.jpg');

const animeB64 = fs.existsSync(sampleAnimePath)
  ? 'data:image/png;base64,' + fs.readFileSync(sampleAnimePath).toString('base64')
  : '';
const portraitB64 = fs.existsSync(samplePortraitPath)
  ? 'data:image/jpeg;base64,' + fs.readFileSync(samplePortraitPath).toString('base64')
  : '';

async function run() {
  console.log('Starting Vite server...');
  const server = await createServer({
    root,
    server: { port: 5199, strictPort: true },
  });
  await server.listen();
  const port = server.config.server.port;

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: true,
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
    args: ['--hide-scrollbars', '--no-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle0' });

  // Wait for React to mount
  await page.waitForFunction(() => window.studioStore !== undefined);

  // Set mock environment
  await page.evaluate(
    ({ animeSrc, portraitSrc }) => {
      // Hide boot overlay
      const b = document.getElementById('boot');
      if (b) b.style.display = 'none';

      window.studioStore.setState((prev) => ({
        ...prev,
        appName: 'Upscaly Studio',
        appVersion: '1.0.2',
        gpus: [
          {
            id: 0,
            name: 'NVIDIA GeForce RTX 3050 Laptop GPU',
            detail: '4096 MB VRAM',
            vram_mb: 4096,
            fp16_storage_supported: true,
            fp16_arithmetic_supported: true,
            compute_queue_count: 2,
          },
        ],
        selectedGpu: 0,
        installedModels: [
          'realesrgan-x4plus',
          'realesrgan-x4plus-anime',
          'remacri-4x',
          'ultrasharp-4x',
        ],
        selectedModel: 'realesrgan-x4plus',
        scale: 4,
        tileSize: 0,
        activeVramGb: '4.0 GB',
        customOutputPath: 'C:\\Users\\shayan\\Pictures\\Upscaly',
        gentleMode: false,
        activeNavTab: null,
        toasts: [],
      }));

      // Continuously suppress warning toasts during screenshot generation
      setInterval(() => {
        const s = window.studioStore.getState();
        if (s.toasts && s.toasts.length > 0) {
          window.studioStore.setState((p) => ({ ...p, toasts: [] }));
        }
      }, 50);
    },
    { animeSrc: animeB64, portraitSrc: portraitB64 }
  );

  await new Promise((r) => setTimeout(r, 600));

  // 1. Studio View (Default Dropzone / Ready state)
  console.log('Capturing studio_view.png...');
  await page.screenshot({ path: path.join(outDir, 'studio_view.png') });

  // 2. Comparison Slider View (Real loaded art with 4x before/after)
  console.log('Capturing comparison_slider.png...');
  await page.evaluate(
    ({ animeSrc }) => {
      window.studioStore.setState((prev) => ({
        ...prev,
        activeNavTab: null,
        toasts: [],
        items: [
          {
            id: 'demo-1',
            filePath: animeSrc,
            fileName: 'cyberpunk_anime_character.png',
            isVideo: false,
            status: 'succeeded',
            progress: 100,
            w: 512,
            h: 512,
            outputPath: animeSrc,
            upscaledPath: animeSrc,
          },
        ],
        selectedId: 'demo-1',
      }));
    },
    { animeSrc: animeB64 }
  );
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, 'comparison_slider.png') });

  // 3. Model Catalog Modal
  console.log('Capturing model_catalog.png...');
  await page.evaluate(() => {
    window.studioStore.setState((prev) => ({
      ...prev,
      activeNavTab: 'models',
      toasts: [],
    }));
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(outDir, 'model_catalog.png') });

  // 4. Advanced Settings Modal
  console.log('Capturing advanced_settings.png...');
  await page.evaluate(() => {
    window.studioStore.setState((prev) => ({
      ...prev,
      activeNavTab: 'settings',
      toasts: [],
    }));
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(outDir, 'advanced_settings.png') });

  // 5. Recent History Modal
  console.log('Capturing recent_history.png...');
  await page.evaluate(() => {
    window.studioStore.setState((prev) => ({
      ...prev,
      activeNavTab: 'history',
      toasts: [],
      historyItems: [
        {
          id: 'hist-1',
          fileName: 'cyberpunk_anime_character.png',
          originalPath: 'C:\\Users\\shayan\\Pictures\\cyberpunk_anime_character.png',
          upscaledPath: 'C:\\Users\\shayan\\Pictures\\Upscaly\\cyberpunk_anime_character_4x.png',
          model: 'Anime Art',
          scale: 4,
          timestamp: Date.now() - 1000 * 60 * 15,
          isVideo: false,
          elapsedSeconds: 2.8,
        },
        {
          id: 'hist-2',
          fileName: 'vintage_portrait_restoration.jpg',
          originalPath: 'C:\\Users\\shayan\\Pictures\\vintage_portrait_restoration.jpg',
          upscaledPath: 'C:\\Users\\shayan\\Pictures\\Upscaly\\vintage_portrait_restoration_4x.png',
          model: 'RealESRGAN Ultra',
          scale: 4,
          timestamp: Date.now() - 1000 * 60 * 45,
          isVideo: false,
          elapsedSeconds: 3.4,
        },
      ],
    }));
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(outDir, 'recent_history.png') });

  await browser.close();
  await server.close();
  console.log('All 5 screenshots generated successfully!');
}

run().catch((err) => {
  console.error('Error generating screenshots:', err);
  process.exit(1);
});
