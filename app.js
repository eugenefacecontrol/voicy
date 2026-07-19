const synth = window.speechSynthesis;
const supportsSpeech = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

const elements = {
  textInput: document.querySelector("#textInput"),
  voiceSelect: document.querySelector("#voiceSelect"),
  fontSelect: document.querySelector("#fontSelect"),
  pasteButton: document.querySelector("#pasteButton"),
  clearButton: document.querySelector("#clearButton"),
  playButton: document.querySelector("#playButton"),
  playIcon: document.querySelector("#playIcon"),
  playLabel: document.querySelector("#playLabel"),
  stopButton: document.querySelector("#stopButton"),
  rewindButton: document.querySelector("#rewindButton"),
  forwardButton: document.querySelector("#forwardButton"),
  statusText: document.querySelector("#statusText"),
  sectionCount: document.querySelector("#sectionCount"),
  sectionsDetails: document.querySelector("#sectionsDetails"),
  sectionsList: document.querySelector("#sectionsList"),
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

const state = {
  voices: [],
  rate: 1,
  queue: [],
  queueIndex: 0,
  currentWord: 0,
  totalWords: 0,
  seekWord: null,
  speaking: false,
  paused: false,
  session: 0,
};

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
    const sentences = section.match(/[^.!?…]+(?:[.!?…]+[”»"']*|$)/gu) || [section];
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

function formatTime(seconds) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function renderSections(plan) {
  elements.sectionsList.innerHTML = "";
  elements.sectionsDetails.open = false;
  elements.sectionCount.style.pointerEvents = plan.sections.length ? "auto" : "none";

  plan.sections.forEach((section) => {
    const button = document.createElement("button");
    const seconds = section.startWord / (2.5 * state.rate);
    const time = document.createElement("span");
    const copy = document.createElement("span");
    button.type = "button";
    button.className = "section-jump";
    button.dataset.startWord = String(section.startWord);
    time.className = "section-time";
    time.textContent = formatTime(seconds);
    copy.className = "section-copy";
    copy.textContent = section.preview;
    button.append(time, copy);
    button.setAttribute("aria-label", `Раздел ${section.index + 1}, ${formatTime(seconds)}: ${section.preview}`);
    elements.sectionsList.append(button);
  });
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

function stopSpeech(message = "Остановлено") {
  state.session += 1;
  if (supportsSpeech) synth.cancel();
  state.speaking = false;
  state.paused = false;
  state.queue = [];
  state.queueIndex = 0;
  state.currentWord = 0;
  state.totalWords = 0;
  state.seekWord = null;
  setProgress();
  updatePlayer("idle", message);
}

function speakCurrent(session) {
  if (!state.speaking || session !== state.session) return;

  if (state.queueIndex >= state.queue.length) {
    state.speaking = false;
    state.paused = false;
    elements.progressBar.style.width = "100%";
    updatePlayer("idle", "Готово — весь текст прочитан");
    return;
  }

  const item = state.queue[state.queueIndex];
  const itemWords = item.text.match(/\S+/g) || [];
  const relativeStart = state.seekWord === null ? 0 : Math.max(0, state.seekWord - item.startWord);
  const spokenText = relativeStart ? itemWords.slice(relativeStart).join(" ") : item.text;
  const utterance = new SpeechSynthesisUtterance(spokenText);
  const selectedVoice = state.voices.find((voice) => voice.voiceURI === elements.voiceSelect.value);

  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  }
  utterance.rate = state.rate;

  utterance.onstart = () => {
    if (session !== state.session) return;
    state.currentWord = item.startWord + relativeStart;
    state.seekWord = null;
    setProgress(state.currentWord);
    updatePlayer(
      "playing",
      `Раздел ${item.sectionIndex + 1} из ${item.sectionTotal} · фрагмент ${state.queueIndex + 1} из ${state.queue.length}`,
    );
  };

  utterance.onboundary = (event) => {
    if (session !== state.session || event.name !== "word") return;
    const wordsBefore = spokenText.slice(0, event.charIndex).match(/\S+/g)?.length || 0;
    state.currentWord = Math.min(item.endWord, item.startWord + relativeStart + wordsBefore);
    setProgress(state.currentWord);
  };

  utterance.onend = () => {
    if (session !== state.session || !state.speaking) return;
    state.currentWord = item.endWord;
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

function startSpeech(startWord = 0) {
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
  setProgress(safeWord);
  updatePlayer("playing", "Подготавливаю выбранный фрагмент…");
  speakCurrent(state.session);
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
    elements.textInput.focus();
    updatePlayer("idle", "Текст вставлен и сохранён");
  } catch {
    elements.textInput.focus();
    updatePlayer("idle", "Доступ к буферу закрыт — нажми ⌘V или Ctrl+V");
  }
}

function handlePlay() {
  if (!supportsSpeech) return;

  if (!state.speaking) {
    startSpeech();
  } else if (state.paused) {
    synth.resume();
    state.paused = false;
    updatePlayer("playing", elements.statusText.textContent);
  } else {
    synth.pause();
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

  const previous = storage.get("voice", elements.voiceSelect.value);
  state.voices = voices;
  elements.voiceSelect.innerHTML = "";

  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} · ${voice.lang}${voice.localService ? "" : " · онлайн"}`;
    elements.voiceSelect.append(option);
  });

  const preferred = voices.find((voice) => voice.voiceURI === previous)
    || voices.find((voice) => voice.lang.toLowerCase().startsWith("ru") && voice.default)
    || voices.find((voice) => voice.lang.toLowerCase().startsWith("ru"))
    || voices.find((voice) => voice.default)
    || voices[0];
  elements.voiceSelect.value = preferred.voiceURI;
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
  if (state.speaking) startSpeech(state.currentWord);
}

function selectFont(font) {
  const selected = fontStacks[font] ? font : "literary";
  elements.fontSelect.value = selected;
  document.documentElement.style.setProperty("--font-editor", fontStacks[selected]);
  storage.set("font", selected);
}

function initialize() {
  elements.textInput.value = storage.get("text");
  selectFont(storage.get("font", "literary"));
  selectRate(Number(storage.get("rate", "1")) || 1);
  updateTextMeta();

  if (!supportsSpeech) {
    elements.voiceSelect.innerHTML = '<option value="">Браузер не поддерживает озвучивание</option>';
    elements.playButton.disabled = true;
    updatePlayer("idle", "Открой Voicy в Chrome, Edge или Safari");
    return;
  }

  loadVoices();
  synth.addEventListener?.("voiceschanged", loadVoices);
}

elements.textInput.addEventListener("input", () => {
  updateTextMeta();
  if (state.speaking) stopSpeech("Текст изменён — можно слушать заново");
});

elements.pasteButton.addEventListener("click", pasteText);

elements.clearButton.addEventListener("click", () => {
  stopSpeech("Текст очищен");
  elements.textInput.value = "";
  updateTextMeta();
  elements.textInput.focus();
});

elements.playButton.addEventListener("click", handlePlay);
elements.stopButton.addEventListener("click", () => stopSpeech());
elements.rewindButton.addEventListener("click", () => seekBy(-10));
elements.forwardButton.addEventListener("click", () => seekBy(10));
elements.sectionsList.addEventListener("click", (event) => {
  const button = event.target.closest(".section-jump");
  if (!button) return;
  elements.sectionsDetails.open = false;
  startSpeech(Number(button.dataset.startWord));
});
elements.voiceSelect.addEventListener("change", () => {
  storage.set("voice", elements.voiceSelect.value);
  if (state.speaking) startSpeech(state.currentWord);
});
elements.fontSelect.addEventListener("change", () => selectFont(elements.fontSelect.value));
elements.speedButtons.forEach((button) => {
  button.addEventListener("click", () => selectRate(Number(button.dataset.rate)));
});

window.addEventListener("beforeunload", () => {
  if (supportsSpeech) synth.cancel();
});

initialize();
