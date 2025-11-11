import {
	IRead,
	IModify,
	IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
	UIKitViewSubmitInteractionContext,
	IUIKitResponse,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUserPreferenceModalState } from '../../../definitions/uiStates';
import { TimeFormats } from '../../../enums/Ui';
import { UserPreference } from '../../../lib/Persistence/Models';
import { t } from '../../../lib/Translation/translation';
import {
	getUserPreference,
	isSupportedLanguage,
} from '../../../lib/UserPreference';
import { RemindApp } from '../../../RemindApp';
import { getLanguageDisplayTextFromCode } from '../../blocks/language';
import { dialogModal } from '../DialogModal';

export const submitSetPreferencesModal = async ({
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
		user,
		view: { id: viewId },
	} = context.getInteractionData();

	let {
		view: { state },
	} = context.getInteractionData();

	const existingPref = await getUserPreference(
		app,
		read.getPersistenceReader(),
		user.id,
	);

	if (!state) {
		state = {
			block: {
				language: existingPref,
				timeFormat: existingPref ? TimeFormats._24 : TimeFormats._12,
			},
		};
	}

	let { language: newLanguage, timeFormat: newTimeFormat } = (
		state as { block: IUserPreferenceModalState }
	).block;

	if (!newLanguage) {
		newLanguage = existingPref.language;
	}
	if (newTimeFormat === undefined) {
		newTimeFormat = existingPref.showTimeIn24HourFormat
			? TimeFormats._24
			: TimeFormats._12;
	}

	if (!isSupportedLanguage(newLanguage)) {
		return context.getInteractionResponder().viewErrorResponse({
			viewId,
			errors: {
				language: t('unsupported_language', existingPref.language),
			},
		});
	}
	if (
		newTimeFormat !== TimeFormats._12 &&
		newTimeFormat !== TimeFormats._24
	) {
		return context.getInteractionResponder().viewErrorResponse({
			viewId,
			errors: {
				timeFormat: 'Invalid time format',
			},
		});
	}

	await UserPreference.insertOrUpdate(persistence, {
		userId: user.id,
		language: newLanguage,
		showTimeIn24HourFormat: newTimeFormat === TimeFormats._24,
	});

	const successModal = dialogModal({
		text: t('your_preferences_have_been_updated', newLanguage, {
			language: getLanguageDisplayTextFromCode(newLanguage, newLanguage),
		}),
		language: newLanguage,
		modify: modify,
		viewId,
	});

	return context
		.getInteractionResponder()
		.updateModalViewResponse(successModal);
};
