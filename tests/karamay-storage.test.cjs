const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync('GoogleAppsScript.gs', 'utf8');
const files = new Map();
let nextId = 0, failAt = 0, sheetReads = 0;
const folder = {getId: () => 'folder', getFilesByName(name) {
  const matches = [...files.values()].filter(file => !file.trashed && file.getBlob().name === name);
  return {hasNext: () => matches.length > 0, next: () => matches.shift()};
}, createFile(blob) {
  if (++nextId === failAt) throw Error('Drive quota');
  const id = String(nextId);
  const file = {getId: () => id, getBlob: () => blob, setTrashed(value) {this.trashed = value;}};
  files.set(id, file); return file;
}};
const properties = new Map();
const ctx = vm.createContext({
  PropertiesService: {getScriptProperties: () => ({getProperty: key => properties.get(key), setProperty: (key,value) => properties.set(key,value)})},
  DriveApp: {createFolder: () => folder, getFolderById: () => folder, getFileById: id => {if (!files.has(id)) throw Error('Missing file'); return files.get(id);}},
  Utilities: {DigestAlgorithm: {SHA_256:'sha256'}, computeDigest: (algorithm, text) => [...crypto.createHash(algorithm).update(text).digest()], base64Decode: text => [...Buffer.from(text,'base64')], base64Encode: bytes => Buffer.from(bytes).toString('base64'), newBlob: (bytes,type,name) => ({getBytes: () => bytes, getContentType: () => type, name})},
  SpreadsheetApp: {flush() {}}, Logger: {log() {}}
});
vm.runInContext(source,ctx);
ctx.getKaramayAttachmentDataMeta = () => {sheetReads++; throw Error('Legacy sheet should not be accessed');};
const data = 'data:application/pdf;base64,' + Buffer.alloc(200000, 65).toString('base64');
const input = [{file_name:'death.pdf',file_data:data},{file_name:'id.pdf',file_data:data}];
const staged = ctx.stageKaramayAttachmentsInDrive('KRM-1', input);
assert.ok(JSON.stringify(staged.attachments).length < 1000);
assert.equal(ctx.hydrateKaramayAttachments(staged.attachments)[0].file_data, data);
assert.equal(ctx.hydrateKaramayAttachments(input)[1].file_data, data);
assert.equal(sheetReads,0);
const countBeforeRetry = nextId;
const repeated = ctx.stageKaramayAttachmentsInDrive('KRM-1', input);
assert.equal(nextId, countBeforeRetry);
assert.equal(repeated.attachments[0].drive_file_id, staged.attachments[0].drive_file_id);
const oldFile = folder.createFile(ctx.Utilities.newBlob([65], 'application/pdf', 'old-naming.pdf'));
const trustedOld = [{document_type:'Death Certificate', file_name:'old.pdf', storage:'drive', drive_file_id:oldFile.getId(), file_data:'data:application/pdf;base64,QQ=='}];
const oldCount = nextId;
const reusedOld = ctx.stageKaramayAttachmentsInDrive('KRM-historical', trustedOld, trustedOld);
assert.equal(nextId,oldCount);
assert.equal(reusedOld.attachments[0].drive_file_id,oldFile.getId());
const changed = ctx.stageKaramayAttachmentsInDrive('KRM-1', [input[0], {...input[1], file_data:'data:application/pdf;base64,Qg=='}]);
assert.equal(nextId, oldCount + 1);
assert.equal(changed.attachments[0].drive_file_id, staged.attachments[0].drive_file_id);
assert.notEqual(changed.attachments[1].drive_file_id, staged.attachments[1].drive_file_id);
assert.throws(() => ctx.stageKaramayAttachmentsInDrive('KRM-2',[{storage:'drive',drive_file_id:'foreign'}]), /upload/);
const legacy = {rows:[[],['old','KRM-old','','','','',1,'TAIL'],['old','KRM-old','','','','',0,'data:HEAD']],headerLookup:{storageid:0,chunkindex:6,chunkdata:7}};
assert.equal(ctx.hydrateKaramayAttachments([{storage_id:'old'}],legacy)[0].file_data,'data:HEADTAIL');
failAt=nextId+2;
assert.throws(() => ctx.stageKaramayAttachmentsInDrive('KRM-failed',input), /Drive quota/);
assert.equal(files.get(String(failAt-1)).trashed,true);
assert.equal(files.get(staged.attachments[0].drive_file_id).trashed,undefined);
failAt=0;
ctx.withScriptLock=fn=>fn();
ctx.getSheetMetadata=()=>({rows:[[]],headers:[],headerLookup:{}});
ctx.findRowByValue=()=>null;
let saved;
ctx.appendObjectRow=(sheet,meta,row)=>{saved=row;};
const payload={request_id:'KRM-new',branchid:'1',memberName:'Member',memberAddress:'Address',dateOfDeath:'2026-09-01',intermentDate:'2026-09-05',beneficiaryName:'Beneficiary',relationship:'Child',beneficiaryAddress:'Address',contactNumber:'123',attachments:input};
assert.equal(ctx.createKaramayClaim(payload).success,true);
assert.ok(saved.Attachments.length<1000);
assert.equal(sheetReads,0);
ctx.canAccessBranch=()=>false;
ctx.findRowByValue=()=>({row:[]});
const before=nextId;
assert.equal(ctx.getKaramayClaimAttachments('KRM-new',{}).code,'FORBIDDEN');
assert.equal(nextId,before);
console.log('PASS: retry reuse, unchanged-edit reuse, replacement isolation, private Drive staging, large-file round trip, legacy reads, reference rejection, failed-stage cleanup, new claim save without chunk-sheet access, branch access denial.');
