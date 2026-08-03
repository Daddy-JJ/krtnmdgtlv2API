import type { Request, Response } from 'express';
import { z } from 'zod';
import { readCookie } from '../../../shared/http/cookie-reader.ts';
import { AppError } from '../../../shared/http/errors.ts';
import type { AuthenticatedActorService } from '../../../shared/security/authenticated-actor.ts';
import { cardInputSchema } from '../dto/card-input.ts';
import type { CardService } from '../services/card-service.ts';

const publicIdSchema = z.uuid();
export class CardController {
  readonly #service: CardService; readonly #actors: AuthenticatedActorService;
  constructor(service: CardService, actors: AuthenticatedActorService) { this.#service = service; this.#actors = actors; }
  list = async (req: Request, res: Response): Promise<void> => { const actor = this.#safe(req); res.json({ success: true, message: 'Cards retrieved.', data: await this.#service.list(actor.userPublicId) }); };
  get = async (req: Request, res: Response): Promise<void> => { const id = this.#id(req); const actor = this.#safe(req); res.json({ success: true, message: 'Card retrieved.', data: await this.#service.get(actor.userPublicId, id) }); };
  create = async (req: Request, res: Response): Promise<void> => { const actor = this.#unsafe(req); const data = this.#input(req); res.status(201).json({ success: true, message: 'Card created.', data: await this.#service.create(actor.userPublicId, data) }); };
  update = async (req: Request, res: Response): Promise<void> => { const id = this.#id(req); const actor = this.#unsafe(req); const data = this.#input(req); res.json({ success: true, message: 'Card updated.', data: await this.#service.update(actor.userPublicId, id, data) }); };
  delete = async (req: Request, res: Response): Promise<void> => { const id = this.#id(req); const actor = this.#unsafe(req); await this.#service.delete(actor.userPublicId, id); res.json({ success: true, message: 'Card deleted.' }); };
  publish = async (req:Request,res:Response):Promise<void>=>{const id=this.#id(req);const actor=this.#unsafe(req);res.json({success:true,message:'Card published.',data:await this.#service.publish(actor.userPublicId,id)});};
  publicCard = async(req:Request,res:Response):Promise<void>=>{const slug=typeof req.params.slug==='string'?req.params.slug:'';res.json({success:true,message:'Published card retrieved.',data:await this.#service.publicCard(slug)});};
  #safe(req: Request) { return this.#actors.authenticate(readCookie(req, 'access_token') ?? undefined); }
  #unsafe(req: Request) { return this.#actors.authorizeUnsafe(readCookie(req, 'access_token') ?? undefined, req.header('x-csrf-token')); }
  #id(req: Request): string { const parsed = publicIdSchema.safeParse(req.params.publicId); if (!parsed.success) throw this.#validation(parsed.error.issues); return parsed.data; }
  #input(req: Request) { const parsed = cardInputSchema.safeParse(req.body); if (!parsed.success) throw this.#validation(parsed.error.issues); return parsed.data; }
  #validation(issues: readonly { path: PropertyKey[]; message: string }[]) { return new AppError(422, 'VALIDATION_ERROR', 'Validation failed.', issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }))); }
}
