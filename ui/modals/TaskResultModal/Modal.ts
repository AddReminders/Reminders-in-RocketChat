import {
	IRead,
	IModify,
	ILogger,
	IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IBlock } from '@rocket.chat/apps-engine/definition/uikit';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { IReminder } from '../../../definitions/IReminder';
import { IPreference } from '../../../definitions/Persistence';

import {
	Reminder,
	ReminderListModalUiData,
} from '../../../lib/Persistence/Models';
import { Language, t } from '../../../lib/Translation/translation';

import { concatStrings, isRecurringReminder, uuid } from '../../../lib/utils';
import { RemindApp } from '../../../RemindApp';
import { addTimeZoneInfoSection } from '../../blocks/ReminderBlocks';
import {
	CompletedReminderBlockSection,
	PastReminderBlockSection,
	RecurringReminderBlockSection,
	UpcomingReminderBlockSection,
} from './SectionClass';

import {
	addPersonalRemindersBlocks,
	addRemindersWithAudienceBlocks,
	noRemindersFoundBlock,
} from './utils';

export const ReminderListModalViewIdPrefix = 'reminderListModal';

export const createReminderListModal = async ({
	app,
	modify,
	user: { id: userId, username, utcOffset },
	read,
	showCompleted = false,
	existingViewId,
	userPreference,
	logger,
	persistence,
	manageRoomReminder,
}: {
	app: RemindApp;
	existingViewId?: string;
	showCompleted: boolean;
	read: IRead;
	modify: IModify;
	user: IUser;
	userPreference: IPreference;
	logger: ILogger;
	persistence: IPersistence;
	manageRoomReminder?: {
		roomId: string;
	};
}): Promise<IUIKitModalViewParam> => {
	const { language } = userPreference;

	const viewId =
		existingViewId ||
		concatStrings([ReminderListModalViewIdPrefix, uuid()], '-');

	if (!existingViewId) {
		logger.debug('ReminderListModal: Creating new modal');

		await ReminderListModalUiData.insertOrUpdate(persistence, {
			viewId,
			user: userId,
			manageRoomReminder,
		});
	} else {
		logger.debug('ReminderListModal: Updating existing modal');

		const existingModalData = await ReminderListModalUiData.findOne(
			read.getPersistenceReader(),
			{
				viewId,
			},
		);
		if (!existingModalData) {
			throw new Error('Existing modal data not found');
		}

		manageRoomReminder = existingModalData.manageRoomReminder;
	}

	const start = Date.now();
	logger.debug(
		`Starting to build reminder list modal for ${userId} at ${start}`,
	);

	const isManageRoomReminder = !!manageRoomReminder?.roomId;

	// lets try to optimize any db calls. Mapping userId to user object
	const usersCache: Map<string, IUser> = new Map();

	const {
		totalReminders,
		completedReminders,
		pastReminders,
		recurringReminders,
		upcomingReminders,
	} = await getRemindersData({
		read,
		isManageRoomReminder,
		manageRoomReminder,
		userId,
		showCompleted,
	});

	if (totalReminders === 0) {
		return noRemindersFoundBlock({
			modify,
			viewId,
			language,
			isManageRoomReminder,
			showCompleted,
		});
	}

	const genericProps = {
		modify,
		app,
		read,
		usersCache,
		language,
		utcOffset,
		currentUser: { username },
		showCompleted,
		isManageRoomReminder,
		userPreference,
		viewId,
	};

	const [
		upcomingRemindersDataBlocks,
		pastRemindersDataBlocks,
		recurringRemindersDataBlocks,
		completedRemindersDataBlocks,
	] = await Promise.all([
		bulkCreateRemindersBlock({
			...genericProps,
			reminders: upcomingReminders,
		}),
		bulkCreateRemindersBlock({
			...genericProps,
			reminders: pastReminders,
			isPastReminder: true,
		}),
		bulkCreateRemindersBlock({
			...genericProps,
			reminders: recurringReminders,
		}),
		bulkCreateRemindersBlock({
			...genericProps,
			reminders: completedReminders,
		}),
	]);

	const upcomingRemindSection = new UpcomingReminderBlockSection(modify);
	const pastRemindSection = new PastReminderBlockSection(modify);
	const recurringRemindSection = new RecurringReminderBlockSection(modify);
	const completedRemindSection = new CompletedReminderBlockSection(modify);

	const finalBlocks: IBlock[] = [];

	if (upcomingReminders.length > 0) {
		finalBlocks.push(
			...upcomingRemindSection.getSectionHeaderBlocks(language),
		);

		finalBlocks.push(...upcomingRemindersDataBlocks);

		finalBlocks.push(...upcomingRemindSection.getSectionFooterBlocks());
	}

	if (pastReminders.length > 0 && !isManageRoomReminder) {
		finalBlocks.push(
			...pastRemindSection.getSectionHeaderBlocks({
				language,
				viewId,
				pastReminders,
			}),
		);

		finalBlocks.push(...pastRemindersDataBlocks);

		finalBlocks.push(...pastRemindSection.getSectionFooterBlocks());
	}

	if (recurringReminders.length > 0) {
		finalBlocks.push(
			...recurringRemindSection.getSectionHeaderBlocks(language),
		);

		finalBlocks.push(...recurringRemindersDataBlocks);

		finalBlocks.push(...recurringRemindSection.getSectionFooterBlocks());
	}

	if (!isManageRoomReminder) {
		if (showCompleted) {
			finalBlocks.push(
				...completedRemindSection.getSectionHeaderBlocks({
					language,
					viewId,
					completedReminders,
				}),
			);

			if (completedReminders.length !== 0) {
				finalBlocks.push(...completedRemindersDataBlocks);
			}
		} else {
			finalBlocks.push(
				...completedRemindSection.getShowCompletedRemindersButton({
					language,
					viewId,
				}),
			);
		}
	}

	addTimeZoneBlock({
		modify,
		blocks: finalBlocks,
		userPreference,
		utcOffset,
	});

	logger.debug(
		`Finished building the reminders view for ${userId} in ${
			Date.now() - start
		}ms`,
	);

	const block = modify.getCreator().getBlockBuilder();
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
		blocks: finalBlocks,
	};
};

const bulkCreateRemindersBlock = async ({
	reminders,
	modify,
	app,
	read,
	usersCache,
	language,
	utcOffset,
	currentUser,
	showCompleted,
	isManageRoomReminder,
	userPreference,
	viewId,
	isPastReminder = false,
}: {
	reminders: IReminder[];
	modify: IModify;
	app: RemindApp;
	read: IRead;
	usersCache: Map<string, IUser>;
	language: Language;
	utcOffset: number;
	currentUser: Pick<IUser, 'username'>;
	showCompleted: boolean;
	isManageRoomReminder: boolean;
	userPreference: IPreference;
	viewId: string;
	isPastReminder?: boolean;
}): Promise<IBlock[]> => {
	const allBlocks = await Promise.all(
		reminders.map(async (reminder) =>
			createSingleReminderBlock({
				reminder,
				modify,
				app,
				read,
				usersCache,
				language,
				utcOffset,
				currentUser,
				showCompleted,
				isManageRoomReminder,
				userPreference,
				viewId,
				isPastReminder,
			}),
		),
	);

	const blocks: IBlock[] = [];
	for (const block of allBlocks) {
		blocks.push(...block);
	}

	return blocks;
};

const createSingleReminderBlock = async ({
	reminder,
	modify,
	app,
	read,
	usersCache,
	language,
	utcOffset,
	currentUser,
	showCompleted,
	isManageRoomReminder,
	userPreference,
	viewId,
	isPastReminder = false,
}: {
	reminder: IReminder;
	modify: IModify;
	app: RemindApp;
	read: IRead;
	usersCache: Map<string, IUser>;
	language: Language;
	utcOffset: number;
	currentUser: Pick<IUser, 'username'>;
	showCompleted: boolean;
	isManageRoomReminder: boolean;
	userPreference: IPreference;
	viewId: string;
	isPastReminder?: boolean;
}): Promise<IBlock[]> => {
	const block = modify.getCreator().getBlockBuilder();

	const { audience } = reminder;
	if (audience) {
		await addRemindersWithAudienceBlocks({
			block,
			reminder,
			app,
			read,
			usersCache,
			language,
			utcOffset,
			currentUser,
			showCompleted,
			isManageRoomReminder,
			userPreference,
			viewId,
		});
	} else {
		await addPersonalRemindersBlocks({
			block,
			reminder,
			utcOffset,
			userPreference,
			language,
			currentUser,
			logger: app.getLogger(),
			read,
			viewId,
			showCompleted,
			isPastReminder,
		});
	}

	block.addSectionBlock({
		text: block.newMarkdownTextObject(' '),
	});

	return block.getBlocks();
};

const getRemindersData = async ({
	read,
	isManageRoomReminder,
	manageRoomReminder,
	userId,
	showCompleted,
}: {
	read: IRead;
	isManageRoomReminder: boolean;
	manageRoomReminder?: {
		roomId: string;
	};
	userId: string;
	showCompleted: boolean;
}): Promise<{
	upcomingReminders: IReminder[];
	completedReminders: IReminder[];
	pastReminders: IReminder[];
	recurringReminders: IReminder[];
	totalReminders: number;
}> => {
	let reminders = await Reminder.findAll(read.getPersistenceReader(), {
		...(isManageRoomReminder && manageRoomReminder?.roomId
			? { roomId: manageRoomReminder.roomId }
			: { createdBy: userId }),
		...(!showCompleted && { status: 'active' }),
	});

	if (isManageRoomReminder) {
		// filter only reminders which are active and configured to be shown in channel
		reminders =
			reminders &&
			reminders.filter(
				(reminder) =>
					reminder.audience &&
					reminder.audience.type === 'room' &&
					reminder.status === 'active',
			);
	}

	if (reminders.length === 0) {
		return {
			upcomingReminders: [],
			completedReminders: [],
			pastReminders: [],
			recurringReminders: [],
			totalReminders: 0,
		};
	}

	const upcomingReminders: IReminder[] = [];
	const pastReminders: IReminder[] = [];
	const recurringReminders: IReminder[] = [];
	const completedReminders: IReminder[] = [];

	reminders
		.filter(({ status }) => status === 'active')
		.forEach((reminder) => {
			const { frequency, dueDate } = reminder;
			if (isRecurringReminder(frequency)) {
				recurringReminders.push(reminder);
			} else {
				if (dueDate.getTime() > new Date().getTime()) {
					upcomingReminders.push(reminder);
				} else {
					pastReminders.push(reminder);
				}
			}
		});

	if (showCompleted) {
		reminders
			.filter(({ status }) => status === 'completed')
			// Let's show only 25 completed reminders, just to avoid too much data
			// In future we can add pagination to show more completed reminders
			.slice(0, 25)
			.forEach((reminder) => {
				completedReminders.push(reminder);
			});
	}

	return {
		upcomingReminders: upcomingReminders.sort(
			(a, b) => a.dueDate.getTime() - b.dueDate.getTime(),
		),
		completedReminders: completedReminders.sort(
			(a, b) =>
				(b.completedAt || b.dueDate).getTime() -
				(a.completedAt || a.dueDate).getTime(),
		),
		pastReminders: pastReminders.sort(
			(a, b) => a.dueDate.getTime() - b.dueDate.getTime(),
		),
		recurringReminders: recurringReminders.sort((a, b) => {
			return a.createdAt.getTime() - b.createdAt.getTime();
		}),
		totalReminders: reminders.length,
	};
};

const addTimeZoneBlock = ({
	blocks,
	userPreference,
	utcOffset,
	modify,
}: {
	modify: IModify;
	blocks: IBlock[];
	userPreference: IPreference;
	utcOffset: number;
}) => {
	const block = modify.getCreator().getBlockBuilder();

	addTimeZoneInfoSection({
		block,
		userPreference,
		userUTCOffset: utcOffset,
	});

	blocks.push(...block.getBlocks());
};
