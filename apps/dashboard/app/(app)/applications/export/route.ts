import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const COLUMNS = [
  'company',
  'role',
  'location',
  'salary_min',
  'salary_max',
  'source_url',
  'source_site',
  'status',
  'applied_at',
  'last_updated_at',
  'notes',
] as const

type Row = { [K in (typeof COLUMNS)[number]]: string | number | null }

function csvEscape(value: string | number | null): string {
  if (value === null) return ''
  const s = String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsv(rows: Row[]): string {
  const header = COLUMNS.join(',')
  const body = rows
    .map((row) => COLUMNS.map((col) => csvEscape(row[col])).join(','))
    .join('\r\n')
  return body ? `${header}\r\n${body}\r\n` : `${header}\r\n`
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('applications')
    .select(COLUMNS.join(','))
    .order('applied_at', { ascending: false })
    .returns<Row[]>()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const csv = toCsv(data ?? [])

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="trackwise-export-${todayUtc()}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
