import type { CardResponse } from '../../cards/services/card-service.ts';

const crlf = '\r\n';
function escape(value:string):string{return value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
function fold(line:string):string{const parts:string[]=[];let current='';let bytes=0;for(const character of line){const size=Buffer.byteLength(character,'utf8');const limit=parts.length===0?75:74;if(bytes+size>limit){parts.push(current);current=character;bytes=size;}else{current+=character;bytes+=size;}}parts.push(current);return parts.map((part,index)=>index===0?part:` ${part}`).join(crlf);}
function property(name:string,value:string):string{return fold(`${name}:${escape(value)}`);}

export class VCardRenderingService {
  render(card:CardResponse):Buffer{
    const contact=card.contact;
    const lines=['BEGIN:VCARD','VERSION:3.0',property('FN',contact.fullName),property('N',contact.fullName),property('TITLE',contact.jobTitle),property('ORG',contact.organization),property('TEL;TYPE=WORK,VOICE',contact.officePhone),property('TEL;TYPE=CELL,VOICE',contact.mobilePhone),property('EMAIL;TYPE=INTERNET',contact.email),property('URL',contact.websiteUrl),property('ADR;TYPE=WORK',`;;${contact.addressText};;;;`),'END:VCARD'];
    return Buffer.from(`${lines.join(crlf)}${crlf}`,'utf8');
  }
  filename(slug:string):string{return `${slug.replace(/[^a-zA-Z0-9-]/g,'-').slice(0,100)||'contact'}.vcf`;}
}
