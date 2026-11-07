export function getExamCompletionLabel(feedback: {
  examCompleted: boolean | null;
  examTaken: boolean | null;
}): string {
  if (feedback.examCompleted != null) {
    return feedback.examCompleted ? "Finished exam" : "Did not finish exam";
  }
  if (feedback.examTaken != null) {
    return feedback.examTaken ? "Took exam" : "Did not take exam";
  }
  return "Exam completion not recorded";
}
