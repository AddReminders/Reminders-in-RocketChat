import {
	IModify,
	IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import {
	ICustomSnoozeActionData,
	IPreference,
} from '../../../definitions/Persistence';

import {
	CustomSnoozeModalUiData,
	ReminderListModalActionUiData,
} from '../../../lib/Persistence/Models';
import { t } from '../../../lib/Translation/translation';
import { concatStrings, uuid } from '../../../lib/utils';
import {
	addBackButtonToViewAllRemindersModal,
	addDateAndTimeSection,
} from '../../blocks/ReminderBlocks';

export const CustomSnoozeModalViewIdPrefix = 'customSnoozeModal';

export const CustomSnoozeModal = async ({
	modify,
	userPreference,
	viewId,
	utcOffset,
	reminderId,
	persistence,
	snoozedFrom,
}: {
	reminderId: string;
	viewId?: string;
	utcOffset: number;
	modify: IModify;
	userPreference: IPreference;
	persistence: IPersistence;
	snoozedFrom: 'modal' | 'message';
}): Promise<IUIKitModalViewParam> => {
	const { language } = userPreference;

	if (snoozedFrom === 'modal' && !viewId) {
		throw new Error('ViewId is required when snoozed from modal');
	}
	if (snoozedFrom === 'message') {
		viewId = concatStrings([CustomSnoozeModalViewIdPrefix, uuid()], '-');
	}

	if (snoozedFrom === 'modal' && viewId) {
		await ReminderListModalActionUiData.insertOrUpdate(persistence, {
			currentAction: 'customSnooze',
			viewId,
			data: {
				reminderId,
				utcOffset,
			} as ICustomSnoozeActionData,
		});
	}

	if (snoozedFrom === 'message' && viewId) {
		await CustomSnoozeModalUiData.insertOrUpdate(persistence, {
			viewId,
			reminderId,
			utcOffset,
		});
	}

	const block = modify.getCreator().getBlockBuilder();

	addDateAndTimeSection({
		block,
		userPreference,
		userUTCOffset: utcOffset,
	});

	if (snoozedFrom === 'modal' && viewId) {
		addBackButtonToViewAllRemindersModal({
			block,
			userPreference,
			viewId,
		});
	}

	return {
		id: viewId,
		title: block.newPlainTextObject(t('snooze_until', language)),
		submit: block.newButtonElement({
			text: block.newPlainTextObject(t('snooze', language)),
		}),
		blocks: block.getBlocks(),
	};
};
