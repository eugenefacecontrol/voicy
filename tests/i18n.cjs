// NODE_PATH=/path/to/node_modules node tests/i18n.cjs (local server on :8765)
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.VOICY_TEST_URL || 'http://localhost:8765/';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  for (const [query, lang] of [['', 'en'], ['?lang=en', 'en'], ['?lang=ru', 'ru'], ['?lang=de', 'en']]) {
    const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 390, height: 844 } });
    await context.route(/https:\/\/voicy-share\./, route => route.fulfill({ json: { enabled: false, available: false } }));
    await context.addInitScript(() => {
      window.spoken = [];
      Object.defineProperty(window, 'speechSynthesis', { value: {
        getVoices: () => [{ voiceURI: 'test', name: 'Test voice', lang: 'ru-RU', localService: true }],
        addEventListener() {}, cancel() {}, pause() {}, resume() {},
        speak(u) { spoken.push(u.text); window.utterance = u; u.onstart?.(); }
      } });
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + query);
    await page.waitForFunction(() => state.voices.length === 1);
    assert.equal(await page.locator('html').getAttribute('lang'), lang);
    assert.equal(await page.locator('#playLabel').innerText(), lang === 'en' ? 'Listen' : 'Слушать');
    if (lang === 'en') {
      assert(!/[А-Яа-яЁё]/.test(await page.locator('body').innerText()));
      assert.equal(await page.evaluate(() => pluralize(21, [t('раздел'), t('раздела'), t('разделов')])), 'sections');
      assert.match(await page.locator('#textInput').getAttribute('placeholder'), /Paste text/);
    }
    await page.locator('#rolesButton').click();
    assert.match(await page.locator('#rolesPrompt').inputValue(), lang === 'en' ? /Prepare the following/ : /Подготовь следующий/);
    await page.locator('#rolesClose').click();
    const input = '(Анна) Привет!\n(John) Hello!';
    await page.locator('#textInput').fill(input);
    await page.locator('#rolesSettingsToggle').check();
    assert.equal(await page.locator('.role-voice-button').count(), 2);
    assert.match(await page.locator('.role-voice-button').first().innerText(), lang === 'en' ? /Default voice/ : /по умолчанию/);
    await page.locator('#playButton').click();
    await page.evaluate(() => utterance.onend());
    await page.evaluate(() => utterance.onend());
    assert.deepEqual(await page.evaluate(() => spoken), ['Привет!', 'Hello!']);
    await page.locator('#shareButton').click();
    await page.locator('#shareInlineButton').click();
    await page.waitForFunction(() => elements.shareUrl.value);
    const url = await page.locator('#shareUrl').inputValue();
    assert.equal(new URL(url).searchParams.get('lang'), lang === 'ru' ? 'ru' : null);
    await page.goto(url);
    await page.waitForFunction(() => elements.textInput.value.includes('Привет!'));
    assert.equal(await page.locator('#textInput').inputValue(), input);
    assert.equal(await page.locator('html').getAttribute('lang'), lang);
    assert.equal(await page.locator('.role-voice-button').count(), 2);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await context.close();
  }
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: URL-only language, default/fallback English, Russian, mobile layout, role playback and shared-link round trips. TTS mocked.');
})().catch(e => { console.error(e); process.exit(1); });
