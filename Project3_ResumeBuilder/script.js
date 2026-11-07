"use strict";

const STORAGE_KEY = "resume-studio-profile-v1";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const sectionNames = {
  experience: "Experience",
  education: "Education",
  projects: "Projects",
  skills: "Skills"
};
const fieldsByType = {
  experience: [
    ["role", "Job title", "e.g. Senior Product Designer"],
    ["company", "Company", "e.g. Acme Studio"],
    ["dates", "Dates", "e.g. 2022 – Present"],
    ["location", "Location", "e.g. Remote"],
    ["description", "Highlights", "Achievements and impact, one per line", true]
  ],
  education: [
    ["degree", "Degree / program", "e.g. B.A. Communication Design"],
    ["school", "School", "e.g. State University"],
    ["dates", "Dates", "e.g. 2018 – 2022"],
    ["location", "Location", "e.g. Boston, MA"],
    ["description", "Details", "Relevant honors or coursework", true]
  ],
  projects: [
    ["name", "Project name", "e.g. Open-source design system"],
    ["role", "Your role", "e.g. Designer & maintainer"],
    ["dates", "Dates", "e.g. 2023"],
    ["url", "Project link", "e.g. github.com/name/project"],
    ["description", "Description", "What you built and its impact", true]
  ]
};

function blankProfile() {
  return {
    personal: { name: "", title: "", email: "", phone: "", location: "", website: "", summary: "" },
    experience: [],
    education: [],
    projects: [],
    skills: [],
    order: ["experience", "education", "projects", "skills"],
    template: "minimal"
  };
}

let profile = blankProfile();
let activeDrag = null;
let saveTimer;

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2600);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function appendText(parent, tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  parent.append(element);
  return element;
}

function cleanProfile(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The selected file is not a resume profile object.");
  const next = blankProfile();
  if (data.personal !== undefined && (!data.personal || typeof data.personal !== "object" || Array.isArray(data.personal))) {
    throw new Error("Personal information must be an object.");
  }
  for (const key of Object.keys(next.personal)) next.personal[key] = text(data.personal?.[key]);
  for (const type of ["experience", "education", "projects"]) {
    if (data[type] !== undefined && !Array.isArray(data[type])) throw new Error(`${sectionNames[type]} must be a list.`);
    next[type] = (data[type] || []).map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`${sectionNames[type]} entries must be objects.`);
      const clean = {};
      for (const [key] of fieldsByType[type]) clean[key] = text(entry[key]);
      return clean;
    });
  }
  if (data.skills !== undefined && !Array.isArray(data.skills) && typeof data.skills !== "string") {
    throw new Error("Skills must be a list of strings.");
  }
  next.skills = Array.isArray(data.skills)
    ? data.skills.map(text).filter(Boolean)
    : text(data.skills).split(",").map((skill) => skill.trim()).filter(Boolean);
  if (Array.isArray(data.order)) {
    const allowed = new Set(Object.keys(sectionNames));
    const requested = data.order.filter((item) => allowed.has(item));
    next.order = [...new Set(requested), ...Array.from(allowed).filter((item) => !requested.includes(item))];
  }
  if (["minimal", "modern", "creative"].includes(data.template)) next.template = data.template;
  return next;
}

function updateEditor() {
  $$("[data-personal]").forEach((input) => { input.value = profile.personal[input.dataset.personal] || ""; });
  $("#skillsInput").value = profile.skills.join(", ");
  for (const type of Object.keys(fieldsByType)) renderEntryEditors(type);
  $$(".template-option").forEach((button) => button.classList.toggle("selected", button.dataset.template === profile.template));
}

function createField(type, entryIndex, [key, labelText, placeholder, multiline]) {
  const label = document.createElement("label");
  label.className = `field${multiline ? " wide" : ""}`;
  label.textContent = labelText;
  const input = document.createElement(multiline ? "textarea" : "input");
  input.dataset.entryType = type;
  input.dataset.entryIndex = String(entryIndex);
  input.dataset.entryField = key;
  input.placeholder = placeholder;
  input.value = profile[type][entryIndex][key] || "";
  if (multiline) input.rows = 3;
  label.append(input);
  return label;
}

function renderEntryEditors(type) {
  const list = $(`[data-entry-list="${type}"]`);
  list.replaceChildren();
  if (!profile[type].length) {
    const empty = document.createElement("p");
    empty.className = "empty-collection";
    empty.textContent = `No ${type} added yet. Use “＋ Add” to get started.`;
    list.append(empty);
    return;
  }
  profile[type].forEach((entry, index) => {
    const card = document.createElement("div");
    card.className = "entry-editor";
    const toolbar = document.createElement("div");
    toolbar.className = "entry-toolbar";
    const label = document.createElement("span");
    label.textContent = `${sectionNames[type]} ${index + 1}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-entry";
    remove.dataset.removeType = type;
    remove.dataset.removeIndex = String(index);
    remove.textContent = "Remove";
    toolbar.append(label, remove);
    const grid = document.createElement("div");
    grid.className = "entry-editor-grid";
    fieldsByType[type].forEach((field) => grid.append(createField(type, index, field)));
    card.append(toolbar, grid);
    list.append(card);
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      $("#editorStatus").textContent = "Changes saved on this device.";
    } catch (error) {
      console.error("Could not save resume data locally.", error);
      $("#editorStatus").textContent = "Could not save locally. Export a JSON backup to keep your changes.";
    }
  }, 160);
}

function contactItems() {
  const personal = profile.personal;
  return [personal.email, personal.phone, personal.location, personal.website].filter(Boolean);
}

function sectionIsRelevant(type) {
  if (type === "skills") return profile.skills.length > 0;
  return profile[type].some((entry) => Object.values(entry).some((value) => text(value)));
}

function renderHeader() {
  const header = $("[data-resume-header]");
  header.replaceChildren();
  const personal = profile.personal;
  appendText(header, "h1", "resume-name", personal.name || "Your Name");
  appendText(header, "p", "resume-title", personal.title || "Professional Title");
  const contacts = document.createElement("div");
  contacts.className = "resume-contact";
  const items = contactItems();
  if (!items.length) items.push("email@example.com", "City, Country");
  items.forEach((value) => appendText(contacts, "span", "", value));
  header.append(contacts);
  if (personal.summary) appendText(header, "p", "resume-summary", personal.summary);
}

function renderExperience(parent, type, entry) {
  const title = type === "experience" ? entry.role : type === "education" ? entry.degree : entry.name;
  const subtitle = type === "experience" ? entry.company : type === "education" ? entry.school : entry.role;
  const entryNode = document.createElement("article");
  entryNode.className = "section-entry";
  const top = document.createElement("div");
  top.className = "entry-topline";
  if (title) appendText(top, "h3", "entry-title", title);
  if (entry.dates) appendText(top, "span", "entry-date", entry.dates);
  if (top.childNodes.length) entryNode.append(top);
  if (subtitle || entry.location) {
    const subline = [subtitle, entry.location].filter(Boolean).join(" · ");
    appendText(entryNode, "p", "entry-subtitle", subline);
  }
  if (entry.description) appendText(entryNode, "p", "entry-description", entry.description);
  if (entry.url) appendText(entryNode, "p", "entry-description", entry.url);
  parent.append(entryNode);
}

function createResumeSection(type) {
  const section = document.createElement("section");
  section.className = "resume-section";
  section.dataset.section = type;
  section.draggable = true;
  const heading = document.createElement("h2");
  heading.className = "resume-section-title";
  const grip = document.createElement("button");
  grip.type = "button";
  grip.className = "section-grip";
  grip.setAttribute("aria-label", `Drag to reorder ${sectionNames[type] || "Skills"} section`);
  grip.title = "Drag to reorder this section";
  grip.textContent = "⠿";
  appendText(heading, "span", "", sectionNames[type] || "Skills");
  heading.prepend(grip);
  section.append(heading);
  if (type === "skills") {
    const skills = document.createElement("div");
    skills.className = "skills-list";
    profile.skills.forEach((skill) => appendText(skills, "span", "skill-item", skill));
    section.append(skills);
  } else {
    profile[type].filter((entry) => Object.values(entry).some((value) => text(value)))
      .forEach((entry) => renderExperience(section, type, entry));
  }
  return section;
}

function updatePageEstimate() {
  const paper = $("#resumePreview");
  const width = paper.clientWidth;
  const pageCount = width ? Math.max(1, Math.ceil((paper.scrollHeight / width) * (210 / 297) - 0.02)) : 1;
  $("#pageEstimate").textContent = String(pageCount);
  $("#pagePlural").textContent = pageCount === 1 ? "" : "s";
}

function renderPreview() {
  const preview = $("#resumePreview");
  preview.dataset.template = profile.template;
  preview.className = `resume-paper template-${profile.template}`;
  renderHeader();
  const sections = $("[data-resume-sections]");
  sections.replaceChildren();
  profile.order.forEach((type) => {
    if (sectionIsRelevant(type)) sections.append(createResumeSection(type));
  });
  updatePageEstimate();
}

function renderAll() {
  updateEditor();
  renderPreview();
}

function exportJson() {
  const blob = new Blob([`${JSON.stringify(profile, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(profile.personal.name || "resume").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "resume"}-profile.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Resume profile exported as JSON.");
}

async function importJson(file) {
  if (!file) return;
  const content = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  profile = cleanProfile(parsed);
  renderAll();
  scheduleSave();
  toast("Resume profile imported.");
}

$("#resumeForm").addEventListener("input", (event) => {
  const target = event.target;
  if (target.matches("[data-personal]")) {
    profile.personal[target.dataset.personal] = target.value;
  } else if (target.matches("[data-entry-type]")) {
    const { entryType, entryIndex, entryField } = target.dataset;
    profile[entryType][Number(entryIndex)][entryField] = target.value;
  } else if (target.id === "skillsInput") {
    profile.skills = target.value.split(",").map((skill) => skill.trim()).filter(Boolean);
  } else {
    return;
  }
  renderPreview();
  scheduleSave();
});

$("#resumeForm").addEventListener("click", (event) => {
  const add = event.target.closest("[data-add]");
  if (add) {
    const type = add.dataset.add;
    profile[type].push(Object.fromEntries(fieldsByType[type].map(([key]) => [key, ""])));
    renderEntryEditors(type);
    const input = $(`[data-entry-type="${type}"][data-entry-index="${profile[type].length - 1}"]`);
    input?.focus();
    scheduleSave();
    return;
  }
  const remove = event.target.closest("[data-remove-type]");
  if (!remove) return;
  const type = remove.dataset.removeType;
  profile[type].splice(Number(remove.dataset.removeIndex), 1);
  renderEntryEditors(type);
  renderPreview();
  scheduleSave();
});

$$(".template-option").forEach((button) => button.addEventListener("click", () => {
  profile.template = button.dataset.template;
  $$(".template-option").forEach((option) => option.classList.toggle("selected", option === button));
  renderPreview();
  scheduleSave();
}));

const resumeSections = $("[data-resume-sections]");
resumeSections.addEventListener("dragstart", (event) => {
  const section = event.target.closest("[data-section]");
  if (!section) return;
  activeDrag = section.dataset.section;
  section.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", activeDrag);
});
resumeSections.addEventListener("dragend", (event) => {
  event.target.closest("[data-section]")?.classList.remove("dragging");
  $$(".drop-target", resumeSections).forEach((section) => section.classList.remove("drop-target"));
  activeDrag = null;
});
resumeSections.addEventListener("dragover", (event) => {
  event.preventDefault();
  const target = event.target.closest("[data-section]");
  if (target && target.dataset.section !== activeDrag) {
    $$(".drop-target", resumeSections).forEach((section) => section.classList.remove("drop-target"));
    target.classList.add("drop-target");
  }
});
resumeSections.addEventListener("drop", (event) => {
  event.preventDefault();
  const target = event.target.closest("[data-section]");
  if (!activeDrag || !target || target.dataset.section === activeDrag) return;
  const from = profile.order.indexOf(activeDrag);
  const to = profile.order.indexOf(target.dataset.section);
  if (from < 0 || to < 0) return;
  profile.order.splice(from, 1);
  profile.order.splice(to, 0, activeDrag);
  renderPreview();
  scheduleSave();
  toast(`${sectionNames[activeDrag]} section moved.`);
});

$("#printButton").addEventListener("click", () => window.print());
$("#exportJsonButton").addEventListener("click", exportJson);
$("#importButton").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", async (event) => {
  try {
    await importJson(event.target.files[0]);
  } catch (error) {
    console.error("Resume import failed.", error);
    toast(`Import failed: ${error.message}`);
  } finally {
    event.target.value = "";
  }
});
$("#resetButton").addEventListener("click", () => {
  if (!window.confirm("Clear all resume details from this device?")) return;
  profile = blankProfile();
  renderAll();
  scheduleSave();
  toast("Resume details cleared.");
});
window.addEventListener("resize", updatePageEstimate);

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) profile = cleanProfile(JSON.parse(saved));
} catch (error) {
  console.error("Could not load the saved resume profile.", error);
  $("#editorStatus").textContent = "Saved profile could not be loaded. Your current edits are still available.";
}
renderAll();