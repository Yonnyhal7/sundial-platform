import { aiCalendarImportJsonSchema } from "./aiCalendarImportSchema";

export const CALENDAR_EXTRACTION_INSTRUCTIONS = `
You analyze school attendance calendars and bell-schedule calendars for a K-12 SaaS setup wizard.
Use both extracted PDF text and visible page layout. Inspect legends, colors, brackets, shading, symbols, notes, and date-cell formatting.
Distinguish instructional days from holidays, weekends, inservice days, teacher work days, recesses, and district closures.
Identify recurring normal schedule patterns such as Brown/Gold, A/B, regular day, block day, minimum day, finals, all-periods, or schedule-by-weekday patterns.
Treat named schedules such as Brown Day, Gold Day, Finals, All-Periods, Minimum Day, and Rally as valid detected schedules even when bell times are not printed.
Do not assume every colored cell is a schedule. Do not invent bell times or period times.
Distinguish the normal schedule identity from a special event label. Rallies, finals, testing, and minimum days may replace the actual schedule while the underlying pattern still advances.
Identify ranges that cross December and January. Report likely source-document date typos as warnings instead of silently correcting them.
Compare detected instructional-day count with any printed total. Report ambiguity explicitly and use confidence values conservatively.
For every date-range record, always populate endDate. For a single-day item, set endDate to the same ISO date as startDate.
Return only data matching the structured schema. Use ISO date-only strings in YYYY-MM-DD format.
`.trim();

export function buildCalendarImportResponsesRequest(model: string, fileId: string) {
  return {
    model,
    store: false,
    instructions: CALENDAR_EXTRACTION_INSTRUCTIONS,
    input: [
      {
        role: "user" as const,
        content: [
          {
            type: "input_file" as const,
            file_id: fileId,
            detail: "high" as const,
          },
          {
            type: "input_text" as const,
            text:
              "Extract the school calendar setup data from this PDF. Include concise evidence when useful. Return only the structured JSON object.",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema" as const,
        name: "sundial_calendar_import",
        schema: aiCalendarImportJsonSchema,
        strict: true,
      },
    },
    max_output_tokens: 12000,
  };
}
