use crate::error::AppError;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

pub trait ProcessHandle: Send + Sync {
    fn try_wait(&mut self) -> Result<Option<i32>, AppError>;
    fn kill(&mut self) -> Result<(), AppError>;
    fn id(&self) -> u32;
    fn latest_progress(&self) -> Option<f64> {
        None
    }
    fn get_stderr_log(&self) -> String {
        String::new()
    }
}

pub trait ProcessRunner: Send + Sync {
    fn spawn(&self, program: &Path, args: &[String]) -> Result<Box<dyn ProcessHandle>, AppError>;
}

/// Standard OS process runner wrapping std::process::Command and Child
pub struct StdProcessRunner;

impl StdProcessRunner {
    pub fn new() -> Self {
        Self
    }
}

pub struct StdProcessHandle {
    child: Child,
    progress: Arc<Mutex<Option<f64>>>,
    stderr_log: Arc<Mutex<Vec<String>>>,
}

impl ProcessHandle for StdProcessHandle {
    fn try_wait(&mut self) -> Result<Option<i32>, AppError> {
        match self.child.try_wait() {
            Ok(Some(status)) => Ok(status.code()),
            Ok(None) => Ok(None),
            Err(e) => Err(AppError::ExecutionError {
                message: format!("Failed to poll process status: {}", e),
            }),
        }
    }

    fn kill(&mut self) -> Result<(), AppError> {
        self.child.kill().map_err(|e| AppError::ExecutionError {
            message: format!("Failed to kill process: {}", e),
        })
    }

    fn id(&self) -> u32 {
        self.child.id()
    }

    fn latest_progress(&self) -> Option<f64> {
        *self
            .progress
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn get_stderr_log(&self) -> String {
        if let Ok(log) = self.stderr_log.lock() {
            log.join("\n")
        } else {
            String::new()
        }
    }
}

impl ProcessRunner for StdProcessRunner {
    fn spawn(&self, program: &Path, args: &[String]) -> Result<Box<dyn ProcessHandle>, AppError> {
        let mut child = Command::new(program)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| AppError::ExecutionError {
                message: format!("Failed to spawn process '{}': {}", program.display(), e),
            })?;

        let progress = Arc::new(Mutex::new(None));
        let progress_clone = Arc::clone(&progress);
        let stderr_log = Arc::new(Mutex::new(Vec::<String>::new()));
        let stderr_log_clone = Arc::clone(&stderr_log);

        // Drain stdout and stderr in background threads so OS pipe buffers never fill up and deadlock child processes
        if let Some(stdout) = child.stdout.take() {
            std::thread::spawn(move || {
                use std::io::BufRead;
                let mut reader = std::io::BufReader::new(stdout);
                let mut line = String::new();
                while let Ok(bytes) = reader.read_line(&mut line) {
                    if bytes == 0 {
                        break;
                    }
                    line.clear();
                }
            });
        }
        if let Some(stderr) = child.stderr.take() {
            std::thread::spawn(move || {
                use std::io::BufRead;
                let mut reader = std::io::BufReader::new(stderr);
                let mut line = String::new();
                while let Ok(bytes) = reader.read_line(&mut line) {
                    if bytes == 0 {
                        break;
                    }
                    let trimmed = line.trim();
                    if let Ok(mut log) = stderr_log_clone.lock() {
                        if log.len() >= 20 {
                            log.remove(0);
                        }
                        log.push(trimmed.to_string());
                    }
                    if let Some(pct_str) = trimmed.strip_suffix('%') {
                        if let Ok(pct) = pct_str.trim().parse::<f64>() {
                            if let Ok(mut p) = progress_clone.lock() {
                                *p = Some(pct);
                            }
                        }
                    }
                    line.clear();
                }
            });
        }

        Ok(Box::new(StdProcessHandle {
            child,
            progress,
            stderr_log,
        }))
    }
}

/// Mock process runner for testing without real executable or GPU dependencies
pub struct MockProcessRunner {
    pub exit_code: Arc<Mutex<Option<i32>>>,
    pub was_killed: Arc<Mutex<bool>>,
    pub fail_on_spawn: bool,
}

pub struct MockProcessHandle {
    exit_code: Arc<Mutex<Option<i32>>>,
    was_killed: Arc<Mutex<bool>>,
    pid: u32,
}

impl ProcessHandle for MockProcessHandle {
    fn try_wait(&mut self) -> Result<Option<i32>, AppError> {
        let code = *self
            .exit_code
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        Ok(code)
    }

    fn kill(&mut self) -> Result<(), AppError> {
        let mut killed = self
            .was_killed
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *killed = true;
        let mut code = self
            .exit_code
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *code = Some(-1);
        Ok(())
    }

    fn id(&self) -> u32 {
        self.pid
    }
}

impl MockProcessRunner {
    pub fn new(exit_code: Option<i32>) -> Self {
        Self {
            exit_code: Arc::new(Mutex::new(exit_code)),
            was_killed: Arc::new(Mutex::new(false)),
            fail_on_spawn: false,
        }
    }
}

impl ProcessRunner for MockProcessRunner {
    fn spawn(&self, _program: &Path, _args: &[String]) -> Result<Box<dyn ProcessHandle>, AppError> {
        if self.fail_on_spawn {
            return Err(AppError::ExecutionError {
                message: "Mock spawn failure simulated".into(),
            });
        }

        Ok(Box::new(MockProcessHandle {
            exit_code: Arc::clone(&self.exit_code),
            was_killed: Arc::clone(&self.was_killed),
            pid: 9999,
        }))
    }
}

/// Composite process handle that manages multiple concurrent processes
pub struct MultiProcessHandle {
    handles: Arc<Mutex<Vec<Box<dyn ProcessHandle>>>>,
}

impl MultiProcessHandle {
    pub fn new(handles: Arc<Mutex<Vec<Box<dyn ProcessHandle>>>>) -> Self {
        Self { handles }
    }
}

impl ProcessHandle for MultiProcessHandle {
    fn try_wait(&mut self) -> Result<Option<i32>, AppError> {
        let mut list = self
            .handles
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut any_running = false;
        let mut last_err = None;

        for h in list.iter_mut() {
            match h.try_wait() {
                Ok(Some(code)) if code != 0 => {
                    last_err = Some(code);
                }
                Ok(Some(_)) => {}
                Ok(None) => {
                    any_running = true;
                }
                Err(e) => {
                    return Err(e);
                }
            }
        }

        if let Some(err_code) = last_err {
            Ok(Some(err_code))
        } else if any_running {
            Ok(None)
        } else {
            Ok(Some(0))
        }
    }

    fn kill(&mut self) -> Result<(), AppError> {
        let mut list = self
            .handles
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        for h in list.iter_mut() {
            let _ = h.kill();
        }
        list.clear();
        Ok(())
    }

    fn id(&self) -> u32 {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mock_process_runner_success() {
        let runner = MockProcessRunner::new(Some(0));
        let mut handle = runner.spawn(Path::new("dummy"), &[]).unwrap();
        assert_eq!(handle.id(), 9999);
        assert_eq!(handle.try_wait().unwrap(), Some(0));
    }

    #[test]
    fn test_mock_process_runner_kill() {
        let runner = MockProcessRunner::new(None);
        let mut handle = runner.spawn(Path::new("dummy"), &[]).unwrap();
        assert_eq!(handle.try_wait().unwrap(), None);

        handle.kill().unwrap();
        assert_eq!(handle.try_wait().unwrap(), Some(-1));
        assert!(*runner.was_killed.lock().unwrap());
    }

    #[test]
    fn test_mock_process_runner_spawn_failure() {
        let mut runner = MockProcessRunner::new(Some(0));
        runner.fail_on_spawn = true;
        let result = runner.spawn(Path::new("dummy"), &[]);
        assert!(result.is_err());
    }

    #[test]
    fn test_multi_process_handle_kill_all() {
        let runner1 = MockProcessRunner::new(None);
        let runner2 = MockProcessRunner::new(None);
        let handle1 = runner1.spawn(Path::new("dummy1"), &[]).unwrap();
        let handle2 = runner2.spawn(Path::new("dummy2"), &[]).unwrap();

        let list = Arc::new(Mutex::new(vec![handle1, handle2]));
        let mut multi = MultiProcessHandle::new(Arc::clone(&list));

        assert_eq!(multi.try_wait().unwrap(), None);
        multi.kill().unwrap();
        assert!(*runner1.was_killed.lock().unwrap());
        assert!(*runner2.was_killed.lock().unwrap());
    }
}
