import "server-only";

import { z } from "zod";

export const SessionCreateSchema = z.object({
  siteId: z.string().min(1).max(100),
});

export const LogsSchema = z.object({
  sessionId: z.string().uuid(),
  events: z
    .array(
      z.object({
        type: z.string().min(1).max(100),
        meta: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const ChatSchema = z.object({
  sessionId: z.string().uuid(),
  userText: z.string().min(1).max(4000),
});

export const TtsSchema = z.object({
  sessionId: z.string().uuid(),
  text: z.string().min(1).max(4000),
});


