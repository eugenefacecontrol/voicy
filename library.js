// Durable, device-local text library. Legacy keys remain the active playback workspace.
const libraryKeys = ['text', 'position', 'voice', 'voiceChoice', 'roleMode', 'roleVoices', 'roleNames', 'rate', 'font', 'readMode'];
let library = { version: 1, activeId: null, entries: [] };
let libraryReady = false;
let librarySavePending = false;

function scheduleLibrarySave(key) {
  if (!libraryReady || !libraryKeys.includes(key) || librarySavePending) return;
  librarySavePending = true;
  queueMicrotask(() => {
    librarySavePending = false;
    if (libraryReady) saveLibraryEntry();
  });
}

function makeLibraryEntry(text = '') {
  return {
    id: crypto.randomUUID(), text, title: '', updatedAt: Date.now(),
    settings: { roleMode: 'false', roleVoices: '{}', roleNames: '{}', readMode: String(Boolean(text.trim())),
      rate: storage.get('rate', '1'), font: storage.get('font', 'literary'),
      voice: storage.get('voice'), voiceChoice: storage.get('voiceChoice') },
  };
}

function initializeLibrary() {
  try {
    const saved = JSON.parse(storage.get('library', 'null'));
    if (saved?.version === 1 && Array.isArray(saved.entries)) {
      library = { version: 1, activeId: saved.activeId, entries: saved.entries.filter(entry =>
        entry && typeof entry.id === 'string' && typeof entry.text === 'string' && entry.settings && typeof entry.settings === 'object') };
    }
  } catch { /* Preserve the legacy active text when upgrading. */ }
  let entry = library.entries.find(entry => entry.id === library.activeId);
  if (!entry) {
    entry = makeLibraryEntry(storage.get('text'));
    for (const key of libraryKeys) if (key !== 'text') entry.settings[key] = storage.get(key);
    library.entries.push(entry);
  }
  activateLibraryEntry(entry);
}

function activateLibraryEntry(entry) {
  libraryReady = false;
  library.activeId = entry.id;
  if (!library.entries.includes(entry)) library.entries.push(entry);
  for (const key of libraryKeys) {
    const value = key === 'text' ? entry.text : entry.settings[key];
    if (value === undefined || value === '') storage.remove(key);
    else storage.set(key, value);
  }
}

function libraryEntryTitle(entry) {
  return entry.title || entry.text.trim().split('\n')[0].trim().slice(0, 90) || t('Новый текст');
}

function saveLibraryEntry() {
  const entry = library.entries.find(entry => entry.id === library.activeId);
  if (!entry) return;
  entry.text = libraryReady ? elements.textInput.value : storage.get('text');
  entry.settings = libraryReady ? {
    position: JSON.stringify({ fingerprint: fingerprint(entry.text), word: state.resumeWord }),
    voice: state.selectedVoiceKey, voiceChoice: JSON.stringify(shareVoice(state.selectedVoice)),
    roleMode: String(state.roleMode), roleNames: JSON.stringify(state.roleNames), roleVoices: JSON.stringify(state.roleVoices),
    rate: String(state.rate), font: elements.fontSelect.value, readMode: String(state.readMode),
  } : Object.fromEntries(libraryKeys.filter(key => key !== 'text').map(key => [key, storage.get(key)]));
  entry.updatedAt = Date.now();
  const status = document.querySelector('#libraryStorageStatus');
  try {
    // A shared link often opens in another tab: merge rather than dropping its texts.
    const disk = JSON.parse(localStorage.getItem('voicy:library') || 'null');
    if (disk?.version === 1 && Array.isArray(disk.entries)) {
      for (const other of disk.entries) {
        if (!other || typeof other.id !== 'string' || typeof other.text !== 'string' || !other.settings) continue;
        const index = library.entries.findIndex(item => item.id === other.id);
        if (index === -1) library.entries.push(other);
        else if (other.id !== library.activeId && other.updatedAt > library.entries[index].updatedAt) library.entries[index] = other;
      }
    }
    localStorage.setItem('voicy:library', JSON.stringify(library));
    status.hidden = true;
  } catch {
    status.textContent = t('Не удалось сохранить библиотеку. Хранилище браузера недоступно или заполнено.');
    status.hidden = false;
  }
  document.querySelector('#activeTextTitle').textContent = libraryEntryTitle(entry);
}

function flushLibrary() {
  if (!libraryReady) return;
  savePosition(state.speaking ? state.currentWord : state.resumeWord, true);
  saveLibraryEntry();
}

function closeLibrary() {
  document.querySelector('#libraryDialog').close();
  document.querySelector('#libraryButton').setAttribute('aria-expanded', 'false');
}

function renderLibrary() {
  const list = document.querySelector('#libraryList');
  list.replaceChildren();
  for (const entry of [...library.entries].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const row = document.createElement('div');
    row.className = 'library-entry';
    const selected = entry.id === library.activeId;
    row.classList.toggle('selected', selected);
    const title = document.createElement('input');
    title.className = 'library-entry-title';
    title.type = 'text'; title.maxLength = 120;
    title.setAttribute('aria-label', t('Название текста'));
    title.value = libraryEntryTitle(entry);
    title.addEventListener('change', () => {
      entry.title = title.value.trim().slice(0, 120);
      entry.updatedAt = Date.now();
      saveLibraryEntry();
      title.value = libraryEntryTitle(entry);
    });
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'mode-button library-open';
    let word = 0;
    try { const position = JSON.parse(entry.settings.position || 'null');
      if (position?.fingerprint === fingerprint(entry.text)) word = Number(position.word) || 0;
    } catch {}
    const rate = Number(entry.settings.rate) || 1;
    button.textContent = `${selected ? '✓ ' : '▶ '}${t('Продолжить')} · ${formatTime(word / (2.5 * rate))}`;
    button.setAttribute('aria-label', `${t('Продолжить')}: ${libraryEntryTitle(entry)}`);
    if (selected) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => switchLibraryEntry(entry));
    const preview = document.createElement('p');
    preview.textContent = entry.text.slice(0, 160);
    row.append(title, preview, button);
    list.append(row);
  }
}

function switchLibraryEntry(entry) {
  if (state.childLocked) return;
  flushLibrary();
  entry = library.entries.find(item => item.id === entry.id) || entry;
  stopSpeech(); // Cancels pending TTS callbacks before replacing the active text.
  closeVoicePicker(); closeSections();
  activateLibraryEntry(entry);
  // Incoming-link parameters must not reopen the previous text after a manual switch.
  const url = new URL(location.href);
  url.searchParams.delete('share'); url.hash = '';
  history.replaceState(null, '', url);
  elements.textInput.value = entry.text;
  state.roleMode = storage.get('roleMode') === 'true';
  for (const key of ['roleVoices', 'roleNames']) {
    try { state[key] = Object.assign(Object.create(null), JSON.parse(storage.get(key, '{}'))); }
    catch { state[key] = Object.create(null); }
  }
  state.selectedVoice = null; state.selectedVoiceKey = '';
  restoreStoredCloudVoice(); chooseInitialVoice();
  syncRolesButton();
  selectFont(storage.get('font', 'literary'));
  selectRate(Number(storage.get('rate', '1')) || 1, false, false);
  state.activeSection = -1;
  state.currentWord = 0; state.resumeWord = 0; state.lastSavedWord = -1;
  updateTextMeta();
  const plan = createQueue(entry.text);
  state.totalWords = plan.totalWords;
  state.resumeWord = loadSavedPosition(entry.text, plan.totalWords);
  state.currentWord = state.resumeWord; state.lastSavedWord = state.resumeWord;
  setReadMode(storage.get('readMode') === 'true');
  const item = plan.queue.find(item => state.resumeWord < item.endWord);
  if (item) { highlightSection(item.sectionIndex); highlightCurrentWord(state.resumeWord); }
  setProgress(state.resumeWord);
  updatePlayer('idle', state.resumeWord ? t`Продолжить с ${timeForWord(state.resumeWord)}` : t('Готов к воспроизведению'));
  libraryReady = true;
  saveLibraryEntry();
  invalidatePreparedShare();
  closeLibrary();
  if (!entry.text) elements.textInput.focus();
}

document.querySelector('#libraryButton').addEventListener('click', () => {
  if (state.childLocked) return;
  flushLibrary(); renderLibrary();
  document.querySelector('#libraryDialog').showModal();
  document.querySelector('#libraryButton').setAttribute('aria-expanded', 'true');
});
document.querySelector('#libraryClose').addEventListener('click', closeLibrary);
document.querySelector('#libraryDialog').addEventListener('close', () => {
  document.querySelector('#libraryButton').setAttribute('aria-expanded', 'false');
});
document.querySelector('#libraryDialog').addEventListener('click', event => {
  if (event.target === event.currentTarget) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeLibrary();
  }
});
document.querySelector('#libraryNew').addEventListener('click', () => switchLibraryEntry(makeLibraryEntry()));
window.addEventListener('pagehide', flushLibrary);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushLibrary(); });
