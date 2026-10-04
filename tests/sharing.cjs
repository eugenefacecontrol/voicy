// Run against a local static server: NODE_PATH=/path/to/node_modules node tests/sharing.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.VOICY_TEST_URL || 'http://localhost:8765/';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [], packets = new Map();
  async function open(url = base, stored = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(({ stored }) => {
      if (!sessionStorage.seeded) {
        for (const [key, value] of Object.entries(stored)) localStorage.setItem(`voicy:${key}`, value);
        sessionStorage.seeded = 'true';
      }
      window.spoken = [];
      Object.defineProperty(window, 'speechSynthesis', { value: {
        getVoices: () => [{ voiceURI: 'v1', name: 'Anna', lang: 'ru-RU', localService: true }, { voiceURI: 'v2', name: 'Ivan', lang: 'ru-RU', localService: true }],
        addEventListener() {}, cancel() {}, pause() {}, resume() {},
        speak(u) { spoken.push({ text: u.text, voice: u.voice.voiceURI }); window.utterance = u; u.onstart?.(); }
      }});
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      Object.defineProperty(navigator, 'share', { value: async () => {} });
    }, { stored });
    await context.route(/https:\/\/voicy-share\./, async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      if (path === '/shares' && req.method() === 'POST') {
        const id = String(packets.size + 1); packets.set(id, req.postDataJSON().data);
        return route.fulfill({ json: { id } });
      }
      if (path.startsWith('/shares/')) return route.fulfill({ json: { data: packets.get(path.split('/').at(-1)) } });
      if (path === '/fish/voices') return route.fulfill({ json: { items: [] } });
      return route.fulfill({ json: { enabled: true, available: true } });
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => state.voices.length === 2 && state.geminiAvailable);
    return page;
  }
  const sender = await open();
  await sender.locator('#viewModeButton').evaluate((button) => { if (document.querySelector('#textInput').hidden) button.click(); });
  await sender.locator('#textInput').fill('(Человек 1) Один два три.\n(Человек 2) Четыре пять шесть.');
  await sender.locator('#rolesSettingsToggle').check();
  assert.equal(await sender.locator('.role-voice-button').count(), 2);
  assert.match(await sender.locator('.role-voice-button').nth(1).innerText(), /по умолчанию/);
  await sender.locator('.role-voice-button').first().click();
  await sender.locator('#voiceSearch').fill('Ivan');
  await sender.locator('.voice-option').filter({ hasText: 'Ivan' }).click();
  assert.match(await sender.locator('.role-voice-button').first().innerText(), /Ivan/);
  assert.match(await sender.locator('.role-voice-button').nth(1).innerText(), /по умолчанию/);
  assert.deepEqual(await sender.evaluate(() => Object.keys(state.roleVoices)), ['Человек 1']);
  await sender.locator('.role-name-input').first().fill('Анна');
  await sender.locator('.role-name-input').first().press('Tab');
  await sender.evaluate(() => { selectRate(1.7); selectFont('mono'); savePosition(3, true); });
  await sender.locator('#shareButton').click();
  for (const id of ['shareVoices', 'shareRate', 'shareRoleMode', 'shareFont']) assert(await sender.locator(`#${id}`).isChecked());
  assert(!(await sender.locator('#sharePosition').isChecked()));
  const settings = await sender.evaluate(() => JSON.parse(buildSharePayload()).settings);
  assert.equal(settings.roleVoices['Человек 1'].id, 'v2');
  assert.equal(settings.roleVoices['Человек 2'].id, 'v1');
  assert(!('startWord' in settings));
  await sender.locator('#shareInlineButton').click();
  await sender.waitForFunction(() => !elements.shareInlineButton.disabled && Boolean(elements.shareUrl.value));
  const inline = await sender.locator('#shareUrl').inputValue(); assert(inline.includes('v=2'));
  const recipient = await open(inline);
  assert.deepEqual(await recipient.evaluate(() => ({ rate: state.rate, font: elements.fontSelect.value, roleMode: state.roleMode, word: state.resumeWord, names: state.roleNames })),
    { rate: 1.7, font: 'mono', roleMode: true, word: 0, names: { 'Человек 1': 'Анна', 'Человек 2': 'Человек 2' } });
  await recipient.locator('#playButton').click();
  await recipient.evaluate(() => utterance.onend());
  await recipient.evaluate(() => utterance.onend());
  assert.deepEqual(await recipient.evaluate(() => spoken), [{ text: 'Один два три.', voice: 'v2' }, { text: 'Четыре пять шесть.', voice: 'v1' }]);
  await sender.locator('#sharePosition').check();
  assert(await sender.locator('#shareResult').isHidden());
  await sender.locator('#shareStart').selectOption({ index: 2 });
  await sender.locator('#shareCloudButton').click();
  await sender.waitForFunction(() => !elements.shareCloudButton.disabled && Boolean(elements.shareUrl.value));
  const cloud = await sender.locator('#shareUrl').inputValue();
  assert(cloud.includes('share=1'));
  const cloudRecipient = await open(cloud);
  assert.equal(await cloudRecipient.evaluate(() => state.resumeWord), 3);
  await cloudRecipient.locator('#playButton').click();
  assert.equal(await cloudRecipient.evaluate(() => spoken[0].text), 'Четыре пять шесть.');
  // Excluding all settings preserves recipient preferences and still starts at the beginning.
  for (const id of ['shareVoices', 'shareRate', 'shareRoleMode', 'shareFont', 'sharePosition']) await sender.locator(`#${id}`).uncheck();
  assert.deepEqual(await sender.evaluate(() => JSON.parse(buildSharePayload()).settings), {});
  await sender.locator('#shareInlineButton').click();
  await sender.waitForFunction(() => !elements.shareInlineButton.disabled && Boolean(elements.shareUrl.value));
  const plain = await sender.locator('#shareUrl').inputValue();
  const plainRecipient = await open(plain, { rate: '2.3', font: 'modern', roleMode: 'false', voice: 'system:v2' });
  assert.deepEqual(await plainRecipient.evaluate(() => [state.rate, elements.fontSelect.value, state.roleMode, state.selectedVoice.id, state.resumeWord]), [2.3, 'modern', false, 'v2', 0]);
  // Legacy inline and encrypted cloud links must remain plain text (including JSON-looking text).
  const legacyText = '{"text":"legacy"}\nСтарый текст.';
  const legacy = await sender.evaluate(async text => `${location.origin}/#v=1&text=${bytesToBase64Url(await compressText(text))}`, legacyText);
  assert.equal(await (await open(legacy)).locator('#textInput').inputValue(), legacyText);
  const oldPacket = await sender.evaluate(async text => {
    const { packet, rawKey } = await encryptBytes(await compressText(text));
    return { data: bytesToBase64Url(packet), key: bytesToBase64Url(rawKey) };
  }, legacyText);
  packets.set('old', oldPacket.data);
  assert.equal(await (await open(`${base}?share=old#key=${oldPacket.key}`)).locator('#textInput').inputValue(), legacyText);
  // Shared false must override a recipient's enabled role mode; cloud voice IDs survive transfer.
  await sender.locator('#shareClose').click();
  await sender.evaluate(() => { setRoleMode(false); selectVoiceChoice(state.voiceChoices.find(v => v.key === 'gemini:Kore'), false); });
  await sender.locator('#shareButton').click();
  for (const id of ['shareVoices', 'shareRate', 'shareRoleMode', 'shareFont']) await sender.locator(`#${id}`).check();
  await sender.locator('#shareInlineButton').click();
  await sender.waitForFunction(() => !elements.shareInlineButton.disabled && Boolean(elements.shareUrl.value));
  const ordinary = await open(await sender.locator('#shareUrl').inputValue(), { roleMode: 'true' });
  assert.equal(await ordinary.evaluate(() => state.roleMode), false);
  assert.equal(await ordinary.evaluate(() => state.selectedVoice.key), 'gemini:Kore');
  // Fish role voices do not need to appear in the receiver's initial catalogue.
  await sender.evaluate(() => { setRoleMode(true); state.roleVoices['Человек 1'] = { provider: 'fish', id: 'a'.repeat(32), key: `fish:${'a'.repeat(32)}`, name: 'Custom Fish' }; });
  await sender.locator('#shareInlineButton').click();
  await sender.waitForFunction(() => !elements.shareInlineButton.disabled && Boolean(elements.shareUrl.value));
  const fish = await open(await sender.locator('#shareUrl').inputValue());
  assert.equal(await fish.evaluate(() => state.roleVoices['Человек 1'].provider), 'fish');
  assert(await fish.evaluate(() => rolesReady()));
  // Missing device voices remain actionable, never silently blocking Play.
  await fish.evaluate(() => {
    state.roleVoices['Человек 1'] = { provider: 'system', id: 'missing', key: 'system:missing', name: 'Missing device voice' };
    renderRoleChoices();
  });
  await fish.locator('#playButton').click();
  assert(await fish.locator('#voicePickerPanel').isVisible());
  await fish.locator('#voicePickerClose').click();
  await fish.locator('#rolesVoices .text-button').first().click();
  assert.match(await fish.locator('.role-voice-button').first().innerText(), /по умолчанию/);
  // Invalid option values cannot corrupt stored settings; out-of-range positions clamp.
  const invalid = await sender.evaluate(async () => {
    const payload = JSON.stringify({ version: 2, text: '(А) Один два.', settings: { roleMode: true, rate: 99, font: 'bad', startWord: 999999, roleVoices: { 'А': { provider: 'fish', id: 'invalid' } } } });
    return `${location.origin}/#v=2&text=${bytesToBase64Url(await compressText(payload))}`;
  });
  const invalidRecipient = await open(invalid, { rate: '1.4', font: 'modern' });
  assert.deepEqual(await invalidRecipient.evaluate(() => [state.rate, elements.fontSelect.value, state.resumeWord, Object.keys(state.roleVoices).length]), [1.4, 'modern', 1, 0]);
  await sender.screenshot({ path: '/tmp/voicy-sharing-mobile.png', fullPage: false });
  assert.deepEqual(errors, []);
  console.log('PASS: inline/cloud round trips, legacy links, defaults, exclusions, named role voices, ordinary/cloud voices, independent roles, start position and sequential playback. TTS and server storage mocked.');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
