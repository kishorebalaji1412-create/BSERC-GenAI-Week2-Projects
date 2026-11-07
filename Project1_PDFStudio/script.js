/* global pdfjsLib, PDFLib */
"use strict";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const state = {
  files: [],
  bytes: null,
  pdf: null,
  name: "",
  pageCount: 0,
  pageIndex: 0,
  annotations: new Map(),
  stamp: null,
  metadata: {},
  dragIndex: null,
  pointerStart: null,
  pointerPoints: [],
  primaryFile: null
};

const tabCopy = {
  organise: ["Organise", "YOUR DOCUMENT WORKSPACE", "Organise your PDF", "Arrange pages, combine files, and make quick page-level changes."],
  edit: ["Edit", "ANNOTATE YOUR DOCUMENT", "Edit your PDF", "Add notes, highlights, redactions, and signatures to your pages."],
  stamp: ["Stamp", "MAKE IT YOURS", "Stamp your PDF", "Add page numbers, headers, dates, and watermarks in one step."],
  convert: ["Convert", "CHANGE YOUR FORMAT", "Convert your files", "Move between PDFs, images, and text — right in your browser."],
  finish: ["Finish", "FINAL TOUCHES", "Finish your PDF", "Compress your file or update its document information."]
};

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function reportError(error, action) {
  console.error(`PDF Studio: ${action} failed`, error);
  showToast(`${action} failed: ${error.message || "Unexpected error"}`);
}

function checkLibraries() {
  if (!window.pdfjsLib || !window.PDFLib) throw new Error("PDF libraries did not load. Reconnect and reload the page.");
}

function downloadBytes(bytes, filename, type = "application/pdf") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(name) {
  return (name || "document").replace(/\.pdf$/i, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

async function loadFiles(fileList) {
  checkLibraries();
  const files = Array.from(fileList || []);
  if (!files.length) return;
  for (const file of files) {
    if (file.type.startsWith("image/")) {
      state.files.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), type: "image", mime: file.type });
      continue;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast(`Skipped unsupported file: ${file.name}`);
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await PDFLib.PDFDocument.load(bytes);
    state.files.push({ name: file.name, bytes, type: "pdf", pages: pdf.getPageCount() });
  }
  const firstPdf = state.files.find((file) => file.type === "pdf");
  if (!state.bytes && firstPdf) {
    state.bytes = firstPdf.bytes;
    state.name = firstPdf.name;
    state.primaryFile = firstPdf;
    state.annotations.clear();
    state.stamp = null;
    await refreshDocument();
  } else if (state.bytes) {
    renderFileSummary();
    showToast(`${files.length} file${files.length === 1 ? "" : "s"} added`);
  } else if (state.files.some((file) => file.type === "image")) {
    await imagesToPdf(state.files.filter((file) => file.type === "image"));
  }
}

async function refreshDocument() {
  checkLibraries();
  if (!state.bytes) return;
  const pdfData = state.bytes.slice();
  state.pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
  state.pageCount = state.pdf.numPages;
  state.pageIndex = Math.min(state.pageIndex, state.pageCount - 1);
  $("#uploadPanel").classList.add("hidden");
  $("#workspace").classList.remove("hidden");
  $("#saveButton").disabled = false;
  renderFileSummary();
  await renderPageList();
  if (state.pageCount) await showPage(state.pageIndex);
  else clearPreview();
}

function renderFileSummary() {
  const pdfCount = state.files.filter((file) => file.type === "pdf").length;
  $("#fileName").textContent = state.name || "Document.pdf";
  $("#fileDetails").textContent = `${state.pageCount} page${state.pageCount === 1 ? "" : "s"} · PDF${pdfCount > 1 ? ` · ${pdfCount} files loaded` : ""}`;
  $("#pageCount").textContent = state.pageCount;
}

async function renderPageList() {
  const list = $("#pageList");
  list.replaceChildren();
  for (let index = 0; index < state.pageCount; index += 1) {
    const item = document.createElement("div");
    item.className = `page-item${index === state.pageIndex ? " active" : ""}`;
    item.draggable = true;
    item.dataset.index = index;
    const canvas = document.createElement("canvas");
    const label = document.createElement("span");
    label.textContent = `Page ${index + 1}`;
    item.append(canvas, label);
    item.addEventListener("click", () => showPage(index));
    item.addEventListener("dragstart", (event) => {
      state.dragIndex = Number(item.dataset.index);
      item.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    item.addEventListener("dragover", (event) => event.preventDefault());
    item.addEventListener("drop", async (event) => {
      event.preventDefault();
      const target = Number(item.dataset.index);
      if (state.dragIndex === null || state.dragIndex === target) return;
      try {
        await reorderPage(state.dragIndex, target);
      } catch (error) {
        reportError(error, "Reorder pages");
      }
    });
    list.append(item);
    const page = await state.pdf.getPage(index + 1);
    const viewport = page.getViewport({ scale: 0.3 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  }
  list.querySelectorAll(".page-item").forEach((item, index) => item.classList.toggle("active", index === state.pageIndex));
}

async function showPage(index) {
  if (!state.pdf || index < 0 || index >= state.pageCount) return;
  state.pageIndex = index;
  const page = await state.pdf.getPage(index + 1);
  const maxWidth = Math.max(220, Math.min(780, $("#previewArea").clientWidth - 46));
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(1.35, maxWidth / base.width);
  const viewport = page.getViewport({ scale });
  const canvas = $("#pageCanvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  const annotationCanvas = $("#annotationCanvas");
  annotationCanvas.width = canvas.width;
  annotationCanvas.height = canvas.height;
  $("#pageCanvasWrap").style.width = `${canvas.width}px`;
  $("#pageCanvasWrap").style.height = `${canvas.height}px`;
  $("#pageCanvasWrap").classList.remove("hidden");
  $("#previewEmpty").classList.add("hidden");
  $("#pageLabel").textContent = `Page ${index + 1} of ${state.pageCount}`;
  $("#pageList").querySelectorAll(".page-item").forEach((item, itemIndex) => item.classList.toggle("active", itemIndex === index));
  drawAnnotationsPreview();
}

function clearPreview() {
  $("#pageCanvasWrap").classList.add("hidden");
  $("#previewEmpty").classList.remove("hidden");
  $("#pageLabel").textContent = "Select a page";
}

function annotationList(index = state.pageIndex) {
  if (!state.annotations.has(index)) state.annotations.set(index, []);
  return state.annotations.get(index);
}

function drawAnnotationsPreview(preview = null) {
  const canvas = $("#annotationCanvas");
  if (!canvas.width) return;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  const drawShape = (item) => {
    const x = item.x * canvas.width;
    const y = item.y * canvas.height;
    const width = (item.width || 0) * canvas.width;
    const height = (item.height || 0) * canvas.height;
    if (item.type === "text" || item.type === "sign") {
      context.fillStyle = item.color;
      context.font = `${item.type === "sign" ? "italic " : ""}${Math.max(14, canvas.width * .035)}px sans-serif`;
      context.fillText(item.text, x, y);
    } else if (item.type === "draw") {
      context.strokeStyle = item.color;
      context.lineWidth = Math.max(2, canvas.width * .003);
      context.beginPath();
      item.points.forEach((point, index) => {
        if (!index) context.moveTo(point.x * canvas.width, point.y * canvas.height);
        else context.lineTo(point.x * canvas.width, point.y * canvas.height);
      });
      context.stroke();
    } else {
      context.fillStyle = item.type === "highlight" ? `${item.color}66` : item.type === "redact" ? "#000000" : "#ffffff";
      context.fillRect(x, y, width, height);
    }
  };
  annotationList().forEach(drawShape);
  if (preview) drawShape(preview);
}

function eventPoint(event) {
  const canvas = $("#annotationCanvas");
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
}

function addAnnotationFromPointer(event) {
  const tool = $("#editTool").value;
  const point = eventPoint(event);
  const text = $("#editText").value.trim();
  const color = $("#editColor").value;
  if (tool === "text" || tool === "sign") {
    const value = tool === "sign" ? (text || "Signature") : text;
    if (!value) {
      showToast("Enter text before placing it on the page.");
      return;
    }
    annotationList().push({ type: tool, x: point.x, y: point.y, text: value, color });
    drawAnnotationsPreview();
    return;
  }
  const start = state.pointerStart;
  const width = point.x - start.x;
  const height = point.y - start.y;
  if (tool === "draw") {
    state.pointerPoints.push(point);
    annotationList().push({ type: "draw", points: state.pointerPoints, color });
    state.pointerPoints = [];
  } else {
    if (Math.abs(width) < .003 || Math.abs(height) < .003) {
      showToast("Drag across an area on the page to apply this tool.");
      return;
    }
    annotationList().push({ type: tool, x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(width), height: Math.abs(height), color });
  }
  drawAnnotationsPreview();
}

$("#annotationCanvas").addEventListener("pointerdown", (event) => {
  if (!state.pdf || !["edit"].includes($(".tab.active")?.dataset.tab)) return;
  const point = eventPoint(event);
  state.pointerStart = point;
  state.pointerPoints = [point];
  $("#annotationCanvas").setPointerCapture(event.pointerId);
  const tool = $("#editTool").value;
  if (tool === "text" || tool === "sign") {
    addAnnotationFromPointer(event);
    state.pointerStart = null;
  }
});
$("#annotationCanvas").addEventListener("pointermove", (event) => {
  if (!state.pointerStart) return;
  const point = eventPoint(event);
  const tool = $("#editTool").value;
  if (tool === "draw") {
    state.pointerPoints.push(point);
    drawAnnotationsPreview({ type: "draw", points: state.pointerPoints, color: $("#editColor").value });
    return;
  }
  drawAnnotationsPreview({
    type: tool,
    x: Math.min(state.pointerStart.x, point.x),
    y: Math.min(state.pointerStart.y, point.y),
    width: Math.abs(point.x - state.pointerStart.x),
    height: Math.abs(point.y - state.pointerStart.y),
    color: $("#editColor").value
  });
});
$("#annotationCanvas").addEventListener("pointerup", (event) => {
  if (!state.pointerStart) return;
  addAnnotationFromPointer(event);
  state.pointerStart = null;
});

async function mutatePdf(mutator) {
  checkLibraries();
  const document = await PDFLib.PDFDocument.load(state.bytes);
  await mutator(document);
  state.bytes = await document.save();
  await refreshDocument();
}

async function reorderPage(from, to) {
  const source = await PDFLib.PDFDocument.load(state.bytes);
  const output = await PDFLib.PDFDocument.create();
  const order = Array.from({ length: source.getPageCount() }, (_, index) => index);
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  const pages = await output.copyPages(source, order);
  pages.forEach((page) => output.addPage(page));
  state.bytes = await output.save();
  const annotations = new Map();
  order.forEach((oldIndex, newIndex) => {
    if (state.annotations.has(oldIndex)) annotations.set(newIndex, state.annotations.get(oldIndex));
  });
  state.annotations = annotations;
  state.pageIndex = to;
  await refreshDocument();
  await renderPageList();
  await showPage(state.pageIndex);
  showToast("Page order updated");
}

async function mergePdfs() {
  const additional = state.files.filter((file) => file.type === "pdf" && file !== state.primaryFile);
  if (!additional.length) {
    showToast("Add another PDF first, then choose Merge PDFs.");
    return;
  }
  const output = await PDFLib.PDFDocument.load(state.bytes);
  for (const file of additional) {
    const source = await PDFLib.PDFDocument.load(file.bytes);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  state.bytes = await output.save();
  state.name = `${safeName(state.name)}-merged.pdf`;
  state.primaryFile = { name: state.name, bytes: state.bytes, type: "pdf" };
  state.files = [state.primaryFile];
  state.annotations.clear();
  await refreshDocument();
  showToast("PDF files merged");
}

function parsePageRange(value) {
  const pages = new Set();
  for (const part of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Use a page range such as 1-3, 5.");
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > state.pageCount) throw new Error(`Page range must be between 1 and ${state.pageCount}.`);
    for (let index = start; index <= end; index += 1) pages.add(index - 1);
  }
  if (!pages.size) throw new Error("Enter pages to split, for example 1-3, 5.");
  return Array.from(pages).sort((a, b) => a - b);
}

async function splitPdf() {
  const indexes = parsePageRange($("#splitRange").value);
  const source = await PDFLib.PDFDocument.load(state.bytes);
  const output = await PDFLib.PDFDocument.create();
  const pages = await output.copyPages(source, indexes);
  pages.forEach((page) => output.addPage(page));
  downloadBytes(await output.save(), `${safeName(state.name)}-pages.pdf`);
  showToast(`${indexes.length} page${indexes.length === 1 ? "" : "s"} exported`);
}

async function addBlankPage() {
  if (state.pageCount >= 1) {
    const insertIndex = state.pageIndex + 1;
    await mutatePdf((document) => {
      const selected = document.getPage(state.pageIndex);
      const { width, height } = selected.getSize();
      document.insertPage(insertIndex, [width, height]);
    });
    const annotations = new Map();
    state.annotations.forEach((items, index) => annotations.set(index >= insertIndex ? index + 1 : index, items));
    state.annotations = annotations;
    state.pageIndex = insertIndex;
    await renderPageList();
    await showPage(state.pageIndex);
  }
}

function drawStampOnPage(page, index, total, font, text) {
  const { width, height } = page.getSize();
  const type = state.stamp.type;
  const stampText = type === "number" ? `${index + 1} / ${total}` : type === "date" ? new Date().toLocaleDateString() : text;
  if (!stampText) return;
  const fontSize = type === "watermark" ? Math.min(38, width / 12) : 11;
  const textWidth = font.widthOfTextAtSize(stampText, fontSize);
  const position = state.stamp.position;
  let x = (width - textWidth) / 2;
  if (position === "left") x = 28;
  if (position === "right") x = width - textWidth - 28;
  const y = type === "header" ? height - 25 : type === "watermark" ? height / 2 : 20;
  page.drawText(stampText, {
    x, y, size: fontSize, font, color: PDFLib.rgb(.35, .37, .44),
    opacity: type === "watermark" ? .2 : .9,
    rotate: type === "watermark" ? PDFLib.degrees(-32) : PDFLib.degrees(0)
  });
}

async function createFlattenedPdf({ quality = .9, includeStamps = true } = {}) {
  const output = await PDFLib.PDFDocument.create();
  for (let index = 0; index < state.pageCount; index += 1) {
    const page = await state.pdf.getPage(index + 1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const context = canvas.getContext("2d");
    const annotations = state.annotations.get(index) || [];
    for (const item of annotations) {
      const x = item.x * canvas.width;
      const y = item.y * canvas.height;
      const width = (item.width || 0) * canvas.width;
      const height = (item.height || 0) * canvas.height;
      if (item.type === "text" || item.type === "sign") {
        context.fillStyle = item.color;
        context.font = `${item.type === "sign" ? "italic " : ""}36px sans-serif`;
        context.fillText(item.text, x, y);
      } else if (item.type === "draw") {
        context.strokeStyle = item.color;
        context.lineWidth = 6;
        context.beginPath();
        item.points.forEach((point, pointIndex) => {
          if (!pointIndex) context.moveTo(point.x * canvas.width, point.y * canvas.height);
          else context.lineTo(point.x * canvas.width, point.y * canvas.height);
        });
        context.stroke();
      } else {
        context.fillStyle = item.type === "highlight" ? `${item.color}66` : item.type === "redact" ? "#000" : "#fff";
        context.fillRect(x, y, width, height);
      }
    }
    if (includeStamps && state.stamp) {
      const text = state.stamp.type === "number" ? `${index + 1} / ${state.pageCount}` :
        state.stamp.type === "date" ? new Date().toLocaleDateString() : state.stamp.text;
      if (text) {
        context.save();
        context.fillStyle = "#666";
        context.globalAlpha = state.stamp.type === "watermark" ? .2 : .9;
        context.font = `${state.stamp.type === "watermark" ? 48 : 22}px sans-serif`;
        const textWidth = context.measureText(text).width;
        let x = (canvas.width - textWidth) / 2;
        if (state.stamp.position === "left") x = 50;
        if (state.stamp.position === "right") x = canvas.width - textWidth - 50;
        const y = state.stamp.type === "header" ? 55 : state.stamp.type === "watermark" ? canvas.height / 2 : canvas.height - 30;
        context.fillText(text, x, y);
        context.restore();
      }
    }
    const imageBytes = await (await fetch(canvas.toDataURL("image/jpeg", quality))).arrayBuffer();
    const image = await output.embedJpg(imageBytes);
    const size = page.getViewport({ scale: 1 });
    const outputPage = output.addPage([size.width, size.height]);
    outputPage.drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
    canvas.width = 0;
    canvas.height = 0;
  }
  return output.save();
}

async function exportPdf() {
  checkLibraries();
  if (!state.bytes) return;
  const hasRedactions = Array.from(state.annotations.values()).some((items) => items.some((item) => item.type === "redact"));
  let output;
  if (hasRedactions) {
    output = await createFlattenedPdf({ includeStamps: true });
  } else {
    const document = await PDFLib.PDFDocument.load(state.bytes);
    const font = await document.embedFont(PDFLib.StandardFonts.Helvetica);
    for (const [index, items] of state.annotations.entries()) {
      const page = document.getPage(index);
      const { width, height } = page.getSize();
      for (const item of items) {
        const x = item.x * width;
        const yTop = item.y * height;
        const w = (item.width || 0) * width;
        const h = (item.height || 0) * height;
        if (item.type === "text" || item.type === "sign") {
          page.drawText(item.text, { x, y: height - yTop, size: 14, font, color: PDFLib.rgb(...hexRgb(item.color)) });
        } else if (item.type === "draw") {
          for (let pointIndex = 1; pointIndex < item.points.length; pointIndex += 1) {
            const first = item.points[pointIndex - 1];
            const second = item.points[pointIndex];
            page.drawLine({
              start: { x: first.x * width, y: height - first.y * height },
              end: { x: second.x * width, y: height - second.y * height },
              thickness: 2, color: PDFLib.rgb(...hexRgb(item.color))
            });
          }
        } else {
          page.drawRectangle({
            x, y: height - yTop - h, width: w, height: h,
            color: item.type === "highlight" ? PDFLib.rgb(...hexRgb(item.color)) : PDFLib.rgb(1, 1, 1),
            opacity: item.type === "highlight" ? .4 : 1
          });
        }
      }
    }
    if (state.stamp) document.getPages().forEach((page, index) => drawStampOnPage(page, index, document.getPageCount(), font, state.stamp.text));
    output = await document.save({ useObjectStreams: true });
  }
  const metadataDoc = await PDFLib.PDFDocument.load(output);
  const metadata = state.metadata;
  if (metadata.title) metadataDoc.setTitle(metadata.title);
  if (metadata.author) metadataDoc.setAuthor(metadata.author);
  if (metadata.subject) metadataDoc.setSubject(metadata.subject);
  downloadBytes(await metadataDoc.save({ useObjectStreams: true }), `${safeName(state.name)}-edited.pdf`);
  showToast("Your PDF is ready to download");
}

function hexRgb(hex) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
}

async function imagesToPdf(files) {
  if (!files.length) {
    $("#fileInput").accept = "image/*";
    $("#fileInput").click();
    return;
  }
  const output = await PDFLib.PDFDocument.create();
  for (const file of files) {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([file.bytes], { type: file.mime }));
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error(`Could not read image ${file.name}`));
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d").drawImage(image, 0, 0);
      const data = await (await fetch(canvas.toDataURL("image/png"))).arrayBuffer();
      const embedded = await output.embedPng(data);
      const page = output.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const bytes = await output.save();
  downloadBytes(bytes, "images-to-pdf.pdf");
  showToast("Image PDF created");
}

async function pdfToImages() {
  for (let index = 0; index < state.pageCount; index += 1) {
    const page = await state.pdf.getPage(index + 1);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error(`Could not export page ${index + 1} as an image.`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName(state.name)}-page-${index + 1}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    canvas.width = 0;
    canvas.height = 0;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  showToast(`${state.pageCount} page images exported`);
}

async function pdfToText() {
  const pages = [];
  for (let index = 0; index < state.pageCount; index += 1) {
    const page = await state.pdf.getPage(index + 1);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str || "").join(" ").replace(/\s+/g, " ").trim();
    pages.push(`--- Page ${index + 1} ---\n${text}`);
  }
  const output = $("#textOutput");
  output.value = pages.join("\n\n");
  output.classList.remove("hidden");
  showToast("Text extracted");
}

async function compressPdf() {
  const quality = Number($("#compressionQuality").value);
  state.bytes = await createFlattenedPdf({ quality, includeStamps: true });
  state.name = `${safeName(state.name)}-compressed.pdf`;
  state.primaryFile = { name: state.name, bytes: state.bytes, type: "pdf" };
  state.files = [state.primaryFile];
  state.annotations.clear();
  state.stamp = null;
  await refreshDocument();
  showToast("Compressed PDF created. Text is now part of page images.");
}

async function saveMetadata() {
  state.metadata = {
    title: $("#metaTitle").value.trim(),
    author: $("#metaAuthor").value.trim(),
    subject: $("#metaSubject").value.trim()
  };
  const document = await PDFLib.PDFDocument.load(state.bytes);
  if (state.metadata.title) document.setTitle(state.metadata.title);
  if (state.metadata.author) document.setAuthor(state.metadata.author);
  if (state.metadata.subject) document.setSubject(state.metadata.subject);
  state.bytes = await document.save();
  showToast("Metadata saved to the PDF.");
}

function resetWorkspace() {
  state.files = [];
  state.bytes = null;
  state.pdf = null;
  state.name = "";
  state.primaryFile = null;
  state.pageCount = 0;
  state.pageIndex = 0;
  state.annotations.clear();
  state.stamp = null;
  state.metadata = {};
  $("#workspace").classList.add("hidden");
  $("#uploadPanel").classList.remove("hidden");
  $("#saveButton").disabled = true;
  $("#textOutput").classList.add("hidden");
  $("#fileInput").accept = ".pdf,application/pdf,image/*";
  clearPreview();
}

function runAction(action, label) {
  action().catch((error) => reportError(error, label));
}

$$(".tab").forEach((tab) => tab.addEventListener("click", () => {
  $$(".tab").forEach((item) => item.classList.toggle("active", item === tab));
  const selected = tab.dataset.tab;
  const copy = tabCopy[selected];
  $("#activeSection").textContent = copy[0];
  $("#sectionEyebrow").textContent = copy[1];
  $("#sectionTitle").textContent = copy[2];
  $("#sectionDescription").textContent = copy[3];
  $$("[data-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== selected));
}));

$("#addFilesButton").addEventListener("click", () => {
  $("#fileInput").accept = ".pdf,application/pdf,image/*";
  $("#fileInput").click();
});
$("#browseButton").addEventListener("click", () => $("#fileInput").click());
$("#fileInput").addEventListener("change", (event) => {
  runAction(() => loadFiles(event.target.files), "Open files");
  event.target.value = "";
});
$("#imageInput").addEventListener("change", (event) => {
  const images = Array.from(event.target.files);
  runAction(async () => {
    const prepared = await Promise.all(images.map(async (file) => ({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      type: "image",
      mime: file.type
    })));
    await imagesToPdf(prepared);
  }, "Convert images to PDF");
  event.target.value = "";
});
$("#clearButton").addEventListener("click", resetWorkspace);
$("#saveButton").addEventListener("click", () => runAction(exportPdf, "Download PDF"));
$("#mergeButton").addEventListener("click", () => runAction(mergePdfs, "Merge PDFs"));
$("#splitButton").addEventListener("click", () => runAction(splitPdf, "Split PDF"));
$("#rotateButton").addEventListener("click", () => runAction(async () => {
  await mutatePdf((document) => {
    const page = document.getPage(state.pageIndex);
    page.setRotation(PDFLib.degrees((page.getRotation().angle + 90) % 360));
  });
  showToast("Page rotated");
}, "Rotate page"));
$("#deletePageButton").addEventListener("click", () => runAction(async () => {
  if (state.pageCount <= 1) throw new Error("A PDF must contain at least one page.");
  const deletedIndex = state.pageIndex;
  await mutatePdf((document) => document.removePage(state.pageIndex));
  const annotations = new Map();
  state.annotations.forEach((items, index) => {
    if (index !== deletedIndex) annotations.set(index > deletedIndex ? index - 1 : index, items);
  });
  state.annotations = annotations;
  state.pageIndex = Math.min(deletedIndex, state.pageCount - 1);
  await renderPageList();
  await showPage(state.pageIndex);
  showToast("Page deleted");
}, "Delete page"));
$("#insertPageButton").addEventListener("click", () => runAction(addBlankPage, "Insert blank page"));
$("#applyStampButton").addEventListener("click", () => {
  const type = $("#stampType").value;
  const text = $("#stampText").value.trim();
  if (["header", "footer", "watermark"].includes(type) && !text) {
    showToast("Enter stamp text before applying it.");
    return;
  }
  state.stamp = { type, text, position: $("#stampPosition").value };
  showToast("Stamp added. Download the PDF to apply it.");
});
$("#imagesToPdfButton").addEventListener("click", () => {
  $("#imageInput").click();
});
$("#pdfToImagesButton").addEventListener("click", () => runAction(pdfToImages, "Convert PDF to images"));
$("#pdfToTextButton").addEventListener("click", () => runAction(pdfToText, "Extract PDF text"));
$("#compressButton").addEventListener("click", () => runAction(compressPdf, "Compress PDF"));
$("#metadataButton").addEventListener("click", () => runAction(saveMetadata, "Save metadata"));
$("#prevPage").addEventListener("click", () => showPage(state.pageIndex - 1));
$("#nextPage").addEventListener("click", () => showPage(state.pageIndex + 1));
$("#themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  const dark = document.body.classList.contains("dark");
  $("#themeLabel").textContent = dark ? "Light mode" : "Dark mode";
  localStorage.setItem("pdf-studio-dark", String(dark));
});

const dropArea = $("#uploadPanel");
["dragenter", "dragover"].forEach((eventName) => dropArea.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropArea.classList.add("drag-over");
}));
["dragleave", "drop"].forEach((eventName) => dropArea.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropArea.classList.remove("drag-over");
}));
dropArea.addEventListener("drop", (event) => runAction(() => loadFiles(event.dataTransfer.files), "Open files"));
["dragenter", "dragover", "drop"].forEach((eventName) => document.addEventListener(eventName, (event) => event.preventDefault()));

const savedDark = localStorage.getItem("pdf-studio-dark") === "true";
document.body.classList.toggle("dark", savedDark);
$("#themeLabel").textContent = savedDark ? "Light mode" : "Dark mode";