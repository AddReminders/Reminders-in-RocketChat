import {
	IRead,
	IModify,
	IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ButtonStyle } from '@rocket.chat/apps-engine/definition/uikit';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import {
	IPreference,
	IReminderCreateModalUiData,
} from '../../../definitions/Persistence';
import { ReminderRecipientsType } from '../../../enums/Ui';
import { ReminderCreateModalUiData } from '../../../lib/Persistence/Models';
import { t } from '../../../lib/Translation/translation';
import { concatStrings, uuid } from '../../../lib/utils';
import {
	addDateAndTimeSection,
	addFrequencyInputSection,
	addReminderDescriptionInputSection,
	addTimeZoneInfoSection,
} from '../../blocks/ReminderBlocks';

export const ReminderCreateModalViewIdPrefix = 'reminderCreateModal';

export const createTaskCreationModal = async ({
	persistence,
	modify,
	roomId,
	userId,
	read,
	recipientType = ReminderRecipientsType.ME,
	existingViewId,
	existingUserUtcOffset,
	moreOptionsVisible = false,
	initialTargetAudience = '',
	initialDescription = '',
	userPreference,
}: {
	read: IRead;
	modify: IModify;
	persistence: IPersistence;
	roomId?: string;
	userId?: string;
	recipientType?: ReminderRecipientsType;
	existingViewId?: string;
	existingUserUtcOffset?: number;
	moreOptionsVisible?: boolean;
	initialTargetAudience?: string;
	initialDescription?: string;
	userPreference: IPreference;
}): Promise<IUIKitModalViewParam> => {
	const { language } = userPreference;

	const viewId =
		existingViewId ||
		concatStrings([ReminderCreateModalViewIdPrefix, uuid()], '-');

	let userUTCOffset = 0;

	if (existingViewId) {
		if (existingUserUtcOffset === undefined) {
			throw new Error(
				'Error! No existing user UTC offset found while trying to update an existing view',
			);
		}
		userUTCOffset = existingUserUtcOffset;

		const existingReminderUiData = await ReminderCreateModalUiData.findOne(
			read.getPersistenceReader(),
			{ viewId: existingViewId },
		);
		if (!existingReminderUiData) {
			throw new Error('Error! No existing reminder ui data found');
		}

		await ReminderCreateModalUiData.insertOrUpdate(persistence, {
			...existingReminderUiData,
			recipientType,
		});
	} else {
		if (!roomId || !userId) {
			throw new Error('Missing roomId or userId');
		}
		const user = await read.getUserReader().getById(userId);
		if (!user) {
			throw new Error('User not found');
		}
		userUTCOffset = user.utcOffset;

		const newTaskData: IReminderCreateModalUiData = {
			viewId: viewId,
			roomId,
			userId,
			userUtcOffset: userUTCOffset,
			recipientType,
		};
		await ReminderCreateModalUiData.insertOrUpdate(
			persistence,
			newTaskData,
		);
	}

	const block = modify.getCreator().getBlockBuilder();

	addDateAndTimeSection({
		block,
		userPreference,
		userUTCOffset,
	});

	addReminderDescriptionInputSection({
		block,
		userPreference,
		initialDescriptionValue: initialDescription,
	});

	if (moreOptionsVisible || recipientType !== ReminderRecipientsType.ME) {
		block.addSectionBlock({
			text: block.newMarkdownTextObject(
				`**${t('who_to_remind', language)}**`,
			),
		});

		block.addActionsBlock({
			elements: [
				block.newStaticSelectElement({
					options: [
						{
							text: block.newPlainTextObject(
								`${t('me', language)}`,
							),
							value: ReminderRecipientsType.ME,
						},
						{
							text: block.newPlainTextObject(
								`${t('channel_plural', language)}`,
							),
							value: ReminderRecipientsType.CHANNEL,
						},
						{
							text: block.newPlainTextObject(
								`${t('user_plural', language)}`,
							),
							value: ReminderRecipientsType.USER,
						},
					],
					actionId: `create-reminder-recipient-type-change_${viewId}_${userUTCOffset}`,
					initialValue: recipientType,
					placeholder: block.newPlainTextObject(
						t('select_recipient_type', language),
					),
				}),
			],
		});

		if (
			recipientType === ReminderRecipientsType.CHANNEL ||
			recipientType === ReminderRecipientsType.USER
		) {
			block.addInputBlock({
				blockId: 'reminder',
				element: block.newPlainTextInputElement({
					placeholder: block.newPlainTextObject(
						recipientType === ReminderRecipientsType.CHANNEL
							? '#general,#random'
							: '@john.doe,@jane.doe',
					),
					actionId: `target_${recipientType}`,
					initialValue: initialTargetAudience,
				}),
				label: block.newPlainTextObject(
					recipientType === ReminderRecipientsType.CHANNEL
						? 'List of Channel(s) to remind'
						: 'List of User(s) to remind',
				),
			});
			if (recipientType === ReminderRecipientsType.CHANNEL) {
				block.addContextBlock({
					elements: [
						block.newMarkdownTextObject(
							t('channel_reminder_info_message', language),
						),
					],
				});
			} else {
				block.addContextBlock({
					elements: [
						block.newMarkdownTextObject(
							t('user_reminder_info_message', language),
						),
					],
				});
			}
		}

		addFrequencyInputSection({
			block,
			userPreference,
		});
	} else {
		block.addActionsBlock({
			elements: [
				block.newButtonElement({
					text: block.newPlainTextObject(t('more_options', language)),
					actionId: `create-reminder-more-options_${viewId}_${userUTCOffset}`,
					style: ButtonStyle.PRIMARY,
				}),
			],
		});
	}

	block.addDividerBlock();
	addTimeZoneInfoSection({
		block,
		userPreference,
		userUTCOffset,
	});

	return {
		id: viewId,
		title: block.newPlainTextObject(t('create_reminder', language)),
		submit: block.newButtonElement({
			text: block.newPlainTextObject(t('create', language)),
		}),
		close: block.newButtonElement({
			text: block.newPlainTextObject(t('cancel', language)),
		}),
		blocks: block.getBlocks(),
	};
};
