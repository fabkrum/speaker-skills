// A minimal headless Chrome driver over the DevTools protocol, talking through a pipe
// (no port, no dependencies). Any Chromium-based browser works: Chrome, Chromium, Edge, Brave.
// Set CHROME_PATH to use a browser this file does not find on its own.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
  ],
  win32: [
    'Google\\Chrome\\Application\\chrome.exe',
    'Microsoft\\Edge\\Application\\msedge.exe',
    'BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  ].flatMap((p) =>
    [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean)
      .map((base) => `${base}\\${p}`),
  ),
};

// Thrown when no browser is found or it cannot start: the check could not run, which is not a failed deck.
export class BrowserNotFound extends Error {}

export function findBrowser() {
  if (process.env.CHROME_PATH) {
    if (existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    throw new BrowserNotFound(`CHROME_PATH points to ${process.env.CHROME_PATH}, which does not exist.`);
  }
  const found = (CANDIDATES[process.platform] ?? []).find((p) => existsSync(p));
  if (found) return found;
  throw new BrowserNotFound(
    'No Chrome, Chromium, Edge or Brave found. Install Google Chrome, or set CHROME_PATH to a Chromium-based browser.',
  );
}

// Launches the browser and returns { send(method, params, sessionId), on(event, fn), close() }.
export async function launch({ timeoutMs = 30000 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'html-slides-'));
  const child = spawn(
    findBrowser(),
    [
      '--headless=new',
      '--remote-debugging-pipe',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--hide-scrollbars',
      '--mute-audio',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      `--user-data-dir=${profile}`,
      // CI runners (Ubuntu 24.04) block the namespaces Chrome's sandbox needs; the check opens
      // only local files there.
      ...(process.env.CI ? ['--no-sandbox'] : []),
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr = (stderr + d).slice(-4000);
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  let buffer = '';
  child.stdio[4].on('data', (chunk) => {
    buffer += chunk;
    const parts = buffer.split('\0');
    buffer = parts.pop();
    for (const part of parts) {
      const msg = JSON.parse(part);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject, method } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const l of listeners) if (l.event === msg.method) l.fn(msg.params, msg.sessionId);
      }
    }
  });
  const exited = new Promise((resolve) => child.on('exit', resolve));
  child.on('exit', () => {
    for (const { reject, method } of pending.values()) reject(new Error(`${method}: browser exited\n${stderr}`));
    pending.clear();
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method}: no answer after ${timeoutMs} ms`));
      }, timeoutMs);
      pending.set(id, {
        method,
        resolve: (r) => (clearTimeout(timer), resolve(r)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }) + '\0');
    });
  const on = (event, fn) => listeners.push({ event, fn });
  const close = async () => {
    try {
      await send('Browser.close');
    } catch {
      child.kill();
    }
    await exited;
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  };

  try {
    await send('Browser.getVersion');
  } catch (e) {
    child.kill();
    await exited;
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    throw new BrowserNotFound(
      `${findBrowser()} did not start (${e.message.split('\n')[0]}). If this runs inside an agent's or CI's sandbox, ` +
        `the sandbox may block the browser: run the same command outside it.\n${stderr.trim().split('\n').slice(-3).join('\n')}`,
    );
  }
  return { send, on, close };
}

// Opens a page and returns a small page API bound to its session.
export async function openPage(browser, { width, height, timeoutMs = 30000 }) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => browser.send(method, params, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  const requests = [];
  browser.on('Network.requestWillBeSent', (p, sid) => sid === sessionId && requests.push(p.request.url));

  const page = {
    send,
    requests,
    async resize(w, h) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    },
    async goto(url) {
      let timer;
      const loaded = new Promise((resolve, reject) => {
        browser.on('Page.loadEventFired', (_, sid) => sid === sessionId && resolve());
        timer = setTimeout(() => reject(new Error(`${url} did not finish loading in ${timeoutMs} ms`)), timeoutMs);
      });
      try {
        const { errorText, loaderId } = await send('Page.navigate', { url });
        if (errorText) throw new Error(`Could not open ${url}: ${errorText}`);
        if (loaderId) await loaded; // no loaderId: only the #fragment changed, nothing loads
      } finally {
        clearTimeout(timer);
        loaded.catch(() => {});
      }
    },
    // Evaluates an expression (or an async function body given as a string) and returns its value.
    async evaluate(expression) {
      const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (exceptionDetails) {
        const text = exceptionDetails.exception?.description ?? exceptionDetails.text;
        throw new Error(`In the page: ${text}`);
      }
      return result.value;
    },
    async screenshot(clip) {
      const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
      return data;
    },
    async key(key, code = key, keyCode) {
      for (const type of ['keyDown', 'keyUp'])
        await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode });
    },
  };
  await page.resize(width, height);
  return page;
}
