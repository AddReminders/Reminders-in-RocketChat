import {
	IModify,
	IPersistence,
	IRead,
	ISchedulerModify,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IApp } from '@rocket.chat/apps-engine/definition/IApp';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { IReminder } from '../definitions/IReminder';
import { ReminderJob } from '../jobs/ReminderJob';
import { RemindApp } from '../RemindApp';
import {
	addLinkedMessagePreviewBlock,
	resolveTranslatedRoomName,
	resolveTranslatedUserNameInfo,
	updateRoomMessageAfterRemovingPreviousContent,
} from './Message';
import { Reminder } from './Persistence/Models';
import { Language, t } from './Translation/translation';

export const snoozeReminderPreCheck = (
	reminder: IReminder,
): {
	errorI18n?: 'reminder_already_completed' | 'reminder_already_snoozed';
} => {
	if (reminder.status === 'completed') {
		return {
			errorI18n: 'reminder_already_completed',
		};
	}

	if (reminder.dueDate.getTime() > new Date().getTime()) {
		return {
			errorI18n: 'reminder_already_snoozed',
		};
	}

	return {};
};

export const snoozeReminder = async (
	app: RemindApp,
	schedular: ISchedulerModify,
	persistence: IPersistence,
	existingReminder: IReminder,
	nextDueDate: Date,
): Promise<IReminder> => {
	const newJobId = await new ReminderJob(app).scheduleReminder(
		schedular,
		existingReminder.id,
		nextDueDate,
	);

	const newReminderData = {
		...existingReminder,
		dueDate: nextDueDate,
		schedularJobId: newJobId,
	};
	await Reminder.insertOrUpdate(persistence, newReminderData);

	return newReminderData;
};

export const postSnoozeReminder = async (
	read: IRead,
	app: IApp,
	modify: IModify,
	language: Language,
	reminder: IReminder,
	nextDueDateMsgString: string,
	currentUsername: string,
) => {
	// after snoozing the reminder, we need to update the reminder message that was sent out (if any)
	try {
		const {
			messageId,
			id: reminderId,
			linkedMessage,
			description,
		} = reminder;
		if (!messageId) {
			throw new Error(
				`Error! Unable to get the messageId for reminder with id ${reminderId}. Perhaps the reminder was not yet sent to the room?`,
			);
		}
		const appUser = await read.getUserReader().getAppUser(app.getID());
		if (!appUser) {
			throw new Error('Error! Unable to get the app user');
		}

		const block = modify.getCreator().getBlockBuilder();

		if (linkedMessage) {
			const {
				url,
				msgAdditionalInfoPreview,
				metadata: { fromRoom, fromUser } = {},
				id: linkedMessageId,
			} = linkedMessage;

			let reminderSnoozedMessage = t('reminder_snoozed', language, {
				nextScheduledTime: nextDueDateMsgString,
			});

			// This reminder has been snoozed! I'll remind you about this message from @Bunny Smarty in #general (with note "test note") as complete.
			if (msgAdditionalInfoPreview || !fromRoom || !fromUser) {
				/* deprecated */
				reminderSnoozedMessage = `This reminder has been snoozed!  I'll remind you about [this message](${url}) ${msgAdditionalInfoPreview}, ${nextDueDateMsgString}.`;
			} else {
				reminderSnoozedMessage = t(
					description
						? 'reminder_snoozed_for_message_with_note'
						: 'reminder_snoozed_for_message',
					language,
					{
						messageUrl: url,
						userName: resolveTranslatedUserNameInfo(
							fromUser,
							currentUsername,
							language,
						),
						roomName: resolveTranslatedRoomName(
							fromRoom,
							fromRoom.type === 'unknown' ? '' : fromRoom.url,
							language,
						),
						nextScheduledTime: nextDueDateMsgString,
						...(description && { note: description }),
					},
				);
			}

			block.addSectionBlock({
				text: block.newMarkdownTextObject(reminderSnoozedMessage),
			});

			// add message preview in-case message is from a Direct Message room as bot isn't part of DM room,
			// so it won't be able to render message preview
			if (fromRoom && fromRoom.type === RoomType.DIRECT_MESSAGE) {
				await addLinkedMessagePreviewBlock(
					block,
					app.getLogger(),
					read,
					linkedMessageId,
				);
			}
		} else {
			const reminderSnoozedMessage = t(
				'reminder_snoozed_with_description',
				language,
				{
					description: reminder.description,
					nextScheduledTime: nextDueDateMsgString,
				},
			);

			block.addSectionBlock({
				text: block.newMarkdownTextObject(reminderSnoozedMessage),
			});
		}

		block.addActionsBlock({
			elements: [
				block.newButtonElement({
					text: block.newPlainTextObject(
						t('view_all_reminders', language),
					),
					actionId: 'view-all-reminders',
				}),
				block.newButtonElement({
					text: block.newPlainTextObject(
						t('hide_this_message', language),
					),
					actionId: 'hide-msg',
				}),
			],
		});

		await updateRoomMessageAfterRemovingPreviousContent(
			modify,
			messageId,
			appUser,
			{
				blocks: block,
				text: ' ',
			},
		);
	} catch (error) {
		// TODO: Right now we're failing silently here, but we should probably do something here
		// Also note, If a user marks a reminder as complete, but the message is not sent to the room yet(i.e. from upcoming reminders in list), then also this error will be thrown.
		app.getLogger().error(error);
	}
};
