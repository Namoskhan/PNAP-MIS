const { runAutomatedMonthlyCheck } = require('./donationReminderService');

let timer = null;

function startReminderScheduler() {
  if (timer) return;

  // Run initial check 15 seconds after startup
  setTimeout(() => {
    runAutomatedMonthlyCheck().catch((err) => {
      console.error('[reminderScheduler] initial sweep failed:', err.message);
    });
  }, 15000);

  // Then schedule daily check every 24 hours
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  timer = setInterval(() => {
    runAutomatedMonthlyCheck().catch((err) => {
      console.error('[reminderScheduler] periodic sweep failed:', err.message);
    });
  }, TWENTY_FOUR_HOURS);

  console.log('[reminderScheduler] automated monthly donation check scheduler registered (runs daily)');
}

function stopReminderScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startReminderScheduler, stopReminderScheduler };
