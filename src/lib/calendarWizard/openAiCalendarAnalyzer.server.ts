import "server-only";

import OpenAI, { APIError, toFile } from "openai";
import { aiCalendarImportJsonSchema } from "./aiCalendarImportSchema";
import {
  normalizeAiCalendarExtraction,
  type RawAiCalendarExtraction,
} from "./aiCalendarImportNormalizer";
import { createMockAiCalendarImportResult } from "./mockAiCalendarAnalyzer";
import {
  getCalendarImportMode,
  mapOpenAiError,
  openAiResponseHasRefusal,
  openAiResponseIncomplete,
  shouldRetryOpenAiError,
  type CalendarAnalyzerResult,
} from "./openAiCalendarAnalyzerUtils";

export const DEFAULT_OPENAI_CALENDAR_MODEL = "gpt-5";
const ANALYSIS_TIMEOUT_MS = 75_000;

const CALENDAR_EXTRACTION_INSTRUCTIONS = `
You analyze school attendance calendars and bell-schedule calendars for a K-12 SaaS setup wizard.
Use both extracted PDF text and visible page layout. Inspect legends, colors, brackets, shading, symbols, notes, and date-cell formatting.
Distinguish instructional days from holidays, weekends, inservice days, teacher work days, recesses, and district closures.
Identify recurring normal schedule patterns such as Brown/Gold, A/B, regular day, block day, minimum day, finals, all-periods, or schedule-by-weekday patterns.
Do not assume every colored cell is a schedule. Do not invent period start/end times unless they are explicitly printed.
Distinguish the normal schedule identity from a special event label. Rallies, finals, testing, and minimum days may replace the actual schedule while the underlying pattern still advances.
Identify ranges that cross December and January. Report likely source-document date typos as warnings instead of silently correcting them.
Compare detected instructional-day count with any printed total. Report ambiguity explicitly and use confidence values conservatively.
Return only data matching the structured schema. Use ISO date-only strings in YYYY-MM-DD format.
`.trim();

function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function getCalendarModel() {
  return process.env.OPENAI_CALENDAR_MODEL?.trim() || DEFAULT_OPENAI_CALENDAR_MODEL;
}

async function sleepForRetry() {
  await new Promise((resolve) => setTimeout(resolve, 350 + Math.floor(Math.random() * 350)));
}

function parseStructuredOutput(outputText: string): RawAiCalendarExtraction | null {
  try {
    return JSON.parse(outputText) as RawAiCalendarExtraction;
  } catch {
    return null;
  }
}

export async function analyzeCalendarPdf(file: File): Promise<CalendarAnalyzerResult> {
  if (getCalendarImportMode() === "mock") {
    return {
      status: "success",
      importResult: createMockAiCalendarImportResult(),
    };
  }

  const client = getOpenAiClient();
  if (!client) {
    return {
      status: "configuration_error",
      message: "AI calendar import is not configured yet.",
    };
  }

  const model = getCalendarModel();
  const startedAt = Date.now();
  const uploadableFile = await toFile(file, file.name || "calendar.pdf", {
    type: "application/pdf",
  });
  let openAiFileId: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

    try {
      const uploaded = await client.files.create({
        file: uploadableFile,
        purpose: "user_data",
      });
      openAiFileId = uploaded.id;

      const { data: response, request_id: requestId } = await client.responses
        .create(
          {
            model,
            store: false,
            instructions: CALENDAR_EXTRACTION_INSTRUCTIONS,
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_file",
                    file_id: uploaded.id,
                    detail: "high",
                  },
                  {
                    type: "input_text",
                    text:
                      "Extract the school calendar setup data from this PDF. Include concise evidence when useful. Return only the structured JSON object.",
                  },
                ],
              },
            ],
            text: {
              format: {
                type: "json_schema",
                name: "sundial_calendar_import",
                schema: aiCalendarImportJsonSchema,
                strict: true,
              },
            },
            max_output_tokens: 12000,
            temperature: 0,
          },
          { signal: controller.signal }
        )
        .withResponse();

      if (openAiResponseIncomplete(response)) {
        return {
          status: "analysis_failed",
          message: "Sundial read the PDF but could not build a reliable calendar draft. You can try another PDF or continue manually.",
          retryable: true,
        };
      }

      if (openAiResponseHasRefusal(response)) {
        return {
          status: "analysis_failed",
          message: "Sundial read the PDF but could not build a reliable calendar draft. You can try another PDF or continue manually.",
          retryable: true,
        };
      }

      const raw = parseStructuredOutput(response.output_text);
      if (!raw) {
        return {
          status: "analysis_failed",
          message: "Sundial read the PDF but could not build a reliable calendar draft. You can try another PDF or continue manually.",
        };
      }

      const normalized = normalizeAiCalendarExtraction(raw, {
        source: "openai",
        usage: {
          model,
          requestId: requestId || undefined,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
          totalTokens: response.usage?.total_tokens,
          durationMs: Date.now() - startedAt,
        },
      });

      if (!normalized.success) {
        console.warn("AI calendar import validation failed", {
          model,
          requestId,
          durationMs: Date.now() - startedAt,
          errorCount: normalized.errors.length,
        });
        return {
          status: "analysis_failed",
          message: "Sundial read the PDF but could not build a reliable calendar draft. You can try another PDF or continue manually.",
        };
      }

      console.info("AI calendar import completed", {
        model,
        requestId,
        durationMs: Date.now() - startedAt,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        totalTokens: response.usage?.total_tokens,
      });

      return {
        status: "success",
        importResult: normalized.importResult,
      };
    } catch (error) {
      if (shouldRetryOpenAiError(error, attempt)) {
        await sleepForRetry();
        continue;
      }

      console.warn("AI calendar import OpenAI error", {
        model,
        durationMs: Date.now() - startedAt,
        category: error instanceof Error ? error.name : "unknown",
        status: error instanceof APIError ? error.status : undefined,
        requestId: error instanceof APIError ? error.requestID : undefined,
      });
      return mapOpenAiError(error);
    } finally {
      clearTimeout(timeout);
      if (openAiFileId) {
        try {
          await client.files.delete(openAiFileId);
        } catch (deleteError) {
          console.warn("AI calendar import file cleanup failed", {
            fileId: openAiFileId,
            category: deleteError instanceof Error ? deleteError.name : "unknown",
          });
        }
        openAiFileId = null;
      }
    }
  }

  return {
    status: "analysis_failed",
    message: "AI calendar import is temporarily unavailable. Please try again shortly.",
    retryable: true,
  };
}
