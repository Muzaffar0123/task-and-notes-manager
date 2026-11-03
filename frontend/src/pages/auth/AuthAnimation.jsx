import {
  Check,
  FileText,
  ListTodo,
  CalendarDays,
  Clock3,
  MoreHorizontal,
  Plus,
  Sparkles,
} from "lucide-react";

export default function AuthAnimation() {
  return (
    <div className="auth-animation">
      <div className="auth-orbit auth-orbit-one" />
      <div className="auth-orbit auth-orbit-two" />

      {/* Floating task card */}
      <div className="floating-card task-preview">
        <div className="preview-header">
          <div className="preview-icon task-icon">
            <ListTodo size={17} />
          </div>

          <div>
            <strong>My Tasks</strong>
            <small>Today's priorities</small>
          </div>

          <MoreHorizontal size={19} />
        </div>

        <div className="task-progress">
          <div>
            <span>Daily progress</span>
            <strong>75%</strong>
          </div>

          <div className="progress-track">
            <span />
          </div>
        </div>

        <div className="preview-task completed-task">
          <span className="task-check">
            <Check size={12} />
          </span>
          <span>Plan weekly goals</span>
          <small>Done</small>
        </div>

        <div className="preview-task completed-task">
          <span className="task-check">
            <Check size={12} />
          </span>
          <span>Review project notes</span>
          <small>Done</small>
        </div>

        <div className="preview-task">
          <span className="task-empty-check" />
          <span>Finish project design</span>
          <small>Today</small>
        </div>
      </div>

      {/* Floating notes card */}
      <div className="floating-card notes-preview">
        <div className="preview-header">
          <div className="preview-icon notes-icon">
            <FileText size={17} />
          </div>

          <div>
            <strong>Quick Notes</strong>
            <small>Project ideas</small>
          </div>

          <Plus size={17} />
        </div>

        <div className="notes-lines">
          <span />
          <span />
          <span />
        </div>

        <div className="notes-tag">
          <Sparkles size={12} />
          Creative ideas
        </div>
      </div>

      {/* Floating deadline card */}
      <div className="floating-card deadline-preview">
        <div className="deadline-icon">
          <CalendarDays size={17} />
        </div>

        <div>
          <strong>Project deadline</strong>
          <small>
            <Clock3 size={12} />
            Tomorrow, 10:00 AM
          </small>
        </div>

        <span className="deadline-dot" />
      </div>

      {/* Decorative center element */}
      <div className="auth-center-glow">
        <div className="center-logo">
          <ListTodo size={38} />
        </div>
      </div>
    </div>
  );
}