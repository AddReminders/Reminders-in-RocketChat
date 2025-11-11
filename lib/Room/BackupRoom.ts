import { IRead, IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom, RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { AppSetting } from '../../config/Settings';
import { Links } from '../../enums/Links';
import { RemindApp } from '../../RemindApp';
import { sendRoomMessage } from '../Message';
import { AppInstaller } from '../Persistence/Models';

export const defineBackupRoom = async (
	app: RemindApp,
	read: IRead,
	modify: IModify,
	initialUsers?: IUser[], // make sure these users are in the room
): Promise<IRoom | undefined> => {
	const backupChannelName: string = await read
		.getEnvironmentReader()
		.getSettings()
		.getValueById(AppSetting.BackupChannel);
	if (!backupChannelName) {
		app.getLogger().error('No backup channel name found in settings');
		return;
	}

	let creator: IUser | undefined;

	const installer = await AppInstaller.findOne(
		read.getPersistenceReader(),
		{},
	);
	if (installer) {
		const { userId } = installer;

		creator = await read.getUserReader().getById(userId);
		if (!creator) {
			app.getLogger().warn(
				`No app installer found with userId: ${userId}`,
			);
		}
	} else {
		app.getLogger().warn('No app installer found');
	}

	const appUser = await app.getCachedValue('appUser');

	let room = await read.getRoomReader().getByName(backupChannelName);
	if (!room) {
		if (!creator) {
			app.getLogger().error(
				'No app installer found due to which cannot create backup room',
			);
			return;
		}

		const roomBuilder = modify.getCreator().startRoom();
		roomBuilder
			.setType(RoomType.PRIVATE_GROUP)
			.setSlugifiedName(backupChannelName)
			.setDisplayName('Reminder bot Backup')
			.setCreator(creator)
			.addMemberToBeAddedByUsername(creator.username);

		if (initialUsers) {
			initialUsers.forEach((user) => {
				roomBuilder.addMemberToBeAddedByUsername(user.username);
			});
		}

		const newRoomId = await modify.getCreator().finish(roomBuilder);
		room = await read.getRoomReader().getById(newRoomId);
		if (!room) {
			throw new Error(`Error creating #${backupChannelName} room`);
		}

		const messageText = `Hello! 👋 This is a backup room for all data related to the Reminder bot. Please find more information about this process [here](${Links.BackupGuideLink}).`;

		await sendRoomMessage(modify, appUser, room, messageText);
	}

	if (creator || initialUsers) {
		const updater = await modify.getUpdater().room(room.id, appUser);
		if (creator) {
			updater.addMemberToBeAddedByUsername(creator.username);
		}
		if (initialUsers) {
			initialUsers.forEach((user) => {
				updater.addMemberToBeAddedByUsername(user.username);
			});
		}
		await modify.getUpdater().finish(updater);
	}

	return room;
};
