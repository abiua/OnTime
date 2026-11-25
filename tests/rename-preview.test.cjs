const test=require('node:test');
const assert=require('node:assert/strict');
const {validatePlan,pythonPreview}=require('../src/rename-preview.cjs');
const {copyText}=require('../src/clipboard-service.cjs');
const folder={directory:'D:\\example',files:[{name:'a.txt',type:'file'},{name:'b.txt',type:'file'},{name:'folder',type:'directory'}]};
test('rename preview rejects conflicts, invalid names and unknown sources',()=>{
 for(const plan of [[{from:'a.txt',to:'B.TXT'}],[{from:'a.txt',to:'../x'}],[{from:'a.txt',to:'NUL.txt'}],[{from:'a.txt',to:'name.'}],[{from:'missing',to:'x'}],[{from:'folder',to:'x'}],[{from:'a.txt',to:'x'},{from:'a.txt',to:'y'}]])assert.throws(()=>validatePlan(folder,plan));
 const swap=[{from:'a.txt',to:'b.txt'},{from:'b.txt',to:'a.txt'}];assert.deepEqual(validatePlan(folder,swap),swap);
 assert.equal(validatePlan(folder,[{from:'a.txt',to:'a.txt'}]).length,0);
});
test('Python preview contains the same JSON mapping and no filesystem actions',()=>{
 const mapping=[{from:'中文.txt',to:"a'quote.txt"}];const code=pythonPreview(mapping);
 const literal=code.match(/json.loads\((.*)\)/)[1];assert.deepEqual(JSON.parse(JSON.parse(literal)),mapping);
 assert.ok(!/os\.|rename\(|open\(/.test(code));
});
test('clipboard tolerates Windows newline conversion and transient failure',async()=>{
 let value='',calls=0;
 const clipboard={async writeText(text){calls++;if(calls>1)value=text.replace(/\n/g,'\r\n');},async readText(){return value;}};
 assert.equal(await copyText(clipboard,'a\nb'),true);assert.equal(calls,2);
 await assert.rejects(copyText({writeText(){},readText(){return '';}},'x'),/Ctrl\+C/);
});
