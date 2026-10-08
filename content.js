(() => {
  'use strict';

  const model = globalThis.CueTrailModel;
  if (!model) return;

  let videoId = null;
  let navigating = false;
  let player = null;
  let video = null;
  let watch = null;
  let metadata = null;
  let sections = [];
  let selected = null;
  let description = null;
  let metadataLive = false;
  let ui = null;
  let control = null;
  let chooser = null;
  let status = null;
  let chooserSection = null;
  let opening = false;
  let refreshTimer = null;
  let statusTimer = null;
  let playerObserver = null;
  let watchObserver = null;
  let metadataObserver = null;
  let scriptObservers = [];
  let observedScripts = [];
  let requestGeneration = 0;
  let fallbackGuard = false;
  let fallbackBaseline = null;

  function descriptionFingerprint() {
    const expander = metadata?.querySelector('#description-inline-expander, ytd-text-inline-expander');
    const body = expander?.querySelector('yt-attributed-string, yt-formatted-string');
    if (!body) return null;
    return `${body.textContent}\n${[...body.querySelectorAll('a[href]')].map((link) => link.getAttribute('href')).join('\n')}`;
  }

  function guardFallback() {
    if (fallbackGuard) return;
    fallbackBaseline = descriptionFingerprint();
    fallbackGuard = true;
  }

  function currentVideoId() {
    const url = new URL(location.href);
    return url.pathname === '/watch' ? url.searchParams.get('v') : null;
  }

  function closeChooser(restoreFocus = false) {
    if (!chooser) return;
    const hadFocus = chooser.contains(document.activeElement);
    chooser.hidden = true;
    chooser.replaceChildren();
    chooserSection = null;
    control.setAttribute('aria-expanded', 'false');
    if (restoreFocus && hadFocus && !control.hidden) control.focus({ preventScroll: true });
  }

  function invalidate() {
    sections = [];
    selected = null;
    description = null;
    metadataLive = false;
    opening = false;
    requestGeneration += 1;
    closeChooser();
    clearTimeout(statusTimer);
    if (status) {
      status.textContent = '';
      status.hidden = true;
    }
    if (control) control.hidden = true;
  }

  function checkIdentity() {
    const nextId = currentVideoId();
    if (nextId !== videoId) {
      if (videoId) guardFallback();
      videoId = nextId;
      invalidate();
      scheduleRefresh();
    }
    return Boolean(videoId && !navigating);
  }

  function watchMatches() {
    return Boolean(watch && watch.isConnected && watch.getAttribute('video-id') === videoId);
  }

  function isAd() {
    return Boolean(player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')));
  }

  function isLive() {
    if (metadataLive || (video && video.duration === Infinity)) return true;
    if (watch && (watch.hasAttribute('is-live') || watch.hasAttribute('is-live-now'))) return true;
    if (!player) return false;
    if (player.classList.contains('ytp-live')) return true;
    const badge = player.querySelector('.ytp-live-badge');
    return Boolean(badge && badge.getClientRects().length && getComputedStyle(badge).visibility !== 'hidden');
  }

  function usableSection() {
    if (!checkIdentity() || !watchMatches() || !video || !video.isConnected || isAd() || isLive()) return null;
    return model.sectionAt(sections, video.currentTime, video.duration);
  }

  function render() {
    if (!ui) return;
    const ad = isAd();
    ui.hidden = !videoId || navigating || ad;
    if (ad) {
      closeChooser();
      status.textContent = '';
      status.hidden = true;
    }
    const next = usableSection();
    if (next !== selected) {
      closeChooser(true);
      selected = next;
    }
    const usable = Boolean(next && next.urls.length);
    control.hidden = !usable;
    control.disabled = opening;
    if (!usable) return;
    const title = next.title || 'this section';
    const text = next.urls.length === 1 ? `Open ${title} ↗` : `Links ${title}`;
    if (control.textContent !== text) control.textContent = text;
    control.title = next.urls.length === 1 ? next.urls[0] : `${next.urls.length} links for ${title}`;
    control.setAttribute('aria-label', next.urls.length === 1 ? `Open link for ${title} in a new background tab` : `Choose a link for ${title}`);
    if (next.urls.length > 1) control.setAttribute('aria-haspopup', 'dialog');
    else control.removeAttribute('aria-haspopup');
  }

  function announce(message) {
    if (!status || isAd()) return;
    clearTimeout(statusTimer);
    status.textContent = message;
    status.hidden = false;
    statusTimer = setTimeout(() => {
      if (!status) return;
      status.hidden = true;
      status.textContent = '';
    }, 6000);
  }

  function unavailableReason() {
    if (!videoId || navigating || !watchMatches() || !video) return 'Open a YouTube watch video to use CueTrail.';
    if (isAd()) return 'CueTrail is unavailable during ads.';
    if (isLive()) return 'CueTrail does not support live videos.';
    if (!sections.length) return 'No timestamped description links are available for this video.';
    return 'This section has no description link.';
  }

  function openUrl(url, section) {
    // Re-check at the point of use: playback and SPA navigation can change while a chooser is open.
    const current = usableSection();
    if (!current || current !== section || !current.urls.includes(url)) {
      render();
      announce(unavailableReason());
      return;
    }
    if (opening) return;
    const generation = requestGeneration;
    opening = true;
    closeChooser(true);
    render();
    chrome.runtime.sendMessage({ type: 'cuetrail:open', url }, (reply) => {
      const error = chrome.runtime.lastError;
      if (generation !== requestGeneration) return;
      opening = false;
      render();
      announce(error || !reply || !reply.ok ? 'Could not open the link. Try again.' : 'Link opened in a new background tab.');
    });
  }

  function showChooser(section) {
    closeChooser();
    chooserSection = section;
    const heading = document.createElement('div');
    heading.className = 'cuetrail-chooser-title';
    heading.textContent = section.title || 'This section';
    chooser.append(heading);
    const list = document.createElement('div');
    list.className = 'cuetrail-links';
    for (const url of section.urls) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cuetrail-link';
      const parsed = new URL(url);
      button.textContent = `${parsed.hostname}${parsed.pathname}${parsed.search}${parsed.hash}`;
      button.title = url;
      button.setAttribute('aria-label', `Open ${url} in a new background tab`);
      button.addEventListener('click', () => openUrl(url, section));
      list.append(button);
    }
    chooser.append(list);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'cuetrail-close';
    close.textContent = 'Close';
    close.addEventListener('click', () => closeChooser(true));
    chooser.append(close);
    chooser.hidden = false;
    control.setAttribute('aria-expanded', 'true');
    list.firstElementChild.focus({ preventScroll: true });
  }

  function activate() {
    checkIdentity();
    // Activation refreshes metadata, rather than trusting a stale description snapshot.
    refresh();
    const section = usableSection();
    if (!section || !section.urls.length) {
      announce(unavailableReason());
      return;
    }
    if (section.urls.length === 1) openUrl(section.urls[0], section);
    else if (chooserSection === section && !chooser.hidden) closeChooser(true);
    else showChooser(section);
  }

  function onUiKeydown(event) {
    // Contain only keys from our own controls, not YouTube's playback shortcuts.
    event.stopPropagation();
    if (event.key === 'Escape' && !chooser.hidden) {
      event.preventDefault();
      closeChooser(true);
      return;
    }
    if (chooser.hidden || !chooser.contains(event.target)) return;
    const buttons = [...chooser.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length].focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      buttons[event.key === 'Home' ? 0 : buttons.length - 1].focus();
    } else if (event.key === 'Tab' && ((event.shiftKey && index === 0) || (!event.shiftKey && index === buttons.length - 1))) {
      event.preventDefault();
      buttons[event.shiftKey ? buttons.length - 1 : 0].focus();
    }
  }

  function detachPlayer() {
    if (video) {
      for (const name of ['timeupdate', 'seeking', 'seeked', 'loadedmetadata', 'durationchange', 'emptied']) video.removeEventListener(name, render);
    }
    playerObserver?.disconnect();
    playerObserver = null;
    ui?.remove();
    player = null;
    video = null;
    ui = null;
    control = null;
    chooser = null;
    status = null;
    chooserSection = null;
    clearTimeout(statusTimer);
  }

  function attachPlayer(nextPlayer, nextVideo) {
    if (player === nextPlayer && video === nextVideo && ui?.isConnected) return;
    detachPlayer();
    if (!nextPlayer || !nextVideo) return;
    player = nextPlayer;
    video = nextVideo;
    ui = document.createElement('div');
    ui.className = 'cuetrail';
    ui.setAttribute('aria-label', 'CueTrail description links');
    control = document.createElement('button');
    control.type = 'button';
    control.className = 'cuetrail-control';
    control.hidden = true;
    control.setAttribute('aria-expanded', 'false');
    control.setAttribute('aria-controls', 'cuetrail-chooser');
    control.addEventListener('click', activate);
    chooser = document.createElement('div');
    chooser.id = 'cuetrail-chooser';
    chooser.className = 'cuetrail-chooser';
    chooser.setAttribute('role', 'dialog');
    chooser.setAttribute('aria-label', 'Choose a description link');
    chooser.hidden = true;
    status = document.createElement('div');
    status.className = 'cuetrail-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    status.hidden = true;
    ui.append(control, chooser, status);
    // YouTube listens above the overlay for clicks and keyboard playback controls.
    for (const name of ['click', 'dblclick', 'pointerdown', 'pointerup', 'keyup']) ui.addEventListener(name, (event) => event.stopPropagation());
    ui.addEventListener('keydown', onUiKeydown);
    player.append(ui);
    for (const name of ['timeupdate', 'seeking', 'seeked', 'loadedmetadata', 'durationchange', 'emptied']) video.addEventListener(name, render);
    playerObserver = new MutationObserver(render);
    playerObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
  }

  function identityFromUrl(value) {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value, location.origin);
      if (url.hostname === 'youtu.be') return url.pathname.split('/')[1];
      if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname)) return null;
      if (url.pathname === '/watch') return url.searchParams.get('v');
      const match = url.pathname.match(/^\/embed\/([^/]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  function videoObjects(value, result = []) {
    if (Array.isArray(value)) {
      for (const item of value) videoObjects(item, result);
    } else if (value && typeof value === 'object') {
      const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
      if (types.some((type) => type === 'VideoObject' || type === 'https://schema.org/VideoObject' || type === 'http://schema.org/VideoObject')) result.push(value);
      if (value['@graph']) videoObjects(value['@graph'], result);
    }
    return result;
  }

  function readStructuredDescription(scripts) {
    for (const script of scripts) {
      let data;
      try {
        data = JSON.parse(script.textContent);
      } catch {
        continue;
      }
      for (const object of videoObjects(data)) {
        const identities = [object.embedUrl, object['@id']].map(identityFromUrl).filter(Boolean);
        if (!identities.includes(videoId) || identities.some((id) => id !== videoId)) continue;
        const publications = Array.isArray(object.publication) ? object.publication : [object.publication];
        const live = object.isLiveBroadcast === true || publications.some((item) => item && item.isLiveBroadcast === true);
        if (typeof object.description === 'string' && object.description.trim()) return { text: object.description, live };
        if (live) metadataLive = true;
      }
    }
    return null;
  }

  function readExpandedDescription() {
    if (!metadata || !watchMatches()) return null;
    if (fallbackGuard) {
      if (descriptionFingerprint() === fallbackBaseline) return null;
      fallbackGuard = false;
    }
    const expanders = metadata.querySelectorAll('#description-inline-expander, ytd-text-inline-expander');
    for (const expander of expanders) {
      const expanded = expander.querySelector('#expanded');
      const body = expanded && expanded.getClientRects().length ? expanded : (
        !expander.hasAttribute('collapsed') && (expander.hasAttribute('is-expanded') || expander.getAttribute('aria-expanded') === 'true')
          ? expander.querySelector('yt-attributed-string, yt-formatted-string') : null
      );
      if (!body || !body.getClientRects().length) continue;
      const parts = [];
      function lineBoundary() {
        if (parts.length && !parts[parts.length - 1].endsWith('\n')) parts.push('\n');
      }
      function append(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          parts.push(node.nodeValue);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (['SCRIPT', 'STYLE', 'BUTTON'].includes(node.tagName)) return;
        if (node.tagName === 'BR') {
          parts.push('\n');
          return;
        }
        if (node.tagName === 'A') {
          const label = node.textContent.trim();
          const url = model.normalizeUrl(node.getAttribute('href'));
          if (url && !/^\d{1,3}:\d{2}(?::\d{2})?$/.test(label)) {
            parts.push(url);
            return;
          }
        }
        const block = ['DIV', 'P', 'LI'].includes(node.tagName);
        if (block) lineBoundary();
        for (const child of node.childNodes) append(child);
        if (block) lineBoundary();
      }
      append(body);
      const text = parts.join('');
      if (text.trim()) return text;
    }
    return null;
  }

  function bindMetadata() {
    const nextWatch = videoId ? document.querySelector('ytd-watch-flexy') : null;
    if (nextWatch !== watch) {
      watchObserver?.disconnect();
      watch = nextWatch;
      if (watch) {
        watchObserver = new MutationObserver(() => {
          if (!watchMatches()) invalidate();
          scheduleRefresh();
        });
        watchObserver.observe(watch, { attributes: true, attributeFilter: ['video-id', 'is-live', 'is-live-now'] });
      }
    }
    const nextMetadata = watch?.querySelector('ytd-watch-metadata') || null;
    if (nextMetadata !== metadata) {
      metadataObserver?.disconnect();
      metadata = nextMetadata;
      if (metadata) {
        metadataObserver = new MutationObserver((records) => {
          const selector = '#description, #description-inline-expander, ytd-text-inline-expander';
          const relevant = records.some((record) => {
            const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
            if (target?.closest(selector)) return true;
            return [...record.addedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE && (node.matches(selector) || node.querySelector(selector)));
          });
          if (relevant) scheduleRefresh();
        });
        metadataObserver.observe(metadata, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['collapsed', 'is-expanded', 'aria-expanded'] });
      }
    }
  }

  function refresh() {
    clearTimeout(refreshTimer);
    refreshTimer = null;
    checkIdentity();
    bindMetadata();
    const nextPlayer = watchMatches() ? watch.querySelector('#movie_player') : null;
    attachPlayer(nextPlayer, nextPlayer?.querySelector('video') || null);
    if (!videoId || navigating || !watchMatches()) {
      render();
      return;
    }
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    if (scripts.length !== observedScripts.length || scripts.some((script, index) => script !== observedScripts[index])) {
      for (const observer of scriptObservers) observer.disconnect();
      observedScripts = scripts;
      scriptObservers = scripts.map((script) => {
        const observer = new MutationObserver(scheduleRefresh);
        observer.observe(script, { childList: true, subtree: true, characterData: true });
        return observer;
      });
    }
    metadataLive = false;
    const structured = readStructuredDescription(scripts);
    const text = structured?.text ?? readExpandedDescription() ?? description;
    if (structured) metadataLive = structured.live;
    if (text !== description) {
      description = text;
      sections = text ? model.parseDescription(text) : [];
    }
    render();
  }

  function scheduleRefresh() {
    if (refreshTimer === null) refreshTimer = setTimeout(refresh, 150);
  }

  document.addEventListener('pointerdown', (event) => {
    if (chooser && !chooser.hidden && !ui.contains(event.target)) closeChooser();
  }, true);
  document.addEventListener('focusin', (event) => {
    if (chooser && !chooser.hidden && !ui.contains(event.target)) closeChooser();
  });
  document.addEventListener('yt-navigate-start', () => {
    if (videoId) guardFallback();
    navigating = true;
    invalidate();
    if (ui) ui.hidden = true;
  });
  document.addEventListener('yt-navigate-finish', () => {
    navigating = false;
    refresh();
  });
  document.addEventListener('yt-page-data-updated', scheduleRefresh);
  window.addEventListener('popstate', () => {
    if (videoId) guardFallback();
    invalidate();
    scheduleRefresh();
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'cuetrail:activate') return;
    activate();
    sendResponse({ ok: true });
  });

  // A bounded discovery tick handles delayed mounts and player replacements. It does
  // not re-parse descriptions or inspect a broad mutation stream during playback.
  setInterval(() => {
    const valid = checkIdentity();
    if (!valid) {
      if (!videoId && player) detachPlayer();
      return;
    }
    if (!watch?.isConnected || !metadata?.isConnected || !player?.isConnected || !video?.isConnected || !ui?.isConnected || !sections.length || observedScripts.some((script) => !script.isConnected)) scheduleRefresh();
    else if (player.querySelector('video') !== video) scheduleRefresh();
  }, 1000);
  refresh();
})();
