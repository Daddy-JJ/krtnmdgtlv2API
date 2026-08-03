import { randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/http/errors.ts';
import type { CardInput } from '../dto/card-input.ts';
import type { CardRepository, OwnedCard } from '../repositories/card-repository.ts';
import type { PlanCapabilityService } from '../../plans/plan-capability-service.ts';
import type { CardContentRepository, CatalogItem, SocialLink } from '../../card-content/repositories/card-content-repository.ts';

export type CardResponse = Omit<OwnedCard, 'id'|'logoPath'> & { canonicalUrl: string; qrImageUrl: string; logoUrl:string|null; whatsappUrl?: string | null };
export type PublicCardResponse = CardResponse & { socialLinks: SocialLink[]; catalogItems: CatalogItem[] };

export class CardService {
  readonly #repository: CardRepository;
  readonly #appUrl: string;
  readonly #requireHttpsUrls: boolean;
  readonly #capabilities:PlanCapabilityService|undefined;
  readonly #content:CardContentRepository|undefined;
  constructor(dependencies: { repository: CardRepository; appUrl: string; requireHttpsUrls?: boolean;capabilities?:PlanCapabilityService;content?:CardContentRepository }) {
    this.#repository = dependencies.repository;
    this.#appUrl = dependencies.appUrl.replace(/\/$/, '');
    this.#requireHttpsUrls = dependencies.requireHttpsUrls ?? false;
    this.#capabilities=dependencies.capabilities;
    this.#content=dependencies.content;
  }

  async list(userPublicId: string): Promise<CardResponse[]> { return (await this.#repository.listOwned(userPublicId)).map((card) => this.#response(card)); }
  async get(userPublicId: string, publicId: string): Promise<CardResponse> {
    const card = await this.#repository.findOwned(userPublicId, publicId);
    if (!card) throw this.#notFound();
    return this.#response(card);
  }
  async create(userPublicId: string, data: CardInput): Promise<CardResponse> {
    this.#validate(data);
    const normalized={locale:data.locale??'id',contact:{...data.contact,mapsUrl:data.contact.mapsUrl??null}};
    const card = await this.#repository.transaction(async (transaction) => {
      const user = await transaction.findEntitledUserForUpdate(userPublicId);
      if (!user) throw new AppError(403, 'PAID_ENTITLEMENT_REQUIRED', 'An active Basic or Pro subscription is required.');
      if (await transaction.userHasActiveCard(user.id)) throw new AppError(409, 'PLAN_LIMIT_REACHED', 'The account already has an active card.');
      if(normalized.contact.mapsUrl)await this.#assertMaps(user.planCode);const theme = await transaction.findDefaultTheme(user.planCode);
      if (!theme) throw new AppError(503, 'THEME_UNAVAILABLE', 'No active theme is available for the current plan.');
      const slug = await this.#allocateSlug(transaction, randomUUID().replaceAll('-', '').slice(0, 16));
      return transaction.insertOwnedCard({ publicId: randomUUID(), userId: user.id, planCode: user.planCode, themeId: theme.id, slug, data:normalized, now: new Date() });
    });
    return this.#response(card);
  }
  async update(userPublicId: string, publicId: string, data: CardInput): Promise<CardResponse> {
    this.#validate(data);
    const normalized={locale:data.locale??'id',contact:{...data.contact,mapsUrl:data.contact.mapsUrl??null}};const current=await this.#repository.findOwned(userPublicId,publicId);if(!current)throw this.#notFound();if(normalized.contact.mapsUrl)await this.#assertMaps(current.planCode);
    const card = await this.#repository.updateOwned(userPublicId, publicId, normalized, new Date());
    if (!card) throw this.#notFound();
    return this.#response(card);
  }
  async delete(userPublicId: string, publicId: string): Promise<void> {
    if (!await this.#repository.softDeleteOwned(userPublicId, publicId, new Date())) throw this.#notFound();
  }
  async publish(userPublicId:string,publicId:string):Promise<CardResponse>{const card=await this.#repository.publishOwned(userPublicId,publicId,new Date());if(!card)throw this.#notFound();return this.#response(card);}
  async publicCard(slug:string):Promise<PublicCardResponse>{if(slug.length<3||slug.length>100)throw this.#notFound();const card=await this.#repository.findPublished(slug);if(!card)throw this.#notFound();const response=this.#response(card);if(!this.#content||!this.#capabilities)return{...response,socialLinks:[],catalogItems:[]};const[socialLimit,catalogLimit]=await Promise.all([this.#capabilities.getLimit(card.planCode,'social_link_limit'),this.#capabilities.getLimit(card.planCode,'catalog_item_limit')]);const[socialLinks,catalogItems]=await Promise.all([this.#content.listPublishedSocial(slug,socialLimit),this.#content.listPublishedCatalog(slug,catalogLimit)]);return{...response,socialLinks,catalogItems};}
  async #allocateSlug(transaction: Parameters<Parameters<CardRepository['transaction']>[0]>[0], candidate: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const slug = attempt === 0 ? candidate : `${candidate}-${attempt}`;
      if (!await transaction.slugExists(slug)) return slug;
    }
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'A unique card URL could not be allocated.');
  }
  #validate(data: CardInput): void {
    if (this.#requireHttpsUrls && !data.contact.websiteUrl.startsWith('https://')) throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed.');
  }
  async #assertMaps(plan:string){if(!this.#capabilities)throw new AppError(500,'CAPABILITY_CONFIG_INVALID','Plan capability configuration is invalid.');await this.#capabilities.assertEnabled(plan,'maps_enabled');}
  #response(card: OwnedCard): CardResponse { const { id: _id,logoPath, ...data } = card;const digits=card.contact.mobilePhone.replace(/\D/g,'').replace(/^0/,'62'); return { ...data, canonicalUrl: `${this.#appUrl}/${card.slug}`, qrImageUrl: `/api/v1/public/cards/${encodeURIComponent(card.slug)}/qr`,logoUrl:card.planCode==='pro'&&logoPath?`/api/v1/public/cards/${encodeURIComponent(card.slug)}/logo`:null,whatsappUrl:card.planCode==='pro'&&digits?`https://wa.me/${digits}`:null }; }
  #notFound(): AppError { return new AppError(404, 'CARD_NOT_FOUND', 'Card not found.'); }
}
