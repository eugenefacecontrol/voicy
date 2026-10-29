// Local browser regression: NODE_PATH=/opt/homebrew/lib/node_modules node tests/library.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.VOICY_TEST_URL || 'http://localhost:8765/';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const errors = [];
  await context.route(/https:\/\/voicy-share\./, route => route.fulfill({ json: { enabled: false, available: false } }));
  await context.addInitScript(() => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('voicy:text', Array.from({ length: 120 }, (_, i) => `legacy${i}`).join(' '));
      localStorage.setItem('voicy:rate', '1.5');
      localStorage.setItem('seeded', 'true');
    }
    Object.defineProperty(window, 'speechSynthesis', { value: {
      getVoices: () => [{ voiceURI: 'v1', name: 'Anna', lang: 'ru-RU' }, { voiceURI: 'v2', name: 'Ivan', lang: 'ru-RU' }],
      addEventListener() {}, cancel() {}, pause() {}, resume() {},
      speak(u) { window.utterance = u; u.onstart?.(); }
    }});
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  });
  let page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  async function ready() { await page.waitForFunction(() => libraryReady && state.voices.length === 2); }
  await page.goto(base); await ready();
  assert.equal(await page.evaluate(() => library.entries.length), 1);
  assert.equal(await page.evaluate(() => state.rate), 1.5);
  const first = await page.evaluate(() => { savePosition(32, true); selectFont('mono'); return library.activeId; });
  await page.locator('#libraryButton').click();
  await page.locator('.library-entry-title').fill('Book One');
  await page.locator('.library-entry-title').press('Tab');
  await page.locator('#libraryNew').click();
  await page.locator('#textInput').fill('(Alice) One two three four five six seven eight nine ten.\n(Bob) Eleven twelve thirteen fourteen fifteen sixteen.');
  await page.locator('#rolesSettingsToggle').check();
  const second = await page.evaluate(() => {
    state.roleNames.Alice = 'Alice renamed'; storage.set('roleNames', JSON.stringify(state.roleNames));
    state.roleVoices.Alice = state.voiceChoices[1]; storage.set('roleVoices', JSON.stringify(state.roleVoices));
    selectRate(2.1); savePosition(7, true); return library.activeId;
  });
  await page.evaluate(id => switchLibraryEntry(library.entries.find(entry => entry.id === id)), first);
  assert.equal(await page.evaluate(() => state.resumeWord), 32);
  assert.equal(await page.evaluate(() => state.rate), 1.5);
  assert.equal(await page.locator('#fontSelect').inputValue(), 'mono');
  assert.equal(await page.locator('#activeTextTitle').innerText(), 'Book One');
  await page.locator('#playButton').click();
  await page.evaluate(() => { state.currentWord = 41; });
  await page.evaluate(id => switchLibraryEntry(library.entries.find(entry => entry.id === id)), second);
  assert.equal(await page.evaluate(() => state.resumeWord), 7);
  assert.equal(await page.evaluate(() => state.roleNames.Alice), 'Alice renamed');
  assert.equal(await page.evaluate(() => state.roleVoices.Alice.id), 'v2');
  assert.equal(await page.evaluate(() => state.rate), 2.1);
  assert.equal(await page.evaluate(() => state.speaking), false);
  await page.reload(); await ready();
  assert.equal(await page.evaluate(() => state.resumeWord), 7);
  assert.equal(await page.evaluate(() => library.entries.length), 2);
  // Import an incoming link, then reopen it after making progress: no duplicate or rewind.
  const url = await page.evaluate(async () => {
    const bytes = await compressText('A shared text with plenty of words to resume listening later.');
    const url = new URL(location.href); url.hash = `v=1&text=${bytesToBase64Url(bytes)}`; return url.href;
  });
  await page.goto(url); await page.reload(); await ready();
  assert.equal(await page.evaluate(() => library.entries.length), 3);
  await page.evaluate(() => savePosition(5, true));
  await page.reload(); await ready();
  assert.equal(await page.evaluate(() => library.entries.length), 3);
  assert.equal(await page.evaluate(() => state.resumeWord), 5);
  await page.evaluate(id => switchLibraryEntry(library.entries.find(entry => entry.id === id)), first);
  assert.equal(await page.evaluate(() => state.resumeWord), 41);
  assert.equal(new URL(page.url()).hash, '');
  // pagehide saves the latest word even below the normal five-word checkpoint.
  await page.evaluate(() => { state.speaking = true; state.currentWord = 43; dispatchEvent(new Event('pagehide')); });
  await page.close();
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await ready();
  assert.equal(await page.evaluate(() => state.resumeWord), 43);
  assert.equal(await page.evaluate(() => library.entries.length), 3);
  await page.locator('#libraryButton').click();
  assert.equal(await page.locator('.library-entry').count(), 3);
  assert(await page.locator('#libraryDialog').evaluate(el => el.scrollWidth <= el.clientWidth));
  await page.keyboard.press('Escape');
  // Another tab can add a text without losing either tab's text or progress.
  const other = await context.newPage();
  await other.goto(base); await other.waitForFunction(() => libraryReady && state.voices.length === 2);
  await other.evaluate(() => switchLibraryEntry(makeLibraryEntry()));
  await other.locator('#textInput').fill('A fourth independent recording opened in another browser tab.');
  await other.evaluate(() => savePosition(3, true));
  await page.evaluate(() => flushLibrary());
  assert.equal(await page.evaluate(() => library.entries.length), 4);
  await other.evaluate(() => flushLibrary());
  assert.equal(await other.evaluate(() => library.entries.find(entry => entry.id === library.activeId).text), 'A fourth independent recording opened in another browser tab.');
  assert.equal(await other.evaluate(() => state.resumeWord), 3);
  await other.close();
  await page.evaluate(() => flushLibrary());
  await page.reload(); await ready();
  assert.equal(await page.evaluate(() => state.resumeWord), 43);
  assert.equal(await page.evaluate(() => library.entries.length), 4);
  // Storage failures must be visible without interrupting playback.
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; saveLibraryEntry(); });
  assert(await page.locator('#libraryStorageStatus').isVisible());
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: migration, rename, separate settings/progress, active switch cancellation, reload, shared-link deduplication, pagehide, mobile drawer, storage-full warning.');
})().catch(error => { console.error(error); process.exit(1); });
