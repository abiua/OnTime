// Adapted from liriliri/tinker src/preload/lib/search/win.ts (AGPL-3.0).
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function candidates(custom, root) {
  return [custom, process.env.ONTIME_ES_PATH, path.join(root, 'resources', 'es.exe'),
    ...[process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map(p => path.join(p, 'Everything', 'es.exe')),
    ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(p => path.join(p, 'es.exe'))].filter(Boolean);
}
function findEs(custom, root) { return candidates(custom, root).find(p => fs.existsSync(p)) || null; }
function buildArgs(query, offset = 0, filter = 'all') {
  if (typeof query !== 'string' || query.length > 2000 || /[\0\r\n]/.test(query)) throw new Error('搜索内容无效');
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Error('分页参数无效');
  // -search consumes the following argument as search text, never as an ES switch.
  const filters = { all: '', documents: 'ext:pdf;doc;docx;xls;xlsx;ppt;pptx;txt;md', images: 'ext:png;jpg;jpeg;webp;gif;svg', folders: 'folder:' };
  if (!(filter in filters)) throw new Error('筛选条件无效');
  return ['-code-page', '65001', '-json', '-size', '-date-modified', '-offset', String(offset), '-max-results', '50', '-search', `${filters[filter]} ${query}`.trim()];
}
function parseResults(text) {
  const rows = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (!Array.isArray(rows)) throw new Error('Everything 返回格式不兼容，请更新 ES');
  return rows.filter(r => typeof r.filename === 'string' && path.win32.isAbsolute(r.filename)).map(r => ({
    path: r.filename, name: path.win32.basename(r.filename), size: Number(r.size) || 0,
    modified: Number(r.date_modified) ? Math.floor(Number(r.date_modified) / 10000) - 11644473600000 : null
  }));
}
function run(exe, args, signal) {
  if (process.env.ONTIME_EVERYTHING_INSTANCE) args = ['-instance', process.env.ONTIME_EVERYTHING_INSTANCE, ...args];
  return new Promise((resolve, reject) => {
    execFile(exe, args, { windowsHide: true, encoding: 'utf8', timeout: 8000, maxBuffer: 8 * 1024 * 1024, signal }, (error, stdout) => {
      if (error) {
        const message = error.name === 'AbortError' ? '搜索已取消' : error.killed ? 'Everything 响应超时，请检查索引状态' : error.code === 'ENOENT' ? '找不到 es.exe，请重新配置' : `无法查询 Everything（${error.code}）。请确认 Everything 已启动，且索引已就绪。`;
        reject(new Error(message));
      } else resolve(stdout);
    });
  });
}
module.exports = { findEs, buildArgs, parseResults, run };
