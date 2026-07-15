import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'
import { buildExcelExportPayload } from '@/lib/export-excel-data'

const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF2F5597' } }
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
const HEADER_ALIGNMENT = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true }
const DATA_ALIGNMENT = { horizontal: 'center', vertical: 'middle', wrapText: true } as ExcelJS.Alignment
const DATA_ALIGNMENT_LEFT = { horizontal: 'left', vertical: 'top', wrapText: true } as ExcelJS.Alignment
const ZEBRA_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF5F5F5' } }
const TOTALS_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE6F3FF' } }

function applyZebra(row: ExcelJS.Row, index: number, alignment: ExcelJS.Alignment = DATA_ALIGNMENT) {
    row.eachCell((cell) => {
        cell.alignment = alignment
        if (index % 2 === 0) cell.fill = ZEBRA_FILL
    })
}

function writeSheetFromPayload(
    workbook: ExcelJS.Workbook,
    name: string,
    sheet: { headers: string[]; rows: (string | number)[][] },
    options: {
        colWidths: number[]
        dataRowHeight?: number
        headerRowHeight?: number
        leftAlignData?: boolean
        /** 1-based column index to bold (e.g. total cost column) */
        boldColumnIndex?: number
        /** Last row is totals row (bold + fill) */
        lastRowIsTotals?: boolean
    },
) {
    const ws = workbook.addWorksheet(name)
    const {
        colWidths,
        dataRowHeight = 25,
        headerRowHeight = 30,
        leftAlignData = false,
        boldColumnIndex,
        lastRowIsTotals = false,
    } = options

    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

    const hRow = ws.addRow(sheet.headers)
    hRow.height = headerRowHeight
    hRow.eachCell((cell) => {
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = HEADER_ALIGNMENT
    })
    ws.views = [{ state: 'frozen', ySplit: 1 }]

    const dataRows = lastRowIsTotals && sheet.rows.length > 0
        ? sheet.rows.slice(0, -1)
        : sheet.rows
    const totalsRow = lastRowIsTotals && sheet.rows.length > 0
        ? sheet.rows[sheet.rows.length - 1]
        : null

    dataRows.forEach((cells, index) => {
        const row = ws.addRow(cells)
        if (!leftAlignData) row.height = dataRowHeight
        const align = leftAlignData ? DATA_ALIGNMENT_LEFT : DATA_ALIGNMENT
        applyZebra(row, index, align)
        if (boldColumnIndex) {
            row.getCell(boldColumnIndex).font = { bold: true, color: { argb: 'FF006600' } }
        }
    })

    if (totalsRow) {
        const totalRow = ws.addRow(totalsRow)
        totalRow.height = 30
        totalRow.eachCell((cell) => {
            cell.font = { bold: true, size: 12 }
            cell.fill = TOTALS_FILL
            cell.alignment = { horizontal: 'center', vertical: 'middle' }
        })
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const folderId = searchParams.get('folderId')
    const format = searchParams.get('format')?.toLowerCase()

    if (!userId) {
        return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    try {
        const supabase = await createClient()

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        let query = supabase
            .from('articles')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'completed')

        if (folderId) {
            query = query.eq('folder_id', folderId)
        }

        const { data: articles, error } = await query

        if (error) throw error

        if (!articles || articles.length === 0) {
            return NextResponse.json({ error: 'No completed articles found to export' }, { status: 404 })
        }

        const payload = buildExcelExportPayload(articles)

        if (format === 'json') {
            return NextResponse.json(payload)
        }

        const workbook = new ExcelJS.Workbook()
        workbook.creator = 'Infinity Research'
        workbook.created = new Date()

        const colWidths1 = [50, 35, 22, 12, 7, 30, 25, 60, 10, 9, 16, 15, 50, 18, 35, 35, 25, 45, 45, 55, 40, 45, 45, 35, 35, 50]
        writeSheetFromPayload(workbook, 'Scientific Data', payload.sheets.scientificData, {
            colWidths: colWidths1,
            dataRowHeight: 120,
            leftAlignData: true,
        })

        const colWidths2 = [50, 12, 12, 30, 12, 14, 25, 12, 50, 12, 25, 12, 25, 12, 15]
        writeSheetFromPayload(workbook, 'Visual & Costs', payload.sheets.visualCosts, {
            colWidths: colWidths2,
            dataRowHeight: 40,
            boldColumnIndex: 15,
            lastRowIsTotals: true,
        })

        const colWidths3 = [50, 12, 12, 12, 12, 12, 12, 12, 15, 15, 15, 15]
        writeSheetFromPayload(workbook, 'Performance', payload.sheets.performance, {
            colWidths: colWidths3,
            dataRowHeight: 25,
        })

        const colWidths4 = [50, ...Array(10).fill(18), 12]
        writeSheetFromPayload(workbook, 'Confidence & Agreement', payload.sheets.confidence, {
            colWidths: colWidths4,
            dataRowHeight: 30,
        })

        const colWidths5 = [50, ...Array(11).fill(14), 14, 40]
        writeSheetFromPayload(workbook, 'API Enrichment', payload.sheets.apiEnrichment, {
            colWidths: colWidths5,
            dataRowHeight: 40,
        })

        const colWidths6 = [30, 25, 12, 14, 16, 10, 12, 10, 10, 12, 10, 12, 12, 12, 12, 14, 12, 10, 10, 10, 16, 8, 35]
        writeSheetFromPayload(workbook, 'Meta-Analysis Data', payload.sheets.metaAnalysis, {
            colWidths: colWidths6,
            dataRowHeight: 30,
        })

        const buffer = await workbook.xlsx.writeBuffer()

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="infinity_export_${new Date().toISOString().split('T')[0]}.xlsx"`,
            },
        })
    } catch (error: any) {
        console.error('Excel export error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
