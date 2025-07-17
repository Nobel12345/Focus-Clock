/**
 * pomodoro-worker.js
 *
 * This worker manages the Pomodoro timer logic.
 * It uses a timestamp-based approach (Date.now() and an endTime) to remain
 * accurate even if the browser tab or device goes to sleep. This prevents
 * the timer from pausing when the screen is off.
 */

let timerInterval = null;
let settings = {};
let state = {
    mode: 'work', // 'work', 'short_break', 'long_break'
    sessions: 0,
    endTime: 0,
    autoStart: false
};

/**
 * The main timer function. It runs every second.
 * It calculates the time remaining based on a fixed endTime, making it
 * resilient to OS-level process freezing (Doze mode).
 */
function tick() {
    const now = Date.now();
    // Calculate the time left in seconds.
    const timeLeft = Math.round((state.endTime - now) / 1000);

    if (timeLeft > 0) {
        // If time is remaining, post the new time back to the main UI.
        self.postMessage({ type: 'tick', timeLeft: timeLeft });
    } else {
        // Timer has finished.
        clearInterval(timerInterval);
        timerInterval = null;

        const oldState = state.mode;
        let sessionType = 'study'; // Default session type for saving

        // Determine the next state in the Pomodoro cycle.
        if (state.mode === 'work') {
            state.sessions++;
            sessionType = 'study';
            // Check if it's time for a long break.
            if (state.sessions > 0 && state.sessions % settings.long_break_interval === 0) {
                state.mode = 'long_break';
            } else {
                state.mode = 'short_break';
            }
        } else { // Current state was a break.
            sessionType = 'break';
            state.mode = 'work'; // Transition back to work.
        }
        
        // Tell the main thread to save the completed session.
        const completedDuration = settings[oldState] * 60;
        self.postMessage({ type: 'sessionComplete', duration: completedDuration, sessionType: sessionType });

        // Tell the main thread to update the UI for the transition.
        self.postMessage({
            type: 'transition',
            newState: state.mode,
            oldState: oldState,
            autoStart: state.autoStart
        });
        
        // If auto-start is enabled, begin the next phase immediately.
        if (state.autoStart) {
            startNextPhase();
        }
    }
}

/**
 * Starts the very first work session.
 * @param {object} newSettings - The latest settings from the main UI.
 */
function startTimer(newSettings) {
    if (timerInterval) clearInterval(timerInterval);

    settings = newSettings;
    state.autoStart = newSettings.auto_start_breaks && newSettings.auto_start_focus;
    state.mode = 'work';
    state.sessions = 0;
    
    const durationInSeconds = settings[state.mode] * 60;
    // Set the single source of truth: the end time.
    state.endTime = Date.now() + durationInSeconds * 1000;

    self.postMessage({ type: 'statusUpdate', status: 'Work', color: '#10B981' });
    timerInterval = setInterval(tick, 1000);
    tick(); // Run once immediately to update UI without delay.
}

/**
 * Starts the next phase in the cycle (e.g., a break or a new work session).
 */
function startNextPhase() {
    if (timerInterval) clearInterval(timerInterval);
    
    const durationInSeconds = settings[state.mode] * 60;
    // Set the single source of truth for the new phase.
    state.endTime = Date.now() + durationInSeconds * 1000;
    
    let statusText = '';
    let statusColor = '#9ca3af';

    if (state.mode === 'work') {
        statusText = 'Work';
        statusColor = '#10B981'; // Green
    } else if (state.mode === 'short_break') {
        statusText = 'Short Break';
        statusColor = '#f59e0b'; // Amber
    } else if (state.mode === 'long_break') {
        statusText = 'Long Break';
        statusColor = '#3b82f6'; // Blue
    }

    self.postMessage({ type: 'statusUpdate', status: statusText, color: statusColor });
    timerInterval = setInterval(tick, 1000);
    tick(); // Run once immediately.
}

/**
 * Stops the timer completely.
 */
function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    state.endTime = 0;
}

// Listen for commands from the main thread.
self.onmessage = (e) => {
    const { command, newSettings } = e.data;

    switch (command) {
        case 'start':
            startTimer(newSettings);
            break;
        case 'startNext':
            startNextPhase();
            break;
        case 'stop':
            stopTimer();
            break;
    }
};
