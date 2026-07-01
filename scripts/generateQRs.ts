#!/usr/bin/env node
/**
 * QR Code Generation Script for MUN Delegate Verification
 *
 * Usage:  npx tsx scripts/generateQRs.ts
 *
 * - Auto-detects header row in each tab (row 3 in your sheets)
 * - Adds UUID / Checked In / Check In Time / Device columns if missing
 * - Generates <Name>_<Committee>.png in generated-qrs/
 * - Idempotent: never overwrites existing UUIDs
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import QRCode from 'qrcode';
import { google } from 'googleapis';

// ─── Env ─────────────────────────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: fs.existsSync(envPath) ? envPath : '.env' });

const SHEET_ID   = process.env.GOOGLE_SHEET_ID!;
const SA_JSON    = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;
const TAB_FILTER = process.env.GOOGLE_SHEET_TAB_NAME?.trim();
const OUTPUT_DIR = path.resolve(process.cwd(), 'generated-qrs');

// Column names — mirror what googleSheets.ts uses
const COLS = {
  uuid:        'UUID',
  name:        process.env.SHEET_COL_NAME       ?? 'Name',
  portfolio:   process.env.SHEET_COL_PORTFOLIO  ?? 'Portfolio',
  feeStatus:   process.env.SHEET_COL_FEE_STATUS ?? 'Fee Status',
  checkedIn:   'Checked In',
  checkInTime: 'Check In Time',
  device:      'Device',
};

// ─── Validation ───────────────────────────────────────────────────────────────
if (!SHEET_ID) { console.error('❌  GOOGLE_SHEET_ID is not set.'); process.exit(1); }
if (!SA_JSON)  { console.error('❌  GOOGLE_SERVICE_ACCOUNT_JSON is not set.'); process.exit(1); }

let credentials: object;
try { credentials = JSON.parse(SA_JSON); }
catch { console.error('❌  GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.'); process.exit(1); }

// ─── Auth ─────────────────────────────────────────────────────────────────────
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function colLetter(idx: number): string {
  let s = '', n = idx;
  while (n >= 0) { s = String.fromCharCode((n % 26) + 65) + s; n = Math.floor(n / 26) - 1; }
  return s;
}

function sanitise(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').slice(0, 80);
}

/** Case-insensitive, trimmed column index */
function findCol(headers: string[], target: string): number {
  const t = target.toLowerCase().trim();
  return headers.findIndex(h => h.toLowerCase().trim() === t);
}

/** Find the row index (0-based in allRows) that contains the name header */
function findHeaderRowIdx(allRows: string[][]): number {
  const nameCol = COLS.name.toLowerCase().trim();
  for (let i = 0; i < Math.min(allRows.length, 10); i++) {
    if (allRows[i].some(c => c.toLowerCase().trim() === nameCol)) return i;
  }
  return 0;
}

/** First non-empty row after header */
function findDataStartIdx(allRows: string[][], headerIdx: number): number {
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    if (allRows[i].some(c => c.trim() !== '')) return i;
  }
  return headerIdx + 1;
}

// ─── Ensure required columns exist ───────────────────────────────────────────
async function ensureColumns(
  tabName: string,
  headers: string[],
  headerSheetRow: number, // 1-based
  required: string[],
): Promise<string[]> {
  const toAdd = required.filter(col => findCol(headers, col) === -1);
  if (toAdd.length === 0) return headers;

  const batchData = toAdd.map((col, i) => ({
    range: `${tabName}!${colLetter(headers.length + i)}${headerSheetRow}`,
    values: [[col]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: batchData },
  });

  console.log(`  ➕  Added columns: ${toAdd.join(', ')}`);
  return [...headers, ...toAdd];
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('📋  Fetching spreadsheet info…');
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  let allTabs = (meta.data.sheets ?? []).map(s => s.properties?.title ?? '').filter(Boolean);

  if (TAB_FILTER && TAB_FILTER.toUpperCase() !== 'ALL' && TAB_FILTER !== '') {
    allTabs = allTabs.filter(t => t === TAB_FILTER);
    if (!allTabs.length) { console.error(`❌  Tab "${TAB_FILTER}" not found.`); process.exit(1); }
  }

  console.log(`📂  Processing ${allTabs.length} tab(s): ${allTabs.join(', ')}\n`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁  Created: ${OUTPUT_DIR}\n`);
  }

  let totalGenerated = 0, totalNewUUIDs = 0;

  for (const tabName of allTabs) {
    console.log(`\n━━━ Tab: ${tabName} ━━━`);

    // Fetch all rows
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: tabName,
    });
    const allRows: string[][] = ((res.data.values ?? []) as unknown[][])
      .map(row => row.map(cell => String(cell ?? '').trim()));

    if (allRows.length < 2) { console.log('  ⚠️   No data — skipping.'); continue; }

    const headerIdx    = findHeaderRowIdx(allRows);
    const dataStartIdx = findDataStartIdx(allRows, headerIdx);
    const headerSheetRow = headerIdx + 1; // 1-based

    let headers = allRows[headerIdx];

    // Check for name column
    if (findCol(headers, COLS.name) === -1) {
      console.log(`  ⚠️   No "${COLS.name}" column found — skipping tab.`);
      continue;
    }

    // Ensure all required columns exist in the sheet
    headers = await ensureColumns(tabName, headers, headerSheetRow, [
      COLS.uuid, COLS.checkedIn, COLS.checkInTime, COLS.device
    ]);

    // Process each delegate row
    const uuidBatch: { range: string; values: string[][] }[] = [];

    const dataRows = allRows.slice(dataStartIdx);
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const sheetRowNum = dataStartIdx + i + 1; // 1-based

      const nameIdx      = findCol(headers, COLS.name);
      const portfolioIdx = findCol(headers, COLS.portfolio);
      const uuidIdx      = findCol(headers, COLS.uuid);

      const name      = row[nameIdx]      ?? '';
      const portfolio = portfolioIdx !== -1 ? (row[portfolioIdx] ?? '') : '';
      let   uuid      = uuidIdx !== -1     ? (row[uuidIdx] ?? '') : '';

      if (!name.trim()) { console.log(`  ⚠️   Row ${sheetRowNum}: empty name — skipping.`); continue; }

      // Assign UUID if missing (idempotent)
      if (!uuid.trim()) {
        uuid = crypto.randomUUID();
        uuidBatch.push({
          range: `${tabName}!${colLetter(uuidIdx)}${sheetRowNum}`,
          values: [[uuid]],
        });
        totalNewUUIDs++;
        console.log(`  🆔  Row ${sheetRowNum} (${name}): assigned UUID`);
      }

      // Generate QR image
      const committee  = tabName.trim();
      const label      = portfolio || committee;
      const filename   = `${sanitise(name)}_${sanitise(label)}.png`;
      const outputPath = path.join(OUTPUT_DIR, filename);

      await QRCode.toFile(outputPath, uuid, {
        type: 'png', width: 400, margin: 2,
        errorCorrectionLevel: 'H',
        color: { dark: '#0f172a', light: '#ffffff' },
      });

      console.log(`  ✅  ${filename}`);
      totalGenerated++;
    }

    // Batch write new UUIDs
    if (uuidBatch.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: uuidBatch },
      });
      console.log(`  ✏️   Wrote ${uuidBatch.length} UUID(s) to sheet.`);
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 QR Generation Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 QR images generated : ${totalGenerated}
 New UUIDs assigned  : ${totalNewUUIDs}
 Output directory    : ${OUTPUT_DIR}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch(err => {
  console.error('❌  Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
