import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { RemindApp } from '../../RemindApp';
import { getBackupActionMessageBlock } from '../../ui/blocks/backupBlocks';
import { sendUserNotification } from '../Notification';
import { Language } from '../Translation/translation';

class BackupMessageClass {
	async sendManualBackupActionMessage({
		app,
		modify,
		user,
		room,
		language,
		read,
	}: {
		app: RemindApp;
		read: IRead;
		modify: IModify;
		user: IUser;
		room: IRoom;
		language: Language;
	}) {
		const blocks = getBackupActionMessageBlock({
			modify,
			language,
		});

		await sendUserNotification(
			app,
			read,
			modify,
			room,
			user,
			undefined,
			undefined,
			blocks,
		);
	}
}

export const BackupMessages = new BackupMessageClass();
