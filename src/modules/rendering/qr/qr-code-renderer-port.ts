export type QrRenderOptions=Readonly<{width:number;errorCorrectionLevel:'M';margin:number;dark:string;light:string}>;
export interface QrCodeRendererPort{renderPng(payload:string,options:QrRenderOptions):Promise<Buffer>;}
