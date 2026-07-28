import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STABLE_OUTPUT_FILENAME } from './verify-single-file.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(projectRoot, 'dist', STABLE_OUTPUT_FILENAME);

export async function startStandaloneServer(options = {}) {
  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  const port = Number(options.port ?? process.env.PORT ?? 4173);
  const html = await readFile(outputPath);
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`).pathname;
    if (pathname !== '/' && pathname !== `/${STABLE_OUTPUT_FILENAME}`) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': html.length,
      'cache-control': 'no-store'
    });
    response.end(html);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : port;
  return {
    server,
    host,
    port: resolvedPort,
    url: `http://${host}:${resolvedPort}/${STABLE_OUTPUT_FILENAME}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  };
}

async function runCli() {
  try {
    const running = await startStandaloneServer();
    console.log(`Serving dist/${STABLE_OUTPUT_FILENAME} at ${running.url}`);
    const shutdown = async () => {
      await running.close();
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await runCli();
