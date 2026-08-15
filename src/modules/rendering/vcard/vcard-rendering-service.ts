import type { CardResponse } from '../../cards/services/card-service.ts';

const crlf = '\r\n';
function escape(value:string):string{return value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
function fold(line:string):string{const parts:string[]=[];let current='';let bytes=0;for(const character of line){const size=Buffer.byteLength(character,'utf8');const limit=parts.length===0?75:74;if(bytes+size>limit){parts.push(current);current=character;bytes=size;}else{current+=character;bytes+=size;}}parts.push(current);return parts.map((part,index)=>index===0?part:` ${part}`).join(crlf);}
function property(name:string,value:string):string{return fold(`${name}:${escape(value)}`);}
function structuredProperty(name:string,components:string[]):string{return fold(`${name}:${components.map((component)=>escape(component)).join(';')}`);}
function splitName(fullName:string):{family:string;given:string;additional:string;prefix:string;suffix:string}{
  const value=fullName.trim().replace(/\s+/g,' ');
  if(!value)return {family:'',given:'',additional:'',prefix:'',suffix:''};
  const comma=value.indexOf(',');
  if(comma>=0)return {family:value.slice(0,comma).trim(),given:value.slice(comma+1).trim(),additional:'',prefix:'',suffix:''};
  const parts=value.split(' ');
  return {family:parts.slice(1).join(' '),given:parts[0]??'',additional:'',prefix:'',suffix:''};
}
function addressComponents(addressText:string):string[]{
  const value=addressText.trim();
  if(!value)return ['','','','','',''];
  const parts=value.includes('\n')?value.split(/\r?\n/):value.split('|');
  const normalized=parts.map((part)=>part.trim());
  if(normalized.length===1)return ['','',normalized[0]??'','','',''];
  return ['', '', normalized[0]??'', normalized[1]??'', normalized[2]??'', normalized[3]??'', normalized[4]??''];
}

export class VCardRenderingService {
  render(card:CardResponse):Buffer{
    const contact=card.contact;
    const name=splitName(contact.fullName);
    const lines=['BEGIN:VCARD','VERSION:3.0',property('FN',contact.fullName),structuredProperty('N',[name.family,name.given,name.additional,name.prefix,name.suffix]),property('TITLE',contact.jobTitle),property('ORG',contact.organization),property('TEL;TYPE=WORK,VOICE',contact.officePhone),property('TEL;TYPE=CELL,VOICE',contact.mobilePhone),property('EMAIL;TYPE=INTERNET',contact.email),property('URL',contact.websiteUrl),structuredProperty('ADR;TYPE=WORK',addressComponents(contact.addressText)),'END:VCARD'];
    return Buffer.from(`${lines.join(crlf)}${crlf}`,'utf8');
  }
  filename(slug:string):string{return `${slug.replace(/[^a-zA-Z0-9-]/g,'-').slice(0,100)||'contact'}.vcf`;}
}
