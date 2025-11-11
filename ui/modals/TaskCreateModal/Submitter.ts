import {
	IModify,
	IPersistence,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
	IUIKitResponse,
	UIKitViewSubmitInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IReminderCreateModalUiData } from '../../../definitions/Persistence';
import { IReminder } from '../../../definitions/IReminder';
import { IReminderCreateModalState } from '../../../definitions/uiStates';
import {
	Reminder,
	ReminderCreateModalUiData,
} from '../../../lib/Persistence/Models';
import { uuid } from '../../../lib/utils';
import {
	formatDateTimeForMsg,
	getDateWithUTCOffset,
	getFormattedTimezoneForMsgFromUtcOffset,
	parseDateAndTimeStringFromUI,
} from '../../../lib/Dates';
import { ReminderJob } from '../../../jobs/ReminderJob';
import { sendRoomMessage } from '../../../lib/Message';
import { reminderCreatedModal } from '../ReminderCreatedModal';
import { RecurringReminderFrequencies } from '../../../enums/Ui';
import { convertFrequencyToText } from '../../blocks/utils';
import { Language, t } from '../../../lib/Translation/translation';
import { getUserPreference } from '../../../lib/UserPreference';
import { RemindApp } from '../../../RemindApp';

export const submitTaskCreateModal = async ({
	app,
	context,
	modify,
	read,
	persistence,
}: {
	app: RemindApp;
	context: UIKitViewSubmitInteractionContext;
	read: IRead;
	modify: IModify;
	persistence: IPersistence;
}): Promise<IUIKitResponse> => {
	const {
		view: { id: viewId, state: taskState },
		user: { id: userId } = { id: '' },
	} = context.getInteractionData();

	const userPreference = await getUserPreference(
		app,
		read.getPersistenceReader(),
		userId,
	);
	const { language } = userPreference;

	const reminderUiData = await ReminderCreateModalUiData.findOne(
		read.getPersistenceReader(),
		{
			viewId,
		},
	);
	if (!reminderUiData) {
		throw new Error('Error! No answer poll data found');
	}

	const { errors, reminder } = await validateModalAndTransform(
		app,
		read,
		reminderUiData,
		taskState as IReminderCreateModalState,
		language,
	);
	if (errors && Object.keys(errors).length > 0) {
		return context.getInteractionResponder().viewErrorResponse({
			viewId,
			errors,
		});
	}

	if (!reminder) {
		return context.getInteractionResponder().viewErrorResponse({
			viewId,
			errors: {
				name: t('please_complete_this_required_field', language),
			},
		});
	}

	if (reminder.audience) {
		const {
			audience: { type: audienceType, audienceIds },
			frequency,
		} = reminder;
		if (audienceType === 'room') {
			const { userUtcOffset, userId } = reminderUiData;

			const reminderCreator = await read.getUserReader().getById(userId);
			if (!reminderCreator) {
				throw new Error(`Error! No user found with id ${userId}`);
			}

			for (const roomId of audienceIds) {
				const room = await read.getRoomReader().getById(roomId);
				if (!room) {
					throw new Error(`Room with id: ${roomId} not found`);
				}

				const msg = t('channel_reminder_message', language, {
					description: reminder.description,
					time: formatDateTimeForMsg(
						reminder.dueDate,
						userUtcOffset || 0,
						userPreference,
					),
					frequency: convertFrequencyToText(frequency, language),
					timezone: getFormattedTimezoneForMsgFromUtcOffset(
						userUtcOffset || 0,
					),
				});

				await sendRoomMessage(modify, reminderCreator, room, msg);
			}
		}
	}

	const jobId = await new ReminderJob(app).scheduleReminder(
		modify.getScheduler(),
		reminder.id,
		reminder.dueDate,
	);
	reminder.schedularJobId = jobId;

	await Reminder.insertOrUpdate(persistence, reminder);

	const confirmationModal = reminderCreatedModal({
		modify,
		reminderDueDate: reminder.dueDate,
		userUtcOffset: reminderUiData.userUtcOffset || 0,
		viewId,
		userPreference,
	});

	return context
		.getInteractionResponder()
		.updateModalViewResponse(confirmationModal);
};

const validateModalAndTransform = async (
	app: RemindApp,
	read: IRead,
	reminderUiData: IReminderCreateModalUiData,
	reminderState: IReminderCreateModalState,
	language: Language,
): Promise<{
	errors?: { [key: string]: string } | undefined;
	reminder?: IReminder | undefined;
}> => {
	if (!reminderState || !reminderState.reminder) {
		return {
			errors: {
				date: t('please_complete_this_required_field', language),
				time: t('please_complete_this_required_field', language),
				description: t('please_complete_this_required_field', language),
			},
		};
	}

	const {
		reminder: { date, description, time, target_channel, target_user },
	} = reminderState;

	let {
		reminder: { frequency },
	} = reminderState;

	if (!date) {
		return {
			errors: {
				date: t('please_complete_this_required_field', language),
			},
		};
	}
	if (!time) {
		return {
			errors: {
				time: t('please_complete_this_required_field', language),
			},
		};
	}
	if (!description) {
		return {
			errors: {
				description: t('please_complete_this_required_field', language),
			},
		};
	}

	const { roomId, userId, userUtcOffset, recipientType } = reminderUiData;

	let audience: IReminder['audience'] | undefined = undefined;
	const targetAudience: string[] = [];

	if (!frequency) {
		frequency = RecurringReminderFrequencies.DO_NOT_REPEAT;
	}

	if (recipientType === 'user') {
		const targetAudienceUserIds: string[] = [];
		if (!target_user || !target_user.trim()) {
			return {
				errors: {
					target_user: t(
						'please_complete_this_required_field',
						language,
					),
				},
			};
		}
		target_user
			.split(',')
			.map((user) => {
				const trimmed = user.trim();
				return trimmed.startsWith('@') ? trimmed.substring(1) : trimmed;
			})
			.forEach((user) => targetAudience.push(user));

		// verify if all the users exist
		for (const username of targetAudience) {
			const user = await read.getUserReader().getByUsername(username);
			if (!user) {
				return {
					errors: {
						target_user: t(
							'user_with_username_not_found',
							language,
							{ username },
						),
					},
				};
			}

			targetAudienceUserIds.push(user.id);
		}

		audience = {
			type: 'user',
			audienceIds: targetAudienceUserIds,
		};
	} else if (recipientType === 'channel') {
		const targetAudienceChannelIds: string[] = [];
		if (!target_channel || !target_channel.trim()) {
			return {
				errors: {
					target_channel: t(
						'please_complete_this_required_field',
						language,
					),
				},
			};
		}
		target_channel
			.split(',')
			.map((channel) => {
				const trimmed = channel.trim();
				return trimmed.startsWith('#') ? trimmed.substring(1) : trimmed;
			})
			.forEach((user) => targetAudience.push(user));

		// verify if all the channels exist
		for (const roomName of targetAudience) {
			const targetRoom = await read.getRoomReader().getByName(roomName);
			if (!targetRoom) {
				return {
					errors: {
						target_channel: t(
							'room_with_name_not_found',
							language,
							{ roomName },
						),
					},
				};
			}
			targetAudienceChannelIds.push(targetRoom.id);
		}

		audience = {
			type: 'room',
			audienceIds: targetAudienceChannelIds,
		};
	}

	const dueDateInUTC = parseDateAndTimeStringFromUI(
		date,
		time,
		userUtcOffset || 0,
	);

	if (dueDateInUTC.getTime() < new Date().getTime()) {
		return {
			errors: {
				date: t('please_give_a_valid_time_in_future', language),
				time: t('please_give_a_valid_time_in_future', language),
			},
		};
	}

	const reminder: IReminder = {
		id: uuid(),
		roomId,
		createdBy: userId,
		createdAt: getDateWithUTCOffset(new Date(), 0),
		description,
		dueDate: dueDateInUTC,
		status: 'active',
		timeZone: {
			utcOffset: userUtcOffset || 0,
		},
		...(audience && { audience }),
		frequency,
	};

	return {
		reminder,
	};
};
