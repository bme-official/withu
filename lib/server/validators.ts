import "server-only";

import { z } from "zod";

export const SessionCreateSchema = z.object({
  siteId: z.string().min(1).max(100),
  // anonymous per-device user id stored in localStorage (uuid). Optional for backward compatibility.
  userId: z.string().uuid().optional(),
});

export const LogsSchema = z.object({
  sessionId: z.string().uuid(),
  sessionToken: z.string().min(16).max(200),
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
  sessionToken: z.string().min(16).max(200),
  userText: z.string().min(1).max(4000),
  inputMode: z.enum(["voice", "text"]).optional(),
});

export const TtsSchema = z.object({
  sessionId: z.string().uuid(),
  sessionToken: z.string().min(16).max(200),
  text: z.string().min(1).max(4000),
});


