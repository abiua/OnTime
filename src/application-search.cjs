const fs = require('node:fs/promises');
const path = require('node:path');

const normalizeName = value => value.normalize('NFKC').trim().toLowerCase().replace(/\.(lnk|exe)$/i, '');
const pathKey = value => path.win32.normalize(value).toLowerCase();
const isAppQuery = query => typeof query === 'string' && query.length <= 120 && /^[\p{L}\p{N} ._()\-]+$/u.test(query.normalize('NFKC'));

function rankLaunchers(entries, query) {
  if (!isAppQuery(query)) return [];
  const keyword = normalizeName(query);
  if (!keyword) return [];
  const matches = [];
  for (const entry of entries) {
    const label = normalizeName(entry.name);
    const executable = normalizeName(path.win32.basename(entry.target));
    const rank = label === keyword ? 0 : executable === keyword ? 1 : label.startsWith(keyword) ? 2 : label.includes(keyword) ? 3 : -1;
    if (rank !== -1) matches.push({ entry, rank });
  }
  matches.sort((a, b) => a.rank - b.rank ||
    Number(b.entry.source === 'desktop') - Number(a.entry.source === 'desktop') ||
    a.entry.name.localeCompare(b.entry.name));
  const seen = new Set();
  return matches.map(match => match.entry).filter(entry => {
    const key = pathKey(entry.target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createApplicationSearch(roots, readShortcut) {
  let entries = [], refreshed = 0, pending;
  async function collect(directory, source, depth, result) {
    const files = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const file of files) {
      const filename = path.join(directory, file.name);
      if (file.isDirectory() && depth > 0) {
        await collect(filename, source, depth - 1, result);
      } else if (file.isFile() && /\.(lnk|exe)$/i.test(file.name)) {
        let target;
        try { target = /\.lnk$/i.test(file.name) ? readShortcut(filename).target : filename; }
        catch { continue; }
        if (typeof target !== 'string' || !path.isAbsolute(target) || !/\.exe$/i.test(target)) continue;
        const stat = await fs.stat(target).catch(() => null);
        if (stat?.isFile()) result.push({ path: filename, name: file.name.replace(/\.(lnk|exe)$/i, ''), target, source });
      }
    }
  }
  async function refresh() {
    if (Date.now() - refreshed < 15000) return;
    if (!pending) {
      pending = (async () => {
        const result = [];
        for (const root of roots) await collect(root.directory, root.source, root.source === 'desktop' ? 0 : 5, result);
        entries = result;
        refreshed = Date.now();
      })().finally(() => { pending = null; });
    }
    await pending;
  }
  return { refresh, async search(query) {
    if (!isAppQuery(query)) return [];
    await refresh();
    return rankLaunchers(entries, query).slice(0, 12);
  } };
}
module.exports = { createApplicationSearch, rankLaunchers };
