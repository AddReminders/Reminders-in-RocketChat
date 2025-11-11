import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom, RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { IReminder } from '../../definitions/IReminder';

export const resolveRoomUrlPath = (
	{ type, slugifiedName, id }: IRoom,
	serverUrl: string,
): string => {
	switch (type) {
		case RoomType.CHANNEL:
			return `${serverUrl}/channel/${slugifiedName}`;
		case RoomType.PRIVATE_GROUP:
			return `${serverUrl}/group/${slugifiedName}`;
		case RoomType.DIRECT_MESSAGE:
			return `${serverUrl}/direct/${id}`;
		case RoomType.LIVE_CHAT:
			return `${serverUrl}/live/${id}`;
		default:
			return '';
	}
};

export const resolveRoomPreviewTitle = async (
	read: IRead,
	room: IRoom,
	currentUserId: string,
	roomUrl: string,
): Promise<NonNullable<IReminder['linkedMessage']>['metadata']['fromRoom']> => {
	const { type, slugifiedName, displayName, parentRoom } = room;

	switch (type) {
		case RoomType.CHANNEL:
		case RoomType.PRIVATE_GROUP:
			if (parentRoom && displayName) {
				// this is a discussion so it will have displayName set
				return {
					type,
					name: displayName,
					url: roomUrl,
				};
			}
			return {
				type,
				name: displayName || slugifiedName,
				url: roomUrl,
			};
		case RoomType.DIRECT_MESSAGE: {
			const allDMParticipants = await read
				.getRoomReader()
				.getMembers(room.id);
			const otherParticipants = allDMParticipants
				.filter((member) => member.id !== currentUserId)
				.map((member) => member.username);
			return {
				type: RoomType.DIRECT_MESSAGE,
				url: roomUrl,
				otherParticipants,
			};
		}
		case RoomType.LIVE_CHAT:
			return {
				type: RoomType.LIVE_CHAT,
				url: roomUrl,
				name: displayName || slugifiedName,
			};
		default:
			return {
				type: 'unknown',
			};
	}
};

export const isDMWithAppBot = async (
	read: IRead,
	appId: string,
	room: IRoom,
): Promise<boolean> => {
	const { type } = room;
	if (type !== RoomType.DIRECT_MESSAGE) {
		return false;
	}

	const appUser = await read.getUserReader().getAppUser(appId);
	if (!appUser) {
		throw new Error('No app user found');
	}

	const members = await read.getRoomReader().getMembers(room.id);

	const containsBot = members.findIndex(({ id }) => id === appUser.id);

	return containsBot !== -1 && members.length === 2;
};

export const findDMWithBotOrCreate = async (
	read: IRead,
	modify: IModify,
	sender: IUser, // this is the user who is scheduling this reminder
	appUser: IUser,
): Promise<IRoom> => {
	let room = await read
		.getRoomReader()
		.getDirectByUsernames([appUser.username, sender.username]);

	if (room === undefined) {
		const builder = modify
			.getCreator()
			.startRoom()
			.setCreator(appUser)
			.setType(RoomType.DIRECT_MESSAGE)
			.setMembersToBeAddedByUsernames([sender.username]);

		const newRoomId = await modify.getCreator().finish(builder);
		room = (await read.getRoomReader().getById(newRoomId)) as IRoom;
		if (!room) {
			throw new Error(`No room found for room id: ${newRoomId}`);
		}
	}
	return room;
};

export const isReminderBotPartOfTheRoom = async (
	room: Pick<IRoom, 'id' | 'type'>,
	read: IRead,
	appUser: IUser,
): Promise<boolean> => {
	// only check if the room is private group
	if (room.type !== RoomType.PRIVATE_GROUP) {
		return true;
	}

	const members = await read.getRoomReader().getMembers(room.id);

	const containsBot = members.findIndex(({ id }) => id === appUser.id);

	return containsBot !== -1;
};

export const addBotToRoomIfNotAlreadyAdded = async (
	room: Pick<IRoom, 'id' | 'type'>,
	read: IRead,
	modify: IModify,
	appUser: IUser,
): Promise<void> => {
	// only check if the room is private group
	if (room.type !== RoomType.PRIVATE_GROUP) {
		return;
	}

	if (await isReminderBotPartOfTheRoom(room, read, appUser)) {
		return;
	}

	const roomBuilder = await modify.getUpdater().room(room.id, appUser);
	roomBuilder.addMemberToBeAddedByUsername(appUser.username);
	await modify.getUpdater().finish(roomBuilder);
};
