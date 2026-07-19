const synth = window.speechSynthesis;
const supportsSpeech = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

const elements = {
  textInput: document.querySelector("#textInput"),
  voiceSelect: document.querySelector("#voiceSelect"),
  fontSelect: document.querySelector("#fontSelect"),
  clearButton: document.querySelector("#clearButton"),
  playButton: document.querySelector("#playButton"),
  playIcon: document.querySelector("#playIcon"),
  playLabel: document.querySelector("#playLabel"),
  stopButton: document.querySelector("#stopButton"),
  statusText: document.querySelector("#statusText"),
  sectionCount: document.querySelector("#sectionCount"),
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
  return sections.flatMap((section, sectionIndex) => {
    const sentences = section.match(/[^.!?…]+(?:[.!?…]+[”»"']*|$)/gu) || [section];
    const parts = sentences.flatMap((sentence) => splitLongPart(sentence.trim(), 220)).filter(Boolean);
    return parts.map((part) => ({ text: part, sectionIndex, sectionTotal: sections.length }));
  });
}

function updateTextMeta() {
  const text = elements.textInput.value;
  const sections = getSections(text).length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const minutes = words ? Math.max(1, Math.ceil(words / (150 * state.rate))) : 0;

  elements.sectionCount.textContent = `${sections} ${pluralize(sections, ["раздел", "раздела", "разделов"])}`;
  elements.characterCount.textContent = `${text.length} ${pluralize(text.length, ["символ", "символа", "символов"])}`;
  elements.durationEstimate.textContent = `≈ ${minutes} мин`;
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
  elements.player.classList.toggle("playing", mode === "playing");
}

function setProgress(index = 0) {
  const percent = state.queue.length ? (index / state.queue.length) * 100 : 0;
  elements.progressBar.style.width = `${percent}%`;
}

function stopSpeech(message = "Остановлено") {
  state.session += 1;
  if (supportsSpeech) synth.cancel();
  state.speaking = false;
  state.paused = false;
  state.queue = [];
  state.queueIndex = 0;
  setProgress(0);
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
  const utterance = new SpeechSynthesisUtterance(item.text);
  const selectedVoice = state.voices.find((voice) => voice.voiceURI === elements.voiceSelect.value);

  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  }
  utterance.rate = state.rate;

  utterance.onstart = () => {
    if (session !== state.session) return;
    setProgress(state.queueIndex);
    updatePlayer(
      "playing",
      `Раздел ${item.sectionIndex + 1} из ${item.sectionTotal} · фрагмент ${state.queueIndex + 1} из ${state.queue.length}`,
    );
  };

  utterance.onend = () => {
    if (session !== state.session || !state.speaking) return;
    state.queueIndex += 1;
    setProgress(state.queueIndex);
    speakCurrent(session);
  };

  utterance.onerror = (event) => {
    if (session !== state.session || event.error === "canceled" || event.error === "interrupted") return;
    stopSpeech("Не удалось воспроизвести этот голос");
  };

  synth.speak(utterance);
}

function startSpeech() {
  const text = elements.textInput.value.trim();
  if (!text) {
    elements.textInput.focus();
    updatePlayer("idle", "Сначала вставь текст");
    return;
  }

  state.session += 1;
  synth.cancel();
  state.queue = createQueue(text);
  state.queueIndex = 0;
  state.speaking = true;
  state.paused = false;
  speakCurrent(state.session);
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
  if (state.speaking) startSpeech();
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

elements.clearButton.addEventListener("click", () => {
  stopSpeech("Текст очищен");
  elements.textInput.value = "";
  updateTextMeta();
  elements.textInput.focus();
});

elements.playButton.addEventListener("click", handlePlay);
elements.stopButton.addEventListener("click", () => stopSpeech());
elements.voiceSelect.addEventListener("change", () => {
  storage.set("voice", elements.voiceSelect.value);
  if (state.speaking) startSpeech();
});
elements.fontSelect.addEventListener("change", () => selectFont(elements.fontSelect.value));
elements.speedButtons.forEach((button) => {
  button.addEventListener("click", () => selectRate(Number(button.dataset.rate)));
});

window.addEventListener("beforeunload", () => {
  if (supportsSpeech) synth.cancel();
});

initialize();
