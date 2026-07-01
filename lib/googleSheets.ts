import { google, sheets_v4 } from 'googleapis';
import { Delegate } from '@/types/delegate';

// ─── Auth ────────────────────────────────────────────────────────────────────

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set.');
  try {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(raw),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
}

function getSheetsClient(): sheets_v4.Sheets {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID environment variable is not set.');
  return id;
}

// ─── Column name resolution (env-overridable, case-insensitive matching) ──────

function getColumnNames() {
  return {
    uuid:         'UUID',
    name:         process.env.SHEET_COL_NAME        ?? 'Name',
    committee:    process.env.SHEET_COL_COMMITTEE   ?? 'Committee',
    portfolio:    process.env.SHEET_COL_PORTFOLIO   ?? 'Portfolio',
    feeStatus:    process.env.SHEET_COL_FEE_STATUS  ?? 'Fee Status',
    contact:      process.env.SHEET_COL_CONTACT     ?? 'Contact',
    email:        process.env.SHEET_COL_EMAIL       ?? 'Email',
    checkedIn:    'Checked In',
    checkInTime:  'Check In Time',
    device:       'Device',
  };
}

type ColumnKey = keyof ReturnType<typeof getColumnNames>;

/** Case-insensitive, trim-tolerant column index finder */
function findColIndex(headers: string[], target: string): number {
  if (!target) return -1;
  const t = target.toLowerCase().trim();
  return headers.findIndex(h => h.toLowerCase().trim() === t);
}

// ─── Header row auto-detection ────────────────────────────────────────────────

/**
 * Scans the first 10 rows to find the header row.
 * Looks for the row containing the "name" column header (case-insensitive).
 * Returns the 0-based index within allRows.
 */
function detectHeaderRowIndex(allRows: string[][]): number {
  const nameCol = getColumnNames().name.toLowerCase().trim();
  for (let i = 0; i < Math.min(allRows.length, 10); i++) {
    if (allRows[i].some(cell => cell.toLowerCase().trim() === nameCol)) {
      return i;
    }
  }
  return 0; // fallback
}

/**
 * After the header row, skip blank rows to find the first data row.
 * Returns 0-based index within allRows.
 */
function detectDataStartIndex(allRows: string[][], headerIdx: number): number {
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    if (allRows[i].some(cell => cell.trim() !== '')) return i;
  }
  return headerIdx + 1;
}

// ─── Tab list ─────────────────────────────────────────────────────────────────

async function getTabsToSearch(): Promise<string[]> {
  const configured = process.env.GOOGLE_SHEET_TAB_NAME?.trim();
  if (configured && configured.toUpperCase() !== 'ALL' && configured !== '') {
    return [configured];
  }
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: getSheetId() });
  return (res.data.sheets ?? [])
    .map(s => s.properties?.title ?? '')
    .filter(Boolean);
}

// ─── Per-tab data fetch ───────────────────────────────────────────────────────

interface TabData {
  headers: string[];
  headerRowIndex: number;  // 0-based in allRows
  rows: { data: Record<string, string>; sheetRowNum: number }[];
}

async function getTabData(tabName: string): Promise<TabData> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: tabName,
  });

  const allRows: string[][] = (response.data.values ?? []).map(row =>
    (row as unknown[]).map(cell => String(cell ?? '').trim())
  );

  if (allRows.length === 0) return { headers: [], headerRowIndex: 0, rows: [] };

  const headerIdx = detectHeaderRowIndex(allRows);
  const dataStartIdx = detectDataStartIndex(allRows, headerIdx);
  const headers = allRows[headerIdx];

  const rows = allRows.slice(dataStartIdx).map((row, i) => {
    const sheetRowNum = dataStartIdx + i + 1; // 1-based sheet row number
    const data: Record<string, string> = {};
    headers.forEach((header, ci) => { data[header] = row[ci] ?? ''; });
    return { data, sheetRowNum };
  });

  return { headers, headerRowIndex: headerIdx, rows };
}

// ─── Delegate lookup ──────────────────────────────────────────────────────────

export async function findDelegateByUUID(uuid: string): Promise<Delegate | null> {
  const tabs = await getTabsToSearch();
  const cols = getColumnNames();

  for (const tabName of tabs) {
    try {
      const { headers, rows } = await getTabData(tabName);
      const uuidIdx = findColIndex(headers, cols.uuid);
      if (uuidIdx === -1) continue; // no UUID column in this tab

      for (const { data, sheetRowNum } of rows) {
        const rowUUID = data[headers[uuidIdx]] ?? '';
        if (rowUUID.toLowerCase() === uuid.toLowerCase()) {
          return rowToDelegate(data, headers, sheetRowNum, tabName);
        }
      }
    } catch {
      continue; // skip tabs with read errors
    }
  }
  return null;
}

function rowToDelegate(
  data: Record<string, string>,
  headers: string[],
  rowIndex: number,
  sheetTab: string,
): Delegate {
  const cols = getColumnNames();

  const get = (colName: string) => {
    if (!colName) return '';
    const idx = findColIndex(headers, colName);
    return idx !== -1 ? (data[headers[idx]] ?? '') : '';
  };

  const checkedInRaw = get(cols.checkedIn).toUpperCase();

  return {
    uuid:         get(cols.uuid),
    name:         get(cols.name),
    committee:    get(cols.committee) || sheetTab, // fallback to tab name
    portfolio:    get(cols.portfolio),
    feeStatus:    get(cols.feeStatus),
    contact:      get(cols.contact),
    email:        get(cols.email),
    checkedIn:    checkedInRaw === 'TRUE' || checkedInRaw === '1' || checkedInRaw === 'YES',
    checkInTime:  get(cols.checkInTime) || null,
    device:       get(cols.device) || null,
    rowIndex,
    sheetTab,
  };
}

// ─── Attendance update ────────────────────────────────────────────────────────

export async function updateDelegateRow(
  delegate: Delegate,
  fields: Partial<Record<ColumnKey, string>>
): Promise<void> {
  const sheets = getSheetsClient();
  const cols = getColumnNames();
  const { rowIndex, sheetTab } = delegate;
  const { headers } = await getTabData(sheetTab);

  const batchData: sheets_v4.Schema$ValueRange[] = [];

  for (const [key, value] of Object.entries(fields) as [ColumnKey, string][]) {
    const colName = cols[key];
    let colIdx = findColIndex(headers, colName);

    // Column doesn't exist yet — append it to the header row
    if (colIdx === -1) {
      colIdx = await appendColumnHeader(sheetTab, headers, colName);
      headers.push(colName); // keep local copy in sync
    }

    const colLetter = columnIndexToLetter(colIdx);
    batchData.push({
      range: `${sheetTab}!${colLetter}${rowIndex}`,
      values: [[value]],
    });
  }

  if (batchData.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: { valueInputOption: 'USER_ENTERED', data: batchData },
  });
}

// ─── Column management ────────────────────────────────────────────────────────

/**
 * Append a new column header to the end of the header row.
 * Returns the new 0-based column index.
 */
export async function appendColumnHeader(
  tabName: string,
  currentHeaders: string[],
  newHeader: string,
  headerSheetRow?: number,
): Promise<number> {
  const sheets = getSheetsClient();
  const newColIdx = currentHeaders.length;
  const colLetter = columnIndexToLetter(newColIdx);

  // headerSheetRow defaults to 1 if not provided; caller should pass correct row
  const row = headerSheetRow ?? 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${tabName}!${colLetter}${row}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[newHeader]] },
  });
  return newColIdx;
}

// ─── UUID write-back (for QR generation script) ───────────────────────────────

export async function writeCell(
  tabName: string,
  sheetRowNum: number,
  colIdx: number,
  value: string,
): Promise<void> {
  const sheets = getSheetsClient();
  const colLetter = columnIndexToLetter(colIdx);
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${tabName}!${colLetter}${sheetRowNum}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function columnIndexToLetter(index: number): string {
  let letter = '';
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

export { getTabsToSearch, getTabData };
