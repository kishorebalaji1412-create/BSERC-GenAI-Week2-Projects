"use strict";

(() => {
  const DEFAULTS = {
    focusSession: null,
    focusSettings: { hideShorts: false, hideRecommendations: false, hideComments: false },
    focusNotes: []
  };
  const HOST_ID = "yt-focus-board-host";
  const GATE_ID = "yt-focus-board-gate";
  const WATCH_FLUSH_SECONDS = 5;
  let settings = { ...DEFAULTS.focusSettings };
  let focusSession = null;
  let host;
  let shadow;
  let applyTimer = 0;
  let currentUrl = location.href;
  let pendingWatchSeconds = 0;
  let gateVisible = false;
  let lastVideoId = getVideoId();
  let videoState = { id: lastVideoId, title: document.title };

  function getVideoId() {
    try {
      return new URL(location.href).searchParams.get("v") || "";
    } catch {
      return "";
    }
  }

  function sessionIsOpen() {
    return Boolean(focusSession?.goal?.trim() && Number(focusSession.unlockUntil) > Date.now());
  }

  function requestStorage() {
    chrome.storage.local.get(DEFAULTS, (stored) => {
      if (chrome.runtime.lastError) {
        console.error("Could not read YouTube Focus Board settings.", chrome.runtime.lastError);
        return;
      }
      settings = { ...DEFAULTS.focusSettings, ...(stored.focusSettings || {}) };
      focusSession = stored.focusSession || null;
      updateGate();
      applySettings();
    });
  }

  function ensureHost() {
    if (!document.documentElement) return;
    if (host?.isConnected) return shadow;
    host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.setAttribute("aria-label", "YouTube Focus Board controls");
      document.documentElement.append(host);
    }
    shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    if (!shadow.querySelector(".focus-toolbar")) renderToolbar();
    return shadow;
  }

  function renderToolbar() {
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .focus-toolbar { position: fixed; z-index: 2147483000; top: 78px; right: 14px; font: 12px/1.35 Arial,sans-serif; color: #23332d; }
        details { width: 218px; overflow: hidden; border: 1px solid #dfe8df; border-radius: 9px; background: #fff; box-shadow: 0 8px 26px #16251a24; }
        summary { display:flex; align-items:center; justify-content:space-between; padding: 10px 12px; cursor:pointer; list-style:none; font-weight:700; }
        summary::-webkit-details-marker { display:none; }
        .brand { display:flex; align-items:center; gap:7px; }
        .mark { width:20px; height:20px; display:grid; place-items:center; border-radius:6px; background:#e9f3ea; color:#2e7650; font-size:12px; }
        .chevron { color:#8d998f; }
        .options { padding:2px 12px 9px; border-top:1px solid #eef1ed; }
        label { display:flex; align-items:center; justify-content:space-between; gap:9px; padding:8px 0; color:#526158; font-size:11px; }
        input { position:absolute; opacity:0; width:1px; height:1px; }
        .switch { position:relative; flex:0 0 auto; width:31px; height:18px; border-radius:10px; background:#dfe5df; transition:background .15s; }
        .switch::after { content:""; position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%; background:#fff; box-shadow:0 1px 3px #0002; transition:transform .15s; }
        input:checked + .switch { background:#37805a; }
        input:checked + .switch::after { transform:translateX(13px); }
        input:focus-visible + .switch { outline:2px solid #648bd4; outline-offset:2px; }
        @media (max-width: 600px) { .focus-toolbar { top:64px; right:8px; } details { width:200px; } }
      </style>
      <div class="focus-toolbar">
        <details>
          <summary><span class="brand"><span class="mark">◎</span> Focus controls</span><span class="chevron">⌄</span></summary>
          <div class="options">
            <label>Hide Shorts <input type="checkbox" data-setting="hideShorts"><span class="switch"></span></label>
            <label>Hide recommendations <input type="checkbox" data-setting="hideRecommendations"><span class="switch"></span></label>
            <label>Hide comments <input type="checkbox" data-setting="hideComments"><span class="switch"></span></label>
          </div>
        </details>
      </div>`;
    shadow.querySelectorAll("[data-setting]").forEach((input) => {
      input.checked = Boolean(settings[input.dataset.setting]);
      input.addEventListener("change", () => {
        settings[input.dataset.setting] = input.checked;
        chrome.storage.local.set({ focusSettings: settings }, () => {
          if (chrome.runtime.lastError) {
            console.error("Could not save focus toggle.", chrome.runtime.lastError);
            input.checked = !input.checked;
            settings[input.dataset.setting] = input.checked;
            return;
          }
          applySettings();
        });
      });
    });
  }

  function ensureStyle() {
    let style = document.getElementById("yt-focus-board-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "yt-focus-board-style";
      (document.head || document.documentElement).append(style);
    }
    const rules = [];
    if (settings.hideShorts) {
      rules.push(`
        ytd-reel-shelf-renderer,
        ytd-rich-shelf-renderer[is-shorts],
        ytd-rich-section-renderer:has(a[href^="/shorts/"]),
        ytd-mini-guide-entry-renderer:has(a[title="Shorts"]),
        ytd-guide-entry-renderer:has(a[title="Shorts"]),
        a[href^="/shorts/"] { display:none !important; }
      `);
    }
    if (settings.hideRecommendations) rules.push("#secondary, ytd-watch-next-secondary-results-renderer, ytd-compact-autoplay-renderer { display:none !important; }");
    if (settings.hideComments) rules.push("#comments { display:none !important; }");
    const content = rules.join("\n");
    if (style.textContent !== content) style.textContent = content;
  }

  function updateToolbar() {
    ensureHost();
    shadow?.querySelectorAll("[data-setting]").forEach((input) => {
      input.checked = Boolean(settings[input.dataset.setting]);
    });
  }

  function updateGate() {
    const shouldBlock = !sessionIsOpen();
    if (shouldBlock) {
      const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
      if (video && !video.paused) video.pause();
    }
    let gate = document.getElementById(GATE_ID);
    if (shouldBlock && !gate) {
      gate = document.createElement("div");
      gate.id = GATE_ID;
      gate.innerHTML = `
        <style>
          #${GATE_ID} { position:fixed; z-index:2147483646; inset:0; display:grid; place-items:center; padding:20px; background:rgba(15,24,20,.88); color:#24352b; font:15px/1.5 Arial,sans-serif; }
          #${GATE_ID} * { box-sizing:border-box; }
          #${GATE_ID} .card { width:min(430px,100%); padding:28px; border:1px solid #e4e9e1; border-radius:14px; background:#fffdf7; box-shadow:0 20px 70px #0005; text-align:center; }
          #${GATE_ID} .icon { width:42px; height:42px; display:grid; place-items:center; margin:0 auto 13px; border-radius:12px; background:#e9f4e9; color:#2d7651; font-size:22px; }
          #${GATE_ID} h1 { margin:0 0 8px; color:#26382d; font-size:23px; }
          #${GATE_ID} p { margin:0 auto 15px; max-width:330px; color:#68766d; font-size:13px; }
          #${GATE_ID} .goal { margin:0 auto 14px; padding:11px; border-radius:8px; background:#f0f5ed; color:#39704e; font-weight:700; overflow-wrap:anywhere; }
          #${GATE_ID} .hint { margin:0; color:#89928b; font-size:11px; }
          #${GATE_ID} .button { display:inline-block; margin:0 0 12px; padding:10px 15px; border:0; border-radius:6px; background:#347653; color:white; font-weight:700; }
        </style>
        <section class="card" role="dialog" aria-modal="true" aria-labelledby="ytfb-title">
          <div class="icon">◎</div>
          <h1 id="ytfb-title">Pause before you play</h1>
          <p>Set an intention for this visit in YouTube Focus Board. Your viewing window will open for 60 minutes.</p>
          ${focusSession?.goal ? '<div class="goal"></div>' : ""}
          <button class="button" type="button">Open Focus Board</button>
          <p class="hint">Click the extension icon in your browser toolbar to answer “Why are you here?”</p>
        </section>`;
      if (focusSession?.goal) gate.querySelector(".goal").textContent = focusSession.goal;
      gate.querySelector(".button").addEventListener("click", () => {
        gate.querySelector(".hint").textContent = "Open the YouTube Focus Board extension from your browser toolbar to continue.";
      });
      document.documentElement.append(gate);
    } else if (!shouldBlock && gate) {
      gate.remove();
    } else if (shouldBlock && gate && focusSession?.goal) {
      let goal = gate.querySelector(".goal");
      if (!goal) {
        goal = document.createElement("div");
        goal.className = "goal";
        gate.querySelector(".card p").after(goal);
      }
      if (goal.textContent !== focusSession.goal) goal.textContent = focusSession.goal;
    }
    gateVisible = shouldBlock;
  }

  function currentVideo() {
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    const id = getVideoId();
    const title = document.querySelector("h1.ytd-watch-metadata")?.textContent?.trim()
      || document.querySelector("h1.title")?.textContent?.trim()
      || document.title.replace(/\s*-\s*YouTube$/, "");
    videoState = {
      id,
      title: title || "YouTube video",
      time: video && Number.isFinite(video.currentTime) ? Math.floor(video.currentTime) : 0,
      paused: !video || video.paused,
      url: location.href
    };
    return videoState;
  }

  function isPageWatchable() {
    if (gateVisible || document.hidden || !sessionIsOpen() || !location.pathname.startsWith("/watch")) return false;
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    return Boolean(video && !video.paused && !video.ended && video.readyState >= 2);
  }

  function flushWatchTime() {
    if (pendingWatchSeconds <= 0) return;
    const seconds = pendingWatchSeconds;
    pendingWatchSeconds = 0;
    chrome.runtime.sendMessage({ type: "watchDelta", seconds }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("YouTube Focus Board could not record watch time.", chrome.runtime.lastError.message);
      } else if (!response?.ok) {
        console.warn(response?.error || "Watch time was not recorded.");
      }
    });
  }

  function handleNavigation() {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      const nextId = getVideoId();
      if (nextId !== lastVideoId) {
        flushWatchTime();
        lastVideoId = nextId;
        currentVideo();
      }
    }
    ensureHost();
    applySettings();
    updateGate();
  }

  function scheduleApply() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      ensureHost();
      ensureStyle();
      updateToolbar();
      updateGate();
      currentVideo();
    }, 140);
  }

  function applySettings() {
    ensureStyle();
    updateToolbar();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.focusSettings) settings = { ...DEFAULTS.focusSettings, ...(changes.focusSettings.newValue || {}) };
    if (changes.focusSession) focusSession = changes.focusSession.newValue || null;
    updateGate();
    applySettings();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "getVideoState") {
      sendResponse(currentVideo());
      return false;
    }
    if (message?.type === "seekTo") {
      const id = getVideoId();
      if (!id || id !== message.videoId) {
        sendResponse({ ok: false, error: "This note belongs to a different video." });
        return false;
      }
      const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
      if (!video) {
        sendResponse({ ok: false, error: "The active video is not ready yet." });
        return false;
      }
      const time = Math.max(0, Number(message.time) || 0);
      video.currentTime = time;
      video.play().catch(() => {});
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushWatchTime();
  });
  window.addEventListener("pagehide", flushWatchTime);
  window.addEventListener("yt-navigate-finish", handleNavigation);
  window.addEventListener("yt-page-data-updated", handleNavigation);
  window.addEventListener("popstate", handleNavigation);
  new MutationObserver(scheduleApply).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(handleNavigation, 700);
  setInterval(() => {
    if (isPageWatchable()) {
      pendingWatchSeconds += 1;
      if (pendingWatchSeconds >= WATCH_FLUSH_SECONDS) flushWatchTime();
    } else {
      flushWatchTime();
    }
    currentVideo();
  }, 1000);

  requestStorage();
  ensureHost();
  ensureStyle();
  updateGate();
  currentVideo();
})();