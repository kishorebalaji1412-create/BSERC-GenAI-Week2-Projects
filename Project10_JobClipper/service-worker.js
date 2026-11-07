"use strict";

const JOBS_KEY = "jobClipperJobs";
const ALARM_PREFIX = "job-deadline:";
const FINAL_STAGE = "closed";

function deadlineAlarm(jobId) {
  return `${ALARM_PREFIX}${jobId}`;
}

function deadlineReminderTime(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText || "")) return null;
  const [year, month, day] = dateText.split("-").map(Number);
  const deadline = new Date(year, month - 1, day, 9, 0, 0, 0);
  if (Number.isNaN(deadline.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDay = new Date(year, month - 1, day);
  if (deadlineDay < today) return null;
  return deadline.getTime() <= Date.now() ? Date.now() + 60_000 : deadline.getTime();
}

async function syncDeadlineAlarms() {
  const stored = await chrome.storage.local.get({ [JOBS_KEY]: [] });
  const jobs = Array.isArray(stored[JOBS_KEY]) ? stored[JOBS_KEY] : [];
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const alarms = await chrome.alarms.getAll();
  for (const alarm of alarms) {
    if (!alarm.name.startsWith(ALARM_PREFIX)) continue;
    const job = jobsById.get(alarm.name.slice(ALARM_PREFIX.length));
    const expected = job && job.stage !== FINAL_STAGE && !job.deadlineRemindedAt
      ? deadlineReminderTime(job.deadline)
      : null;
    if (!expected || Math.abs(alarm.scheduledTime - expected) > 1000) await chrome.alarms.clear(alarm.name);
  }
  const active = new Set((await chrome.alarms.getAll())
    .filter((alarm) => alarm.name.startsWith(ALARM_PREFIX)).map((alarm) => alarm.name));
  for (const job of jobs) {
    if (!job?.id || job.stage === FINAL_STAGE || job.deadlineRemindedAt) continue;
    const when = deadlineReminderTime(job.deadline);
    const name = deadlineAlarm(job.id);
    if (when && !active.has(name)) await chrome.alarms.create(name, { when });
  }
}

async function remindForDeadline(alarm) {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const id = alarm.name.slice(ALARM_PREFIX.length);
  const stored = await chrome.storage.local.get({ [JOBS_KEY]: [] });
  const jobs = Array.isArray(stored[JOBS_KEY]) ? stored[JOBS_KEY] : [];
  const job = jobs.find((item) => item.id === id);
  if (!job || job.stage === FINAL_STAGE) return;
  await chrome.notifications.create(`deadline-${id}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon.png"),
    title: "Job application deadline",
    message: `${job.title}${job.company ? ` at ${job.company}` : ""} · due ${job.deadline}`,
    priority: 1
  });
  await chrome.storage.local.set({
    [JOBS_KEY]: jobs.map((item) => item.id === id ? { ...item, deadlineRemindedAt: Date.now() } : item)
  });
  await syncDeadlineAlarms();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  remindForDeadline(alarm).catch((error) => console.error("Could not show a deadline reminder.", error));
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId.startsWith("deadline-")) return;
  const id = notificationId.slice("deadline-".length);
  chrome.storage.local.get({ [JOBS_KEY]: [] }, (stored) => {
    if (chrome.runtime.lastError) {
      console.error("Could not open the job from its reminder.", chrome.runtime.lastError);
      return;
    }
    const job = (stored[JOBS_KEY] || []).find((item) => item.id === id);
    if (job?.url) chrome.tabs.create({ url: job.url });
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[JOBS_KEY]) {
    syncDeadlineAlarms().catch((error) => console.error("Could not update deadline alarms.", error));
  }
});
chrome.runtime.onInstalled.addListener(() => {
  syncDeadlineAlarms().catch((error) => console.error("Could not initialize deadline alarms.", error));
});
chrome.runtime.onStartup.addListener(() => {
  syncDeadlineAlarms().catch((error) => console.error("Could not restore deadline alarms.", error));
});
