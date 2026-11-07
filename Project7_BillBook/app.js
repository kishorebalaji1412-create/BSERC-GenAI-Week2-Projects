"use strict";

const STORAGE_KEY = "billbook-local-v1";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const todayKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const uid = () => globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const state = {
  shop: { name: "", upiId: "", phone: "" },
  items: [],
  sales: [],
  lines: [],
  discount: 0,
  taxRate: 0,
  lastSale: null,
  storageAvailable: true
};

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2800);
}

function setSaveStatus(message, failed = false) {
  $("#saveStatus").textContent = message;
  $(".sync-status i").style.background = failed ? "#d77a62" : "";
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      shop: state.shop,
      items: state.items,
      sales: state.sales,
      draft: {
        lines: state.lines.map(({ id, catalogId, name, price, qty }) => ({ id, catalogId, name, price, qty })),
        discount: state.discount,
        taxRate: state.taxRate
      }
    }));
    state.storageAvailable = true;
    setSaveStatus("Saved locally");
  } catch (error) {
    state.storageAvailable = false;
    setSaveStatus("Local save failed", true);
    console.error("Could not save BillBook data to local storage.", error);
    toast("Could not save locally. Export a backup before closing this page.");
  }
}

function cleanString(value, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validateData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Backup must be a JSON object.");
  const shop = data.shop && typeof data.shop === "object" && !Array.isArray(data.shop) ? data.shop : {};
  const items = data.items === undefined ? [] : data.items;
  const sales = data.sales === undefined ? [] : data.sales;
  if (!Array.isArray(items) || !Array.isArray(sales)) throw new Error("Backup items and sales must be lists.");
  const nextItems = items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("An item in this backup is invalid.");
    const price = finiteNumber(item.price, NaN);
    if (!Number.isFinite(price) || price < 0) throw new Error("Saved item prices must be zero or more.");
    return { id: cleanString(item.id, 100) || uid(), name: cleanString(item.name, 70), price };
  }).filter((item) => item.name);
  const nextSales = sales.map((sale) => {
    if (!sale || typeof sale !== "object" || Array.isArray(sale) || !Array.isArray(sale.lines)) throw new Error("A sale in this backup is invalid.");
    return {
      id: cleanString(sale.id, 80) || uid(),
      date: cleanString(sale.date, 40) || new Date().toISOString(),
      day: /^\d{4}-\d{2}-\d{2}$/.test(sale.day) ? sale.day : todayKey(),
      shopName: cleanString(sale.shopName, 80),
      shopPhone: cleanString(sale.shopPhone, 30),
      upiId: cleanString(sale.upiId, 100),
      lines: sale.lines.map((line) => ({
        name: cleanString(line.name, 70),
        price: Math.max(0, finiteNumber(line.price)),
        qty: Math.max(0, finiteNumber(line.qty)),
        amount: Math.max(0, finiteNumber(line.amount))
      })).filter((line) => line.name && line.qty > 0),
      subtotal: Math.max(0, finiteNumber(sale.subtotal)),
      discount: Math.max(0, finiteNumber(sale.discount)),
      taxRate: Math.max(0, Math.min(100, finiteNumber(sale.taxRate))),
      tax: Math.max(0, finiteNumber(sale.tax)),
      total: Math.max(0, finiteNumber(sale.total))
    };
  });
  const draft = data.draft && typeof data.draft === "object" ? data.draft : {};
  const lines = Array.isArray(draft.lines) ? draft.lines.map((line) => ({
    id: cleanString(line.id, 100) || uid(),
    catalogId: cleanString(line.catalogId, 100),
    name: cleanString(line.name, 70),
    price: Math.max(0, finiteNumber(line.price)),
    qty: Math.max(0, finiteNumber(line.qty))
  })) : [];
  return {
    shop: { name: cleanString(shop.name, 80), upiId: cleanString(shop.upiId, 100), phone: cleanString(shop.phone, 30) },
    items: nextItems,
    sales: nextSales,
    draft: {
      lines,
      discount: Math.max(0, finiteNumber(draft.discount)),
      taxRate: Math.max(0, Math.min(100, finiteNumber(draft.taxRate)))
    }
  };
}

function loadSavedData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return false;
  const validated = validateData(JSON.parse(saved));
  state.shop = validated.shop;
  state.items = validated.items;
  state.sales = validated.sales;
  state.lines = validated.draft.lines;
  state.discount = validated.draft.discount;
  state.taxRate = validated.draft.taxRate;
  return true;
}

function formatCurrency(value) {
  return money.format(Number.isFinite(value) ? value : 0);
}

function currentTotals() {
  const round = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;
  const subtotal = round(state.lines.reduce((sum, line) => sum + (line.name.trim() && line.qty > 0 ? line.qty * line.price : 0), 0));
  const discount = round(Math.min(subtotal, Math.max(0, state.discount)));
  const taxable = Math.max(0, subtotal - discount);
  const tax = round(taxable * Math.max(0, state.taxRate) / 100);
  return { subtotal, discount, tax, total: round(taxable + tax) };
}

function updateShopHeader() {
  const name = state.shop.name || "My Shop";
  $("#shopButtonName").textContent = name;
  $("#shopAvatar").textContent = (name.charAt(0) || "S").toUpperCase();
  $("#payeeName").textContent = name;
  $("#todayDate").textContent = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  $("#salesTodayDate").textContent = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function makeLine(item = {}) {
  state.lines.push({
    id: uid(),
    catalogId: item.id || "",
    name: cleanString(item.name, 70),
    price: Math.max(0, finiteNumber(item.price)),
    qty: 1
  });
  renderBill();
  persist();
}

function renderQuickItems() {
  const target = $("#quickItems");
  target.replaceChildren();
  if (!state.items.length) {
    const empty = document.createElement("span");
    empty.className = "quick-empty";
    empty.textContent = "Save items in Items & prices for quick add.";
    target.append(empty);
    return;
  }
  state.items.slice(0, 12).forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-item";
    button.title = `Add ${item.name}`;
    button.addEventListener("click", () => makeLine(item));
    const name = document.createElement("span");
    name.textContent = item.name;
    const price = document.createElement("strong");
    price.textContent = formatCurrency(item.price);
    button.append(name, price);
    target.append(button);
  });
}

function renderBill() {
  const body = $("#billLines");
  body.replaceChildren();
  state.lines.forEach((line) => {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    const name = document.createElement("input");
    name.className = "line-name";
    name.value = line.name;
    name.placeholder = "Item name";
    name.maxLength = 70;
    name.setAttribute("aria-label", "Item name");
    name.addEventListener("input", () => {
      line.name = name.value.slice(0, 70);
      persist();
    });
    nameCell.append(name);
    const priceCell = document.createElement("td");
    const price = createNumericInput("line-number", line.price, "Price", 0.01, (value) => {
      line.price = value;
      renderTotals();
      persist();
    });
    priceCell.append(price);
    const qtyCell = document.createElement("td");
    const quantity = createNumericInput("line-number qty", line.qty, "Quantity", 1, (value) => {
      line.qty = value;
      renderTotals();
      persist();
    });
    quantity.step = "1";
    quantity.inputMode = "numeric";
    qtyCell.append(quantity);
    const amountCell = document.createElement("td");
    amountCell.className = "line-amount amount-col";
    amountCell.textContent = formatCurrency(line.price * line.qty);
    line.amountNode = amountCell;
    const removeCell = document.createElement("td");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-line";
    remove.setAttribute("aria-label", `Remove ${line.name || "item"}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      state.lines = state.lines.filter((entry) => entry.id !== line.id);
      renderBill();
      persist();
    });
    removeCell.append(remove);
    row.append(nameCell, priceCell, qtyCell, amountCell, removeCell);
    body.append(row);
  });
  $("#emptyBill").style.display = state.lines.length ? "none" : "flex";
  $("#discountInput").value = state.discount;
  $("#taxInput").value = state.taxRate;
  renderTotals();
}

function createNumericInput(className, value, label, min, onChange) {
  const input = document.createElement("input");
  input.type = "number";
  input.className = className;
  input.value = value;
  input.min = String(min);
  input.step = "0.01";
  input.inputMode = "decimal";
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => {
    const number = Number(input.value);
    onChange(Number.isFinite(number) && number >= min ? number : 0);
  });
  return input;
}

function renderTotals() {
  const totals = currentTotals();
  state.lines.forEach((line) => {
    if (line.amountNode) line.amountNode.textContent = formatCurrency(line.price * line.qty);
  });
  $("#subtotal").textContent = formatCurrency(totals.subtotal);
  $("#discountValue").textContent = `− ${formatCurrency(totals.discount)}`;
  $("#taxLabel").textContent = `(${state.taxRate}% on discounted subtotal)`;
  $("#taxValue").textContent = formatCurrency(totals.tax);
  $("#grandTotal").textContent = formatCurrency(totals.total);
  $("#qrAmount").textContent = formatCurrency(totals.total);
  $("#completeSaleButton").disabled = !state.lines.some((line) => line.name.trim() && line.qty > 0) || totals.total <= 0;
  updatePaymentQr();
  updateReceiptButtons();
}

function validUpiId(value) {
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(value);
}

function paymentUri(amount, shop = state.shop) {
  const params = new URLSearchParams({
    pa: shop.upiId.trim(),
    pn: shop.name || "My Shop",
    am: amount.toFixed(2),
    cu: "INR"
  });
  return `upi://pay?${params.toString()}`;
}

function updatePaymentQr() {
  const target = $("#qrCode");
  target.replaceChildren();
  const hint = $("#qrHint");
  const total = currentTotals().total;
  if (!state.shop.upiId || !validUpiId(state.shop.upiId)) {
    hint.textContent = state.shop.upiId ? "Enter a valid UPI ID (for example, shop@bank) in shop profile." : "Add your UPI ID in shop profile to enable payments.";
    hint.classList.add("error");
    $("#copyUpiButton").disabled = true;
    return;
  }
  if (total <= 0) {
    target.innerHTML = '<span class="qr-placeholder">QR</span>';
    hint.textContent = "Add items to create a payment QR for this bill.";
    hint.classList.remove("error");
    $("#copyUpiButton").disabled = true;
    return;
  }
  if (typeof window.QRCode !== "function") {
    hint.textContent = "QR library is unavailable. Reopen the app while online to cache it.";
    hint.classList.add("error");
    $("#copyUpiButton").disabled = true;
    return;
  }
  new window.QRCode(target, {
    text: paymentUri(total),
    width: 150,
    height: 150,
    correctLevel: window.QRCode.CorrectLevel.M
  });
  hint.textContent = "Scan with any UPI app. Exact amount included.";
  hint.classList.remove("error");
  $("#copyUpiButton").disabled = false;
}

function updateReceiptButtons() {
  const available = Boolean(state.lines.some((line) => line.name.trim() && line.qty > 0) || state.lastSale);
  $("#shareReceiptButton").disabled = !available;
  $("#downloadReceiptButton").disabled = !available;
}

function renderCatalog() {
  const target = $("#catalogList");
  target.replaceChildren();
  $("#catalogCount").textContent = `${state.items.length} item${state.items.length === 1 ? "" : "s"}`;
  $("#emptyCatalog").classList.toggle("visible", state.items.length === 0);
  state.items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "catalog-item";
    const detail = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = item.name;
    const hint = document.createElement("small");
    hint.textContent = "Quick-add product";
    detail.append(name, hint);
    const price = document.createElement("span");
    price.className = "catalog-price";
    price.textContent = formatCurrency(item.price);
    const actions = document.createElement("div");
    actions.className = "catalog-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "catalog-action";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      $("#itemName").value = item.name;
      $("#itemPrice").value = item.price;
      $("#itemForm").dataset.editId = item.id;
      $("#itemForm button[type=submit]").textContent = "Save changes";
      $("#itemName").focus();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "catalog-action delete";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => {
      state.items = state.items.filter((entry) => entry.id !== item.id);
      renderCatalog();
      renderQuickItems();
      persist();
      toast("Item removed from catalog.");
    });
    actions.append(edit, remove);
    row.append(detail, price, actions);
    target.append(row);
  });
}

function renderHistory() {
  const tbody = $("#historyRows");
  tbody.replaceChildren();
  const sorted = [...state.sales].sort((a, b) => new Date(b.date) - new Date(a.date));
  const todaySales = state.sales.filter((sale) => sale.day === todayKey());
  $("#salesToday").textContent = formatCurrency(todaySales.reduce((sum, sale) => sum + sale.total, 0));
  $("#billsToday").textContent = String(todaySales.length);
  $("#allSales").textContent = formatCurrency(state.sales.reduce((sum, sale) => sum + sale.total, 0));
  $("#allBills").textContent = `${state.sales.length} bill${state.sales.length === 1 ? "" : "s"} saved`;
  $("#emptyHistory").classList.toggle("visible", sorted.length === 0);
  sorted.forEach((sale) => {
    const row = document.createElement("tr");
    const invoice = document.createElement("td");
    const invoiceNumber = document.createElement("strong");
    invoiceNumber.textContent = sale.id;
    const itemCount = document.createElement("small");
    itemCount.textContent = `${sale.lines.length} line item${sale.lines.length === 1 ? "" : "s"}`;
    invoice.append(invoiceNumber, itemCount);
    const items = document.createElement("td");
    const firstNames = sale.lines.slice(0, 2).map((line) => line.name);
    const others = sale.lines.length - firstNames.length;
    items.textContent = `${firstNames.join(", ")}${others > 0 ? ` +${others} more` : ""}`;
    const dateCell = document.createElement("td");
    const date = new Date(sale.date);
    dateCell.textContent = `${date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · ${date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
    const amount = document.createElement("td");
    amount.className = "history-amount";
    amount.textContent = formatCurrency(sale.total);
    const actionCell = document.createElement("td");
    const receiptButton = document.createElement("button");
    receiptButton.type = "button";
    receiptButton.className = "history-receipt";
    receiptButton.textContent = "Receipt";
    receiptButton.addEventListener("click", () => {
      state.lastSale = sale;
      renderTotals();
      downloadReceipt();
    });
    actionCell.append(receiptButton);
    row.append(invoice, items, dateCell, amount, actionCell);
    tbody.append(row);
  });
}

function currentReceiptSale() {
  if (state.lines.some((line) => line.name.trim() && line.qty > 0)) {
    const totals = currentTotals();
    return {
      id: state.lastSale?.id || "DRAFT",
      date: state.lastSale?.date || new Date().toISOString(),
      shopName: state.shop.name || "My Shop",
      shopPhone: state.shop.phone,
      lines: state.lines.filter((line) => line.name.trim() && line.qty > 0).map((line) => ({
        name: line.name, price: line.price, qty: line.qty, amount: line.qty * line.price
      })),
      ...totals,
      taxRate: state.taxRate
    };
  }
  return state.lastSale;
}

function wrapCanvasText(context, value, maxWidth) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines;
}

async function buildReceiptBlob(sale = currentReceiptSale()) {
  if (!sale) throw new Error("Add an item before sharing a receipt.");
  const width = 620;
  const padding = 44;
  const contentWidth = width - padding * 2;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = "18px Arial, sans-serif";
  let height = 270;
  sale.lines.forEach((line) => {
    const names = wrapCanvasText(context, line.name, contentWidth - 10);
    height += Math.max(34, names.length * 22 + 10);
  });
  if ((sale.upiId || state.shop.upiId) && validUpiId(sale.upiId || state.shop.upiId) && sale.total > 0) height += 170;
  canvas.width = width;
  canvas.height = height + 40;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  let y = 52;
  context.textAlign = "center";
  context.fillStyle = "#26392e";
  context.font = "bold 28px Arial, sans-serif";
  context.fillText(sale.shopName || state.shop.name || "My Shop", width / 2, y);
  y += 28;
  if (sale.shopPhone || state.shop.phone) {
    context.fillStyle = "#748078";
    context.font = "16px Arial, sans-serif";
    context.fillText(sale.shopPhone || state.shop.phone, width / 2, y);
    y += 24;
  }
  context.fillStyle = "#718078";
  context.font = "15px Arial, sans-serif";
  context.fillText(`Invoice ${sale.id}  ·  ${new Date(sale.date).toLocaleString("en-IN")}`, width / 2, y);
  y += 22;
  context.strokeStyle = "#dfe7df";
  context.setLineDash([5, 5]);
  context.beginPath();
  context.moveTo(padding, y);
  context.lineTo(width - padding, y);
  context.stroke();
  context.setLineDash([]);
  y += 27;
  context.textAlign = "left";
  context.fillStyle = "#88928a";
  context.font = "bold 14px Arial, sans-serif";
  context.fillText("ITEM", padding, y);
  context.textAlign = "right";
  context.fillText("AMOUNT", width - padding, y);
  y += 17;
  sale.lines.forEach((line) => {
    context.textAlign = "left";
    context.fillStyle = "#38463d";
    context.font = "18px Arial, sans-serif";
    const names = wrapCanvasText(context, `${line.name}  × ${line.qty}`, contentWidth - 125);
    names.forEach((textLine) => {
      context.fillText(textLine, padding, y + 18);
      y += 22;
    });
    context.textAlign = "right";
    context.font = "bold 17px Arial, sans-serif";
    context.fillText(formatCurrency(line.amount ?? line.price * line.qty), width - padding, y - 4);
    y += 11;
  });
  y += 8;
  context.strokeStyle = "#e8ede8";
  context.beginPath();
  context.moveTo(padding, y);
  context.lineTo(width - padding, y);
  context.stroke();
  y += 25;
  const lines = [
    ["Subtotal", sale.subtotal],
    ["Discount", -sale.discount],
    [`Tax (${sale.taxRate}%)`, sale.tax]
  ];
  context.font = "16px Arial, sans-serif";
  lines.forEach(([label, amount]) => {
    context.textAlign = "left";
    context.fillStyle = "#778179";
    context.fillText(label, padding, y);
    context.textAlign = "right";
    context.fillStyle = "#48544b";
    context.fillText(`${Number(amount) < 0 ? "− " : ""}${formatCurrency(Math.abs(Number(amount)))}`, width - padding, y);
    y += 25;
  });
  y += 5;
  context.strokeStyle = "#dfe7df";
  context.beginPath();
  context.moveTo(padding, y);
  context.lineTo(width - padding, y);
  context.stroke();
  y += 34;
  context.textAlign = "left";
  context.fillStyle = "#25382d";
  context.font = "bold 21px Arial, sans-serif";
  context.fillText("TOTAL", padding, y);
  context.textAlign = "right";
  context.fillStyle = "#2d7458";
  context.font = "bold 24px Arial, sans-serif";
  context.fillText(formatCurrency(sale.total), width - padding, y);
  y += 27;
  if ((sale.upiId || state.shop.upiId) && validUpiId(sale.upiId || state.shop.upiId) && sale.total > 0) {
    const qrHolder = document.createElement("div");
    new window.QRCode(qrHolder, {
      text: paymentUri(sale.total, {
        upiId: sale.upiId || state.shop.upiId,
        name: sale.shopName || state.shop.name || "My Shop"
      }),
      width: 150,
      height: 150,
      correctLevel: window.QRCode.CorrectLevel.M
    });
    const qrImage = $("canvas, img", qrHolder);
    if (qrImage) {
      if (qrImage instanceof HTMLImageElement && !qrImage.complete) {
        await new Promise((resolve, reject) => {
          qrImage.addEventListener("load", resolve, { once: true });
          qrImage.addEventListener("error", () => reject(new Error("Could not render the receipt payment QR.")), { once: true });
        });
      }
      context.textAlign = "center";
      context.fillStyle = "#627168";
      context.font = "14px Arial, sans-serif";
      context.fillText("Scan to pay with UPI", width / 2, y + 16);
      const qrSize = 122;
      context.drawImage(qrImage, (width - qrSize) / 2, y + 25, qrSize, qrSize);
      y += 155;
    }
  }
  context.textAlign = "center";
  context.fillStyle = "#8b958d";
  context.font = "14px Arial, sans-serif";
  context.fillText("Thank you for shopping with us!", width / 2, Math.min(canvas.height - 17, y + 15));
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create receipt image.")), "image/png");
  });
}

async function downloadReceipt() {
  const sale = currentReceiptSale();
  if (!sale) throw new Error("Add an item before downloading a receipt.");
  const blob = await buildReceiptBlob(sale);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `billbook-${sale.id.toLowerCase()}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Receipt image downloaded.");
}

async function shareReceipt() {
  const sale = currentReceiptSale();
  if (!sale) throw new Error("Add an item before sharing a receipt.");
  const blob = await buildReceiptBlob(sale);
  const file = new File([blob], `billbook-${sale.id.toLowerCase()}.png`, { type: "image/png" });
  const message = `${sale.shopName || state.shop.name || "My Shop"} receipt ${sale.id}: ${formatCurrency(sale.total)}. Thank you!`;
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: "Shop receipt", text: message, files: [file] });
    return;
  }
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    await downloadReceipt();
    toast("Receipt downloaded. Your browser blocked the WhatsApp share window.");
  } else {
    toast("Receipt image downloaded. Attach it in WhatsApp to share.");
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

function nextInvoiceId() {
  const prefix = `BB-${todayKey().replaceAll("-", "")}-`;
  const sequence = state.sales.filter((sale) => sale.id.startsWith(prefix)).length + 1;
  return `${prefix}${String(sequence).padStart(3, "0")}`;
}

function completeSale() {
  const validLines = state.lines.filter((line) => line.name.trim() && line.qty > 0);
  if (!validLines.length) {
    toast("Add at least one named item to complete the sale.");
    return;
  }
  const totals = currentTotals();
  if (totals.total <= 0) {
    toast("The total must be greater than zero to complete this sale.");
    return;
  }
  const sale = {
    id: nextInvoiceId(),
    date: new Date().toISOString(),
    day: todayKey(),
    shopName: state.shop.name || "My Shop",
    shopPhone: state.shop.phone,
    upiId: state.shop.upiId,
    lines: validLines.map((line) => ({
      name: line.name.trim(), price: line.price, qty: line.qty, amount: line.price * line.qty
    })),
    ...totals,
    taxRate: state.taxRate
  };
  state.sales.push(sale);
  state.lastSale = sale;
  state.lines = [];
  state.discount = 0;
  state.taxRate = 0;
  renderBill();
  renderHistory();
  persist();
  toast(`Sale ${sale.id} saved.`);
}

function showView(name) {
  $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  $("#pageName").textContent = name === "billing" ? "New bill" : name === "history" ? "Sales history" : "Items & prices";
  if (name === "history") renderHistory();
}

function downloadBackup() {
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    shop: state.shop,
    items: state.items,
    sales: state.sales,
    draft: { lines: state.lines.map(({ id, catalogId, name, price, qty }) => ({ id, catalogId, name, price, qty })), discount: state.discount, taxRate: state.taxRate }
  };
  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `billbook-backup-${todayKey()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  toast("Shop data backup downloaded.");
}

async function restoreBackup(file) {
  const parsed = JSON.parse(await file.text());
  const data = validateData(parsed);
  const confirmed = window.confirm("Restore this backup? It will replace the shop data currently saved on this device.");
  if (!confirmed) return;
  state.shop = data.shop;
  state.items = data.items;
  state.sales = data.sales;
  state.lines = data.draft.lines;
  state.discount = data.draft.discount;
  state.taxRate = data.draft.taxRate;
  state.lastSale = null;
  updateShopHeader();
  renderQuickItems();
  renderCatalog();
  renderBill();
  renderHistory();
  persist();
  toast("Backup restored.");
}

function editShopProfile() {
  $("#shopNameInput").value = state.shop.name;
  $("#upiIdInput").value = state.shop.upiId;
  $("#shopPhoneInput").value = state.shop.phone;
  $("#shopDialog").showModal();
}

function saveShopProfile(event) {
  event.preventDefault();
  const name = $("#shopNameInput").value.trim();
  const upiId = $("#upiIdInput").value.trim();
  if (!name) {
    toast("Enter your shop name.");
    return;
  }
  if (!validUpiId(upiId)) {
    toast("Enter a UPI ID like shopname@bank.");
    $("#upiIdInput").focus();
    return;
  }
  state.shop = { name, upiId, phone: $("#shopPhoneInput").value.trim() };
  updateShopHeader();
  $("#shopDialog").close();
  persist();
  renderTotals();
  toast("Shop profile saved.");
}

function addOrUpdateCatalogItem(event) {
  event.preventDefault();
  const name = $("#itemName").value.trim();
  const price = Number($("#itemPrice").value);
  if (!name || !Number.isFinite(price) || price <= 0) {
    toast("Enter an item name and a price greater than zero.");
    return;
  }
  const editId = $("#itemForm").dataset.editId;
  if (editId) {
    const item = state.items.find((entry) => entry.id === editId);
    if (item) Object.assign(item, { name, price });
    delete $("#itemForm").dataset.editId;
    $("#itemForm button[type=submit]").textContent = "＋ Save item";
    toast("Item updated.");
  } else {
    state.items.push({ id: uid(), name, price });
    toast("Item saved for quick add.");
  }
  $("#itemForm").reset();
  renderCatalog();
  renderQuickItems();
  persist();
}

function clearHistory() {
  if (!state.sales.length) {
    toast("There is no history to clear.");
    return;
  }
  if (!window.confirm("Clear all saved sales history? This cannot be undone. Export a backup first if you need a copy.")) return;
  state.sales = [];
  state.lastSale = null;
  renderHistory();
  renderTotals();
  persist();
  toast("Sales history cleared.");
}

function initialize() {
  let hasProfile = false;
  try {
    hasProfile = loadSavedData();
  } catch (error) {
    console.error("Saved BillBook data could not be loaded.", error);
    toast("Saved data could not be read. Restore a backup or start fresh.");
  }
  updateShopHeader();
  renderQuickItems();
  renderCatalog();
  renderBill();
  renderHistory();
  $$(".nav-link").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  $("#shopSettingsButton").addEventListener("click", editShopProfile);
  $("#shopForm").addEventListener("submit", saveShopProfile);
  $("#addLineButton").addEventListener("click", () => makeLine());
  $("#discountInput").addEventListener("input", () => {
    state.discount = Math.max(0, finiteNumber($("#discountInput").value));
    renderTotals();
    persist();
  });
  $("#taxInput").addEventListener("input", () => {
    state.taxRate = Math.min(100, Math.max(0, finiteNumber($("#taxInput").value)));
    renderTotals();
    persist();
  });
  $("#completeSaleButton").addEventListener("click", completeSale);
  $("#copyUpiButton").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(paymentUri(currentTotals().total));
      toast("UPI payment link copied.");
    } catch (error) {
      console.error("Could not copy the payment link.", error);
      toast("Clipboard access is unavailable in this browser.");
    }
  });
  $("#downloadReceiptButton").addEventListener("click", () => downloadReceipt().catch((error) => {
    console.error("Receipt export failed.", error);
    toast(`Could not export receipt: ${error.message}`);
  }));
  $("#shareReceiptButton").addEventListener("click", () => shareReceipt().catch((error) => {
    if (error.name === "AbortError") return;
    console.error("Receipt sharing failed.", error);
    toast(`Could not share receipt: ${error.message}`);
  }));
  $("#itemForm").addEventListener("submit", addOrUpdateCatalogItem);
  $("#backupButton").addEventListener("click", downloadBackup);
  $("#historyBackupButton").addEventListener("click", downloadBackup);
  $("#restoreButton").addEventListener("click", () => $("#restoreInput").click());
  $("#restoreInput").addEventListener("change", async (event) => {
    try {
      await restoreBackup(event.target.files[0]);
    } catch (error) {
      console.error("Backup restore failed.", error);
      toast(`Could not restore backup: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  });
  $("#clearHistoryButton").addEventListener("click", clearHistory);
  if (!hasProfile || !state.shop.name) editShopProfile();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        console.error("BillBook offline worker registration failed.", error);
        toast("Offline app cache could not be enabled in this browser.");
      });
    });
  }
}

initialize();
