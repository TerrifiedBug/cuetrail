(function (root) {
  'use strict';

  function trimUrlPunctuation(value) {
    let result = value;
    while (result) {
      const last = result[result.length - 1];
      if (/[.,;:!?]/.test(last)) {
        result = result.slice(0, -1);
        continue;
      }
      const opener = { ')': '(', ']': '[', '}': '{' }[last];
      if (opener) {
        let balance = 0;
        for (const character of result) {
          if (character === opener) balance += 1;
          if (character === last) balance -= 1;
        }
        if (balance < 0) {
          result = result.slice(0, -1);
          continue;
        }
      }
      break;
    }
    return result;
  }

  function webUrl(value) {
    if (!/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) return null;
    try {
      const url = new URL(value);
      if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
        return null;
      }
      return url;
    } catch {
      return null;
    }
  }

  function normalizeUrl(raw) {
    if (typeof raw !== 'string') return null;
    const value = trimUrlPunctuation(raw.trim());
    const url = value.startsWith('/redirect?')
      ? webUrl('https://www.youtube.com' + value)
      : webUrl(value);
    if (!url) return null;
    if ((url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com')) && url.pathname === '/redirect') {
      // URLSearchParams decodes q once. Never decode the destination again.
      const destination = url.searchParams.get('q');
      if (!destination) return null;
      const target = webUrl(trimUrlPunctuation(destination));
      return target ? target.href : null;
    }
    return url.href;
  }

  function timestampSeconds(value) {
    const parts = value.split(':');
    if (parts.length === 2 && /^\d+:[0-5]\d$/.test(value)) {
      const seconds = Number(parts[0]) * 60 + Number(parts[1]);
      return Number.isSafeInteger(seconds) ? seconds : null;
    }
    if (parts.length === 3 && /^\d+:[0-5]\d:[0-5]\d$/.test(value)) {
      const seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
      return Number.isSafeInteger(seconds) ? seconds : null;
    }
    return null;
  }

  function takeUrls(text, urls) {
    return text.replace(/https?:\/\/[^\s<>"`]+|\/redirect\?[^\s<>"`]+/gi, function (candidate) {
      const url = normalizeUrl(candidate);
      if (url && !urls.includes(url)) urls.push(url);
      return '';
    });
  }

  function cleanTitle(text) {
    return text
      .replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseDescription(text) {
    if (typeof text !== 'string') return [];
    const byStart = new Map();
    let current = null;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) {
        current = null;
        continue;
      }
      const match = line.match(/^\s*(?:[-*•]\s*)?(?:\[([^\]]+)\]|\(([^)]+)\)|(\d[\d:]*\d))(?=\s|[-–—|:]|$)(.*)$/);
      if (match) {
        const start = timestampSeconds(match[1] || match[2] || match[3]);
        current = null;
        if (start === null) continue;
        const urls = [];
        const title = cleanTitle(takeUrls(match[4], urls));
        current = byStart.get(start);
        if (!current) {
          current = { start, title, urls };
          byStart.set(start, current);
        } else {
          if (!current.title && title) current.title = title;
          for (const url of urls) {
            if (!current.urls.includes(url)) current.urls.push(url);
          }
        }
        continue;
      }
      if (current) takeUrls(line, current.urls);
    }
    return Array.from(byStart.values()).sort(function (a, b) { return a.start - b.start; });
  }

  function sectionAt(sections, time, duration) {
    if (!Array.isArray(sections) || !Number.isFinite(time) || time < 0) return null;
    if (Number.isFinite(duration) && time >= duration) return null;
    let low = 0;
    let high = sections.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (sections[middle].start <= time) low = middle + 1;
      else high = middle;
    }
    return low === 0 ? null : sections[low - 1];
  }

  const model = Object.freeze({ parseDescription, sectionAt, normalizeUrl });
  root.CueTrailModel = model;
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
})(globalThis);
