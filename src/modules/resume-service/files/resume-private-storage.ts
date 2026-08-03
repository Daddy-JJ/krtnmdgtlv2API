import{randomUUID}from'node:crypto';
import{mkdir,readFile,unlink,writeFile}from'node:fs/promises';
import{extname,resolve,sep}from'node:path';

export class ResumePrivateStorage{
  readonly #root:string;
  constructor(root:string){this.#root=resolve(root);}
  async write(userId:string,requestId:string,role:string,original:string,content:Buffer){
    const extension=extname(original).toLowerCase();
    const directory=resolve(this.#root,userId,requestId,role.toLowerCase());
    this.#assertInside(directory);await mkdir(directory,{recursive:true});
    const stored=`${randomUUID()}${extension}`,path=resolve(directory,stored);this.#assertInside(path);
    await writeFile(path,content,{flag:'wx',mode:0o640});
    return{storedFilename:stored,storagePath:path};
  }
  async read(path:string){const safe=resolve(path);this.#assertInside(safe);return readFile(safe);}
  async remove(path:string){const safe=resolve(path);this.#assertInside(safe);try{await unlink(safe);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  #assertInside(path:string){if(path!==this.#root&&!path.startsWith(`${this.#root}${sep}`))throw new Error('Invalid private storage path.');}
}
