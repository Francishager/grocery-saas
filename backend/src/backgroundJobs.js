import { expireTrash } from './services/trashService.js'
import { deliverDuePlannerReminders } from './services/plannerReminders.js'
import { runPropertyRentAutomation } from './routes/propertyManagement.js'

export function startBackgroundJobs() {
  const timers = []
  const run = (label, task) => {
    Promise.resolve()
      .then(task)
      .catch((error) => console.error(`${label} failed:`, error.code || error.message))
  }

  const trashTimer = setInterval(() => run('Trash expiry', expireTrash), 60 * 60 * 1000)
  const rentTimer = setInterval(() => run('Property rent automation', runPropertyRentAutomation), 6 * 60 * 60 * 1000)
  const plannerTimer = setInterval(() => run('Planner reminder check', deliverDuePlannerReminders), 60_000)
  timers.push(trashTimer, rentTimer, plannerTimer)

  const rentInitialTimer = setTimeout(() => run('Initial property rent automation', runPropertyRentAutomation), 30_000)
  const plannerInitialTimer = setTimeout(() => run('Initial planner reminder check', deliverDuePlannerReminders), 20_000)
  timers.push(rentInitialTimer, plannerInitialTimer)
  timers.forEach((timer) => timer.unref())

  return () => timers.forEach((timer) => clearInterval(timer))
}
