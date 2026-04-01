const { google } = require('googleapis');
const { getGoogleAuth } = require('./sheets');

let driveClient = null;

function getDrive() {
  if (!driveClient) {
    driveClient = google.drive({ version: 'v3', auth: getGoogleAuth() });
  }
  return driveClient;
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

module.exports = { createFolderInParent, getDrive };
