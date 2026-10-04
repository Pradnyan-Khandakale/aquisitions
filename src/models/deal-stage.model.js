import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { acquisitions } from './acquisition.model.js';

export const deal_stages = pgTable('deal_stages', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
  sequence: integer('sequence').default(0).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const dealStagesRelations = relations(deal_stages, ({ many }) => ({
  acquisitions: many(acquisitions),
}));

export { deal_stages as dealStages };
