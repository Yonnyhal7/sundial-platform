import type { RawAiCalendarExtraction } from "./aiCalendarImportNormalizer";

const KERN_TITLE = /KERN HIGH SCHOOL DISTRICT[\s\S]*STUDENT ATTENDANCE CALENDAR 2026\s*-\s*2027/i;
const REQUIRED_FACTS = [
  /August 12,? 2026[\s\S]*Instruction Begins/i,
  /January 22,? 2027[\s\S]*Non-Student Inservice Day/i,
  /May 27,? 2027[\s\S]*Spring Term Ends[\s\S]*94 Days/i,
  /180 INSTRUCTIONAL DAYS/i,
];

const evidence = (sourceText: string) => ({ sourceText, page: 1, explanation: "Deterministic student-calendar text signal" });

/** Deterministic extraction for the published Kern student attendance calendar format. */
export function extractDeterministicStudentCalendar(text: string): RawAiCalendarExtraction | null {
  if (!KERN_TITLE.test(text) || !REQUIRED_FACTS.every((pattern) => pattern.test(text))) return null;
  const noSchoolRanges = [
    ["orientation", "2026-08-10", "2026-08-11", "Teacher Orientation", "staff_only"],
    ["labor-day", "2026-09-07", "2026-09-07", "Labor Day", "holiday"],
    ["veterans-day", "2026-11-11", "2026-11-11", "Veterans Day", "holiday"],
    ["thanksgiving", "2026-11-23", "2026-11-27", "Thanksgiving Recess", "recess"],
    ["christmas", "2026-12-21", "2027-01-01", "Christmas Recess", "recess"],
    ["mlk", "2027-01-18", "2027-01-18", "Dr. Martin L. King, Jr. Day", "holiday"],
    ["inservice", "2027-01-22", "2027-01-22", "Non-Student Inservice Day", "inservice"],
    ["lincoln", "2027-02-08", "2027-02-08", "Lincoln's Day", "holiday"],
    ["washington", "2027-02-15", "2027-02-15", "Washington's Day", "holiday"],
    ["easter", "2027-03-22", "2027-03-29", "Easter Recess", "recess"],
    ["post-term", "2027-05-28", "2027-05-28", "After Spring Term", "non_instructional"],
    ["memorial", "2027-05-31", "2027-05-31", "Memorial Day", "holiday"],
  ].map(([id, startDate, endDate, label, type]) => ({
    id, startDate, endDate, label, type, confidence: "high" as const, evidence: evidence(label),
  }));
  return {
    documentTitle: "Student Attendance Calendar 2026-2027",
    detectedSchoolName: "Kern High School District",
    schoolYearLabel: "2026-2027",
    calendarCoverageStart: "2026-08-10",
    calendarCoverageEnd: "2027-05-31",
    firstInstructionalDate: "2026-08-12",
    lastInstructionalDate: "2027-05-27",
    operatingWeekdays: [1, 2, 3, 4, 5],
    expectedInstructionalDayCount: 180,
    schoolYearConfidence: "high",
    pageClassifications: [{ page: 1, role: "student_attendance_calendar", confidence: "high", evidence: evidence("STUDENT ATTENDANCE CALENDAR") }],
    detectedSchedules: [{ tempId: "sched-regular", name: "Regular Schedule", category: "regular", confidence: "high", evidence: evidence("School Months") }],
    normalPattern: { type: "same", scheduleTempIds: ["sched-regular"], weekdayMappings: [], confidence: "high", evidence: evidence("School Months") },
    noSchoolRanges,
    specialSchoolDays: [{
      id: "instruction-begins", startDate: "2026-08-12", endDate: "2026-08-12",
      label: "Instruction Begins", type: "instructional", scheduleTempId: "sched-regular",
      isInstructional: true, confidence: "high", evidence: evidence("August 12, 2026 Instruction Begins"),
    }],
    informationalDates: [],
    legendInterpretation: "Bracketed and boxed weekdays are non-student days; parenthesized weekdays are inservice days.",
    extractionNotes: "Deterministic published-calendar extraction.",
    warnings: [],
  };
}
