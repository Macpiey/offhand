import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const htmlPath = resolve('graphify-out/graph.html');
const url = pathToFileURL(htmlPath).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(url);
await page.waitForTimeout(4000);
await page.screenshot({ path: 'graphify-out/graph-screenshot.png' });
await browser.close();
console.log('screenshot saved');
