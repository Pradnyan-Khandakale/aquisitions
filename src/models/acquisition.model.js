import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './company.model.js';
import { deal_stages } from './deal-stage.model.js';
import { users } from './user.model.js';

export const acquisitions = pgTable(
  'acquisitions',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    deal_stage_id: integer('deal_stage_id')
      .notNull()
      .references(() => deal_stages.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 50 }).notNull().default('active'),
    estimated_value: numeric('estimated_value', { precision: 15, scale: 2 }),
    target_close_date: timestamp('target_close_date'),
    created_by: integer('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    index('acquisitions_company_id_idx').on(table.company_id),
    index('acquisitions_deal_stage_id_idx').on(table.deal_stage_id),
    index('acquisitions_created_by_idx').on(table.created_by),
    index('acquisitions_status_idx').on(table.status),
  ]
);

export const acquisitionsRelations = relations(acquisitions, ({ one }) => ({
  company: one(companies, {
    fields: [acquisitions.company_id],
    references: [companies.id],
  }),
  dealStage: one(deal_stages, {
    fields: [acquisitions.deal_stage_id],
    references: [deal_stages.id],
  }),
  user: one(users, {
    fields: [acquisitions.created_by],
    references: [users.id],
  }),
}));
