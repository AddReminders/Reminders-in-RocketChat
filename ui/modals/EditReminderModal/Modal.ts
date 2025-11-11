import {
	IModify,
	IPersistence,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import { IReminder } from '../../../definitions/IReminder';
import {
	IEditReminderActionData,
	IPreference,
} from '../../../definitions/Persistence';
import { ReminderListModalActionUiData } from '../../../lib/Persistence/Models';
import { t } from '../../../lib/Translation/translation';
import { RemindApp } from '../../../RemindApp';
import {
	addBackButtonToViewAllRemindersModal,
	addDateAndTimeSection,
	addFrequencyInputSection,
	addLinkedMessageNoteInputBlockWithMsgLink,
	addReminderAudienceSection,
	addReminderDescriptionInputSection,
	addTimeZoneInfoSection,
} from '../../blocks/ReminderBlocks';

export const EditReminderModalViewIdPrefix = 'editReminderModal';

export const EditReminderModal = async ({
	modify,
	userPreference,
	viewId,
	userUTCOffset,
	reminder,
	app,
	read,
	persistence,
}: {
	app: RemindApp;
	read: IRead;
	reminder: IReminder;
	viewId: string;
	modify: IModify;
	userPreference: IPreference;
	userUTCOffset: number;
	persistence: IPersistence;
}): Promise<IUIKitModalViewParam> => {
	const { language } = userPreference;

	const block = modify.getCreator().getBlockBuilder();

	const {
		description,
		linkedMessage,
		frequency,
		audience,
		dueDate,
		id: reminderId,
	} = reminder;

	await ReminderListModalActionUiData.insertOrUpdate(persistence, {
		currentAction: 'editReminder',
		viewId,
		data: {
			reminderId,
		} as IEditReminderActionData,
	});

	block.addContextBlock({
		elements: [block.newMarkdownTextObject(t('beta_warning', language))],
	});

	addDateAndTimeSection({
		block,
		userUTCOffset: userUTCOffset,
		userPreference,
		initialDateTimeValue: dueDate,
		uiIdSuffix: reminderId,
	});

	if (linkedMessage) {
		// if its a message reminder, then user can edit the note
		addLinkedMessageNoteInputBlockWithMsgLink({
			block,
			linkedMessage,
			userPreference,
			initialNoteValue: description,
			uiIdSuffix: reminderId,
		});
	} else {
		// if its a personal reminder or a audience reminder, then user can edit the reminder description and frequency

		if (audience) {
			await addReminderAudienceSection({
				block,
				audience,
				read,
				userPreference,
				app,
			});
		}

		addReminderDescriptionInputSection({
			block,
			userPreference,
			initialDescriptionValue: description,
			uiIdSuffix: reminderId,
		});

		addFrequencyInputSection({
			block,
			userPreference,
			initialFrequencyValue: frequency,
			uiIdSuffix: reminderId,
		});
	}

	addBackButtonToViewAllRemindersModal({
		block,
		userPreference,
		viewId,
	});

	addTimeZoneInfoSection({
		block,
		userPreference,
		userUTCOffset,
	});

	return {
		id: viewId,
		title: block.newPlainTextObject(t('edit_reminder', language)),
		submit: block.newButtonElement({
			text: block.newPlainTextObject(t('save', language)),
		}),
		close: block.newButtonElement({
			text: block.newPlainTextObject(t('cancel', language)),
		}),
		blocks: block.getBlocks(),
	};
};
