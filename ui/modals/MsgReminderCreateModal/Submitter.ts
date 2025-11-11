import {
	IModify,
	IPersistence,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
	IUIKitResponse,
	UIKitViewSubmitInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import {
	IMsgReminderCreateModalUiData,
	IPreference,
} from '../../../definitions/Persistence';
import { IReminder } from '../../../definitions/IReminder';
import {
	IMsgReminderCreateModalState,
	IReminderCreateModalState,
} from '../../../definitions/uiStates';
import {
	MsgReminderCreateModalUiData,
	Reminder,
} from '../../../lib/Persistence/Models';
import {
	getNextSnoozedDateAndMsg,
	getOnlyDateAsString,
	uuid,
} from '../../../lib/utils';
import {
	getDateWithUTCOffset,
	getNearestTimeIn15MinInterval,
	parseDateAndTimeStringFromUI,
} from '../../../lib/Dates';
import { ReminderJob } from '../../../jobs/ReminderJob';
import { resolveAdditionalInfoForReminderWithLinkedMessage } from '../../../lib/Message';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { Durations, RecurringReminderFrequencies } from '../../../enums/Ui';
import { reminderCreatedModal } from '../ReminderCreatedModal';
import { t } from '../../../lib/Translation/translation';
import { getUserPreference } from '../../../lib/UserPreference';
import { RemindApp } from '../../../RemindApp';

export const submitMsgReminderCreateModal = async ({
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

	const reminderUiData = await MsgReminderCreateModalUiData.findOne(
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
		userPreference,
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

	const jobId = await new ReminderJob(app).scheduleReminder(
		modify.getScheduler(),
		reminder.id,
		reminder.dueDate,
	);
	reminder.schedularJobId = jobId;

	await Reminder.insertOrUpdate(persistence, reminder);

	const { userUtcOffset } = reminderUiData;

	const confirmationModal = reminderCreatedModal({
		modify,
		reminderDueDate: reminder.dueDate,
		userUtcOffset,
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
	reminderUiData: IMsgReminderCreateModalUiData,
	reminderState: IMsgReminderCreateModalState,
	userPreference: IPreference,
): Promise<{
	errors?: { [key: string]: string } | undefined;
	reminder?: IReminder | undefined;
}> => {
	const { roomId, userId, userUtcOffset, linkedMessage, currentDuration } =
		reminderUiData;

	const { language } = userPreference;

	let finalDueDateInUTC: Date;
	if (currentDuration === Durations.CUSTOM) {
		const currentUserTime = new Date(
			new Date().getTime() + userUtcOffset * 60 * 60 * 1000,
		);
		if (!reminderState || !reminderState.reminder) {
			reminderState = {
				reminder: {
					date: getOnlyDateAsString(currentUserTime),
					time: getNearestTimeIn15MinInterval(currentUserTime),
				},
			};
		}

		if (
			reminderState.reminder &&
			reminderState.reminder.date === undefined
		) {
			reminderState.reminder.date = getOnlyDateAsString(currentUserTime);
		}

		if (
			reminderState.reminder &&
			reminderState.reminder.time === undefined
		) {
			reminderState.reminder.time =
				getNearestTimeIn15MinInterval(currentUserTime);
		}

		let { reminder: { date, time } = {} } = reminderState;

		if (!date) {
			if (date === '') {
				return {
					errors: {
						date: t(
							'please_complete_this_required_field',
							language,
						),
					},
				};
			}
			date = getOnlyDateAsString(currentUserTime);
		}
		if (!time) {
			if (time === '') {
				return {
					errors: {
						time: t(
							'please_complete_this_required_field',
							language,
						),
					},
				};
			}
			time = getNearestTimeIn15MinInterval(currentUserTime);
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
		finalDueDateInUTC = dueDateInUTC;
	} else {
		const { nextSnoozeDate: nextDueDate } = getNextSnoozedDateAndMsg(
			currentDuration,
			userUtcOffset,
			userPreference,
		);
		finalDueDateInUTC = nextDueDate;
	}

	const reminderCreator: IUser = await read.getUserReader().getById(userId);
	if (!reminderCreator) {
		throw new Error(`Error! No user found with id: ${userId}`);
	}

	const { reminder: { description } = {} } = reminderState;

	const messageMetadata =
		await resolveAdditionalInfoForReminderWithLinkedMessage(
			app,
			read,
			{
				description: description || '',
				linkedMessage,
			},
			reminderCreator,
		);
	if (!messageMetadata) {
		throw new Error('Error! Unable to get message metadata');
	}

	const reminder: IReminder = {
		id: uuid(),
		roomId,
		createdBy: userId,
		createdAt: getDateWithUTCOffset(new Date(), 0),
		description: description || '',
		dueDate: finalDueDateInUTC,
		status: 'active',
		timeZone: {
			utcOffset: userUtcOffset || 0,
		},
		linkedMessage: {
			...linkedMessage,
			metadata: messageMetadata,
		},
		frequency: RecurringReminderFrequencies.DO_NOT_REPEAT,
	};

	return {
		reminder,
	};
};
