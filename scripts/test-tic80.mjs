import { chromium } from 'playwright';

const URL = process.env.TEST_URL ?? 'http://localhost:4173/';
const TIMEOUT_MS = 45_000;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const stdout = [];
const errors = [];

page.on('console', (msg) => {
  const text = msg.text();
  stdout.push(`[${msg.type()}] ${text}`);
});

page.on('pageerror', (err) => {
  errors.push(err.message);
});

const result = {
  url: URL,
  booted: false,
  loaded: false,
  helloOnCanvas: false,
  status: 'unknown',
  snippets: [],
  errors: [],
};

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });

  const startButton = page.locator('text=Click to start TIC-80');
  await startButton.waitFor({ state: 'visible', timeout: 10_000 });
  await startButton.click();

  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return text.includes('hello!') || text.includes('type help');
    },
    { timeout: TIMEOUT_MS },
  );
  result.booted = true;

  await page.waitForTimeout(4000);

  const bodyText = await page.locator('body').innerText();
  result.snippets = bodyText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /hello|loaded|sync|error|HELLO|project/i.test(line))
    .slice(0, 20);

  result.loaded = /loaded!/i.test(bodyText) || bodyText.includes('HELLO WORLD');

  const canvas = page.locator('#tic-canvas');
  await canvas.waitFor({ state: 'visible', timeout: 5000 });

  const pixels = await canvas.evaluate((el) => {
    const ctx = el.getContext('2d');
    if (!ctx) {
      return { nonBlack: 0, samples: 0 };
    }
    const { width, height } = el;
    const data = ctx.getImageData(0, 0, width, height).data;
    let nonBlack = 0;
    const samples = width * height;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) {
        nonBlack++;
      }
    }
    return { nonBlack, samples };
  });

  result.helloOnCanvas = pixels.nonBlack > pixels.samples * 0.01;
  result.canvasStats = pixels;

  if (result.loaded || result.helloOnCanvas) {
    result.status = 'pass';
  } else if (result.booted) {
    result.status = 'partial';
  } else {
    result.status = 'fail';
  }
} catch (error) {
  result.status = 'fail';
  result.errors.push(error instanceof Error ? error.message : String(error));
}

result.errors.push(...errors);
result.console = stdout.filter((line) => /hello|loaded|sync|error|HELLO|cmd|project|abort|unwind/i.test(line)).slice(0, 30);

await browser.close();

console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'pass' ? 0 : 1);
