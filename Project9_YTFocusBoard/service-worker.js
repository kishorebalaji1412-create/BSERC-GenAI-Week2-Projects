"use strict";

const WATCH_KEY = "dailyWatch";
let writeQueue = Promise.resolve();

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "watchDelta") return false;
  const delta = Number(message.seconds);
  if (!Number.isFinite(delta) || delta <= 0 || delta > 30) return false;
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const data = await chrome.storage.local.get(WATCH_KEY);
    const previous = data[WATCH_KEY];
    const today = localDateKey();
    const seconds = previous?.date === today && Number.isFinite(previous.seconds) ? previous.seconds : 0;
    await chrome.storage.local.set({ [WATCH_KEY]: { date: today, seconds: seconds + delta } });
  });
  const task = writeQueue;
  task.then(() => sendResponse({ ok: true })).catch((error) => {
    console.error("Could not save YouTube watch time.", error);
    sendResponse({ ok: false, error: "Could not save watch time." });
  });
  return true;
});
