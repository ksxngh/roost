import { z } from "zod";

/** Chart palette tokens usable as class/tag colors. */
export const COLOR_TOKENS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

const name = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(80, "Name must be at most 80 characters");

const id = z.string().min(1).max(64);
const color = z.enum(COLOR_TOKENS);

export const createClassSchema = z.object({
  name,
  color: color.default("chart-1"),
});

export const renameSchema = z.object({ id, name });

export const createFolderSchema = z.object({
  name,
  classId: id.nullish(),
  parentId: id.nullish(),
});

export const moveFolderSchema = z.object({
  id,
  parentId: id.nullish(),
  classId: id.nullish(),
});

export const moveDocumentSchema = z.object({
  id,
  folderId: id.nullish(),
  classId: id.nullish(),
});

export const createTagSchema = z.object({
  name,
  color: color.default("chart-2"),
});

export const documentFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  classId: id.optional(),
  folderId: id.optional(),
  tagId: id.optional(),
  favorite: z.boolean().optional(),
  /** Archived documents are hidden unless explicitly requested. */
  archived: z.boolean().default(false),
  /** Soft-deleted documents live in the trash view. */
  deleted: z.boolean().default(false),
  cursor: id.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type CreateTagInput = z.infer<typeof createTagSchema>;
export type DocumentFilter = z.infer<typeof documentFilterSchema>;
