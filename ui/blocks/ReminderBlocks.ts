import {
	ILogger,
	IModify,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import {
	BlockBuilder,
	BlockElementType,
	ButtonStyle,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { IReminder } from '../../definitions/IReminder';
import { IPreference } from '../../definitions/Persistence';
import { Durations, RecurringReminderFrequencies } from '../../enums/Ui';
import {
	getFormattedTimezoneForMsgFromUtcOffset,
	getNearestTimeIn15MinInterval,
	getTimeBlockOptions,
} from '../../lib/Dates';
import {
	addLinkedMessagePreviewBlock,
	resolveTranslatedRoomName,
	resolveTranslatedUserNameInfo,
} from '../../lib/Message';
import { resolveRoomUrlPath } from '../../lib/Room/Room';
import { Language, t } from '../../lib/Translation/translation';
import {
	getOnlyDateAsString,
	getOnlyTimeAsString,
	isRecurringReminder,
} from '../../lib/utils';
import { RemindApp } from '../../RemindApp';
import { getFrequencyBlockOptions, resolveUserWithCache } from './utils';

export const createReminderMsgBlocks = async (
	read: IRead,
	modify: IModify,
	logger: ILogger,
	reminder: IReminder,
	user: IUser,
	language: Language,
): Promise<{ blocks: BlockBuilder; previewMsgForNotifications: string }> => {
	const blocks = modify.getCreator().getBlockBuilder();

	const { description, linkedMessage, frequency } = reminder;

	let previewMsgForNotifications = '';
	if (linkedMessage) {
		const {
			url,
			msgAdditionalInfoPreview,
			metadata: { fromRoom, fromUser } = {},
			id: linkedMessageId,
		} = linkedMessage;
		let msg = '';
		if (msgAdditionalInfoPreview || !fromRoom || !fromUser) {
			msg = `You asked me to remind you about [this message](${url}) ${msgAdditionalInfoPreview}.`;
		} else {
			msg = t(
				description
					? 'reminder_message_with_message_with_note'
					: 'reminder_message_with_message',
				language,
				{
					messageUrl: url,
					userName: resolveTranslatedUserNameInfo(
						fromUser,
						user.username,
						language,
					),
					roomName: resolveTranslatedRoomName(
						fromRoom,
						fromRoom.type === 'unknown' ? '' : fromRoom.url,
						language,
					),
					...(description && { note: description }),
				},
			);
		}
		blocks.addSectionBlock({
			text: blocks.newMarkdownTextObject(msg),
		});

		// add message preview in-case message is from a Direct Message room as bot isn't part of DM room,
		// so it won't be able to render message preview
		if (fromRoom && fromRoom.type === RoomType.DIRECT_MESSAGE) {
			await addLinkedMessagePreviewBlock(
				blocks,
				logger,
				read,
				linkedMessageId,
			);
		}
		previewMsgForNotifications = msg;
	} else {
		previewMsgForNotifications = t(
			'reminder_message_with_description',
			language,
			{
				description,
			},
		);
		blocks.addSectionBlock({
			text: blocks.newMarkdownTextObject(previewMsgForNotifications),
		});
	}

	if (!isRecurringReminder(frequency)) {
		blocks.addActionsBlock({
			elements: [
				blocks.newButtonElement({
					text: blocks.newMarkdownTextObject(
						t('mark_as_completed', language),
					),
					style: ButtonStyle.PRIMARY,
					actionId: `mark-as-completed-in-msg_${reminder.id}`,
				}),
			],
		});

		blocks.addActionsBlock({
			elements: [
				blocks.newButtonElement({
					text: blocks.newMarkdownTextObject(t('delete', language)),
					style: ButtonStyle.DANGER,
					actionId: `delete-in-msg_${reminder.id}`,
				}),
				blocks.newStaticSelectElement({
					placeholder: blocks.newPlainTextObject(
						t('snooze', language),
					),
					actionId: `snooze-reminder-in-msg_${reminder.id}`,
					options: [
						{
							text: blocks.newPlainTextObject(
								t('20_minutes', language),
							),
							value: Durations.MINUTES_20,
						},
						{
							text: blocks.newPlainTextObject(
								t('1_hour', language),
							),
							value: Durations.HOUR_1,
						},
						{
							text: blocks.newPlainTextObject(
								t('tomorrow_at_9AM', language),
							),
							value: Durations.TOMORROW,
						},
						{
							text: blocks.newPlainTextObject(
								t('next_week_mon_9am', language),
							),
							value: Durations.NEXT_WEEK,
						},
						{
							text: blocks.newPlainTextObject(
								t('snooze_custom', language),
							),
							value: Durations.CUSTOM,
						},
					],
				}),
			],
		});
	}

	return { blocks, previewMsgForNotifications };
};

export const addDateAndTimeSection = ({
	block,
	userPreference,
	userUTCOffset,
	initialDateTimeValue,
	uiIdSuffix = '',
}: {
	block: BlockBuilder;
	userPreference: IPreference;
	userUTCOffset: number;
	initialDateTimeValue?: Date;
	uiIdSuffix?: string;
}): void => {
	const { language, showTimeIn24HourFormat } = userPreference;

	initialDateTimeValue =
		initialDateTimeValue && new Date(initialDateTimeValue);

	let timeString: string | undefined;
	if (initialDateTimeValue) {
		timeString = getOnlyTimeAsString(initialDateTimeValue, userUTCOffset);
	}

	const time = new Date(
		(initialDateTimeValue || new Date()).getTime() +
			userUTCOffset * 60 * 60 * 1000,
	);

	block.addInputBlock({
		blockId: `reminder${uiIdSuffix}`,
		element: {
			placeholder: block.newPlainTextObject(t('when', language)),
			type: 'datepicker' as BlockElementType,
			actionId: `date${uiIdSuffix}`,
			initialValue: getOnlyDateAsString(time), // YYYY-MM-DD
		},
		label: block.newPlainTextObject(t('when', language)),
	});

	block.addInputBlock({
		blockId: `reminder${uiIdSuffix}`,
		element: block.newStaticSelectElement({
			placeholder: block.newPlainTextObject(t('time', language)),
			actionId: `time${uiIdSuffix}`,
			initialValue: timeString || getNearestTimeIn15MinInterval(time),
			options: getTimeBlockOptions(
				showTimeIn24HourFormat ? 24 : 12,
				timeString,
			),
		}),
		label: block.newPlainTextObject(t('time', language)),
	});
};

export const addLinkedMessageNoteInputBlockWithMsgLink = ({
	block,
	userPreference,
	initialNoteValue = '',
	linkedMessage,
	uiIdSuffix = '',
}: {
	block: BlockBuilder;
	userPreference: Pick<IPreference, 'language'>;
	initialNoteValue?: string;
	linkedMessage: Pick<NonNullable<IReminder['linkedMessage']>, 'url'>;
	uiIdSuffix?: string;
}): void => {
	const { language } = userPreference;
	const { url } = linkedMessage;

	block.addSectionBlock({
		text: block.newMarkdownTextObject(
			`[${t('connected_message_link', language)}](${url})`,
		),
	});

	block.addInputBlock({
		blockId: `reminder${uiIdSuffix}`,
		element: block.newPlainTextInputElement({
			actionId: `description${uiIdSuffix}`,
			multiline: true,
			placeholder: block.newPlainTextObject(t('remind_me_to', language)),
			initialValue: initialNoteValue,
		}),
		label: block.newPlainTextObject(
			`${t('add_a_note', language)} (${t('optional', language)})`,
		),
	});
};

export const addReminderAudienceSection = async ({
	userPreference,
	block,
	audience,
	read,
	app,
}: {
	userPreference: IPreference;
	block: BlockBuilder;
	audience: NonNullable<IReminder['audience']>;
	read: IRead;
	app: RemindApp;
}): Promise<void> => {
	const userCache = new Map<string, IUser>();
	const { language } = userPreference;

	const audienceDisplayInfo = await resolveAudienceDisplayInfo(
		app,
		read,
		audience,
		userCache,
	);

	block.addSectionBlock({
		text: block.newMarkdownTextObject(
			`**${t('who_to_remind', language)}:** ${audienceDisplayInfo}`,
		),
	});
};

export const resolveAudienceDisplayInfo = async (
	app: RemindApp,
	read: IRead,
	audience: NonNullable<IReminder['audience']>,
	cache: Map<string, IUser>,
): Promise<string> => {
	const { type, ids, audienceIds } = audience;

	const displayInfoWithLink: string[] = [];

	const serverUrl = await app.getCachedValue('siteUrl');

	if (type === 'user') {
		// deprecated "audience.ids" field
		if (ids && ids.length) {
			for (const username of ids) {
				const user = await read.getUserReader().getByUsername(username);
				if (!user) {
					app.getLogger().warn(
						`Could not find user with username ${username}`,
					);
					continue;
				}
				const userDMLink = `${serverUrl}/direct/${user.username}`;
				displayInfoWithLink.push(`[@${user.username}](${userDMLink})`);
			}
		} else if (audienceIds && audienceIds.length) {
			for (const userId of audienceIds) {
				const user = await resolveUserWithCache(userId, read, cache);
				if (!user) {
					app.getLogger().warn(
						`Could not find user with id ${userId}`,
					);
					continue;
				}
				const userDMLink = `${serverUrl}/direct/${user.username}`;
				displayInfoWithLink.push(`[@${user.username}](${userDMLink})`);
			}
		}
	} else {
		// deprecated "audience.ids" field
		if (ids && ids.length) {
			for (const roomName of ids) {
				const room = await read.getRoomReader().getByName(roomName);
				if (!room) {
					app.getLogger().warn(
						`Could not find room with name ${roomName}`,
					);
					continue;
				}
				const groupDMLink = resolveRoomUrlPath(room, serverUrl);
				displayInfoWithLink.push(
					`[${
						room.displayName || `#${room.slugifiedName}`
					}](${groupDMLink})`,
				);
			}
		} else if (audienceIds && audienceIds.length) {
			for (const groupId of audienceIds) {
				const room = await read.getRoomReader().getById(groupId);
				if (!room) {
					app.getLogger().warn(
						`Could not find group with id ${groupId}`,
					);
					continue;
				}
				const groupDMLink = resolveRoomUrlPath(room, serverUrl);
				displayInfoWithLink.push(
					`[${
						room.displayName || `#${room.slugifiedName}`
					}](${groupDMLink})`,
				);
			}
		}
	}

	return displayInfoWithLink.join(', ');
};

export const addReminderDescriptionInputSection = ({
	block,
	userPreference,
	initialDescriptionValue = '',
	uiIdSuffix = '',
}: {
	block: BlockBuilder;
	userPreference: Pick<IPreference, 'language'>;
	initialDescriptionValue?: string;
	uiIdSuffix?: string;
}): void => {
	const { language } = userPreference;

	block.addInputBlock({
		blockId: `reminder${uiIdSuffix}`,
		element: block.newPlainTextInputElement({
			actionId: `description${uiIdSuffix}`,
			multiline: true,
			placeholder: block.newPlainTextObject(t('remind_me_to', language)),
			initialValue: initialDescriptionValue,
		}),
		label: block.newPlainTextObject(t('reminder_message', language)),
	});
};

export const addFrequencyInputSection = ({
	block,
	userPreference,
	initialFrequencyValue = RecurringReminderFrequencies.DO_NOT_REPEAT,
	uiIdSuffix = '',
}: {
	block: BlockBuilder;
	userPreference: Pick<IPreference, 'language'>;
	initialFrequencyValue?: NonNullable<IReminder['frequency']>;
	uiIdSuffix?: string;
}): void => {
	const { language } = userPreference;

	block.addInputBlock({
		blockId: `reminder${uiIdSuffix}`,
		element: block.newStaticSelectElement({
			options: getFrequencyBlockOptions(block, language),
			actionId: `frequency${uiIdSuffix}`,
			initialValue: initialFrequencyValue,
			placeholder: block.newPlainTextObject(t('frequency', language)),
		}),
		label: block.newPlainTextObject(t('frequency', language)),
	});
};

export const addBackButtonToViewAllRemindersModal = ({
	block,
	userPreference,
	viewId,
}: {
	block: BlockBuilder;
	userPreference: Pick<IPreference, 'language'>;
	viewId: string;
}): void => {
	const { language } = userPreference;

	block.addActionsBlock({
		elements: [
			block.newButtonElement({
				text: block.newMarkdownTextObject(t('back', language)),
				actionId: `view-all-reminders_${viewId}`,
			}),
		],
	});
};

export const addTimeZoneInfoSection = ({
	block,
	userPreference,
	userUTCOffset,
}: {
	block: BlockBuilder;
	userPreference: Pick<IPreference, 'language'>;
	userUTCOffset: number;
}): void => {
	const { language } = userPreference;

	block.addContextBlock({
		elements: [
			block.newPlainTextObject(
				t('note_your_timezone_is_set_to', language, {
					timezone:
						getFormattedTimezoneForMsgFromUtcOffset(userUTCOffset),
				}),
			),
		],
	});
};
