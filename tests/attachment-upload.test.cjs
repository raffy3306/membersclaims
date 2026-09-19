const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const limit = 2 * 1024 * 1024;
const backend = vm.createContext({Utilities:{base64Decode:text=>Buffer.from(text,'base64')},Logger:{log(){}}});
vm.runInContext(fs.readFileSync('GoogleAppsScript.gs','utf8'),backend);
function attachment(size) {return {file_name:'test.pdf',file_size:1,file_data:'data:application/pdf;base64,'+Buffer.alloc(size,65).toString('base64')};}
assert.equal(backend.decodeClaimAttachment(attachment(limit),false).bytes.length,limit);
assert.throws(()=>backend.decodeClaimAttachment(attachment(limit+1),false),/2 MB/);
assert.throws(()=>backend.stageKaramayAttachmentsInDrive('KRM', [attachment(limit+1)]),/2 MB/);
assert.equal(backend.createRequest({attachments:[attachment(limit+1)]}).success,false);
assert.equal(backend.editRequest({attachments:[attachment(limit+1)]}).success,false);
assert.equal(backend.validateHospitalizationAttachments([attachment(123)])[0].file_size,123);
assert.throws(()=>backend.decodeClaimAttachment({file_data:'data:application/pdf;base64,AA=A'},false),/Invalid/);
assert.equal(backend.decodeClaimAttachment(attachment(limit+1),true).bytes.length,limit+1);

const app=fs.readFileSync('app.js','utf8');
let revoked=0, encodes=0, compressedSize=100000, imageError=false;
const frontend=vm.createContext({
 URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){revoked++;}},
 Image:class {naturalWidth=4000;naturalHeight=3000;set src(value){if(imageError)this.onerror();else this.onload();}},
 document:{createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toBlob(callback,type,quality){encodes++;assert.equal(type,'image/jpeg');assert.ok(quality>=0.75);callback({size:compressedSize,type});}})}
});
vm.runInContext(app.slice(app.indexOf('const MAX_CLAIM_ATTACHMENT_BYTES'),app.indexOf('function getKaramayAttachmentDocumentType')),frontend);
frontend.readFileAsDataUrl=async file=>'data:'+file.type+';base64,QQ==';
(async()=>{
 const photo=await frontend.prepareClaimAttachment({name:'scan.png',type:'image/png',size:5000000});
 assert.equal(photo.file_size,100000);assert.equal(photo.file_type,'image/jpeg');assert.equal(photo.file_name,'scan.jpg');assert.equal(revoked,1);
 const pdf=await frontend.prepareClaimAttachment({name:'scan.pdf',type:'application/pdf',size:limit});assert.equal(pdf.file_size,limit);
 await assert.rejects(frontend.prepareClaimAttachment({name:'large.pdf',type:'application/pdf',size:limit+1}),/2 MB/);
 assert.equal(encodes,1);
 compressedSize=6000000;
 await assert.rejects(frontend.prepareClaimAttachment({name:'large.jpg',type:'image/jpeg',size:5000000}),/2 MB/);
 assert.equal(revoked,2);
 compressedSize=100000;
 const small=await frontend.prepareClaimAttachment({name:'small.png',type:'image/png',size:1000});assert.equal(small.file_name,'small.png');assert.equal(small.file_size,1000);
 imageError=true;
 await assert.rejects(frontend.prepareClaimAttachment({name:'bad.jpg',type:'image/jpeg',size:1000}),/Cannot read/);
 assert.equal(revoked,4);
 await assert.rejects(frontend.prepareClaimAttachment({name:'empty.pdf',type:'application/pdf',size:0}),/empty/);
 console.log('PASS: exact 2 MB boundary, forged size rejection, both backend claim paths, legacy exemption, photo compression metadata, smaller-original retention, PDF passthrough, oversized/corrupt/empty files, object URL cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
