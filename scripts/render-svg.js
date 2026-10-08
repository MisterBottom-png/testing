// Renders one SVG to a PNG of its own size with headless Chromium (Playwright). Original work, MIT OR Apache-2.0.
// usage: node scripts/render-svg.js <in.svg> <out.png>
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
(async () => {
  const [svg, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  await p.setContent(`<html><body style="margin:0;background:transparent">${fs.readFileSync(svg, 'utf8')}</body></html>`);
  await p.locator('svg').screenshot({ path: out, omitBackground: true });
  await b.close();
})();
