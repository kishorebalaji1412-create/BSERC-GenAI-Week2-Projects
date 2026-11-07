 "use strict";

const $ = (selector) => document.querySelector(selector);
const STORAGE_DEFAULTS = { focusSession: null, focusNotes: [], dailyWatch: { date: "", seconds: 0 } };
const FOCUS_DURATION_MS = 60 * 60 * 1000;
const MAX_NOTES = 500;
let activeTab = null;
let video = null;
let session = null;
let allNotes = [];
let currentDate = localDateKey();

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2400);
}

function isUnlocked() {
  return Boolean(session?.goal?.trim() && Number(session.unlockUntil) > Date.now());
}

function renderGoal() {
  const active = isUnlocked();
  $("#goalForm").classList.toggle("hidden", active);
  $("#activeGoal").classList.toggle("hidden", !active && !session?.goal);
  $("#goalMessage").textContent = "";
  if (active) {
    $("#goalStatusText").textContent = "Focus window open";
    $("#goalText").textContent = session.goal;
    $("#goalRemaining").textContent = `${formatTime((session.unlockUntil - Date.now()) / 1000)} remaining`;
  } else if (session?.goal) {
    $("#goalStatusText").textContent = "Focus window ended";
    $("#goalText").textContent = session.goal;
    $("#goalRemaining").textContent = "Set a new intention to continue.";
    $("#goalForm").classList.remove("hidden");
    $("#goalInput").value = session.goal;
  }
}

function renderWatch(data = null) {
  if (!data) {
    chrome.storage.local.get("dailyWatch", (stored) => {
      if (chrome.runtime.lastError) {
        console.error("Could not read today's YouTube watch time.", chrome.runtime.lastError);
        return;
      }
      renderWatch(stored.dailyWatch);
    });
    return;
  }
  const seconds = data?.date === localDateKey() && Number.isFinite(data.seconds) ? Math.max(0, data.seconds) : 0;
  $("#watchTime").textContent = formatTime(seconds);
  $("#watchSeconds").textContent = `${Math.floor(seconds / 60)} min${Math.floor(seconds / 60) === 1 ? "" : "s"} today`;
  $("#watchBar").style.width = `${Math.min(100, seconds / (4 * 60 * 60) * 100)}%`;
}

function showVideoContext() {
  if (!video?.id) {
    $("#videoContext").textContent = "Open a YouTube video to add timestamped notes.";
    $("#noteInput").disabled = true;
    $("#addNoteButton").disabled = true;
    renderNotes();
    return;
  }
  $("#videoContext").textContent = video.title || "Active YouTube video";
  $("#noteInput").disabled = false;
  $("#addNoteButton").disabled = false;
  renderNotes();
}

function queryVideo() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error("Could not read the active tab.", chrome.runtime.lastError);
      showVideoContext();
      return;
    }
    activeTab = tabs[0] || null;
    if (!activeTab?.id || !activeTab.url?.startsWith("https://www.youtube.com/")) {
      video = null;
      showVideoContext();
      return;
    }
    chrome.tabs.sendMessage(activeTab.id, { type: "getVideoState" }, (response) => {
      if (chrome.runtime.lastError) {
        video = null;
        $("#videoContext").textContent = "Reload YouTube to enable timestamped notes.";
        $("#noteInput").disabled = true;
        $("#addNoteButton").disabled = true;
        renderNotes();
        return;
      }
      video = response?.id ? response : null;
      showVideoContext();
    });
  });
}

function renderNotes() {
  const notesList = $("#notesList");
  notesList.replaceChildren();
  const relevant = video?.id
    ? allNotes.filter((note) => note.videoId === video.id).sort((a, b) => b.createdAt - a.createdAt)
    : [];
  $("#notesEmpty").classList.toggle("hidden", relevant.length > 0);
  relevant.forEach((note) => {
    const row = document.createElement("article");
    row.className = "note-item";
    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "note-jump";
    jump.textContent = formatTimestamp(note.time);
    jump.title = "Jump to this timestamp";
    jump.addEventListener("click", () => seekToNote(note));
    const content = document.createElement("div");
    content.className = "note-content";
    content.textContent = note.text;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "note-delete";
    remove.textContent = "×";
    remove.title = "Delete note";
    remove.setAttribute("aria-label", "Delete note");
    remove.addEventListener("click", () => deleteNote(note.id));
    row.append(jump, content, remove);
    notesList.append(row);
  });
}

function seekToNote(note) {
  if (!activeTab?.id || !video?.id || video.id !== note.videoId) {
    toast("Open this note's YouTube video first.");
    return;
  }
  chrome.tabs.sendMessage(activeTab.id, { type: "seekTo", videoId: note.videoId, time: note.time }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Could not seek to the note.", chrome.runtime.lastError);
      toast("Reload YouTube and try again.");
      return;
    }
    if (!response?.ok) {
      toast(response?.error || "Could not seek to this note.");
      return;
    }
    window.close();
  });
}

function persistNotes(next) {
  chrome.storage.local.set({ focusNotes: next }, () => {
    if (chrome.runtime.lastError) {
      console.error("Could not save your timestamped notes.", chrome.runtime.lastError);
      toast("Could not save note. Check extension storage.");
      return;
    }
    allNotes = next;
    renderNotes();
  });
}

function addNote(event) {
  event.preventDefault();
  const noteText = $("#noteInput").value.trim();
  if (!noteText) {
    $("#noteInput").focus();
    return;
  }
  if (!video?.id || !activeTab?.id) {
    toast("Open a YouTube video before adding a timestamped note.");
    return;
  }
  chrome.tabs.sendMessage(activeTab.id, { type: "getVideoState" }, (response) => {
    if (chrome.runtime.lastError || !response?.id) {
      toast("Reload YouTube and try adding the note again.");
      return;
    }
    const note = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      videoId: response.id,
      videoTitle: response.title || "YouTube video",
      url: response.url || activeTab.url,
      time: Math.max(0, Math.floor(Number(response.time) || 0)),
      text: noteText.slice(0, 500),
      createdAt: Date.now()
    };
    const next = [...allNotes, note].slice(-MAX_NOTES);
    persistNotes(next);
    $("#noteInput").value = "";
    toast(`Note saved at ${formatTimestamp(note.time)}.`);
  });
}

function deleteNote(id) {
  persistNotes(allNotes.filter((note) => note.id !== id));
}

function unlockFocus(event) {
  event.preventDefault();
  const goal = $("#goalInput").value.trim();
  if (!goal) {
    $("#goalMessage").textContent = "Add a short intention before unlocking YouTube.";
    $("#goalInput").focus();
    return;
  }
  session = { goal: goal.slice(0, 160), startedAt: Date.now(), unlockUntil: Date.now() + FOCUS_DURATION_MS };
  chrome.storage.local.set({ focusSession: session }, () => {
    if (chrome.runtime.lastError) {
      console.error("Could not save your focus goal.", chrome.runtime.lastError);
      $("#goalMessage").textContent = "Could not save this goal. Try again.";
      return;
    }
    renderGoal();
    toast("YouTube unlocked for 60 minutes.");
  });
}

function endFocus() {
  session = null;
  chrome.storage.local.set({ focusSession: null }, () => {
    if (chrome.runtime.lastError) {
      console.error("Could not end the focus window.", chrome.runtime.lastError);
      toast("Could not close the focus window.");
      return;
    }
    renderGoal();
    toast("Focus window ended.");
  });
}

function load() {
  chrome.storage.local.get(STORAGE_DEFAULTS, (stored) => {
    if (chrome.runtime.lastError) {
      console.error("Could not load Focus Board data.", chrome.runtime.lastError);
      toast("Could not load saved Focus Board data.");
      return;
    }
    session = stored.focusSession || null;
    allNotes = Array.isArray(stored.focusNotes) ? stored.focusNotes : [];
    renderGoal();
    renderWatch(stored.dailyWatch);
  });
  queryVideo();
}

$("#goalForm").addEventListener("submit", unlockFocus);
$("#endFocusButton").addEventListener("click", endFocus);
$("#noteForm").addEventListener("submit", addNote);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.dailyWatch) renderWatch(changes.dailyWatch.newValue);
  if (changes.focusSession) {
    session = changes.focusSession.newValue || null;
    renderGoal();
  }
  if (changes.focusNotes) {
    allNotes = Array.isArray(changes.focusNotes.newValue) ? changes.focusNotes.newValue : [];
    renderNotes();
  }
});
setInterval(() => {
  if (localDateKey() !== currentDate) {
    currentDate = localDateKey();
    renderWatch();
  }
  renderGoal();
}, 1000);
load();