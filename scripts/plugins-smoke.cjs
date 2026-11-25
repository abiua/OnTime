const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const root = path.join(__dirname, '..');
const profile = 'plugins-' + randomUUID();
const directory = path.join(root, '.test-profile', profile, 'plugins');
const local = {
  schemaVersion: 1, name: '整理并去重', description: '清理各行并保留首次出现的内容',
  keywords: ['整理', 'clean'], steps: [{op:'trimLines'}, {op:'removeEmptyLines'}, {op:'uniqueLines'}],
  matching: {version:1,category:'text-transform',accepts:['multiline','text'],minLength:1,maxLength:12000},
  sample: ' 苹果 \n\n香蕉\n苹果 '
};
const ai = {
  schemaVersion: 1, name: '一句话摘要', description: '用一句话概括文本', keywords: ['摘要'],
  steps: [{op:'ai',prompt:'请用一句话概括输入。'}], sample: '下周一交付原型。周二开会讨论。'
};

async function main() {
  const requests = [], pageErrors = [];
  let releaseSlow, signalSlow;
  const slowArrived = new Promise(resolve => { signalSlow = resolve; });
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    requests.push(request);
    let response;
    if (request.instructions.startsWith('Create a reusable')) {
      if (request.input === '等待取消') {
        const pending = new Promise(resolve => { releaseSlow = resolve; });
        signalSlow();
        await pending;
      }
      response = request.input === '无效配置' ? {...local, steps:[{op:'exec', command:'not allowed'}]} :
        request.input === '生成摘要插件' ? ai : local;
      response = '```json\n' + JSON.stringify(response) + '\n```';
    } else {
      response = '摘要：' + request.input.split('。')[0] + '。';
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({output:[{content:[{type:'output_text', text:response}]}]}));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const stopServer = async () => {
    releaseSlow?.();
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  };
  const env = {...process.env};
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  async function start() {
    app = await electron.launch({args:[root, '--smoke', '--smoke-profile='+profile], env});
    const page = await app.firstWindow();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.locator('#query').waitFor();
    return page;
  }
  async function generate(page, requirement, name) {
    await page.locator('#query').fill(requirement);
    await page.locator('#builder-generate').click();
    await expect(page.locator('#draft-name')).toHaveText(name);
    await expect(page.locator('#builder-install')).toBeDisabled();
  }
  async function trial(page, expected) {
    await page.locator('#builder-trial').click();
    await expect(page.locator('#trial-status')).toContainText('运行完成');
    await expect(page.locator('#builder-output')).toHaveValue(expected);
    await expect(page.locator('#builder-install')).toBeEnabled();
  }
  async function install(page) {
    await page.locator('#builder-install').click();
    await expect(page.locator('#trial-status')).toContainText('已安装到插件栏');
    await expect(page.locator('#builder-install')).toBeDisabled();
  }

  try {
    let page = await start();
    await page.evaluate(port => window.ontime.saveProvider({name:'本地模拟', baseUrl:'http://127.0.0.1:'+port+'/v1', model:'mock', protocol:'responses', key:'test-only'}), server.address().port);
    const query = () => page.locator('#query');
    const requirement = '去掉各行空白、空行和重复行';
    await query().fill(requirement);
    await page.locator('[data-plugin="builder"]').click();
    await expect(query()).toHaveValue(requirement);
    await expect(page.locator('#plugins')).toBeHidden();
    await expect(page.locator('#pin')).toBeVisible();
    await generate(page, requirement, local.name);
    await expect(page.locator('#draft-steps li')).toHaveCount(3);
    await expect(page.locator('#draft-access')).toContainText('无需联网');
    await assert.rejects(page.evaluate(() => window.ontime.installTextPlugin(pluginDraft.token)), /先成功试运行/);
    await page.locator('#builder-sample').fill('');
    await page.locator('#builder-trial').click();
    await expect(page.locator('#trial-status')).toContainText('格式无效');
    await expect(page.locator('#builder-install')).toBeDisabled();
    await page.locator('#builder-sample').fill(local.sample);
    await trial(page, '苹果\n香蕉');
    const sample = ' 试运行专用样例 \n试运行专用样例';
    await page.locator('#builder-sample').fill(sample);
    await expect(page.locator('#builder-install')).toBeDisabled();
    await trial(page, '试运行专用样例');
    await install(page);
    await page.locator('#builder-open').click();
    await expect(query()).toHaveValue(sample);
    await query().press('Control+Enter');
    await expect(page.locator('#text-plugin-output')).toHaveValue('试运行专用样例');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].input, requirement);
    assert.match(requests[0].instructions,/Also include matching/);
    await page.locator('#back').click();
    await expect(query()).toHaveValue(requirement);
    await query().fill('整理');
    const localButton = () => page.locator('#plugins button').filter({hasText:local.name});
    await expect(localButton()).toHaveClass('match');
    const id = await localButton().getAttribute('data-plugin');
    const saved = await fs.readFile(path.join(directory, id+'.json'), 'utf8');
    assert.equal(JSON.parse(saved).sample, '');
    assert.deepEqual(JSON.parse(saved).matching,local.matching);
    assert.ok(!saved.includes('试运行专用样例'));
    assert.ok(!saved.includes(requirement));

    await page.locator('[data-plugin="builder"]').click();
    await generate(page, '生成摘要插件', ai.name);
    await expect(page.locator('#draft-access')).toContainText('发送至当前启用的模型服务');
    await trial(page, '摘要：下周一交付原型。');
    await install(page);
    await query().fill('无效配置');
    await page.locator('#builder-generate').click();
    await expect(page.locator('#builder-status')).toContainText('不支持的操作');
    await expect(page.locator('#builder-preview')).toBeHidden();
    await query().fill('等待取消');
    await page.locator('#builder-generate').click();
    await Promise.race([slowArrived, expect(page.locator('#builder-status')).not.toContainText('正在生成', {timeout:5000}).then(() => {throw Error('未进入慢请求');})]);
    await page.locator('#builder-cancel').click();
    releaseSlow();
    await expect(page.locator('#builder-status')).toHaveText('已取消生成');
    await expect(page.locator('#builder-preview')).toBeHidden();
    assert.equal((await page.evaluate(() => window.ontime.textPlugins())).items.length, 2);

    await page.locator('#settings').click();
    await page.locator('#quit').click();
    await app.close();
    app = null;
    page = await start();
    await page.locator('#plugin-overflow').click();
    await expect(page.locator('[data-library-plugin="'+id+'"]').filter({hasText:local.name})).toBeVisible();
    await page.locator('#plugin-library-grid button').filter({hasText:ai.name}).click();
    await query().fill('重启后继续验证。');
    await page.locator('#text-plugin-run').click();
    await expect(page.locator('#text-plugin-output')).toHaveValue('摘要：重启后继续验证。');
    assert.equal(requests.at(-1).input, '重启后继续验证。');
    assert.match(requests.at(-1).instructions, /请用一句话概括输入/);
    await stopServer();
    const count = requests.length;
    await page.locator('#back').click();
    await query().fill(' 柠檬 \n\n苹果\n柠檬');
    await page.locator('#plugin-overflow').click();
    await page.locator('[data-library-plugin="'+id+'"]').click();
    await expect(query()).toHaveValue(' 柠檬 \n\n苹果\n柠檬');
    await page.locator('#text-plugin-run').click();
    await expect(page.locator('#text-plugin-output')).toHaveValue('柠檬\n苹果');
    assert.equal(requests.length, count);
    assert.deepEqual(pageErrors, []);
    console.log('PASS: generation, validation, cancellation, trial, install, quit/relaunch, AI and offline plugin execution');
  } finally {
    try { if (app) await app.close(); }
    finally { await stopServer(); }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
