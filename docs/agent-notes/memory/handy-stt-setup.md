---
name: handy-stt-setup
description: "Handy (диктовка) вместо STT Орки: где настройки, модель, хоткей правый Option"
metadata:
  node_type: memory
  type: user
  originSessionId: fda24235-b04f-4977-b2d9-498d14570724
  modified: 2026-11-23T11:47:09.040Z
---

2026-11-23 пользователь попросил заменить STT Орки на Handy (brew cask handy, 0.10.1).
Модели Орки (~/Library/Application Support/orca/speech-models, parakeet v3 + silero) удалены.
Настройки: ~/Library/Application Support/com.pais.handy/settings_store.json (ключ settings).
Выставлено: selected_model handy-computer/whisper-large-v3-gguf/whisper-large-v3-Q8_0.gguf (лучшая по русскому
в каталоге Handy, ошибка 4.96%), bindings.transcribe = option_right, shortcut_activation toggle,
auto_submit true + enter, selected_language ru, автозапуск.
Модели лежат в HF-кэше ~/.cache/huggingface/hub (Handy берёт оттуда). Проверка без микрофона:
/Applications/Handy.app/Contents/MacOS/handy -f file.wav --model <полный id> --json.

**Why:** пользователь хочет диктовку: правый Option старт/стоп, текст сразу отправляется Enter.
**How to apply:** правки Handy — через этот JSON при закрытом приложении; хоткеям нужен доступ «Универсальный доступ».
