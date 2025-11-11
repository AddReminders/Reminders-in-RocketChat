import { IRead, IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { IApp } from '@rocket.chat/apps-engine/definition/IApp';
import { IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import {
	BlockBuilder,
	IBlock,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

export const sendRoomNotification = async (
	app: IApp,
	read: IRead,
	modify: IModify,
	room: IRoom,
	text?: string,
	attachments?: Array<IMessageAttachment>,
	blocks?: BlockBuilder | IBlock[],
): Promise<void> => {
	const appUser = await read.getUserReader().getAppUser(app.getID());
	if (!appUser) {
		throw new Error('No app user found');
	}
	const msg = modify
		.getCreator()
		.startMessage()
		.setGroupable(false)
		.setSender(appUser)
		.setRoom(room);

	if (text && text.length) {
		msg.setText(text);
	}
	if (attachments && attachments.length > 0) {
		msg.setAttachments(attachments);
	}
	if (blocks !== undefined) {
		msg.setBlocks(blocks);
	}

	return read.getNotifier().notifyRoom(room, msg.getMessage());
};

export const sendUserNotification = async (
	app: IApp,
	read: IRead,
	modify: IModify,
	room: IRoom,
	user: IUser,
	text?: string,
	attachments?: Array<IMessageAttachment>,
	blocks?: BlockBuilder | IBlock[],
): Promise<void> => {
	const appUser = await read.getUserReader().getAppUser(app.getID());
	if (!appUser) {
		throw new Error('Error! No app user found');
	}

	const msg = modify
		.getCreator()
		.startMessage()
		.setGroupable(false)
		.setSender(appUser)
		.setRoom(room);

	text && text.length > 0 && msg.setText(text);

	attachments && attachments.length > 0 && msg.setAttachments(attachments);

	blocks && msg.setBlocks(blocks);

	return read.getNotifier().notifyUser(user, msg.getMessage());
};
