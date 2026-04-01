const { google } = require('googleapis');

let sheetsClient = null;
let googleAuth = null;

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];

function getGoogleAuth() {
  if (googleAuth) return googleAuth;

  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!key) {
    throw new Error('GOOGLE_PRIVATE_KEY not set. Required for Google Sheets (Revenue, forms).');
  }

  googleAuth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (typeof key === 'string' ? key : '').replace(/\\n/g, '\n'),
    },
    scopes: GOOGLE_SCOPES,
  });

  return googleAuth;
}

function getClient() {
  if (sheetsClient) return sheetsClient;

  const auth = getGoogleAuth();
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

async function getRows(spreadsheetId) {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'A:ZZ',
  });
  return res.data.values || [];
}

async function getRowCount(spreadsheetId) {
  const rows = await getRows(spreadsheetId);
  return rows.length;
}

async function getNewRows(spreadsheetId, afterIndex) {
  const rows = await getRows(spreadsheetId);
  if (rows.length <= afterIndex) return { headers: rows[0] || [], newRows: [], totalRows: rows.length };

  const headers = rows[0] || [];
  const newRows = rows.slice(afterIndex);
  return { headers, newRows, totalRows: rows.length };
}

/**
 * Append one or more rows to a sheet (e.g. Revenue). Row = array of cell values.
 * @param {string} spreadsheetId
 * @param {string} sheetName - e.g. 'Revenue'
 * @param {string[][]} rows - e.g. [ [date, clientName, email, '', cash, '', '', '', '', platform] ]
 */
async function appendRows(spreadsheetId, sheetName, rows) {
  if (!rows.length) return;
  const sheets = getClient();
  const range = `'${String(sheetName).replace(/'/g, "''")}'!A:J`;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

module.exports = { getRows, getRowCount, getNewRows, appendRows, getGoogleAuth, GOOGLE_SCOPES };
