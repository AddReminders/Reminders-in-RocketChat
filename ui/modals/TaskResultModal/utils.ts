import {
	ILogger,
	IModify,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
	BlockBuilder,
	ButtonStyle,
	ITextObject,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { IReminder } from '../../../definitions/IReminder';
import { IPreference } from '../../../definitions/Persistence';
import { Durations } from '../../../enums/Ui';
import { formatDateTimeForMsg } from '../../../lib/Dates';
import {
	addLinkedMessagePreviewBlock,
	resolveTranslatedRoomName,
	resolveTranslatedUserNameInfo,
} from '../../../lib/Message';
import { Language, t } from '../../../lib/Translation/translation';
import { isRecurringReminder } from '../../../lib/utils';
import { RemindApp } from '../../../RemindApp';
import { resolveAudienceDisplayInfo } from '../../blocks/ReminderBlocks';
import {
	convertFrequencyToText,
	resolveUserWithCache,
} from '../../blocks/utils';
import { dialogModal } from '../DialogModal';

export const addRemindersWithAudienceBlocks = async ({
	app,
	block,
	reminder,
	read,
	usersCache,
	language,
	utcOffset,
	isManageRoomReminder,
	viewId,
	userPreference,
	currentUser: { username },
	showCompleted,
}: {
	app: RemindApp;
	block: BlockBuilder;
	reminder: IReminder;
	read: IRead;
	usersCache: Map<string, IUser>;
	language: Language;
	utcOffset: number;
	isManageRoomReminder: boolean;
	viewId: string;
	userPreference: IPreference;
	currentUser: Pick<IUser, 'username'>;
	showCompleted: boolean;
}): Promise<void> => {
	const { audience, frequency, status } = reminder;
	if (!audience) {
		throw new Error(
			`Audience is not defined for reminder with id: ${reminder.id}`,
		);
	}

	const serverUrl = await app.getCachedValue('siteUrl');

	const audienceDisplayInfo = await resolveAudienceDisplayInfo(
		app,
		read,
		audience,
		usersCache,
	);

	if (isManageRoomReminder) {
		const { createdBy } = reminder;

		const createdByUser = await resolveUserWithCache(
			createdBy,
			read,
			usersCache,
		);

		const createdByUserDisplayInfo = createdByUser
			? resolveTranslatedUserNameInfo(
					{
						username: createdByUser.username,
						directMessageLink: `${serverUrl}/direct/${createdByUser.username}`,
					},
					username,
					language,
					// eslint-disable-next-line no-mixed-spaces-and-tabs
			  )
			: t('unknown_user', language);

		block.addSectionBlock({
			text: block.newMarkdownTextObject(
				t(
					isRecurringReminder(frequency)
						? 'recurring_remind_audience_at_time_and_frequency_with_sender'
						: 'remind_audience_at_time_with_sender',
					language,
					{
						audience: audienceDisplayInfo,
						time: formatDateTimeForMsg(
							reminder.dueDate,
							utcOffset,
							userPreference,
						),
						description: reminder.description,
						sender: createdByUserDisplayInfo,
						...(isRecurringReminder(frequency) && {
							frequency: convertFrequencyToText(
								frequency,
								language,
							),
						}),
					},
				),
			),
		});
	} else {
		const displayMsg = isRecurringReminder(frequency)
			? 'recurring_remind_audience_at_time_and_frequency'
			: status === 'completed'
			? 'remind_audience_completed_at_time'
			: 'remind_audience_at_time';

		block.addSectionBlock({
			text: block.newMarkdownTextObject(
				t(displayMsg, language, {
					audience: audienceDisplayInfo,
					time: formatDateTimeForMsg(
						reminder.dueDate,
						utcOffset,
						userPreference,
					),
					description: reminder.description,
					...(isRecurringReminder(frequency) && {
						frequency: convertFrequencyToText(frequency, language),
					}),
				}),
			),
			...(status === 'completed' && {
				accessory: block.newButtonElement({
					text: block.newPlainTextObject(t('delete', language)),
					actionId: `delete-in-modal_${viewId}_${reminder.id}_${
						showCompleted ? '1' : '0'
					}`,
					style: ButtonStyle.DANGER,
				}),
			}),
		});
	}

	if (status !== 'completed') {
		block.addActionsBlock({
			elements: [
				block.newButtonElement({
					text: block.newPlainTextObject(t('delete', language)),
					actionId: `delete-in-modal_${viewId}_${reminder.id}_${
						showCompleted ? '1' : '0'
					}`,
					style: ButtonStyle.DANGER,
				}),
				block.newButtonElement({
					text: block.newPlainTextObject(t('edit', language)),
					actionId: `edit-reminder_${viewId}_${reminder.id}`,
				}),
			],
		});
	}
};

export const addPersonalRemindersBlocks = async ({
	block,
	reminder,
	utcOffset,
	userPreference,
	language,
	currentUser: { username },
	logger,
	read,
	viewId,
	showCompleted,
	isPastReminder = false,
}: {
	block: BlockBuilder;
	reminder: IReminder;
	utcOffset: number;
	userPreference: IPreference;
	language: Language;
	currentUser: Pick<IUser, 'username'>;
	logger: ILogger;
	read: IRead;
	viewId: string;
	showCompleted: boolean;
	isPastReminder?: boolean;
}): Promise<void> => {
	const { linkedMessage, description, frequency, status } = reminder;
	let reminderPreviewMsg: ITextObject;
	if (linkedMessage) {
		const {
			url,
			msgAdditionalInfoPreview,
			metadata: { fromRoom, fromUser } = {},
		} = linkedMessage;
		if (msgAdditionalInfoPreview || !fromRoom || !fromUser) {
			/* No translation required here */
			switch (status) {
				case 'completed': {
					reminderPreviewMsg = block.newMarkdownTextObject(
						`About [this message](${url}) ${msgAdditionalInfoPreview} (completed at ${formatDateTimeForMsg(
							reminder.completedAt as Date,
							utcOffset,
							userPreference,
						)}).`,
					);
					break;
				}
				case 'active': {
					reminderPreviewMsg = block.newMarkdownTextObject(
						`About [this message](${url}) ${msgAdditionalInfoPreview} due ${formatDateTimeForMsg(
							reminder.dueDate,
							utcOffset,
							userPreference,
						)}.`,
					);
					break;
				}
			}
		} else {
			type DisplayMsgType =
				| 'completed_reminder_in_list_with_message_with_note'
				| 'completed_reminder_in_list_with_message'
				| 'reminder_in_list_with_message_with_note'
				| 'reminder_in_list_with_message';
			const displayMsg: DisplayMsgType = `${
				status === 'completed' ? 'completed_' : ''
			}reminder_in_list_with_message${description ? '_with_note' : ''}`;

			reminderPreviewMsg = block.newMarkdownTextObject(
				t(displayMsg, language, {
					messageUrl: url,
					userName: resolveTranslatedUserNameInfo(
						fromUser,
						username,
						language,
					),
					roomName: resolveTranslatedRoomName(
						fromRoom,
						fromRoom.type === 'unknown' ? '' : fromRoom.url,
						language,
					),
					...(description && {
						note: description,
					}),
					...(status === 'completed' && {
						time: formatDateTimeForMsg(
							reminder.completedAt as Date,
							utcOffset,
							userPreference,
						),
					}),
					...(status === 'active' && {
						dueDate: formatDateTimeForMsg(
							reminder.dueDate,
							utcOffset,
							userPreference,
						),
					}),
				}),
			);
		}
	} else {
		const displayMsg = isRecurringReminder(frequency)
			? 'recurring_reminder_in_list_with_description_and_frequency'
			: status === 'completed'
			? 'completed_reminder_in_list_with_description'
			: 'reminder_in_list_with_description';

		reminderPreviewMsg = block.newMarkdownTextObject(
			t(displayMsg, language, {
				description,
				time: formatDateTimeForMsg(
					reminder.dueDate,
					utcOffset,
					userPreference,
				),
				...(isRecurringReminder(frequency) && {
					frequency: convertFrequencyToText(frequency, language),
				}),
			}),
		);
	}

	block.addSectionBlock({
		text: reminderPreviewMsg,
		...(isPastReminder && {
			accessory: block.newOverflowMenuElement({
				actionId: `snooze-reminder-in-modal_${viewId}_${reminder.id}_${
					showCompleted ? '1' : '0'
				}`,
				options: [
					{
						text: block.newPlainTextObject(
							t('snooze_in_20_minutes', language),
						),
						value: Durations.MINUTES_20,
					},
					{
						text: block.newPlainTextObject(
							t('snooze_in_1_hour', language),
						),
						value: Durations.HOUR_1,
					},
					{
						text: block.newPlainTextObject(
							t('snooze_tomorrow_at_9am', language),
						),
						value: Durations.TOMORROW,
					},
					{
						text: block.newPlainTextObject(
							t('snooze_next_week_mon_9am', language),
						),
						value: Durations.NEXT_WEEK,
					},
					{
						text: block.newPlainTextObject(
							t('snooze_custom', language),
						),
						value: Durations.CUSTOM,
					},
				],
			}),
		}),
		...(status === 'completed' && {
			accessory: block.newButtonElement({
				text: block.newPlainTextObject(t('delete', language)),
				actionId: `delete-in-modal_${viewId}_${reminder.id}_${
					showCompleted ? '1' : '0'
				}`,
				style: ButtonStyle.DANGER,
			}),
		}),
	});

	if (linkedMessage) {
		await addLinkedMessagePreviewBlock(
			block,
			logger,
			read,
			linkedMessage.id,
		);
	}

	if (status !== 'completed') {
		block.addActionsBlock({
			elements: [
				...(!isRecurringReminder(frequency)
					? [
							block.newButtonElement({
								text: block.newPlainTextObject(
									t('mark_as_completed', language),
								),
								actionId: `mark-as-completed-in-modal_${viewId}_${
									reminder.id
								}_${showCompleted ? '1' : '0'}`,
								style: ButtonStyle.PRIMARY,
							}),
							// eslint-disable-next-line no-mixed-spaces-and-tabs
					  ]
					: []),
				block.newButtonElement({
					text: block.newPlainTextObject(t('delete', language)),
					actionId: `delete-in-modal_${viewId}_${reminder.id}_${
						showCompleted ? '1' : '0'
					}`,
					style: ButtonStyle.DANGER,
				}),
				block.newButtonElement({
					text: block.newPlainTextObject(t('edit', language)),
					actionId: `edit-reminder_${viewId}_${reminder.id}`,
				}),
			],
		});
	}
};

export const noRemindersFoundBlock = ({
	modify,
	viewId,
	language,
	isManageRoomReminder,
	showCompleted,
}: {
	modify: IModify;
	viewId: string;
	language: Language;
	isManageRoomReminder: boolean;
	showCompleted: boolean;
}): IUIKitModalViewParam => {
	const block = modify.getCreator().getBlockBuilder();

	if (showCompleted) {
		return dialogModal({
			title: isManageRoomReminder
				? t('manage_reminders_in_this_channel', language)
				: t('view_reminders', language),
			text: t('you_have_no_reminders', language),
			modify,
			viewId: viewId,
			language,
		});
	} else {
		return noActiveRemindersFoundBlock(
			block,
			viewId,
			language,
			isManageRoomReminder,
		);
	}
};

const noActiveRemindersFoundBlock = (
	block: BlockBuilder,
	viewId: string,
	language: Language,
	isManageRoomReminder: boolean,
): IUIKitModalViewParam => {
	block.addSectionBlock({
		text: block.newMarkdownTextObject(
			t('no_upcoming_reminders_to_view', language),
		),
	});

	if (!isManageRoomReminder) {
		block.addActionsBlock({
			elements: [
				block.newButtonElement({
					text: block.newPlainTextObject(
						t('view_completed_reminders', language),
					),
					actionId: 'view-completed-tasks',
					value: `${viewId}`,
				}),
			],
		});
	}

	return {
		id: viewId,
		title: block.newPlainTextObject(
			isManageRoomReminder
				? t('manage_reminders_in_this_channel', language)
				: t('view_reminders', language),
		),
		close: block.newButtonElement({
			text: block.newPlainTextObject(t('close', language)),
		}),
		blocks: block.getBlocks(),
	};
};
