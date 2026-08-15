use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobState {
    /// Known to a queue but not yet submitted for execution. The backend's
    /// own jobs enter at `Queued` and never occupy this state; it exists so
    /// that this table is a literal mirror of the frontend's
    /// (`src/lib/jobState.ts`), where a picked-but-unstarted batch item does
    /// sit here. Two tables that are supposed to agree should be the same
    /// table, not two transcriptions of one.
    Ready,
    Queued,
    Running,
    Succeeded,
    Failed(String),
    Cancelled,
}

impl JobState {
    pub fn as_str(&self) -> &'static str {
        match self {
            JobState::Ready => "ready",
            JobState::Queued => "queued",
            JobState::Running => "running",
            JobState::Succeeded => "succeeded",
            JobState::Failed(_) => "failed",
            JobState::Cancelled => "cancelled",
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            JobState::Succeeded | JobState::Failed(_) | JobState::Cancelled
        )
    }

    pub fn error_message(&self) -> Option<String> {
        match self {
            JobState::Failed(msg) => Some(msg.clone()),
            _ => None,
        }
    }

    /// Whether a job may move from `self` to `to`.
    ///
    /// Mirrors `isValidStateTransition` in `src/lib/jobState.ts` exactly.
    /// Both sides need it: the frontend to reject late/out-of-order events
    /// that would resurrect a finished row, and the backend so that a
    /// terminal job can never be walked back to `running` by a straggling
    /// progress tick from a process that was already killed.
    ///
    /// Failure payloads are ignored in the comparison -- `failed("a")` and
    /// `failed("b")` are the same state, so re-reporting a failure with a
    /// different message is a no-op rather than an illegal move.
    pub fn can_transition_to(&self, to: &JobState) -> bool {
        if self.as_str() == to.as_str() {
            return true;
        }
        if self.is_terminal() {
            return false;
        }
        match self {
            JobState::Ready => matches!(
                to,
                JobState::Queued | JobState::Running | JobState::Cancelled
            ),
            JobState::Queued => matches!(
                to,
                JobState::Running | JobState::Cancelled | JobState::Failed(_)
            ),
            JobState::Running => matches!(
                to,
                JobState::Succeeded | JobState::Failed(_) | JobState::Cancelled
            ),
            // Unreachable: every terminal state returned above.
            JobState::Succeeded | JobState::Failed(_) | JobState::Cancelled => false,
        }
    }
}

impl fmt::Display for JobState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn failed() -> JobState {
        JobState::Failed("boom".to_string())
    }

    #[test]
    fn test_as_str_and_terminal() {
        assert_eq!(JobState::Ready.as_str(), "ready");
        assert_eq!(JobState::Queued.as_str(), "queued");
        assert_eq!(JobState::Running.as_str(), "running");
        assert_eq!(JobState::Succeeded.as_str(), "succeeded");
        assert_eq!(JobState::Cancelled.as_str(), "cancelled");
        assert_eq!(failed().as_str(), "failed");

        assert!(!JobState::Ready.is_terminal());
        assert!(!JobState::Queued.is_terminal());
        assert!(!JobState::Running.is_terminal());
        assert!(JobState::Succeeded.is_terminal());
        assert!(JobState::Cancelled.is_terminal());
        assert!(failed().is_terminal());
    }

    #[test]
    fn test_transition_table_matches_the_frontend() {
        // ready
        assert!(JobState::Ready.can_transition_to(&JobState::Queued));
        assert!(JobState::Ready.can_transition_to(&JobState::Running));
        assert!(JobState::Ready.can_transition_to(&JobState::Cancelled));
        assert!(!JobState::Ready.can_transition_to(&JobState::Succeeded));
        assert!(!JobState::Ready.can_transition_to(&failed()));

        // queued
        assert!(JobState::Queued.can_transition_to(&JobState::Running));
        assert!(JobState::Queued.can_transition_to(&JobState::Cancelled));
        assert!(JobState::Queued.can_transition_to(&failed()));
        assert!(!JobState::Queued.can_transition_to(&JobState::Succeeded));
        assert!(!JobState::Queued.can_transition_to(&JobState::Ready));

        // running
        assert!(JobState::Running.can_transition_to(&JobState::Succeeded));
        assert!(JobState::Running.can_transition_to(&failed()));
        assert!(JobState::Running.can_transition_to(&JobState::Cancelled));
        assert!(!JobState::Running.can_transition_to(&JobState::Queued));
        assert!(!JobState::Running.can_transition_to(&JobState::Ready));
    }

    #[test]
    fn test_terminal_states_are_absorbing() {
        for terminal in [JobState::Succeeded, JobState::Cancelled, failed()] {
            for target in [
                JobState::Ready,
                JobState::Queued,
                JobState::Running,
                JobState::Succeeded,
                JobState::Cancelled,
            ] {
                if terminal.as_str() == target.as_str() {
                    continue;
                }
                assert!(
                    !terminal.can_transition_to(&target),
                    "{terminal} must not reach {target}"
                );
            }
        }
    }

    #[test]
    fn test_self_transition_is_always_allowed() {
        for state in [
            JobState::Ready,
            JobState::Queued,
            JobState::Running,
            JobState::Succeeded,
            JobState::Cancelled,
            failed(),
        ] {
            assert!(state.can_transition_to(&state.clone()));
        }
        // A second failure report with a different message is the same
        // state, not an illegal move.
        assert!(failed().can_transition_to(&JobState::Failed("other".into())));
    }
}
