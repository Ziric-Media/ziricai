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

  function formatInline(raw) {
    const escaped = escapeHtml(raw);
    return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function renderList(items, ordered) {
    const tag = ordered ? 'ol' : 'ul';
    const cls = ordered ? 'thread-list thread-list--ordered' : 'thread-list';
    const lis = items.map((item) => `<li>${formatInline(item)}</li>`).join('');
    return `<${tag} class="${cls}">${lis}</${tag}>`;
  }

  function renderHeading(level, text) {
    const n = Math.min(3, Math.max(2, level));
    return `<h${n} class="thread-heading thread-heading--${n}">${formatInline(text)}</h${n}>`;
  }

  function renderBadge(label) {
    return `<span class="thread-badge">${formatInline(label)}</span>`;
  }

  function renderFigure(src, alt, caption) {
    const cap = caption
      ? `<figcaption class="thread-msg-caption">${formatInline(caption)}</figcaption>`
      : '';
    return `<figure class="thread-msg-media">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(alt || '')}" loading="lazy" decoding="async" />
      ${cap}
    </figure>`;
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

        const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imgMatch) {
          flushList(state);
          out.push(renderFigure(imgMatch[2].trim(), imgMatch[1], ''));
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
        out.push(`<p>${formatInline(trimmed)}</p>`);
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
        return renderFigure(block.src || '', block.alt || '', block.caption || '');
      case 'card':
        return `<div class="thread-rich-card">${(block.blocks || []).map(renderBlock).join('')}</div>`;
      default:
        return '';
    }
  }

  function renderBlocks(blocks) {
    return (blocks || []).map(renderBlock).join('');
  }

  function legacyMediaHtml(message) {
    const urls = []
      .concat(message.image ? [message.image] : [])
      .concat(Array.isArray(message.images) ? message.images : []);
    return urls
      .map((src) => renderFigure(src, '', ''))
      .join('');
  }

  function renderAssistantContent(message) {
    if (Array.isArray(message.blocks) && message.blocks.length) {
      return renderBlocks(message.blocks) + legacyMediaHtml(message);
    }
    const md = message.markdown != null ? message.markdown : message.content;
    const body = parseRichMarkdown(md);
    const hasInlineImage = /!\[[^\]]*\]\([^)]+\)/.test(String(md || ''));
    const extraMedia = hasInlineImage ? '' : legacyMediaHtml(message);
    return body + extraMedia;
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

  window.SARAH_THREAD_FORMAT = {
    renderAssistantContent,
    formatUserPlain,
  };
})();
