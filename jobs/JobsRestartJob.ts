import {
	IRead,
	IModify,
	IPersistence,
	IHttp,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
	IProcessor,
	StartupType,
} from '@rocket.chat/apps-engine/definition/scheduler';
import { AppSetting } from '../config/Settings';
import { InternalJobsLastRun, Reminder } from '../lib/Persistence/Models';
import {
	getBackupUser,
	isRecurringReminder,
	parseBackupInterval,
	uuid,
} from '../lib/utils';
import { JobId } from '../enums/Jobs';
import { addSecondsToDate, calculateNextSchedulingTime } from '../lib/Dates';
import { IRestartJobContext } from '../definitions/Jobs';
import { ReminderJob } from './ReminderJob';
import { defineBackupRoom } from '../lib/Room/BackupRoom';
import { sendRoomMessage } from '../lib/Message';
import { scheduleAndLockJob } from './utils';
import { RemindApp } from '../RemindApp';
import { JobIdsWithLock } from '../definitions/Persistence';

export class JobsRestartJob {
	private jobId = JobId.JOBS_RESTART_JOB;
	constructor(private app: RemindApp) {}

	public getJobsRestartJob(): IProcessor {
		const job: IProcessor = {
			id: this.jobId,
			startupSetting: {
				type: StartupType.ONETIME,
				when: '10 seconds',
				data: {
					restartReminderJobs: false,
				},
			},
			processor: this.processor.bind(this),
		};
		return job;
	}

	private async processor(
		jobContext: IRestartJobContext,
		read: IRead,
		modify: IModify,
		_http: IHttp,
		persis: IPersistence,
	) {
		this.app
			.getLogger()
			.info(
				`Attempting to restart jobs now with jobContext: ${JSON.stringify(
					jobContext,
				)}`,
			);

		const { restartReminderJobs } = jobContext;

		if (restartReminderJobs) {
			await this.restartReminderJobs(read, modify, persis);
		} else {
			let internalJobsLastRun = await InternalJobsLastRun.findOne(
				read.getPersistenceReader(),
				{},
			);
			if (!internalJobsLastRun) {
				internalJobsLastRun = {};
			}

			this.app
				.getLogger()
				.debug(
					`Found internalJobsLastRun: ${JSON.stringify(
						internalJobsLastRun,
					)}`,
				);

			await this.genericRestartJobIfNeeded(
				read,
				modify,
				persis,
				JobId.BACKUP_JOB,
				internalJobsLastRun?.[JobId.BACKUP_JOB],
			);

			await this.genericRestartJobIfNeeded(
				read,
				modify,
				persis,
				JobId.DAILY_REMINDER_CALCULATION_JOB,
				internalJobsLastRun?.[JobId.DAILY_REMINDER_CALCULATION_JOB],
			);

			await this.genericRestartJobIfNeeded(
				read,
				modify,
				persis,
				JobId.STATS_COLLECTOR_JOB,
				internalJobsLastRun?.[JobId.STATS_COLLECTOR_JOB],
			);
		}

		this.app.getLogger().info('All Jobs restarted');
	}

	private async restartReminderJobs(
		read: IRead,
		modify: IModify,
		persis: IPersistence,
	): Promise<void> {
		this.app.getLogger().info('Attempting to restart reminder jobs now');

		this.app
			.getLogger()
			.info('Canceling all existing reminder jobs (If any)');
		await modify.getScheduler().cancelJob(JobId.REMINDERS_JOB);
		this.app.getLogger().info('All existing reminder jobs canceled');

		this.app.getLogger().info('Fetching all active reminders');
		const allReminders = await Reminder.findAll(
			read.getPersistenceReader(),
			{ status: 'active' },
		);
		if (!allReminders || allReminders.length === 0) {
			this.app.getLogger().info('No reminders to restart');
			await this.sendBackupRestorationCompleteMessage(read, modify, {
				restartedRecurringReminderJobs: 0,
				restartedSingleReminderJobs: 0,
			});
			return;
		}
		this.app
			.getLogger()
			.info(
				`Found ${
					allReminders.length
				} reminders. Processing them... Started at ${new Date().toString()}`,
			);

		let restartedRecurringReminderJobs = 0;
		const restartedRecurringReminderJobIds: string[] = [];
		let restartedSingleReminderJobs = 0;
		const restartedSingleReminderJobIds: string[] = [];

		for (const reminder of allReminders) {
			const { id: reminderId, frequency, dueDate } = reminder;
			if (isRecurringReminder(frequency)) {
				let nextScheduleTime = dueDate;
				if (dueDate.getTime() < new Date().getTime()) {
					nextScheduleTime = calculateNextSchedulingTime(
						dueDate,
						frequency,
					);
				}

				reminder.dueDate = nextScheduleTime;

				const jobId = await new ReminderJob(this.app).scheduleReminder(
					modify.getScheduler(),
					reminder.id,
					nextScheduleTime,
				);
				reminder.schedularJobId = jobId;

				await Reminder.insertOrUpdate(persis, reminder);
				restartedRecurringReminderJobs++;
				restartedRecurringReminderJobIds.push(reminderId);
			} else {
				if (dueDate.getTime() < new Date().getTime()) {
					// skip past reminders
					if (reminder.status === 'active') {
						// TODO: Not sure if we want to handle this case.
					}
					continue;
				}

				const jobId = await new ReminderJob(this.app).scheduleReminder(
					modify.getScheduler(),
					reminder.id,
					dueDate,
				);
				reminder.schedularJobId = jobId;

				await Reminder.insertOrUpdate(persis, reminder);

				restartedSingleReminderJobs++;
				restartedSingleReminderJobIds.push(reminderId);
			}
		}

		this.app
			.getLogger()
			.info(
				`Processed ${
					allReminders.length
				} reminders. Completed at ${new Date().toString()}. Restarted ${restartedRecurringReminderJobs} recurring reminders and ${restartedSingleReminderJobs} single reminders.`,
			);
		this.app
			.getLogger()
			.info(
				`Restarted recurring reminder jobs: ${restartedRecurringReminderJobIds}`,
			);
		this.app
			.getLogger()
			.info(
				`Restarted single reminder jobs: ${restartedSingleReminderJobIds}`,
			);

		await this.sendBackupRestorationCompleteMessage(read, modify, {
			restartedRecurringReminderJobs,
			restartedSingleReminderJobs,
		});
	}

	private async genericRestartJobIfNeeded(
		read: IRead,
		modify: IModify,
		persis: IPersistence,
		jobId: JobIdsWithLock,
		lastRun?: Date,
	): Promise<void> {
		this.app
			.getLogger()
			.info(`Checking if ${jobId} job needs to be restarted`);

		const { interval, secondsUntilRestart } =
			await this.getJobIntervalAndSecondsUntilRestart(read, jobId);

		this.app
			.getLogger()
			.debug(
				`Job ${jobId} has an interval of ${interval} hours and will be restarted in ${secondsUntilRestart} seconds if it hasn't run in ${interval} hours.`,
			);

		let shouldRestartJob = false;

		if (!lastRun) {
			this.app
				.getLogger()
				.debug(
					`${jobId} job was never run before. Restarting ${jobId} job now.`,
				);
			shouldRestartJob = true;
		} else {
			const hoursSinceLastRun =
				(lastRun.getTime() - new Date().getTime()) / (1000 * 60 * 60);

			if (hoursSinceLastRun > interval) {
				this.app
					.getLogger()
					.debug(
						`${jobId} job was last run ${hoursSinceLastRun} hours ago which is more than ${interval} hours. Restarting ${jobId} job now.`,
					);

				shouldRestartJob = true;
			}
		}

		if (!shouldRestartJob) {
			this.app.getLogger().debug(`No need to restart ${jobId} job.`);
			return;
		}

		const jobTriggerId = uuid();
		this.app
			.getLogger()
			.debug(
				`Attempting to restart ${jobId} job now with trigger id ${jobTriggerId}.`,
			);
		const nextJobTime = addSecondsToDate(new Date(), secondsUntilRestart);

		await scheduleAndLockJob(modify, persis, jobId, nextJobTime, {
			triggerId: jobTriggerId,
		});

		this.app
			.getLogger()
			.info(
				`Successfully restarted ${jobId} job. Next run at ${nextJobTime.toString()}`,
			);
	}

	private async getJobIntervalAndSecondsUntilRestart(
		read: IRead,
		jobId: JobIdsWithLock,
	): Promise<{
		interval: number;
		secondsUntilRestart: number;
	}> {
		switch (jobId) {
			case JobId.BACKUP_JOB: {
				const interval = parseBackupInterval(
					await read
						.getEnvironmentReader()
						.getSettings()
						.getValueById(AppSetting.BackupInterval),
				);
				return {
					interval,
					secondsUntilRestart: 10,
				};
			}
			case JobId.DAILY_REMINDER_CALCULATION_JOB: {
				return {
					interval: 24,
					secondsUntilRestart: 20,
				};
			}
			case JobId.STATS_COLLECTOR_JOB: {
				return {
					interval: 48,
					secondsUntilRestart: 30,
				};
			}
			default: {
				throw new Error(
					`Unable to get interval and seconds until restart for job id ${jobId}`,
				);
			}
		}
	}

	private async sendBackupRestorationCompleteMessage(
		read: IRead,
		modify: IModify,
		restartData: {
			restartedRecurringReminderJobs: number;
			restartedSingleReminderJobs: number;
		},
	) {
		try {
			const backupUser = await getBackupUser(read, this.app.getLogger());
			if (!backupUser) {
				this.app
					.getLogger()
					.error(
						'Unable to create backup since backup user not found',
					);
				return;
			}

			const backupChannel = await defineBackupRoom(
				this.app,
				read,
				modify,
				[backupUser],
			);
			if (!backupChannel) {
				this.app
					.getLogger()
					.error(
						'Backup channel not found. Unable to create backup :(',
					);
				return;
			}

			const {
				restartedRecurringReminderJobs,
				restartedSingleReminderJobs,
			} = restartData;

			await sendRoomMessage(
				modify,
				backupUser,
				backupChannel,
				`Successfully restored backup!!!\n\nRestarted ${restartedRecurringReminderJobs} recurring reminders jobs and ${restartedSingleReminderJobs} single reminders jobs. :tada:\n\nNote: Reminder jobs that were due in the past or were mark as completed were not restarted, so you may see some difference between the numbers here and the number of reminders on the backup message.`,
			);
		} catch (e) {
			this.app
				.getLogger()
				.error('Error sending backup initiated message: ' + e.message);
			this.app.getLogger().error(e);
		}
	}
}
