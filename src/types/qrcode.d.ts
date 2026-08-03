declare module 'qrcode' {
  export type ToBufferOptions = Readonly<{
    type: 'png';
    width: number;
    errorCorrectionLevel: 'M';
    margin: number;
    color: Readonly<{ dark: string; light: string }>;
  }>;
  const QRCode: { toBuffer(payload: string, options: ToBufferOptions): Promise<Buffer> };
  export default QRCode;
}
