import {
	IRead,
	IModify,
	IPersistence,
	IHttp,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IProcessor } from '@rocket.chat/apps-engine/definition/scheduler';
import {
	BlockBuilder,
	ButtonStyle,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { AppSetting } from '../config/Settings';
import { IReminder } from '../definitions/IReminder';
import { IDailyReminderJobContext } from '../definitions/Jobs';
import { JobId } from '../enums/Jobs';
import { CustomDate } from '../lib/Dates';
import { sendRoomMessage } from '../lib/Message';
import { Reminder } from '../lib/Persistence/Models';
import { findDMWithBotOrCreate } from '../lib/Room/Room';
import { t } from '../lib/Translation/translation';
import { getUserPreferredLanguage } from '../lib/UserPreference';
import { isRecurringReminder } from '../lib/utils';
import { RemindApp } from '../RemindApp';

export class DailyReminderJob {
	private jobId = JobId.DAILY_REMINDER_JOB;
	constructor(private app: RemindApp) {}

	public getDailyReminderJob(): IProcessor {
		const job: IProcessor = {
			id: this.jobId,
			processor: this.processor.bind(this),
		};
		return job;
	}

	private async processor(
		jobContext: IDailyReminderJobContext,
		read: IRead,
		modify: IModify,
		_http: IHttp,
		_persis: IPersistence,
	) {
		const { userId } = jobContext;

		if (!userId) {
			this.app.getLogger().error('Missing userId or localJobId');
			return;
		}

		this.app
			.getLogger()
			.info(`Processing daily reminder job for user ${userId}`);

		const isDailyReminderSummaryEnabled = await this.app.getCachedValue(
			AppSetting.SendOutDailyReminderSummary,
		);

		if (!isDailyReminderSummaryEnabled) {
			this.app
				.getLogger()
				.debug(
					`Daily reminder summary is disabled. Skipping daily reminder job for user ${userId}`,
				);
			return;
		}

		const creator = await read.getUserReader().getById(userId);
		if (!creator) {
			throw new Error(`No reminder creator found with id ${userId}`);
		}

		const allActiveRemindersForUser = await Reminder.findAll(
			read.getPersistenceReader(),
			{
				createdBy: userId,
				status: 'active',
			},
		);

		if (!allActiveRemindersForUser || !allActiveRemindersForUser.length) {
			this.app
				.getLogger()
				.info(
					`No active reminders found for user ${userId}, so skipping`,
				);
			return;
		}

		const upcomingReminders: IReminder[] = [];
		const pastReminders: IReminder[] = [];

		// calculate total upcoming and past reminders
		allActiveRemindersForUser
			.filter(
				({ status, frequency }) =>
					status === 'active' && !isRecurringReminder(frequency),
			)
			.forEach((reminder) => {
				const {
					dueDate,
					timeZone: { utcOffset },
				} = reminder;

				const dueDateUserTime = new CustomDate(
					dueDate.getTime() + utcOffset * 60 * 60 * 1000,
				);
				const currentUserTime = new Date(
					new Date().getTime() + utcOffset * 60 * 60 * 1000,
				);

				if (dueDateUserTime.isSameUTCDay(currentUserTime)) {
					upcomingReminders.push(reminder);
				} else if (
					dueDateUserTime.getTime() < currentUserTime.getTime()
				) {
					pastReminders.push(reminder);
				}
			});

		const reminderMsg = await this.getDailyReminderMessageBlocks(
			read,
			modify,
			creator,
			upcomingReminders.length,
			pastReminders.length,
		);
		if (!reminderMsg) {
			this.app.getLogger().debug('No reminder message to send');
			return;
		}

		const { notificationMsg, reminderMsgBlocks } = reminderMsg;

		const appUser = await this.app.getCachedValue('appUser');

		const dmRoom = await findDMWithBotOrCreate(
			read,
			modify,
			creator,
			appUser,
		);

		await sendRoomMessage(
			modify,
			appUser,
			dmRoom,
			notificationMsg,
			undefined,
			reminderMsgBlocks,
		);
	}

	private async getDailyReminderMessageBlocks(
		read: IRead,
		modify: IModify,
		user: IUser,
		upcomingRemindersCount: number,
		pastRemindersCount: number,
	): Promise<
		{ reminderMsgBlocks: BlockBuilder; notificationMsg: string } | undefined
	> {
		const { id: userId } = user;

		const language = await getUserPreferredLanguage(
			this.app,
			read.getPersistenceReader(),
			userId,
		);

		let dailyReminderSummaryMsg = '';
		if (upcomingRemindersCount && pastRemindersCount) {
			dailyReminderSummaryMsg = t(
				'daily_reminder_info_upcoming_and_past_reminder',
				language,
				{
					upcomingRemindersCount,
					pastRemindersCount,
				},
			);
		} else if (upcomingRemindersCount) {
			dailyReminderSummaryMsg = t(
				'daily_reminder_info_upcoming_reminder',
				language,
				{
					upcomingRemindersCount,
				},
			);
		} else if (pastRemindersCount) {
			dailyReminderSummaryMsg = t(
				'daily_reminder_info_past_reminder',
				language,
				{
					pastRemindersCount,
				},
			);
		}

		if (!dailyReminderSummaryMsg) {
			return;
		}

		const block = modify.getCreator().getBlockBuilder();

		const firstName = user.name ? user.name.split(' ')[0] : '';
		block.addSectionBlock({
			text: block.newMarkdownTextObject(
				t('daily_reminder_msg_intro', language, {
					userName: firstName,
				}),
			),
		});
		block.addSectionBlock({
			text: block.newMarkdownTextObject(dailyReminderSummaryMsg),
		});
		block.addActionsBlock({
			elements: [
				block.newButtonElement({
					text: block.newPlainTextObject(
						t('view_all_reminders', language),
					),
					actionId: 'view-all-reminders',
					style: ButtonStyle.PRIMARY,
				}),
			],
		});

		return {
			reminderMsgBlocks: block,
			notificationMsg: dailyReminderSummaryMsg,
		};
	}
}
