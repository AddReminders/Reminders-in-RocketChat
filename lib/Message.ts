import {
	ILogger,
	IModify,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
	IMessage,
	IMessageAttachment,
} from '@rocket.chat/apps-engine/definition/messages';
import { IRoom, RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { BlockBuilder } from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { IReminder } from '../definitions/IReminder';
import { WELCOME_MESSAGE } from '../enums/Links';
import { RemindApp } from '../RemindApp';
import {
	findDMWithBotOrCreate,
	resolveRoomPreviewTitle,
	resolveRoomUrlPath,
} from './Room/Room';
import { Language, t } from './Translation/translation';
import { truncateString } from './utils';

export const resolvePreviewTitleAndMessageUrlFromMessageId = async (
	app: RemindApp,
	read: IRead,
	messageId: string,
): Promise<{ previewTitle?: string; messageUrl: string }> => {
	let message: IMessage;
	try {
		const msg = await read.getMessageReader().getById(messageId);
		if (!msg) {
			throw new Error('Message not found');
		}
		message = msg;
	} catch (e) {
		app.getLogger().warn(
			`[Reminder Bot] Message ${messageId} not found. Most likely it has been deleted.`,
			e,
		);
		return {
			// translation not needed right now
			previewTitle:
				'__**Connected Message not found. Perhaps it has been deleted**__',
			messageUrl: '',
		};
	}

	const { text } = message;

	const messageUrl = await resolveMessageLinkFromMessage(app, message);

	return {
		messageUrl,
		...(text &&
			text.trim().length && { previewTitle: truncateString(text) }),
	};
};

export const sendRoomMessage = async (
	modify: IModify,
	sender: IUser,
	room: IRoom,
	text?: string,
	attachments?: Array<IMessageAttachment>,
	blocks?: BlockBuilder,
	doNotParseUrls?: boolean,
): Promise<string> => {
	const msg = modify
		.getCreator()
		.startMessage()
		.setGroupable(false)
		.setSender(sender)
		.setRoom(room);

	if (doNotParseUrls) {
		msg.setParseUrls(false);
	}

	text && text.length && msg.setText(text);

	attachments && attachments.length > 0 && msg.setAttachments(attachments);

	blocks && msg.setBlocks(blocks);

	return modify.getCreator().finish(msg);
};

export const updateRoomMessageAfterRemovingPreviousContent = async (
	modify: IModify,
	messageId: string,
	updater: IUser,
	message: {
		text?: string;
		attachments?: Array<IMessageAttachment>;
		blocks?: BlockBuilder;
	},
	resetAttachments?: boolean, // Note: this will hide the preview of the message as well
): Promise<void> => {
	const msgBuilder = await modify.getUpdater().message(messageId, updater);
	msgBuilder.setEditor(msgBuilder.getSender());

	const { text, attachments, blocks } = message;

	Object.assign(msgBuilder.getMessage(), {
		file: undefined,
		text: '',
		...(resetAttachments && { attachments: [] }),
		blocks: [],
	});

	text && text.length && msgBuilder.setText(text);

	attachments &&
		attachments.length > 0 &&
		msgBuilder.setAttachments(attachments);

	blocks && msgBuilder.setBlocks(blocks);

	return modify.getUpdater().finish(msgBuilder);
};

export const resolveAdditionalInfoForReminderWithLinkedMessage = async (
	app: RemindApp,
	read: IRead,
	reminderInfo: {
		description: IReminder['description'];
		linkedMessage: Omit<
			NonNullable<IReminder['linkedMessage']>,
			'msgAdditionalInfoPreview' | 'metadata'
		>;
	},
	reminderCreator: IUser,
): Promise<NonNullable<IReminder['linkedMessage']>['metadata'] | undefined> => {
	const { linkedMessage } = reminderInfo;
	if (!linkedMessage) {
		throw new Error('Linked message not found');
	}

	const { id: linkedMessageId } = linkedMessage;

	try {
		const linkedMsgObject = await read
			.getMessageReader()
			.getById(linkedMessageId);

		if (!linkedMsgObject) {
			throw new Error(
				'Linked message not found. Perhaps it has been deleted.',
			);
		}
		const {
			sender: { username: linkedMessageSenderUsername },
			room,
		} = linkedMsgObject;

		const serverUrl = await app.getCachedValue('siteUrl');

		const roomUrl = resolveRoomUrlPath(room, serverUrl);

		const fromRoom = await resolveRoomPreviewTitle(
			read,
			room,
			reminderCreator.id,
			roomUrl,
		);

		return {
			fromUser: {
				username: linkedMessageSenderUsername,
				directMessageLink: `${serverUrl}/direct/${linkedMessageSenderUsername}`,
			},
			fromRoom,
		};
	} catch (e) {
		app.getLogger().error(
			'Error while trying to resolve linked message. Perhaps the message was deleted?',
			e,
		);

		return;
	}
};

const resolveMessageLinkFromMessage = async (
	app: RemindApp,
	message: IMessage,
) => {
	// Public Channel: http://localhost:3000/channel/general?msg=34H9ZKPBnDs5D3WDS - name - slugifiedName
	// Private group: http://localhost:3000/group/omnichannel-facebook-setup?msg=YxMvCMiTgK2bMLyuq - name - slugifiedName
	// Direct message: http://localhost:3000/direct/b93WT2qfqLXq3yrErrocket.cat?msg=ghdJCLWyPoPwsu8WT - _id
	// Livechat: http://localhost:3000/live/jRpckE6ZsWQQFwARQ?msg=XZgrn3x7EfzRSMhYp - _id

	const serverUrl = await app.getCachedValue('siteUrl');
	const { room, id: messageId } = message;
	const roomUrl = resolveRoomUrlPath(room, serverUrl);
	return `${roomUrl}?msg=${messageId}`;
};

export const resolveTranslatedRoomName = (
	roomData: NonNullable<IReminder['linkedMessage']>['metadata']['fromRoom'],
	roomUrl: string,
	language: Language,
) => {
	const { type } = roomData;

	switch (type) {
		case RoomType.CHANNEL:
		case RoomType.PRIVATE_GROUP:
			return `[${roomData.name}](${roomUrl})`;
		case RoomType.DIRECT_MESSAGE: {
			const otherParticipantsStr = roomData.otherParticipants.join(', ');
			return t('direct_message_with_participants', language, {
				participants: otherParticipantsStr,
			});
		}
		case RoomType.LIVE_CHAT: {
			return t('livechat_message_with_name', language, {
				name: roomData.name,
			});
		}
		default: {
			return t('unknown_room', language);
		}
	}
};

export const resolveTranslatedUserNameInfo = (
	reminderUserData: NonNullable<
		IReminder['linkedMessage']
	>['metadata']['fromUser'],
	currentUsername: string,
	language: Language,
): string => {
	const { username, directMessageLink } = reminderUserData;

	return username === currentUsername
		? t('you', language)
		: `[@${username}](${directMessageLink})`;
};

export const addLinkedMessagePreviewBlock = async (
	block: BlockBuilder,
	logger: ILogger,
	read: IRead,
	linkedMessageId: string,
) => {
	try {
		// add preview of the message
		const originalLinkedMessage = await read
			.getMessageReader()
			.getById(linkedMessageId);
		if (!originalLinkedMessage) {
			throw new Error(`Message ${linkedMessageId} not found`);
		}

		const { text } = originalLinkedMessage;
		if (text) {
			const textPreview = getPreviewMessageText(text);

			block.addContextBlock({
				elements: [block.newMarkdownTextObject(`${textPreview}`)],
			});
		}
	} catch (e) {
		logger.warn('Error while adding message preview', e);
	}
};

export const sendWelcomeMessage = async (
	app: RemindApp,
	read: IRead,
	modify: IModify,
	installerUser: IUser,
) => {
	const appUser = await app.getCachedValue('appUser');
	const dmRoom = await findDMWithBotOrCreate(
		read,
		modify,
		installerUser,
		appUser,
	);

	await sendRoomMessage(
		modify,
		appUser,
		dmRoom,
		WELCOME_MESSAGE,
		undefined,
		undefined,
		true,
	);
};

const getPreviewMessageText = (text: string) => {
	if (text.length <= 85) {
		return text;
	}

	// replace all markdown links with their text
	const textWithoutMarkdownLinks = text.replace(
		/\[([^\]]+)\]\([^)]+\)/g,
		'$1',
	);

	// add ... to the end of the message if it's too long
	return textWithoutMarkdownLinks.length > 85
		? `${text.substring(0, 85)}...`
		: text;
};
