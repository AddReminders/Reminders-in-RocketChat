import {
	IHttp,
	IModify,
	IPersistence,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { IProcessor } from '@rocket.chat/apps-engine/definition/scheduler';
import { IReminderJobContext } from '../definitions/Jobs';
import { JobId } from '../enums/Jobs';
import { calculateNextSchedulingTime } from '../lib/Dates';
import { sendRoomMessage } from '../lib/Message';
import { Reminder } from '../lib/Persistence/Models';
import {
	addBotToRoomIfNotAlreadyAdded,
	findDMWithBotOrCreate,
} from '../lib/Room/Room';
import { t } from '../lib/Translation/translation';
import { getUserPreferredLanguage } from '../lib/UserPreference';
import { isRecurringReminder } from '../lib/utils';
import { RemindApp } from '../RemindApp';
import { createReminderMsgBlocks } from '../ui/blocks/ReminderBlocks';
import { ReminderJob } from './ReminderJob';

// Deprecated, don't use this one.
// Just adding this for backward compatibility.
export class LegacyReminderJob {
	private jobName = JobId.LEGACY_REMINDER_JOB;
	constructor(private app: RemindApp) {}

	public getLegacyReminderJob(): IProcessor {
		const job: IProcessor = {
			id: this.jobName,
			processor: this.processor.bind(this),
		};
		return job;
	}

	private async processor(
		jobContext: IReminderJobContext,
		read: IRead,
		modify: IModify,
		_http: IHttp,
		persis: IPersistence,
	) {
		const { reminderId } = jobContext;
		if (!reminderId) {
			throw new Error('No reminderId or jobId provided');
		}

		const reminder = await Reminder.findOne(read.getPersistenceReader(), {
			id: reminderId,
		});
		if (!reminder) {
			throw new Error(
				`No reminder found with id ${reminderId}. Probably it was deleted`,
			);
		}

		const { createdBy, status, audience, frequency, dueDate } = reminder;
		if (status === 'completed') {
			throw new Error(
				`Reminder with id: ${reminderId}, has already been completed. Cannot process job.`,
			);
		}

		const creator = await read.getUserReader().getById(createdBy);
		if (!creator) {
			throw new Error(`No reminder creator found with id ${createdBy}`);
		}

		const appUser = await read.getUserReader().getAppUser(this.app.getID());
		if (!appUser) {
			throw new Error(
				`No app user found with app id ${this.app.getID()}`,
			);
		}

		const language = await getUserPreferredLanguage(
			this.app,
			read.getPersistenceReader(),
			createdBy,
		);

		// TODO: Some optimization here is possible. We don't need to do database calls for recurring reminders in this condition
		if (audience && audience.type) {
			const { ids, type, audienceIds = [] } = audience;
			// handle deprecated "audience.ids" field
			if (ids && ids.length > 0 && audienceIds.length === 0) {
				if (type === 'user') {
					for (const name of ids) {
						const user = await read
							.getUserReader()
							.getByUsername(name);
						if (!user) {
							this.app
								.getLogger()
								.warn('No user found with username', name);
							continue;
						}
						audienceIds.push(user.id);
					}
				} else if (type === 'room') {
					for (const name of ids) {
						const room = await read.getRoomReader().getByName(name);
						if (!room) {
							this.app
								.getLogger()
								.warn('No room found with name', name);
							continue;
						}
						audienceIds.push(room.id);
					}
				}
			}
			switch (type) {
				case 'room': {
					for (const roomId of audienceIds) {
						const room = await read.getRoomReader().getById(roomId);
						if (!room) {
							// TODO: notify reminder sender that the room doesn't exist
							throw new Error(`No room found with id ${roomId}`);
						}

						try {
							await addBotToRoomIfNotAlreadyAdded(
								room,
								read,
								modify,
								appUser,
							);
						} catch (e) {
							this.app
								.getLogger()
								.error('Error adding bot to room', e);
						}

						await sendRoomMessage(
							modify,
							appUser,
							room,
							t(
								'room_reminder_from_user_with_name_with_description',
								language,
								{
									reminderCreatorUsername: creator.username,
									description: reminder.description,
								},
							),
						);
					}
					break;
				}
				case 'user': {
					for (const userId of audienceIds) {
						const user = await read.getUserReader().getById(userId);
						if (!user) {
							// TODO: notify reminder sender that the room doesn't exist
							throw new Error(`No user found with id ${userId}`);
						}

						const dmRoom = await findDMWithBotOrCreate(
							read,
							modify,
							user,
							appUser,
						);

						await sendRoomMessage(
							modify,
							appUser,
							dmRoom,
							t(
								'user_reminder_from_user_with_name_with_description',
								language,
								{
									reminderCreatorUsername: creator.username,
									description: reminder.description,
								},
							),
						);
					}

					break;
				}
			}

			if (!isRecurringReminder(frequency)) {
				await Reminder.markReminderAsComplete(read, persis, reminder);
			}
		} else {
			// personal reminder
			const dmRoom = await findDMWithBotOrCreate(
				read,
				modify,
				creator,
				appUser,
			);

			if (reminder.linkedMessage) {
				try {
					const { roomId } = reminder;
					const room = await read.getRoomReader().getById(roomId);
					if (!room) {
						throw new Error(`No room found with id ${roomId}`);
					}

					await addBotToRoomIfNotAlreadyAdded(
						room,
						read,
						modify,
						appUser,
					);
				} catch (e) {
					this.app
						.getLogger()
						.error(
							'Something went wrong while trying to add bot user to room',
							e,
						);
				}
			}

			const { blocks, previewMsgForNotifications } =
				await createReminderMsgBlocks(
					read,
					modify,
					this.app.getLogger(),
					reminder,
					creator,
					language,
				);

			const newMsgId = await sendRoomMessage(
				modify,
				appUser,
				dmRoom,
				previewMsgForNotifications, // for message previews within notifications & sidebar notification
				undefined,
				blocks,
				// Only in case of a reminder for message in DM, no bot will be added to the room so parseUrl message preview won't work
				reminder.linkedMessage?.metadata?.fromRoom?.type ===
					RoomType.DIRECT_MESSAGE,
			);

			await Reminder.insertOrUpdate(persis, {
				...reminder,
				messageId: newMsgId,
			});
		}

		this.app.getLogger().info(`Reminder ${reminderId} has been sent out`);

		if (isRecurringReminder(frequency)) {
			this.app
				.getLogger()
				.info(`Scheduling next reminder for ${reminderId}`);

			const nextDueDate = calculateNextSchedulingTime(dueDate, frequency);

			reminder.dueDate = nextDueDate;

			const jobId = await new ReminderJob(this.app).scheduleReminder(
				modify.getScheduler(),
				reminder.id,
				reminder.dueDate,
			);
			reminder.schedularJobId = jobId;

			await Reminder.insertOrUpdate(persis, reminder);

			this.app
				.getLogger()
				.info(
					`Scheduled next reminder for ${nextDueDate} with reminderId ${reminderId}`,
				);
		}
	}
}
