/**
 * Lightweight rich text for Personal / Company Sarah thread replies (prototype).
 * Supports: **bold**, # headings, - bullets, 1. numbered lists, --- dividers,
 * [[badge:label]], ![alt](url), :::card … ::: wrappers.
 */
(function () {
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function decodeHtmlEntities(s) {
    let t = String(s || '');
    t = t.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    t = t.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
    return t.replace(/&times;/gi, '×').replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&');
  }

  const INLINE_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

  function formatInline(raw) {
    const escaped = escapeHtml(decodeHtmlEntities(raw));
    return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function hasInlineImage(raw) {
    return /!\[([^\]]*)\]\(([^)]+)\)/.test(String(raw || ''));
  }

  function splitInlineImages(raw) {
    const text = String(raw || '');
    const chunks = [];
    let last = 0;
    const pattern = new RegExp(INLINE_IMAGE_RE.source, 'g');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) {
        const slice = text.slice(last, match.index);
        if (slice.trim()) chunks.push({ type: 'text', value: slice });
      }
      chunks.push({
        type: 'image',
        alt: match[1],
        src: String(match[2] || '').trim(),
      });
      last = pattern.lastIndex;
    }
    if (last < text.length) {
      const slice = text.slice(last);
      if (slice.trim()) chunks.push({ type: 'text', value: slice });
    }
    return chunks;
  }

  /** Paragraphs that mix text and markdown images (common in assistant replies). */
  function renderMixedInline(raw) {
    const chunks = splitInlineImages(raw);
    if (!chunks.length) return '';
    if (chunks.length === 1 && chunks[0].type === 'text') {
      return `<p>${formatInline(chunks[0].value.trim())}</p>`;
    }
    return chunks
      .map((chunk) => {
        if (chunk.type === 'image') {
          const alt = chunk.alt || '';
          const caption = alt;
          return renderFigure(resolveMediaUrl(chunk.src), alt, caption);
        }
        const trimmed = String(chunk.value || '').trim();
        return trimmed ? `<p>${formatInline(trimmed)}</p>` : '';
      })
      .join('');
  }

  function renderList(items, ordered) {
    const tag = ordered ? 'ol' : 'ul';
    const cls = ordered ? 'thread-list thread-list--ordered' : 'thread-list';
    const lis = items
      .map((item) => {
        if (hasInlineImage(item)) {
          return `<li class="thread-list-item--media">${renderMixedInline(item)}</li>`;
        }
        return `<li>${formatInline(item)}</li>`;
      })
      .join('');
    return `<${tag} class="${cls}">${lis}</${tag}>`;
  }

  function renderHeading(level, text) {
    const n = Math.min(3, Math.max(2, level));
    return `<h${n} class="thread-heading thread-heading--${n}">${formatInline(text)}</h${n}>`;
  }

  function renderBadge(label) {
    return `<span class="thread-badge">${formatInline(label)}</span>`;
  }

  const TRUSTED_IMAGE_HOST =
    /(?:centralmotorsrtb|babescarsales)\.co\.za|firebasestorage\.googleapis\.com|\.firebasestorage\.app|(?:sarah\.)?ziricai\.com\/api\/network\/v1\/listing-media/i;

  function isDisplayableImageUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return false;
    if (
      /example\.com|unsplash\.com|placeholder|via\.placeholder|picsum\.photos|placehold\.co|\/showroom\/|\/stock\/model/i.test(
        raw
      )
    ) {
      return false;
    }
    if (raw.startsWith('blob:') || raw.startsWith('data:')) return true;
    if (raw.startsWith('/') && !raw.includes('..')) return true;
    if (!/^https?:\/\//i.test(raw)) return false;
    if (TRUSTED_IMAGE_HOST.test(raw)) return true;
    if (/\/api\/media\/dealer-image\b/i.test(raw)) return true;
    return (
      /\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.test(raw) &&
      /(?:centralmotorsrtb|babescarsales)\.co\.za/i.test(raw)
    );
  }

  const HALLUCINATED_IMAGE_CAPTION =
    /\b(?:SUV|Sedan|Truck|Hatch|Bakkie)\s+Models?\b|\b(?:SUV|Sedan|Truck|Hatch|Bakkie)\s+Model\s*\d+\b/i;

  function stripLlmCatalogHallucinations(text) {
    let out = String(text || '');
    out = out.replace(/^\s*Model\s+[A-Z]\s*:.+$/gim, '');
    out = out.replace(/\*\*Model\s+[A-Z]:\*\*[^\n]*/gim, '');
    out = out.replace(/^\s*[-*]\s*Model\s+[A-Z]\s*:.+$/gim, '');
    out = out.replace(/I will now attach.+$/gim, '');
    out = out.replace(/(?:images?|photos?).*(?:attached|shortly).+$/gim, '');
    out = out.replace(/I'll now attach.+$/gim, '');
    return out.replace(/\n{3,}/g, '\n\n').trim();
  }

  function sanitizeAssistantMarkdown(md) {
    return stripLlmCatalogHallucinations(String(md || ''))
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt, url) => {
        const caption = String(alt || '').trim();
        const href = String(url || '').trim();
        if (HALLUCINATED_IMAGE_CAPTION.test(caption)) return '';
        if (!isDisplayableImageUrl(href)) return '';
        return full;
      })
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function renderFigure(src, alt, caption, fallbackUrls) {
    const raw = String(src || '').trim();
    const resolved = resolveMediaUrl(raw);
    if (!isDisplayableImageUrl(raw) && !isDisplayableImageUrl(resolved)) return '';
    const fallbacks = (Array.isArray(fallbackUrls) ? fallbackUrls : [])
      .map((u) => resolveMediaUrl(u))
      .filter((u) => u && u !== resolved);
    const fallbackAttr = fallbacks.length ? ` data-fallbacks="${escapeHtml(fallbacks.join('|'))}"` : '';
    const cap = caption
      ? `<figcaption class="thread-msg-caption">${formatInline(caption)}</figcaption>`
      : '';
    const safeAlt = decodeHtmlEntities(alt || '');
    return `<figure class="thread-msg-media thread-msg-media--image">
      <div class="thread-msg-media-frame">
        <img src="${escapeHtml(resolved)}" data-upstream="${escapeHtml(raw)}" alt="${escapeHtml(safeAlt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"${fallbackAttr} onerror="threadImgTryFallback(this)" />
      </div>
      ${cap}
    </figure>`;
  }

  function renderVideoFigure(src, caption) {
    const cap = caption
      ? `<figcaption class="thread-msg-caption">${formatInline(caption)}</figcaption>`
      : '';
    return `<figure class="thread-msg-media thread-msg-media--video">
      <div class="thread-msg-media-frame">
        <video class="thread-msg-video" src="${escapeHtml(src)}" controls playsinline preload="metadata"></video>
      </div>
      ${cap}
    </figure>`;
  }

  function resolveMediaUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (/(?:centralmotorsrtb|babescarsales)\.co\.za/i.test(raw)) {
      let base =
        (typeof window !== "undefined" && window.SarahLive?.resolveApiBase?.()) ||
        (typeof window !== "undefined" && window.__ZIRICAI_CONFIG__?.apiBase) ||
        "";
      base = String(base || "").trim();
      if (!base && typeof location !== "undefined" && location.origin) {
        base = location.origin;
      }
      const root = String(base).replace(/\/$/, "");
      return `${root}/api/media/dealer-image?u=${encodeURIComponent(raw)}`;
    }
    if (/^(https?:|blob:|data:)/i.test(raw)) return raw;
    const base =
      (typeof window !== "undefined" && window.SarahLive?.resolveApiBase?.()) ||
      (typeof window !== "undefined" && window.__ZIRICAI_CONFIG__?.apiBase) ||
      "";
    return base ? `${String(base).replace(/\/$/, "")}${raw.startsWith("/") ? raw : `/${raw}`}` : raw;
  }

  function threadImgTryFallback(img) {
    if (!img) return;
    const upstream = img.getAttribute('data-upstream');
    if (
      upstream &&
      img.dataset.directTried !== '1' &&
      /\/api\/media\/dealer-image/i.test(img.src || '')
    ) {
      img.dataset.directTried = '1';
      img.referrerPolicy = 'no-referrer';
      img.src = upstream;
      return;
    }
    if (img.dataset.fallbackExhausted === '1') return;
    const queue = (img.dataset.fallbacks || '').split('|').filter(Boolean);
    const next = queue.shift();
    if (!next) {
      img.dataset.fallbackExhausted = '1';
      img.classList.add('is-broken');
      img.closest('figure')?.classList.add('thread-msg-media--broken');
      return;
    }
    img.dataset.fallbacks = queue.join('|');
    img.src = next;
  }

  function renderAttachments(attachments) {
    if (!Array.isArray(attachments) || !attachments.length) return "";
    return attachments
      .map((att) => {
        const mime = String(att.mimeType || att.type || "");
        const src = resolveMediaUrl(att.url || att.src || "");
        if (!src) return "";
        const name = att.name || att.fileName || "";
        if (mime.startsWith("video/") || att.kind === "video") {
          return renderVideoFigure(src, name);
        }
        if (mime.startsWith("audio/") || att.kind === "audio") {
          return `<figure class="thread-msg-media thread-msg-media--audio">
            <audio class="thread-msg-audio" src="${escapeHtml(src)}" controls preload="metadata"></audio>
            ${name ? `<figcaption class="thread-msg-caption">${escapeHtml(name)}</figcaption>` : ""}
          </figure>`;
        }
        if (mime.startsWith("image/") || att.kind === "image") {
          const fallbacks = []
            .concat(att.alternateUrls || [])
            .concat(att.alternateURL || []);
          return renderFigure(att.url || att.src || "", name, name, fallbacks);
        }
        return "";
      })
      .filter(Boolean)
      .join("");
  }

  function parseRichMarkdown(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;

    function flushList(state) {
      if (state.ul.length) {
        out.push(renderList(state.ul, false));
        state.ul = [];
      }
      if (state.ol.length) {
        out.push(renderList(state.ol, true));
        state.ol = [];
      }
    }

    function parseBlock(state) {
      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === ':::card' || trimmed === ':::') {
          i += 1;
          const cardLines = [];
          while (i < lines.length && lines[i].trim() !== ':::') {
            cardLines.push(lines[i]);
            i += 1;
          }
          if (i < lines.length && lines[i].trim() === ':::') i += 1;
          const inner = parseRichMarkdown(cardLines.join('\n'));
          out.push(`<div class="thread-rich-card">${inner}</div>`);
          continue;
        }

        if (/^---+$/.test(trimmed)) {
          flushList(state);
          out.push('<hr class="thread-hr" aria-hidden="true" />');
          i += 1;
          continue;
        }

        const badgeMatch = trimmed.match(/^\[\[badge:(.+)\]\]$/);
        if (badgeMatch) {
          flushList(state);
          out.push(renderBadge(badgeMatch[1].trim()));
          i += 1;
          continue;
        }

        const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
        if (imgMatch) {
          flushList(state);
          const alt = imgMatch[1] || '';
          out.push(renderFigure(resolveMediaUrl(imgMatch[2].trim()), alt, alt));
          i += 1;
          continue;
        }

        const videoMatch =
          trimmed.match(/^\[\[video:([^\]]+)\]\]$/i) || trimmed.match(/^!\[\[video\]\]\(([^)]+)\)$/i);
        if (videoMatch) {
          flushList(state);
          out.push(renderVideoFigure(resolveMediaUrl(videoMatch[1].trim()), ''));
          i += 1;
          continue;
        }

        if (/^###\s+/.test(trimmed)) {
          flushList(state);
          out.push(renderHeading(3, trimmed.replace(/^###\s+/, '')));
          i += 1;
          continue;
        }
        if (/^##\s+/.test(trimmed)) {
          flushList(state);
          out.push(renderHeading(2, trimmed.replace(/^##\s+/, '')));
          i += 1;
          continue;
        }
        if (/^#\s+/.test(trimmed)) {
          flushList(state);
          out.push(renderHeading(2, trimmed.replace(/^#\s+/, '')));
          i += 1;
          continue;
        }

        if (/^[-*]\s+/.test(trimmed)) {
          state.ol = [];
          const items = [];
          while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
            items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
            i += 1;
          }
          state.ul = items;
          flushList(state);
          continue;
        }

        if (/^\d+\.\s+/.test(trimmed)) {
          state.ul = [];
          const items = [];
          while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
            items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
            i += 1;
          }
          state.ol = items;
          flushList(state);
          continue;
        }

        if (!trimmed) {
          flushList(state);
          i += 1;
          continue;
        }

        flushList(state);
        if (hasInlineImage(trimmed)) {
          out.push(renderMixedInline(trimmed));
        } else {
          out.push(`<p>${formatInline(trimmed)}</p>`);
        }
        i += 1;
      }
      flushList(state);
    }

    const state = { ul: [], ol: [] };
    parseBlock(state);
    return out.join('');
  }

  function renderBlock(block) {
    if (!block || !block.type) return '';
    switch (block.type) {
      case 'heading':
        return renderHeading(block.level || 2, block.text || '');
      case 'paragraph':
        return `<p>${formatInline(block.text || '')}</p>`;
      case 'badge':
        return renderBadge(block.text || '');
      case 'divider':
        return '<hr class="thread-hr" aria-hidden="true" />';
      case 'list':
        return renderList(block.items || [], Boolean(block.ordered));
      case 'image':
        return renderFigure(resolveMediaUrl(block.src || ''), block.alt || '', block.caption || '');
      case 'video':
        return renderVideoFigure(resolveMediaUrl(block.src || ''), block.caption || '');
      case 'card':
        return `<div class="thread-rich-card">${(block.blocks || []).map(renderBlock).join('')}</div>`;
      default:
        return '';
    }
  }

  function renderBlocks(blocks) {
    return (blocks || []).map(renderBlock).join('');
  }

  function isHumanAssistantMessage(message) {
    return message?.authorKind === 'human' || message?.source === 'human';
  }

  /** Human takeover only — AI replies show no “Sarah” label (context is already Sarah). */
  function resolveSpeakerName(message) {
    if (!isHumanAssistantMessage(message)) return '';
    const name = message?.authorDisplayName || message?.authorName || message?.senderName || 'Staff';
    return String(name).trim() || 'Staff';
  }

  function stripLeadingSarahPrefix(md) {
    let t = String(md || '');
    const patterns = [
      /^\s*\*\*Sarah\*\*\s*[:.,\-–—]?\s*/i,
      /^\s*Sarah\s*[:.,\-–—]\s*/i,
      /^\s*\*\*Sarah\s*\([^)]*\)\*\*\s*[:.,\-–—]?\s*/i,
    ];
    for (const p of patterns) {
      if (p.test(t)) {
        t = t.replace(p, '');
        break;
      }
    }
    return t.trimStart();
  }

  /** Bold the speaker name when a human reply opens with it. */
  function emphasizeLeadingSpeaker(md, speaker) {
    const text = String(md || '');
    if (!text.trim() || !speaker) return text;
    if (/^\*\*[^*\n]+\*\*/.test(text.trim())) return text;
    const trimmed = text.trimStart();
    const prefix = text.slice(0, text.length - trimmed.length);
    if (trimmed.length < speaker.length) return text;
    if (trimmed.slice(0, speaker.length).toLowerCase() !== speaker.toLowerCase()) return text;
    const next = trimmed[speaker.length];
    if (next && !/^[\s,.!?:;—\-–]/.test(next)) return text;
    const actual = trimmed.slice(0, speaker.length);
    const rest = trimmed.slice(speaker.length);
    return `${prefix}**${actual}**${rest}`;
  }

  function legacyMediaHtml(message) {
    const urls = []
      .concat(message.image ? [message.image] : [])
      .concat(Array.isArray(message.images) ? message.images : []);
    return urls
      .map((src) => renderFigure(src, '', ''))
      .join('');
  }

  function stripMarkdownImages(md) {
    return String(md || '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function renderAssistantContent(message) {
    if (Array.isArray(message.blocks) && message.blocks.length) {
      return renderBlocks(message.blocks) + legacyMediaHtml(message);
    }
    const attachments = message?.attachments;
    const hasAttachmentImages =
      Array.isArray(attachments) &&
      attachments.some((a) => String(a?.mimeType || a?.type || '').startsWith('image/') || a?.kind === 'image');
    const human = isHumanAssistantMessage(message);
    const speaker = resolveSpeakerName(message);
    let raw = message.markdown != null ? message.markdown : message.content;
    if (!human) raw = stripLeadingSarahPrefix(raw);
    let md = sanitizeAssistantMarkdown(speaker ? emphasizeLeadingSpeaker(raw, speaker) : raw);
    if (hasAttachmentImages) md = stripMarkdownImages(md);
    const body = parseRichMarkdown(md);
    const hasInlineImage = /!\[[^\]]*\]\([^)]+\)/.test(String(md || ''));
    const attachHtml = renderAttachments(attachments);
    const extraMedia = hasInlineImage ? '' : legacyMediaHtml(message);
    const authorLine =
      human && speaker
        ? `<div class="thread-msg-author"><strong>${escapeHtml(speaker)}</strong></div>`
        : '';
    return authorLine + body + attachHtml + extraMedia;
  }

  function formatUserPlain(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    return raw
      .split(/\n\s*\n/)
      .map((block) => {
        const inner = escapeHtml(block).replace(/\n/g, '<br />');
        return `<p>${inner}</p>`;
      })
      .join('');
  }

  function formatUserMessage(message) {
    const body = formatUserPlain(message?.content || message);
    const media = renderAttachments(message?.attachments);
    return `${media}${body}`;
  }

  window.SARAH_THREAD_FORMAT = {
    renderAssistantContent,
    formatUserPlain,
    formatUserMessage,
    renderAttachments,
    resolveMediaUrl,
  };
  window.threadImgTryFallback = threadImgTryFallback;
})();
