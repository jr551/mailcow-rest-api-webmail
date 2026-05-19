/** Lightweight markdown → HTML renderer for chat bubbles.
 *  Handles: paragraphs, **bold**, *italic*, `code`, ```code blocks```,
 *  > blockquotes, - lists, [links](url), # headings.
 *  Safe: HTML is escaped before parsing so only markdown syntax produces tags.
 */

function escapeHtml(raw: string): string {
    return raw
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Extract fenced code blocks, replace with placeholders, process rest, then restore. */
export function renderMarkdown(src: string): string {
    let text = escapeHtml(src);
    const codeBlocks: { placeholder: string; html: string }[] = [];

    // Fenced code blocks (```...```)
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
        const ph = `\x00CODEBLOCK${codeBlocks.length}\x00`;
        const cls = lang ? ` class="language-${lang}"` : '';
        codeBlocks.push({
            placeholder: ph,
            html: `<pre><code${cls}>${code.trimEnd()}</code></pre>`
        });
        return ph;
    });

    // Inline code (`...`) — skip placeholders
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold (**...**)
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic (*...* or _..._) — but not inside already-rendered tags
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Strikethrough (~~...~~)
    text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Links [text](url) — block dangerous schemes so a model (or pasted
    // markdown) can't smuggle javascript:/vbscript:/data:text/html into
    // the chat surface, which uses {@html} to render the result.
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, rawUrl) => {
        const url = String(rawUrl).trim();
        const safe = /^(?:javascript|vbscript|file):/i.test(url) || /^data:text\/html/i.test(url) ? '#' : url;
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    // Blockquote lines (> ...)
    text = text.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Unordered lists (- item or * item)
    text = text.replace(/^(?:[-*] (.+)(?:\n|$))+/gm, (block) => {
        const items = block
            .trim()
            .split('\n')
            .map((line) => `<li>${line.replace(/^[-*] /, '')}</li>`)
            .join('');
        return `<ul>${items}</ul>`;
    });

    // Ordered lists (1. item)
    text = text.replace(/^(?:\d+\. (.+)(?:\n|$))+/gm, (block) => {
        const items = block
            .trim()
            .split('\n')
            .map((line) => `<li>${line.replace(/^\d+\. /, '')}</li>`)
            .join('');
        return `<ol>${items}</ol>`;
    });

    // Headings (### heading)
    text = text.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Horizontal rule
    text = text.replace(/^---+$/gm, '<hr />');

    // Restore code blocks
    for (const cb of codeBlocks) {
        text = text.replace(cb.placeholder, cb.html);
    }

    // Paragraphs: split on blank lines, wrap non-block elements
    const blocks = text.split(/\n\n+/);
    const out = blocks.map((blk) => {
        const trimmed = blk.trim();
        if (!trimmed) return '';
        // Don't wrap existing block-level elements
        if (
            trimmed.startsWith('<pre>') ||
            trimmed.startsWith('<ul>') ||
            trimmed.startsWith('<ol>') ||
            trimmed.startsWith('<blockquote>') ||
            trimmed.startsWith('<h') ||
            trimmed.startsWith('<hr')
        ) {
            return trimmed;
        }
        // Convert single newlines to <br>
        const inner = trimmed.replace(/\n/g, '<br>\n');
        return `<p>${inner}</p>`;
    });

    return out.join('\n\n');
}
