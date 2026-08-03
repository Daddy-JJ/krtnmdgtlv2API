declare module 'midtrans-client' {
  type MidtransOptions = { isProduction: boolean; serverKey: string; clientKey: string };
  type TransactionApi = { status(orderId: string): Promise<Record<string, unknown>> };
  class Snap {
    constructor(options: MidtransOptions);
    transaction: TransactionApi;
    createTransaction(parameters: Record<string, unknown>): Promise<{ token?: unknown; redirect_url?: unknown }>;
  }
  const Midtrans: { Snap: typeof Snap };
  export default Midtrans;
}
