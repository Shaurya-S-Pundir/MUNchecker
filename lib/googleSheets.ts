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

/**
 * Returns list of tab names to search.
 * If GOOGLE_SHEET_TAB_NAME is set (and not "ALL"), use only that tab.
 * Otherwise, fetch all tab names from the spreadsheet.
 */
async function getTabsToSearch(): Promise<string[]> {
  const configured = process.env.GOOGLE_SHEET_TAB_NAME?.trim();
  if (configured && configured.toUpperCase() !== 'ALL' && configured !== '') {
    return [configured];
  }
  // Fetch all tab names dynamically
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: getSheetId() });
  return (res.data.sheets ?? [])
    .map((s) => s.properties?.title ?? '')
    .filter(Boolean);
}

// ─── Column header mapping ────────────────────────────────────────────────────

const COLUMN_MAP = {
  uuid: 'UUID',
  name: 'Name',
  committee: 'Committee',
  portfolio: 'Portfolio',
  feeStatus: 'Fee Status',
  contact: 'Contact',
  email: 'Email',
  checkedIn: 'Checked In',
  checkInTime: 'Check In Time',
  device: 'Device',
} as const;

type ColumnKey = keyof typeof COLUMN_MAP;

// ─── Per-tab data fetch ───────────────────────────────────────────────────────

async function getTabData(tabName: string): Promise<{
  headers: string[];
  rows: Record<string, string>[];
}> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: tabName,
  });

  const values = response.data.values ?? [];
  if (values.length === 0) return { headers: [], rows: [] };

  const [headerRow, ...dataRows] = values;
  const headers: string[] = headerRow.map((h: unknown) => String(h ?? '').trim());

  const rows = dataRows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      obj[header] = String(row[i] ?? '').trim();
    });
    return obj;
  });

  return { headers, rows };
}

// ─── Delegate lookup ──────────────────────────────────────────────────────────

/**
 * Search all configured tabs for a delegate by UUID.
 * Returns null if not found in any tab.
 */
export async function findDelegateByUUID(uuid: string): Promise<Delegate | null> {
  const tabs = await getTabsToSearch();

  for (const tabName of tabs) {
    try {
      const { headers, rows } = await getTabData(tabName);
      const uuidHeader = COLUMN_MAP.uuid;
      if (!headers.includes(uuidHeader)) continue; // tab doesn't have UUID column — skip

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row[uuidHeader]?.toLowerCase() === uuid.toLowerCase()) {
          return rowToDelegate(row, i + 2, tabName); // +2: 1-based, skip header
        }
      }
    } catch {
      // If one tab fails to read (e.g. permissions), skip it and continue
      continue;
    }
  }

  return null;
}

function rowToDelegate(
  row: Record<string, string>,
  rowIndex: number,
  sheetTab: string
): Delegate {
  const checkedInRaw = row[COLUMN_MAP.checkedIn]?.toUpperCase();
  return {
    uuid: row[COLUMN_MAP.uuid] ?? '',
    name: row[COLUMN_MAP.name] ?? '',
    committee: row[COLUMN_MAP.committee] ?? '',
    portfolio: row[COLUMN_MAP.portfolio] ?? '',
    feeStatus: row[COLUMN_MAP.feeStatus] ?? '',
    contact: row[COLUMN_MAP.contact] ?? '',
    email: row[COLUMN_MAP.email] ?? '',
    checkedIn: checkedInRaw === 'TRUE' || checkedInRaw === '1' || checkedInRaw === 'YES',
    checkInTime: row[COLUMN_MAP.checkInTime] || null,
    device: row[COLUMN_MAP.device] || null,
    rowIndex,
    sheetTab,
  };
}

// ─── Attendance update ────────────────────────────────────────────────────────

/**
 * Update specific columns in a delegate's row by header name.
 * Uses delegate.sheetTab to target the correct tab.
 */
export async function updateDelegateRow(
  delegate: Delegate,
  fields: Partial<Record<ColumnKey, string>>
): Promise<void> {
  const sheets = getSheetsClient();
  const sheetId = getSheetId();
  const { rowIndex, sheetTab } = delegate;

  // Re-fetch headers for this specific tab to get column positions
  const { headers } = await getTabData(sheetTab);

  const data: sheets_v4.Schema$ValueRange[] = [];

  for (const [key, value] of Object.entries(fields) as [ColumnKey, string][]) {
    const headerName = COLUMN_MAP[key];
    const colIndex = headers.indexOf(headerName);
    if (colIndex === -1) continue; // Column doesn't exist in this tab — skip

    const colLetter = columnIndexToLetter(colIndex);
    const range = `${sheetTab}!${colLetter}${rowIndex}`;
    data.push({ range, values: [[value]] });
  }

  if (data.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });
}

// ─── UUID write-back (used by QR generation script) ──────────────────────────

export async function writeUUID(
  tabName: string,
  rowIndex: number,
  uuid: string,
  headers: string[]
): Promise<void> {
  const sheets = getSheetsClient();
  const colIndex = headers.indexOf(COLUMN_MAP.uuid);
  if (colIndex === -1) throw new Error(`Column "${COLUMN_MAP.uuid}" not found in tab "${tabName}".`);

  const colLetter = columnIndexToLetter(colIndex);
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${tabName}!${colLetter}${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[uuid]] },
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

// ─── Exports for QR generation script ────────────────────────────────────────

export { getTabsToSearch, getTabData };
