// Important note:
// 1. Any jobId string cannot be exactly 12 char long, because it is will be considered as an mongoDb objectId by apps-engine.
// 2. JobId string cannot have underscore in it because apps-engine does some parsing based on underscore character.
export enum JobId {
	LEGACY_REMINDER_JOB = 'reminder-job', // Deprecated, don't use this one.
	REMINDERS_JOB = 'reminders-job',
	STATS_COLLECTOR_JOB = 'stats-job',
	DAILY_REMINDER_CALCULATION_JOB = 'daily-reminder-calculation-job',
	DAILY_REMINDER_JOB = 'daily-reminder-job',
	JOBS_RESTART_JOB = 'jobs-restart-job', // this job is used to restart jobs when a app gets disabled & then enabled again
	BACKUP_JOB = 'backup-job',
}
