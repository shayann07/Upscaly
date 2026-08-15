//! The backend's record of every job it has been asked to run.
//!
//! Before this module the queue was a state machine with no readable state:
//! it emitted one event per progress tick and kept nothing, so the frontend
//! had to rebuild "what jobs exist and how are they doing" by accumulating
//! that event stream across several independent stores. Anything the webview
//! missed -- a reload, a listener registered a tick late, an event dropped --
//! was simply gone.
//!
//! What this module adds:
//!
//! * **A snapshot.** [`JobStore::snapshot`] (exposed as the `get_jobs_snapshot`
//!   command) answers the question directly, so the frontend can read state
//!   instead of deriving it.
//! * **Validated transitions.** Every state change goes through
//!   [`JobState::can_transition_to`], the same table the frontend uses. A
//!   straggling tick from a process that was already killed cannot walk a
//!   terminal job back to `running`.
//! * **Coalesced deltas.** Progress updates mark a job dirty; a flusher
//!   thread emits everything that changed in the last [`FLUSH_INTERVAL`] as
//!   one `jobs-delta` event. State changes flush immediately, because
//!   "finished" is not something to make the user wait an extra frame for.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

use crate::job_queue::Job;
use crate::job_state::JobState;

/// How long progress updates accumulate before being emitted as one event.
///
/// The engine reports progress far faster than a UI can use it, and every
/// event costs a render pass in the webview. 150ms is under the threshold
/// where a progress bar looks like it is stepping rather than moving, and it
/// collapses the previous ~17 events/second/job into at most ~7 -- one, not
/// seven, when several jobs tick inside the same window.
const FLUSH_INTERVAL: Duration = Duration::from_millis(150);

/// How many job records are kept. Terminal jobs are retained so a snapshot
/// can show recent results, but not forever; the oldest finished ones are
/// evicted once the store grows past this. Live jobs are never evicted.
const MAX_RETAINED_JOBS: usize = 200;

/// The event name carrying [`JobsDelta`].
pub const JOBS_DELTA_EVENT: &str = "jobs-delta";

/// Everything the frontend needs to know about one job.
///
/// A superset of the per-tick progress payload this replaces: it also carries
/// the job's inputs (so a snapshot alone is enough to render a queue row) and
/// its timestamps (so elapsed/ETA can be computed without the frontend having
/// had to witness the job start).
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/ipc/")]
pub struct JobSnapshot {
    pub job_id: String,
    pub input_path: String,
    pub output_path: String,
    /// Derived from `input_path` here rather than in the webview, so the
    /// backend stays the only thing that has to know how paths are shaped.
    pub file_name: String,
    pub model_name: String,
    pub gpu_id: i32,
    pub scale: i32,
    pub tile_size: i32,
    pub is_video: bool,
    /// One of the canonical vocabulary in `src/lib/jobState.ts`:
    /// `queued` | `running` | `succeeded` | `failed` | `cancelled`.
    pub status: String,
    pub percentage: f64,
    pub phase: Option<String>,
    // ts-rs maps u64 to bigint, which is technically right for the full range
    // but wrong in practice here: these are milliseconds/seconds that serde
    // emits as plain JSON numbers and the webview receives as JS numbers.
    #[ts(type = "number | null")]
    pub eta_seconds: Option<u64>,
    pub fps: Option<f64>,
    pub error: Option<String>,
    #[ts(type = "number")]
    pub queued_at_ms: u64,
    #[ts(type = "number | null")]
    pub started_at_ms: Option<u64>,
    #[ts(type = "number | null")]
    pub finished_at_ms: Option<u64>,
}

/// The batch of jobs that changed since the last emit.
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/ipc/")]
pub struct JobsDelta {
    pub jobs: Vec<JobSnapshot>,
}

struct JobRecord {
    job: Job,
    state: JobState,
    percentage: f64,
    phase: Option<String>,
    eta_seconds: Option<u64>,
    fps: Option<f64>,
    queued_at_ms: u64,
    started_at_ms: Option<u64>,
    finished_at_ms: Option<u64>,
}

impl JobRecord {
    fn to_snapshot(&self) -> JobSnapshot {
        JobSnapshot {
            job_id: self.job.id.clone(),
            input_path: self.job.input_path.clone(),
            output_path: self.job.output_path.clone(),
            file_name: Path::new(&self.job.input_path).file_name().map_or_else(
                || self.job.input_path.clone(),
                |n| n.to_string_lossy().to_string(),
            ),
            model_name: self.job.model_name.clone(),
            gpu_id: self.job.gpu_id,
            scale: self.job.scale,
            tile_size: self.job.tile_size,
            is_video: self.job.is_video,
            status: self.state.as_str().to_string(),
            percentage: self.percentage,
            phase: self.phase.clone(),
            eta_seconds: self.eta_seconds,
            fps: self.fps,
            error: self.state.error_message(),
            queued_at_ms: self.queued_at_ms,
            started_at_ms: self.started_at_ms,
            finished_at_ms: self.finished_at_ms,
        }
    }
}

#[derive(Default)]
struct Inner {
    /// Insertion order, so a snapshot lists jobs oldest-first the way they
    /// were enqueued rather than in `HashMap` iteration order.
    order: Vec<String>,
    records: HashMap<String, JobRecord>,
    dirty: HashSet<String>,
    /// Whether a flusher thread is currently alive. Read and written only
    /// under the `Inner` lock, which is what makes "spawn one if none is
    /// running" and "exit because there is nothing left to flush" atomic
    /// with respect to each other.
    flusher_alive: bool,
}

#[derive(Default)]
pub struct JobStore {
    inner: Mutex<Inner>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

impl JobStore {
    pub fn global() -> &'static Self {
        static INSTANCE: OnceLock<JobStore> = OnceLock::new();
        INSTANCE.get_or_init(JobStore::default)
    }

    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    fn lock_inner(&self) -> MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// Records a newly enqueued job in the `queued` state.
    ///
    /// Re-registering an id that is already present is ignored rather than
    /// resetting it: ids are unique per run, so this can only mean a
    /// duplicate submission, and clobbering a live record would lose the
    /// running job's progress.
    pub fn register(&self, app: &AppHandle, job: &Job) {
        if self.insert_record(job) {
            self.flush_now(app);
        }
    }

    /// The lock-only half of [`Self::register`]. Returns whether the job was
    /// new; a duplicate id is left untouched.
    fn insert_record(&self, job: &Job) -> bool {
        let mut inner = self.lock_inner();
        if inner.records.contains_key(&job.id) {
            return false;
        }
        inner.order.push(job.id.clone());
        inner.records.insert(
            job.id.clone(),
            JobRecord {
                job: job.clone(),
                state: JobState::Queued,
                percentage: 0.0,
                phase: Some("Queued in GPU worker pool".to_string()),
                eta_seconds: None,
                fps: None,
                queued_at_ms: now_ms(),
                started_at_ms: None,
                finished_at_ms: None,
            },
        );
        inner.dirty.insert(job.id.clone());
        Self::evict_old_terminal(&mut inner);
        true
    }

    /// Applies a state change if the transition table allows it.
    ///
    /// Returns whether it was applied, so callers can tell a real transition
    /// from a rejected one (a late tick for a job that has already finished)
    /// instead of assuming every call took effect.
    pub fn transition(
        &self,
        app: &AppHandle,
        job_id: &str,
        to: JobState,
        phase: Option<&str>,
    ) -> bool {
        let applied = self.apply_transition(job_id, to, phase);
        if applied {
            // A state change is what the user is waiting to see. Coalescing
            // is for the progress stream, not for "it finished".
            self.flush_now(app);
        }
        applied
    }

    /// The lock-only half of [`Self::transition`], without any emitting.
    /// Split out so the transition rules can be tested without a running
    /// Tauri application to emit into.
    fn apply_transition(&self, job_id: &str, to: JobState, phase: Option<&str>) -> bool {
        let mut inner = self.lock_inner();
        let Some(record) = inner.records.get_mut(job_id) else {
            return false;
        };
        if !record.state.can_transition_to(&to) {
            return false;
        }

        let is_terminal = to.is_terminal();
        match to {
            JobState::Running if record.started_at_ms.is_none() => {
                record.started_at_ms = Some(now_ms());
            }
            JobState::Succeeded => {
                record.percentage = 100.0;
                record.eta_seconds = Some(0);
            }
            // Failed and cancelled jobs produce no output, so leaving a
            // half-full bar on screen would misrepresent what happened.
            JobState::Failed(_) | JobState::Cancelled => {
                record.percentage = 0.0;
                record.eta_seconds = None;
                record.fps = None;
            }
            _ => {}
        }
        record.state = to;
        if let Some(text) = phase {
            record.phase = Some(text.to_string());
        }
        if is_terminal {
            record.finished_at_ms = Some(now_ms());
        }

        inner.dirty.insert(job_id.to_string());
        true
    }

    /// Records live progress for a job that is still running.
    ///
    /// Deliberately cannot change state: a progress tick is not a lifecycle
    /// event, and one arriving after a job was cancelled must not revive it.
    /// `None` arguments leave the previous value alone rather than clearing
    /// it, so a pipeline phase that reports no FPS does not blank out the
    /// figure the previous phase reported.
    pub fn update_progress(
        &self,
        app: &AppHandle,
        job_id: &str,
        percentage: f64,
        phase: Option<&str>,
        eta_seconds: Option<u64>,
        fps: Option<f64>,
    ) {
        let mut inner = self.lock_inner();
        if Self::apply_progress(&mut inner, job_id, percentage, phase, eta_seconds, fps) {
            Self::ensure_flusher(app, &mut inner);
        }
    }

    /// The lock-only half of [`Self::update_progress`]. Returns whether
    /// anything was recorded.
    fn apply_progress(
        inner: &mut Inner,
        job_id: &str,
        percentage: f64,
        phase: Option<&str>,
        eta_seconds: Option<u64>,
        fps: Option<f64>,
    ) -> bool {
        let Some(record) = inner.records.get_mut(job_id) else {
            return false;
        };
        if record.state.is_terminal() {
            return false;
        }
        record.percentage = percentage;
        if let Some(text) = phase {
            record.phase = Some(text.to_string());
        }
        if eta_seconds.is_some() {
            record.eta_seconds = eta_seconds;
        }
        if fps.is_some() {
            record.fps = fps;
        }
        inner.dirty.insert(job_id.to_string());
        true
    }

    /// Every job the store knows about, oldest first.
    pub fn snapshot(&self) -> Vec<JobSnapshot> {
        let inner = self.lock_inner();
        inner
            .order
            .iter()
            .filter_map(|id| inner.records.get(id))
            .map(JobRecord::to_snapshot)
            .collect()
    }

    /// The current state of one job, if it is known.
    pub fn state_of(&self, job_id: &str) -> Option<JobState> {
        let inner = self.lock_inner();
        inner.records.get(job_id).map(|r| r.state.clone())
    }

    /// Emits everything currently dirty, right now.
    fn flush_now(&self, app: &AppHandle) {
        let batch = {
            let mut inner = self.lock_inner();
            Self::take_dirty(&mut inner)
        };
        Self::emit(app, batch);
    }

    /// Drains the dirty set into snapshots. Must be called with the lock
    /// held; the resulting emit must happen after it is released, or a
    /// listener that calls back into the store would deadlock.
    fn take_dirty(inner: &mut Inner) -> Vec<JobSnapshot> {
        if inner.dirty.is_empty() {
            return Vec::new();
        }
        let dirty = std::mem::take(&mut inner.dirty);
        // Emit in enqueue order rather than hash order so a delta covering
        // several jobs is applied in a stable, reproducible sequence.
        inner
            .order
            .iter()
            .filter(|id| dirty.contains(*id))
            .filter_map(|id| inner.records.get(id))
            .map(JobRecord::to_snapshot)
            .collect()
    }

    fn emit(app: &AppHandle, jobs: Vec<JobSnapshot>) {
        if jobs.is_empty() {
            return;
        }
        let _ = app.emit(JOBS_DELTA_EVENT, JobsDelta { jobs });
    }

    /// Starts the coalescing flusher if it is not already running.
    ///
    /// Called with the `Inner` lock held, which is what keeps the flag
    /// honest: the flusher clears it under the same lock in the same breath
    /// as observing an empty dirty set, so it can neither exit while work is
    /// pending nor leave a second thread spawned alongside it.
    fn ensure_flusher(app: &AppHandle, inner: &mut Inner) {
        if inner.flusher_alive {
            return;
        }
        inner.flusher_alive = true;
        let app = app.clone();
        thread::spawn(move || {
            let store = JobStore::global();
            loop {
                thread::sleep(FLUSH_INTERVAL);
                let batch = {
                    let mut inner = store.lock_inner();
                    if inner.dirty.is_empty() {
                        // Nothing accumulated over a whole interval: no job
                        // is reporting progress, so stop rather than tick
                        // forever. The next update_progress starts a new one.
                        inner.flusher_alive = false;
                        break;
                    }
                    Self::take_dirty(&mut inner)
                };
                Self::emit(&app, batch);
            }
        });
    }

    /// Drops the oldest finished jobs once the store outgrows its cap.
    /// Live jobs are never evicted -- a queue long enough to hit the cap
    /// still needs every one of its pending entries.
    fn evict_old_terminal(inner: &mut Inner) {
        if inner.order.len() <= MAX_RETAINED_JOBS {
            return;
        }
        let excess = inner.order.len() - MAX_RETAINED_JOBS;
        let doomed: HashSet<String> = inner
            .order
            .iter()
            .filter(|id| {
                inner
                    .records
                    .get(*id)
                    .is_some_and(|r| r.state.is_terminal())
            })
            .take(excess)
            .cloned()
            .collect();
        if doomed.is_empty() {
            return;
        }
        inner.order.retain(|id| !doomed.contains(id));
        for id in &doomed {
            inner.records.remove(id);
            inner.dirty.remove(id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn job(id: &str) -> Job {
        Job {
            id: id.to_string(),
            input_path: format!("C:\\media\\{id}.png"),
            output_path: format!("C:\\media\\{id}_upscaled_4x.png"),
            model_name: "realesrgan-x4plus".to_string(),
            gpu_id: 0,
            scale: 4,
            tile_size: 256,
            is_video: false,
            preset: crate::engine::preset::QualityPreset::Balanced,
        }
    }

    /// `register` minus the emit. Every test below drives the store through
    /// the same locked helpers the public API uses; only the `app.emit` call
    /// needs a running Tauri application, and that is exercised by the
    /// pipeline rather than here.
    fn register_quietly(store: &JobStore, j: &Job) {
        assert!(store.insert_record(j));
    }

    #[test]
    fn test_snapshot_reports_registered_jobs_in_order() {
        let store = JobStore::new();
        register_quietly(&store, &job("a"));
        register_quietly(&store, &job("b"));

        let snap = store.snapshot();
        assert_eq!(snap.len(), 2);
        assert_eq!(snap[0].job_id, "a");
        assert_eq!(snap[1].job_id, "b");
        assert_eq!(snap[0].status, "queued");
        assert_eq!(snap[0].file_name, "a.png");
        assert_eq!(snap[0].model_name, "realesrgan-x4plus");
        assert!(snap[0].started_at_ms.is_none());
    }

    #[test]
    fn test_illegal_transitions_are_rejected() {
        let store = JobStore::new();
        register_quietly(&store, &job("a"));

        // queued -> succeeded is not in the table.
        assert!(!store.apply_transition("a", JobState::Succeeded, None));
        assert_eq!(store.state_of("a").unwrap().as_str(), "queued");

        assert!(store.apply_transition("a", JobState::Running, None));
        assert!(store.apply_transition("a", JobState::Succeeded, None));

        // Terminal is absorbing: a late tick cannot revive it.
        assert!(!store.apply_transition("a", JobState::Running, None));
        assert_eq!(store.state_of("a").unwrap().as_str(), "succeeded");
    }

    #[test]
    fn test_transition_on_unknown_job_is_a_no_op() {
        let store = JobStore::new();
        assert!(!store.apply_transition("ghost", JobState::Running, None));
        assert!(store.state_of("ghost").is_none());
    }

    #[test]
    fn test_progress_cannot_resurrect_a_terminal_job() {
        let store = JobStore::new();
        register_quietly(&store, &job("a"));
        store.apply_transition("a", JobState::Running, None);

        {
            let mut inner = store.lock_inner();
            JobStore::apply_progress(&mut inner, "a", 42.0, None, None, None);
        }
        assert!(store.apply_transition("a", JobState::Cancelled, Some("Cancelled by user")));

        // The tick that arrives after the kill must find the job closed.
        {
            let mut inner = store.lock_inner();
            assert!(!JobStore::apply_progress(
                &mut inner, "a", 43.0, None, None, None
            ));
        }

        let snap = store.snapshot();
        assert_eq!(snap[0].status, "cancelled");
        // Cancelled jobs produce no output, so the bar is cleared rather
        // than frozen at the point it stopped.
        assert!((snap[0].percentage - 0.0).abs() < f64::EPSILON);
        assert!(snap[0].finished_at_ms.is_some());
    }

    #[test]
    fn test_success_completes_the_bar_and_stamps_times() {
        let store = JobStore::new();
        register_quietly(&store, &job("a"));
        store.apply_transition("a", JobState::Running, Some("Upscaling"));
        store.apply_transition("a", JobState::Succeeded, Some("Complete"));

        let snap = store.snapshot();
        assert!((snap[0].percentage - 100.0).abs() < f64::EPSILON);
        assert_eq!(snap[0].phase.as_deref(), Some("Complete"));
        assert!(snap[0].started_at_ms.is_some());
        assert!(snap[0].finished_at_ms.is_some());
        assert!(snap[0].error.is_none());
    }

    #[test]
    fn test_failure_carries_its_message_into_the_snapshot() {
        let store = JobStore::new();
        register_quietly(&store, &job("a"));
        store.apply_transition("a", JobState::Running, None);
        store.apply_transition(
            "a",
            JobState::Failed("engine exploded".into()),
            Some("Failed"),
        );

        let snap = store.snapshot();
        assert_eq!(snap[0].status, "failed");
        assert_eq!(snap[0].error.as_deref(), Some("engine exploded"));
    }

    #[test]
    fn test_take_dirty_coalesces_repeated_updates_into_one_entry() {
        let store = JobStore::new();
        register_quietly(&store, &job("a"));
        register_quietly(&store, &job("b"));

        {
            let mut inner = store.lock_inner();
            // Whatever a job does between flushes, it appears once.
            for _ in 0..50 {
                inner.dirty.insert("a".to_string());
            }
        }

        let batch = {
            let mut inner = store.lock_inner();
            JobStore::take_dirty(&mut inner)
        };
        assert_eq!(batch.len(), 2);
        assert_eq!(batch[0].job_id, "a");
        assert_eq!(batch[1].job_id, "b");

        // Draining leaves nothing behind, which is what lets the flusher
        // decide it can stop.
        let mut inner = store.lock_inner();
        assert!(JobStore::take_dirty(&mut inner).is_empty());
    }

    #[test]
    fn test_eviction_drops_finished_jobs_and_keeps_live_ones() {
        let store = JobStore::new();
        for i in 0..(MAX_RETAINED_JOBS + 10) {
            let j = job(&format!("j{i}"));
            register_quietly(&store, &j);
            // Finish all but the last ten, so eviction has candidates and
            // still has to leave the live ones alone.
            if i < MAX_RETAINED_JOBS {
                store.apply_transition(&j.id, JobState::Running, None);
                store.apply_transition(&j.id, JobState::Succeeded, None);
            }
        }

        {
            let mut inner = store.lock_inner();
            JobStore::evict_old_terminal(&mut inner);
        }

        let snap = store.snapshot();
        assert_eq!(snap.len(), MAX_RETAINED_JOBS);
        // The ten still-queued jobs must all have survived.
        let queued = snap.iter().filter(|s| s.status == "queued").count();
        assert_eq!(queued, 10);
        // The oldest finished ones are the ones that went.
        assert!(!snap.iter().any(|s| s.job_id == "j0"));
    }

    #[test]
    fn test_register_ignores_a_duplicate_id() {
        let store = JobStore::new();
        assert!(store.insert_record(&job("a")));
        store.apply_transition("a", JobState::Running, None);

        // A second submission of the same id must not reset the live job
        // back to queued and lose its progress.
        assert!(!store.insert_record(&job("a")));
        assert_eq!(store.state_of("a").unwrap().as_str(), "running");
        assert_eq!(store.snapshot().len(), 1);
    }

    #[test]
    fn test_progress_updates_leave_unreported_fields_alone() {
        let store = JobStore::new();
        register_quietly(&store, &job("a"));
        store.apply_transition("a", JobState::Running, None);

        let mut inner = store.lock_inner();
        assert!(JobStore::apply_progress(
            &mut inner,
            "a",
            30.0,
            Some("Extracting"),
            Some(90),
            Some(24.0)
        ));
        // A later phase that reports no FPS or ETA must not blank the
        // figures the previous one established.
        assert!(JobStore::apply_progress(
            &mut inner, "a", 55.0, None, None, None
        ));
        drop(inner);

        let snap = store.snapshot();
        assert!((snap[0].percentage - 55.0).abs() < f64::EPSILON);
        assert_eq!(snap[0].phase.as_deref(), Some("Extracting"));
        assert_eq!(snap[0].eta_seconds, Some(90));
        assert_eq!(snap[0].fps, Some(24.0));
    }
}
