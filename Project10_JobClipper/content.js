"use strict";

(() => {
  if (globalThis.__jobClipperListenerInstalled) return;
  globalThis.__jobClipperListenerInstalled = true;

  function textFrom(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = element?.content || element?.getAttribute("content")
        || element?.dataset?.companyName || element?.getAttribute("data-company-name")
        || element?.innerText || element?.textContent;
      if (value?.trim()) return value.trim().replace(/\s+/g, " ");
    }
    return "";
  }

  function typeIs(type, wanted) {
    return type === wanted
      || (typeof type === "string" && type.endsWith(`/${wanted}`))
      || (Array.isArray(type) && type.some((entry) => entry === wanted || entry.endsWith(`/${wanted}`)));
  }

  function findJobPosting() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent);
        const candidates = Array.isArray(parsed) ? parsed : [parsed];
        for (const candidate of candidates) {
          if (typeIs(candidate?.["@type"], "JobPosting")) return candidate;
          const posting = candidate?.["@graph"]?.find((entry) => typeIs(entry?.["@type"], "JobPosting"));
          if (posting) return posting;
        }
      } catch {
        // Continue to other JSON-LD blocks when a page includes unrelated invalid data.
      }
    }
    return null;
  }

  function dateValue(value) {
    if (!value) return "";
    const match = String(value).match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }

  function extractJob() {
    const posting = findJobPosting();
    const organization = posting?.hiringOrganization;
    const company = (typeof organization === "string" ? organization : organization?.name)
      || textFrom([
        '[data-company-name]', '[class*="company-name"]', '[class*="companyName"]',
        '[data-testid*="company"]', 'a[href*="/company/"]',
        '[itemprop="hiringOrganization"] [itemprop="name"]', '[itemprop="hiringOrganization"]'
      ]);
    let deadline = dateValue(posting?.validThrough);
    if (!deadline) {
      const deadlineElement = [...document.querySelectorAll("time, [datetime], [data-deadline], [class*='deadline'], [id*='deadline']")]
        .find((element) => /deadline|apply by|closing date|applications close|last date/i.test(
          `${element.getAttribute("aria-label") || ""} ${element.textContent || ""} ${element.getAttribute("data-deadline") || ""}`
        ));
      deadline = dateValue(deadlineElement?.dateTime || deadlineElement?.getAttribute("datetime")
        || deadlineElement?.getAttribute("data-deadline") || deadlineElement?.textContent);
    }
    if (!deadline) {
      const bodyText = document.body?.innerText || "";
      const label = /(?:application\s+)?deadline|apply\s+by|closing\s+date|applications\s+close|last\s+date/i.exec(bodyText);
      const context = label ? bodyText.slice(label.index, label.index + 160) : "";
      const date = context.match(/\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/](?:20)?\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s+20\d{2})?)\b/i)?.[0];
      deadline = dateValue(date);
    }
    return {
      title: textFrom(["h1", '[itemprop="title"]', 'meta[property="og:title"]', "title"])
        .replace(/\s+[|–—-]\s+[^|–—-]+$/, "").trim().slice(0, 200),
      company: company.slice(0, 160),
      url: location.href,
      deadline
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "jobClipper:extract") return false;
    try {
      sendResponse({ ok: true, job: extractJob() });
    } catch (error) {
      console.error("Job Clipper could not parse this page.", error);
      sendResponse({ ok: false, error: "Could not read job details from this page." });
    }
    return false;
  });
})();
