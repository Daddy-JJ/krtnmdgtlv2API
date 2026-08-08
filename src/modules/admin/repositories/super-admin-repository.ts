export type SuperAdminRecord = Record<string, unknown>;

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
  specialists(): Promise<SuperAdminRecord[]>;
  subscriptions(): Promise<SuperAdminRecord[]>;
  usage(): Promise<SuperAdminRecord[]>;
  interventions(): Promise<SuperAdminRecord[]>;
  settings(): Promise<SuperAdminRecord[]>;
  intervene(actorPublicId: string, targetPublicId: string, input: Intervention, correlationId: string | null): Promise<InterventionResult>;
}
