import type { AdminDataResource } from '../resources/admin-data-resources.ts';

export type AdminDataColumn = Readonly<{
  name: string;
  dataType: string;
  columnType: string;
  nullable: boolean;
  primary: boolean;
  autoIncrement: boolean;
  generated: boolean;
  hasDefault: boolean;
  maximumLength: number | null;
  sensitive: boolean;
  insertable: boolean;
  updatable: boolean;
}>;

export type AdminDataSchema = Readonly<{
  resource: AdminDataResource;
  primaryKey: readonly string[];
  identifierFormat: string;
  columns: readonly AdminDataColumn[];
}>;

export type AdminDataListInput = Readonly<{
  page: number;
  limit: number;
  sort?: string;
  order: 'asc' | 'desc';
  search?: string;
  filters: Readonly<Record<string, string>>;
}>;

export type AdminDataAudit = Readonly<{
  actorPublicId: string;
  requestId: string | null;
}>;

export type AdminDataListResult = Readonly<{
  items: readonly Record<string, unknown>[];
  pagination: Readonly<{ page: number; limit: number; total: number; pages: number }>;
}>;

export interface AdminDataRepository {
  catalog(): Promise<readonly AdminDataSchema[]>;
  list(resource: AdminDataResource, input: AdminDataListInput): Promise<AdminDataListResult>;
  get(resource: AdminDataResource, identifier: string): Promise<Record<string, unknown>>;
  create(resource: AdminDataResource, input: Record<string, unknown>, audit: AdminDataAudit): Promise<Record<string, unknown>>;
  update(resource: AdminDataResource, identifier: string, input: Record<string, unknown>, audit: AdminDataAudit): Promise<Record<string, unknown>>;
  delete(resource: AdminDataResource, identifier: string, audit: AdminDataAudit): Promise<Record<string, unknown>>;
}
