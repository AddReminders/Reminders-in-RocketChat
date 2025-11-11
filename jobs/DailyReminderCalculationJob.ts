import {
	IRead,
	IModify,
	IHttp,
	IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IProcessor } from '@rocket.chat/apps-engine/definition/scheduler';
import { AppSetting } from '../config/Settings';
import { IReminder } from '../definitions/IReminder';
import {
	IDailyReminderJobContext,
	IJobWithTriggerId,
} from '../definitions/Jobs';
import { JobId } from '../enums/Jobs';
import { addHoursToDate, CustomDate } from '../lib/Dates';
import { InternalJobsLastRun, Reminder } from '../lib/Persistence/Models';
import { isRecurringReminder, uuid } from '../lib/utils';
import { RemindApp } from '../RemindApp';
import { scheduleAndLockJob, shouldExecuteJob } from './utils';

export class DailyReminderCalculationJob {
	private jobId: JobId.DAILY_REMINDER_CALCULATION_JOB =
		JobId.DAILY_REMINDER_CALCULATION_JOB;
	constructor(private app: RemindApp) {}

	public getDailyPendingJob(): IProcessor {
		const job: IProcessor = {
			id: this.jobId,
			processor: this.processor.bind(this),
		};
		return job;
	}

	private async processor(
		jobContext: IJobWithTriggerId,
		read: IRead,
		modify: IModify,
		_http: IHttp,
		persis: IPersistence,
	) {
		this.app
			.getLogger()
			.info(
				'Attempting to schedule jobs for users with active reminders',
			);

		const { triggerId } = jobContext;

		if (
			!(await shouldExecuteJob(
				read,
				this.jobId,
				triggerId,
				this.app.getLogger(),
			))
		) {
			return;
		}

		const isDailyReminderSummaryEnabled = await this.app.getCachedValue(
			AppSetting.SendOutDailyReminderSummary,
		);

		this.app
			.getLogger()
			.debug(
				`Daily reminder summary setting enabled: ${isDailyReminderSummaryEnabled}`,
			);
		if (!isDailyReminderSummaryEnabled) {
			this.app
				.getLogger()
				.info(
					'Daily reminder summary is disabled, skipping daily reminder calculation',
				);
			return;
		}

		try {
			await modify.getScheduler().cancelJob(JobId.DAILY_REMINDER_JOB);

			// get all active jobs
			const allActiveReminders = await Reminder.findAll(
				read.getPersistenceReader(),
				{
					status: 'active',
				},
			);
			// get all users and its respective timezone from active reminders
			const allUsersWithActiveReminders: { [key: string]: Date } =
				allActiveReminders
					// filter out recurring reminders
					.filter((reminder) => {
						return !isRecurringReminder(reminder.frequency);
					})
					// sort by reminder created time in descending order
					.sort((a, b) => {
						return b.createdAt.getTime() - a.createdAt.getTime();
					})
					// add necessary fields to the pipeline
					.map<
						IReminder & {
							dailyReminderJobServerTime: Date;
							dailyReminderJobUserTime: Date;
							dueDateUserTime: CustomDate;
						}
					>((reminder) => {
						const {
							dueDate,
							timeZone: { utcOffset },
						} = reminder;

						let jobUserTimezone = new Date(
							new Date().getTime() + utcOffset * 60 * 60 * 1000,
						);

						if (jobUserTimezone.getUTCHours() > 9) {
							jobUserTimezone = addHoursToDate(
								jobUserTimezone,
								24,
							);
						}

						jobUserTimezone.setUTCHours(9);
						jobUserTimezone.setUTCMinutes(0);
						jobUserTimezone.setUTCSeconds(0);
						jobUserTimezone.setUTCMilliseconds(0);

						const jobServerTimezone = new Date(
							jobUserTimezone.getTime() -
								utcOffset * 60 * 60 * 1000,
						);

						const dueDateUserTime = new CustomDate(
							dueDate.getTime() + utcOffset * 60 * 60 * 1000,
						);

						return {
							...reminder,
							dailyReminderJobServerTime: jobServerTimezone,
							dailyReminderJobUserTime: jobUserTimezone,
							dueDateUserTime,
						};
					})
					// filter out only past reminders and reminder due to be scheduled next day
					.filter((reminder) => {
						const {
							dueDateUserTime,
							dailyReminderJobUserTime: dailyReminderJobUserTime,
						} = reminder;

						if (dueDateUserTime.getTime() < Date.now()) {
							// past reminders
							return true;
						}

						// Reminders due exactly on the next day aka the day when the job is scheduled
						if (
							dueDateUserTime.isSameUTCDay(
								dailyReminderJobUserTime,
							)
						) {
							return true;
						}
						// Ignore reminders that are not due on the next day
						return false;
					})
					.reduce((acc, reminder) => {
						const userId = reminder.createdBy;
						if (!acc[userId]) {
							acc[userId] = reminder.dailyReminderJobServerTime;
						}
						return acc;
					}, {});
			// for each user, schedule a job for 9AM based on their timezone

			for (const userId of Object.keys(allUsersWithActiveReminders)) {
				const dailyReminderJobTime =
					allUsersWithActiveReminders[userId];

				await modify.getScheduler().scheduleOnce({
					id: JobId.DAILY_REMINDER_JOB,
					when: dailyReminderJobTime,
					data: {
						userId,
					} as IDailyReminderJobContext,
				});
			}

			this.app
				.getLogger()
				.info(
					`Successfully scheduled jobs for ${
						Object.keys(allUsersWithActiveReminders).length
					} users with active reminders`,
				);
		} catch (e) {
			this.app
				.getLogger()
				.error(
					'Error occurred while in daily reminder calculation job',
					e,
				);
		} finally {
			const dailyReminderCalcJobTriggerId = uuid();
			this.app
				.getLogger()
				.debug(
					`Scheduling next daily reminder calculation job in 24 hours with triggerId: ${dailyReminderCalcJobTriggerId}`,
				);
			await scheduleAndLockJob(
				modify,
				persis,
				this.jobId,
				addHoursToDate(new Date(), 24),
				{
					triggerId: dailyReminderCalcJobTriggerId,
				},
			);

			this.app
				.getLogger()
				.debug(
					`Successfully scheduled next daily reminder calculation job in 24 hours with triggerId: ${dailyReminderCalcJobTriggerId}. Updating last run...`,
				);

			await InternalJobsLastRun.updateLastRun(
				read.getPersistenceReader(),
				persis,
				this.jobId,
			);

			this.app
				.getLogger()
				.debug(
					`Successfully updated last run for daily reminder calculation job`,
				);
		}
	}
}
