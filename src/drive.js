const { google } = require('googleapis');
const { getGoogleAuth } = require('./sheets');

let driveClient = null;

/** Default subfolders inside each new client folder (Drive disallows `/` in names; we normalize slashes). */
const DEFAULT_CLIENT_SUBFOLDER_NAMES = [
  '1. ONBOARDING',
  'ADVERTISING',
  'CONTENT',
  'EMAIL / SMS',
  'KEY INFORMATION',
  'SALES & SETTING',
  'WEB/FUNNEL',
];

function getDrive() {
  if (!driveClient) {
    driveClient = google.drive({ version: 'v3', auth: getGoogleAuth() });
  }
  return driveClient;
}

/**
 * Drive forbids `\ / ? * < > |` in names. Map slashes to " - " for readability.
 */
function sanitizeDriveLeafName(name) {
  return String(name)
    .replace(/\s*\/\s*/g, ' - ')
    .replace(/[\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);
}

/**
 * Optional override: GOOGLE_DRIVE_CLIENT_SUBFOLDER_NAMES=Folder A|Folder B|...
 */
function getClientSubfolderNameList() {
  const raw = (process.env.GOOGLE_DRIVE_CLIENT_SUBFOLDER_NAMES || '').trim();
  if (!raw) return [...DEFAULT_CLIENT_SUBFOLDER_NAMES];
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Create a folder under a parent. Returns { id, webViewLink }.
 * Parent folder must be shared with the service account (Editor).
 */
async function createFolderInParent(name, parentFolderId) {
  const drive = getDrive();
  const safeName = name.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 200);
  const res = await drive.files.create({
    requestBody: {
      name: safeName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id, name, webViewLink, mimeType',
    supportsAllDrives: true,
  });
  const id = res.data.id;
  let webViewLink = res.data.webViewLink;
  if (!webViewLink && id) {
    webViewLink = `https://drive.google.com/drive/folders/${id}`;
  }
  return { id, name: res.data.name, webViewLink };
}

/**
 * Create standard child folders inside a client folder (e.g. ONBOARDING, CONTENT, …).
 * @returns {Array<{ id: string, name: string, webViewLink?: string }>}
 */
async function createClientSubfolders(clientFolderId) {
  const names = getClientSubfolderNameList();
  const created = [];
  for (const label of names) {
    const safe = sanitizeDriveLeafName(label);
    if (!safe) continue;
    const folder = await createFolderInParent(safe, clientFolderId);
    created.push(folder);
  }
  return created;
}

module.exports = {
  createFolderInParent,
  createClientSubfolders,
  getClientSubfolderNameList,
  getDrive,
};
