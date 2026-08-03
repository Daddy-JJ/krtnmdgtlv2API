import { AppError } from '../../../shared/http/errors.ts';
import type { PlanCapabilityService } from '../../plans/plan-capability-service.ts';
import type { CardRepository, ThemeOption } from '../repositories/card-repository.ts';
import type { CardResponse } from './card-service.ts';
import type { CustomSlugService, SlugSuggestion } from './custom-slug-service.ts';

export class CardCustomizationService {
  readonly #repository: CardRepository; readonly #slugs: CustomSlugService; readonly #capabilities: PlanCapabilityService; readonly #appUrl:string;
  constructor(deps:{repository:CardRepository;slugs:CustomSlugService;capabilities:PlanCapabilityService;appUrl:string}){this.#repository=deps.repository;this.#slugs=deps.slugs;this.#capabilities=deps.capabilities;this.#appUrl=deps.appUrl.replace(/\/$/,'');}
  suggest(fullName:string,mobilePhone:string):SlugSuggestion{return this.#slugs.suggest(fullName,mobilePhone);}
  async availability(value:string,excludePublicId?:string){const slug=this.#slugs.normalize(value);return {slug,available:await this.#repository.isSlugAvailable(slug,excludePublicId),alternatives:this.#slugs.alternatives(slug)};}
  async updateSlug(userId:string,cardId:string,value:string):Promise<CardResponse>{const card=await this.#owned(userId,cardId);await this.#capabilities.assertEnabled(card.planCode,'custom_slug_enabled');const slug=this.#slugs.normalize(value);if(!await this.#repository.isSlugAvailable(slug,cardId))throw new AppError(409,'SLUG_UNAVAILABLE','The custom URL is unavailable.');try{const updated=await this.#repository.updateOwnedSlug(userId,cardId,slug,new Date());if(!updated)throw this.#notFound();return this.#response(updated);}catch(error){if(this.#duplicate(error))throw new AppError(409,'SLUG_UNAVAILABLE','The custom URL is unavailable.');throw error;}}
  async catalog(userId:string):Promise<ThemeOption[]>{const plan=await this.#repository.findEffectivePlan(userId);if(!plan)throw new AppError(403,'PAID_ENTITLEMENT_REQUIRED','An active Basic or Pro subscription is required.');return this.#repository.listThemes(plan);}
  async cardThemes(userId:string,cardId:string):Promise<ThemeOption[]>{const card=await this.#owned(userId,cardId);return this.#repository.listThemes(card.planCode);}
  async updateTheme(userId:string,cardId:string,themeCode:string):Promise<CardResponse>{await this.#owned(userId,cardId);const result=await this.#repository.updateOwnedTheme(userId,cardId,themeCode,new Date());if(result===null)throw this.#notFound();if(result==='forbidden')throw new AppError(409,'THEME_NOT_ALLOWED','The theme is not available for the current plan.');return this.#response(result);}
  async #owned(userId:string,cardId:string){const card=await this.#repository.findOwned(userId,cardId);if(!card)throw this.#notFound();return card;}
  #response(card:Awaited<ReturnType<CardRepository['findOwned']>> & {}):CardResponse{const{id:_,logoPath,...data}=card;return{...data,canonicalUrl:`${this.#appUrl}/${card.slug}`,qrImageUrl:`/api/v1/public/cards/${encodeURIComponent(card.slug)}/qr`,logoUrl:card.planCode==='pro'&&logoPath?`/api/v1/public/cards/${encodeURIComponent(card.slug)}/logo`:null};}
  #notFound(){return new AppError(404,'CARD_NOT_FOUND','Card not found.');}
  #duplicate(error:unknown){return !!error&&typeof error==='object'&&((error as{code?:unknown}).code==='ER_DUP_ENTRY'||(error as{errno?:unknown}).errno===1062);}
}
