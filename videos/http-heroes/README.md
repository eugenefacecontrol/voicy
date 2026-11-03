# HTTP Heroes — комикс с озвучкой

Пробный вертикальный ролик про HTTP 200, 201 и 204: 720×1280, 30 fps, 16,4 секунды. Визуальная часть нарисована в SVG и анимирована через Remotion; английская озвучка получена через существующий Fish Audio API в Voicy.

## Что где находится

- `narration-request.json` — текст озвучки и выбранный `referenceId`.
- `public/narration.mp3` — сохранённая исходная озвучка.
- `studio/public/narration.mp3` — звук, который использует Remotion.
- `studio/src/Hero.tsx` — SVG персонажа.
- `studio/src/Composition.tsx` — сцены, подписи и анимация; `start` / `end` заданы в секундах.
- `studio/src/Root.tsx` — подключение аудио, размер, fps и длительность композиции.
- `out/http-heroes-preview.mp4` — экспортированный ролик; папка исключена из Git.

Текущий голос: **Andrew: English Man (US) — Storytelling, Deep**, ID `d67524ad1936410896ad120583cb1117`. Это голос рассказчика. Для новых голосов используйте собственные, лицензированные или предоставленные с разрешением владельца.

## Подготовка

Нужны Node.js (поддерживаемые версии указаны в `studio/package.json`), npm, Python 3, curl и FFmpeg с ffprobe. На macOS FFmpeg можно установить через `brew install ffmpeg`.

Все команды ниже выполняются в Terminal. Сначала перейдите в папку проекта:

```sh
cd /Users/yauhenisheima/Sources/voicy/videos/http-heroes
```

Установите зависимости и откройте редактор:

```sh
(cd studio && npm ci)
(cd studio && npm run dev)
```

Адрес редактора появится в терминале. При занятом порте он может отличаться от `http://localhost:3000`.

Skills, использованные для прототипа: `remotion-best-practices`, `remotion-create`, `remotion-markup`, `remotion-render`, `fish-audio-api`. Для запуска готового проекта они не обязательны. Atlas Cloud и Vox Director в этой версии не используются.

## 1. Проверить Fish Audio

Проект использует опубликованный Voicy Worker. Ключ Fish хранится на сервере, поэтому вводить его локально не требуется.

```sh
curl --fail-with-body -sS --max-time 30 \
  'https://voicy-share.eugenefacecontrol.workers.dev/fish/status' \
  -H 'Origin: https://eugenefacecontrol.github.io'
```

`available: true` показывает доступность проверки сервиса. Баланс и флаги бесплатных кредитов сами по себе не гарантируют успех или отказ генерации — итог определяется ответом `/fish/tts`.

## 2. Найти голос

Замените `English` на поисковую строку, например `Andrew` или `narrator`:

```sh
curl --fail-with-body -sS --max-time 30 --get \
  'https://voicy-share.eugenefacecontrol.workers.dev/fish/voices' \
  -H 'Origin: https://eugenefacecontrol.github.io' \
  --data-urlencode 'q=English' \
  -o /tmp/http-heroes-voices.json

python3 - <<'PY'
import json
with open('/tmp/http-heroes-voices.json') as f:
    voices = json.load(f)
for voice in voices.get('items', []):
    print(voice['id'], '—', voice['title'])
PY
```

Worker возвращает до 50 результатов. Название помогает найти голос, но не подтверждает права на его использование.

## 3. Подготовить текст

Откройте `narration-request.json` в редакторе. Поле `text` содержит произносимый текст, `referenceId` — ID голоса. Используйте текущее содержимое как пример JSON.

В этой версии Worker принимает до 2000 символов за запрос и требует ID из 32 шестнадцатеричных символов. Он сам выбирает модель `s2.1-pro-free`; передавать ключ или модель в JSON не нужно.

Произношение кодов лучше задавать словами: `two hundred`, `two oh one`, `two oh four`. Изменение текста в JSON не меняет подписи и тайминг сцен — они редактируются отдельно в `Composition.tsx`.

## 4. Сгенерировать и прослушать озвучку

Сначала сохраняем ответ во временный файл и проверяем, что он действительно декодируется как аудио. При ошибке существующий звук остаётся на месте.

```sh
(
  set -e
  mkdir -p public studio/public
  candidate=$(mktemp /tmp/http-heroes-audio.XXXXXX)
  trap 'rm -f "$candidate"' EXIT

  curl --fail-with-body -sS --max-time 120 \
    'https://voicy-share.eugenefacecontrol.workers.dev/fish/tts' \
    -H 'Origin: https://eugenefacecontrol.github.io' \
    -H 'Content-Type: application/json' \
    --data-binary @narration-request.json \
    -o "$candidate"

  ffmpeg -v error -xerror -i "$candidate" -f null -
  cp "$candidate" public/narration.mp3
  cp "$candidate" studio/public/narration.mp3
)
```

Прослушать на macOS:

```sh
afplay public/narration.mp3
```

Узнать длительность:

```sh
ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 public/narration.mp3
```

Повторная генерация может расходовать квоту или баланс Fish Audio согласно условиям аккаунта. Рендер уже сохранённой озвучки новых запросов к Fish не делает.

## 5. Подстроить сцены и экспортировать видео

Новый голос может говорить быстрее или медленнее предыдущего. В `Composition.tsx` скорректируйте границы сцен по смысловым паузам. В `Root.tsx` задайте `durationInFrames`: длительность в секундах × 30, округлённая вверх, плюс при необходимости время на финальную карточку.

Исходная озвучка длится 15,568875 секунды, композиция — 492 кадра, то есть 16,4 секунды. Текст в облачках — краткие пояснения, а не дословные субтитры с автоматической синхронизацией.

Проверка исходников и экспорт:

```sh
(cd studio && npm run lint)
(cd studio && npx remotion render src/index.ts HttpHeroes \
  ../out/http-heroes-preview.mp4 --concurrency=2)
```

Проверить готовый файл:

```sh
ffprobe -v error -show_entries stream=codec_name,width,height \
  -show_entries format=duration -of json out/http-heroes-preview.mp4
ffmpeg -v error -xerror -i out/http-heroes-preview.mp4 -f null -
```

## Быстро заменить звук в готовом MP4

Если менять визуальную часть не нужно, FFmpeg может заменить аудиодорожку без повторного рендера кадров. Команда ниже использует новую озвучку из `public/narration.mp3`, сохраняет длительность исходного видео и дополняет короткое аудио тишиной:

```sh
ffmpeg -n -i out/http-heroes-preview.mp4 -i public/narration.mp3 \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k \
  -af apad -shortest -movflags +faststart \
  out/http-heroes-new-audio.mp4
```

Если новая озвучка длиннее видео, её конец будет обрезан. В таком случае увеличьте длительность композиции и пересоберите через Remotion. Замена дорожки через FFmpeg не пересчитывает моменты появления кодов и текста. `-n` защищает существующий выходной файл от перезаписи.

## Если не работает

- HTTP 400: проверьте JSON, длину текста и формат `referenceId`.
- HTTP 402 / 429: проверьте сообщение сервиса, доступ к выбранной модели и квоты.
- HTTP 403: Worker проверяет `Origin`; используйте заголовок из примеров. Для генерации здесь показан curl: первоначальный запрос через Python urllib был отклонён сетевой защитой, а curl сработал.
- Ошибки 5xx: проверьте доступность Worker и Fish Audio, сохраните текст ошибки перед повтором.
- В ролике старый звук: убедитесь, что обновлён именно `studio/public/narration.mp3`, затем повторите экспорт.
- Речь обрывается или код меняется слишком рано: увеличьте длительность и исправьте границы сцен.

API-ключи не добавляйте в JSON, исходники или Git. В этом проекте используется существующий серверный доступ Voicy.
