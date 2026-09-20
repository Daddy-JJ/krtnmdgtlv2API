export type SuperAdminRecord = Record<string, unknown>;

export type FeedbackStatus = 'new' | 'in_review' | 'planned' | 'resolved' | 'dismissed';

export type FeedbackListInput = Readonly<{
  page: number;
  limit: number;
  status?: FeedbackStatus | undefined;
  search?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}>;

export type FeedbackListResult = Readonly<{
  items: SuperAdminRecord[];
  pagination: Readonly<{ page: number; limit: number; total: number; pages: number }>;
}>;

export type FeedbackStatusUpdate = Readonly<{
  status: FeedbackStatus;
  reason: string;
}>;

export type CardIntervention = Readonly<{
  action: 'CONNECT_MATCHING_VERIFIED_ACCOUNT' | 'RELEASE_CARD';
  reason: string;
}>;

export type CardInterventionResult = Readonly<{
  action: CardIntervention['action'];
  previousOwnerPublicId: string | null;
  newOwnerPublicId: string | null;
}>;

export type SuperAdminUserDetail = Readonly<{
  identity: SuperAdminRecord;
  subscriptions: SuperAdminRecord[];
  payments: SuperAdminRecord[];
  usage: SuperAdminRecord[];
  resume: SuperAdminRecord[];
  security: SuperAdminRecord[];
  audit: SuperAdminRecord[];
}>;

export type Intervention = Readonly<{
  action: 'SUSPEND_USER' | 'ACTIVATE_USER' | 'GRANT_ROLE' | 'EXTEND_SUBSCRIPTION' | 'RESET_RESUME_ENTITLEMENT';
  reason: string;
  roleCode?: string;
  days?: number;
}>;

export type InterventionResult = Readonly<{
  action: Intervention['action'];
  previousValue: string | null;
  newValue: string | null;
}>;

export interface SuperAdminRepository {
  statistics(): Promise<SuperAdminRecord | undefined>;
  user(publicId: string): Promise<SuperAdminUserDetail | null>;
  card(publicId: string): Promise<SuperAdminRecord | null>;
  specialists(): Promise<SuperAdminRecord[]>;
  subscriptions(): Promise<SuperAdminRecord[]>;
  usage(): Promise<SuperAdminRecord[]>;
  interventions(): Promise<SuperAdminRecord[]>;
  settings(): Promise<SuperAdminRecord[]>;
  feedback(input: FeedbackListInput): Promise<FeedbackListResult>;
  updateFeedbackStatus(actorPublicId: string, publicId: string, input: FeedbackStatusUpdate, correlationId: string | null): Promise<SuperAdminRecord>;
  reports(days: number): Promise<SuperAdminRecord>;
  system(): Promise<SuperAdminRecord>;
  security(): Promise<SuperAdminRecord>;
  intervene(actorPublicId: string, targetPublicId: string, input: Intervention, correlationId: string | null): Promise<InterventionResult>;
  interveneCard(actorPublicId: string, cardPublicId: string, input: CardIntervention, correlationId: string | null): Promise<CardInterventionResult>;
}
