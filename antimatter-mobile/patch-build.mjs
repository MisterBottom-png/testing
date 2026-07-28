import fs from "node:fs";
import path from "node:path";

const dist = path.resolve(process.argv[2] ?? "");
const indexPath = path.join(dist, "index.html");

if (!fs.existsSync(indexPath)) {
  throw new Error(`Built index.html was not found at ${indexPath}`);
}

let html = fs.readFileSync(indexPath, "utf8");
const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">';

if (/<meta[^>]+name=["']viewport["'][^>]*>/iu.test(html)) {
  html = html.replace(/<meta[^>]+name=["']viewport["'][^>]*>/iu, viewport);
} else {
  html = html.replace(/<head>/iu, `<head>\n    ${viewport}`);
}

const mobileHead = `
    <meta name="theme-color" content="#111014">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <link rel="stylesheet" href="stylesheets/mobile-overrides.css">
`;

if (!html.includes("mobile-overrides.css")) {
  html = html.replace(/<\/head>/iu, `${mobileHead}  </head>`);
}

fs.writeFileSync(indexPath, html);

for (const entry of fs.readdirSync(dist, { recursive: true })) {
  if (entry.endsWith(".map")) {
    fs.rmSync(path.join(dist, entry), { force: true });
  }
}

console.log(`Patched mobile build at ${dist}`);
