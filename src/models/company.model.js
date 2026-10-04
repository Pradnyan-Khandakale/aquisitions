import { pgTable, serial, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { acquisitions } from './acquisition.model.js';

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  description: text('description'),
  industry: varchar('industry', { length: 100 }),
  website: varchar('website', { length: 255 }),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const companiesRelations = relations(companies, ({ many }) => ({
  acquisitions: many(acquisitions),
}));
