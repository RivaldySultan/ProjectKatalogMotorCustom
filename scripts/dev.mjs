#!/usr/bin/env node
/**
 * Runs the API and Vite client in one terminal with combined logs.
 *
 *   npm run dev
 *
 * Server  : http://localhost:5000
 * Client  : http://localhost:5173
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const clientDir = path.join(rootDir, 'client');
const serverDir = path.join(rootDir, 'server');
const isWindows = process.platform === 'win32';

const viteBin = path.join(
  path.dirname(createRequire(path.join(clientDir, 'package.json')).resolve('vite/package.json')),
  'bin',
  'vite.js',
);

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);

const PREFIXES = {
  api: paint('36', '[api]'),
  web: paint('35', '[web]'),
  dev: paint('33', '[dev]'),
};

const children = [];
let shuttingDown = false;

function log(name, line) {
  if (!line) return;
  process.stdout.write(`${PREFIXES[name]} ${line}\n`);
}

function pipeLines(stream, name) {
  let buffer = '';

  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      log(name, line);
    }
  });

  stream.on('end', () => {
    if (buffer) log(name, buffer);
    buffer = '';
  });
}

function start(name, command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, FORCE_COLOR: useColor ? '1' : '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  children.push({ name, child });

  pipeLines(child.stdout, name);
  pipeLines(child.stderr, name);

  child.on('error', (error) => {
    log(name, `Failed to start process: ${error.message}`);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;

    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    log(name, `Process exited (${reason}). Stopping the other process...`);
    shutdown(code ?? 1);
  });

  return child;
}

function killTree(entry) {
  const { child } = entry;

  if (child.exitCode !== null || child.signalCode !== null) return;

  if (isWindows) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  try {
    child.kill('SIGTERM');
  } catch {
    // The process may already have exited.
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  log('dev', 'Stopping the API and client...');
  children.forEach(killTree);

  setTimeout(() => {
    process.exit(process.exitCode ?? code);
  }, 600).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

process.stdout.write(
  [
    '',
    paint('1', 'RUKA Motorworks — development mode'),
    `  API    ${paint('36', 'http://localhost:5000')}`,
    `  Client ${paint('35', 'http://localhost:5173')}`,
    paint('2', '  API and client logs are combined in this terminal.'),
    paint('2', '  Press Ctrl+C to stop.'),
    '',
  ].join('\n'),
);

start('api', process.execPath, ['--watch', 'src/index.js'], { cwd: serverDir });

start(
  'web',
  process.execPath,
  [viteBin, '--port', '5173', '--strictPort', '--clearScreen', 'false'],
  { cwd: clientDir },
);
