import {
	IRead,
	IModify,
	IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
	UIKitViewSubmitInteractionContext,
	IUIKitResponse,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IReminder } from '../../../definitions/IReminder';
import { ICustomSnoozeActionData } from '../../../definitions/Persistence';
import { IReminderSnoozeModalState } from '../../../definitions/uiStates';
import {
	formatDateTimeForMsg,
	getNearestTimeIn15MinInterval,
	parseDateAndTimeStringFromUI,
} from '../../../lib/Dates';
import { Reminder } from '../../../lib/Persistence/Models';
import {
	postSnoozeReminder,
	snoozeReminder,
	snoozeReminderPreCheck,
} from '../../../lib/Reminder';
import { Language, t } from '../../../lib/Translation/translation';
import { getUserPreference } from '../../../lib/UserPreference';
import { getOnlyDateAsString } from '../../../lib/utils';
import { RemindApp } from '../../../RemindApp';
import { createReminderListModal } from '../TaskResultModal/Modal';

export const submitCustomSnoozeModal = async ({
	context,
	modify,
	read,
	persistence,
	uiData,
	app,
	openResultModalPostSubmit,
}: {
	app: RemindApp;
	context: UIKitViewSubmitInteractionContext;
	read: IRead;
	modify: IModify;
	persistence: IPersistence;
	uiData: ICustomSnoozeActionData;
	openResultModalPostSubmit: boolean;
}): Promise<IUIKitResponse> => {
	const {
		user,
		view: { id: viewId, state },
	} = context.getInteractionData();

	const { utcOffset } = uiData;

	const userPreference = await getUserPreference(
		app,
		read.getPersistenceReader(),
		user.id,
	);
	const { language } = userPreference;

	const { errors, reminder } = await validateModalAndTransform(
		read,
		uiData,
		state as IReminderSnoozeModalState,
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
				date: `Something went wrong while snoozing the reminder. Unable to resolve the new reminder details`,
			},
		});
	}

	const updatedReminder = await snoozeReminder(
		app,
		modify.getScheduler(),
		persistence,
		reminder,
		reminder.dueDate,
	);

	await postSnoozeReminder(
		read,
		app,
		modify,
		language,
		updatedReminder,
		formatDateTimeForMsg(reminder.dueDate, utcOffset, userPreference), // TODO: possible enhancement: prefix with "at" eg: remind `at 10:00`
		context.getInteractionData().user.username,
	);

	if (openResultModalPostSubmit) {
		const allRemindersListModal = await createReminderListModal({
			app,
			modify,
			read,
			user: context.getInteractionData().user,
			showCompleted: false,
			...(viewId && { existingViewId: viewId }),
			userPreference,
			logger: app.getLogger(),
			persistence,
		});

		return context
			.getInteractionResponder()
			.updateModalViewResponse(allRemindersListModal);
	}

	return context.getInteractionResponder().successResponse();
};

const validateModalAndTransform = async (
	read: IRead,
	reminderUiData: ICustomSnoozeActionData,
	reminderState: IReminderSnoozeModalState,
	language: Language,
): Promise<{
	errors?: { [key: string]: string } | undefined;
	reminder?: IReminder | undefined;
}> => {
	const { reminderId, utcOffset } = reminderUiData;

	// note: the state won't contain the default value here, so we'd need to pre-populate it
	// start 1
	const currentUserTime = new Date(
		new Date().getTime() + utcOffset * 60 * 60 * 1000,
	);
	if (!reminderState || !reminderState.reminder) {
		reminderState = {
			reminder: {
				date: getOnlyDateAsString(currentUserTime),
				time: getNearestTimeIn15MinInterval(currentUserTime),
			},
		};
	}
	let { reminder: { date, time } = {} } = reminderState;
	if (!date) {
		if (date === '') {
			return {
				errors: {
					date: t('please_complete_this_required_field', language),
				},
			};
		}
		date = getOnlyDateAsString(currentUserTime);
	}
	if (!time) {
		if (time === '') {
			return {
				errors: {
					time: t('please_complete_this_required_field', language),
				},
			};
		}
		time = getNearestTimeIn15MinInterval(currentUserTime);
	}
	// end 1

	const dueDateInUTC = parseDateAndTimeStringFromUI(
		date,
		time,
		utcOffset || 0,
	);

	if (dueDateInUTC.getTime() < new Date().getTime()) {
		return {
			errors: {
				date: t('please_give_a_valid_time_in_future', language),
				time: t('please_give_a_valid_time_in_future', language),
			},
		};
	}

	const existingReminder = await Reminder.findOne(
		read.getPersistenceReader(),
		{
			id: reminderId,
		},
	);
	if (!existingReminder) {
		return {
			errors: {
				date: `Reminder with id ${reminderId} not found`,
				time: `Reminder with id ${reminderId} not found`,
			},
		};
	}

	const { errorI18n } = snoozeReminderPreCheck(existingReminder);
	if (errorI18n) {
		return {
			errors: {
				date: t(errorI18n, language),
				time: t(errorI18n, language),
			},
		};
	}

	return {
		reminder: {
			...existingReminder,
			dueDate: dueDateInUTC,
		},
	};
};
