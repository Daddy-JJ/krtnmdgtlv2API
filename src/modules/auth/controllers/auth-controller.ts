import type { Request, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../../../shared/http/errors.ts';
import { readCookie } from '../../../shared/http/cookie-reader.ts';
import type { CookiePolicy } from '../../../shared/security/cookie-policy.ts';
import { forgotPasswordInputSchema, loginInputSchema, registerInputSchema, resendOtpInputSchema, resetPasswordInputSchema, verifyOtpInputSchema } from '../dto/auth-inputs.ts';
import type { AuthService } from '../services/auth-service.ts';

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed.', result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  }
  return result.data;
}

export class AuthController {
  readonly #service: AuthService;
  readonly #cookies: CookiePolicy;
  constructor(service: AuthService, cookies: CookiePolicy) { this.#service = service; this.#cookies = cookies; }

  register = async (request: Request, response: Response): Promise<void> => {
    const input = parse(registerInputSchema, request.body);
    await this.#service.register(input.email, input.password, request.ip ?? 'unknown');
    response.status(201).json({ success: true, message: 'Registration accepted. Check your email for verification.', data: null });
  };

  verifyOtp = async (request: Request, response: Response): Promise<void> => {
    const input = parse(verifyOtpInputSchema, request.body);
    await this.#service.verifyEmailOtp(input.email, input.code);
    response.json({ success: true, message: 'Email verified.', data: null });
  };

  resendOtp = async (request: Request, response: Response): Promise<void> => {
    const input = parse(resendOtpInputSchema, request.body);
    await this.#service.resendOtp(input.email, request.ip ?? 'unknown');
    response.status(202).json({ success: true, message: 'If the address is eligible, a code will be sent.', data: null });
  };

  login = async (request: Request, response: Response): Promise<void> => {
    const input = parse(loginInputSchema, request.body);
    const session = await this.#service.login(input.email, input.password, request.ip ?? 'unknown');
    this.#setSession(response, session);
    response.json({ success: true, message: 'Authenticated.', data: { user: session.user } });
  };

  refresh = async (request: Request, response: Response): Promise<void> => {
    const refreshToken = readCookie(request, 'refresh_token');
    const csrfToken = request.header('x-csrf-token');
    if (!refreshToken) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    if (!csrfToken) throw new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.');
    const session = await this.#service.refresh(refreshToken, csrfToken);
    this.#setSession(response, session);
    response.json({ success: true, message: 'Session rotated.', data: { user: session.user } });
  };

  csrf = async (request: Request, response: Response): Promise<void> => {
    const accessToken = readCookie(request, 'access_token');
    if (!accessToken) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    const csrfToken = this.#service.issueCsrf(accessToken);
    response.setHeader('Cache-Control', 'no-store');
    response.cookie('csrf_token', csrfToken, this.#cookies.csrf());
    response.json({ success: true, message: 'CSRF token issued.', data: { csrfToken } });
  };

  logout = async (request: Request, response: Response): Promise<void> => {
    const accessToken = readCookie(request, 'access_token');
    const csrfToken = request.header('x-csrf-token');
    if (!accessToken) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.');
    if (!csrfToken) throw new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.');
    await this.#service.logout(accessToken, csrfToken);
    response.clearCookie('access_token', this.#cookies.clear('/api/v1'));
    response.clearCookie('refresh_token', this.#cookies.clear('/api/v1/auth'));
    response.clearCookie('csrf_token', this.#cookies.clear('/', false));
    response.json({ success: true, message: 'Logged out.', data: null });
  };

  forgotPassword = async (request: Request, response: Response): Promise<void> => {
    const input = parse(forgotPasswordInputSchema, request.body);
    await this.#service.forgotPassword(input.email, request.ip ?? 'unknown');
    response.json({ success: true, message: 'If the address is valid, reset instructions will be sent.', data: null });
  };

  resetPassword = async (request: Request, response: Response): Promise<void> => {
    const input = parse(resetPasswordInputSchema, request.body);
    await this.#service.resetPassword(input.token, input.password);
    response.json({ success: true, message: 'Password reset.', data: null });
  };

  #setSession(response: Response, session: { accessToken: string; refreshToken: string; csrfToken: string }): void {
    response.cookie('access_token', session.accessToken, this.#cookies.access());
    response.cookie('refresh_token', session.refreshToken, this.#cookies.refresh());
    response.cookie('csrf_token', session.csrfToken, this.#cookies.csrf());
  }
}
