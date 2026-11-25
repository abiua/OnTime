const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildArgs, parseResults, run } = require('../src/everything.cjs');
test('中文、空格和命令字符作为单独查询参数传递', () => {
  const query = '客户 报价 & -export-txt C:\\test.txt';
  const args = buildArgs(query, 50);
  assert.equal(args.at(-1), query); assert.equal(args.at(-2), '-search');
  assert.equal(args[args.indexOf('-offset') + 1], '50');
});
test('拒绝无效请求', () => {
  assert.throws(() => buildArgs('a\0')); assert.throws(() => buildArgs('a', -1));
  assert.throws(() => buildArgs('a', 0, 'bad'));
});
test('解析中文和 UNC 路径，过滤非绝对路径', () => {
  const rows = parseResults('\uFEFF' + JSON.stringify([{ filename: 'D:\\客户\\报价.pdf', size: 100 }, { filename: '\\\\server\\share\\a.txt' }, { filename: 'relative' }]));
  assert.equal(rows.length, 2); assert.equal(rows[0].name, '报价.pdf');
  assert.equal(rows[0].modified, null);
  assert.throws(() => parseResults('{}'));
});
test('缺失程序与查询失败不会伪装成空结果', async () => {
  await assert.rejects(run('Z:\\ontime-missing\\es.exe', []), /找不到/);
});
