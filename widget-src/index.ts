import { STORAGE_KEYS, VAD_CONFIG } from "./constants";
import { createApiClient } from "./api";
import { createRecorder } from "./recorder";
import { reduceState, type WidgetState } from "./stateMachine";
import { createUi } from "./ui";
import { createVad } from "./vad";

declare global {
  interface Window {
    __WITHU_VOICE_WIDGET__?: boolean;
  }
}

function getEmbedScript(): HTMLScriptElement | null {
  const cur = document.currentScript as HTMLScriptElement | null;
  if (cur && cur.tagName === "SCRIPT") return cur;
  const scripts = Array.from(document.querySelectorAll("script[src]")) as HTMLScriptElement[];
  return scripts[scripts.length - 1] ?? null;
}

function msSince(t0: number) {
  return Math.round(performance.now() - t0);
}

function safeErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

async function speakWithWebSpeech(text: string): Promise<{ ttsMs: number } | null> {
  if (typeof window === "undefined") return null;
  if (!("speechSynthesis" in window)) return null;
  return await new Promise((resolve) => {
    const t0 = performance.now();
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = document.documentElement.lang || "ja-JP";
    ut.rate = 1.0;
    ut.pitch = 1.0;
    ut.onend = () => resolve({ ttsMs: msSince(t0) });
    ut.onerror = () => resolve({ ttsMs: msSince(t0) });
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(ut);
    } catch {
      resolve(null);
    }
  });
}

async function main() {
  if (window.__WITHU_VOICE_WIDGET__) return;
  window.__WITHU_VOICE_WIDGET__ = true;

  const script = getEmbedScript();
  if (!script?.src) return;

  const baseUrl = new URL(script.src).origin;
  const siteId = script.dataset.siteId || "unknown";
  const api = createApiClient(baseUrl, siteId);

  let state: WidgetState = "idle";
  let inFlight = false;
  let vad: ReturnType<typeof createVad> | null = null;
  let stream: MediaStream | null = null;

  function setState(next: WidgetState) {
    state = next;
    ui.setState(next);
    ui.setStopEnabled(next === "listening");
    ui.setStartEnabled(next === "idle" && hasConsent());
    ui.setTextFallbackEnabled(next === "idle");
  }

  function hasConsent() {
    return localStorage.getItem(STORAGE_KEYS.consent) === "accepted";
  }

  function ensureConsentUi() {
    ui.setConsentVisible(!hasConsent());
    ui.setStartEnabled(hasConsent() && state === "idle");
  }

  function stopAll(phase: string, message?: string) {
    try {
      vad?.stop();
    } catch {}
    vad = null;
    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {}
    stream = null;
    try {
      window.speechSynthesis?.cancel?.();
    } catch {}
    inFlight = false;
    setState("idle");
    if (message) ui.setError(message);
    void api.log("error", { phase, message: message ?? null });
  }

  const ui = createUi({
    onToggleOpen(open) {
      if (open) void api.log("widget_open");
      ensureConsentUi();
    },
    onAcceptConsent() {
      localStorage.setItem(STORAGE_KEYS.consent, "accepted");
      void api.log("consent_accept");
      ensureConsentUi();
    },
    onRejectConsent() {
      localStorage.setItem(STORAGE_KEYS.consent, "rejected");
      void api.log("consent_reject");
      ensureConsentUi();
    },
    async onStart() {
      ui.setError(null);
      if (!hasConsent()) {
        ui.setConsentVisible(true);
        ui.setError("音声開始には同意が必要です。");
        return;
      }
      if (state !== "idle" || inFlight) return;

      setState(reduceState(state, { type: "START" }));

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        stopAll("mic_permission", "マイクが利用できません。テキスト入力をご利用ください。");
        return;
      }

      const recorder = createRecorder(stream);
      vad = createVad(stream, recorder, {
        onSpeechStart() {
          void api.log("vad_speech_start");
        },
        async onSpeechEnd({ durationMs, sizeBytes, blob }) {
          // listening -> thinking (VAD確定)
          if (state !== "listening" || inFlight) return;
          inFlight = true;

          setState(reduceState(state, { type: "VAD_DONE" }));

          // VAD停止（spec: listening中のみ稼働）
          try {
            vad?.stop();
          } catch {}
          vad = null;

          void api.log("vad_speech_end", { durationMs: Math.round(durationMs), sizeBytes });

          try {
            const asrT0 = performance.now();
            const { text } = await api.asr(blob);
            void api.log("asr_done", { asrMs: msSince(asrT0) });

            const userText = (text || "").trim();
            if (!userText) {
              stopAll("asr_empty", "音声の認識に失敗しました。テキスト入力をご利用ください。");
              return;
            }

            ui.appendMessage("user", userText);

            const llmT0 = performance.now();
            const { assistantText } = await api.chat(userText);
            void api.log("llm_done", { llmMs: msSince(llmT0) });

            ui.appendMessage("assistant", assistantText);
            setState(reduceState(state, { type: "LLM_DONE" }));

            const ttsT0 = performance.now();
            void api.log("tts_start");
            const res = await speakWithWebSpeech(assistantText);
            void api.log("tts_end", { ttsMs: res?.ttsMs ?? msSince(ttsT0) });

            setState(reduceState(state, { type: "TTS_END" }));
            inFlight = false;
          } catch (e) {
            stopAll("pipeline", `処理に失敗しました: ${safeErr(e)}`);
          }
        },
        onError(err) {
          stopAll("vad", `VADエラー: ${err.message}`);
        },
      });

      await vad.start();
    },
    onStop() {
      setState(reduceState(state, { type: "STOP" }));
      stopAll("user_stop");
      void api.log("stop");
    },
    async onSendText(text) {
      ui.setError(null);
      if (inFlight) return;
      if (!api.sessionId) {
        ui.setError("セッション初期化中です。少し待ってからもう一度お試しください。");
        return;
      }

      // ANY -> idle safety: if currently listening, stop it
      try {
        vad?.stop();
      } catch {}
      vad = null;

      inFlight = true;
      setState("thinking");

      try {
        ui.appendMessage("user", text);
        const llmT0 = performance.now();
        const { assistantText } = await api.chat(text);
        void api.log("llm_done", { llmMs: msSince(llmT0) });
        ui.appendMessage("assistant", assistantText);
        setState("speaking");

        void api.log("tts_start");
        const res = await speakWithWebSpeech(assistantText);
        void api.log("tts_end", { ttsMs: res?.ttsMs ?? 0 });
        setState("idle");
      } catch (e) {
        stopAll("chat_text", `チャットに失敗しました: ${safeErr(e)}`);
      } finally {
        inFlight = false;
        setState("idle");
      }
    },
  });

  ui.mount();
  setState("idle");
  ensureConsentUi();

  // Create session (server stores UA/IP); keep UX resilient if it fails.
  try {
    await api.createSession();
  } catch (e) {
    ui.setError("セッション初期化に失敗しました。ページを再読み込みしてください。");
  }

  // Helpful first message
  ui.appendMessage("assistant", `こんにちは。Startを押して話しかけてください（VAD: ${VAD_CONFIG.minSpeechMs}ms/${VAD_CONFIG.silenceMs}ms/${VAD_CONFIG.maxSpeechMs}ms）。`);
}

void main();


