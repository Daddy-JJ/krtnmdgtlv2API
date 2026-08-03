export type PublicPlan = Readonly<{
  code: 'starter' | 'basic' | 'pro';
  name: string;
  price: number;
  durationDays: number;
  features: Record<string, boolean | number | string>;
}>;

export interface PlanCatalogRepository {
  listActivePlans(): Promise<PublicPlan[]>;
}
