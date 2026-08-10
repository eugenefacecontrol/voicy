const synth = window.speechSynthesis;
const supportsSpeech = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const shareApiUrl = document.querySelector('meta[name="voicy-share-api"]')?.content.replace(/\/$/, "") || "";
const maxInlineShareUrlLength = 8000;

const elements = {
  textInput: document.querySelector("#textInput"),
  textPreview: document.querySelector("#textPreview"),
  viewModeButton: document.querySelector("#viewModeButton"),
  viewModeIcon: document.querySelector("#viewModeIcon"),
  viewModeLabel: document.querySelector("#viewModeLabel"),
  voiceSelect: document.querySelector("#voiceSelect"),
  voicePickerButton: document.querySelector("#voicePickerButton"),
  voicePickerName: document.querySelector("#voicePickerName"),
  voicePickerMeta: document.querySelector("#voicePickerMeta"),
  voicePickerPanel: document.querySelector("#voicePickerPanel"),
  voiceSearch: document.querySelector("#voiceSearch"),
  voiceOptions: document.querySelector("#voiceOptions"),
  voiceSearchStatus: document.querySelector("#voiceSearchStatus"),
  voiceHint: document.querySelector("#voiceHint"),
  fontSelect: document.querySelector("#fontSelect"),
  pasteButton: document.querySelector("#pasteButton"),
  shareButton: document.querySelector("#shareButton"),
  shareDialog: document.querySelector("#shareDialog"),
  shareBackdrop: document.querySelector("#shareBackdrop"),
  shareClose: document.querySelector("#shareClose"),
  shareCloudButton: document.querySelector("#shareCloudButton"),
  shareInlineButton: document.querySelector("#shareInlineButton"),
  shareResult: document.querySelector("#shareResult"),
  shareUrl: document.querySelector("#shareUrl"),
  shareSendButton: document.querySelector("#shareSendButton"),
  shareCopyButton: document.querySelector("#shareCopyButton"),
  shareStatus: document.querySelector("#shareStatus"),
  clearButton: document.querySelector("#clearButton"),
  playButton: document.querySelector("#playButton"),
  playIcon: document.querySelector("#playIcon"),
  playLabel: document.querySelector("#playLabel"),
  stopButton: document.querySelector("#stopButton"),
  rewindButton: document.querySelector("#rewindButton"),
  forwardButton: document.querySelector("#forwardButton"),
  statusText: document.querySelector("#statusText"),
  sectionCount: document.querySelector("#sectionCount"),
  sectionsPanel: document.querySelector("#sectionsPanel"),
  sectionsBackdrop: document.querySelector("#sectionsBackdrop"),
  sectionsClose: document.querySelector("#sectionsClose"),
  sectionsList: document.querySelector("#sectionsList"),
  floatingSectionsButton: document.querySelector("#floatingSectionsButton"),
  floatingSectionCount: document.querySelector("#floatingSectionCount"),
  characterCount: document.querySelector("#characterCount"),
  durationEstimate: document.querySelector("#durationEstimate"),
  progressBar: document.querySelector("#progressBar"),
  player: document.querySelector(".player"),
  speedButtons: [...document.querySelectorAll(".speed-button")],
};

const fontStacks = {
  literary: 'Georgia, "Times New Roman", serif',
  modern: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"DM Mono", "SFMono-Regular", Consolas, monospace',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const languageNames = typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["ru"], { type: "language" })
  : null;

function languageLabel(code = "") {
  const language = code.split(/[-_]/)[0].toLowerCase();
  try {
    return languageNames?.of(language) || code;
  } catch {
    return code;
  }
}

const state = {
  voices: [],
  voiceChoices: [],
  selectedVoiceKey: "",
  selectedVoice: null,
  fishAvailable: false,
  fishAudio: null,
  fishAbort: null,
  fishObjectUrl: "",
  rate: 1,
  queue: [],
  queueIndex: 0,
  currentWord: 0,
  totalWords: 0,
  seekWord: null,
  resumeWord: 0,
  lastSavedWord: -1,
  readMode: false,
  activeSection: -1,
  speaking: false,
  paused: false,
  session: 0,
};

let preparedShare = null;
let voiceSearchTimer = null;

const storage = {
  get(key, fallback = "") {
    try {
      return localStorage.getItem(`voicy:${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`voicy:${key}`, value);
    } catch {
      // The app still works when storage is disabled.
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(`voicy:${key}`);
    } catch {
      // The app still works when storage is disabled.
    }
  },
};

function pluralize(number, forms) {
  const mod10 = number % 10;
  const mod100 = number % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function getSections(text) {
  return text
    .trim()
    .split(/\n\s*\n+/)
    .map((section) => section.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function getDisplaySections(text) {
  return text
    .trim()
    .split(/\n\s*\n+/)
    .map((section) => section.trim())
    .filter(Boolean);
}

function normalizeForSpeech(text) {
  return text
    .replace(/&(?:bsol|backslash);|&#0*92;|&#x0*5c;/giu, "")
    .replace(/[\\＼﹨⧵∖]/gu, "")
    .replace(/["'“”«»„‟‹›`]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function compressText(text) {
  if (!("CompressionStream" in window)) throw new Error("Этот браузер не поддерживает сжатие ссылок");
  const stream = new Blob([new TextEncoder().encode(text)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompressText(bytes) {
  if (!("DecompressionStream" in window)) throw new Error("Этот браузер не поддерживает распаковку ссылки");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

async function encryptBytes(bytes) {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  const packet = new Uint8Array(1 + iv.length + ciphertext.length);
  packet[0] = 1;
  packet.set(iv, 1);
  packet.set(ciphertext, 13);
  return { packet, rawKey };
}

async function decryptBytes(packet, rawKey) {
  if (packet.length < 30 || packet[0] !== 1) throw new Error("Неизвестный формат зашифрованной ссылки");
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: packet.slice(1, 13) },
    key,
    packet.slice(13),
  );
  return new Uint8Array(plaintext);
}

function baseShareUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url;
}

function setShareStatus(message = "", type = "") {
  elements.shareStatus.textContent = message;
  elements.shareStatus.className = `share-status${type ? ` ${type}` : ""}`;
}

function setShareBusy(busy) {
  elements.shareCloudButton.disabled = busy || !shareApiUrl;
  elements.shareInlineButton.disabled = busy;
  elements.shareClose.disabled = busy;
}

function openShareDialog() {
  if (!elements.textInput.value.trim()) {
    updatePlayer("idle", "Сначала вставь текст");
    return;
  }
  preparedShare = null;
  elements.shareResult.hidden = true;
  elements.shareUrl.value = "";
  setShareStatus(shareApiUrl ? "" : "Короткая ссылка станет доступна после подключения Cloudflare Worker.");
  elements.shareBackdrop.hidden = false;
  elements.shareDialog.hidden = false;
  elements.shareCloudButton.disabled = !shareApiUrl;
  elements.shareClose.focus();
}

function closeShareDialog() {
  if (elements.shareClose.disabled) return;
  elements.shareBackdrop.hidden = true;
  elements.shareDialog.hidden = true;
  setShareStatus();
}

function prepareShareUrl(url, title) {
  preparedShare = { url, title };
  elements.shareUrl.value = url;
  elements.shareResult.hidden = false;
}

async function copyPreparedShare() {
  if (!preparedShare) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(preparedShare.url);
    } else {
      elements.shareUrl.focus();
      elements.shareUrl.select();
      elements.shareUrl.setSelectionRange(0, preparedShare.url.length);
      if (!document.execCommand("copy")) throw new Error();
    }
    setShareStatus("Ссылка скопирована в буфер обмена.", "success");
  } catch {
    elements.shareUrl.focus();
    elements.shareUrl.select();
    setShareStatus("Выделил ссылку — нажми «Копировать» в меню браузера.");
  }
}

async function sendPreparedShare() {
  if (!preparedShare) return;
  if (navigator.share) {
    try {
      await navigator.share(preparedShare);
      setShareStatus("Ссылка отправлена.", "success");
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        setShareStatus("Отправка отменена.");
        return;
      }
      setShareStatus("Меню отправки не открылось — ссылку можно скопировать ниже.");
      return;
    }
  }

  await copyPreparedShare();
}

async function presentShareUrl(url, title) {
  prepareShareUrl(url, title);
  setShareStatus("Ссылка готова. Можно отправить или скопировать.", "success");
  await sendPreparedShare();
}

async function createInlineShare() {
  setShareBusy(true);
  setShareStatus("Сжимаю текст…");
  try {
    const compressed = await compressText(elements.textInput.value);
    const url = baseShareUrl();
    url.hash = new URLSearchParams({ v: "1", text: bytesToBase64Url(compressed) }).toString();
    if (url.href.length > maxInlineShareUrlLength) {
      throw new Error(`После сжатия ссылка занимает ${url.href.length.toLocaleString("ru-RU")} символов. Используй короткую ссылку.`);
    }
    await presentShareUrl(url.href, "Текст в Voicy");
  } catch (error) {
    setShareStatus(error.message || "Не удалось создать ссылку", "error");
  } finally {
    setShareBusy(false);
  }
}

async function createCloudShare() {
  if (!shareApiUrl) return;
  setShareBusy(true);
  setShareStatus("Сжимаю и шифрую текст…");
  try {
    const compressed = await compressText(elements.textInput.value);
    const { packet, rawKey } = await encryptBytes(compressed);
    const response = await fetch(`${shareApiUrl}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: bytesToBase64Url(packet) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.id) throw new Error(result.error || "Cloudflare не сохранил текст");

    const url = baseShareUrl();
    url.searchParams.set("share", result.id);
    url.hash = new URLSearchParams({ key: bytesToBase64Url(rawKey) }).toString();
    await presentShareUrl(url.href, "Зашифрованный текст в Voicy");
  } catch (error) {
    setShareStatus(error.message || "Не удалось создать короткую ссылку", "error");
  } finally {
    setShareBusy(false);
  }
}

async function loadSharedTextFromUrl() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const cloudId = new URLSearchParams(window.location.search).get("share");

  if (cloudId) {
    if (!shareApiUrl) throw new Error("Cloudflare API ещё не подключён");
    const keyValue = hash.get("key");
    if (!keyValue) throw new Error("В короткой ссылке отсутствует ключ расшифровки");
    const response = await fetch(`${shareApiUrl}/shares/${encodeURIComponent(cloudId)}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.data) throw new Error(result.error || "Текст не найден или уже удалён");
    const compressed = await decryptBytes(base64UrlToBytes(result.data), base64UrlToBytes(keyValue));
    return decompressText(compressed);
  }

  if (hash.get("v") === "1" && hash.get("text")) {
    return decompressText(base64UrlToBytes(hash.get("text")));
  }

  return null;
}

function splitLongPart(part, maxLength) {
  if (part.length <= maxLength) return [part];

  const chunks = [];
  let rest = part;
  while (rest.length > maxLength) {
    const window = rest.slice(0, maxLength + 1);
    const splitAt = Math.max(window.lastIndexOf(", "), window.lastIndexOf(" "));
    const safeSplit = splitAt > maxLength * 0.55 ? splitAt + 1 : maxLength;
    chunks.push(rest.slice(0, safeSplit).trim());
    rest = rest.slice(safeSplit).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function createQueue(text) {
  const sections = getSections(text);
  let wordCursor = 0;
  const sectionData = [];
  const queue = sections.flatMap((section, sectionIndex) => {
    const sectionStartWord = wordCursor;
    const spokenSection = normalizeForSpeech(section);
    const sentences = spokenSection.match(/[^.!?…]+(?:[.!?…]+[”»"']*|$)/gu) || [spokenSection];
    const parts = sentences.flatMap((sentence) => splitLongPart(sentence.trim(), 220)).filter(Boolean);
    const items = parts.map((part) => {
      const wordCount = part.match(/\S+/g)?.length || 0;
      const item = {
        text: part,
        sectionIndex,
        sectionTotal: sections.length,
        startWord: wordCursor,
        endWord: wordCursor + wordCount,
      };
      wordCursor += wordCount;
      return item;
    });
    sectionData.push({
      index: sectionIndex,
      startWord: sectionStartWord,
      preview: section.slice(0, 90),
    });
    return items;
  });
  return { queue, sections: sectionData, totalWords: wordCursor };
}

function createFishQueue(text) {
  const sections = getSections(text);
  let wordCursor = 0;
  const queue = [];

  sections.forEach((section, sectionIndex) => {
    const spokenSection = normalizeForSpeech(section);
    const sentences = spokenSection.match(/[^.!?…]+(?:[.!?…]+|$)/gu) || [spokenSection];
    const chunks = [];
    let chunk = "";

    sentences.flatMap((sentence) => splitLongPart(sentence.trim(), 1_800)).filter(Boolean).forEach((part) => {
      if (chunk && `${chunk} ${part}`.length > 1_800) {
        chunks.push(chunk);
        chunk = part;
      } else {
        chunk = chunk ? `${chunk} ${part}` : part;
      }
    });
    if (chunk) chunks.push(chunk);

    chunks.forEach((part) => {
      const wordCount = part.match(/\S+/g)?.length || 0;
      queue.push({
        text: part,
        sectionIndex,
        sectionTotal: sections.length,
        startWord: wordCursor,
        endWord: wordCursor + wordCount,
      });
      wordCursor += wordCount;
    });
  });

  return { queue, totalWords: wordCursor };
}

function formatTime(seconds) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function fingerprint(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${hash >>> 0}`;
}

function timeForWord(word) {
  return formatTime(word / (2.5 * state.rate));
}

function loadSavedPosition(text, totalWords) {
  try {
    const saved = JSON.parse(storage.get("position", "null"));
    if (!saved || saved.fingerprint !== fingerprint(text)) return 0;
    return Math.max(0, Math.min(Number(saved.word) || 0, Math.max(0, totalWords - 1)));
  } catch {
    return 0;
  }
}

function savePosition(word, force = false) {
  const safeWord = Math.max(0, Math.min(Math.round(word), Math.max(0, state.totalWords - 1)));
  state.resumeWord = safeWord;
  if (!force && Math.abs(safeWord - state.lastSavedWord) < 5) return;
  storage.set("position", JSON.stringify({
    fingerprint: fingerprint(elements.textInput.value),
    word: safeWord,
  }));
  state.lastSavedWord = safeWord;
}

function resetSavedPosition() {
  state.resumeWord = 0;
  state.lastSavedWord = -1;
  storage.remove("position");
}

function closeSections() {
  elements.sectionsPanel.hidden = true;
  elements.sectionsBackdrop.hidden = true;
  elements.sectionCount.setAttribute("aria-expanded", "false");
  elements.floatingSectionsButton.setAttribute("aria-expanded", "false");
}

function renderTextPreview(text) {
  const sections = getDisplaySections(text);
  elements.textPreview.innerHTML = "";

  if (!sections.length) {
    const empty = document.createElement("p");
    empty.className = "preview-empty";
    empty.textContent = "Текст пока пуст. Нажми «Редактировать» или «Вставить текст».";
    elements.textPreview.append(empty);
    return;
  }

  sections.forEach((section, index) => {
    const paragraph = document.createElement("p");
    paragraph.className = "preview-section";
    paragraph.dataset.sectionIndex = String(index);
    paragraph.dataset.sectionNumber = String(index + 1).padStart(2, "0");
    paragraph.textContent = section;
    elements.textPreview.append(paragraph);
  });
}

function highlightSection(sectionIndex, shouldScroll = false, scrollBehavior = "smooth") {
  elements.textPreview.querySelector(".preview-section.active")?.classList.remove("active");
  const section = elements.textPreview.querySelector(`[data-section-index="${sectionIndex}"]`);
  state.activeSection = section ? sectionIndex : -1;
  if (!section) return;
  section.classList.add("active");
  if (shouldScroll) {
    window.requestAnimationFrame(() => {
      const targetTop = window.scrollY + section.getBoundingClientRect().top - (window.innerHeight * 0.32);
      window.scrollTo({ top: Math.max(0, targetTop), behavior: scrollBehavior });
    });
  }
}

function setReadMode(enabled, shouldFocus = false) {
  state.readMode = Boolean(enabled);
  elements.textInput.hidden = state.readMode;
  elements.textPreview.hidden = !state.readMode;
  elements.viewModeButton.setAttribute("aria-pressed", String(state.readMode));
  elements.viewModeIcon.textContent = state.readMode ? "✎" : "Aa";
  elements.viewModeLabel.textContent = state.readMode ? "Редактировать" : "Читать";
  storage.set("readMode", String(state.readMode));
  if (!state.readMode && shouldFocus) elements.textInput.focus();
}

function openSections() {
  if (elements.sectionCount.disabled) return;
  elements.sectionsPanel.hidden = false;
  elements.sectionsBackdrop.hidden = false;
  elements.sectionCount.setAttribute("aria-expanded", "true");
  elements.floatingSectionsButton.setAttribute("aria-expanded", "true");
  elements.sectionsClose.focus();
}

function renderSections(plan) {
  elements.sectionsList.innerHTML = "";
  closeSections();
  elements.sectionCount.disabled = !plan.sections.length;
  elements.floatingSectionsButton.hidden = !plan.sections.length;
  elements.floatingSectionCount.textContent = String(plan.sections.length);

  plan.sections.forEach((section) => {
    const button = document.createElement("button");
    const seconds = section.startWord / (2.5 * state.rate);
    const time = document.createElement("span");
    const copy = document.createElement("span");
    button.type = "button";
    button.className = "section-jump";
    button.dataset.startWord = String(section.startWord);
    button.dataset.sectionIndex = String(section.index);
    time.className = "section-time";
    time.textContent = formatTime(seconds);
    copy.className = "section-copy";
    copy.textContent = section.preview;
    button.append(time, copy);
    button.setAttribute("aria-label", `Раздел ${section.index + 1}, ${formatTime(seconds)}: ${section.preview}`);
    elements.sectionsList.append(button);
  });
}

function closeVoicePicker() {
  elements.voicePickerPanel.hidden = true;
  elements.voicePickerButton.setAttribute("aria-expanded", "false");
}

function openVoicePicker() {
  elements.voicePickerPanel.hidden = false;
  elements.voicePickerButton.setAttribute("aria-expanded", "true");
  elements.voiceSearch.focus();
}

function renderVoiceChoices(filter = elements.voiceSearch.value) {
  const query = filter.trim().toLocaleLowerCase("ru");
  const choices = state.voiceChoices.filter((voice) => (
    !query || `${voice.name} ${voice.meta} ${voice.provider}`.toLocaleLowerCase("ru").includes(query)
  ));
  elements.voiceOptions.innerHTML = "";

  [
    ["system", "Голоса устройства"],
    ["fish", "Fish Audio · Free API"],
  ].forEach(([provider, label]) => {
    const group = choices.filter((voice) => voice.provider === provider);
    if (!group.length) return;

    const heading = document.createElement("p");
    heading.className = "voice-group-label";
    heading.textContent = label;
    elements.voiceOptions.append(heading);

    group.forEach((voice) => {
      const button = document.createElement("button");
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      const meta = document.createElement("small");
      const badge = document.createElement("span");
      button.type = "button";
      button.className = "voice-option";
      button.dataset.voiceKey = voice.key;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(voice.key === state.selectedVoiceKey));
      name.textContent = voice.name;
      meta.textContent = voice.meta;
      badge.className = "voice-badge";
      badge.textContent = provider === "fish" ? "Fish" : (voice.lang || "Local");
      copy.append(name, meta);
      button.append(copy, badge);
      elements.voiceOptions.append(button);
    });
  });

  if (!choices.length) {
    const empty = document.createElement("p");
    empty.className = "voice-search-status";
    empty.textContent = state.fishAvailable ? "Ничего не найдено. Попробуй имя или язык." : "Среди голосов устройства ничего не найдено.";
    elements.voiceOptions.append(empty);
  }
}

function selectVoiceChoice(voice, restart = true) {
  if (!voice) return;
  state.selectedVoice = voice;
  state.selectedVoiceKey = voice.key;
  storage.set("voice", voice.key);
  elements.voicePickerName.textContent = voice.name;
  elements.voicePickerMeta.textContent = voice.meta;
  renderVoiceChoices();
  closeVoicePicker();
  if (restart && state.speaking) startSpeech(state.currentWord);
}

function chooseInitialVoice() {
  if (state.selectedVoice) return;
  const saved = storage.get("voice");
  const preferred = state.voiceChoices.find((voice) => voice.key === saved)
    || state.voiceChoices.find((voice) => voice.provider === "system" && voice.lang?.toLowerCase().startsWith("ru") && voice.isDefault)
    || state.voiceChoices.find((voice) => voice.provider === "system" && voice.lang?.toLowerCase().startsWith("ru"))
    || state.voiceChoices[0];
  selectVoiceChoice(preferred, false);
}

async function loadFishVoices(query = "") {
  if (!state.fishAvailable || !shareApiUrl) return;
  elements.voiceSearchStatus.textContent = "Ищу голоса Fish Audio…";
  try {
    const response = await fetch(`${shareApiUrl}/fish/voices?q=${encodeURIComponent(query)}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Каталог Fish Audio недоступен");
    const fishChoices = (result.items || []).map((voice) => ({
      key: `fish:${voice.id}`,
      id: voice.id,
      provider: "fish",
      name: voice.title,
      lang: (voice.languages || []).map(languageLabel).join(", "),
      meta: `${(voice.languages || []).map(languageLabel).join(", ") || "мультиязычный"} · модель сообщества · ${voice.author}`,
    }));
    state.voiceChoices = [
      ...state.voiceChoices.filter((voice) => voice.provider !== "fish"),
      ...fishChoices,
    ];
    elements.voiceSearchStatus.textContent = `${fishChoices.length} голосов Fish · бесплатная модель`;
    renderVoiceChoices(query);
    const savedFish = fishChoices.find((voice) => voice.key === storage.get("voice"));
    if (savedFish && state.selectedVoiceKey !== savedFish.key) selectVoiceChoice(savedFish, false);
    else chooseInitialVoice();
  } catch (error) {
    elements.voiceSearchStatus.textContent = error.message || "Fish Audio временно недоступен";
  }
}

async function loadFishStatus() {
  if (!shareApiUrl) return;
  try {
    const response = await fetch(`${shareApiUrl}/fish/status`);
    const result = await response.json().catch(() => ({}));
    state.fishAvailable = response.ok && result.enabled && result.available;
    if (state.fishAvailable) {
      elements.voiceHint.textContent = "Системные голоса и Fish Audio s2.1-pro-free · $0 по Fair Use";
      await loadFishVoices();
    }
  } catch {
    state.fishAvailable = false;
  }
}

function updateTextMeta() {
  const text = elements.textInput.value;
  const plan = createQueue(text);
  const sections = plan.sections.length;
  const words = plan.totalWords;
  const minutes = words ? Math.max(1, Math.ceil(words / (150 * state.rate))) : 0;

  elements.sectionCount.textContent = `${sections} ${pluralize(sections, ["раздел", "раздела", "разделов"])}`;
  elements.characterCount.textContent = `${text.length} ${pluralize(text.length, ["символ", "символа", "символов"])}`;
  elements.durationEstimate.textContent = `≈ ${minutes} мин`;
  if (!state.speaking) state.totalWords = plan.totalWords;
  renderTextPreview(text);
  if (state.activeSection >= 0) highlightSection(state.activeSection);
  renderSections(plan);
  storage.set("text", text);
}

function updatePlayer(mode, message) {
  const labels = {
    idle: ["▶", "Слушать"],
    playing: ["❚❚", "Пауза"],
    paused: ["▶", "Продолжить"],
  };
  const [icon, label] = labels[mode];
  elements.playIcon.textContent = icon;
  elements.playLabel.textContent = label;
  elements.statusText.textContent = message;
  elements.stopButton.disabled = mode === "idle";
  elements.rewindButton.disabled = mode === "idle";
  elements.forwardButton.disabled = mode === "idle";
  elements.player.classList.toggle("playing", mode === "playing");
}

function setProgress(word = 0) {
  const percent = state.totalWords ? (word / state.totalWords) * 100 : 0;
  elements.progressBar.style.width = `${percent}%`;
}

function stopSpeech(message = "Остановлено", preservePosition = true) {
  if (preservePosition && state.speaking && state.currentWord > 0) savePosition(state.currentWord, true);
  if (!preservePosition) resetSavedPosition();
  state.session += 1;
  if (supportsSpeech) synth.cancel();
  state.fishAbort?.abort();
  state.fishAbort = null;
  if (state.fishAudio) {
    state.fishAudio.ontimeupdate = null;
    state.fishAudio.onended = null;
    state.fishAudio.onerror = null;
    state.fishAudio.pause();
    state.fishAudio.removeAttribute("src");
    state.fishAudio.load();
    state.fishAudio = null;
  }
  if (state.fishObjectUrl) URL.revokeObjectURL(state.fishObjectUrl);
  state.fishObjectUrl = "";
  state.speaking = false;
  state.paused = false;
  state.queue = [];
  state.queueIndex = 0;
  state.currentWord = state.resumeWord;
  state.totalWords = createQueue(elements.textInput.value).totalWords;
  state.seekWord = null;
  setProgress(state.resumeWord);
  const resume = state.resumeWord > 0 ? ` · продолжить с ${timeForWord(state.resumeWord)}` : "";
  updatePlayer("idle", `${message}${resume}`);
}

function speakCurrent(session) {
  if (!state.speaking || session !== state.session) return;

  if (state.queueIndex >= state.queue.length) {
    state.speaking = false;
    state.paused = false;
    resetSavedPosition();
    elements.progressBar.style.width = "100%";
    updatePlayer("idle", "Готово — весь текст прочитан");
    return;
  }

  const item = state.queue[state.queueIndex];
  const itemWords = item.text.match(/\S+/g) || [];
  const relativeStart = state.seekWord === null ? 0 : Math.max(0, state.seekWord - item.startWord);
  const spokenText = relativeStart ? itemWords.slice(relativeStart).join(" ") : item.text;
  const utterance = new SpeechSynthesisUtterance(spokenText);
  const selectedVoice = state.voices.find((voice) => voice.voiceURI === state.selectedVoice?.id);

  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  }
  utterance.rate = state.rate;

  utterance.onstart = () => {
    if (session !== state.session) return;
    state.currentWord = item.startWord + relativeStart;
    state.seekWord = null;
    savePosition(state.currentWord, true);
    setProgress(state.currentWord);
    highlightSection(item.sectionIndex, state.readMode, "auto");
    updatePlayer(
      "playing",
      `Раздел ${item.sectionIndex + 1} из ${item.sectionTotal} · фрагмент ${state.queueIndex + 1} из ${state.queue.length}`,
    );
  };

  utterance.onboundary = (event) => {
    if (session !== state.session || event.name !== "word") return;
    const wordsBefore = spokenText.slice(0, event.charIndex).match(/\S+/g)?.length || 0;
    state.currentWord = Math.min(item.endWord, item.startWord + relativeStart + wordsBefore);
    savePosition(state.currentWord);
    setProgress(state.currentWord);
  };

  utterance.onend = () => {
    if (session !== state.session || !state.speaking) return;
    state.currentWord = item.endWord;
    savePosition(state.currentWord, true);
    state.queueIndex += 1;
    setProgress(state.currentWord);
    speakCurrent(session);
  };

  utterance.onerror = (event) => {
    if (session !== state.session || event.error === "canceled" || event.error === "interrupted") return;
    stopSpeech("Не удалось воспроизвести этот голос");
  };

  synth.speak(utterance);
}

function startSystemSpeech(startWord = 0) {
  if (!supportsSpeech) return;

  const text = elements.textInput.value.trim();
  if (!text) {
    elements.textInput.focus();
    updatePlayer("idle", "Сначала вставь текст");
    return;
  }

  state.session += 1;
  synth.cancel();
  const plan = createQueue(text);
  const safeWord = Math.max(0, Math.min(startWord, Math.max(0, plan.totalWords - 1)));
  state.queue = plan.queue;
  state.totalWords = plan.totalWords;
  state.currentWord = safeWord;
  state.queueIndex = Math.max(0, state.queue.findIndex((item) => safeWord < item.endWord));
  state.seekWord = safeWord;
  state.speaking = true;
  state.paused = false;
  savePosition(safeWord, true);
  setProgress(safeWord);
  updatePlayer("playing", "Подготавливаю выбранный фрагмент…");
  speakCurrent(state.session);
}

async function speakCurrentFish(session) {
  if (!state.speaking || session !== state.session) return;
  if (state.queueIndex >= state.queue.length) {
    state.speaking = false;
    state.paused = false;
    resetSavedPosition();
    elements.progressBar.style.width = "100%";
    updatePlayer("idle", "Готово — весь текст прочитан Fish Audio");
    return;
  }

  const item = state.queue[state.queueIndex];
  const itemWords = item.text.match(/\S+/g) || [];
  const relativeStart = state.seekWord === null ? 0 : Math.max(0, state.seekWord - item.startWord);
  const spokenText = relativeStart ? itemWords.slice(relativeStart).join(" ") : item.text;
  const segmentStartWord = item.startWord + relativeStart;
  state.seekWord = null;
  state.currentWord = segmentStartWord;
  savePosition(state.currentWord, true);
  setProgress(state.currentWord);
  highlightSection(item.sectionIndex, state.readMode, "auto");
  updatePlayer("playing", `Fish Audio готовит раздел ${item.sectionIndex + 1} из ${item.sectionTotal}…`);

  const controller = new AbortController();
  state.fishAbort = controller;
  try {
    const response = await fetch(`${shareApiUrl}/fish/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spokenText, referenceId: state.selectedVoice.id }),
      signal: controller.signal,
    });
    if (session !== state.session) return;
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Fish Audio не сгенерировал аудио");
    }

    const blob = await response.blob();
    if (session !== state.session) return;
    if (state.fishObjectUrl) URL.revokeObjectURL(state.fishObjectUrl);
    state.fishObjectUrl = URL.createObjectURL(blob);
    const audio = new Audio(state.fishObjectUrl);
    state.fishAudio = audio;
    audio.playbackRate = state.rate;
    audio.preservesPitch = true;

    audio.ontimeupdate = () => {
      if (session !== state.session || !Number.isFinite(audio.duration) || !audio.duration) return;
      const fraction = Math.min(1, audio.currentTime / audio.duration);
      state.currentWord = Math.min(item.endWord, Math.round(segmentStartWord + ((item.endWord - segmentStartWord) * fraction)));
      savePosition(state.currentWord);
      setProgress(state.currentWord);
    };
    audio.onended = () => {
      if (session !== state.session || !state.speaking) return;
      state.currentWord = item.endWord;
      savePosition(state.currentWord, true);
      state.queueIndex += 1;
      setProgress(state.currentWord);
      speakCurrentFish(session);
    };
    audio.onerror = () => {
      if (session === state.session) stopSpeech("Не удалось воспроизвести аудио Fish");
    };

    updatePlayer(
      "playing",
      `Fish · раздел ${item.sectionIndex + 1} из ${item.sectionTotal} · фрагмент ${state.queueIndex + 1} из ${state.queue.length}`,
    );
    try {
      await audio.play();
    } catch {
      state.paused = true;
      updatePlayer("paused", "Аудио Fish готово — нажми «Продолжить»");
    }
  } catch (error) {
    if (error.name !== "AbortError" && session === state.session) {
      stopSpeech(error.message || "Fish Audio временно недоступен");
    }
  } finally {
    if (state.fishAbort === controller) state.fishAbort = null;
  }
}

function startFishSpeech(startWord = 0) {
  const text = elements.textInput.value.trim();
  if (!text) {
    elements.textInput.focus();
    updatePlayer("idle", "Сначала вставь текст");
    return;
  }

  state.session += 1;
  if (supportsSpeech) synth.cancel();
  state.fishAbort?.abort();
  if (state.fishAudio) {
    state.fishAudio.ontimeupdate = null;
    state.fishAudio.onended = null;
    state.fishAudio.onerror = null;
    state.fishAudio.pause();
    state.fishAudio = null;
  }
  if (state.fishObjectUrl) URL.revokeObjectURL(state.fishObjectUrl);
  state.fishObjectUrl = "";
  const plan = createFishQueue(text);
  const safeWord = Math.max(0, Math.min(startWord, Math.max(0, plan.totalWords - 1)));
  state.queue = plan.queue;
  state.totalWords = plan.totalWords;
  state.currentWord = safeWord;
  state.queueIndex = Math.max(0, state.queue.findIndex((item) => safeWord < item.endWord));
  state.seekWord = safeWord;
  state.speaking = true;
  state.paused = false;
  savePosition(safeWord, true);
  setProgress(safeWord);
  speakCurrentFish(state.session);
}

function startSpeech(startWord = 0) {
  if (state.selectedVoice?.provider === "fish") startFishSpeech(startWord);
  else startSystemSpeech(startWord);
}

function seekBy(seconds) {
  if (!state.speaking) return;
  const wordDelta = Math.round(seconds * 2.5 * state.rate);
  startSpeech(state.currentWord + wordDelta);
}

async function pasteText() {
  try {
    const clipboardText = await navigator.clipboard.readText();
    if (!clipboardText) {
      updatePlayer("idle", "В буфере обмена нет текста");
      return;
    }
    const start = elements.textInput.selectionStart;
    const end = elements.textInput.selectionEnd;
    elements.textInput.setRangeText(clipboardText, start, end, "end");
    elements.textInput.dispatchEvent(new Event("input", { bubbles: true }));
    setReadMode(true);
    updatePlayer("idle", "Текст вставлен и сохранён");
  } catch {
    elements.textInput.focus();
    updatePlayer("idle", "Доступ к буферу закрыт — нажми ⌘V или Ctrl+V");
  }
}

async function handlePlay() {
  if (!state.speaking) {
    startSpeech(state.resumeWord);
  } else if (state.paused) {
    if (state.selectedVoice?.provider === "fish" && state.fishAudio) {
      try {
        await state.fishAudio.play();
      } catch {
        updatePlayer("paused", "Браузер не разрешил запуск аудио");
        return;
      }
    } else {
      synth.resume();
    }
    state.paused = false;
    updatePlayer("playing", elements.statusText.textContent);
  } else {
    if (state.selectedVoice?.provider === "fish") state.fishAudio?.pause();
    else synth.pause();
    state.paused = true;
    updatePlayer("paused", "Воспроизведение на паузе");
  }
}

function loadVoices() {
  if (!supportsSpeech) return;

  const voices = synth.getVoices().sort((a, b) => {
    const russianA = a.lang.toLowerCase().startsWith("ru") ? 0 : 1;
    const russianB = b.lang.toLowerCase().startsWith("ru") ? 0 : 1;
    return russianA - russianB || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name);
  });

  if (!voices.length) return;

  state.voices = voices;
  const systemChoices = voices.map((voice) => ({
    key: `system:${voice.voiceURI}`,
    id: voice.voiceURI,
    provider: "system",
    name: voice.name,
    lang: voice.lang,
    isDefault: voice.default,
    meta: `${languageLabel(voice.lang)} · ${voice.lang}${voice.localService ? " · на устройстве" : " · системный онлайн"}`,
  }));
  state.voiceChoices = [
    ...systemChoices,
    ...state.voiceChoices.filter((voice) => voice.provider === "fish"),
  ];
  chooseInitialVoice();
  renderVoiceChoices();
}

function selectRate(rate) {
  state.rate = rate;
  elements.speedButtons.forEach((button) => {
    const active = Number(button.dataset.rate) === rate;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  storage.set("rate", String(rate));
  updateTextMeta();
  if (state.speaking) {
    if (state.selectedVoice?.provider === "fish" && state.fishAudio) state.fishAudio.playbackRate = rate;
    else startSpeech(state.currentWord);
  }
}

function selectFont(font) {
  const selected = fontStacks[font] ? font : "literary";
  elements.fontSelect.value = selected;
  document.documentElement.style.setProperty("--font-editor", fontStacks[selected]);
  storage.set("font", selected);
}

async function initialize() {
  let sharedText = null;
  let shareLoadError = "";
  try {
    sharedText = await loadSharedTextFromUrl();
  } catch (error) {
    shareLoadError = error.message || "Не удалось открыть общую ссылку";
  }

  elements.textInput.value = sharedText ?? storage.get("text");
  if (sharedText !== null) {
    resetSavedPosition();
    storage.set("readMode", "true");
  }
  selectFont(storage.get("font", "literary"));
  selectRate(Number(storage.get("rate", "1")) || 1);
  updateTextMeta();
  const initialPlan = createQueue(elements.textInput.value);
  state.totalWords = initialPlan.totalWords;
  state.resumeWord = loadSavedPosition(elements.textInput.value, initialPlan.totalWords);
  state.currentWord = state.resumeWord;
  state.lastSavedWord = state.resumeWord;
  const savedMode = storage.get("readMode");
  setReadMode(savedMode ? savedMode === "true" : Boolean(elements.textInput.value.trim()));
  const resumeItem = initialPlan.queue.find((item) => state.resumeWord < item.endWord);
  if (resumeItem) highlightSection(resumeItem.sectionIndex);
  if (state.resumeWord > 0) {
    setProgress(state.resumeWord);
    updatePlayer("idle", `Продолжить с ${timeForWord(state.resumeWord)}`);
  } else if (sharedText !== null) {
    updatePlayer("idle", "Общий текст загружен — можно слушать");
  } else if (shareLoadError) {
    updatePlayer("idle", shareLoadError);
  }

  if (supportsSpeech) {
    loadVoices();
    synth.addEventListener?.("voiceschanged", loadVoices);
  }
  await loadFishStatus();

  if (!supportsSpeech && !state.fishAvailable) {
    elements.voicePickerName.textContent = "Голоса недоступны";
    elements.playButton.disabled = true;
    updatePlayer("idle", "Открой Voicy в Chrome, Edge или Safari");
    return;
  }
}

elements.textInput.addEventListener("input", () => {
  if (state.speaking) stopSpeech("Текст изменён — можно слушать заново", false);
  else resetSavedPosition();
  updateTextMeta();
});

elements.pasteButton.addEventListener("click", pasteText);
elements.shareButton.addEventListener("click", openShareDialog);
elements.shareClose.addEventListener("click", closeShareDialog);
elements.shareBackdrop.addEventListener("click", closeShareDialog);
elements.shareInlineButton.addEventListener("click", createInlineShare);
elements.shareCloudButton.addEventListener("click", createCloudShare);
elements.shareSendButton.addEventListener("click", sendPreparedShare);
elements.shareCopyButton.addEventListener("click", copyPreparedShare);
elements.voicePickerButton.addEventListener("click", () => {
  if (elements.voicePickerPanel.hidden) openVoicePicker();
  else closeVoicePicker();
});
elements.voiceOptions.addEventListener("click", (event) => {
  const button = event.target.closest(".voice-option");
  if (!button) return;
  selectVoiceChoice(state.voiceChoices.find((voice) => voice.key === button.dataset.voiceKey));
});
elements.voiceSearch.addEventListener("input", () => {
  renderVoiceChoices();
  window.clearTimeout(voiceSearchTimer);
  voiceSearchTimer = window.setTimeout(() => loadFishVoices(elements.voiceSearch.value), 350);
});
elements.viewModeButton.addEventListener("click", () => {
  setReadMode(!state.readMode, state.readMode);
});

elements.clearButton.addEventListener("click", () => {
  stopSpeech("Текст очищен", false);
  elements.textInput.value = "";
  updateTextMeta();
  setReadMode(false, true);
});

elements.playButton.addEventListener("click", handlePlay);
elements.stopButton.addEventListener("click", () => stopSpeech());
elements.rewindButton.addEventListener("click", () => seekBy(-10));
elements.forwardButton.addEventListener("click", () => seekBy(10));
elements.sectionCount.addEventListener("click", () => {
  if (elements.sectionsPanel.hidden) openSections();
  else closeSections();
});
elements.floatingSectionsButton.addEventListener("click", () => {
  if (elements.sectionsPanel.hidden) openSections();
  else closeSections();
});
elements.sectionsClose.addEventListener("click", closeSections);
elements.sectionsBackdrop.addEventListener("click", closeSections);
elements.sectionsList.addEventListener("click", (event) => {
  const button = event.target.closest(".section-jump");
  if (!button) return;
  closeSections();
  setReadMode(true);
  highlightSection(Number(button.dataset.sectionIndex), true, "auto");
  startSpeech(Number(button.dataset.startWord));
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.sectionsPanel.hidden) closeSections();
  if (event.key === "Escape" && !elements.shareDialog.hidden) closeShareDialog();
  if (event.key === "Escape" && !elements.voicePickerPanel.hidden) closeVoicePicker();
});
document.addEventListener("click", (event) => {
  if (!elements.voicePickerPanel.hidden && !event.target.closest(".voice-field")) closeVoicePicker();
});
elements.fontSelect.addEventListener("change", () => selectFont(elements.fontSelect.value));
elements.speedButtons.forEach((button) => {
  button.addEventListener("click", () => selectRate(Number(button.dataset.rate)));
});

window.addEventListener("beforeunload", () => {
  if (supportsSpeech) synth.cancel();
  state.fishAudio?.pause();
  if (state.fishObjectUrl) URL.revokeObjectURL(state.fishObjectUrl);
});

initialize().catch(() => updatePlayer("idle", "Не удалось запустить Voicy"));
