import { strict as assert } from 'node:assert';
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';

const port = 4179;
const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe']
});

try {
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for Vite.')), 15000);
        const onData = data => {
            if (data.toString().includes('ready in') || data.toString().includes('Local:')) {
                clearTimeout(timeout);
                resolve();
            }
        };
        server.stdout.on('data', onData);
        server.stderr.on('data', onData);
        server.on('error', error => {
            clearTimeout(timeout);
            reject(error);
        });
    });

    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const result = await page.goto(`http://127.0.0.1:${port}/tests/admin-drafts.html`, { waitUntil: 'networkidle0' });
        assert.equal(result.status(), 200);
        const output = await page.waitForFunction(() => window.__ADMIN_DRAFT_TEST_RESULT__, { timeout: 15000 });
        const payload = await output.jsonValue();
        if (!payload.ok) throw new Error(payload.error);
        console.log(`Admin Draft tests passed: ${payload.passed}/${payload.total}`);
    } finally {
        await browser.close();
    }
} finally {
    server.kill();
}
