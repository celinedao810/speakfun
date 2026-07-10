import HomeworkFeedbackTool from '@/components/teacher/HomeworkFeedbackTool';

export default function FeedbackPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Homework Feedback</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a student recording to convert it to text, or analyze it for pronunciation, word stress, grammar, and word-choice errors — then refine the text and generate feedback.
        </p>
      </div>
      <HomeworkFeedbackTool />
    </div>
  );
}
