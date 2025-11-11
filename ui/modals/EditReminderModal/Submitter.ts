import {
	IRead,
	IModify,
	IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import {
	UIKitViewSubmitInteractionContext,
	IUIKitResponse,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { IReminder } from '../../../definitions/IReminder';
import {
	IEditReminderActionData,
	IPreference,
} from '../../../definitions/Persistence';
import { IReminderEditModalState } from '../../../definitions/uiStates';
import { ReminderJob } from '../../../jobs/ReminderJob';
import {
	CustomDate,
	formatDateTimeForMsg,
	getFormattedTimezoneForMsgFromUtcOffset,
	parseDateAndTimeStringFromUI,
} from '../../../lib/Dates';
import { ValidationError } from '../../../lib/Errors';
import { sendRoomMessage } from '../../../lib/Message';
import { Reminder } from '../../../lib/Persistence/Models';
import { Language, t } from '../../../lib/Translation/translation';
import { getUserPreference } from '../../../lib/UserPreference';
import { getOnlyDateAsString, getOnlyTimeAsString } from '../../../lib/utils';
import { RemindApp } from '../../../RemindApp';
import { convertFrequencyToText } from '../../blocks/utils';
import { createReminderListModal } from '../TaskResultModal/Modal';

export const submitEditReminderModal = async ({
	context,
	modify,
	read,
	persistence,
	uiData,
	app,
}: {
	app: RemindApp;
	context: UIKitViewSubmitInteractionContext;
	read: IRead;
	modify: IModify;
	persistence: IPersistence;
	uiData: IEditReminderActionData;
}): Promise<IUIKitResponse> => {
	const {
		user,
		user: { utcOffset },
		view: { id: viewId, state: uncleanState },
	} = context.getInteractionData();

	const userPreference = await getUserPreference(
		app,
		read.getPersistenceReader(),
		user.id,
	);
	const { language } = userPreference;

	const { reminderId } = uiData;

	const state = cleanUiState(reminderId, uncleanState);

	app.getLogger().debug(
		`submitEditReminderModal - uiData: ${JSON.stringify(
			uiData,
		)} - state: ${JSON.stringify(state)}`,
	);

	const validationResult = await validateModalAndTransform(
		app,
		read,
		utcOffset,
		uiData,
		state as IReminderEditModalState,
		language,
	);
	if (validationResult.state === 'error') {
		return context.getInteractionResponder().viewErrorResponse({
			viewId,
			errors: validationResult.errors,
		});
	}

	const { reminder: updatedReminder, hasDueDateChanged } =
		validationResult.updatedReminderData;

	if (updatedReminder.audience && updatedReminder.audience.type === 'room') {
		app.getLogger().debug(
			'Informing channel audience about reminder update',
		);

		await sendOutUpdatedReminderMessageToChannels(
			read,
			modify,
			updatedReminder,
			user,
			userPreference,
		);
	}

	// setup new job if due date has changed and new date is in future
	if (hasDueDateChanged) {
		app.getLogger().debug(
			`Cancelling old job and scheduling new job for reminder: ${updatedReminder.id} with due date: ${updatedReminder.dueDate} and schedularJobId: ${updatedReminder.schedularJobId}`,
		);

		updatedReminder.schedularJobId &&
			(await modify
				.getScheduler()
				.cancelJob(updatedReminder.schedularJobId));

		const jobId = await new ReminderJob(app).scheduleReminder(
			modify.getScheduler(),
			updatedReminder.id,
			updatedReminder.dueDate,
		);
		updatedReminder.schedularJobId = jobId;
	}

	app.getLogger().debug(
		`Updating database for reminder: ${updatedReminder.id} with due date: ${updatedReminder.dueDate} and schedularJobId: ${updatedReminder.schedularJobId}`,
	);
	await Reminder.insertOrUpdate(persistence, updatedReminder);

	app.getLogger().debug(
		`Sending updated reminder list modal to user: ${user.username}`,
	);
	const allRemindersListModal = await createReminderListModal({
		app,
		modify,
		read,
		user,
		showCompleted: false,
		...(viewId && { existingViewId: viewId }),
		userPreference,
		logger: app.getLogger(),
		persistence,
	});

	return context
		.getInteractionResponder()
		.updateModalViewResponse(allRemindersListModal);
};

const cleanUiState = (
	reminderId: string,
	state?: object,
): IReminderEditModalState => {
	if (!state) {
		return {};
	}

	const reminderData = state[`reminder${reminderId}`];
	if (!reminderData) {
		return {};
	}

	const uncleanKeys = ['date', 'time', 'description', 'frequency'];
	Object.keys(reminderData).forEach((key) => {
		for (const uncleanKey of uncleanKeys) {
			if (key.startsWith(uncleanKey)) {
				reminderData[uncleanKey] = reminderData[key];
				delete reminderData[key];
				break;
			}
		}
	});
	return {
		reminder: reminderData as IReminderEditModalState['reminder'],
	};
};

type ValidateModalAndTransformReturnType =
	| {
			state: 'error';
			errors: { [key: string]: string };
			// eslint-disable-next-line no-mixed-spaces-and-tabs
	  }
	| {
			state: 'success';
			updatedReminderData: {
				reminder: IReminder;
				hasDueDateChanged: boolean;
			};
			// eslint-disable-next-line no-mixed-spaces-and-tabs
	  };

const validateModalAndTransform = async (
	app: RemindApp,
	read: IRead,
	userUTCOffset: number,
	reminderUiData: IEditReminderActionData,
	reminderStateData: IReminderEditModalState,
	language: Language,
): Promise<ValidateModalAndTransformReturnType> => {
	const { reminderId } = reminderUiData;

	type LocalValidationErrorType = Partial<{
		[key in keyof NonNullable<IReminderEditModalState['reminder']>]: string;
	}>;

	try {
		const existingReminder = await Reminder.findOne(
			read.getPersistenceReader(),
			{
				id: reminderId,
			},
		);
		if (!existingReminder) {
			throw new Error(`Reminder with id ${reminderId} not found`);
		}

		const { linkedMessage } = existingReminder;

		const { dueDate: existingDueDate } = existingReminder;
		const existingDueDateUTC = new CustomDate(existingDueDate);
		const existingDueDateLocalTime = new CustomDate(
			existingDueDate.getTime() + userUTCOffset * 60 * 60 * 1000,
		);

		app.getLogger().debug(
			`validateModalAndTransform - existingDueDate: ${existingDueDate.toUTCString()} - existingDueDateLocalTime: ${existingDueDateLocalTime.toUTCString()}`,
		);

		const { reminder: reminderState } = reminderStateData;
		if (!reminderState) {
			// case where nothing was changed
			return {
				state: 'success',
				updatedReminderData: {
					reminder: existingReminder,
					hasDueDateChanged: false,
				},
			};
		}

		let { date, time } = reminderState;
		if (!date) {
			if (date === '') {
				throw new ValidationError<LocalValidationErrorType>(
					{
						date: t(
							'please_complete_this_required_field',
							language,
						),
					},
					reminderId,
				);
			}
			// if date is not provided, we'll use the existing date
			date = getOnlyDateAsString(existingDueDateLocalTime);
		}

		if (!time) {
			if (time === '') {
				throw new ValidationError<LocalValidationErrorType>(
					{
						time: t(
							'please_complete_this_required_field',
							language,
						),
					},
					reminderId,
				);
			}
			// if time is not provided, we'll use the existing time
			// passing 0 since we've already converted the date to UTC
			time = getOnlyTimeAsString(existingDueDateLocalTime, 0);
		}

		app.getLogger().debug(
			`validateModalAndTransform - date: ${date} - time: ${time}`,
		);

		const dueDateInUTC = parseDateAndTimeStringFromUI(
			date,
			time,
			userUTCOffset,
		);
		if (dueDateInUTC.getTime() < new Date().getTime()) {
			throw new ValidationError<LocalValidationErrorType>(
				{
					date: t('please_give_a_valid_time_in_future', language),
					time: t('please_give_a_valid_time_in_future', language),
				},
				reminderId,
			);
		}

		app.getLogger().debug(
			`validateModalAndTransform - dueDateInUTC: ${dueDateInUTC.toUTCString()} - existingDueDate: ${existingDueDateUTC.toUTCString()}`,
		);

		const hasDueDateChanged =
			!existingDueDateUTC.isSameUTCHourMinAndSameDay(dueDateInUTC);

		if (linkedMessage) {
			// if linked message is present, we'll be updating the message note
			return {
				state: 'success',
				updatedReminderData: {
					reminder: {
						...existingReminder,
						dueDate: dueDateInUTC,
						...(reminderState.description !== undefined && {
							description: reminderState.description,
						}),
					},
					hasDueDateChanged,
				},
			};
		} else {
			// for non-linked messages, we'll be updating the reminder description and frequency
			let { frequency, description } = reminderState;
			if (!description) {
				if (description === '') {
					throw new ValidationError<LocalValidationErrorType>(
						{
							description: t(
								'please_complete_this_required_field',
								language,
							),
						},
						reminderId,
					);
				}
				// if description is not provided, we'll use the existing description
				description = existingReminder.description;
			}

			if (!frequency) {
				if (frequency === '') {
					throw new ValidationError<LocalValidationErrorType>(
						{
							frequency: t(
								'please_complete_this_required_field',
								language,
							),
						},
						reminderId,
					);
				}
				// if frequency is not provided, we'll use the existing frequency
				frequency = existingReminder.frequency;
			}
			return {
				state: 'success',
				updatedReminderData: {
					reminder: {
						...existingReminder,
						dueDate: dueDateInUTC,
						frequency,
						description,
					},
					hasDueDateChanged,
				},
			};
		}
	} catch (error) {
		app.getLogger().error(
			'Error while validating edit reminder modal: ',
			error,
		);

		if (error.name === new ValidationError({}).name) {
			return (
				error as ValidationError<LocalValidationErrorType>
			).getErrorResponse();
		}

		return new ValidationError<LocalValidationErrorType>(
			{
				date: `${t('something_went_wrong', language)}. Error: ${
					error.message
				}`,
			},
			reminderId,
		).getErrorResponse();
	}

	return new ValidationError<LocalValidationErrorType>(
		{
			date: `${t('something_went_wrong', language)}`,
		},
		reminderId,
	).getErrorResponse();
};

const sendOutUpdatedReminderMessageToChannels = async (
	read: IRead,
	modify: IModify,
	updatedReminder: IReminder,
	updatedBy: IUser,
	userPreference: IPreference,
) => {
	if (!updatedReminder.audience || updatedReminder.audience.type !== 'room') {
		return;
	}

	const { language } = userPreference;
	const { utcOffset } = updatedBy;

	const targetRooms = await getTargetChannelsFromReminderAudience(
		read,
		updatedReminder.audience,
	);

	const msg = t('channel_reminder_message_updated', language, {
		description: updatedReminder.description,
		time: formatDateTimeForMsg(
			updatedReminder.dueDate,
			utcOffset || 0,
			userPreference,
		),
		frequency: convertFrequencyToText(updatedReminder.frequency, language),
		timezone: getFormattedTimezoneForMsgFromUtcOffset(utcOffset || 0),
	});

	const promises: Promise<string>[] = [];
	for (const room of targetRooms) {
		promises.push(sendRoomMessage(modify, updatedBy, room, msg));
	}

	await Promise.all(promises);
};

const getTargetChannelsFromReminderAudience = async (
	read: IRead,
	audience: NonNullable<IReminder['audience']>,
): Promise<IRoom[]> => {
	if (!audience || audience.type !== 'room') {
		throw new Error('Invalid audience');
	}

	const { ids: legacyRoomNames, audienceIds } = audience;

	const targetRooms: IRoom[] = [];

	type SuccessState = { state: 'success' };
	type ErrorState = { state: 'error'; roomInfo: string };
	const promises: Promise<SuccessState | ErrorState>[] = [];

	if (legacyRoomNames) {
		for (const legacyRoomName of legacyRoomNames) {
			promises.push(
				read
					.getRoomReader()
					.getByName(legacyRoomName)
					.then((room) => {
						if (!room) {
							return {
								state: 'error',
								roomInfo: legacyRoomName,
							};
						} else {
							targetRooms.push(room);
							return {
								state: 'success',
							};
						}
					}),
			);
		}

		const results = await Promise.all(promises);

		const unknownRoomNames = results
			.filter((result): result is ErrorState => result.state === 'error')
			.map((result) => result.roomInfo);
		if (unknownRoomNames.length > 0) {
			throw new Error(
				`The following rooms names were not found: ${unknownRoomNames.join(
					', ',
				)}. Perhaps they were deleted?`,
			);
		}
	} else if (audienceIds) {
		for (const audienceId of audienceIds) {
			promises.push(
				read
					.getRoomReader()
					.getById(audienceId)
					.then((room) => {
						if (!room) {
							return {
								state: 'error',
								roomInfo: audienceId,
							};
						} else {
							targetRooms.push(room);
							return {
								state: 'success',
							};
						}
					}),
			);
		}

		const results = await Promise.all(promises);

		const unknownRoomIds = results
			.filter((result): result is ErrorState => result.state === 'error')
			.map((result) => result.roomInfo);
		if (unknownRoomIds.length > 0) {
			throw new Error(
				`The following rooms ids were not found: ${unknownRoomIds.join(
					', ',
				)}. Perhaps they were deleted?`,
			);
		}
	}

	return targetRooms;
};
