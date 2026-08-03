export interface MailerPort {
  sendRegistrationOtp(email: string, code: string, expiryMinutes: number): Promise<void>;
  sendPasswordReset(email: string, resetUrl: string): Promise<void>;
}
