import HomeworkFeedbackTool from '@/components/teacher/HomeworkFeedbackTool';

export default function FeedbackPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Homework Feedback</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a student recording to transcribe it and get detailed AI feedback on pronunciation, grammar, word choice, and cohesion.
        </p>
      </div>
      <HomeworkFeedbackTool />
    </div>
  );
}
