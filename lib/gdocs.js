// Google Docs / Drive (read-only). Works for documents shared as "Anyone with the link can view".
// Private files need Google sign-in (OAuth), which is not set up: those are reported, never guessed.
const DOCS = process.env.GDOCS_BASE || 'https://docs.google.com';
const API = process.env.GDRIVE_API_BASE || 'https://www.googleapis.com/drive/v3';

// find Google links in free text
function parseLinks(urls) {
  const out = [], seen = new Set();
  for (const u of urls) {
    let m;
    if ((m = u.match(/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([\w-]{15,})/))) add({ type: 'doc', id: m[1] });
    else if ((m = u.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]{15,})/))) add({ type: 'folder', id: m[1] });
    else if ((m = u.match(/drive\.google\.com\/file\/d\/([\w-]{15,})/)) || (m = u.match(/drive\.google\.com\/open\?id=([\w-]{15,})/))) add({ type: 'file', id: m[1] });
    else if ((m = u.match(/docs\.google\.com\/(spreadsheets|presentation)\/d\/([\w-]{15,})/))) add({ type: m[1] === 'spreadsheets' ? 'sheet' : 'slides', id: m[2] });
    function add(o) { const k = o.type + ':' + o.id; if (!seen.has(k)) { seen.add(k); out.push({ ...o, url: u }); } }
  }
  return out;
}

async function exportDoc(id) {
  const r = await fetch(`${DOCS}/document/d/${id}/export?format=txt`, { redirect: 'manual' });
  const ct = r.headers.get('content-type') || '';
  if (r.status >= 300 && r.status < 400) return { status: 'private', note: 'The document is not shared by link. In Google Docs: Share → General access → "Anyone with the link" (Viewer), then refresh.' };
  if (r.status === 404) return { status: 'missing', note: 'Document not found (404): wrong link or deleted.' };
  if (r.status === 401 || r.status === 403) return { status: 'private', note: 'No access to the document (not shared by link).' };
  if (!r.ok) return { status: 'error', note: 'Google returned ' + r.status + '.' };
  const body = await r.text();
  if (/text\/html/.test(ct) || /^\s*<(!doctype|html)/i.test(body)) return { status: 'private', note: 'Google asked for a sign-in: the document is not shared by link.' };
  return { status: 'ok', text: body.replace(/^﻿/, '').replace(/\r\n/g, '\n').trim() };
}

async function listFolder(id, apiKey) {
  if (!apiKey) return { status: 'needs-key', note: 'Listing a Drive folder needs a free Google API key (Settings). Or paste links to the documents themselves.' };
  const u = new URL(API + '/files');
  u.searchParams.set('q', `'${id}' in parents and trashed=false`); u.searchParams.set('fields', 'files(id,name,mimeType)'); u.searchParams.set('pageSize', '100'); u.searchParams.set('key', apiKey);
  const r = await fetch(u);
  if (!r.ok) return { status: r.status === 404 || r.status === 403 ? 'private' : 'error', note: 'Drive folder not readable (' + r.status + '). It must be shared by link.' };
  const j = await r.json();
  const docs = (j.files || []).filter(f => f.mimeType === 'application/vnd.google-apps.document');
  return { status: 'ok', docs: docs.map(f => ({ id: f.id, name: f.name })), total: (j.files || []).length };
}

// resolve a list of links into documents with text
async function resolve(urls, apiKey) {
  const out = [], seen = new Map();   // one entry per Google document id (a doc can be linked and also sit in a linked folder)
  const addDoc = (id, url, title, r) => {
    if (seen.has(id)) { if (title) seen.get(id).title = title; return; }
    const first = r.text ? (r.text.split('\n').find(x => x.trim()) || '').trim().slice(0, 80) : '';
    const e = { id, url, kind: 'doc', title: title || first || 'Google Doc', ...r, words: r.text ? r.text.split(/\s+/).filter(Boolean).length : 0, at: Date.now() };
    seen.set(id, e); out.push(e);
  };
  for (const l of parseLinks(urls)) {
    if (l.type === 'doc') {
      if (seen.has(l.id)) continue;
      addDoc(l.id, l.url, '', await exportDoc(l.id));
    } else if (l.type === 'folder') {
      const f = await listFolder(l.id, apiKey);
      if (f.status !== 'ok') { out.push({ url: l.url, kind: 'folder', title: 'Drive folder', ...f, at: Date.now() }); continue; }
      out.push({ url: l.url, kind: 'folder', title: `Drive folder (${f.docs.length} document(s))`, status: 'ok', text: '', words: 0, at: Date.now() });
      for (const d of f.docs) { if (seen.has(d.id)) { seen.get(d.id).title = d.name; continue; } addDoc(d.id, `https://docs.google.com/document/d/${d.id}/edit`, d.name, await exportDoc(d.id)); }
    } else if (l.type === 'file') out.push({ url: l.url, kind: 'file', title: 'Drive file', status: 'unsupported', note: 'Uploaded Drive files (docx, pdf) cannot be read directly. Open it in Google Docs ("Save as Google Docs") and share by link, or paste the text.', at: Date.now() });
    else out.push({ url: l.url, kind: l.type, title: l.type === 'sheet' ? 'Google Sheet' : 'Google Slides', status: 'unsupported', note: 'Only Google Docs are read as scripts.', at: Date.now() });
  }
  return out;
}
module.exports = { parseLinks, resolve, exportDoc };
