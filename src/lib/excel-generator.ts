
import { saveAs } from 'file-saver';
import type ExcelJS from 'exceljs';

// --- TYPES ---
interface ConsolidatedResult {
    filename: string;
    analysis: {
        metadata: {
            title: string;
            authors: string[] | string;
            journal: string;
            year: number | string;
            doi: string;
            study_type: string;
            [key: string]: any;
        };
        scientific_data: Record<string, any>;
        audit_notes: string;
    };
    technical: {
        status: string;
        vision_time: number;
        text_time: number;
        models_used: string[];
        cost: number;
    }
}

export const generateRichExcel = async (results: ConsolidatedResult[], filename: string = "Consensus_Report.xlsx") => {
    // Dynamic import to avoid 'fs' build errors in browser
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default;
    const Workbook = ExcelJS.Workbook;

    // --- STYLES (Moved inside to use dynamic type if needed, but simple objects work) ---
    const HEADER_STYLE = {
        font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } } as ExcelJS.Fill,
        alignment: { horizontal: 'center', vertical: 'middle' } as Partial<ExcelJS.Alignment>,
        border: {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        } as Partial<ExcelJS.Borders>
    };

    const QUALITY_FILLS = {
        excellent: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } } as ExcelJS.Fill,
        good: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } } as ExcelJS.Fill,
        poor: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } } as ExcelJS.Fill
    };

    const workbook = new Workbook();
    workbook.creator = 'Infinity Research AI';
    workbook.created = new Date();

    // Helper functions moved inside to capture workbook/ExcelJS context or passed clearly
    // But since they are independent logic, we can keep them outside IF we pass the types properly OR just define them here.
    // Defining here is safer for the dynamic import scope.

    // --- SHEET 1: RESEARCH DATA ---
    const createResearchSheet = (wb: ExcelJS.Workbook, results: ConsolidatedResult[]) => {
        const ws = wb.addWorksheet('📄 Research Data', { properties: { tabColor: { argb: 'FF00FF00' } } });

        let dynamicKeys: string[] = [];
        const sample = results.find(r => r.analysis?.scientific_data);
        if (sample) {
            dynamicKeys = Object.keys(sample.analysis.scientific_data);
        }

        const columns = [
            { header: 'Filename', key: 'filename', width: 25 },
            { header: 'Title', key: 'title', width: 40 },
            { header: 'Authors', key: 'authors', width: 30 },
            { header: 'Journal', key: 'journal', width: 20 },
            { header: 'Year', key: 'year', width: 10 },
            { header: 'DOI', key: 'doi', width: 35 },
            { header: 'Study Type', key: 'study_type', width: 20 },
            ...dynamicKeys.map(k => ({ header: k.replace(/_/g, ' ').toUpperCase(), key: `dyn_${k}`, width: 35 })),
            { header: 'Audit Notes', key: 'audit_notes', width: 50 },
        ];

        ws.columns = columns;

        ws.getRow(1).eachCell((cell) => {
            cell.font = HEADER_STYLE.font;
            cell.fill = HEADER_STYLE.fill;
            cell.alignment = HEADER_STYLE.alignment;
            cell.border = HEADER_STYLE.border;
        });

        results.forEach((r) => {
            const meta = r.analysis?.metadata || {};
            const sci = r.analysis?.scientific_data || {};

            const rowData: any = {
                filename: r.filename,
                title: meta.title || "N/A",
                authors: Array.isArray(meta.authors) ? meta.authors.join("; ") : meta.authors,
                journal: meta.journal,
                year: meta.year,
                doi: meta.doi,
                study_type: meta.study_type,
                audit_notes: r.analysis?.audit_notes
            };

            dynamicKeys.forEach(k => {
                let val = sci[k];
                if (typeof val === 'object') val = JSON.stringify(val);
                rowData[`dyn_${k}`] = val;
            });

            const row = ws.addRow(rowData);

            row.eachCell((cell) => {
                cell.alignment = { vertical: 'middle', wrapText: true };
            });

            const doiCell = row.getCell('doi');
            if (meta.doi && meta.doi.includes("10.")) {
                const url = meta.doi.startsWith("http") ? meta.doi : `https://doi.org/${meta.doi}`;
                doiCell.value = { text: meta.doi, hyperlink: url };
                doiCell.font = { color: { argb: 'FF0563C1' }, underline: true };
            }
        });
    };

    // --- SHEET 2: TECHNICAL METADATA ---
    const createTechnicalSheet = (wb: ExcelJS.Workbook, results: ConsolidatedResult[]) => {
        const ws = wb.addWorksheet('🔧 Technical Metadata', { properties: { tabColor: { argb: 'FF808080' } } });

        ws.columns = [
            { header: 'Filename', key: 'filename', width: 30 },
            { header: 'Extraction Status', key: 'status', width: 15 },
            { header: 'Input Models', key: 'models', width: 25 },
            { header: 'Vision Time (s)', key: 'vision_time', width: 15 },
            { header: 'Est. Cost ($)', key: 'cost', width: 15 },
        ];

        ws.getRow(1).eachCell((cell) => {
            cell.font = HEADER_STYLE.font;
            cell.fill = HEADER_STYLE.fill;
            cell.alignment = HEADER_STYLE.alignment;
        });

        results.forEach(r => {
            const row = ws.addRow({
                filename: r.filename,
                status: r.technical.status,
                models: r.technical.models_used.join(", "),
                vision_time: (r.technical.vision_time / 1000).toFixed(2),
                cost: r.technical.cost.toFixed(4)
            });

            const statusCell = row.getCell('status');
            if (r.technical.status === 'success') statusCell.fill = QUALITY_FILLS.excellent;
            else if (r.technical.status === 'partial') statusCell.fill = QUALITY_FILLS.good;
            else statusCell.fill = QUALITY_FILLS.poor;
        });
    };

    // --- SHEET 3: TOTALS ---
    const createTotalsSheet = (wb: ExcelJS.Workbook, results: ConsolidatedResult[]) => {
        const ws = wb.addWorksheet('📊 Project Totals', { properties: { tabColor: { argb: 'FFFFD700' } } });

        ws.columns = [
            { header: 'Metric', key: 'metric', width: 30 },
            { header: 'Value', key: 'value', width: 20 },
        ];

        const totalFiles = results.length;
        const totalCost = results.reduce((acc, r) => acc + (r.technical.cost || 0), 0);
        const successCount = results.filter(r => r.technical.status === 'success').length;
        const totalTime = results.reduce((acc, r) => acc + (r.technical.vision_time || 0), 0) / 1000;

        const stats = [
            ['Total Articles', totalFiles],
            ['Success Rate', `${((successCount / totalFiles) * 100).toFixed(1)}%`],
            ['Total Estimated Cost', `$${totalCost.toFixed(4)}`],
            ['Total Processing Time', `${totalTime.toFixed(1)}s`],
            ['Avg Time per Article', `${(totalTime / totalFiles).toFixed(1)}s`]
        ];

        ws.getRow(1).eachCell((cell) => {
            cell.font = HEADER_STYLE.font;
            cell.fill = HEADER_STYLE.fill;
        });

        stats.forEach(([metric, val]) => {
            const row = ws.addRow({ metric, value: val });
            row.getCell(1).font = { bold: true };
            row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F3FF' } };
        });
    };

    // Execute Sheet Creation
    createResearchSheet(workbook, results);
    createTechnicalSheet(workbook, results);
    createTotalsSheet(workbook, results);

    // Write Buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, filename);
};
