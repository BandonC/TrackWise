// Client-side resume parsers. Lazy-loaded so neither library
// is in the initial dashboard bundle -- import() pulls them in
// only when the user clicks Upload PDF / Upload DOCX.
//
// We extract text only -- we don't store the original file. The
// embedding pipeline runs against the textarea content, so PDF
// structure is irrelevant downstream.

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5MB

export class ResumeParseError extends Error {}

function assertSize(file: File): void {
  if (file.size > MAX_FILE_BYTES) {
    throw new ResumeParseError(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 5MB.`,
    )
  }
}

// PDF: pdfjs-dist 5.x. Iterates pages and concatenates each
// page's text-content items. Multi-column layouts read in
// coordinate order, which interleaves columns -- the user can
// clean that up in the textarea before saving.
export async function extractPdfText(file: File): Promise<string> {
  assertSize(file)

  const pdfjs = await import('pdfjs-dist')
  // Bundler-resolved worker URL. Turbopack/Next handle the
  // `new URL(specifier, import.meta.url)` pattern; this avoids
  // shipping a CDN dependency on Mozilla's pdfjs worker.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const buf = await file.arrayBuffer()
  let pdf
  try {
    pdf = await pdfjs.getDocument({ data: buf }).promise
  } catch (err) {
    throw new ResumeParseError(
      err instanceof Error
        ? `Couldn't read PDF: ${err.message}`
        : "Couldn't read PDF",
    )
  }

  const pageTexts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .filter(Boolean)
      .join(' ')
    if (text.trim()) pageTexts.push(text)
  }

  const out = pageTexts.join('\n\n').trim()
  if (!out) {
    throw new ResumeParseError(
      "No text found -- this PDF is likely scanned/image-based. Paste manually below.",
    )
  }
  return out
}

// DOCX: mammoth's extractRawText. Cleaner output than PDF
// because DOCX preserves paragraph structure.
export async function extractDocxText(file: File): Promise<string> {
  assertSize(file)

  const mammoth = await import('mammoth')
  const buf = await file.arrayBuffer()

  let result
  try {
    result = await mammoth.extractRawText({ arrayBuffer: buf })
  } catch (err) {
    throw new ResumeParseError(
      err instanceof Error
        ? `Couldn't read DOCX: ${err.message}`
        : "Couldn't read DOCX",
    )
  }

  const out = result.value.trim()
  if (!out) {
    throw new ResumeParseError(
      'No text found in this DOCX. Paste manually below.',
    )
  }
  return out
}
