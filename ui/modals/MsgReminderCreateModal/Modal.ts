import {
	IRead,
	IModify,
	IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IMessage } from '@rocket.chat/apps-engine/definition/messages';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import {
	IMsgReminderCreateModalUiData,
	IPreference,
} from '../../../definitions/Persistence';
import { Durations } from '../../../enums/Ui';
import { resolvePreviewTitleAndMessageUrlFromMessageId } from '../../../lib/Message';
import { MsgReminderCreateModalUiData } from '../../../lib/Persistence/Models';
import { t } from '../../../lib/Translation/translation';
import { concatStrings, uuid } from '../../../lib/utils';
import { RemindApp } from '../../../RemindApp';
import {
	addDateAndTimeSection,
	addLinkedMessageNoteInputBlockWithMsgLink,
	addTimeZoneInfoSection,
} from '../../blocks/ReminderBlocks';

export const MsgReminderCreateModalViewIdPrefix = 'msgReminderCreateModal';

export const msgReminderCreationModal = async ({
	persistence,
	modify,
	room,
	user,
	read,
	message,
	currentDuration,
	existingViewId,
	userPreference,
	app,
}: {
	app: RemindApp;
	read: IRead;
	modify: IModify;
	persistence: IPersistence;
	currentDuration: Durations;
	message?: IMessage; // not optional when calling for the first time with no existingViewId
	room?: IRoom; // not optional when calling for the first time with no existingViewId
	user?: IUser; // not optional when calling for the first time with no existingViewId
	existingViewId?: string;
	userPreference: IPreference;
}): Promise<IUIKitModalViewParam> => {
	const { language } = userPreference;

	const viewId =
		existingViewId ||
		concatStrings([MsgReminderCreateModalViewIdPrefix, uuid()], '-');

	let msgReminderCreateModalUiData: IMsgReminderCreateModalUiData;

	if (existingViewId) {
		const existingUiData = await MsgReminderCreateModalUiData.findOne(
			read.getPersistenceReader(),
			{ viewId },
		);
		if (!existingUiData) {
			throw new Error(
				`Could not find existing ui data for viewId: ${viewId}`,
			);
		}

		existingUiData.currentDuration = currentDuration;

		await MsgReminderCreateModalUiData.insertOrUpdate(
			persistence,
			existingUiData,
		);

		msgReminderCreateModalUiData = existingUiData;
	} else {
		if (!message || !room || !user) {
			throw new Error(
				'message, room and user must be provided when creating a new reminder',
			);
		}
		const { id: messageId } = message;
		if (!messageId) {
			throw new Error(
				'Error! No message id found while trying to create a reminder',
			);
		}
		const { id: roomId } = room;
		const { id: userId } = user;

		const { utcOffset: userUtcOffset } = user;

		// resolve linked message
		const { messageUrl } =
			await resolvePreviewTitleAndMessageUrlFromMessageId(
				app,
				read,
				messageId,
			);

		const newTaskData: IMsgReminderCreateModalUiData = {
			viewId: viewId,
			roomId,
			userId,
			userUtcOffset,
			messageId,
			linkedMessage: {
				id: messageId,
				url: messageUrl,
			},
			currentDuration,
		};
		await MsgReminderCreateModalUiData.insertOrUpdate(
			persistence,
			newTaskData,
		);

		msgReminderCreateModalUiData = newTaskData;
	}

	const { linkedMessage, userUtcOffset } = msgReminderCreateModalUiData;

	const block = modify.getCreator().getBlockBuilder();

	block.addSectionBlock({
		text: block.newMarkdownTextObject(
			`**${t('when_do_you_want_to_be_reminded', language)}**`,
		),
	});
	block.addActionsBlock({
		elements: [
			block.newStaticSelectElement({
				options: [
					{
						text: block.newPlainTextObject(t('custom', language)),
						value: Durations.CUSTOM,
					},
					{
						text: block.newPlainTextObject(
							t('in_20_minutes', language),
						),
						value: Durations.MINUTES_20,
					},
					{
						text: block.newPlainTextObject(
							t('in_1_hour', language),
						),
						value: Durations.HOUR_1,
					},
					// hiding this for now, as RC UI shows only 5 options at once & rest has to be scrolled which might not be very intuitive for users
					// {
					// 	text: block.newPlainTextObject(
					// 		t('in_3_hours', language),
					// 	),
					// 	value: Durations.HOUR_3,
					// },
					{
						text: block.newPlainTextObject(
							t('tomorrow_at_9AM', language),
						),
						value: Durations.TOMORROW,
					},
					{
						text: block.newPlainTextObject(
							t('next_week_mon_9am', language),
						),
						value: Durations.NEXT_WEEK,
					},
				],
				actionId: `linked-msg-reminder-change-duration-option_${viewId}`,
				initialValue: currentDuration,
				placeholder: block.newPlainTextObject(t('when', language)),
			}),
		],
	});

	if (currentDuration === Durations.CUSTOM) {
		block.addDividerBlock();

		addDateAndTimeSection({
			block,
			userPreference,
			userUTCOffset: userUtcOffset,
		});

		block.addDividerBlock();
	}

	addLinkedMessageNoteInputBlockWithMsgLink({
		block,
		linkedMessage,
		userPreference,
	});

	block.addDividerBlock();
	addTimeZoneInfoSection({
		block,
		userPreference,
		userUTCOffset: userUtcOffset,
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
