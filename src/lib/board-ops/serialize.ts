import type { TaskCardEditableFields } from "@/types/task-node";

import type { CardUpdateFieldsJson } from "./types";

export function serializeCardUpdateFields(fields: Partial<TaskCardEditableFields>): CardUpdateFieldsJson {
  const out: CardUpdateFieldsJson = {};
  if (fields.title !== undefined) out.title = fields.title;
  if (fields.link !== undefined) out.link = fields.link;
  if (fields.description !== undefined) out.description = fields.description;
  if (fields.tags !== undefined) out.tags = [...fields.tags];
  if (fields.dueDate !== undefined) out.dueDate = fields.dueDate ? fields.dueDate.toISOString() : null;
  if (fields.reminderDate !== undefined) {
    out.reminderDate = fields.reminderDate ? fields.reminderDate.toISOString() : null;
  }
  if (fields.effort !== undefined) out.effort = fields.effort;
  if (fields.effortUnit !== undefined) out.effortUnit = fields.effortUnit;
  if (fields.effortSource !== undefined) out.effortSource = fields.effortSource;
  return out;
}
