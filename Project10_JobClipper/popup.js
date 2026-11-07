"use strict";

const STORAGE_KEY = "jobClipperJobs";
const STAGES = ["saved", "applied", "interview", "closed"];
const STAGE_LABELS = { saved: "Saved", applied: "Applied", interview: "Interview", closed: "Offered/Rejected" };
const $ = (selector) => document.querySelector(selector);
let jobs = [];
let editingId = null;
let draggedId = null;

function announce(message, isError = false) {
  const status = $("#statusMessage");
  status.textContent = message;
  status.classList.toggle("error", isError);
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function storageGet(callback) {
  chrome.storage.local.get({ [STORAGE_KEY]: [] }, (stored) => {
    if (chrome.runtime.lastError) {
      console.error("Could not load saved jobs.", chrome.runtime.lastError);
      announce("Could not load jobs from extension storage.", true);
      return;
    }
    jobs = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    callback?.();
  });
}

function persistJobs(nextJobs, onSuccess) {
  chrome.storage.local.set({ [STORAGE_KEY]: nextJobs }, () => {
    if (chrome.runtime.lastError) {
      console.error("Could not save jobs.", chrome.runtime.lastError);
      announce("Could not save changes. Check extension storage.", true);
      return;
    }
    jobs = nextJobs;
    renderBoard();
    onSuccess?.();
  });
}

function formatDeadline(dateText) {
  if (!dateText) return "";
  const date = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function visibleJobs() {
  const query = $("#searchInput").value.trim().toLocaleLowerCase();
  return jobs.filter((job) => `${job.title} ${job.company}`.toLocaleLowerCase().includes(query));
}

function renderBoard() {
  const filtered = visibleJobs();
  document.querySelectorAll(".column").forEach((column) => {
    const stage = column.dataset.stage;
    const list = column.querySelector(".card-list");
    const columnJobs = filtered.filter((job) => job.stage === stage);
    column.querySelector(".column-count").textContent = String(columnJobs.length);
    list.replaceChildren();
    if (!columnJobs.length) {
      const empty = document.createElement("p");
      empty.className = "empty-column";
      empty.textContent = $("#searchInput").value.trim() ? "No matching jobs" : "Drop jobs here";
      list.append(empty);
    }
    columnJobs.forEach((job) => list.append(createCard(job)));
  });
  $("#jobTotal").textContent = `${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}`;
}

function createCard(job) {
  const card = document.createElement("article");
  card.className = "job-card";
  card.draggable = true;
  card.dataset.jobId = job.id;
  card.addEventListener("dragstart", (event) => {
    draggedId = job.id;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", job.id);
  });
  card.addEventListener("dragend", () => {
    draggedId = null;
    card.classList.remove("dragging");
    document.querySelectorAll(".card-list").forEach((list) => list.classList.remove("drag-over"));
  });

  const title = document.createElement("a");
  title.className = "job-title";
  title.textContent = job.title || "Untitled role";
  title.href = safeUrl(job.url) || "#";
  title.target = "_blank";
  title.rel = "noopener noreferrer";
  if (title.href === "#") title.removeAttribute("target");

  const company = document.createElement("p");
  company.className = "job-company";
  company.textContent = job.company || "Company not detected";
  card.append(title, company);
  if (job.deadline) {
    const deadline = document.createElement("p");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = new Date(`${job.deadline}T00:00:00`) < today && job.stage !== "closed";
    deadline.className = `job-deadline${overdue ? " overdue" : ""}`;
    deadline.textContent = `${overdue ? "Overdue · " : "Deadline · "}${formatDeadline(job.deadline)}`;
    card.append(deadline);
  }
  const actions = document.createElement("div");
  actions.className = "card-actions";
  const stageSelect = document.createElement("select");
  stageSelect.className = "stage-select";
  stageSelect.setAttribute("aria-label", `Move ${job.title} to another stage`);
  STAGES.forEach((stage) => {
    const option = document.createElement("option");
    option.value = stage;
    option.textContent = STAGE_LABELS[stage];
    option.selected = job.stage === stage;
    stageSelect.append(option);
  });
  stageSelect.addEventListener("change", () => moveJob(job.id, stageSelect.value));

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "card-icon";
  edit.textContent = "Edit";
  edit.setAttribute("aria-label", `Edit ${job.title}`);
  edit.addEventListener("click", () => openForm(job));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "card-icon delete-action";
  remove.textContent = "×";
  remove.title = "Delete job";
  remove.setAttribute("aria-label", `Delete ${job.title}`);
  remove.addEventListener("click", () => deleteJob(job.id));
  actions.append(stageSelect, edit, remove);
  card.append(actions);
  return card;
}

function moveJob(id, stage) {
  if (!STAGES.includes(stage)) return;
  persistJobs(jobs.map((job) => job.id === id ? { ...job, stage, updatedAt: Date.now() } : job),
    () => announce(`Moved to ${STAGE_LABELS[stage]}.`));
}

function attachDropTargets() {
  document.querySelectorAll(".card-list").forEach((list) => {
    list.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      list.classList.add("drag-over");
    });
    list.addEventListener("dragleave", (event) => {
      if (!list.contains(event.relatedTarget)) list.classList.remove("drag-over");
    });
    list.addEventListener("drop", (event) => {
      event.preventDefault();
      list.classList.remove("drag-over");
      const id = event.dataTransfer.getData("text/plain") || draggedId;
      if (id) moveJob(id, list.dataset.dropStage);
    });
  });
}

function openForm(job = null, detected = null) {
  editingId = job?.id || null;
  $("#formTitle").textContent = editingId ? "Edit job" : "Save a job";
  $("#jobTitle").value = job?.title || detected?.title || "";
  $("#jobCompany").value = job?.company || detected?.company || "";
  $("#jobUrl").value = job?.url || detected?.url || "";
  $("#jobDeadline").value = job?.deadline || detected?.deadline || "";
  $("#jobStage").value = job?.stage || "saved";
  $("#formHint").textContent = detected
    ? "Review and edit detected details before saving. Deadline reminders are set for 9:00 AM local time on the due date."
    : "Enter or edit job details. Deadline reminders are set for 9:00 AM local time on the due date.";
  $("#saveJobButton").textContent = editingId ? "Save changes" : "Save job";
  $("#jobFormPanel").classList.remove("hidden");
  $("#jobTitle").focus();
}

function closeForm() {
  $("#jobFormPanel").classList.add("hidden");
  $("#jobForm").reset();
  editingId = null;
}

function clipJob() {
  const button = $("#clipButton");
  button.disabled = true;
  button.textContent = "Reading page…";
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error("Could not access the current tab.", chrome.runtime.lastError);
      button.disabled = false;
      button.innerHTML = "<span aria-hidden=\"true\">＋</span> Clip job";
      openForm();
      announce("Could not read the current tab. Enter the job details below.", true);
      return;
    }
    const tab = tabs[0];
    if (!tab?.id || !safeUrl(tab.url || "")) {
      button.disabled = false;
      button.innerHTML = "<span aria-hidden=\"true\">＋</span> Clip job";
      openForm();
      announce("This page cannot be clipped automatically. Enter job details below.", true);
      return;
    }
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Could not inject the job parser.", chrome.runtime.lastError.message);
        button.disabled = false;
        button.innerHTML = "<span aria-hidden=\"true\">＋</span> Clip job";
        openForm(null, { url: safeUrl(tab.url) });
        announce("Page detection was unavailable. Fill in the job details manually.", true);
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: "jobClipper:extract" }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          console.warn("Could not extract job details.", chrome.runtime.lastError?.message || response?.error);
          openForm(null, { url: safeUrl(tab.url) });
          announce("Could not detect details. Complete the editable fields to save.", true);
        } else {
          const detected = { ...response.job, url: safeUrl(response.job?.url) || safeUrl(tab.url) };
          openForm(null, detected);
          announce(detected.title || detected.company
            ? "Review the detected job details."
            : "No job details detected. Fill in the fields to continue.");
        }
        button.disabled = false;
        button.innerHTML = "<span aria-hidden=\"true\">＋</span> Clip job";
      });
    });
  });
}

function saveJob(event) {
  event.preventDefault();
  const url = safeUrl($("#jobUrl").value.trim());
  if (!url) {
    announce("Enter a valid http or https job URL.", true);
    $("#jobUrl").focus();
    return;
  }
  const title = $("#jobTitle").value.trim();
  if (!title) {
    announce("Enter a job title before saving.", true);
    $("#jobTitle").focus();
    return;
  }
  const deadline = $("#jobDeadline").value;
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    announce("Choose a valid application deadline.", true);
    return;
  }
  const stage = STAGES.includes($("#jobStage").value) ? $("#jobStage").value : "saved";
  const previous = jobs.find((job) => job.id === editingId);
  const job = {
    id: editingId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: title.slice(0, 200),
    company: $("#jobCompany").value.trim().slice(0, 160),
    url,
    deadline,
    stage,
    createdAt: previous?.createdAt || Date.now(),
    updatedAt: Date.now(),
    deadlineRemindedAt: previous?.deadline === deadline ? (previous?.deadlineRemindedAt || null) : null
  };
  const updated = editingId ? jobs.map((item) => item.id === editingId ? job : item) : [...jobs, job];
  const wasEditing = Boolean(editingId);
  persistJobs(updated, () => {
    closeForm();
    announce(wasEditing ? "Job updated." : "Job saved to your board.");
  });
}

function deleteJob(id) {
  const job = jobs.find((item) => item.id === id);
  if (!job || !confirm(`Delete "${job.title}" from your board?`)) return;
  persistJobs(jobs.filter((item) => item.id !== id), () => announce("Job deleted."));
}

function exportCsv() {
  if (!jobs.length) {
    announce("There are no jobs to export yet.", true);
    return;
  }
  const columns = ["Title", "Company", "URL", "Deadline", "Stage", "Created"];
  const quote = (value) => {
    const text = String(value ?? "");
    const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
  };
  const rows = jobs.map((job) => [
    job.title, job.company, job.url, job.deadline, STAGE_LABELS[job.stage] || STAGE_LABELS.saved,
    job.createdAt ? new Date(job.createdAt).toISOString() : ""
  ].map(quote).join(","));
  const csv = `\uFEFF${[columns.map(quote).join(","), ...rows].join("\r\n")}`;
  const blobUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `job-clipper-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  announce(`Exported ${jobs.length} ${jobs.length === 1 ? "job" : "jobs"} to CSV.`);
}

$("#clipButton").addEventListener("click", clipJob);
$("#exportButton").addEventListener("click", exportCsv);
$("#searchInput").addEventListener("input", renderBoard);
$("#jobForm").addEventListener("submit", saveJob);
$("#closeFormButton").addEventListener("click", closeForm);
$("#cancelFormButton").addEventListener("click", closeForm);
attachDropTargets();
storageGet(renderBoard);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY]) return;
  jobs = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
  renderBoard();
});
