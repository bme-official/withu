import type { WidgetState } from "./stateMachine";
import { UI_TEXT, WIDGET_VERSION } from "./constants";

export type UiCallbacks = {
  onToggleOpen(open: boolean): void;
  onStart(): void;
  onStop(): void;
  onSendText(text: string): void;
  onAcceptConsent(): void;
  onRejectConsent(): void;
};

export type UiController = {
  mount(): void;
  setOpen(open: boolean): void;
  setState(state: WidgetState): void;
  appendMessage(role: "user" | "assistant", content: string): void;
  setError(msg: string | null): void;
  setConsentVisible(visible: boolean): void;
  setStartEnabled(enabled: boolean): void;
  setStopEnabled(enabled: boolean): void;
  setTextFallbackEnabled(enabled: boolean): void;
};

export function createUi(cb: UiCallbacks): UiController {
  const hostId = "withu-voice-widget-host";
  let open = false;

  const host = document.createElement("div");
  host.id = hostId;
  host.style.position = "fixed";
  host.style.right = "16px";
  host.style.bottom = "16px";
  host.style.zIndex = "2147483647";

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host, * { box-sizing: border-box; }
    .bubble {
      width: 56px; height: 56px; border-radius: 9999px;
      background: #111827; color: white; border: 1px solid rgba(255,255,255,0.12);
      display:flex; align-items:center; justify-content:center;
      cursor: pointer; user-select: none;
      box-shadow: 0 10px 30px rgba(0,0,0,0.25);
      font: 14px/1.2 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    }
    .panel {
      width: min(360px, calc(100vw - 32px));
      height: 480px;
      background: white;
      border-radius: 16px;
      border: 1px solid rgba(0,0,0,0.12);
      box-shadow: 0 24px 60px rgba(0,0,0,0.25);
      overflow: hidden;
      display: none;
      margin-bottom: 12px;
      font: 14px/1.4 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      color: #111827;
    }
    .panel.open { display: flex; flex-direction: column; }
    .header {
      display:flex; align-items:center; justify-content:space-between;
      padding: 12px 12px;
      border-bottom: 1px solid rgba(0,0,0,0.08);
      background: #f9fafb;
    }
    .title { font-weight: 600; }
    .status {
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 9999px;
      background: rgba(0,0,0,0.06);
    }
    .log {
      flex: 1;
      overflow: auto;
      padding: 12px;
      display:flex;
      flex-direction: column;
      gap: 10px;
      background: white;
    }
    .msg {
      max-width: 90%;
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid rgba(0,0,0,0.08);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .msg.user { align-self: flex-end; background: #111827; color: white; border-color: rgba(0,0,0,0.1); }
    .msg.assistant { align-self: flex-start; background: #f3f4f6; }
    .footer {
      padding: 12px;
      border-top: 1px solid rgba(0,0,0,0.08);
      background: #f9fafb;
      display:flex;
      flex-direction: column;
      gap: 10px;
    }
    .row { display:flex; gap: 8px; }
    button {
      appearance: none;
      border: 1px solid rgba(0,0,0,0.12);
      background: white;
      padding: 10px 12px;
      border-radius: 12px;
      cursor: pointer;
      font-weight: 600;
    }
    button.primary { background: #111827; border-color: #111827; color: white; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    textarea {
      width: 100%;
      min-height: 44px;
      max-height: 120px;
      resize: vertical;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid rgba(0,0,0,0.12);
      font: inherit;
      background: white;
    }
    .error {
      font-size: 12px;
      color: #b91c1c;
      display: none;
    }
    .error.show { display: block; }
    .consent {
      border: 1px solid rgba(0,0,0,0.12);
      background: #fff7ed;
      color: #7c2d12;
      border-radius: 12px;
      padding: 10px 12px;
      display: none;
    }
    .consent.show { display: block; }
    .consent .small { font-size: 12px; opacity: 0.9; margin-top: 4px; }
    .muted { font-size: 12px; opacity: 0.7; }
  `;

  const wrap = document.createElement("div");

  const panel = document.createElement("div");
  panel.className = "panel";

  const header = document.createElement("div");
  header.className = "header";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = UI_TEXT.title;

  const status = document.createElement("div");
  status.className = "status";
  status.textContent = "idle";

  header.appendChild(title);
  header.appendChild(status);

  const log = document.createElement("div");
  log.className = "log";

  const footer = document.createElement("div");
  footer.className = "footer";

  const error = document.createElement("div");
  error.className = "error";

  const consent = document.createElement("div");
  consent.className = "consent";
  consent.innerHTML = `
    <div><b>録音とログ保存の同意</b></div>
    <div class="small">
      音声会話のためにマイク音声を送信して文字起こしし、会話/イベントログを保存します。<br/>
      同意しない場合、音声開始はできません（テキスト入力は利用できます）。
    </div>
    <div class="row" style="margin-top: 8px;">
      <button data-act="consent-reject">同意しない</button>
      <button class="primary" data-act="consent-accept">同意する</button>
    </div>
  `;

  const btnRow = document.createElement("div");
  btnRow.className = "row";

  const startBtn = document.createElement("button");
  startBtn.className = "primary";
  startBtn.textContent = "Start";

  const stopBtn = document.createElement("button");
  stopBtn.textContent = "Stop";
  stopBtn.disabled = true;

  btnRow.appendChild(startBtn);
  btnRow.appendChild(stopBtn);

  const textRow = document.createElement("div");
  textRow.className = "row";

  const textarea = document.createElement("textarea");
  textarea.placeholder = "音声が使えない場合はここに入力して送信…";
  textarea.disabled = false;

  const sendBtn = document.createElement("button");
  sendBtn.textContent = "送信";

  textRow.appendChild(textarea);
  textRow.appendChild(sendBtn);

  const meta = document.createElement("div");
  meta.className = "muted";
  meta.textContent = `withu widget v${WIDGET_VERSION}`;

  footer.appendChild(error);
  footer.appendChild(consent);
  footer.appendChild(btnRow);
  footer.appendChild(textRow);
  footer.appendChild(meta);

  panel.appendChild(header);
  panel.appendChild(log);
  panel.appendChild(footer);

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = "🎙";

  wrap.appendChild(panel);
  wrap.appendChild(bubble);

  shadow.appendChild(style);
  shadow.appendChild(wrap);

  function scrollToBottom() {
    try {
      log.scrollTop = log.scrollHeight;
    } catch {}
  }

  bubble.addEventListener("click", () => {
    open = !open;
    panel.classList.toggle("open", open);
    cb.onToggleOpen(open);
  });

  startBtn.addEventListener("click", () => cb.onStart());
  stopBtn.addEventListener("click", () => cb.onStop());

  sendBtn.addEventListener("click", () => {
    const t = textarea.value.trim();
    if (!t) return;
    textarea.value = "";
    cb.onSendText(t);
  });
  textarea.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      sendBtn.click();
    }
  });

  consent.addEventListener("click", (ev) => {
    const el = ev.target as HTMLElement | null;
    const act = el?.getAttribute("data-act");
    if (act === "consent-accept") cb.onAcceptConsent();
    if (act === "consent-reject") cb.onRejectConsent();
  });

  return {
    mount() {
      if (document.getElementById(hostId)) return;
      document.body.appendChild(host);
    },
    setOpen(next) {
      open = next;
      panel.classList.toggle("open", open);
    },
    setState(s) {
      status.textContent = s;
    },
    appendMessage(role, content) {
      const div = document.createElement("div");
      div.className = `msg ${role}`;
      div.textContent = content;
      log.appendChild(div);
      scrollToBottom();
    },
    setError(msg) {
      if (!msg) {
        error.textContent = "";
        error.classList.remove("show");
        return;
      }
      error.textContent = msg;
      error.classList.add("show");
    },
    setConsentVisible(visible) {
      consent.classList.toggle("show", visible);
    },
    setStartEnabled(enabled) {
      startBtn.disabled = !enabled;
    },
    setStopEnabled(enabled) {
      stopBtn.disabled = !enabled;
    },
    setTextFallbackEnabled(enabled) {
      textarea.disabled = !enabled;
      sendBtn.disabled = !enabled;
    },
  };
}


