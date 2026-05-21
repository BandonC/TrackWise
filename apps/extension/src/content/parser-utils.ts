// Shared helpers for site parsers. Two responsibilities:
//
// 1. Formatted text extraction. .textContent collapses block
//    boundaries (paragraphs, list items, headings) into a single
//    space-separated string, which makes saved JDs render as walls
//    of prose on the detail page. extractFormattedText walks the
//    DOM, inserts newlines for block elements, and prefixes list
//    items with "- " so bullet structure survives.
//
// 2. Wait-for-content guard. LinkedIn (and to a lesser extent
//    Indeed) lazy-loads the JD body after the page shell. A Save
//    click in that gap captures only the section header. waitFor
//    polls a selector for non-trivial textContent until a deadline,
//    so the parse runs against fully-rendered content.

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'dl',
  'dd',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tfoot',
  'tr',
  'ul',
])

const SKIP_TAGS = new Set(['script', 'style', 'noscript'])

function walk(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ''
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as Element
  const tag = el.tagName.toLowerCase()
  if (SKIP_TAGS.has(tag)) return ''

  let children = ''
  for (const child of Array.from(el.childNodes)) {
    children += walk(child)
  }

  if (tag === 'li') return `\n- ${children.trim()}`
  if (tag === 'br') return '\n'
  if (BLOCK_TAGS.has(tag)) return `\n${children}\n`
  return children
}

// Extract human-readable text that preserves block boundaries and
// list-item structure. Output is suitable for direct display (and
// for embedding -- the LLM tolerates noise but renders cleaner
// when structure is intact).
export function extractFormattedText(el: Element): string {
  return walk(el)
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Poll a selector until its textContent exceeds minChars, or
// timeoutMs elapses. Resolves either way -- callers proceed with
// whatever the parser can capture if the deadline passes. Used
// to absorb LinkedIn's JD lazy-load delay before parsing.
export async function waitForContent(
  selector: string,
  minChars = 200,
  timeoutMs = 3000,
  pollMs = 100,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const el = document.querySelector(selector)
    if ((el?.textContent?.trim().length ?? 0) >= minChars) return
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}
